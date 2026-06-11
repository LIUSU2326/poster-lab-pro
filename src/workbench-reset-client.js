import { modeOrder } from './data/modes.js';
import {
  createModeFormDefaults,
  createOutputSettingsDefaults,
  createSloganSettingsDefaults,
} from './schema/index.js';
import { getRuntimeWorkspaceSnapshot, setRuntimeWorkspaceSnapshot, state } from './state.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function encodeSegment(value) {
  return encodeURIComponent(String(value));
}

async function postJson(path, payload, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Workspace reset requires fetch.");
  }

  const response = await fetchImpl(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  try {
    return await response.json();
  } catch {
    return {
      ok: false,
      error: {
        code: "bad_response",
        message: "Workspace reset route returned an unreadable response.",
      },
    };
  }
}

function validModeForm(modeId, projectName) {
  const form = createModeFormDefaults(modeId);
  if (modeId === "collab") return { ...form, collabBrandName: "合作伙伴" };
  if (modeId === "announcement") return { ...form, announcementTitle: "公告标题" };
  if (modeId === "logo") return { ...form, wordmark: projectName || "Untitled Logo" };
  return form;
}

function normalizePreservedProviderConfigs(providerConfigs = {}) {
  const aigocodeImageAliases = new Set(["image-2", "image-1", "dall-e-3"]);
  const legacyAigocodeImageModels = new Set(["image-2", "image-1", "dall-e-3", "gpt-image-1", "gpt-image-2", "gpt-image-1.5"]);
  return Object.fromEntries(Object.entries(providerConfigs).map(([providerId, config]) => {
    if (providerId !== "aigocode" || !config) return [providerId, config];
    const baseUrl = String(config.baseUrl || "")
      .replace(/^https:\/\/api\.aigocode\.com(?=\/|$)/i, "https://api.aigocode.app")
      .replace(/\/+$/, "");
    const normalizedBaseUrl = !baseUrl || baseUrl === "https://api.aigocode.app"
      ? "https://api.aigocode.app/v1"
      : baseUrl;
    const imageModel = aigocodeImageAliases.has(config.modelSlots?.image || "") ? "gpt-image-1" : config.modelSlots?.image;
    const defaultModel = legacyAigocodeImageModels.has(config.defaultModel || "") ? "gpt-5.5" : config.defaultModel || "gpt-5.5";
    return [providerId, {
      ...config,
      baseUrl: normalizedBaseUrl,
      defaultModel,
      modelSlots: {
        ...(config.modelSlots || {}),
        ...(imageModel ? { image: imageModel } : {}),
      },
    }];
  }));
}

function clearedModeStates(projectName, description, updatedAt) {
  return modeOrder.map((modeId) => ({
    mode: modeId,
    projectBrief: {
      projectName,
      gameDescription: description,
      focusGuidanceEnabled: false,
      focusGuidance: "",
    },
    outputSettings: {
      ...createOutputSettingsDefaults(modeId),
      mode: modeId,
    },
    sloganSettings: createSloganSettingsDefaults(),
    modeForm: validModeForm(modeId, projectName),
    selectedSchemeIds: [],
    updatedAt,
  }));
}

function applyClearedUiState() {
  state.activeMode = "poster";
  state.view = "schemes";
  state.copyVisible = true;
  state.selectedScheme = "";
  state.selectedSchemeVariants = {};
  state.schemeRenderCounts = {};
  state.selectedResult = "";
  state.selectedResultUserSet = false;
  state.schemeDeleteConfirmId = "";
  state.resultDeleteConfirmId = "";
  state.resultFilter = "all";
  state.archiveSelection = [];
  state.archiveExportMessage = "";
  state.projectLibraryMessage = "";
  state.projectLibraryActiveEntryId = "";
  state.resultViewerOpen = false;
  state.taskOpen = false;
  state.generationChoiceOpen = false;
  state.assetOperation = null;
  state.hiddenAssetSlots = {};
  state.resultOperation = null;
  state.resultOperations = [];
  state.customAssetCategories = {};
  state.customStyleTags = {};
  state.directionLibraryOffset = {};
  state.outputSuiteManagerOpen = false;
  state.outputSelectionMode = "single";
  state.outputPlanStrategy = "unified";
  state.outputCustomSuiteEnabled = false;
  state.outputCustomSuiteSizes = [];
  state.outputCustomSuites = [];
  state.outputActiveCustomSuiteId = "";
  state.referenceAnalysis = {};
  state.referenceUploadDataUrls = {};
  state.submission = null;
}

function createClearedSnapshot(snapshot) {
  const updatedAt = nowIso();
  const projectId = snapshot.project?.id || "project-new";
  const projectName = "";
  const description = "";

  return {
    ...snapshot,
    activeMode: "poster",
    project: {
      id: projectId,
      name: projectName,
      description,
      genre: "",
      coreSellingPoints: [],
      targetAudience: "",
      brandKitId: null,
      defaultMode: "poster",
    },
    brandKit: null,
    characters: [],
    assets: [],
    providerConfigs: normalizePreservedProviderConfigs(snapshot.providerConfigs || {}),
    modeStates: clearedModeStates(projectName, description, updatedAt),
    schemes: [],
    queuePlans: [],
    queueSummaries: [],
    referenceAnalyses: [],
    results: [],
    archiveRows: [],
    metadata: {
      ...snapshot.metadata,
      revision: Number(snapshot.metadata?.revision || 0) + 1,
      updatedAt,
    },
  };
}

function applySnapshot(nextSnapshot, source) {
  setRuntimeWorkspaceSnapshot(nextSnapshot, source);
  applyClearedUiState();
}

async function persistSnapshot(nextSnapshot, options = {}) {
  if (state.workspaceLoadStatus !== "http" && state.apiMode !== "http") {
    applySnapshot(nextSnapshot, "static");
    return { ok: true, transport: "static", data: { snapshot: nextSnapshot } };
  }

  const workspaceId = nextSnapshot.metadata.workspaceId;
  const envelope = await postJson(`/api/workspaces/${encodeSegment(workspaceId)}/snapshot`, { snapshot: nextSnapshot }, options);
  if (envelope.ok) {
    applySnapshot(envelope.data?.snapshot || nextSnapshot, "http");
  }
  return {
    ...envelope,
    transport: "http",
  };
}

export async function clearWorkbenchForWorkbench(options = {}) {
  const snapshot = clone(getRuntimeWorkspaceSnapshot());
  return persistSnapshot(createClearedSnapshot(snapshot), options);
}
