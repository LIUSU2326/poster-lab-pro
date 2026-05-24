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

export function containsUnredactedSecret(value: unknown): boolean {
  if (typeof value === "string") {
    const appearsSecretLike = /(sk-|api[_-]?key|secret|token)/i.test(value);
    const appearsMasked = value.includes("****") || value.includes("••••");
    return appearsSecretLike && !appearsMasked;
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsUnredactedSecret(item));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, item]) => {
      if (/^apiKey$/i.test(key)) return Boolean(item);
      return containsUnredactedSecret(item);
    });
  }

  return false;
}
