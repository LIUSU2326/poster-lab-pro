import { modeSpecs } from './data/modes.js';
import { workspaceSnapshot as defaultWorkspaceSnapshot } from './data/workspace-snapshot.js';

const schemeToneFallbacks = ["forest", "ember", "storm", "violet", "moon", "ice"];
const resultOperationLabels = {
  variant: "生成变体",
  upscale: "高清放大",
  removeBg: "移除背景",
};

export const state = {
  theme: "light",
  view: "schemes",
  copyVisible: true,
  activeMode: defaultWorkspaceSnapshot.activeMode || "poster",
  selectedScheme: "",
  selectedSchemeVariants: /** @type {Record<string, number>} */ ({}),
  selectedResult: "",
  selectedResultUserSet: false,
  archiveSelection: [],
  archiveExportMessage: "",
  projectLibraryMessage: "",
  resultViewerOpen: false,
  taskOpen: false,
  settingsOpen: false,
  settingsWidth: 1060,
  settingsHeight: 820,
  provider: "openai",
  providerModelOverrides: /** @type {Record<string, Record<string, string>>} */ ({}),
  providerRoutePlan: "standard",
  providerRoutePlans: /** @type {Array<{ id: string, name: string }>} */ ([
    { id: "standard", name: "标准方案" },
    { id: "image-first", name: "图像优先" },
  ]),
  apiMode: "static",
  workspaceId: defaultWorkspaceSnapshot.metadata.workspaceId,
  workspaceSnapshot: defaultWorkspaceSnapshot,
  workspaceLoadStatus: "static",
  workspaceLoadError: /** @type {string | null} */ (null),
  assetOperation: /** @type {null | Record<string, unknown>} */ (null),
  hiddenAssetSlots: /** @type {Record<string, string[]>} */ ({}),
  providerCredential: {
    status: "idle",
    error: /** @type {string | null} */ (null),
    providerId: "openai",
    masked: "",
    configured: false,
    updatedAt: /** @type {string | null} */ (null),
  },
  providerConnection: {
    phase: "idle",
    status: "not_configured",
    error: /** @type {string | null} */ (null),
    providerId: "openai",
    ok: false,
    attemptedNetwork: false,
    checkedAt: /** @type {string | null} */ (null),
    elapsedMs: 0,
    message: "尚未测试。",
    errorCode: /** @type {string | null} */ (null),
    retryable: false,
    modelCount: /** @type {number | null} */ (null),
    defaultModel: "",
    defaultModelAvailable: /** @type {boolean | null} */ (null),
    sampledModels: [],
  },
  manualLiveTest: {
    phase: "idle",
    status: "not_started",
    error: /** @type {string | null} */ (null),
    message: "尚未执行手动实机测试。",
    jobId: /** @type {string | null} */ (null),
    traceId: /** @type {string | null} */ (null),
    resultCount: 0,
    persistedFileCount: 0,
    connectionStatus: /** @type {string | null} */ (null),
    updatedAt: /** @type {string | null} */ (null),
    envelope: /** @type {null | Record<string, unknown>} */ (null),
  },
  resultOperation: /** @type {null | Record<string, unknown>} */ (null),
  resultOperations: /** @type {Array<Record<string, unknown>>} */ ([]),
  customAssetCategories: /** @type {Record<string, string[]>} */ ({}),
  customStyleTags: /** @type {Record<string, string[]>} */ ({}),
  directionLibraryOffset: /** @type {Record<string, number>} */ ({}),
  outputSuiteManagerOpen: false,
  outputSelectionMode: "suite",
  outputPlanStrategy: "unified",
  outputCustomSuiteEnabled: true,
  outputCustomSuiteSizes: /** @type {string[]} */ (["1080x1920", "1200x627"]),
  referenceAnalysis: /** @type {Record<string, Record<string, unknown>>} */ ({}),
  referenceUploadDataUrls: /** @type {Record<string, string>} */ ({}),
  leftCollapsed: false,
  leftWidth: 320,
  submission: null,
  liveGate: {
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
  },
};

export function applyPrototypeStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const theme = params.get("theme");
  const view = params.get("view");
  const mode = params.get("mode");
  const api = params.get("api");
  if (theme === "dark" || theme === "light") state.theme = theme;
  if (view === "archive") state.view = "archive";
  if (view === "project-library") state.view = "project-library";
  if (view === "schemes" || view === "text" || view === "results") state.view = "schemes";
  if (view === "text") state.copyVisible = true;
  if (modeSpecs[mode]) state.activeMode = mode;
  if (api === "http" || api === "static") state.apiMode = api;
  if (params.get("settings") === "open") state.settingsOpen = true;
  if (params.get("task") === "open") state.taskOpen = true;
}

export function getRuntimeWorkspaceSnapshot() {
  return state.workspaceSnapshot || defaultWorkspaceSnapshot;
}

export function setRuntimeWorkspaceSnapshot(snapshot, source = "runtime") {
  if (!snapshot?.metadata?.workspaceId) {
    throw new Error("Runtime workspace snapshot requires metadata.workspaceId.");
  }

  state.workspaceSnapshot = snapshot;
  state.workspaceId = snapshot.metadata.workspaceId;
  state.workspaceLoadStatus = source;
  state.workspaceLoadError = null;

  if (modeSpecs[snapshot.activeMode]) {
    state.activeMode = snapshot.activeMode;
  }

  ensureSelectedScheme();
  ensureSelectedResult();
}

export function getActiveMode() {
  return modeSpecs[state.activeMode] || modeSpecs.poster;
}

export function getModeSchemes() {
  const activeMode = getActiveMode();
  const snapshot = getRuntimeWorkspaceSnapshot();
  const runtimeSchemes = Array.isArray(snapshot.schemes)
    ? snapshot.schemes.filter((scheme) => scheme.mode === activeMode.id)
    : [];

  if (state.workspaceLoadStatus !== "static" && runtimeSchemes.length > 0) {
    const runtimeIds = new Set(runtimeSchemes.map((scheme) => scheme.id));
    return [
      ...runtimeSchemes.map((scheme, index) => adaptRuntimeScheme(activeMode, scheme, snapshot, index)),
      ...activeMode.schemes.filter((scheme) => !runtimeIds.has(scheme.id)),
    ];
  }

  return activeMode.schemes;
}

export function getModeResults() {
  const activeMode = getActiveMode();
  const snapshot = getRuntimeWorkspaceSnapshot();
  const results = Array.isArray(snapshot.results)
    ? snapshot.results.filter((result) => result.mode === activeMode.id)
    : [];

  return [...results].sort((left, right) => {
    const rightTime = Date.parse(right.updatedAt || right.createdAt || "");
    const leftTime = Date.parse(left.updatedAt || left.createdAt || "");
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
}

export function ensureSelectedScheme() {
  const schemes = getModeSchemes();
  if (!schemes.some((item) => item.id === state.selectedScheme)) {
    state.selectedScheme = schemes[0].id;
  }
}

export function ensureSelectedResult() {
  const results = getModeResults();
  if (results.length === 0) {
    state.selectedResult = "";
    state.selectedResultUserSet = false;
    return;
  }

  const current = results.find((item) => item.id === state.selectedResult);
  const localFileResult = results.find((item) => item.metadata?.resultFile);
  if (!current) {
    state.selectedResult = (localFileResult || results[0]).id;
    state.selectedResultUserSet = false;
    return;
  }

  if (!state.selectedResultUserSet && localFileResult && !current.metadata?.resultFile) {
    state.selectedResult = localFileResult.id;
  }
}

export function getSelectedScheme() {
  ensureSelectedScheme();
  return getModeSchemes().find((item) => item.id === state.selectedScheme) || getModeSchemes()[0];
}

export function getSelectedResult() {
  ensureSelectedResult();
  return getModeResults().find((item) => item.id === state.selectedResult) || null;
}

export function getSchemeById(schemeId) {
  return getModeSchemes().find((item) => item.id === schemeId) || null;
}

export function getResultDownloadUrl(result, options = {}) {
  if (!result?.id) return "";
  const params = new URLSearchParams();
  params.set("file", "1");
  if (options.inline) params.set("inline", "1");
  return `/api/workspaces/${encodeURIComponent(state.workspaceId)}/results/${encodeURIComponent(result.id)}/download?${params.toString()}`;
}

export function getResultOperationLabel(action) {
  return resultOperationLabels[action] || "结果操作";
}

export function queueResultOperation(action, resultId) {
  const result = getModeResults().find((item) => item.id === resultId);
  if (!result) return null;

  const label = getResultOperationLabel(action);
  const createdAt = new Date().toISOString();
  const operation = {
    id: `op-${Date.now().toString(36)}-${state.resultOperations.length + 1}`,
    action,
    label,
    resultId,
    mode: result.mode,
    status: "queued",
    progress: action === "upscale" ? 12 : action === "removeBg" ? 18 : 24,
    cost: "待估算",
    elapsed: "00:00",
    message: `${label} 已加入本地队列。`,
    createdAt,
  };

  state.resultOperation = operation;
  state.resultOperations = [operation, ...state.resultOperations].slice(0, 8);
  state.selectedResult = resultId;
  state.selectedResultUserSet = true;
  state.view = "schemes";
  state.taskOpen = true;
  return operation;
}

export function updateResultOperation(operationId, patch) {
  const current = state.resultOperations.find((operation) => operation.id === operationId);
  if (!current) return null;

  const updated = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  state.resultOperations = state.resultOperations.map((operation) =>
    operation.id === operationId ? updated : operation,
  );
  if (state.resultOperation?.id === operationId) {
    state.resultOperation = updated;
  }
  return updated;
}

export function isResultOperationActive(action, resultId) {
  return state.resultOperations.some(
    (operation) => operation.action === action
      && operation.resultId === resultId
      && operation.status !== "done"
      && operation.status !== "failed",
  );
}

function adaptRuntimeScheme(activeMode, scheme, snapshot, index) {
  const modeState = snapshot.modeStates?.find((item) => item.mode === activeMode.id);
  const resultCount = snapshot.results?.filter((result) => result.schemeId === scheme.id).length || 0;
  const targetCount = Math.max(1, modeState?.outputSettings?.imagesPerScheme || 1);
  const status = scheme.status === "rendering" ? "loading" : scheme.status === "archived" ? "ready" : scheme.status;
  const promptText = scheme.promptBlocks?.map((block) => `${block.title}: ${block.text}`).join("\n") || scheme.brief;

  return {
    id: scheme.id,
    code: scheme.code,
    title: scheme.title,
    brief: scheme.brief,
    zh: scheme.slogans?.["zh-CN"] || scheme.slogans?.["en-US"] || "宣传词待生成",
    en: scheme.slogans?.["en-US"] || scheme.slogans?.["zh-CN"] || "宣传词待生成",
    platform: scheme.outputPresets?.length ? scheme.outputPresets.join(" / ") : activeMode.outputSizes?.[0] || "自定义",
    locked: scheme.lockedFields?.length ? scheme.lockedFields : activeMode.guardrails.slice(0, 2),
    status,
    progress: `${Math.min(resultCount, targetCount)}/${targetCount}`,
    tone: schemeToneFallbacks[index % schemeToneFallbacks.length],
    prompt: promptText,
  };
}
