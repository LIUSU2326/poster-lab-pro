import { readFileSync } from "node:fs";

const issues = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required frontend binding file`);
    return "";
  }
}

const binding = read("src/form-binding.js");
const staticService = read("src/static-local-api-service.js");
const events = read("src/events.js");
const topbar = read("src/render/topbar.js");
const configPanel = read("src/render/config-panel.js");
const taskChrome = read("src/render/task-chrome.js");
const workspaceSnapshot = read("src/data/workspace-snapshot.js");

for (const token of [
  "createBoundWorkspaceSnapshot",
  "validateBoundFrontendForms",
  "buildPromptPackageCreateSubmission",
  "buildQueuePlanCreateSubmission",
  "submitGenerationDraft",
  "validatePromptAssetReadiness",
  "isProviderSafeAssetUrl",
  "promptAssets",
  "runStaticGenerationServiceFlow",
  "setRuntimeWorkspaceSnapshot",
  "prompt.package.create",
  "queue.plan.create",
  "modeAssetRequirements",
  "validateProjectBriefForm",
  "validateOutputSettingsForm",
  "validateSloganSettingsForm",
  "validateModeForm",
]) {
  if (!binding.includes(token)) issues.push(`form-binding.js: missing ${token}`);
}

if (!events.includes("submitGenerationDraft")) {
  issues.push("events.js: submit-generation action must call submitGenerationDraft");
}

for (const token of [
  "createStaticLocalApiService",
  "runStaticGenerationServiceFlow",
  "saveWorkspaceSnapshot",
  "createPromptPackage",
  "mapProviderRequest",
  "createQueuePlan",
  "promptPackageCreate",
  "providerRequestMap",
  "queuePlanCreate",
]) {
  if (!staticService.includes(token)) issues.push(`static-local-api-service.js: missing ${token}`);
}

for (const file of [
  ["topbar.js", topbar],
  ["config-panel.js", configPanel],
]) {
  if (!file[1].includes('data-action="submit-generation"')) {
    issues.push(`${file[0]}: primary generation button must use submit-generation action`);
  }
}

for (const token of ["state.submission", "submission-card compact", "formatValidationIssues", "formatServiceQueue", "task-stats", "queue-list"]) {
  if (!taskChrome.includes(token)) issues.push(`task-chrome.js: missing submission feedback token ${token}`);
}

if (!workspaceSnapshot.includes("modeForm")) {
  issues.push("workspace-snapshot.js: static mode states must include modeForm for API payload drafts");
}

if (!workspaceSnapshot.includes("platformPresetsByMode")) {
  issues.push("workspace-snapshot.js: static schemes must map to valid platform presets");
}

for (const forbidden of [
  "fetch(",
  "XMLHttpRequest",
  "axios",
  "localStorage",
  "sessionStorage",
  "generateImage(",
  "healthCheck(",
  "saveSnapshot(",
  "loadSnapshot(",
  "writeFile",
  "readFile",
]) {
  if ([binding, events, staticService].join("\n").includes(forbidden)) {
    issues.push(`frontend binding must not perform network, provider, DOM storage, or persistence side effects (${forbidden})`);
  }
}

if (issues.length > 0) {
  console.error("Frontend binding checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Frontend binding checks passed.");
