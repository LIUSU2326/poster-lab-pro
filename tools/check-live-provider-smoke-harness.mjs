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
    issues.push(`${filePath}: missing required live provider smoke harness file`);
    return "";
  }
}

const harness = read("src/providers/live-smoke-harness.ts");
const barrel = read("src/providers/index.ts");
const decisions = read("DECISIONS.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const pkg = read("package.json");

for (const token of [
  "LiveProviderSmokeInputSchema",
  "LiveProviderSmokeResultSchema",
  "LiveProviderSmokeStatusSchema",
  "runLiveProviderSmokeHarness",
  "skipped",
  "blocked",
  "attempted",
  "executeMappedProviderRequestWithCredentials",
]) {
  if (!harness.includes(token)) issues.push(`live-smoke-harness.ts: missing ${token}`);
}

for (const token of ["runLiveProviderSmokeHarness", "LiveProviderSmokeInputSchema"]) {
  if (!barrel.includes(token)) issues.push(`providers/index.ts: missing live smoke export for ${token}`);
}

for (const [file, source] of [
  ["DECISIONS.md", decisions],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
]) {
  if (!source.includes("Live Provider Smoke Harness")) {
    issues.push(`${file}: missing Live Provider Smoke Harness update`);
  }
}

if (!pkg.includes("live-provider-smoke:check")) {
  issues.push("package.json: missing live-provider-smoke:check script");
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
  if (harness.includes(forbidden)) {
    issues.push(`live smoke harness must not perform network, env, browser storage, or persistence side effects (${forbidden})`);
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
  const outDir = path.join(root, `.tmp-live-provider-smoke-check-${Date.now()}`);
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
    const storageModulePath = existsSync(path.join(outDir, "storage", "index.js"))
      ? path.join(outDir, "storage", "index.js")
      : path.join(outDir, "src", "storage", "index.js");

    const providers = await import(pathToFileURL(providersModulePath).href);
    const storage = await import(pathToFileURL(storageModulePath).href);
    const snapshot = storage.createMockWorkspaceSnapshot();
    const storedConfig = {
      ...snapshot.providerConfigs.openai,
      enabled: true,
      hasApiKey: true,
      defaultModel: "gpt-image-1",
    };

    const skipped = await providers.runLiveProviderSmokeHarness({ providerId: "openai" });
    if (skipped.status !== "skipped" || skipped.attempted) {
      issues.push("live smoke harness should skip unless enabled is explicit");
    }

    const missingConfig = await providers.runLiveProviderSmokeHarness({ enabled: true, providerId: "openai" });
    if (missingConfig.status !== "blocked" || missingConfig.providerResult?.code !== "invalid_request") {
      issues.push("live smoke harness should block enabled runs without stored provider config");
    }

    const missingCredential = await providers.runLiveProviderSmokeHarness({
      enabled: true,
      providerId: "openai",
      storedConfig,
    });
    if (missingCredential.status !== "blocked" || missingCredential.providerResult?.code !== "auth_failed") {
      issues.push("live smoke harness should block missing runtime credentials before adapter execution");
    }

    const credentialRef = providers.createProviderCredentialRef({
      providerId: "openai",
      source: "runtime",
      keyRef: "openai",
      apiKeyPreview: "OPENAI_SMOKE_KEY_TEST_PLACEHOLDER",
      configured: true,
      updatedAt: "2026-05-22T00:00:00.000Z",
    });
    const resolver = providers.createMemoryCredentialResolver([
      {
        providerId: "openai",
        apiKey: "OPENAI_SMOKE_KEY_TEST_PLACEHOLDER",
        expiresAt: null,
      },
    ]);

    const liveStubResult = await providers.runLiveProviderSmokeHarness(
      {
        enabled: true,
        providerId: "openai",
        storedConfig,
        credentialRef,
        liveMode: "dryRun",
      },
      resolver,
    );
    if (
      liveStubResult.status !== "attempted" ||
      !liveStubResult.attempted ||
      liveStubResult.providerResult?.code !== "provider_unavailable"
    ) {
      issues.push("live smoke harness should reach live stubs and report provider_unavailable");
    }

    const injectedRegistryResult = await providers.runLiveProviderSmokeHarness(
      {
        enabled: true,
        providerId: "openai",
        storedConfig,
        credentialRef,
      },
      resolver,
      providers.createMockProviderRegistry(),
    );
    if (injectedRegistryResult.status !== "attempted" || injectedRegistryResult.providerResult?.ok !== true) {
      issues.push("live smoke harness should support injected provider registries for controlled checks");
    }
  } finally {
    const resolved = path.resolve(outDir);
    if (resolved.startsWith(`${path.resolve(root)}${path.sep}`) && path.basename(resolved).startsWith(".tmp-live-provider-smoke-check-")) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Live provider smoke harness checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Live provider smoke harness checks passed.");
