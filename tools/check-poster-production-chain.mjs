import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const issues = [];
const root = process.cwd();

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required poster production chain file`);
    return "";
  }
}

const chain = read("src/e2e/poster-production-chain.ts");
const decisions = read("DECISIONS.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const pkg = read("package.json");

for (const token of [
  "PosterProductionChainInputSchema",
  "PosterProductionChainSummarySchema",
  "runPosterProductionChain",
  "createPromptPackage",
  "mapProviderRequest",
  "createQueuePlan",
  "runQueuePlan",
  "describeResultDownload",
]) {
  if (!chain.includes(token)) issues.push(`poster-production-chain.ts: missing ${token}`);
}

for (const [file, source] of [
  ["DECISIONS.md", decisions],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
]) {
  if (!source.includes("Poster Production Chain")) {
    issues.push(`${file}: missing Poster Production Chain update`);
  }
}

if (!pkg.includes("poster-chain:check")) issues.push("package.json: missing poster-chain:check script");

for (const forbidden of [
  "fetch(",
  "XMLHttpRequest",
  "axios",
  "localStorage",
  "sessionStorage",
  "writeFile",
  "readFile",
  "process.env",
  "createLiveProviderRegistry",
  "api.openai.com",
]) {
  if (chain.includes(forbidden)) {
    issues.push(`poster production chain must remain local and mock-safe (${forbidden})`);
  }
}

function resolveRelativeSpecifier(filePath, specifier) {
  if (/\.[cm]?js$|\.json$/.test(specifier)) return specifier;
  const base = path.resolve(path.dirname(filePath), specifier);
  if (existsSync(`${base}.js`)) return `${specifier}.js`;
  if (existsSync(path.join(base, "index.js"))) return `${specifier}/index.js`;
  return `${specifier}.js`;
}

function patchImports(filePath) {
  let text = readFileSync(filePath, "utf8");
  text = text.replace(/(from\s+["'])(\.?\.\/[^"']+)(["'])/g, (_match, start, specifier, end) => {
    return `${start}${resolveRelativeSpecifier(filePath, specifier)}${end}`;
  });
  writeFileSync(filePath, text, "utf8");
}

async function runRuntimeCheck() {
  const outDir = path.join(root, `.tmp-poster-chain-check-${Date.now()}`);
  mkdirSync(outDir, { recursive: true });

  try {
    const configFile = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
    if (configFile.error) {
      issues.push(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
      return;
    }

    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root, {
      noEmit: false,
      outDir,
      declaration: false,
      sourceMap: false,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      incremental: false,
    });
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const emitResult = program.emit();
    const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
    const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    if (errors.length > 0) {
      issues.push(ts.formatDiagnosticsWithColorAndContext(errors, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      }));
      return;
    }

    const stack = [outDir];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(entryPath);
        if (entry.isFile() && entry.name.endsWith(".js")) patchImports(entryPath);
      }
    }

    const chainModulePath = existsSync(path.join(outDir, "e2e", "poster-production-chain.js"))
      ? path.join(outDir, "e2e", "poster-production-chain.js")
      : path.join(outDir, "src", "e2e", "poster-production-chain.js");
    const chainModule = await import(pathToFileURL(chainModulePath).href);
    const summary = await chainModule.runPosterProductionChain();

    if (!summary.ok || summary.mode !== "poster") issues.push("poster production chain should complete poster mode");
    if (summary.mappedKind !== "imageGeneration") issues.push("poster production chain should map image generation");
    if (summary.resultCount < 1) issues.push("poster production chain should write at least one result");
    if (!summary.downloadAvailable || summary.downloadSource === "unavailable") {
      issues.push("poster production chain should resolve a downloadable descriptor");
    }
  } finally {
    const resolved = path.resolve(outDir);
    if (resolved.startsWith(`${path.resolve(root)}${path.sep}`) && path.basename(resolved).startsWith(".tmp-poster-chain-check-")) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Poster production chain checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Poster production chain checks passed.");
