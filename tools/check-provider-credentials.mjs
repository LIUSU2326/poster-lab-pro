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
    issues.push(`${filePath}: missing required provider credential file`);
    return "";
  }
}

const credentials = read("src/providers/credentials.ts");
const executor = read("src/providers/executor.ts");
const barrel = read("src/providers/index.ts");
const product = read("PRODUCT.md");
const decisions = read("DECISIONS.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const pkg = read("package.json");

for (const token of [
  "ProviderCredentialRefSchema",
  "ProviderCredentialSourceSchema",
  "ProviderCredentialValueSchema",
  "CredentialResolver",
  "createProviderCredentialRef",
  "createMemoryCredentialResolver",
  "resolveProviderRuntimeConfig",
  "maskApiKey",
]) {
  if (!credentials.includes(token)) issues.push(`credentials.ts: missing ${token}`);
}

for (const token of ["ProviderExecutionWithCredentialInputSchema", "executeMappedProviderRequestWithCredentials"]) {
  if (!executor.includes(token)) issues.push(`executor.ts: missing ${token}`);
}

for (const token of ["credentials", "executeMappedProviderRequestWithCredentials", "ProviderCredentialRefSchema"]) {
  if (!barrel.includes(token)) issues.push(`providers/index.ts: missing export for ${token}`);
}

for (const [file, source] of [
  ["PRODUCT.md", product],
  ["DECISIONS.md", decisions],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
]) {
  if (!source.includes("credential")) issues.push(`${file}: missing provider credential boundary update`);
}

if (!pkg.includes("provider-credentials:check")) issues.push("package.json: missing provider-credentials:check script");

const credentialSource = [credentials, executor].join("\n");
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
  if (credentialSource.includes(forbidden)) {
    issues.push(`provider credential boundary must not read env, storage, files, or network by default (${forbidden})`);
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
  const outDir = path.join(root, `.tmp-provider-credential-check-${Date.now()}`);
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

    const providerModulePath = existsSync(path.join(outDir, "providers", "index.js"))
      ? path.join(outDir, "providers", "index.js")
      : path.join(outDir, "src", "providers", "index.js");
    const storageModulePath = existsSync(path.join(outDir, "storage", "index.js"))
      ? path.join(outDir, "storage", "index.js")
      : path.join(outDir, "src", "storage", "index.js");

    const providers = await import(pathToFileURL(providerModulePath).href);
    const storage = await import(pathToFileURL(storageModulePath).href);
    const snapshot = storage.createMockWorkspaceSnapshot();
    const storedConfig = snapshot.providerConfigs.openai;
    if (!storedConfig) issues.push("mock workspace should include an OpenAI stored provider config");

    const mappedRequest = {
      kind: "imageGeneration",
      providerId: "openai",
      model: "gpt-image-1",
      promptPackageId: "prompt-package-provider-credential-check",
      request: {
        context: {
          projectId: snapshot.project.id,
          mode: "poster",
          providerId: "openai",
          jobId: "job-provider-credential-check",
        },
        schemeId: "scheme-poster-01",
        prompt: "Generate a safe static credential-bound mock image.",
        assets: [],
        platformPreset: "tiktok",
        aspectRatio: "9:16",
        width: 1080,
        height: 1920,
        model: "gpt-image-1",
        count: 1,
      },
    };

    const missingCredential = await providers.executeMappedProviderRequestWithCredentials({
      mappedRequest,
      storedConfig,
    });
    if (missingCredential.ok || missingCredential.error.code !== "auth_failed") {
      issues.push("credential-aware execution should reject missing runtime credentials");
    }

    const ref = providers.createProviderCredentialRef({
      providerId: "openai",
      source: "runtime",
      keyRef: "openai",
      apiKeyPreview: "OPENAI_RUNTIME_KEY_TEST_PLACEHOLDER",
      configured: true,
      updatedAt: "2026-05-21T12:00:00.000Z",
    });
    if (!ref.maskedValue.includes("****") || ref.maskedValue.includes("runtime-example")) {
      issues.push("credential refs must store masked preview only");
    }

    const resolver = providers.createMemoryCredentialResolver([
      {
        providerId: "openai",
        apiKey: "OPENAI_RUNTIME_KEY_TEST_PLACEHOLDER",
        expiresAt: null,
      },
    ]);
    const runtimeConfig = await providers.resolveProviderRuntimeConfig({
      storedConfig,
      credentialRef: ref,
      resolver,
    });
    if (!runtimeConfig.ok || runtimeConfig.value.apiKey !== "OPENAI_RUNTIME_KEY_TEST_PLACEHOLDER") {
      issues.push("credential resolver should produce runtime provider config");
    }

    const executed = await providers.executeMappedProviderRequestWithCredentials(
      {
        mappedRequest,
        storedConfig,
        credentialRef: ref,
      },
      resolver,
    );
    if (!executed.ok || !executed.value.assets?.length) {
      issues.push("credential-aware execution should run through mock registry after resolution");
    }
  } finally {
    const resolved = path.resolve(outDir);
    if (resolved.startsWith(`${path.resolve(root)}${path.sep}`) && path.basename(resolved).startsWith(".tmp-provider-credential-check-")) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Provider credential checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Provider credential checks passed.");
