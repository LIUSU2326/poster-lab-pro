import path from "node:path";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { createLocalApiService } from "./service";
import {
  EncryptedProviderCredentialRecordSchema,
  createEncryptedProviderCredentialVault,
  type EncryptedProviderCredentialRecord,
  type ProviderCredentialVaultBackingStore,
} from "../providers/encrypted-credential-vault";
import { createProviderConnectionFetchTransport } from "../providers/connection-diagnostics";
import { createLocalResultFileStore } from "../results";
import { createBlankWorkspaceSnapshot, createJsonFileWorkspaceRepository } from "../storage";
import {
  createGoogleLiveImageAdapter,
  createMockProviderRegistry,
  createOpenAILiveImageAdapter,
  type ProviderAdapterRegistry,
} from "../providers";
import {
  createGoogleImageFetchTransport,
  createOpenAIImageFetchTransport,
} from "./provider-image-transports";
import {
  createOpenAICompatibleBriefAdapter,
  createOpenAICompatibleChatFetchTransport,
} from "../providers/openai-compatible-brief-adapter";
import { createProviderDiagnosticService } from "./provider-diagnostics";
import { isQueueCancellationRequested } from "./queue-cancellation";

function createFileCredentialVaultBackingStore(filePath: string): ProviderCredentialVaultBackingStore {
  let loaded = false;
  const records = new Map<string, EncryptedProviderCredentialRecord>();

  async function load() {
    if (loaded) return;
    loaded = true;

    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as { records?: unknown[] };
      for (const record of parsed.records || []) {
        const safeRecord = EncryptedProviderCredentialRecordSchema.parse(record);
        records.set(safeRecord.keyRef, safeRecord);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
  }

  async function persist() {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      JSON.stringify({ records: [...records.values()] }, null, 2),
      "utf8",
    );
  }

  return {
    async getRecord(keyRef) {
      await load();
      const record = records.get(keyRef);
      return record ? EncryptedProviderCredentialRecordSchema.parse(record) : null;
    },

    async setRecord(record) {
      await load();
      const parsed = EncryptedProviderCredentialRecordSchema.parse(record);
      records.set(parsed.keyRef, parsed);
      await persist();
    },

    async deleteRecord(keyRef) {
      await load();
      const deleted = records.delete(keyRef);
      if (deleted) await persist();
      return deleted;
    },
  };
}

function createQueueProviderRegistry(fetchImpl: typeof fetch): ProviderAdapterRegistry {
  const registry = createMockProviderRegistry();
  const chatTransport = createOpenAICompatibleChatFetchTransport(fetchImpl);
  const openAIImageAdapter = createOpenAILiveImageAdapter({
    transport: createOpenAIImageFetchTransport(fetchImpl),
  });
  const aigocodeImageAdapter = createOpenAILiveImageAdapter({
    providerId: "aigocode",
    transport: createOpenAIImageFetchTransport(fetchImpl),
  });
  const agnesImageAdapter = createOpenAILiveImageAdapter({
    providerId: "agnes",
    transport: createOpenAIImageFetchTransport(fetchImpl),
  });
  const googleImageAdapter = createGoogleLiveImageAdapter({
    transport: createGoogleImageFetchTransport(fetchImpl),
  });

  for (const providerId of ["openai", "aigocode", "deepseek", "qwen", "agnes", "mimo"] as const) {
    const briefAdapter = createOpenAICompatibleBriefAdapter({
      providerId,
      transport: chatTransport,
    });
    registry[providerId] = {
      ...registry[providerId],
      manifest: briefAdapter.manifest,
      validateConfig: briefAdapter.validateConfig,
      healthCheck: briefAdapter.healthCheck.bind(briefAdapter),
      ...(briefAdapter.generateBrief ? { generateBrief: briefAdapter.generateBrief.bind(briefAdapter) } : {}),
    };
  }
  registry.openai = {
    ...registry.openai,
    manifest: openAIImageAdapter.manifest,
    validateConfig: openAIImageAdapter.validateConfig,
    healthCheck: openAIImageAdapter.healthCheck,
    ...(registry.openai?.generateBrief ? { generateBrief: registry.openai.generateBrief.bind(registry.openai) } : {}),
    ...(openAIImageAdapter.generateImage ? { generateImage: openAIImageAdapter.generateImage.bind(openAIImageAdapter) } : {}),
    ...(openAIImageAdapter.editImage ? { editImage: openAIImageAdapter.editImage.bind(openAIImageAdapter) } : {}),
  };
  registry.aigocode = {
    ...registry.aigocode,
    manifest: aigocodeImageAdapter.manifest,
    validateConfig: aigocodeImageAdapter.validateConfig,
    healthCheck: aigocodeImageAdapter.healthCheck,
    ...(registry.aigocode?.generateBrief ? { generateBrief: registry.aigocode.generateBrief.bind(registry.aigocode) } : {}),
    ...(aigocodeImageAdapter.generateImage ? { generateImage: aigocodeImageAdapter.generateImage.bind(aigocodeImageAdapter) } : {}),
    ...(aigocodeImageAdapter.editImage ? { editImage: aigocodeImageAdapter.editImage.bind(aigocodeImageAdapter) } : {}),
  };
  registry.agnes = {
    ...registry.agnes,
    manifest: agnesImageAdapter.manifest,
    validateConfig: agnesImageAdapter.validateConfig,
    healthCheck: agnesImageAdapter.healthCheck,
    ...(registry.agnes?.generateBrief ? { generateBrief: registry.agnes.generateBrief.bind(registry.agnes) } : {}),
    ...(agnesImageAdapter.generateImage ? { generateImage: agnesImageAdapter.generateImage.bind(agnesImageAdapter) } : {}),
    ...(agnesImageAdapter.editImage ? { editImage: agnesImageAdapter.editImage.bind(agnesImageAdapter) } : {}),
  };
  registry.google = {
    ...registry.google,
    manifest: googleImageAdapter.manifest,
    validateConfig: googleImageAdapter.validateConfig,
    healthCheck: googleImageAdapter.healthCheck,
    ...(googleImageAdapter.generateBrief ? { generateBrief: googleImageAdapter.generateBrief.bind(googleImageAdapter) } : {}),
    ...(googleImageAdapter.generateImage ? { generateImage: googleImageAdapter.generateImage.bind(googleImageAdapter) } : {}),
  };

  return registry;
}

type NextApiSingleton = {
  repository: ReturnType<typeof createJsonFileWorkspaceRepository>;
  credentialVault: ReturnType<typeof createEncryptedProviderCredentialVault>;
  localApiService: ReturnType<typeof createLocalApiService>;
  providerDiagnosticService: ReturnType<typeof createProviderDiagnosticService>;
  resultFileStore: ReturnType<typeof createLocalResultFileStore>;
};

declare global {
  // Keep the local API state shared across Next route module reloads in dev.
  // This prevents provider settings and generation routes from seeing different in-memory vaults.
  var __posterLabNextApiSingleton: NextApiSingleton | undefined;
}

let runtimeProxyConfigured = false;

function firstProxyValue(proxyServer: string, key: "http" | "https"): string {
  const trimmed = proxyServer.trim();
  if (!trimmed.includes("=")) return trimmed;
  const pairs = trimmed
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const index = item.indexOf("=");
      return index > 0 ? [item.slice(0, index).toLowerCase(), item.slice(index + 1)] : ["", item];
    });
  return pairs.find(([name]) => name === key)?.[1]
    || pairs.find(([name]) => name === "http")?.[1]
    || pairs[0]?.[1]
    || "";
}

function normalizeProxyUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function readWindowsUserProxy(): { httpProxy: string; httpsProxy: string } | null {
  if (process.platform !== "win32") return null;
  const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
  try {
    const enabledRaw = execFileSync("reg", ["query", key, "/v", "ProxyEnable"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (!/\bProxyEnable\b[\s\S]*0x1\b/i.test(enabledRaw)) return null;
    const serverRaw = execFileSync("reg", ["query", key, "/v", "ProxyServer"], {
      encoding: "utf8",
      windowsHide: true,
    });
    const match = serverRaw.match(/\bProxyServer\b\s+REG_SZ\s+(.+)\s*$/im);
    const proxyServer = match?.[1]?.trim() || "";
    if (!proxyServer) return null;
    return {
      httpProxy: normalizeProxyUrl(firstProxyValue(proxyServer, "http")),
      httpsProxy: normalizeProxyUrl(firstProxyValue(proxyServer, "https")),
    };
  } catch {
    return null;
  }
}

function appendNoProxy(value: string | undefined, additions: string[]): string {
  const current = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set([...current, ...additions])).join(",");
}

function configureRuntimeProxyFromSystem() {
  if (runtimeProxyConfigured || process.env.POSTER_LAB_DISABLE_SYSTEM_PROXY === "1") return;
  runtimeProxyConfigured = true;

  if (!process.env.HTTPS_PROXY && !process.env.HTTP_PROXY && !process.env.ALL_PROXY) {
    const proxy = readWindowsUserProxy();
    if (proxy?.httpProxy) process.env.HTTP_PROXY = proxy.httpProxy;
    if (proxy?.httpsProxy) process.env.HTTPS_PROXY = proxy.httpsProxy;
  }

  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY) {
    process.env.NO_PROXY = appendNoProxy(process.env.NO_PROXY, ["localhost", "127.0.0.1", "::1"]);
    setGlobalDispatcher(new EnvHttpProxyAgent());
  }
}

function createNextApiSingleton(): NextApiSingleton {
  configureRuntimeProxyFromSystem();
  const runtimeDir = process.env.POSTER_LAB_RUNTIME_DIR || path.join(process.cwd(), "artifacts", "runtime");
  const repository = createJsonFileWorkspaceRepository({
    filePath: path.join(runtimeDir, "workspace-store.json"),
    seedSnapshots: [createBlankWorkspaceSnapshot()],
  });
  const resultFileStore = createLocalResultFileStore({
    rootDir: path.join(runtimeDir, "..", "generated-results"),
  });
  const credentialVault = createEncryptedProviderCredentialVault({
    masterKey: process.env.POSTER_LAB_LOCAL_VAULT_KEY || `poster-lab-local-dev-vault:${process.cwd()}`,
    store: createFileCredentialVaultBackingStore(path.join(runtimeDir, "provider-vault.json")),
  });

  return {
    repository,
    credentialVault,
    localApiService: createLocalApiService({
      repository,
      credentialVault,
      providerRegistry: createQueueProviderRegistry(fetch),
      resultFileStore,
      requireLiveExecutionGate: false,
      isQueueCancellationRequested,
    }),
    providerDiagnosticService: createProviderDiagnosticService({
      repository,
      credentialVault,
      transport: createProviderConnectionFetchTransport(fetch),
    }),
    resultFileStore,
  };
}

const nextApiSingleton = globalThis.__posterLabNextApiSingleton ?? createNextApiSingleton();
globalThis.__posterLabNextApiSingleton = nextApiSingleton;

export const nextRepository = nextApiSingleton.repository;
export const nextCredentialVault = nextApiSingleton.credentialVault;
export const nextLocalApiService = nextApiSingleton.localApiService;
export const nextProviderDiagnosticService = nextApiSingleton.providerDiagnosticService;
export const nextResultFileStore = nextApiSingleton.resultFileStore;
