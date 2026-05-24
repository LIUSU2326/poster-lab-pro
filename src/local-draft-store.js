const SUBMISSION_KEY = "poster-lab-pro:latest-submission";

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

export function hydrateLocalSubmissionDraft(state) {
  const submission = loadLocalSubmissionDraft();
  if (!submission) return false;
  state.submission = submission;
  return true;
}
