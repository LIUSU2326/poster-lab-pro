const issues = [];

const [{ getRuntimeWorkspaceSnapshot, setRuntimeWorkspaceSnapshot, state }, { submitGenerationDraft }] = await Promise.all([
  import("../src/state.js"),
  import("../src/form-binding.js"),
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function resetSubmission(snapshot) {
  setRuntimeWorkspaceSnapshot(clone(snapshot), "static");
  state.activeMode = "poster";
  state.selectedScheme = "";
  state.provider = "openai";
  state.apiMode = "static";
  state.submission = null;
}

const originalSnapshot = clone(getRuntimeWorkspaceSnapshot());

state.activeMode = "poster";
state.selectedScheme = "";
state.provider = "openai";
state.apiMode = "static";
state.submission = null;

const submission = await submitGenerationDraft();

if (!submission) issues.push("submitGenerationDraft did not return a submission");
if (submission?.status !== "service-ready") {
  issues.push(`expected service-ready submission status, received ${submission?.status}`);
}
if (!submission?.serviceFlow?.ok) issues.push("serviceFlow did not finish with ok=true");
if (submission?.serviceFlow?.savedSnapshot?.ok !== true) issues.push("savedSnapshot envelope failed");
if (submission?.serviceFlow?.promptPackageCreate?.ok !== true) issues.push("promptPackageCreate envelope failed");
if (submission?.serviceFlow?.providerRequestMap?.ok !== true) issues.push("providerRequestMap envelope failed");
if (submission?.serviceFlow?.queuePlanCreate?.ok !== true) issues.push("queuePlanCreate envelope failed");

const promptPackage = submission?.serviceFlow?.promptPackageCreate?.data?.promptPackage;
if (!promptPackage?.finalPrompt?.includes("Project Context")) {
  issues.push("prompt package finalPrompt is missing Project Context");
}

const mappedRequest = submission?.serviceFlow?.providerRequestMap?.data?.mappedRequest;
if (mappedRequest?.kind !== "imageGeneration") {
  issues.push(`expected imageGeneration mapped request, received ${mappedRequest?.kind}`);
}

const queueSummary = submission?.serviceFlow?.queuePlanCreate?.data?.summary;
if (!queueSummary || queueSummary.total < 3) {
  issues.push("queue summary is missing or has too few tasks");
}

if (submission?.promptPackageCreate?.routeId !== "prompt.package.create") {
  issues.push("submission prompt route id drifted");
}
if (submission?.queuePlanCreate?.routeId !== "queue.plan.create") {
  issues.push("submission queue route id drifted");
}

const promptAssetResult = submission?.validation?.results?.find((item) => item.name === "promptAssets");
if (!promptAssetResult?.ok) {
  issues.push("valid static fixture submission should pass promptAssets preflight");
}

const missingLogoSnapshot = clone(originalSnapshot);
missingLogoSnapshot.assets = missingLogoSnapshot.assets.filter((asset) => asset.role !== "gameLogo");
await resetSubmission(missingLogoSnapshot);
const missingLogoSubmission = await submitGenerationDraft();
if (missingLogoSubmission?.status !== "invalid") {
  issues.push(`missing gameLogo should produce invalid submission, received ${missingLogoSubmission?.status}`);
}
if (missingLogoSubmission?.serviceFlow?.reason !== "validation_failed") {
  issues.push("missing required asset should skip service flow execution");
}
const missingLogoResult = missingLogoSubmission?.validation?.results?.find((item) => item.name === "promptAssets");
if (missingLogoResult?.ok !== false || !missingLogoResult.issues?.some((issue) => issue.path.includes("gameLogo"))) {
  issues.push("missing gameLogo should surface a promptAssets validation issue");
}

const blobSnapshot = clone(originalSnapshot);
blobSnapshot.assets = blobSnapshot.assets.map((asset) => (
  asset.role === "gameCharacter"
    ? { ...asset, previewUrl: "blob:http://localhost/asset-game-character" }
    : asset
));
await resetSubmission(blobSnapshot);
const blobSubmission = await submitGenerationDraft();
if (blobSubmission?.status !== "invalid") {
  issues.push(`blob-only required asset should produce invalid submission, received ${blobSubmission?.status}`);
}
const blobResult = blobSubmission?.validation?.results?.find((item) => item.name === "promptAssets");
if (blobResult?.ok !== false || !blobResult.issues?.some((issue) => issue.message.includes("provider-unsafe"))) {
  issues.push("blob-only required asset should surface a provider-unsafe promptAssets issue");
}

await resetSubmission(originalSnapshot);

if (issues.length > 0) {
  console.error("Static service flow checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Static service flow checks passed.");
