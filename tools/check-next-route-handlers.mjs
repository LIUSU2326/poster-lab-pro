import { readFileSync } from "node:fs";

const issues = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required Next route handler file`);
    return "";
  }
}

const service = read("src/api/next-service.ts");
const response = read("src/api/next-response.ts");
const routes = {
  workspaceLoad: read("app/api/workspaces/[workspaceId]/route.ts"),
  workspaceSave: read("app/api/workspaces/[workspaceId]/snapshot/route.ts"),
  prompts: read("app/api/workspaces/[workspaceId]/prompts/route.ts"),
  providerRequests: read("app/api/workspaces/[workspaceId]/provider-requests/route.ts"),
  providerCredentials: read("app/api/workspaces/[workspaceId]/provider-credentials/[providerId]/route.ts"),
  providerConnectionTest: read("app/api/workspaces/[workspaceId]/provider-credentials/[providerId]/connection-test/route.ts"),
  queuePlans: read("app/api/workspaces/[workspaceId]/queue-plans/route.ts"),
  queuePlanRun: read("app/api/workspaces/[workspaceId]/queue-plans/[jobId]/run/route.ts"),
  queuePlanLiveTest: read("app/api/workspaces/[workspaceId]/queue-plans/[jobId]/live-test/route.ts"),
  assetLibrary: read("app/api/workspaces/[workspaceId]/assets/route.ts"),
  assetUploadPlan: read("app/api/workspaces/[workspaceId]/assets/upload-plan/route.ts"),
  assetBinaryUpload: read("app/api/workspaces/[workspaceId]/assets/upload-binary/route.ts"),
  resultDelete: read("app/api/workspaces/[workspaceId]/results/[resultId]/route.ts"),
  resultDownload: read("app/api/workspaces/[workspaceId]/results/[resultId]/download/route.ts"),
};

for (const token of ["createLocalApiService", "createJsonFileWorkspaceRepository", "createMockWorkspaceSnapshot"]) {
  if (!service.includes(token)) issues.push(`next-service.ts: missing ${token}`);
}
for (const token of ["createManualLiveGenerationService", "nextManualLiveGenerationService", "createOpenAIImageFetchTransport"]) {
  if (!service.includes(token)) issues.push(`next-service.ts: missing ${token}`);
}

for (const token of ["NextResponse", "statusForEnvelope", "jsonEnvelope", "readJsonBody", "routeWorkspaceId"]) {
  if (!response.includes(token)) issues.push(`next-response.ts: missing ${token}`);
}

const routeExpectations = [
  ["workspaceLoad", "loadWorkspaceSnapshot", "nextLocalApiService"],
  ["workspaceSave", "saveWorkspaceSnapshot", "nextLocalApiService"],
  ["prompts", "createPromptPackage", "nextLocalApiService"],
  ["providerRequests", "mapProviderRequest", "nextLocalApiService"],
  ["providerCredentials", "getProviderCredentialStatus", "nextLocalApiService"],
  ["providerCredentials", "saveProviderCredential", "nextLocalApiService"],
  ["providerCredentials", "deleteProviderCredential", "nextLocalApiService"],
  ["providerConnectionTest", "testProviderConnection", "nextProviderDiagnosticService"],
  ["queuePlans", "createQueuePlan", "nextLocalApiService"],
  ["queuePlanRun", "runQueuePlan", "nextLocalApiService"],
  ["queuePlanLiveTest", "runManualLiveGenerationTest", "nextManualLiveGenerationService"],
  ["assetLibrary", "listWorkspaceAssets", "nextLocalApiService"],
  ["assetLibrary", "commitAssetRecord", "nextLocalApiService"],
  ["assetUploadPlan", "createAssetUploadPlan", "nextLocalApiService"],
  ["resultDelete", "deleteResult", "nextLocalApiService"],
  ["resultDownload", "describeResultDownload", "nextLocalApiService"],
];

for (const [routeName, methodName, serviceName] of routeExpectations) {
  const route = routes[routeName];
  if (!route.includes(serviceName)) issues.push(`${routeName}: must delegate to ${serviceName}`);
  if (!route.includes(methodName)) issues.push(`${routeName}: missing service method ${methodName}`);
  if (!route.includes("jsonEnvelope")) issues.push(`${routeName}: must return jsonEnvelope`);
}

if (!routes.assetBinaryUpload.includes("writeLocalAssetBinary")) {
  issues.push("assetBinaryUpload: must delegate binary persistence to writeLocalAssetBinary");
}
if (!routes.assetBinaryUpload.includes("formData")) {
  issues.push("assetBinaryUpload: must parse multipart form data");
}
if (!routes.assetBinaryUpload.includes("jsonEnvelope")) {
  issues.push("assetBinaryUpload: must return jsonEnvelope");
}

for (const [routeName, route] of Object.entries(routes)) {
  for (const forbidden of ["generateImage(", "healthCheck(", "api.openai.com", "localStorage", "sessionStorage", "writeFile", "readFile"]) {
    if (route.includes(forbidden)) {
      issues.push(`${routeName}: route handler must not call live providers, browser storage, or filesystem (${forbidden})`);
    }
  }
}

if (issues.length > 0) {
  console.error("Next route handler checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Next route handler checks passed.");
