import { readFileSync } from "node:fs";

const issues = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required API contract file`);
    return "";
  }
}

const contracts = read("src/api/contracts.ts");
const barrel = read("src/api/index.ts");

for (const token of [
  "ApiRouteIdSchema",
  "ApiEnvelopeMetaSchema",
  "ApiErrorSchema",
  "ApiFailureEnvelopeSchema",
  "WorkspaceSnapshotLoadRequestSchema",
  "WorkspaceSnapshotSaveRequestSchema",
  "PromptPackageCreateApiRequestSchema",
  "ProviderRequestMapApiRequestSchema",
  "ProviderCredentialStatusApiRequestSchema",
  "ProviderCredentialSaveApiRequestSchema",
  "ProviderCredentialDeleteApiRequestSchema",
  "ProviderConnectionTestApiRequestSchema",
  "ProviderConnectionTestApiResponseSchema",
  "QueuePlanCreateApiRequestSchema",
  "QueuePlanRunApiRequestSchema",
  "AssetUploadPlanApiRequestSchema",
  "AssetBinaryUploadApiRequestSchema",
  "AssetCommitApiRequestSchema",
  "AssetListApiRequestSchema",
  "ResultDownloadDescribeApiRequestSchema",
  "ResultDownloadDescribeApiResponseSchema",
  "ResultDeleteApiRequestSchema",
  "ResultDeleteApiResponseSchema",
  "apiRouteContracts",
  "getApiRouteContract",
]) {
  if (!contracts.includes(token)) issues.push(`contracts.ts: missing ${token}`);
}

for (const routeId of [
  "workspace.snapshot.load",
  "workspace.snapshot.save",
  "prompt.package.create",
  "provider.request.map",
  "provider.credential.status",
  "provider.credential.save",
  "provider.credential.delete",
  "provider.connection.test",
  "queue.plan.create",
  "queue.plan.run",
  "asset.upload.plan",
  "asset.binary.upload",
  "asset.record.commit",
  "asset.library.list",
  "result.download.describe",
  "result.delete",
]) {
  if (!contracts.includes(routeId)) issues.push(`contracts.ts: missing route id ${routeId}`);
}

for (const schema of [
  "WorkspaceSnapshotSchema",
  "WorkspaceSnapshotSummarySchema",
  "PromptBuilderInputSchema",
  "PromptPackageSchema",
  "ProviderRequestMapperInputSchema",
  "ProviderMappedRequestSchema",
  "ProviderCredentialVaultStatusSchema",
  "ProviderConnectionTestResultSchema",
  "QueuePlanSchema",
  "QueueSummarySchema",
  "WorkspaceQueueWorkerInputSchema",
  "WorkspaceQueueWorkerResultSchema",
  "AssetUploadPlanResultSchema",
  "AssetBinaryUploadResultSchema",
  "AssetCommitResultSchema",
  "AssetListResultSchema",
  "ResultDownloadDescriptorSchema",
]) {
  if (!contracts.includes(schema)) issues.push(`contracts.ts: API layer must reuse ${schema}`);
}

for (const forbidden of [
  "fetch(",
  "XMLHttpRequest",
  "axios",
  "localStorage",
  "sessionStorage",
  "createServer",
  "app.",
  "router.",
  "generateBrief(",
  "generateImage(",
  "healthCheck(",
  "saveSnapshot(",
  "loadSnapshot(",
  "writeFile",
  "readFile",
]) {
  if (contracts.includes(forbidden)) {
    issues.push(`contracts.ts: API contract layer must not execute routes, network calls, providers, or storage (${forbidden})`);
  }
}

if (!barrel.includes("contracts")) {
  issues.push("index.ts: missing contracts export");
}

for (const removed of ["QueuePlanManualLiveTest", "queue.plan.live.test", "manual-live-generation"]) {
  if (contracts.includes(removed) || barrel.includes(removed)) {
    issues.push(`manual live-test API contract should be removed (${removed})`);
  }
}

if (issues.length > 0) {
  console.error("API contract checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("API contract checks passed.");
