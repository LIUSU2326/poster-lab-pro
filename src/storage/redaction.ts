import type { ProviderConfigForm, ProviderId } from "../schema/zod";
import { StoredProviderConfigSchema, type StoredProviderConfig } from "./contracts";

export function maskApiKey(value: string | undefined): string {
  const normalized = value?.trim() || "";
  if (!normalized) return "";
  if (normalized.length <= 8) return "****";
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

export function redactProviderConfig(
  config: ProviderConfigForm,
  options: { status?: StoredProviderConfig["status"]; updatedAt?: string } = {},
): StoredProviderConfig {
  const apiKeyMasked = maskApiKey(config.apiKey);

  return StoredProviderConfigSchema.parse({
    providerId: config.providerId,
    enabled: config.enabled,
    status: options.status || "idle",
    hasApiKey: apiKeyMasked.length > 0,
    apiKeyMasked,
    baseUrl: config.baseUrl || "",
    defaultModel: config.defaultModel || "",
    modelSlots: config.modelSlots,
    updatedAt: options.updatedAt || new Date().toISOString(),
  });
}

export function redactProviderConfigs(
  configs: ProviderConfigForm[],
  options: { updatedAt?: string } = {},
): Partial<Record<ProviderId, StoredProviderConfig>> {
  return configs.reduce<Partial<Record<ProviderId, StoredProviderConfig>>>((acc, config) => {
    const redactOptions: { status: StoredProviderConfig["status"]; updatedAt?: string } = {
      status: config.enabled ? "success" : "idle",
    };
    if (options.updatedAt) redactOptions.updatedAt = options.updatedAt;
    acc[config.providerId] = redactProviderConfig(config, redactOptions);
    return acc;
  }, {});
}

function isMaskedSecret(value: string): boolean {
  return value.includes("****") || value.includes("••••");
}

function looksLikeSecretValue(value: string): boolean {
  return /(sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9_]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|Bearer\s+[A-Za-z0-9._-]{10,})/.test(value);
}

function isSecretFieldName(key: string): boolean {
  return /^(apiKey|accessToken|refreshToken|secret|password|credential)$/i.test(key);
}

export function containsUnredactedSecret(value: unknown, keyName = ""): boolean {
  if (typeof value === "string") {
    if (!value.trim() || isMaskedSecret(value)) return false;
    return looksLikeSecretValue(value) || isSecretFieldName(keyName);
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsUnredactedSecret(item, keyName));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, item]) => {
      if (/^apiKey$/i.test(key)) return Boolean(item);
      return containsUnredactedSecret(item, key);
    });
  }

  return false;
}
