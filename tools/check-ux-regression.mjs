import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

const issues = [];
const root = process.cwd();

function assert(condition, message) {
  if (!condition) issues.push(message);
}

function includes(html, token, label) {
  assert(html.includes(token), `${label}: missing "${token}"`);
}

function excludes(html, token, label) {
  assert(!html.includes(token), `${label}: should not include "${token}"`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const removedVisibleTokens = [
  "live-gate",
  "manual-live",
  "run-manual-live-test",
  "data-live-toggle",
  "data-live-cost-cap",
  "topbar-meta",
  "bundle-path",
  "APP_VERSION",
  "APP_BUNDLE_HINT",
  "APP_MAIN_BRANCH",
  "release/mac/Poster Lab Pro.app",
  "MANUAL CHECK",
  "\u771f\u5b9e\u751f\u6210",
  "\u786e\u8ba4\u771f\u5b9e\u751f\u6210\u4fdd\u62a4",
  "\u624b\u52a8\u9a8c\u8bc1",
  "\u8fd8\u6ca1\u6709\u53ef\u5c55\u793a",
  "\u6536\u8d77\u6587\u6848",
  "task-slim-cue",
  'data-view="results"',
  'data-action="toggle-task-panel"',
  "task-detail-panel",
  "queue-context",
  "Result Quality Audit",
  "result-quality-panel",
  "result-quality-pill",
];

function assertRemovedTokens(html, label) {
  for (const token of removedVisibleTokens) {
    excludes(html, token, label);
  }
}

function makeEmptySnapshot(baseSnapshot, mode) {
  return {
    ...clone(baseSnapshot),
    activeMode: mode,
    metadata: {
      ...baseSnapshot.metadata,
      revision: 112,
      updatedAt: "2026-06-05T00:00:00.000Z",
    },
    schemes: [],
    results: [],
    archiveRows: [],
    queuePlans: [],
    queueSummaries: [],
  };
}

function resetState({
  state,
  setRuntimeWorkspaceSnapshot,
  workspaceSnapshot,
  mode = "poster",
  apiMode = "static",
  source = "static",
  snapshot = null,
}) {
  state.theme = "light";
  state.view = "schemes";
  state.copyVisible = true;
  state.activeMode = mode;
  state.selectedScheme = "";
  state.selectedSchemeVariants = {};
  state.selectedResult = "";
  state.selectedResultUserSet = false;
  state.schemeDeleteConfirmId = "";
  state.resultDeleteConfirmId = "";
  state.resultFilter = "all";
  state.archiveSelection = [];
  state.resultViewerOpen = false;
  state.taskOpen = false;
  state.settingsOpen = false;
  state.generationChoiceOpen = false;
  state.apiMode = apiMode;
  state.assetOperation = null;
  state.submission = null;
  state.resultOperation = null;
  state.resultOperations = [];
  state.leftCollapsed = false;
  setRuntimeWorkspaceSnapshot(snapshot || clone(workspaceSnapshot), source);
  state.activeMode = mode;
  state.apiMode = apiMode;
}

async function run() {
  const resultOperationClient = readFileSync(path.join(root, "src/result-operation-client.js"), "utf8");
  excludes(resultOperationClient, 'state.view = "results"', "result operation client");

  const modulePath = (filePath) => pathToFileURL(path.join(root, filePath)).href;
  const { workspaceSnapshot } = await import(modulePath("src/data/workspace-snapshot.js"));
  const { modeSpecs } = await import(modulePath("src/data/modes.js"));
  const {
    state,
    setRuntimeWorkspaceSnapshot,
    getActiveMode,
  } = await import(modulePath("src/state.js"));
  const { renderShell } = await import(modulePath("src/render/shell.js"));
  const { renderCenterBoard } = await import(modulePath("src/render/center-board.js"));
  const { renderSettingsSheet } = await import(modulePath("src/render/settings-sheet.js"));

  for (const mode of ["poster", "icon", "logo", "announcement", "collab"]) {
    resetState({ state, setRuntimeWorkspaceSnapshot, workspaceSnapshot, mode });
    const shell = renderShell(getActiveMode(), null);
    const label = `${mode} shell`;
    includes(shell, `mode-${mode}`, label);
    includes(shell, 'data-view="schemes"', label);
    includes(shell, 'data-view="archive"', label);
    includes(shell, 'data-action="open-settings"', label);
    includes(shell, 'data-action="toggle-theme"', label);
    includes(shell, 'data-action="generate-schemes"', label);
    includes(shell, 'data-action="simulate-asset-upload"', label);
    assertRemovedTokens(shell, label);
  }

  const emptySnapshot = makeEmptySnapshot(workspaceSnapshot, "poster");
  resetState({
    state,
    setRuntimeWorkspaceSnapshot,
    workspaceSnapshot,
    mode: "poster",
    apiMode: "http",
    source: "http",
    snapshot: emptySnapshot,
  });
  state.view = "schemes";
  const emptySchemes = renderCenterBoard(modeSpecs.poster, null);
  assertRemovedTokens(emptySchemes, "empty scheme board");

  state.view = "results";
  const removedResultsView = renderCenterBoard(modeSpecs.poster, null);
  excludes(removedResultsView, "result-board", "removed result board");
  assertRemovedTokens(removedResultsView, "removed result board");

  state.settingsOpen = true;
  const settings = renderSettingsSheet();
  includes(settings, "settings-layer", "settings sheet");
  includes(settings, "provider-config-sheet", "settings sheet");
  includes(settings, 'data-action="save-provider-key"', "settings sheet");
  includes(settings, 'data-action="test-provider-connection"', "settings sheet");
  includes(settings, 'data-action="test-provider-route-plan"', "settings sheet");
  assertRemovedTokens(settings, "settings sheet");

  state.settingsOpen = false;
  state.taskOpen = true;
  const taskShell = renderShell(getActiveMode(), null);
  excludes(taskShell, "task-detail-panel", "removed task panel");
  excludes(taskShell, "queue-context", "removed task panel");
  assertRemovedTokens(taskShell, "removed task panel");
}

await run();

if (issues.length > 0) {
  console.error("UX regression checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("UX regression checks passed.");
