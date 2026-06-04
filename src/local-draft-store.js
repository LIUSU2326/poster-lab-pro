const SUBMISSION_KEY = "poster-lab-pro:latest-submission";
const PROVIDER_PREFERENCES_KEY = "poster-lab-pro:provider-preferences";

function hasStorage() {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function containsPlainSecret(value) {
  if (typeof value === "string") {
    const looksSecret = /(sk-|api[_-]?key|secret|token)/i.test(value);
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
    providerModelOverrides: state.providerModelOverrides || {},
    providerCustomModels: state.providerCustomModels || {},
    providerSlotRoutes: state.providerSlotRoutes || {},
    providerRoutePlan: state.providerRoutePlan || "standard",
    providerRoutePlans: Array.isArray(state.providerRoutePlans) ? state.providerRoutePlans : [],
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

  if (typeof preferences.provider === "string") state.provider = preferences.provider;
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
    state.providerRoutePlan = preferences.providerRoutePlan;
  }
  if (Array.isArray(preferences.providerRoutePlans) && preferences.providerRoutePlans.length > 0) {
    state.providerRoutePlans = preferences.providerRoutePlans;
  }
  return true;
}
