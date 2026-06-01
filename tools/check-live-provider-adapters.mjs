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
    issues.push(`${filePath}: missing required live provider adapter file`);
    return "";
  }
}

const liveAdapters = read("src/providers/live-adapter-stubs.ts");
const executor = read("src/providers/executor.ts");
const barrel = read("src/providers/index.ts");
const decisions = read("DECISIONS.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const pkg = read("package.json");

for (const token of [
  "LiveProviderExecutionModeSchema",
  "LiveProviderAdapterOptionsSchema",
  "createLiveProviderAdapter",
  "createLiveProviderRegistry",
  "liveProviderUnavailable",
  "provider_unavailable",
  "GenerationProviderAdapter",
]) {
  if (!liveAdapters.includes(token)) issues.push(`live-adapter-stubs.ts: missing ${token}`);
}

for (const providerId of ["openai", "aigocode", "google", "deepseek", "claude", "qwen"]) {
  if (!liveAdapters.includes("providerManifestList")) {
    issues.push("live-adapter-stubs.ts: live registry should derive providers from providerManifestList");
    break;
  }
  if (!barrel.includes("createLiveProviderRegistry")) {
    issues.push(`providers/index.ts: missing live registry export for ${providerId}`);
    break;
  }
}

for (const token of ["createMockProviderRegistry", "createMockProviderAdapter"]) {
  if (!executor.includes(token)) issues.push(`executor.ts: default provider registry must remain mock-backed (${token})`);
}

for (const [file, source] of [
  ["DECISIONS.md", decisions],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
]) {
  if (!source.includes("Live Provider Adapter") && !source.includes("live provider adapter")) {
    issues.push(`${file}: missing live provider adapter stub update`);
  }
}

if (!pkg.includes("live-provider-adapters:check")) {
  issues.push("package.json: missing live-provider-adapters:check script");
}

for (const forbidden of [
  "fetch(",
  "XMLHttpRequest",
  "axios",
  "localStorage",
  "sessionStorage",
  "writeFile",
  "readFile",
  "process.env",
  "api.openai.com",
]) {
  if (liveAdapters.includes(forbidden)) {
    issues.push(`live provider stubs must not perform network, env, browser storage, or persistence side effects (${forbidden})`);
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
  const outDir = path.join(root, `.tmp-live-provider-check-${Date.now()}`);
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

    const providersModulePath = existsSync(path.join(outDir, "providers", "index.js"))
      ? path.join(outDir, "providers", "index.js")
      : path.join(outDir, "src", "providers", "index.js");
    const defaultsModulePath = existsSync(path.join(outDir, "schema", "zod-defaults.js"))
      ? path.join(outDir, "schema", "zod-defaults.js")
      : path.join(outDir, "src", "schema", "zod-defaults.js");

    const providers = await import(pathToFileURL(providersModulePath).href);
    const defaults = await import(pathToFileURL(defaultsModulePath).href);

    const registry = providers.createLiveProviderRegistry();
    for (const providerId of ["openai", "aigocode", "google", "deepseek", "claude", "qwen"]) {
      if (!registry[providerId]) issues.push(`live registry should include ${providerId}`);
    }

    const openaiOnly = providers.createLiveProviderRegistry({ mode: "dryRun", providerIds: ["openai"] });
    if (Object.keys(openaiOnly).length !== 1 || !openaiOnly.openai) {
      issues.push("live registry should support providerIds filtering");
    }

    const openaiConfig = {
      ...defaults.createProviderConfigDefaults("openai"),
      enabled: true,
      apiKey: "sk-live-stub-check",
      defaultModel: "gpt-image-1",
    };
    const imageRequest = providers.ImageGenerationRequestSchema.parse({
      context: {
        projectId: "project-live-provider-check",
        mode: "poster",
        providerId: "openai",
        traceId: "trace-live-provider-check",
      },
      schemeId: "scheme-poster-01",
      prompt: "Validate live provider stubs without network execution.",
      assets: [],
      platformPreset: "tiktok",
      aspectRatio: "9:16",
      width: 1080,
      height: 1920,
      model: "gpt-image-1",
      count: 1,
    });

    const health = await registry.openai.healthCheck(openaiConfig);
    if (!health.ok || health.value.status !== "unavailable") {
      issues.push("configured live stub health should be unavailable, not ready");
    }

    const imageResult = await registry.openai.generateImage(imageRequest, openaiConfig);
    if (imageResult.ok || imageResult.error.code !== "provider_unavailable") {
      issues.push("live image stub should return structured provider_unavailable");
    }

    const claudeConfig = {
      ...defaults.createProviderConfigDefaults("claude"),
      enabled: true,
      apiKey: "",
      defaultModel: "claude-sonnet-4-5",
    };
    const claudeHealth = await registry.claude.healthCheck(claudeConfig);
    if (!claudeHealth.ok || claudeHealth.value.status !== "not_configured") {
      issues.push("Claude live stub should require API Key configuration");
    }
  } finally {
    const resolved = path.resolve(outDir);
    if (resolved.startsWith(`${path.resolve(root)}${path.sep}`) && path.basename(resolved).startsWith(".tmp-live-provider-check-")) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Live provider adapter checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Live provider adapter checks passed.");
