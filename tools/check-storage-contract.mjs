import { readFileSync } from "node:fs";

const issues = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required storage contract file`);
    return "";
  }
}

const contracts = read("src/storage/contracts.ts");
const redaction = read("src/storage/redaction.ts");
const snapshot = read("src/storage/mock-snapshot.ts");
const memoryRepository = read("src/storage/memory-repository.ts");
const localDraftRepository = read("src/storage/local-draft-repository.ts");
const databaseSchema = read("src/storage/database-schema.ts");
const databaseRepository = read("src/storage/database-repository.ts");
const memoryDatabaseClient = read("src/storage/memory-database-client.ts");
const barrel = read("src/storage/index.ts");
const localDraftStore = read("src/local-draft-store.js");
const staticSnapshot = read("src/data/workspace-snapshot.js");
const staticAdapters = read("src/data/workspace-adapters.js");
const archiveBoard = read("src/render/archive-board.js");
const settingsSheet = read("src/render/settings-sheet.js");

for (const token of [
  "WorkspaceSnapshotSchema",
  "StoredProviderConfigSchema",
  "StoredAssetRecordSchema",
  "StoredResultAssetSchema",
  "WorkspaceModeStateSchema",
  "StorageRepository",
  "summarizeWorkspaceSnapshot",
  "workspaceEffectiveUpdatedAt",
  "latestIsoTimestamp",
]) {
  if (!contracts.includes(token)) issues.push(`contracts.ts: missing ${token}`);
}

for (const token of ["apiKeyMasked", "hasApiKey", "providerConfigs", "queuePlans", "queueSummaries"]) {
  if (!contracts.includes(token)) issues.push(`contracts.ts: missing persistence token ${token}`);
}

for (const token of ["maskApiKey", "redactProviderConfig", "redactProviderConfigs", "containsUnredactedSecret"]) {
  if (!redaction.includes(token)) issues.push(`redaction.ts: missing ${token}`);
}

for (const token of ["createMockWorkspaceSnapshot", "createBatchQueuePlan", "summarizeQueue", "redactProviderConfigs"]) {
  if (!snapshot.includes(token)) issues.push(`mock-snapshot.ts: missing ${token}`);
}

for (const token of ["createMemoryDraftRepository", "saveSnapshot", "loadSnapshot", "listSnapshots", "cloneSnapshot"]) {
  if (!memoryRepository.includes(token)) issues.push(`memory-repository.ts: missing ${token}`);
}

for (const token of ["createBrowserLocalDraftRepository", "localStorage", "saveSnapshot", "loadSnapshot", "listSnapshots", "containsUnredactedSecret"]) {
  if (!localDraftRepository.includes(token)) issues.push(`local-draft-repository.ts: missing ${token}`);
}

for (const token of ["saveLocalSubmissionDraft", "loadLocalSubmissionDraft", "hydrateLocalSubmissionDraft", "containsPlainSecret"]) {
  if (!localDraftStore.includes(token)) issues.push(`local-draft-store.js: missing ${token}`);
}

for (const token of ["workspaceSnapshot", "providerConfigs", "archiveRows", "modeStates"]) {
  if (!staticSnapshot.includes(token)) issues.push(`workspace-snapshot.js: missing ${token}`);
}

for (const token of ["getProviderRows", "getArchiveRows", "getWorkspaceSnapshotSummary"]) {
  if (!staticAdapters.includes(token)) issues.push(`workspace-adapters.js: missing ${token}`);
}

if (!archiveBoard.includes("getArchiveRows")) {
  issues.push("archive-board.js: archive rows must come from workspace adapters");
}

if (!settingsSheet.includes("getProviderRows")) {
  issues.push("settings-sheet.js: provider rows must come from workspace adapters");
}

if (archiveBoard.includes("runtime-fixtures")) {
  issues.push("archive-board.js: archive board must not import isolated runtime fixtures");
}

if (settingsSheet.includes("providers.js")) {
  issues.push("settings-sheet.js: settings sheet must not import isolated provider fixtures directly");
}

for (const token of [
  "contracts",
  "redaction",
  "mock-snapshot",
  "memory-repository",
  "local-draft-repository",
  "database-schema",
  "database-repository",
  "memory-database-client",
]) {
  if (!barrel.includes(token)) issues.push(`index.ts: missing export for ${token}`);
}

const combinedStorageSource = [
  contracts,
  redaction,
  snapshot,
  memoryRepository,
  databaseSchema,
  databaseRepository,
  memoryDatabaseClient,
  barrel,
  staticSnapshot,
  staticAdapters,
].join("\n");
for (const forbidden of ["fetch(", "XMLHttpRequest", "axios", "localStorage", "sessionStorage", "writeFile", "readFile"]) {
  if (combinedStorageSource.includes(forbidden)) {
    issues.push(`storage layer must not perform side effects or network calls (${forbidden})`);
  }
}

for (const forbidden of ["fetch(", "XMLHttpRequest", "axios", "sessionStorage", "writeFile", "readFile", "generateImage(", "healthCheck("]) {
  if ([localDraftRepository, localDraftStore].join("\n").includes(forbidden)) {
    issues.push(`local draft persistence must not perform network, provider, or file side effects (${forbidden})`);
  }
}

if (contracts.includes("apiKey:")) {
  issues.push("contracts.ts: persisted provider config must not define a clear-text apiKey field");
}

if (!snapshot.includes("containsUnredactedSecret(snapshot)")) {
  issues.push("mock-snapshot.ts: mock snapshot must verify secret redaction");
}

if (issues.length > 0) {
  console.error("Storage contract checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Storage contract checks passed.");
