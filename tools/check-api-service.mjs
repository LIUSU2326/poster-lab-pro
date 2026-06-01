import { readFileSync } from "node:fs";

const issues = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required local API service file`);
    return "";
  }
}

const service = read("src/api/service.ts");
const barrel = read("src/api/index.ts");

for (const token of [
  "createLocalApiService",
  "createApiMeta",
  "WorkspaceSnapshotLoadRequestSchema",
  "WorkspaceSnapshotSaveRequestSchema",
  "PromptPackageCreateApiRequestSchema",
  "ProviderRequestMapApiRequestSchema",
  "ProviderCredentialStatusApiRequestSchema",
  "ProviderCredentialSaveApiRequestSchema",
  "ProviderCredentialDeleteApiRequestSchema",
  "QueuePlanCreateApiRequestSchema",
  "QueuePlanRunApiRequestSchema",
  "AssetUploadPlanApiRequestSchema",
  "AssetCommitApiRequestSchema",
  "AssetListApiRequestSchema",
  "ResultDownloadDescribeApiRequestSchema",
  "createPromptPackage",
  "mapPromptPackageToProviderRequest",
  "createBatchQueuePlan",
  "summarizeQueue",
  "createWorkspaceQueueWorker",
  "createAssetLibraryService",
  "createResultDownloadDescriptor",
  "createMemoryDraftRepository",
]) {
  if (!service.includes(token)) issues.push(`service.ts: missing ${token}`);
}

for (const method of [
  "loadWorkspaceSnapshot",
  "saveWorkspaceSnapshot",
  "createPromptPackage",
  "mapProviderRequest",
  "getProviderCredentialStatus",
  "saveProviderCredential",
  "deleteProviderCredential",
  "createQueuePlan",
  "runQueuePlan",
  "createAssetUploadPlan",
  "commitAssetRecord",
  "listWorkspaceAssets",
  "describeResultDownload",
]) {
  if (!service.includes(method)) issues.push(`service.ts: missing local API method ${method}`);
}

for (const schema of [
  "WorkspaceSnapshotLoadResponseSchema",
  "WorkspaceSnapshotSaveResponseSchema",
  "PromptPackageCreateApiResponseSchema",
  "ProviderRequestMapApiResponseSchema",
  "ProviderCredentialStatusApiResponseSchema",
  "ProviderCredentialSaveApiResponseSchema",
  "ProviderCredentialDeleteApiResponseSchema",
  "QueuePlanCreateApiResponseSchema",
  "QueuePlanRunApiResponseSchema",
  "AssetUploadPlanApiResponseSchema",
  "AssetCommitApiResponseSchema",
  "AssetListApiResponseSchema",
  "ResultDownloadDescribeApiResponseSchema",
]) {
  if (!service.includes(schema)) issues.push(`service.ts: local API service must parse ${schema}`);
}

for (const forbidden of [
  "fetch(",
  "XMLHttpRequest",
  "axios",
  "localStorage",
  "sessionStorage",
  "writeFile",
  "readFile",
  "generateImage(",
  "healthCheck(",
  "api.openai.com",
]) {
  if (service.includes(forbidden)) {
    issues.push(`service.ts: local API service must not call network, browser storage, filesystem, or live providers (${forbidden})`);
  }
}

if (!barrel.includes("service")) {
  issues.push("index.ts: missing service export");
}

if (issues.length > 0) {
  console.error("Local API service checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Local API service checks passed.");
