export const AIGOCODE_ROOT_BASE_URL = "https://api.aigocode.app";
export const AIGOCODE_DEFAULT_BASE_URL = `${AIGOCODE_ROOT_BASE_URL}/v1`;
export const AIGOCODE_GEMINI_ROOT_BASE_URL = "https://api.aigocode.com";
export const AIGOCODE_GEMINI_DEFAULT_BASE_URL = `${AIGOCODE_GEMINI_ROOT_BASE_URL}/v1beta`;
export const AIGOCODE_DEFAULT_IMAGE_MODEL = "gpt-image-1";

const AIGOCODE_LEGACY_HOST_RE = /^https:\/\/api\.aigocode\.com(?=\/|$)/i;
const AIGOCODE_ROOT_RE = /^https:\/\/api\.aigocode\.app\/?$/i;
const AIGOCODE_GEMINI_HOST_RE = /^https:\/\/api\.aigocode\.com(?=\/|$)/i;
const AIGOCODE_GEMINI_ROOT_RE = /^https:\/\/api\.aigocode\.com\/?$/i;
const AIGOCODE_GEMINI_PATH_RE = /\/v1beta(?:\/|$)/i;
const AIGOCODE_RELAY_IMAGE_ALIASES = new Set(["image-2", "image-1", "dall-e-3"]);

export function normalizeAigocodeBaseUrl(value?: string | null): string {
  const raw = (value || AIGOCODE_DEFAULT_BASE_URL).trim();
  if (!raw) return AIGOCODE_DEFAULT_BASE_URL;
  const migrated = raw.replace(AIGOCODE_LEGACY_HOST_RE, AIGOCODE_ROOT_BASE_URL).replace(/\/+$/, "");
  if (AIGOCODE_ROOT_RE.test(migrated)) return AIGOCODE_DEFAULT_BASE_URL;
  return migrated;
}

export function isAigocodeGeminiBaseUrl(value?: string | null): boolean {
  const raw = (value || "").trim().replace(/\/+$/, "");
  if (!raw) return false;
  return AIGOCODE_GEMINI_HOST_RE.test(raw) || AIGOCODE_GEMINI_PATH_RE.test(raw);
}

export function normalizeAigocodeGeminiBaseUrl(value?: string | null): string {
  const raw = (value || AIGOCODE_GEMINI_DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  if (!raw) return AIGOCODE_GEMINI_DEFAULT_BASE_URL;
  if (AIGOCODE_GEMINI_ROOT_RE.test(raw)) return AIGOCODE_GEMINI_DEFAULT_BASE_URL;
  if (AIGOCODE_GEMINI_HOST_RE.test(raw) && !AIGOCODE_GEMINI_PATH_RE.test(raw)) {
    return `${raw}/v1beta`;
  }
  return raw;
}

export function normalizeAigocodeImageModel(value?: string | null): string {
  const model = (value || "").trim();
  if (!model || AIGOCODE_RELAY_IMAGE_ALIASES.has(model)) return AIGOCODE_DEFAULT_IMAGE_MODEL;
  return model;
}

export function normalizeAigocodeGeminiModel(value?: string | null): string {
  const model = (value || "").trim();
  if (!model || model.startsWith("gpt-") || model.startsWith("image-")) return "gemini-2.5-flash";
  return model.replace(/^models\//, "");
}
