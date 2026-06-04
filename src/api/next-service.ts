import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createLocalApiService } from "./service";
import {
  EncryptedProviderCredentialRecordSchema,
  createEncryptedProviderCredentialVault,
  type EncryptedProviderCredentialRecord,
  type ProviderCredentialVaultBackingStore,
} from "../providers/encrypted-credential-vault";
import { createProviderConnectionFetchTransport } from "../providers/connection-diagnostics";
import { createLocalResultFileStore } from "../results";
import { createJsonFileWorkspaceRepository, createMockWorkspaceSnapshot } from "../storage";
import {
  createGoogleLiveImageAdapter,
  createMockProviderRegistry,
  createOpenAILiveImageAdapter,
  type ProviderAdapterRegistry,
} from "../providers";
import {
  createGoogleImageFetchTransport,
  createManualLiveGenerationService,
  createOpenAIImageFetchTransport,
} from "./manual-live-generation";
import {
  createOpenAICompatibleBriefAdapter,
  createOpenAICompatibleChatFetchTransport,
} from "../providers/openai-compatible-brief-adapter";
import { createProviderDiagnosticService } from "./provider-diagnostics";

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
  const agnesImageAdapter = createOpenAILiveImageAdapter({
    providerId: "agnes",
    transport: createOpenAIImageFetchTransport(fetchImpl),
  });
  const googleImageAdapter = createGoogleLiveImageAdapter({
    transport: createGoogleImageFetchTransport(fetchImpl),
  });

  for (const providerId of ["openai", "aigocode", "deepseek", "qwen", "agnes"] as const) {
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
  };
  registry.agnes = {
    ...registry.agnes,
    manifest: agnesImageAdapter.manifest,
    validateConfig: agnesImageAdapter.validateConfig,
    healthCheck: agnesImageAdapter.healthCheck,
    ...(registry.agnes?.generateBrief ? { generateBrief: registry.agnes.generateBrief.bind(registry.agnes) } : {}),
    ...(agnesImageAdapter.generateImage ? { generateImage: agnesImageAdapter.generateImage.bind(agnesImageAdapter) } : {}),
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
  manualLiveGenerationService: ReturnType<typeof createManualLiveGenerationService>;
};

declare global {
  // Keep the local API state shared across Next route module reloads in dev.
  // This prevents the provider settings route and live-test route from seeing different in-memory vaults.
  var __posterLabNextApiSingleton: NextApiSingleton | undefined;
}

function createNextApiSingleton(): NextApiSingleton {
  const runtimeDir = process.env.POSTER_LAB_RUNTIME_DIR || path.join(process.cwd(), "artifacts", "runtime");
  const repository = createJsonFileWorkspaceRepository({
    filePath: path.join(runtimeDir, "workspace-store.json"),
    seedSnapshots: [createMockWorkspaceSnapshot()],
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
      requireLiveExecutionGate: true,
    }),
    providerDiagnosticService: createProviderDiagnosticService({
      repository,
      credentialVault,
      transport: createProviderConnectionFetchTransport(fetch),
    }),
    resultFileStore,
    manualLiveGenerationService: createManualLiveGenerationService({
      repository,
      credentialVault,
      connectionTransport: createProviderConnectionFetchTransport(fetch),
      imageTransport: createOpenAIImageFetchTransport(fetch),
      googleImageTransport: createGoogleImageFetchTransport(fetch),
      resultFileStore,
    }),
  };
}

const nextApiSingleton = globalThis.__posterLabNextApiSingleton ?? createNextApiSingleton();
globalThis.__posterLabNextApiSingleton = nextApiSingleton;

export const nextRepository = nextApiSingleton.repository;
export const nextCredentialVault = nextApiSingleton.credentialVault;
export const nextLocalApiService = nextApiSingleton.localApiService;
export const nextProviderDiagnosticService = nextApiSingleton.providerDiagnosticService;
export const nextResultFileStore = nextApiSingleton.resultFileStore;
export const nextManualLiveGenerationService = nextApiSingleton.manualLiveGenerationService;
