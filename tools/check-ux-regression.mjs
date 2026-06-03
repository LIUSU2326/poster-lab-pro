import { pathToFileURL } from "node:url";
import path from "node:path";

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

function makeModeState(snapshot, mode, patch = {}) {
  return (snapshot.modeStates || []).map((modeState) => (
    modeState.mode === mode
      ? {
          ...modeState,
          ...patch,
          outputSettings: {
            ...modeState.outputSettings,
            ...(patch.outputSettings || {}),
          },
        }
      : modeState
  ));
}

function makeRuntimeScheme(mode, id = `rc1-${mode}-scheme`) {
  return {
    id,
    projectId: "project-pizza-kitchen",
    mode,
    code: "RC1",
    title: `${mode} RC UX scheme`,
    brief: "RC UX generated scheme for interaction testing.",
    slogans: { "en-US": "Serve Up Victory" },
    promptBlocks: [
      { title: "English Prompt", text: "RC UX prompt keeps generated image actions available." },
    ],
    lockedFields: [],
    outputPresets: ["custom"],
    status: "ready",
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
  };
}

function makeRuntimeResult(mode, schemeId, id = `rc1-${mode}-result`) {
  return {
    id,
    projectId: "project-pizza-kitchen",
    schemeId,
    jobId: `job-${id}`,
    taskId: `task-${id}`,
    mode,
    width: mode === "icon" ? 1024 : 1920,
    height: mode === "icon" ? 1024 : 1080,
    platformPreset: "custom",
    language: "en-US",
    model: "ux-check-model",
    status: "ready",
    providerResultId: `provider-${id}`,
    thumbnailUrl: "",
    assetUrl: "",
    favorite: false,
    archivedAt: "2026-06-03T00:00:00.000Z",
    metadata: {
      resultFile: {
        storageKey: `generated-results/${id}.png`,
        mimeType: "image/png",
        byteSize: 123456,
      },
      qualityAudit: {
        version: "result-quality-audit.v1",
        summary: "review",
        findings: [
          {
            code: "poster-reference-integration-review",
            severity: "review",
            message: "Review uploaded asset integration.",
            recommendation: "Confirm the uploaded subject is integrated into the scene.",
          },
        ],
        metrics: {},
      },
    },
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
  };
}

function makeSnapshot(baseSnapshot, mode, options = {}) {
  const scheme = options.scheme || makeRuntimeScheme(mode);
  const result = options.result === false ? null : options.result || makeRuntimeResult(mode, scheme.id);
  const schemes = options.empty ? [] : [scheme];
  const results = options.empty || !result ? [] : [result];
  return {
    ...clone(baseSnapshot),
    activeMode: mode,
    metadata: {
      ...baseSnapshot.metadata,
      revision: options.revision || 110,
      updatedAt: "2026-06-03T00:00:00.000Z",
    },
    modeStates: makeModeState(baseSnapshot, mode, {
      selectedSchemeIds: schemes.map((item) => item.id),
      outputSettings: {
        schemeCount: Math.max(1, schemes.length || 1),
        imagesPerScheme: 1,
      },
    }),
    schemes,
    results,
    archiveRows: results.map((item) => ({
      id: `archive-${item.id}`,
      projectId: item.projectId,
      resultAssetId: item.id,
      title: `${mode} archive row`,
      mode,
      model: item.model,
      state: "editable",
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    queuePlans: options.queuePlans || [],
    queueSummaries: [],
  };
}

function resetState({ state, setRuntimeWorkspaceSnapshot, workspaceSnapshot, mode = "poster", apiMode = "static", source = "static", snapshot = null }) {
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
  state.liveGate = {
    enabled: false,
    maxAcceptedCost: 1,
    confirmations: {
      liveRun: false,
      providerCost: false,
      externalProvider: false,
      resultStorage: false,
    },
    runtimeCredentialReady: false,
    transportReady: false,
    resultStorageReady: true,
  };
  setRuntimeWorkspaceSnapshot(snapshot || clone(workspaceSnapshot), source);
  state.activeMode = mode;
  state.apiMode = apiMode;
}

async function run() {
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
    resetState({ state, setRuntimeWorkspaceSnapshot, workspaceSnapshot, mode, apiMode: "static", source: "static" });
    const shell = renderShell(getActiveMode(), null);
    const label = `${mode} static shell`;
    includes(shell, `mode-${mode}`, label);
    includes(shell, "data-view=\"schemes\"", label);
    includes(shell, "data-view=\"results\"", label);
    includes(shell, "data-view=\"archive\"", label);
    includes(shell, "data-action=\"open-settings\"", label);
    includes(shell, "live-gate-chip", label);
    includes(shell, "run-mode-chip", label);
    includes(shell, "data-action=\"toggle-theme\"", label);
    includes(shell, "v1.1.0-rc.4", label);
    includes(shell, "release/mac/Poster Lab Pro.app", label);
    includes(shell, "data-action=\"generate-schemes\"", label);
    includes(shell, "data-action=\"simulate-asset-upload\"", label);
  }

  const blockedSnapshot = makeSnapshot(workspaceSnapshot, "poster", { empty: true });
  resetState({
    state,
    setRuntimeWorkspaceSnapshot,
    workspaceSnapshot,
    mode: "poster",
    apiMode: "http",
    source: "http",
    snapshot: blockedSnapshot,
  });
  const blockedShell = renderShell(getActiveMode(), null);
  includes(blockedShell, "先开启并通过实机安全闸", "blocked live shell");
  includes(blockedShell, "打开实机安全闸", "blocked live shell");
  includes(blockedShell, "data-action=\"open-settings\"", "blocked live shell");
  assert(/data-action="generate-schemes"[\s\S]*?disabled/.test(blockedShell), "blocked live shell: generate schemes should be disabled");
  assert(/data-action="submit-generation"[\s\S]*?disabled/.test(blockedShell), "blocked live shell: submit generation should be disabled");

  const resultSnapshot = makeSnapshot(workspaceSnapshot, "poster");
  resetState({
    state,
    setRuntimeWorkspaceSnapshot,
    workspaceSnapshot,
    mode: "poster",
    apiMode: "static",
    source: "http",
    snapshot: resultSnapshot,
  });
  state.view = "results";
  state.selectedResult = resultSnapshot.results[0].id;
  const resultsBoard = renderCenterBoard(modeSpecs.poster, null);
  includes(resultsBoard, "result-filter-tabs", "results board");
  includes(resultsBoard, "data-result-filter=\"ready\"", "results board");
  includes(resultsBoard, "data-action=\"open-result-viewer\"", "results board");
  includes(resultsBoard, "data-action=\"goto-result-scheme\"", "results board");
  includes(resultsBoard, "data-action=\"regenerate-result\"", "results board");
  includes(resultsBoard, "data-action=\"delete-result\"", "results board");
  includes(resultsBoard, "质检", "results board");
  includes(resultsBoard, "download", "results board");

  state.resultDeleteConfirmId = resultSnapshot.results[0].id;
  const confirmingResultBoard = renderCenterBoard(modeSpecs.poster, null);
  includes(confirmingResultBoard, "confirming", "result delete confirmation");
  includes(confirmingResultBoard, "确认删除", "result delete confirmation");

  state.view = "schemes";
  state.resultDeleteConfirmId = "";
  state.schemeDeleteConfirmId = resultSnapshot.schemes[0].id;
  const confirmingSchemeBoard = renderCenterBoard(modeSpecs.poster, null);
  includes(confirmingSchemeBoard, "scheme-delete-button confirming", "scheme delete confirmation");
  includes(confirmingSchemeBoard, "确认删除", "scheme delete confirmation");

  state.resultViewerOpen = true;
  state.view = "results";
  state.selectedResult = resultSnapshot.results[0].id;
  const viewerBoard = renderCenterBoard(modeSpecs.poster, null);
  includes(viewerBoard, "role=\"dialog\"", "result viewer");
  includes(viewerBoard, "高清放大", "result viewer");
  includes(viewerBoard, "移除背景", "result viewer");
  includes(viewerBoard, "下载结果", "result viewer");
  includes(viewerBoard, "结果质检提示", "result viewer");

  state.settingsOpen = true;
  const settings = renderSettingsSheet();
  includes(settings, "settings-layer", "settings sheet");
  includes(settings, "provider-setup-steps", "settings sheet");
  includes(settings, "data-settings-resize", "settings sheet");
  includes(settings, "data-settings-resize-corner", "settings sheet");
  includes(settings, "data-action=\"save-provider-key\"", "settings sheet");
  includes(settings, "data-action=\"test-provider-connection\"", "settings sheet");
  includes(settings, "data-live-cost-cap", "settings sheet");
  includes(settings, "live-gate-checks", "settings sheet");
  includes(settings, "data-action=\"test-provider-route-plan\"", "settings sheet");

  state.generationChoiceOpen = true;
  state.settingsOpen = false;
  const choiceShell = renderShell(getActiveMode(), null);
  includes(choiceShell, "generation-choice-dialog", "generation choice dialog");
  includes(choiceShell, "data-generation-strategy=\"continue\"", "generation choice dialog");
  includes(choiceShell, "data-generation-strategy=\"regenerate\"", "generation choice dialog");
  includes(choiceShell, "旧方案和旧图片都会保留", "generation choice dialog");

  state.view = "project-library";
  state.generationChoiceOpen = false;
  const projectLibrary = renderCenterBoard(modeSpecs.poster, null);
  includes(projectLibrary, "project-library-board", "project library");
  includes(projectLibrary, "data-action=\"project-library-save-current\"", "project library");
  includes(projectLibrary, "data-action=\"project-library-import\"", "project library");
  includes(projectLibrary, "data-action=\"project-library-delete-entry\"", "project library");

  const failedQueueSnapshot = makeSnapshot(workspaceSnapshot, "poster", {
    queuePlans: [{
      job: { id: "job-ux-failed", mode: "poster", status: "failed" },
      tasks: [{
        id: "task-ux-failed-image",
        kind: "imageGeneration",
        status: "failed",
        input: { schemeId: "rc1-poster-scheme" },
        cost: { estimatedCost: 0.07 },
        error: {
          code: "provider_failed",
          message: "Provider failed during UX check.",
          userMessage: "Provider failed during UX check.",
          nextStep: "Retry this failed image.",
          retryable: true,
        },
        attempts: 1,
        maxAttempts: 2,
      }],
    }],
  });
  resetState({
    state,
    setRuntimeWorkspaceSnapshot,
    workspaceSnapshot,
    mode: "poster",
    apiMode: "static",
    source: "http",
    snapshot: failedQueueSnapshot,
  });
  const failedShell = renderShell(getActiveMode(), null);
  includes(failedShell, "重试失败", "failed queue shell");
  includes(failedShell, "失败原因", "failed queue shell");
  includes(failedShell, "data-action=\"retry-failed-images\"", "failed queue shell");

  excludes(failedShell, "undefined", "failed queue shell");
}

await run();

if (issues.length > 0) {
  console.error("UX regression checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("UX regression checks passed.");
