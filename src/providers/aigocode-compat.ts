export const AIGOCODE_ROOT_BASE_URL = "https://api.aigocode.app";
export const AIGOCODE_DEFAULT_BASE_URL = `${AIGOCODE_ROOT_BASE_URL}/v1`;
export const AIGOCODE_DEFAULT_IMAGE_MODEL = "gpt-image-1";

const AIGOCODE_LEGACY_HOST_RE = /^https:\/\/api\.aigocode\.com(?=\/|$)/i;
const AIGOCODE_ROOT_RE = /^https:\/\/api\.aigocode\.app\/?$/i;
const AIGOCODE_RELAY_IMAGE_ALIASES = new Set(["image-2", "image-1", "dall-e-3"]);

export function normalizeAigocodeBaseUrl(value?: string | null): string {
  const raw = (value || AIGOCODE_DEFAULT_BASE_URL).trim();
  if (!raw) return AIGOCODE_DEFAULT_BASE_URL;
  const migrated = raw.replace(AIGOCODE_LEGACY_HOST_RE, AIGOCODE_ROOT_BASE_URL).replace(/\/+$/, "");
  if (AIGOCODE_ROOT_RE.test(migrated)) return AIGOCODE_DEFAULT_BASE_URL;
  return migrated;
}

export function normalizeAigocodeImageModel(value?: string | null): string {
  const model = (value || "").trim();
  if (!model || AIGOCODE_RELAY_IMAGE_ALIASES.has(model)) return AIGOCODE_DEFAULT_IMAGE_MODEL;
  return model;
}
