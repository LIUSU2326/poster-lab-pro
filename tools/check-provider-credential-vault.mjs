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

const vault = read("src/providers/encrypted-credential-vault.ts");
const providerBarrel = read("src/providers/index.ts");
const contracts = read("src/api/contracts.ts");
const service = read("src/api/service.ts");
const route = read("app/api/workspaces/[workspaceId]/provider-credentials/[providerId]/route.ts");
const product = read("PRODUCT.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const decisions = read("DECISIONS.md");
const pkg = read("package.json");

for (const token of [
  "EncryptedProviderCredentialRecordSchema",
  "ProviderCredentialVaultSaveRequestSchema",
  "ProviderCredentialVaultStatusSchema",
  "createEncryptedProviderCredentialVault",
  "createMemoryCredentialVaultBackingStore",
  "resolveCredential",
  "secretStore",
  "aes-256-gcm",
]) {
  if (!vault.includes(token)) issues.push(`encrypted-credential-vault.ts: missing ${token}`);
}

for (const token of ["createEncryptedProviderCredentialVault", "ProviderCredentialVaultStatusSchema"]) {
  if (!providerBarrel.includes(token)) issues.push(`providers/index.ts: missing ${token}`);
}

for (const token of [
  "provider.credential.status",
  "provider.credential.save",
  "provider.credential.delete",
  "ProviderCredentialSaveApiRequestSchema",
  "ProviderCredentialStatusApiResponseSchema",
  "ProviderCredentialDeleteApiResponseSchema",
]) {
  if (!contracts.includes(token)) issues.push(`api/contracts.ts: missing ${token}`);
}

for (const method of [
  "getProviderCredentialStatus",
  "saveProviderCredential",
  "deleteProviderCredential",
  "updateProviderCredentialMirror",
]) {
  if (!service.includes(method)) issues.push(`api/service.ts: missing ${method}`);
}

for (const token of ["GET", "POST", "DELETE", "nextLocalApiService", "jsonEnvelope"]) {
  if (!route.includes(token)) issues.push(`provider credential route: missing ${token}`);
}

for (const [file, source] of [
  ["PRODUCT.md", product],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
  ["DECISIONS.md", decisions],
]) {
  if (!source.includes("Encrypted Provider Credential Vault") && !source.includes("encrypted provider credential vault")) {
    issues.push(`${file}: missing encrypted credential vault update`);
  }
}

if (!decisions.includes("D075")) issues.push("DECISIONS.md: missing D075 credential vault decision");
if (!pkg.includes("provider-credential-vault:check")) {
  issues.push("package.json: missing provider-credential-vault:check script");
}

for (const forbidden of ["fetch(", "XMLHttpRequest", "axios", "localStorage", "sessionStorage", "api.openai.com", "generateImage(", "healthCheck("]) {
  if ([vault, route].join("\n").includes(forbidden)) {
    issues.push(`credential vault and route must not call live providers, browser storage, or network APIs (${forbidden})`);
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
  const outDir = path.join(root, `.tmp-provider-vault-check-${Date.now()}`);
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
    const apiModulePath = existsSync(path.join(outDir, "api", "service.js"))
      ? path.join(outDir, "api", "service.js")
      : path.join(outDir, "src", "api", "service.js");
    const storageModulePath = existsSync(path.join(outDir, "storage", "index.js"))
      ? path.join(outDir, "storage", "index.js")
      : path.join(outDir, "src", "storage", "index.js");

    const providers = await import(pathToFileURL(providersModulePath).href);
    const api = await import(pathToFileURL(apiModulePath).href);
    const storage = await import(pathToFileURL(storageModulePath).href);

    const secret = "OPENAI_VAULT_KEY_TEST_PLACEHOLDER";
    const backingStore = providers.createMemoryCredentialVaultBackingStore();
    const vaultInstance = providers.createEncryptedProviderCredentialVault({
      masterKey: "vault-check-master-key",
      store: backingStore,
      now: () => "2026-05-23T00:00:00.000Z",
      randomBytesSource: (size) => new Uint8Array(size).fill(7),
    });

    const status = await vaultInstance.save({
      providerId: "openai",
      keyRef: "workspace-check:openai:default",
      apiKey: secret,
    });
    if (!status.configured || !status.apiKeyMasked.includes("****") || status.apiKeyMasked.includes("secret")) {
      issues.push("vault save should return masked configured status only");
    }
    if (JSON.stringify(status).includes(secret)) {
      issues.push("vault status must not expose clear-text API keys");
    }

    const record = await backingStore.getRecord("workspace-check:openai:default");
    if (!record) {
      issues.push("vault backing store should contain encrypted record after save");
    } else {
      const serializedRecord = JSON.stringify(record);
      if (serializedRecord.includes(secret)) {
        issues.push("encrypted vault record must not contain clear-text API key");
      }
      if (!record.encryptedValue || !record.iv || !record.authTag) {
        issues.push("encrypted vault record should include ciphertext, iv, and auth tag");
      }
    }

    const resolved = await vaultInstance.resolveCredential(status.credentialRef);
    if (!resolved.ok || resolved.value.apiKey !== secret) {
      issues.push("vault should resolve clear-text key only through CredentialResolver");
    }

    const mismatch = await vaultInstance.resolveCredential({ ...status.credentialRef, providerId: "deepseek" });
    if (mismatch.ok || mismatch.error.code !== "invalid_request") {
      issues.push("vault should reject provider-mismatched credential refs");
    }

    const revoked = await vaultInstance.revoke({
      providerId: "openai",
      keyRef: "workspace-check:openai:default",
    });
    const afterRevoke = await vaultInstance.describe({
      providerId: "openai",
      keyRef: "workspace-check:openai:default",
    });
    if (!revoked || afterRevoke.configured || afterRevoke.credentialRef !== null) {
      issues.push("vault revoke should remove credential status");
    }

    const repository = storage.createMemoryDraftRepository([storage.createMockWorkspaceSnapshot()]);
    const serviceInstance = api.createLocalApiService({
      repository,
      credentialVault: providers.createEncryptedProviderCredentialVault({
        masterKey: "service-check-master-key",
        now: () => "2026-05-23T00:00:00.000Z",
      }),
    });
    const workspaceId = "workspace-pizza-kitchen";
    const saved = await serviceInstance.saveProviderCredential({
      workspaceId,
      providerId: "openai",
      apiKey: secret,
    });
    if (!saved.ok || !saved.data.status.configured || JSON.stringify(saved).includes(secret)) {
      issues.push("service saveProviderCredential should return masked status only");
    }
    const loaded = await repository.loadSnapshot(workspaceId);
    if (!loaded.ok || loaded.snapshot.providerConfigs.openai?.apiKeyMasked.includes("secret")) {
      issues.push("workspace snapshot should mirror only masked provider credential state");
    }
    if (JSON.stringify(loaded.ok ? loaded.snapshot : {}).includes(secret)) {
      issues.push("workspace snapshot must not contain clear-text API key after credential save");
    }
    const freshRepository = storage.createMemoryDraftRepository([storage.createMockWorkspaceSnapshot()]);
    const persistentVault = providers.createEncryptedProviderCredentialVault({
      masterKey: "status-mirror-master-key",
      now: () => "2026-05-23T00:00:00.000Z",
    });
    await persistentVault.save({
      providerId: "google",
      keyRef: "workspace-pizza-kitchen:google:default",
      apiKey: "GOOGLE_STATUS_KEY_TEST_PLACEHOLDER",
    });
    const mirrorService = api.createLocalApiService({
      repository: freshRepository,
      credentialVault: persistentVault,
    });
    const restoredStatus = await mirrorService.getProviderCredentialStatus({
      workspaceId,
      providerId: "google",
    });
    const restoredSnapshot = await freshRepository.loadSnapshot(workspaceId);
    if (
      !restoredStatus.ok ||
      !restoredSnapshot.ok ||
      restoredSnapshot.snapshot.providerConfigs.google?.enabled !== true ||
      restoredSnapshot.snapshot.providerConfigs.google?.status !== "success"
    ) {
      issues.push("credential status should re-enable provider config when a persisted vault key exists");
    }
    const staleBackingStore = providers.createMemoryCredentialVaultBackingStore();
    const staleVault = providers.createEncryptedProviderCredentialVault({
      masterKey: "old-packaged-build-master-key",
      store: staleBackingStore,
      now: () => "2026-05-23T00:00:00.000Z",
    });
    await staleVault.save({
      providerId: "google",
      keyRef: "workspace-pizza-kitchen:google:default",
      apiKey: "GOOGLE_STALE_KEY_TEST_PLACEHOLDER",
    });
    const repairedRepository = storage.createMemoryDraftRepository([storage.createMockWorkspaceSnapshot()]);
    const repairedService = api.createLocalApiService({
      repository: repairedRepository,
      credentialVault: providers.createEncryptedProviderCredentialVault({
        masterKey: "new-packaged-build-master-key",
        store: staleBackingStore,
      }),
    });
    const repairedStatus = await repairedService.getProviderCredentialStatus({
      workspaceId,
      providerId: "google",
    });
    const repairedSnapshot = await repairedRepository.loadSnapshot(workspaceId);
    const staleRecord = await staleBackingStore.getRecord("workspace-pizza-kitchen:google:default");
    if (
      !repairedStatus.ok ||
      repairedStatus.data.status.configured ||
      repairedStatus.data.recoveredInvalidCredential !== true ||
      staleRecord ||
      !repairedSnapshot.ok ||
      repairedSnapshot.snapshot.providerConfigs.google?.hasApiKey !== false ||
      repairedSnapshot.snapshot.providerConfigs.google?.status !== "idle"
    ) {
      issues.push("credential status should clear stale encrypted records that cannot be decrypted by the current desktop vault key");
    }
    const deleted = await serviceInstance.deleteProviderCredential({
      workspaceId,
      providerId: "openai",
    });
    if (!deleted.ok || deleted.data.status.configured || !deleted.data.providerConfigUpdated) {
      issues.push("service deleteProviderCredential should revoke and mirror unconfigured state");
    }
  } finally {
    const resolved = path.resolve(outDir);
    if (resolved.startsWith(`${path.resolve(root)}${path.sep}`) && path.basename(resolved).startsWith(".tmp-provider-vault-check-")) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Provider credential vault checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Provider credential vault checks passed.");
