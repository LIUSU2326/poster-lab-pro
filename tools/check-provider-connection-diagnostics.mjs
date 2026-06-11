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
    issues.push(`${filePath}: missing required file`);
    return "";
  }
}

const contracts = read("src/providers/connection-diagnostic-contracts.ts");
const diagnostics = read("src/providers/connection-diagnostics.ts");
const apiContracts = read("src/api/contracts.ts");
const apiDiagnostics = read("src/api/provider-diagnostics.ts");
const route = read("app/api/workspaces/[workspaceId]/provider-credentials/[providerId]/connection-test/route.ts");
const settings = read("src/render/settings-sheet.js");
const client = read("src/provider-credential-client.js");
const product = read("PRODUCT.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const decisions = read("DECISIONS.md");
const pkg = read("package.json");

for (const token of [
  "ProviderConnectionTestRequestSchema",
  "ProviderConnectionTestResultSchema",
  "ProviderConnectionStatusSchema",
]) {
  if (!contracts.includes(token)) issues.push(`connection-diagnostic-contracts.ts: missing ${token}`);
}

for (const token of [
  "runProviderConnectionDiagnostic",
  "createProviderConnectionFetchTransport",
  "/models",
  "attemptedNetwork",
  "defaultModelAvailable",
  "auth_failed",
  "rate_limited",
  "quota_exceeded",
]) {
  if (!diagnostics.includes(token)) issues.push(`connection-diagnostics.ts: missing ${token}`);
}

for (const token of [
  "provider.connection.test",
  "ProviderConnectionTestApiRequestSchema",
  "ProviderConnectionTestApiResponseSchema",
  "ProviderConnectionTestResultSchema",
]) {
  if (!apiContracts.includes(token)) issues.push(`api/contracts.ts: missing ${token}`);
}

for (const token of ["createProviderDiagnosticService", "testProviderConnection", "providerCredentialKeyRef"]) {
  if (!apiDiagnostics.includes(token)) issues.push(`provider-diagnostics.ts: missing ${token}`);
}

for (const token of ["nextProviderDiagnosticService", "testProviderConnection", "jsonEnvelope"]) {
  if (!route.includes(token)) issues.push(`connection-test route: missing ${token}`);
}

for (const token of ["test-provider-connection", "connection-test-status"]) {
  if (!settings.includes(token)) issues.push(`settings-sheet.js: missing ${token}`);
}
for (const token of ["testProviderConnectionForWorkbench", "connection-test"]) {
  if (!client.includes(token)) issues.push(`provider-credential-client.js: missing ${token}`);
}

for (const [file, source] of [
  ["PRODUCT.md", product],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
  ["DECISIONS.md", decisions],
]) {
  if (!source.includes("Provider Connection Diagnostics") && !source.includes("Provider Connection Tests")) {
    issues.push(`${file}: missing provider connection diagnostics update`);
  }
}
if (!decisions.includes("D076")) issues.push("DECISIONS.md: missing D076 provider connection decision");
if (!pkg.includes("provider-connection:check")) issues.push("package.json: missing provider-connection:check script");

for (const forbidden of ["generateImage(", "/images/generations", "localStorage", "sessionStorage", "writeFile", "readFile"]) {
  if ([diagnostics, apiDiagnostics, route].join("\n").includes(forbidden)) {
    issues.push(`provider connection diagnostics must not generate images or store browser credentials (${forbidden})`);
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
  const outDir = path.join(root, `.tmp-provider-connection-check-${Date.now()}`);
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
    const diagnosticsResult = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
    const errors = diagnosticsResult.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
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

    const providersPath = existsSync(path.join(outDir, "providers", "index.js"))
      ? path.join(outDir, "providers", "index.js")
      : path.join(outDir, "src", "providers", "index.js");
    const apiPath = existsSync(path.join(outDir, "api", "provider-diagnostics.js"))
      ? path.join(outDir, "api", "provider-diagnostics.js")
      : path.join(outDir, "src", "api", "provider-diagnostics.js");
    const storagePath = existsSync(path.join(outDir, "storage", "index.js"))
      ? path.join(outDir, "storage", "index.js")
      : path.join(outDir, "src", "storage", "index.js");

    const providers = await import(pathToFileURL(providersPath).href);
    const api = await import(pathToFileURL(apiPath).href);
    const storage = await import(pathToFileURL(storagePath).href);

    const secret = "OPENAI_CONNECTION_KEY_TEST_PLACEHOLDER";
    const workspaceId = "workspace-pizza-kitchen";
    const repository = storage.createMemoryDraftRepository([storage.createMockWorkspaceSnapshot()]);
    const vault = providers.createEncryptedProviderCredentialVault({
      masterKey: "provider-connection-check-master-key",
      now: () => "2026-05-23T00:00:00.000Z",
    });
    await vault.save({
      providerId: "openai",
      keyRef: `${workspaceId}:openai:default`,
      apiKey: secret,
    });

    let capturedAuthorization = "";
    const service = api.createProviderDiagnosticService({
      repository,
      credentialVault: vault,
      transport: async (request) => {
        capturedAuthorization = request.headers.Authorization || "";
        return {
          ok: true,
          status: 200,
          body: {
            data: [{ id: "gpt-image-1" }, { id: "gpt-4.1" }],
          },
        };
      },
    });

    const passed = await service.testProviderConnection({
      workspaceId,
      providerId: "openai",
      verifyModels: true,
    });
    if (!passed.ok || !passed.data.result.ok || passed.data.result.status !== "ready") {
      issues.push("provider connection service should report ready with fake model-list transport");
    }
    if (!capturedAuthorization.endsWith(secret)) {
      issues.push("provider connection transport should receive the resolved credential only at diagnostic time");
    }
    if (JSON.stringify(passed).includes(secret)) {
      issues.push("provider connection response must not echo clear-text API keys");
    }

    const loaded = await repository.loadSnapshot(workspaceId);
    if (!loaded.ok || loaded.snapshot.providerConfigs.openai?.status !== "success") {
      issues.push("provider connection test should mirror safe provider status metadata to workspace snapshot");
    }

    const openaiTextModelSnapshot = await repository.loadSnapshot(workspaceId);
    if (openaiTextModelSnapshot.ok) {
      await repository.saveSnapshot({
        ...openaiTextModelSnapshot.snapshot,
        providerConfigs: {
          ...openaiTextModelSnapshot.snapshot.providerConfigs,
          openai: {
            ...openaiTextModelSnapshot.snapshot.providerConfigs.openai,
            enabled: true,
            defaultModel: "gpt-5.4",
            modelSlots: {
              ...openaiTextModelSnapshot.snapshot.providerConfigs.openai.modelSlots,
              concept: "gpt-5.4",
            },
          },
        },
      });
    }
    const openaiTextModelService = api.createProviderDiagnosticService({
      repository,
      credentialVault: vault,
      transport: async () => ({
        ok: true,
        status: 200,
        body: {
          data: [{ id: "gpt-4.1" }],
        },
      }),
    });
    const openaiTextModelProbe = await openaiTextModelService.testProviderConnection({
      workspaceId,
      providerId: "openai",
      verifyModels: true,
    });
    if (!openaiTextModelProbe.ok || !openaiTextModelProbe.data.result.ok || openaiTextModelProbe.data.result.defaultModelAvailable !== false) {
      issues.push("missing GPT text model list entry should be reported as a non-blocking warning after the provider responds");
    }

    await vault.save({
      providerId: "aigocode",
      keyRef: `${workspaceId}:aigocode:default`,
      apiKey: "AIGOCODE_GEMINI_KEY_TEST_PLACEHOLDER",
    });
    const aigocodeSnapshot = await repository.loadSnapshot(workspaceId);
    if (aigocodeSnapshot.ok) {
      await repository.saveSnapshot({
        ...aigocodeSnapshot.snapshot,
        providerConfigs: {
          ...aigocodeSnapshot.snapshot.providerConfigs,
          aigocode: {
            ...aigocodeSnapshot.snapshot.providerConfigs.aigocode,
            enabled: true,
            baseUrl: "https://api.aigocode.com/v1beta",
            defaultModel: "gemini-2.5-flash",
            modelSlots: {
              concept: "gemini-2.5-flash",
              image: "gemini-2.5-flash-image",
              styleReference: "gemini-2.5-flash",
              compositionReference: "gemini-2.5-flash",
            },
          },
        },
      });
    }
    let capturedAigocodeGeminiUrl = "";
    let capturedAigocodeAuthorization = "";
    const aigocodeGeminiService = api.createProviderDiagnosticService({
      repository,
      credentialVault: vault,
      transport: async (request) => {
        capturedAigocodeGeminiUrl = request.url;
        capturedAigocodeAuthorization = request.headers.Authorization || "";
        return {
          ok: true,
          status: 200,
          body: {
            models: [{ name: "models/gemini-2.5-flash" }],
          },
        };
      },
    });
    const aigocodeGeminiProbe = await aigocodeGeminiService.testProviderConnection({
      workspaceId,
      providerId: "aigocode",
      verifyModels: true,
    });
    if (!aigocodeGeminiProbe.ok || !aigocodeGeminiProbe.data.result.ok || aigocodeGeminiProbe.data.result.status !== "ready") {
      issues.push("AIGoCode Gemini-compatible connection probe should pass through the Gemini model-list response");
    }
    if (!capturedAigocodeGeminiUrl.startsWith("https://api.aigocode.com/v1beta/models?key=")) {
      issues.push("AIGoCode Gemini-compatible probe should use the v1beta models?key= route");
    }
    if (capturedAigocodeAuthorization) {
      issues.push("AIGoCode Gemini-compatible probe should not use OpenAI Bearer authorization");
    }

    const authFailedService = api.createProviderDiagnosticService({
      repository,
      credentialVault: vault,
      transport: async () => ({
        ok: false,
        status: 401,
        body: { error: { message: "invalid api key" } },
      }),
    });
    const authFailed = await authFailedService.testProviderConnection({
      workspaceId,
      providerId: "openai",
    });
    if (!authFailed.ok || authFailed.data.result.status !== "auth_failed" || authFailed.data.result.errorCode !== "auth_failed") {
      issues.push("provider connection diagnostics should map 401 to auth_failed");
    }
  } finally {
    const resolved = path.resolve(outDir);
    if (resolved.startsWith(`${path.resolve(root)}${path.sep}`) && path.basename(resolved).startsWith(".tmp-provider-connection-check-")) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Provider connection diagnostics checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Provider connection diagnostics checks passed.");
