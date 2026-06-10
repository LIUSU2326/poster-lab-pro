const SUBMISSION_KEY = "poster-lab-pro:latest-submission";
const PROVIDER_PREFERENCES_KEY = "poster-lab-pro:provider-preferences";
const OUTPUT_PREFERENCES_KEY = "poster-lab-pro:output-preferences";
const PROVIDER_ROUTE_MIGRATION_VERSION = 2;
const MIMO_GOOGLE_KV_ROUTE_PLAN = { id: "mimo-google-kv", name: "MiMo + Google KV" };
const MIMO_AGNES_ROUTE_PLAN = { id: "mimo-agnes", name: "MiMo + Agnes 测试" };

function createMimoGoogleKvRoutes(baseRoutes = {}) {
  return {
    ...(baseRoutes || {}),
    concept: { providerId: "mimo", model: "mimo-v2.5-pro" },
    image: { providerId: "google", model: "gemini-3-pro-image-preview" },
    styleReference: { providerId: "mimo", model: "mimo-v2-omni" },
    compositionReference: { providerId: "mimo", model: "mimo-v2-omni" },
  };
}

function ensureDefaultRoutePlans(plans = [], deletedPlanIds = []) {
  const deleted = new Set(Array.isArray(deletedPlanIds) ? deletedPlanIds.filter(Boolean) : []);
  const normalized = Array.isArray(plans)
    ? plans.filter((plan) => plan?.id && plan.id !== "agnes-core")
    : [];
  const hasPlan = (planId) => normalized.some((plan) => plan?.id === planId);
  return [
    ...normalized.filter((plan) => !deleted.has(plan.id)),
    ...(!deleted.has(MIMO_GOOGLE_KV_ROUTE_PLAN.id) && !hasPlan(MIMO_GOOGLE_KV_ROUTE_PLAN.id) ? [MIMO_GOOGLE_KV_ROUTE_PLAN] : []),
    ...(!deleted.has(MIMO_AGNES_ROUTE_PLAN.id) && !hasPlan(MIMO_AGNES_ROUTE_PLAN.id) ? [MIMO_AGNES_ROUTE_PLAN] : []),
  ];
}

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
    providerRouteDeletedPlanIds: Array.isArray(state.providerRouteDeletedPlanIds) ? state.providerRouteDeletedPlanIds : [],
    providerRouteMigrationVersion: PROVIDER_ROUTE_MIGRATION_VERSION,
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
  const migrationVersion = Number(preferences.providerRouteMigrationVersion || 0);
  const savedImageProvider = preferences.providerSlotRoutes?.image?.providerId || "";
  const routePlanId = preferences.providerRoutePlan || "standard";
  const migrateDefaultAgnesRoute =
    migrationVersion < PROVIDER_ROUTE_MIGRATION_VERSION
    && savedImageProvider === "agnes"
    && ["standard", "image-first", "mimo-agnes"].includes(routePlanId);
  const shouldMigrateToGoogleKvRoute = migrateAgnesCoreRoute || migrateDefaultAgnesRoute;

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
    state.providerRoutePlan = shouldMigrateToGoogleKvRoute ? MIMO_GOOGLE_KV_ROUTE_PLAN.id : preferences.providerRoutePlan;
  }
  if (typeof preferences.providerRoutingOpen === "boolean") {
    state.providerRoutingOpen = preferences.providerRoutingOpen;
  }
  if (Array.isArray(preferences.providerRouteDeletedPlanIds)) {
    state.providerRouteDeletedPlanIds = preferences.providerRouteDeletedPlanIds.filter(Boolean);
  }
  if (Array.isArray(preferences.providerRoutePlans) && preferences.providerRoutePlans.length > 0) {
    state.providerRoutePlans = ensureDefaultRoutePlans(preferences.providerRoutePlans, state.providerRouteDeletedPlanIds);
  }
  if (shouldMigrateToGoogleKvRoute) {
    state.provider = "google";
    state.providerSlotRoutes = createMimoGoogleKvRoutes(state.providerSlotRoutes);
    saveLocalProviderPreferences(state);
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
