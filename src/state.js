import { modeSpecs } from './data/modes.js';
import { workspaceSnapshot as defaultWorkspaceSnapshot } from './data/workspace-snapshot.js';

const schemeToneFallbacks = ["forest", "ember", "storm", "violet", "moon", "ice"];
const resultOperationLabels = {
  variant: "生成变体",
  upscale: "高清放大",
  removeBg: "移除背景",
};
const imageRenderableSloganMaxChars = 40;
const imageRenderableSloganMaxWords = 6;
const imageRenderableCjkSloganMaxChars = 12;

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
  projectLibraryActiveEntryId: "",
  projectLibraryEntries: /** @type {Array<{ id: string, name: string, description: string, updatedAt: string }>} */ ([]),
  resultViewerOpen: false,
  taskOpen: false,
  settingsOpen: false,
  generationChoiceOpen: false,
  settingsWidth: 1060,
  settingsHeight: 820,
  provider: "google",
  providerModelOverrides: /** @type {Record<string, Record<string, string>>} */ ({}),
  providerCustomModels: /** @type {Record<string, string[]>} */ ({}),
  providerSlotRoutes: /** @type {Record<string, { providerId: string, model?: string }>} */ ({
    concept: { providerId: "google", model: "gemini-2.5-flash" },
    image: { providerId: "google", model: "gemini-2.5-flash-image" },
    styleReference: { providerId: "google", model: "gemini-2.5-flash" },
    compositionReference: { providerId: "google", model: "gemini-2.5-flash" },
  }),
  providerRoutePlan: "standard",
  providerRoutePlans: /** @type {Array<{ id: string, name: string }>} */ ([
    { id: "standard", name: "标准方案" },
    { id: "image-first", name: "图像优先" },
  ]),
  providerRoutePlanTest: {
    phase: "idle",
    planId: "standard",
    updatedAt: /** @type {string | null} */ (null),
    results: /** @type {Array<Record<string, unknown>>} */ ([]),
    error: /** @type {string | null} */ (null),
  },
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
  outputSelectionMode: "single",
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
  if (view === "results") state.view = "results";
  if (view === "schemes" || view === "text") state.view = "schemes";
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

  if (state.workspaceLoadStatus !== "static") {
    return runtimeSchemes.map((scheme, index) => adaptRuntimeScheme(activeMode, scheme, snapshot, index));
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
  if (schemes.length === 0) {
    state.selectedScheme = "";
    return;
  }
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
  const schemes = getModeSchemes();
  return schemes.find((item) => item.id === state.selectedScheme)
    || schemes[0]
    || getActiveMode().schemes[0]
    || null;
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

function findSchemePromptBlock(promptBlocks, labels) {
  if (!Array.isArray(promptBlocks)) return "";
  const normalizedLabels = labels.map((label) => label.toLowerCase());
  const match = promptBlocks.find((block) => {
    const title = String(block?.title || "").toLowerCase();
    return normalizedLabels.some((label) => title.includes(label));
  });
  return typeof match?.text === "string" ? match.text : "";
}

function cleanSloganText(value) {
  return String(value || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

function normalizeSloganComparable(value) {
  return cleanSloganText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeSloganRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compactSloganPunctuation(value) {
  return cleanSloganText(value)
    .replace(/\s+([,，.!?。！？;；:：])/g, "$1")
    .replace(/([,，.!?。！？;；:：]){2,}/g, "$1")
    .replace(/^[,，.!?。！？;；:：\-\s]+|[,，.!?。！？;；:：\-\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSloganBrandTerms(value, brandTerms) {
  let output = value;
  for (const term of brandTerms) {
    if (!term) continue;
    const pattern = term
      .split(/\s+/)
      .map(escapeSloganRegExp)
      .join("[\\s\\-_:,.!?]*");
    output = output.replace(new RegExp(pattern, "giu"), "");
  }
  return compactSloganPunctuation(output);
}

function splitSloganPhrases(value) {
  return cleanSloganText(value)
    .split(/[.!?。！？;；:：|/]+|[,，]\s+/g)
    .map(compactSloganPunctuation)
    .filter(Boolean);
}

function sloganWordCount(value) {
  return value.split(/\s+/).filter(Boolean).length;
}

function visibleSloganCharacters(value) {
  return Array.from(value.replace(/\s+/g, "")).length;
}

function isRenderableSlogan(value, language, maxChars) {
  if (!value || value.length > maxChars) return false;
  if (language === "zh-CN" || language === "ja-JP" || language === "ko-KR") {
    return visibleSloganCharacters(value) <= maxChars;
  }
  return sloganWordCount(value) <= imageRenderableSloganMaxWords;
}

function truncateRenderableSlogan(value, language, maxChars) {
  const cleaned = compactSloganPunctuation(value);
  if (!cleaned) return "";
  if (language === "zh-CN" || language === "ja-JP" || language === "ko-KR") {
    return Array.from(cleaned).slice(0, maxChars).join("").replace(/[,，.!?。！？;；:：\-\s]+$/g, "").trim();
  }
  let output = cleaned.split(/\s+/).slice(0, imageRenderableSloganMaxWords).join(" ");
  if (output.length > maxChars) {
    output = output.slice(0, maxChars).replace(/\s+\S*$/, "").trim();
  }
  return output.replace(/[,，.!?。！？;；:：\-\s]+$/g, "").trim();
}

function formatImageRenderableSloganPreview(value, language, snapshot) {
  const normalized = cleanSloganText(value);
  if (!normalized) return "";
  const brandTerms = [
    snapshot.project?.name,
    ...(snapshot.brandKit?.fixedBrandTerms || []),
  ].map(normalizeSloganComparable).filter(Boolean);
  const maxChars = language === "zh-CN" || language === "ja-JP" || language === "ko-KR"
    ? imageRenderableCjkSloganMaxChars
    : imageRenderableSloganMaxChars;
  const brandTrimmed = stripSloganBrandTerms(normalized, brandTerms);
  const directCandidate = compactSloganPunctuation(brandTrimmed || normalized);
  if (isRenderableSlogan(directCandidate, language, maxChars)) return directCandidate;

  const phrases = splitSloganPhrases(directCandidate)
    .map((phrase) => stripSloganBrandTerms(phrase, brandTerms))
    .filter(Boolean)
    .filter((phrase) => !brandTerms.includes(normalizeSloganComparable(phrase)));
  const renderablePhrase = phrases.find((phrase) => isRenderableSlogan(phrase, language, maxChars));
  if (renderablePhrase) return renderablePhrase;
  return truncateRenderableSlogan(phrases[0] || directCandidate, language, maxChars) || normalized;
}

function adaptRuntimeScheme(activeMode, scheme, snapshot, index) {
  const modeState = snapshot.modeStates?.find((item) => item.mode === activeMode.id);
  const resultCount = snapshot.results?.filter((result) => result.schemeId === scheme.id).length || 0;
  const targetCount = Math.max(1, modeState?.outputSettings?.imagesPerScheme || 1);
  const status = scheme.status === "rendering" ? "loading" : scheme.status === "archived" ? "ready" : scheme.status;
  const promptZh = findSchemePromptBlock(scheme.promptBlocks, ["中文提示词", "chinese prompt", "prompt zh"]);
  const promptEn = findSchemePromptBlock(scheme.promptBlocks, ["english prompt", "英文提示词", "prompt en"]);
  const visualBrief = findSchemePromptBlock(scheme.promptBlocks, ["视觉方向", "visual direction"]);
  const promptText = promptZh || promptEn || scheme.promptBlocks?.map((block) => `${block.title}: ${block.text}`).join("\n") || scheme.brief;
  const selectedLanguage = Array.isArray(modeState?.sloganSettings?.languages) && modeState.sloganSettings.languages.length > 0
    ? modeState.sloganSettings.languages[0]
    : "en-US";
  const sloganValues = Object.values(scheme.slogans || {}).filter((value) => typeof value === "string" && value.trim());
  const rawSlogan = scheme.slogans?.[selectedLanguage] || scheme.slogans?.["en-US"] || scheme.slogans?.["zh-CN"] || sloganValues[0] || "";
  const primarySlogan = rawSlogan
    ? formatImageRenderableSloganPreview(rawSlogan, selectedLanguage, snapshot)
    : "宣传词待生成";

  return {
    id: scheme.id,
    code: scheme.code,
    title: scheme.title,
    brief: visualBrief || scheme.brief,
    zh: primarySlogan,
    en: scheme.outputPresets?.length ? scheme.outputPresets.join(" / ") : activeMode.outputSizes?.[0] || "自定义",
    platform: scheme.outputPresets?.length ? scheme.outputPresets.join(" / ") : activeMode.outputSizes?.[0] || "自定义",
    locked: scheme.lockedFields?.length ? scheme.lockedFields : activeMode.guardrails.slice(0, 2),
    status,
    progress: `${Math.min(resultCount, targetCount)}/${targetCount}`,
    tone: schemeToneFallbacks[index % schemeToneFallbacks.length],
    prompt: promptText,
    promptZh,
    promptEn,
  };
}
