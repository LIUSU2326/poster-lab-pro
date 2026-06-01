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
const centerBoard = read("src/render/center-board.js");
const configPanel = read("src/render/config-panel.js");
const taskChrome = read("src/render/task-chrome.js");
const workspaceSnapshot = read("src/data/workspace-snapshot.js");
const stateSource = read("src/state.js");
const resultManagementClient = read("src/result-management-client.js");
const styles = read("styles.css");

for (const token of [
  "createBoundWorkspaceSnapshot",
  "validateBoundFrontendForms",
  "buildPromptPackageCreateSubmission",
  "buildQueuePlanCreateSubmission",
  "submitGenerationDraft",
  "validatePromptAssetReadiness",
  "isProviderSafeAssetUrl",
  "outputOverrides",
  "sourceResultId",
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
  ".scheme-card[data-scheme-id]",
  "data-result-filter",
  "goto-result-scheme",
  'action === "regenerate-result"',
  "deleteResultForWorkbench",
  'action === "delete-result"',
  "resultDeleteConfirmId",
]) {
  if (!events.includes(token)) issues.push(`events.js: missing result recovery token ${token}`);
}

for (const token of [
  "deleteResultForWorkbench",
  "deleteJson",
  "DELETE",
  "/results/",
  "removeResultReferences",
  "archiveRows",
  "setRuntimeWorkspaceSnapshot",
]) {
  if (!resultManagementClient.includes(token)) issues.push(`result-management-client.js: missing ${token}`);
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

if (!topbar.includes('data-action="submit-generation"')) {
  issues.push("topbar.js: image generation button must use submit-generation action");
}

for (const token of [
  'data-view="results"',
  "selected-render-button",
  "getSelectedRenderableScheme",
  "data-scheme-id",
  "run-mode-chip",
  "liveGate.estimatedCostLabel",
  "liveGate.costSummaryLabel",
]) {
  if (!topbar.includes(token)) issues.push(`topbar.js: missing current-result workflow token ${token}`);
}

for (const token of [
  'state.view === "results"',
  "renderResultBoard",
  "result-board",
  "renderResultFilters",
  "resultMatchesFilter",
  "goto-result-scheme",
  "regenerate-result",
  "重生成片",
  "确认删除",
  'data-action="delete-result"',
]) {
  if (!centerBoard.includes(token)) issues.push(`center-board.js: missing result view token ${token}`);
}

if (!events.includes('nextView === "results"')) {
  issues.push("events.js: data-view handler must support the results view");
}
if (!stateSource.includes('view === "results"') || !stateSource.includes('state.view = "results"')) {
  issues.push("state.js: URL view handling must preserve results view");
}
if (!stateSource.includes("resultDeleteConfirmId")) {
  issues.push("state.js: missing result delete confirmation state");
}

for (const token of [
  "repeat(3, minmax(68px, 1fr))",
  ".top-actions .selected-render-button",
  ".result-filter-tabs",
  ".result-quick-actions a",
  ".result-status.failed",
  ".top-actions .run-mode-chip",
  ".top-actions .run-mode-chip.live",
  ".top-actions .run-mode-chip.test",
  ".result-quick-actions button.danger",
  ".result-quick-actions button.danger.confirming",
  ".result-viewer-dock button.danger",
  ".result-viewer-dock button.danger.confirming",
]) {
  if (!styles.includes(token)) issues.push(`styles.css: missing result/current render UI token ${token}`);
}

if (!configPanel.includes('data-action="generate-schemes"')) {
  issues.push("config-panel.js: left batch button must use generate-schemes action");
}

for (const removedToken of ["submission-card compact", "formatValidationIssues", "formatServiceQueue", "task-stats", "queue-list", "data-action=\"toggle-task\""]) {
  if (taskChrome.includes(removedToken)) issues.push(`task-chrome.js: removed details drawer token should stay absent: ${removedToken}`);
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
