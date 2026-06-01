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

const runtimeStore = read("src/providers/runtime-credential-store.ts");
const openaiSmoke = read("src/providers/openai-live-smoke.ts");
const barrel = read("src/providers/index.ts");
const decisions = read("DECISIONS.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const product = read("PRODUCT.md");
const pkg = read("package.json");

for (const token of [
  "RuntimeProviderCredentialSessionRequestSchema",
  "RuntimeProviderCredentialSessionSchema",
  "RuntimeProviderCredentialStatusSchema",
  "createRuntimeProviderCredentialStore",
  "resolveCredential",
  "revoke",
  "clearExpired",
  "ProviderCredentialRefSchema",
  "CredentialResolver",
]) {
  if (!runtimeStore.includes(token)) issues.push(`runtime-credential-store.ts: missing ${token}`);
}

for (const token of ["createRuntimeProviderCredentialStore", "RuntimeProviderCredentialSessionSchema"]) {
  if (!barrel.includes(token)) issues.push(`providers/index.ts: missing runtime credential export ${token}`);
}

if (!openaiSmoke.includes("createRuntimeProviderCredentialStore")) {
  issues.push("openai-live-smoke.ts: manual smoke should use the runtime credential session path");
}

for (const [file, source] of [
  ["DECISIONS.md", decisions],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
  ["PRODUCT.md", product],
]) {
  if (!source.includes("Runtime") || !source.includes("credential")) {
    issues.push(`${file}: missing runtime credential session update`);
  }
}

if (!decisions.includes("D070")) {
  issues.push("DECISIONS.md: missing D070 runtime credential decision");
}

if (!pkg.includes("runtime-credentials:check")) {
  issues.push("package.json: missing runtime-credentials:check script");
}

for (const forbidden of ["fetch(", "XMLHttpRequest", "axios", "localStorage", "sessionStorage", "writeFile", "readFile", "process.env"]) {
  if (runtimeStore.includes(forbidden)) {
    issues.push(`runtime credential store must not perform network, env, browser storage, or file side effects (${forbidden})`);
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
  const outDir = path.join(root, `.tmp-runtime-credentials-check-${Date.now()}`);
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
      issues.push(
        ts.formatDiagnosticsWithColorAndContext(errors, {
          getCanonicalFileName: (fileName) => fileName,
          getCurrentDirectory: () => root,
          getNewLine: () => "\n",
        }),
      );
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

    const providers = await import(pathToFileURL(providersModulePath).href);

    let nowMs = 0;
    const store = providers.createRuntimeProviderCredentialStore({
      now: () => nowMs,
      idFactory: (providerId) => `runtime-session-${providerId}`,
    });
    const secret = "OPENAI_RUNTIME_SECRET_TEST_PLACEHOLDER";
    const session = store.createSession({
      providerId: "openai",
      apiKey: secret,
      expiresInMs: 60_000,
    });

    if (JSON.stringify(session).includes(secret)) {
      issues.push("runtime credential session must not expose clear-text API keys");
    }
    if (session.credentialRef.source !== "runtime" || session.credentialRef.keyRef !== "runtime-session-openai") {
      issues.push("runtime credential session should return a runtime credential ref");
    }
    if (!session.apiKeyMasked.includes("****")) {
      issues.push("runtime credential session should expose masked API key state");
    }

    const status = store.describe(session.credentialRef);
    if (!status || status.configured !== true || status.expired) {
      issues.push("runtime credential status should describe active sessions");
    }
    if (JSON.stringify(status).includes(secret)) {
      issues.push("runtime credential status must not expose clear-text API keys");
    }

    const resolved = await store.resolveCredential(session.credentialRef);
    if (!resolved.ok || resolved.value.apiKey !== secret) {
      issues.push("runtime credential store should resolve clear-text key only through CredentialResolver");
    }

    const badProviderRef = {
      ...session.credentialRef,
      providerId: "deepseek",
    };
    const mismatch = await store.resolveCredential(badProviderRef);
    if (mismatch.ok || mismatch.error.code !== "invalid_request") {
      issues.push("runtime credential store should reject provider-mismatched refs");
    }

    const storedConfig = {
      providerId: "openai",
      enabled: true,
      status: "success",
      hasApiKey: true,
      apiKeyMasked: session.apiKeyMasked,
      baseUrl: "",
      defaultModel: "gpt-image-1",
      modelSlots: { image: "gpt-image-1" },
      updatedAt: "2026-05-22T00:00:00.000Z",
    };
    const mappedRequest = providers.ProviderImageMappedRequestSchema.parse({
      kind: "imageGeneration",
      providerId: "openai",
      model: "gpt-image-1",
      promptPackageId: "prompt-runtime-credential-check",
      request: {
        context: {
          projectId: "project-runtime-credential-check",
          mode: "poster",
          providerId: "openai",
          traceId: "trace-runtime-credential-check",
        },
        schemeId: "scheme-runtime-credential-check",
        prompt: "Check runtime credential execution path.",
        assets: [],
        platformPreset: "custom",
        aspectRatio: "1:1",
        width: 1024,
        height: 1024,
        model: "gpt-image-1",
        count: 1,
      },
    });
    const execution = await providers.executeMappedProviderRequestWithCredentials(
      {
        mappedRequest,
        storedConfig,
        credentialRef: session.credentialRef,
      },
      store,
      providers.createMockProviderRegistry(),
    );
    if (!execution.ok || execution.value.providerId !== "openai") {
      issues.push("runtime credential store should plug into provider execution with credentials");
    }

    if (!store.revoke(session.credentialRef)) {
      issues.push("runtime credential store should revoke existing sessions");
    }
    const revoked = await store.resolveCredential(session.credentialRef);
    if (revoked.ok || revoked.error.code !== "auth_failed") {
      issues.push("revoked runtime credentials should fail with auth_failed");
    }

    const expiringStore = providers.createRuntimeProviderCredentialStore({
      now: () => nowMs,
      idFactory: (providerId) => `runtime-expiring-${providerId}`,
    });
    const expiring = expiringStore.createSession({
      providerId: "openai",
      apiKey: secret,
      expiresInMs: 1_000,
    });
    nowMs = 2_000;
    const expired = await expiringStore.resolveCredential(expiring.credentialRef);
    if (expired.ok || expired.error.code !== "auth_failed") {
      issues.push("expired runtime credentials should fail with auth_failed");
    }
    if (expiringStore.describe(expiring.credentialRef) !== null) {
      issues.push("expired runtime credentials should be cleared after failed resolution");
    }
  } finally {
    const resolved = path.resolve(outDir);
    if (
      resolved.startsWith(`${path.resolve(root)}${path.sep}`) &&
      path.basename(resolved).startsWith(".tmp-runtime-credentials-check-")
    ) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Runtime provider credential checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Runtime provider credential checks passed.");
