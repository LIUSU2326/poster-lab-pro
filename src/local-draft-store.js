const SUBMISSION_KEY = "poster-lab-pro:latest-submission";
const PROVIDER_PREFERENCES_KEY = "poster-lab-pro:provider-preferences";
const OUTPUT_PREFERENCES_KEY = "poster-lab-pro:output-preferences";

function hasStorage() {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function containsPlainSecret(value) {
  if (typeof value === "string") {
    const looksSecret = /(sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9_]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|Bearer\s+[A-Za-z0-9._-]{10,}|(?:api[_-]?key|secret|token)\s*[:=]\s*[A-Za-z0-9._-]{10,})/i.test(value);
    const isMasked = value.includes("****") || value.includes("••••");
    return looksSecret && !isMasked;
  }

  if (Array.isArray(value)) return value.some((item) => containsPlainSecret(item));

  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, item]) => {
      if (/^apiKey$/i.test(key) && item) return true;
      return containsPlainSecret(item);
    });
  }

  return false;
}

export function saveLocalSubmissionDraft(submission) {
  if (!hasStorage() || !submission) return false;
  if (containsPlainSecret(submission)) {
    throw new Error("Refusing to persist a submission draft with unredacted secrets.");
  }

  window.localStorage.setItem(SUBMISSION_KEY, JSON.stringify(submission));
  return true;
}

export function loadLocalSubmissionDraft() {
  if (!hasStorage()) return null;
  const raw = window.localStorage.getItem(SUBMISSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return containsPlainSecret(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

export function clearLocalSubmissionDraft() {
  if (!hasStorage()) return false;
  window.localStorage.removeItem(SUBMISSION_KEY);
  return true;
}

export function hydrateLocalSubmissionDraft(state) {
  const submission = loadLocalSubmissionDraft();
  if (!submission) return false;
  state.submission = submission;
  return true;
}

function providerPreferencesFromState(state) {
  return {
    provider: state.provider,
    providerOrder: Array.isArray(state.providerOrder) ? state.providerOrder : [],
    providerModelOverrides: state.providerModelOverrides || {},
    providerCustomModels: state.providerCustomModels || {},
    providerSlotRoutes: state.providerSlotRoutes || {},
    providerRoutePlan: state.providerRoutePlan || "standard",
    providerRoutingOpen: Boolean(state.providerRoutingOpen),
    providerRoutePlans: Array.isArray(state.providerRoutePlans) ? state.providerRoutePlans : [],
  };
}

function outputPreferencesFromState(state) {
  const modeOutputSettings = Object.fromEntries(
    (state.workspaceSnapshot?.modeStates || [])
      .filter((modeState) => modeState?.mode && modeState?.outputSettings)
      .map((modeState) => [modeState.mode, modeState.outputSettings]),
  );
  return {
    outputSelectionMode: state.outputSelectionMode || "single",
    outputPlanStrategy: state.outputPlanStrategy || "unified",
    outputCustomSuiteEnabled: Boolean(state.outputCustomSuiteEnabled),
    outputCustomSuiteSizes: Array.isArray(state.outputCustomSuiteSizes) ? state.outputCustomSuiteSizes : [],
    outputCustomSuites: Array.isArray(state.outputCustomSuites) ? state.outputCustomSuites : [],
    outputActiveCustomSuiteId: state.outputActiveCustomSuiteId || "",
    modeOutputSettings,
  };
}

export function saveLocalProviderPreferences(state) {
  if (!hasStorage() || !state) return false;
  const preferences = providerPreferencesFromState(state);
  if (containsPlainSecret(preferences)) {
    throw new Error("Refusing to persist provider preferences with unredacted secrets.");
  }

  window.localStorage.setItem(PROVIDER_PREFERENCES_KEY, JSON.stringify(preferences));
  return true;
}

export function loadLocalProviderPreferences() {
  if (!hasStorage()) return null;
  const raw = window.localStorage.getItem(PROVIDER_PREFERENCES_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return containsPlainSecret(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

export function hydrateLocalProviderPreferences(state) {
  const preferences = loadLocalProviderPreferences();
  if (!preferences || !state) return false;
  const migrateAgnesCoreRoute = preferences.providerRoutePlan === "agnes-core";

  if (typeof preferences.provider === "string") state.provider = preferences.provider;
  if (Array.isArray(preferences.providerOrder)) state.providerOrder = preferences.providerOrder;
  if (preferences.providerModelOverrides && typeof preferences.providerModelOverrides === "object") {
    state.providerModelOverrides = preferences.providerModelOverrides;
  }
  if (preferences.providerCustomModels && typeof preferences.providerCustomModels === "object") {
    state.providerCustomModels = preferences.providerCustomModels;
  }
  if (preferences.providerSlotRoutes && typeof preferences.providerSlotRoutes === "object") {
    state.providerSlotRoutes = preferences.providerSlotRoutes;
  }
  if (typeof preferences.providerRoutePlan === "string") {
    state.providerRoutePlan = migrateAgnesCoreRoute ? "mimo-agnes" : preferences.providerRoutePlan;
  }
  if (typeof preferences.providerRoutingOpen === "boolean") {
    state.providerRoutingOpen = preferences.providerRoutingOpen;
  }
  if (Array.isArray(preferences.providerRoutePlans) && preferences.providerRoutePlans.length > 0) {
    state.providerRoutePlans = [
      ...preferences.providerRoutePlans.filter((plan) => plan?.id !== "agnes-core"),
      ...(!preferences.providerRoutePlans.some((plan) => plan?.id === "mimo-agnes")
        ? [{ id: "mimo-agnes", name: "MiMo + Agnes 测试" }]
        : []),
    ];
  }
  if (migrateAgnesCoreRoute) {
    state.provider = "agnes";
    state.providerSlotRoutes = {
      ...(state.providerSlotRoutes || {}),
      concept: { providerId: "mimo", model: "mimo-v2.5-pro" },
      image: { providerId: "agnes", model: "agnes-image-2.1-flash" },
      styleReference: { providerId: "mimo", model: "mimo-v2-omni" },
      compositionReference: { providerId: "mimo", model: "mimo-v2-omni" },
    };
  }
  return true;
}

export function saveLocalOutputPreferences(state) {
  if (!hasStorage() || !state) return false;
  const preferences = outputPreferencesFromState(state);
  if (containsPlainSecret(preferences)) {
    throw new Error("Refusing to persist output preferences with unredacted secrets.");
  }

  window.localStorage.setItem(OUTPUT_PREFERENCES_KEY, JSON.stringify(preferences));
  return true;
}

export function loadLocalOutputPreferences() {
  if (!hasStorage()) return null;
  const raw = window.localStorage.getItem(OUTPUT_PREFERENCES_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return containsPlainSecret(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

export function hydrateLocalOutputPreferences(state) {
  const preferences = loadLocalOutputPreferences();
  if (!preferences || !state) return false;

  if (typeof preferences.outputSelectionMode === "string") state.outputSelectionMode = preferences.outputSelectionMode;
  if (typeof preferences.outputPlanStrategy === "string") state.outputPlanStrategy = preferences.outputPlanStrategy;
  if (typeof preferences.outputCustomSuiteEnabled === "boolean") {
    state.outputCustomSuiteEnabled = preferences.outputCustomSuiteEnabled;
  }
  if (Array.isArray(preferences.outputCustomSuiteSizes)) {
    state.outputCustomSuiteSizes = preferences.outputCustomSuiteSizes;
  }
  if (Array.isArray(preferences.outputCustomSuites)) {
    state.outputCustomSuites = preferences.outputCustomSuites;
  }
  if (typeof preferences.outputActiveCustomSuiteId === "string") {
    state.outputActiveCustomSuiteId = preferences.outputActiveCustomSuiteId;
  }

  const savedByMode = preferences.modeOutputSettings && typeof preferences.modeOutputSettings === "object"
    ? preferences.modeOutputSettings
    : {};
  if (state.workspaceSnapshot && Array.isArray(state.workspaceSnapshot.modeStates)) {
    state.workspaceSnapshot = {
      ...state.workspaceSnapshot,
      modeStates: state.workspaceSnapshot.modeStates.map((modeState) => {
        const saved = savedByMode[modeState.mode];
        return saved && typeof saved === "object"
          ? { ...modeState, outputSettings: { ...modeState.outputSettings, ...saved } }
          : modeState;
      }),
    };
  }

  return true;
}
