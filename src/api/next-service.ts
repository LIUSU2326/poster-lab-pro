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
import { createMemoryDraftRepository, createMockWorkspaceSnapshot } from "../storage";
import {
  createGoogleImageFetchTransport,
  createManualLiveGenerationService,
  createOpenAIImageFetchTransport,
} from "./manual-live-generation";
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

type NextApiSingleton = {
  repository: ReturnType<typeof createMemoryDraftRepository>;
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
  const repository = createMemoryDraftRepository([createMockWorkspaceSnapshot()]);
  const runtimeDir = path.join(process.cwd(), "artifacts", "runtime");
  const resultFileStore = createLocalResultFileStore({
    rootDir: path.join(process.cwd(), "artifacts", "generated-results"),
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
      resultFileStore,
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
