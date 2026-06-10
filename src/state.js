import { modeSpecs } from './data/modes.js';
import { workspaceSnapshot as defaultWorkspaceSnapshot } from './data/workspace-snapshot.js';

const schemeToneFallbacks = ["forest", "ember", "storm", "violet", "moon", "ice"];
const resultOperationLabels = {
  variant: "视觉重构",
  upscale: "高清放大",
  removeBg: "移除背景",
};
const imageRenderableSloganMaxChars = 56;
const imageRenderableSloganMaxWords = 8;
const imageRenderableCjkSloganMaxChars = 16;
const posterKvContaminationPattern = /KV构图母版|Mandatory KV Composition Architecture|Cinematic Game KV|电影级游戏(?:海报|主视觉|关键视觉)|Logo\/文案安全区|Slogan处理|BOSS压迫/i;

export const state = {
  theme: "light",
  view: "schemes",
  copyVisible: true,
  activeMode: defaultWorkspaceSnapshot.activeMode || "poster",
  selectedScheme: "",
  selectedSchemeVariants: /** @type {Record<string, number>} */ ({}),
  selectedResult: "",
  selectedResultUserSet: false,
  schemeDeleteConfirmId: "",
  resultDeleteConfirmId: "",
  resultFilter: "all",
  archiveSelection: [],
  archiveExportMessage: "",
  projectLibraryMessage: "",
  projectLibraryActiveEntryId: "",
  projectLibraryEntries: /** @type {Array<{ id: string, name: string, description: string, updatedAt: string }>} */ ([]),
  resultViewerOpen: false,
  resultViewerMessage: "",
  resultRefinementOpen: false,
  resultRefinementPrompt: "",
  taskOpen: false,
  settingsOpen: false,
  generationChoiceOpen: false,
  settingsWidth: 1060,
  settingsHeight: 820,
  provider: "google",
  providerOrder: /** @type {string[]} */ ([]),
  providerModelOverrides: /** @type {Record<string, Record<string, string>>} */ ({}),
  providerCustomModels: /** @type {Record<string, string[]>} */ ({}),
  providerSlotRoutes: /** @type {Record<string, { providerId: string, model?: string }>} */ ({
    concept: { providerId: "mimo", model: "mimo-v2.5-pro" },
    image: { providerId: "google", model: "gemini-3-pro-image-preview" },
    styleReference: { providerId: "mimo", model: "mimo-v2-omni" },
    compositionReference: { providerId: "mimo", model: "mimo-v2-omni" },
  }),
  providerRoutePlan: "mimo-google-kv",
  providerRoutingOpen: false,
  providerRoutePlans: /** @type {Array<{ id: string, name: string }>} */ ([
    { id: "standard", name: "标准方案" },
    { id: "image-first", name: "图像优先" },
    { id: "mimo-google-kv", name: "MiMo + Google KV" },
    { id: "mimo-agnes", name: "MiMo + Agnes 测试" },
  ]),
  providerRouteDeletedPlanIds: /** @type {string[]} */ ([]),
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
  resultOperation: /** @type {null | Record<string, unknown>} */ (null),
  resultOperations: /** @type {Array<Record<string, unknown>>} */ ([]),
  customAssetCategories: /** @type {Record<string, string[]>} */ ({}),
  customStyleTags: /** @type {Record<string, string[]>} */ ({}),
  directionLibraryOffset: /** @type {Record<string, number>} */ ({}),
  outputSuiteManagerOpen: false,
  outputSelectionMode: "single",
  outputPlanStrategy: "unified",
  outputCustomSuiteEnabled: false,
  outputCustomSuiteSizes: /** @type {string[]} */ ([]),
  outputCustomSuites: /** @type {Array<{ id: string, label: string, sizes: string[] }>} */ ([]),
  outputActiveCustomSuiteId: "",
  referenceAnalysis: /** @type {Record<string, Record<string, unknown>>} */ ({}),
  referenceUploadDataUrls: /** @type {Record<string, string>} */ ({}),
  leftCollapsed: false,
  leftWidth: 320,
  submission: null,
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

  reconcileWorkspaceUiState();
}

export function getActiveMode() {
  return modeSpecs[state.activeMode] || modeSpecs.poster;
}

export function getModeSchemes() {
  const activeMode = getActiveMode();
  const snapshot = getRuntimeWorkspaceSnapshot();
  const runtimeSchemes = Array.isArray(snapshot.schemes)
    ? snapshot.schemes.filter((scheme) => scheme.mode === activeMode.id && isSchemeVisibleForMode(activeMode.id, scheme))
    : [];

  if (state.workspaceLoadStatus !== "static") {
    return runtimeSchemes.map((scheme, index) => adaptRuntimeScheme(activeMode, scheme, snapshot, index));
  }

  return activeMode.schemes;
}

function isSchemeVisibleForMode(modeId, scheme) {
  if (!["announcement", "logo", "icon"].includes(modeId)) return true;
  const text = [
    scheme?.title,
    scheme?.brief,
    scheme?.prompt,
    scheme?.promptZh,
    scheme?.promptEn,
    ...(Array.isArray(scheme?.promptBlocks)
      ? scheme.promptBlocks.flatMap((block) => [block?.title, block?.text])
      : []),
  ]
    .filter((item) => typeof item === "string" && item.trim())
    .join("\n");
  return !posterKvContaminationPattern.test(text);
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

export function reconcileWorkspaceUiState() {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const previousSelectedResult = state.selectedResult;
  const previousViewerOpen = state.resultViewerOpen;

  ensureSelectedScheme();
  ensureSelectedResult();

  const activeResultIds = new Set(getModeResults().map((result) => result.id));
  if (previousViewerOpen && (!state.selectedResult || (previousSelectedResult && !activeResultIds.has(previousSelectedResult)))) {
    state.resultViewerOpen = false;
  }

  const knownSchemeIds = new Set([
    ...Object.values(modeSpecs).flatMap((mode) => (mode.schemes || []).map((scheme) => scheme.id)),
    ...((snapshot.schemes || []).map((scheme) => scheme.id)),
  ]);
  state.selectedSchemeVariants = Object.fromEntries(
    Object.entries(state.selectedSchemeVariants || {}).filter(([schemeId]) => knownSchemeIds.has(schemeId)),
  );

  const archiveRowIds = new Set((snapshot.archiveRows || []).map((row) => row.id));
  state.archiveSelection = (state.archiveSelection || []).filter((rowId) => archiveRowIds.has(rowId));

  const resultIds = new Set((snapshot.results || []).map((result) => result.id));
  if (state.schemeDeleteConfirmId && !knownSchemeIds.has(state.schemeDeleteConfirmId)) {
    state.schemeDeleteConfirmId = "";
  }
  if (state.resultDeleteConfirmId && !resultIds.has(state.resultDeleteConfirmId)) {
    state.resultDeleteConfirmId = "";
  }
  const nextOperations = (state.resultOperations || []).filter((operation) => (
    !operation.resultId
      || resultIds.has(operation.resultId)
      || (operation.outputResultId && resultIds.has(operation.outputResultId))
  ));
  state.resultOperations = nextOperations;
  if (state.resultOperation?.id && !nextOperations.some((operation) => operation.id === state.resultOperation.id)) {
    state.resultOperation = null;
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

export function queueResultOperation(action, resultId, options = {}) {
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
    editInstruction: typeof options.editInstruction === "string" ? options.editInstruction.trim().slice(0, 2000) : "",
    createdAt,
  };

  state.resultOperation = operation;
  state.resultOperations = [operation, ...state.resultOperations].slice(0, 8);
  state.selectedResult = resultId;
  state.selectedResultUserSet = true;
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

function sanitizeSchemePromptForDisplay(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const cleaned = text
    .replace(/##\s*A+\s*Cinematic Game KV Quality Override/gi, "## Cinematic Game KV Quality Override")
    .replace(/\n*##\s*(?:Mandatory KV Composition Architecture Override|Cinematic Game KV Quality Override)[\s\S]*$/gi, "")
    .trim();
  return cleaned || text;
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

function formatSchemeOutputLabel(activeMode, scheme, modeState) {
  const outputSettings = modeState?.outputSettings || {};
  const customSize = outputSettings.customSize;
  if (customSize?.width && customSize?.height) {
    return `${customSize.width}x${customSize.height}`;
  }

  const ratios = Array.isArray(scheme.outputRatios) && scheme.outputRatios.length > 0
    ? scheme.outputRatios
    : Array.isArray(outputSettings.aspectRatios)
      ? outputSettings.aspectRatios
      : [];
  if (ratios.length > 0) {
    return ratios.join(" / ");
  }

  const presets = Array.isArray(scheme.outputPresets) ? scheme.outputPresets : [];
  const readablePresets = presets
    .map((item) => String(item || "").trim())
    .filter((item) => item && item.toLowerCase() !== "custom");
  if (readablePresets.length > 0) {
    return readablePresets.join(" / ");
  }

  return activeMode.outputSizes?.[0] || "默认尺寸";
}

function adaptRuntimeScheme(activeMode, scheme, snapshot, index) {
  const modeState = snapshot.modeStates?.find((item) => item.mode === activeMode.id);
  const resultCount = snapshot.results?.filter((result) => result.schemeId === scheme.id).length || 0;
  const targetCount = Math.max(1, modeState?.outputSettings?.imagesPerScheme || 1);
  const status = scheme.status === "rendering" ? "loading" : scheme.status === "archived" ? "ready" : scheme.status;
  const promptZh = sanitizeSchemePromptForDisplay(findSchemePromptBlock(scheme.promptBlocks, ["AI 底层渲染指令", "中文提示词", "chinese prompt", "prompt zh"]));
  const promptEn = sanitizeSchemePromptForDisplay(findSchemePromptBlock(scheme.promptBlocks, ["english prompt", "英文提示词", "prompt en"]));
  const visualBrief = findSchemePromptBlock(scheme.promptBlocks, ["KV 主视觉详细策划", "视觉方向", "visual direction"]);
  const promptText = promptZh || promptEn || scheme.promptBlocks?.map((block) => `${block.title}: ${sanitizeSchemePromptForDisplay(block.text)}`).join("\n") || scheme.brief;
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
    en: formatSchemeOutputLabel(activeMode, scheme, modeState),
    platform: formatSchemeOutputLabel(activeMode, scheme, modeState),
    locked: scheme.lockedFields?.length ? scheme.lockedFields : activeMode.guardrails.slice(0, 2),
    status,
    progress: `${Math.min(resultCount, targetCount)}/${targetCount}`,
    tone: schemeToneFallbacks[index % schemeToneFallbacks.length],
    prompt: promptText,
    promptZh,
    promptEn,
  };
}
