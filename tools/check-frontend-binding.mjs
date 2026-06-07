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

function requireTokens(fileName, source, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) issues.push(`${fileName}: missing ${token}`);
  }
}

function forbidTokens(fileName, source, tokens) {
  for (const token of tokens) {
    if (source.includes(token)) issues.push(`${fileName}: removed UI token should stay absent (${token})`);
  }
}

const binding = read("src/form-binding.js");
const events = read("src/events.js");
const topbar = read("src/render/topbar.js");
const centerBoard = read("src/render/center-board.js");
const configPanel = read("src/render/config-panel.js");
const taskChrome = read("src/render/task-chrome.js");
const settingsSheet = read("src/render/settings-sheet.js");
const resultOperationClient = read("src/result-operation-client.js");
const stateSource = read("src/state.js");
const styles = read("styles.css");

requireTokens("form-binding.js", binding, [
  "createBoundWorkspaceSnapshot",
  "validateBoundFrontendForms",
  "buildPromptPackageCreateSubmission",
  "buildQueuePlanCreateSubmission",
  "submitGenerationDraft",
  "runHttpGenerationServiceFlow",
  "runStaticGenerationServiceFlow",
  "prompt.package.create",
  "queue.plan.create",
]);

requireTokens("events.js", events, [
  "submitGenerationDraft",
  'action === "submit-generation"',
  'action === "generate-schemes"',
  'action === "regenerate-result"',
  "runResultOperationForWorkbench",
]);

requireTokens("topbar.js", topbar, [
  'data-action="submit-generation"',
  'data-action="open-settings"',
  'data-action="toggle-copy"',
  "\u6587\u6848",
  "theme-switch",
  "selected-render-button",
  "generate-primary",
]);

requireTokens("center-board.js", centerBoard, [
  "renderSchemeBoardEmpty",
  "renderResultViewer",
  "open-result-viewer",
  "resolveResultOperationRoute",
  "is-unsupported-route",
]);

requireTokens("config-panel.js", configPanel, [
  'data-action="generate-schemes"',
  "renderModelRoutingSummary",
  "providerCapabilityGateUserMessage",
]);

requireTokens("task-chrome.js", taskChrome, [
  "renderQueueContext",
  "renderResultOperationContext",
  "queue-context",
]);

requireTokens("settings-sheet.js", settingsSheet, [
  "provider-config-sheet",
  "provider-credential-card",
  "model-routing",
]);

requireTokens("state.js", stateSource, [
  "resultViewerOpen",
  "resultDeleteConfirmId",
]);

requireTokens("styles.css", styles, [
  ".top-actions .selected-render-button",
  ".result-viewer",
  ".preview-icon-action",
  ".result-operation-context",
]);

if (resultOperationClient.includes("fallback")) {
  issues.push("result-operation-client.js: result operations should not silently fallback to another provider");
}

const removedUiTokens = [
  "getLiveGateViewModel",
  "getManualLiveTestViewModel",
  "runManualLiveTestForWorkbench",
  "liveGate",
  "manualLiveTest",
  "live-gate",
  "manual-live",
  "run-manual-live-test",
  "data-live-toggle",
  "data-live-cost-cap",
  "\u771f\u5b9e\u751f\u6210",
  "\u786e\u8ba4\u771f\u5b9e\u751f\u6210\u4fdd\u62a4",
  "\u624b\u52a8\u9a8c\u8bc1",
  "MANUAL CHECK",
  "topbar-meta",
  "bundle-path",
  "APP_VERSION",
  "APP_BUNDLE_HINT",
  "APP_MAIN_BRANCH",
  "release/mac/Poster Lab Pro.app",
  "\u8fd8\u6ca1\u6709\u53ef\u5c55\u793a",
  "task-slim-cue",
  'data-view="results"',
  "renderResultQualityPill",
  "renderResultQualityPanel",
  "Result Quality Audit",
];

for (const [name, source] of [
  ["topbar.js", topbar],
  ["center-board.js", centerBoard],
  ["config-panel.js", configPanel],
  ["task-chrome.js", taskChrome],
  ["settings-sheet.js", settingsSheet],
  ["events.js", events],
  ["form-binding.js", binding],
  ["result-operation-client.js", resultOperationClient],
  ["state.js", stateSource],
]) {
  forbidTokens(name, source, removedUiTokens);
}

if (issues.length > 0) {
  console.error("Frontend binding checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Frontend binding checks passed.");
