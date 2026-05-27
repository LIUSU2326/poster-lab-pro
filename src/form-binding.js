import { getActiveMode, getModeSchemes, getRuntimeWorkspaceSnapshot, getSelectedScheme, setRuntimeWorkspaceSnapshot, state } from './state.js';
import { modeSpecs } from './data/modes.js';
import {
  modeAssetRequirements,
  validateModeForm,
  validateOutputSettingsForm,
  validateProjectBriefForm,
  validateSloganSettingsForm,
} from './schema/index.js';
import { saveLocalSubmissionDraft } from './local-draft-store.js';
import { runStaticGenerationServiceFlow } from './static-local-api-service.js';
import { runHttpGenerationServiceFlow } from './http-generation-service.js';
import { applyGenerationFormValuesToSnapshot, getActiveGenerationFormValues } from './generation-form-runtime.js';

const platformPresetsByMode = {
  poster: ["tiktok", "metaAds"],
  collab: ["metaAds", "tiktok"],
  announcement: ["tapTap", "googlePlay"],
  logo: ["custom"],
  icon: ["appStore", "googlePlay"],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function createTraceId() {
  return `trace-${Date.now().toString(36)}`;
}

function issue(path, message) {
  return { path, message };
}

function shouldUseHttpServiceFlow() {
  return state.apiMode === "http";
}

function parseAssetRequirement(expression) {
  const parts = String(expression || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    roles: parts.map((part) => part.replace(/\?$/, "")),
    optional: parts.length > 0 && parts.every((part) => part.endsWith("?")),
  };
}

function getAssetUrl(asset) {
  return asset?.url || asset?.providerUrl || asset?.assetUrl || asset?.previewUrl || null;
}

export function isProviderSafeAssetUrl(url) {
  return typeof url === "string" && /^(https?:|data:)/i.test(url);
}

export function validatePromptAssetReadiness(
  snapshot = createBoundWorkspaceSnapshot(),
  mode = getActiveMode().id,
  options = {},
) {
  const requirements = modeAssetRequirements[mode] || [];
  const requireProviderUrls = Boolean(options.requireProviderUrls);
  const projectId = snapshot.project?.id;
  const assets = Array.isArray(snapshot.assets)
    ? snapshot.assets.filter((asset) => !projectId || asset.projectId === projectId)
    : [];
  const issues = [];

  for (const requirement of requirements) {
    const parsed = parseAssetRequirement(requirement);
    if (parsed.optional || parsed.roles.length === 0) continue;

    const matches = assets.filter((asset) => parsed.roles.includes(asset.role));
    const path = `assets.${parsed.roles.join("|")}`;

    if (matches.length === 0) {
      issues.push(issue(path, `Missing required asset role: ${parsed.roles.join(" or ")}.`));
      continue;
    }

    const urls = matches.map(getAssetUrl).filter(Boolean);
    const hasSafeUrl = urls.some(isProviderSafeAssetUrl);
    const hasUnsafeUrl = urls.some((url) => !isProviderSafeAssetUrl(url));

    if (hasUnsafeUrl && !hasSafeUrl) {
      issues.push(issue(path, "Required asset uses a browser-only or provider-unsafe preview URL."));
      continue;
    }

    if (requireProviderUrls && !hasSafeUrl) {
      issues.push(issue(path, "Required asset needs a committed public or data URL for provider submission."));
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

function aspectRatiosForMode(activeMode) {
  if (activeMode.id === "icon") return ["1:1"];
  const ratios = activeMode.outputSizes.filter((item) => /^(\d+:\d+|\d{3,5}x\d{3,5})$/.test(item));
  return ratios.length > 0 ? ratios : ["1:1"];
}

function createProjectBriefDraft(activeMode) {
  const workspaceSnapshot = getRuntimeWorkspaceSnapshot();
  return {
    projectName: workspaceSnapshot.project.name,
    gameDescription: activeMode.description,
    focusGuidanceEnabled: false,
    focusGuidance: "",
  };
}

function createOutputSettingsDraft(activeMode) {
  return {
    mode: activeMode.id,
    platformPresets: platformPresetsByMode[activeMode.id] || ["custom"],
    aspectRatios: aspectRatiosForMode(activeMode),
    customSize: null,
    schemeCount: activeMode.schemes.length,
    imagesPerScheme: 1,
  };
}

function createSloganSettingsDraft() {
  return {
    mode: "auto",
    globalSlogan: "",
    languages: ["zh-CN", "en-US"],
  };
}

function createModeFormDraft(activeMode) {
  const workspaceSnapshot = getRuntimeWorkspaceSnapshot();
  if (activeMode.id === "collab") {
    return {
      mode: "collab",
      collabBrandName: "Partner Brand",
      collabStyleInjection: "native",
      characterPlaceholdersOnly: true,
      preventCharacterMerge: true,
    };
  }
  if (activeMode.id === "announcement") {
    return {
      mode: "announcement",
      announcementTitle: activeMode.schemes[0]?.zh || "Scheduled Maintenance",
      copyPreset: "maintenance",
      layoutMode: "integratedTypography",
      groupShotWhenMultiCharacter: true,
    };
  }
  if (activeMode.id === "logo") {
    return {
      mode: "logo",
      wordmark: workspaceSnapshot.project.name,
      solidBackground: true,
      backgroundColor: "#ffffff",
      wordmarkIsPrimarySubject: true,
    };
  }
  if (activeMode.id === "icon") {
    return {
      mode: "icon",
      aspectRatio: "1:1",
      noText: true,
      fullBleedSquare: true,
      compositionReferenceRotation: true,
    };
  }
  return {
    mode: "poster",
    styleTags: [],
    compositionReferenceStrength: "composition",
  };
}

function createFallbackModeForm(modeId) {
  return createModeFormDraft(modeSpecs[modeId] || modeSpecs.poster);
}

export function createBoundWorkspaceSnapshot() {
  const activeMode = getActiveMode();
  const selected = getSelectedScheme();
  const formValues = {
    ...getActiveGenerationFormValues(),
    mode: activeMode.id,
    selectedSchemeIds: [selected.id],
  };
  const snapshot = applyGenerationFormValuesToSnapshot(getRuntimeWorkspaceSnapshot(), formValues);
  const updatedAt = nowIso();

  snapshot.activeMode = activeMode.id;
  snapshot.metadata.updatedAt = updatedAt;
  ensureActiveModeSchemesInSnapshot(snapshot, activeMode);

  return snapshot;
}

function ensureActiveModeSchemesInSnapshot(snapshot, activeMode) {
  const existingIds = new Set(snapshot.schemes.map((scheme) => scheme.id));
  const modeState = snapshot.modeStates.find((item) => item.mode === activeMode.id);
  const outputPresets = modeState?.outputSettings?.platformPresets?.length
    ? modeState.outputSettings.platformPresets
    : platformPresetsByMode[activeMode.id] || ["custom"];

  for (const scheme of activeMode.schemes) {
    if (existingIds.has(scheme.id)) continue;
    snapshot.schemes.push({
      id: scheme.id,
      projectId: snapshot.project.id,
      mode: activeMode.id,
      code: scheme.code,
      title: scheme.title,
      brief: scheme.brief,
      slogans: {
        "zh-CN": scheme.zh,
        "en-US": scheme.en,
      },
      promptBlocks: activeMode.promptBlocks || [],
      lockedFields: scheme.locked || [],
      outputPresets,
      status: scheme.status === "ready" ? "ready" : scheme.status === "failed" ? "failed" : "pending",
    });
  }
}

export function validateBoundFrontendForms(snapshot = createBoundWorkspaceSnapshot()) {
  const activeMode = getActiveMode();
  const modeState = snapshot.modeStates.find((item) => item.mode === activeMode.id);
  if (!modeState) {
    return {
      ok: false,
      results: [{ name: "modeState", ok: false, issues: [{ path: "mode", message: "Missing active mode state." }] }],
    };
  }

  const results = [
    { name: "projectBrief", ...validateProjectBriefForm(modeState.projectBrief) },
    { name: "outputSettings", ...validateOutputSettingsForm(activeMode.id, modeState.outputSettings) },
    { name: "sloganSettings", ...validateSloganSettingsForm(modeState.sloganSettings) },
    { name: "modeForm", ...validateModeForm(activeMode.id, modeState.modeForm) },
    {
      name: "promptAssets",
      ...validatePromptAssetReadiness(snapshot, activeMode.id, {
        requireProviderUrls: shouldUseHttpServiceFlow(),
      }),
    },
  ];

  return {
    ok: results.every((item) => item.ok),
    results,
  };
}

export function buildPromptPackageCreateSubmission(snapshot = createBoundWorkspaceSnapshot()) {
  const activeMode = getActiveMode();
  const selected = getSelectedScheme();
  const modeState = snapshot.modeStates.find((item) => item.mode === activeMode.id);
  const outputSettings = modeState?.outputSettings || createOutputSettingsDraft(activeMode);

  return {
    routeId: "prompt.package.create",
    payload: {
      snapshot,
      target: "image",
      mode: activeMode.id,
      schemeId: selected.id,
      platformPreset: outputSettings.platformPresets[0] || "custom",
      aspectRatio: outputSettings.aspectRatios[0] || "1:1",
    },
  };
}

export function buildQueuePlanCreateSubmission(snapshot = createBoundWorkspaceSnapshot()) {
  const activeMode = getActiveMode();
  const selected = getSelectedScheme();
  const modeState = snapshot.modeStates.find((item) => item.mode === activeMode.id);
  const outputSettings = modeState?.outputSettings || createOutputSettingsDraft(activeMode);
  const batchSchemeIds = getModeSchemes()
    .slice(0, Math.max(1, outputSettings.schemeCount || 1))
    .map((scheme) => scheme.id);

  return {
    routeId: "queue.plan.create",
    payload: {
      projectId: snapshot.project.id,
      mode: activeMode.id,
      providerId: providerRouteForSlot("concept").providerId,
      providerRoutes: getProviderRoutesForSubmission(),
      schemeIds: batchSchemeIds.length > 0 ? batchSchemeIds : [selected.id],
      platformPresets: outputSettings.platformPresets,
      aspectRatios: outputSettings.aspectRatios,
      customSize: outputSettings.customSize || null,
      imagesPerScheme: outputSettings.imagesPerScheme,
      includeImageEdit: false,
      includeUpscale: false,
      includeBackgroundRemoval: false,
    },
  };
}

function providerRouteForSlot(slot) {
  const route = state.providerSlotRoutes?.[slot] || {};
  const snapshot = getRuntimeWorkspaceSnapshot();
  const candidateIds = {
    concept: ["deepseek", "openai", "aigocode", "google", "claude", "qwen"],
    image: ["openai", "aigocode", "google", "qwen"],
    styleReference: ["openai", "aigocode", "google", "claude", "qwen"],
    compositionReference: ["openai", "aigocode", "google", "claude", "qwen"],
  }[slot] || [state.provider];
  const configuredProvider = candidateIds.find((providerId) => {
    const config = snapshot.providerConfigs?.[providerId];
    return config?.hasApiKey || config?.status === "success";
  });
  const supportedCurrentProvider = candidateIds.includes(state.provider) ? state.provider : "";
  return {
    providerId: route.providerId || configuredProvider || supportedCurrentProvider || candidateIds[0] || state.provider,
    ...(route.model ? { model: route.model } : {}),
  };
}

function getProviderRoutesForSubmission() {
  const imageRoute = providerRouteForSlot("image");
  return {
    concept: providerRouteForSlot("concept"),
    image: imageRoute,
    styleReference: providerRouteForSlot("styleReference"),
    compositionReference: providerRouteForSlot("compositionReference"),
    imageEdit: imageRoute,
    upscale: imageRoute,
    backgroundRemoval: imageRoute,
  };
}

export async function submitGenerationDraft(options = {}) {
  const snapshot = createBoundWorkspaceSnapshot();
  const validation = validateBoundFrontendForms(snapshot);
  const promptPackageCreate = buildPromptPackageCreateSubmission(snapshot);
  const queuePlanCreate = buildQueuePlanCreateSubmission(snapshot);
  const selected = getSelectedScheme();
  const activeMode = getActiveMode();

  const submission = {
    status: validation.ok ? "submitting" : "invalid",
    traceId: createTraceId(),
    createdAt: nowIso(),
    mode: activeMode.id,
    schemeId: selected.id,
    schemeTitle: selected.title,
    providerId: providerRouteForSlot("image").providerId,
    providerRoutes: getProviderRoutesForSubmission(),
    transport: shouldUseHttpServiceFlow() ? "http" : "static",
    validation,
    promptPackageCreate,
    queuePlanCreate,
    serviceFlow: null,
  };

  state.submission = submission;

  if (validation.ok) {
    const serviceFlow = shouldUseHttpServiceFlow()
      ? await runHttpGenerationServiceFlow(submission, options)
      : await runStaticGenerationServiceFlow(submission);
    if (serviceFlow.workspaceReload?.ok && serviceFlow.workspaceReload.data?.snapshot) {
      setRuntimeWorkspaceSnapshot(serviceFlow.workspaceReload.data.snapshot, serviceFlow.transport || "http");
    }
    state.submission = {
      ...submission,
      status: serviceFlow.ok ? "service-ready" : "service-error",
      transport: serviceFlow.transport || "static",
      serviceFlow,
    };
  } else {
    state.submission = {
      ...submission,
      serviceFlow: {
        ok: false,
        reason: "validation_failed",
      },
    };
  }

  saveLocalSubmissionDraft(state.submission);

  return state.submission;
}
