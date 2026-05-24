import { readFileSync, rmSync, mkdirSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const issues = [];
const root = process.cwd();

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required generation form contract file`);
    return "";
  }
}

const source = read("src/forms/generation-form.ts");
const barrel = read("src/forms/index.ts");
const pkg = read("package.json");
const tsconfig = read("tsconfig.json");

for (const token of [
  "GenerationFormSchema",
  "createGenerationFormDefaults",
  "createGenerationFormDefaultsByMode",
  "parseGenerationFormValues",
  "getGenerationFormLockedFields",
  "switchGenerationFormMode",
  "createGenerationFormResolver",
  "zodResolver",
  "lockedFieldsForPromptMode",
]) {
  if (!source.includes(token)) issues.push(`generation-form.ts: missing ${token}`);
}

for (const token of ["react-hook-form", "@hookform/resolvers"]) {
  if (!pkg.includes(token)) issues.push(`package.json: missing ${token}`);
}

if (!barrel.includes("generation-form")) issues.push("src/forms/index.ts: missing generation-form export");
if (!tsconfig.includes("src/forms/**/*.ts")) issues.push("tsconfig.json: missing forms include");

for (const forbidden of ["fetch(", "XMLHttpRequest", "axios", "localStorage", "sessionStorage", "writeFile", "readFile", "generateImage(", "healthCheck("]) {
  if (source.includes(forbidden)) {
    issues.push(`generation-form.ts: form contract must not perform side effects (${forbidden})`);
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
  const outDir = path.join(root, `.tmp-generation-form-check-${Date.now()}`);
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

    const emittedFormPath = existsSync(path.join(outDir, "forms", "generation-form.js"))
      ? path.join(outDir, "forms", "generation-form.js")
      : path.join(outDir, "src", "forms", "generation-form.js");
    const formModule = await import(pathToFileURL(emittedFormPath).href);
    const modes = ["poster", "collab", "announcement", "logo", "icon"];
    for (const mode of modes) {
      const defaults = formModule.createGenerationFormDefaults(mode);
      const parsedDefaults = formModule.GenerationFormSchema.safeParse(defaults);
      if (!parsedDefaults.success) issues.push(`defaults failed to parse for ${mode}`);
      const lockedFields = formModule.getGenerationFormLockedFields(mode);
      if (!Array.isArray(lockedFields) || lockedFields.length === 0) {
        issues.push(`locked fields missing for ${mode}`);
      }
    }

    const poster = formModule.createGenerationFormDefaults("poster");
    const icon = formModule.switchGenerationFormMode(poster, "icon");
    if (icon.mode !== "icon" || icon.modeForm.mode !== "icon" || icon.outputSettings.mode !== "icon") {
      issues.push("switchGenerationFormMode did not switch all mode-bound fields");
    }
  } finally {
    const resolved = path.resolve(outDir);
    if (resolved.startsWith(`${path.resolve(root)}${path.sep}`) && path.basename(resolved).startsWith(".tmp-generation-form-check-")) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Generation form contract checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Generation form contract checks passed.");
