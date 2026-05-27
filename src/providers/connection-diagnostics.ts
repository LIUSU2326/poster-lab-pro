import { z } from "zod";
import type { ProviderId } from "../schema/zod";
import type { StoredProviderConfig } from "../storage/contracts";
import {
  ProviderConnectionTestRequestSchema,
  ProviderConnectionTestResultSchema,
  type ProviderConnectionTestRequest,
  type ProviderConnectionTestResult,
} from "./connection-diagnostic-contracts";
import type { CredentialResolver, ProviderCredentialRef } from "./credentials";
import type { ProviderErrorCode } from "./contracts";
import { getProviderManifest } from "./manifests";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_AIGOCODE_BASE_URL = "https://api.aigocode.com/v1";
const DEFAULT_GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_CLAUDE_BASE_URL = "https://api.anthropic.com/v1";
const DEFAULT_QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

export const ProviderConnectionTransportRequestSchema = z.object({
  url: z.string().url(),
  method: z.literal("GET"),
  headers: z.record(z.string(), z.string()).default({}),
  timeoutMs: z.number().int().min(1000).max(30000),
});

export const ProviderConnectionTransportResponseSchema = z.object({
  ok: z.boolean(),
  status: z.number().int(),
  body: z.unknown(),
});

export type ProviderConnectionTransportRequest = z.infer<typeof ProviderConnectionTransportRequestSchema>;
export type ProviderConnectionTransportResponse = z.infer<typeof ProviderConnectionTransportResponseSchema>;
export type ProviderConnectionTransport = (
  request: ProviderConnectionTransportRequest,
) => Promise<ProviderConnectionTransportResponse>;

const ModelListResponseSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            id: z.string().min(1).optional(),
            name: z.string().min(1).optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export function createProviderConnectionFetchTransport(fetchImpl: typeof fetch): ProviderConnectionTransport {
  return async (request) => {
    const parsed = ProviderConnectionTransportRequestSchema.parse(request);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), parsed.timeoutMs);

    try {
      const response = await fetchImpl(parsed.url, {
        method: parsed.method,
        headers: parsed.headers,
        signal: controller.signal,
      });

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      return ProviderConnectionTransportResponseSchema.parse({
        ok: response.ok,
        status: response.status,
        body,
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function result(input: {
  providerId: ProviderId;
  ok: boolean;
  status: ProviderConnectionTestResult["status"];
  attemptedNetwork: boolean;
  startedAt: number;
  message: string;
  userMessage: string;
  errorCode?: ProviderErrorCode | undefined;
  retryable?: boolean;
  modelCount?: number;
  defaultModel?: string | undefined;
  defaultModelAvailable?: boolean | undefined;
  sampledModels?: string[];
}): ProviderConnectionTestResult {
  return ProviderConnectionTestResultSchema.parse({
    providerId: input.providerId,
    ok: input.ok,
    status: input.status,
    attemptedNetwork: input.attemptedNetwork,
    checkedAt: nowIso(),
    elapsedMs: Math.max(0, Date.now() - input.startedAt),
    message: input.message,
    userMessage: input.userMessage,
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    retryable: input.retryable ?? false,
    ...(typeof input.modelCount === "number" ? { modelCount: input.modelCount } : {}),
    ...(input.defaultModel ? { defaultModel: input.defaultModel } : {}),
    ...(typeof input.defaultModelAvailable === "boolean"
      ? { defaultModelAvailable: input.defaultModelAvailable }
      : {}),
    sampledModels: input.sampledModels || [],
  });
}

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback).replace(/\/+$/, "");
}

function probeUrl(config: StoredProviderConfig): string {
  if (config.providerId === "openai") return `${normalizeBaseUrl(config.baseUrl, DEFAULT_OPENAI_BASE_URL)}/models`;
  if (config.providerId === "aigocode") return `${normalizeBaseUrl(config.baseUrl, DEFAULT_AIGOCODE_BASE_URL)}/models`;
  if (config.providerId === "google") return `${normalizeBaseUrl(config.baseUrl, DEFAULT_GOOGLE_BASE_URL)}/models`;
  if (config.providerId === "deepseek") return `${normalizeBaseUrl(config.baseUrl, DEFAULT_DEEPSEEK_BASE_URL)}/models`;
  if (config.providerId === "claude") return `${normalizeBaseUrl(config.baseUrl, DEFAULT_CLAUDE_BASE_URL)}/models`;
  if (config.providerId === "qwen") return `${normalizeBaseUrl(config.baseUrl, DEFAULT_QWEN_BASE_URL)}/models`;
  return normalizeBaseUrl(config.baseUrl, "");
}

function providerHeaders(providerId: ProviderId, apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
  };
  if (!apiKey) return headers;
  if (providerId === "google") {
    headers["x-goog-api-key"] = apiKey;
    return headers;
  }
  if (providerId === "claude") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    return headers;
  }
  headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function modelIds(body: unknown): string[] {
  const parsed = ModelListResponseSchema.safeParse(body);
  if (parsed.success) {
    return parsed.data.data
      .map((item) => item.id || item.name || "")
      .filter((item): item is string => item.length > 0);
  }

  const googleParsed = z
    .object({
      models: z
        .array(
          z
            .object({
              name: z.string().min(1).optional(),
              displayName: z.string().min(1).optional(),
            })
            .passthrough(),
        )
        .default([]),
    })
    .passthrough()
    .safeParse(body);
  if (!googleParsed.success) return [];
  return googleParsed.data.models
    .map((item) => item.name || item.displayName || "")
    .map((item) => item.replace(/^models\//, ""))
    .filter((item): item is string => item.length > 0);
}

function modelFamilyAvailable(providerId: ProviderId, defaultModel: string, ids: string[]): boolean {
  if (ids.length === 0 || ids.includes(defaultModel)) return true;
  if ((providerId === "openai" || providerId === "aigocode") && defaultModel.startsWith("gpt-image-")) {
    return ids.some((id) => id.startsWith("gpt-image-"));
  }
  if (providerId === "google" && defaultModel.startsWith("gemini-")) {
    return ids.some((id) => id.startsWith("gemini-"));
  }
  return false;
}

function resultFromStatus(input: {
  providerId: ProviderId;
  statusCode: number;
  body: unknown;
  startedAt: number;
  defaultModel?: string | undefined;
}): ProviderConnectionTestResult {
  const bodyMessage = z
    .object({
      error: z
        .object({
          message: z.string().optional(),
        })
        .passthrough()
        .optional(),
      message: z.string().optional(),
    })
    .passthrough()
    .safeParse(input.body);
  const message = bodyMessage.success
    ? bodyMessage.data.error?.message || bodyMessage.data.message || `Provider returned HTTP ${input.statusCode}.`
    : `Provider returned HTTP ${input.statusCode}.`;

  if (input.statusCode === 401 || input.statusCode === 403) {
    return result({
      providerId: input.providerId,
      ok: false,
      status: "auth_failed",
      attemptedNetwork: true,
      startedAt: input.startedAt,
      message,
      userMessage: "Provider authentication failed. Check the saved API Key and account access.",
      errorCode: "auth_failed",
    });
  }

  if (input.statusCode === 402) {
    return result({
      providerId: input.providerId,
      ok: false,
      status: "degraded",
      attemptedNetwork: true,
      startedAt: input.startedAt,
      message,
      userMessage: "Provider billing or quota is unavailable for this account.",
      errorCode: "quota_exceeded",
    });
  }

  if (input.statusCode === 429) {
    return result({
      providerId: input.providerId,
      ok: false,
      status: "degraded",
      attemptedNetwork: true,
      startedAt: input.startedAt,
      message,
      userMessage: "Provider rate limit was reached. Try again after the provider limit resets.",
      errorCode: "rate_limited",
      retryable: true,
    });
  }

  if (input.statusCode >= 500) {
    return result({
      providerId: input.providerId,
      ok: false,
      status: "unavailable",
      attemptedNetwork: true,
      startedAt: input.startedAt,
      message,
      userMessage: "Provider is temporarily unavailable. Try again later.",
      errorCode: "provider_unavailable",
      retryable: true,
    });
  }

  return result({
    providerId: input.providerId,
    ok: false,
    status: "degraded",
    attemptedNetwork: true,
    startedAt: input.startedAt,
    message,
    userMessage: "Provider responded, but the readiness probe was not accepted.",
    errorCode: "invalid_request",
    defaultModel: input.defaultModel,
  });
}

async function resolveApiKey(input: {
  providerId: ProviderId;
  credentialRef: ProviderCredentialRef | null | undefined;
  resolver: CredentialResolver;
  startedAt: number;
}): Promise<{ ok: true; apiKey: string } | { ok: false; result: ProviderConnectionTestResult }> {
  if (!input.credentialRef) {
    return {
      ok: false,
      result: result({
        providerId: input.providerId,
        ok: false,
        status: "not_configured",
        attemptedNetwork: false,
        startedAt: input.startedAt,
        message: "Provider credential is not configured.",
        userMessage: "Save an API Key before testing this provider connection.",
        errorCode: "missing_config",
      }),
    };
  }

  const resolved = await input.resolver.resolveCredential(input.credentialRef);
  if (!resolved.ok) {
    return {
      ok: false,
      result: result({
        providerId: input.providerId,
        ok: false,
        status: resolved.error.code === "auth_failed" ? "auth_failed" : "not_configured",
        attemptedNetwork: false,
        startedAt: input.startedAt,
        message: resolved.error.message,
        userMessage: resolved.error.userMessage,
        errorCode: resolved.error.code,
        retryable: resolved.error.retryable,
      }),
    };
  }

  return { ok: true, apiKey: resolved.value.apiKey };
}

export async function runProviderConnectionDiagnostic(input: {
  request: ProviderConnectionTestRequest;
  storedConfig: StoredProviderConfig | null;
  credentialRef?: ProviderCredentialRef | null | undefined;
  resolver: CredentialResolver;
  transport?: ProviderConnectionTransport | undefined;
}): Promise<ProviderConnectionTestResult> {
  const parsed = ProviderConnectionTestRequestSchema.parse(input.request);
  const startedAt = Date.now();
  const manifest = getProviderManifest(parsed.providerId);

  if (!input.storedConfig || (!input.storedConfig.enabled && !input.credentialRef)) {
    return result({
      providerId: parsed.providerId,
      ok: false,
      status: "not_configured",
      attemptedNetwork: false,
      startedAt,
      message: `${manifest.displayName} provider is not enabled.`,
      userMessage: "Enable and configure this provider before testing the connection.",
      errorCode: "missing_config",
    });
  }

  if (manifest.baseUrlRequired && !input.storedConfig.baseUrl.trim()) {
    return result({
      providerId: parsed.providerId,
      ok: false,
      status: "not_configured",
      attemptedNetwork: false,
      startedAt,
      message: `${manifest.displayName} provider requires a Base URL.`,
      userMessage: "Set a Base URL before testing this provider.",
      errorCode: "missing_config",
    });
  }

  const defaultModel = input.storedConfig.defaultModel || input.storedConfig.modelSlots.image || manifest.modelSlots.image?.[0];
  let apiKey = "";
  if (manifest.apiKeyRequired) {
    const resolved = await resolveApiKey({
      providerId: parsed.providerId,
      credentialRef: input.credentialRef,
      resolver: input.resolver,
      startedAt,
    });
    if (!resolved.ok) return resolved.result;
    apiKey = resolved.apiKey;
  } else if (input.credentialRef) {
    const resolved = await input.resolver.resolveCredential(input.credentialRef);
    if (resolved.ok) apiKey = resolved.value.apiKey;
  }

  if (!input.transport) {
    return result({
      providerId: parsed.providerId,
      ok: false,
      status: "degraded",
      attemptedNetwork: false,
      startedAt,
      message: "No provider diagnostic transport was supplied.",
      userMessage: "Connection test transport is not available in this environment.",
      errorCode: "provider_unavailable",
      defaultModel,
    });
  }

  const url = probeUrl(input.storedConfig);
  if (!url) {
    return result({
      providerId: parsed.providerId,
      ok: false,
      status: "not_configured",
      attemptedNetwork: false,
      startedAt,
      message: `${manifest.displayName} provider does not have a probe URL.`,
      userMessage: "Set a provider Base URL before testing the connection.",
      errorCode: "missing_config",
    });
  }

  try {
    const response = await input.transport({
      url,
      method: "GET",
      headers: providerHeaders(parsed.providerId, apiKey),
      timeoutMs: parsed.timeoutMs,
    });

    if (!response.ok) {
      return resultFromStatus({
        providerId: parsed.providerId,
        statusCode: response.status,
        body: response.body,
        startedAt,
        defaultModel,
      });
    }

    const ids = parsed.verifyModels ? modelIds(response.body) : [];
    const defaultModelAvailable = defaultModel ? modelFamilyAvailable(parsed.providerId, defaultModel, ids) : undefined;
    const ok = !defaultModel || defaultModelAvailable !== false;

    return result({
      providerId: parsed.providerId,
      ok,
      status: ok ? "ready" : "degraded",
      attemptedNetwork: true,
      startedAt,
      message: ok
        ? `${manifest.displayName} connection test passed.`
        : `${manifest.displayName} responded, but the default model was not found in the model list.`,
      userMessage: ok
        ? "Provider connection is ready."
        : "Provider responded, but the selected default model was not found.",
      errorCode: ok ? undefined : "missing_config",
      modelCount: ids.length,
      defaultModel,
      defaultModelAvailable,
      sampledModels: ids.slice(0, 6),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return result({
      providerId: parsed.providerId,
      ok: false,
      status: "unavailable",
      attemptedNetwork: true,
      startedAt,
      message: aborted ? "Provider connection test timed out." : error instanceof Error ? error.message : "Provider connection failed.",
      userMessage: aborted
        ? "Provider connection timed out. If this API Key works elsewhere, check whether the desktop runtime is using the same proxy or VPN route."
        : "Provider connection could not be reached from this environment.",
      errorCode: "provider_unavailable",
      retryable: true,
      defaultModel,
    });
  }
}
