export const MIMO_DEFAULT_BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1";
export const MIMO_DEFAULT_MODEL = "mimo-v2.5-pro";

const MIMO_LEGACY_BASE_URLS = new Set([
  "https://api.xiaomimimo.com/v1",
]);

const MIMO_LEGACY_MODELS = new Set([
  "mimo-v2.3",
  "mimo-v2.2",
  "mimo-v2.1",
]);

export function normalizeMimoBaseUrl(value: string | null | undefined): string {
  const normalized = (value?.trim() || MIMO_DEFAULT_BASE_URL).replace(/\/+$/, "");
  return MIMO_LEGACY_BASE_URLS.has(normalized) ? MIMO_DEFAULT_BASE_URL : normalized;
}

export function normalizeMimoModel(value: string | null | undefined): string {
  const normalized = value?.trim() || MIMO_DEFAULT_MODEL;
  return MIMO_LEGACY_MODELS.has(normalized) ? MIMO_DEFAULT_MODEL : normalized;
}

export function normalizeMimoProviderBaseUrl(providerId: string, value: string | null | undefined): string {
  if (providerId === "mimo") return normalizeMimoBaseUrl(value);
  return (value?.trim() || "").replace(/\/+$/, "");
}

export function normalizeMimoProviderModel(providerId: string, value: string | null | undefined): string {
  if (providerId === "mimo") return normalizeMimoModel(value);
  return value?.trim() || "";
}
