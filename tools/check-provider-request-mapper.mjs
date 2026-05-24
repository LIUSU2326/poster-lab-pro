import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const issues = [];
const root = process.cwd();

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required provider request mapper file`);
    return "";
  }
}

const mapper = read("src/providers/request-mapper.ts");
const barrel = read("src/providers/index.ts");

for (const token of [
  "ProviderRequestMapperInputSchema",
  "ProviderMappedRequestSchema",
  "mapPromptPackageToProviderRequest",
  "mapPromptPackageToBriefRequest",
  "mapPromptPackageToImageRequest",
  "BriefGenerationRequestSchema",
  "ImageGenerationRequestSchema",
  "PromptPackageSchema",
  "WorkspaceSnapshotSchema",
  "ProviderAssetReferenceSchema",
  "resolveProviderModel",
]) {
  if (!mapper.includes(token)) issues.push(`request-mapper.ts: missing ${token}`);
}

for (const token of [
  "mapPromptPackageToProviderRequest",
  "mapPromptPackageToBriefRequest",
  "mapPromptPackageToImageRequest",
  "ProviderMappedRequestSchema",
]) {
  if (!barrel.includes(token)) issues.push(`providers/index.ts: missing request mapper export ${token}`);
}

for (const forbidden of [
  "fetch(",
  "XMLHttpRequest",
  "axios",
  "generateImage(",
  "editImage(",
  "upscale(",
  "removeBackground(",
  "healthCheck(",
  "localStorage",
  "sessionStorage",
  "writeFile",
  "readFile",
  "api.openai.com",
]) {
  if (mapper.includes(forbidden)) {
    issues.push(`request-mapper.ts: mapper must not perform provider, network, DOM, or persistence side effects (${forbidden})`);
  }
}

if (!mapper.includes("modeGuardrails(input.promptPackage.mode)")) {
  issues.push("request-mapper.ts: mapped provider requests must include provider mode guardrails");
}

if (!mapper.includes("modelSlots[parsedSlot]")) {
  issues.push("request-mapper.ts: model resolution must check provider model slot overrides");
}

if (!mapper.includes("input.promptPackage.finalPrompt")) {
  issues.push("request-mapper.ts: image requests must use prompt package finalPrompt");
}

for (const token of ["isProviderSafeAssetUrl", "assertPromptPackageReadyForProvider", "binding.url", "providerReady"]) {
  if (!mapper.includes(token)) issues.push(`request-mapper.ts: missing asset URL safety token ${token}`);
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
  const outDir = path.join(root, `.tmp-provider-request-check-${Date.now()}`);
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

    const storageModulePath = existsSync(path.join(outDir, "storage", "mock-snapshot.js"))
      ? path.join(outDir, "storage", "mock-snapshot.js")
      : path.join(outDir, "src", "storage", "mock-snapshot.js");
    const promptModulePath = existsSync(path.join(outDir, "prompts", "builder.js"))
      ? path.join(outDir, "prompts", "builder.js")
      : path.join(outDir, "src", "prompts", "builder.js");
    const mapperModulePath = existsSync(path.join(outDir, "providers", "request-mapper.js"))
      ? path.join(outDir, "providers", "request-mapper.js")
      : path.join(outDir, "src", "providers", "request-mapper.js");

    const storage = await import(pathToFileURL(storageModulePath).href);
    const prompts = await import(pathToFileURL(promptModulePath).href);
    const mapperModule = await import(pathToFileURL(mapperModulePath).href);

    const snapshot = storage.createMockWorkspaceSnapshot();
    const imagePrompt = prompts.createImagePromptPackage({
      snapshot,
      mode: "poster",
      schemeId: "scheme-poster-01",
    });

    if (!imagePrompt.validation.ok) issues.push("poster image prompt should validate when required asset URLs are present");
    if (!imagePrompt.finalPrompt.includes("Mode Asset References")) {
      issues.push("image prompt should include a mode asset inventory section");
    }
    if (!imagePrompt.assets.every((asset) => asset.url && asset.providerReady)) {
      issues.push("prompt asset bindings should carry provider-ready committed URLs");
    }

    const mapped = mapperModule.mapPromptPackageToProviderRequest({
      promptPackage: imagePrompt,
      snapshot,
      providerId: "openai",
      kind: "imageGeneration",
      traceId: "trace-provider-request-check",
    });
    if (!mapped.request.assets.every((asset) => asset.url?.startsWith("https://"))) {
      issues.push("provider image request should receive committed public asset URLs");
    }

    const blobSnapshot = {
      ...snapshot,
      assets: snapshot.assets.map((asset) =>
        asset.role === "gameCharacter" ? { ...asset, previewUrl: "blob:http://localhost/hero" } : asset,
      ),
    };
    const blobPrompt = prompts.createImagePromptPackage({
      snapshot: blobSnapshot,
      mode: "poster",
      schemeId: "scheme-poster-01",
    });
    if (blobPrompt.validation.ok) {
      issues.push("browser-only blob URLs should not pass image prompt validation for required assets");
    }
    try {
      mapperModule.mapPromptPackageToProviderRequest({
        promptPackage: blobPrompt,
        snapshot: blobSnapshot,
        providerId: "openai",
        kind: "imageGeneration",
      });
      issues.push("provider mapper should reject required blob-only asset references");
    } catch {
      // Expected: image generation must not proceed with browser-only required assets.
    }

    const missingSnapshot = {
      ...snapshot,
      assets: snapshot.assets.filter((asset) => asset.role !== "gameLogo"),
    };
    const missingPrompt = prompts.createImagePromptPackage({
      snapshot: missingSnapshot,
      mode: "poster",
      schemeId: "scheme-poster-01",
    });
    if (missingPrompt.validation.ok || !missingPrompt.validation.errors.some((error) => error.includes("gameLogo"))) {
      issues.push("missing required asset roles should be reported in image prompt validation");
    }
  } finally {
    const resolved = path.resolve(outDir);
    if (resolved.startsWith(`${path.resolve(root)}${path.sep}`) && path.basename(resolved).startsWith(".tmp-provider-request-check-")) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Provider request mapper checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Provider request mapper checks passed.");
