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
const staticWorkbenchBridge = read("src/react/StaticWorkbenchBridge.tsx");
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
  "setResultViewerMessage",
  "bindWorkbenchFormSubmissionGuard",
  "event.preventDefault()",
  "refreshSettingsLayer(render)",
  "selectAdjacentResult",
  "ArrowLeft",
  "ArrowRight",
  "data-scheme-render-count",
  "getSchemeRenderCountForSubmit",
  "imagesPerScheme",
  "markStableRefreshSurface",
]);

const imageCopyHandler = events.match(/function bindResultViewerImageCopy\(\) \{[\s\S]*?\r?\n\}\r?\n\r?\nfunction setResultViewerMessage/);
if (!imageCopyHandler) {
  issues.push("events.js: image copy handler should update viewer copy state without rebuilding the workbench");
} else if (imageCopyHandler[0].includes("render(")) {
  issues.push("events.js: right-click image copy must not call render(), because it rebuilds the large-image viewer during contextmenu");
}

if (!/outputOverrides:\s*\{\s*imagesPerScheme:\s*getSchemeRenderCountForSubmit\(control\.dataset\.schemeId\)/s.test(events)) {
  issues.push("events.js: scheme-card image count selector must feed outputOverrides.imagesPerScheme for single-scheme generation");
}

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
	  "二次精修",
	  "data-copy-result-image",
	  "data-result-refinement-prompt",
	  'data-action="confirm-result-refinement"',
	  "renderSchemeRenderCountControl",
	  "renderSchemeResultStrip",
	]);

requireTokens("config-panel.js", configPanel, [
  'data-action="generate-schemes"',
  'data-action="clear-workbench"',
  'data-form-choice="outputSettings.imagesPerScheme"',
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
  'type="button"',
]);

requireTokens("state.js", stateSource, [
  "resultViewerOpen",
  "resultDeleteConfirmId",
  "resultRefinementOpen",
  "resultViewerMessage",
  "schemeRenderCounts",
]);

requireTokens("styles.css", styles, [
  ".top-actions .selected-render-button",
  ".result-viewer",
  ".preview-icon-action",
  ".result-operation-context",
  ".result-refinement-panel",
  ".scheme-render-count",
  ".scheme-result-strip",
  "data-stable-refresh",
  ".style-library-panel .style-library-option:nth-child(9n + 1)",
]);

requireTokens("StaticWorkbenchBridge.tsx", staticWorkbenchBridge, [
  'target?.closest(".config-scroll")',
  "dataset.stableRefresh",
  'host.addEventListener("change", preserveConfigScrollFromEvent, true)',
  'host.addEventListener("keydown", preserveConfigScrollFromEvent, true)',
]);

if (staticWorkbenchBridge.includes('closest("[data-rhf-assets-section]")')) {
  issues.push("StaticWorkbenchBridge.tsx: config scroll preservation must cover the full config panel, not only the assets section");
}

requireTokens("result-operation-client.js", resultOperationClient, [
  "editInstruction",
  "sourceResultOutputLock",
  "clampOperationDimension",
  "customSize: { width, height }",
  "aspectRatios: [`${width}x${height}`]",
  'selectionMode: "custom-size"',
  "...sourceOutputLock",
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
