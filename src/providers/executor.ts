import { z } from "zod";
import { ProviderConfigFormSchema, ProviderIdSchema, type ProviderConfigForm, type ProviderId } from "../schema/zod";
import { StoredProviderConfigSchema, type StoredProviderConfig } from "../storage/contracts";
import { getProviderManifest } from "./manifests";
import {
  ProviderCredentialRefSchema,
  resolveProviderRuntimeConfig,
  type CredentialResolver,
} from "./credentials";
import {
  ProviderBackgroundRemovalMappedRequestSchema,
  ProviderMappedRequestSchema,
  ProviderBriefMappedRequestSchema,
  ProviderImageEditMappedRequestSchema,
  ProviderImageMappedRequestSchema,
  ProviderUpscaleMappedRequestSchema,
  type ProviderBackgroundRemovalMappedRequest,
  type ProviderBriefMappedRequest,
  type ProviderImageEditMappedRequest,
  type ProviderImageMappedRequest,
  type ProviderMappedRequest,
  type ProviderMappedRequestKind,
  type ProviderUpscaleMappedRequest,
} from "./request-mapper";
import {
  ProviderBriefResponseSchema,
  ProviderErrorSchema,
  ProviderImageResponseSchema,
  createProviderError,
  type GenerationProviderAdapter,
  type ProviderBriefResponse,
  type ProviderImageResponse,
  type ProviderResult,
} from "./contracts";
import { createMockProviderAdapter } from "./mock-adapter";
import { providerManifestList } from "./manifests";

export const ProviderExecutionInputSchema = z.object({
  mappedRequest: ProviderMappedRequestSchema,
  config: ProviderConfigFormSchema,
});

export const ProviderExecutionWithCredentialInputSchema = z.object({
  mappedRequest: ProviderMappedRequestSchema,
  storedConfig: StoredProviderConfigSchema,
  credentialRef: ProviderCredentialRefSchema.optional(),
});

export const ProviderExecutionResponseSchema = z.union([
  ProviderBriefResponseSchema,
  ProviderImageResponseSchema,
]);

export type ProviderExecutionInput = z.infer<typeof ProviderExecutionInputSchema>;
export type ProviderExecutionWithCredentialInput = z.infer<typeof ProviderExecutionWithCredentialInputSchema>;
export type ProviderExecutionResponse = z.infer<typeof ProviderExecutionResponseSchema>;
export type ProviderExecutionResult = ProviderResult<ProviderBriefResponse | ProviderImageResponse>;
export type ProviderAdapterRegistry = Partial<Record<ProviderId, GenerationProviderAdapter>>;

export function createMockProviderRegistry(): ProviderAdapterRegistry {
  return Object.fromEntries(
    providerManifestList.map((manifest) => [manifest.id, createMockProviderAdapter(manifest)]),
  ) as ProviderAdapterRegistry;
}

export function providerConfigFromStoredConfig(storedConfig: StoredProviderConfig): ProviderConfigForm {
  const parsed = StoredProviderConfigSchema.parse(storedConfig);
  return ProviderConfigFormSchema.parse({
    providerId: parsed.providerId,
    enabled: parsed.enabled,
    apiKey: "",
    baseUrl: parsed.baseUrl,
    defaultModel: parsed.defaultModel,
    modelSlots: parsed.modelSlots,
  });
}

function modelSlotForMappedKind(kind: ProviderMappedRequestKind): string | null {
  if (kind === "briefGeneration") return "concept";
  if (kind === "imageGeneration") return "image";
  if (kind === "imageEdit") return "imageEdit";
  if (kind === "upscale") return "upscale";
  if (kind === "backgroundRemoval") return "backgroundRemoval";
  return null;
}

function configForMappedRequestModel(config: ProviderConfigForm, mappedRequest: ProviderMappedRequest): ProviderConfigForm {
  const model = "model" in mappedRequest ? mappedRequest.model?.trim() : "";
  const slot = modelSlotForMappedKind(mappedRequest.kind);
  if (!model || !slot) return config;

  return ProviderConfigFormSchema.parse({
    ...config,
    defaultModel: config.defaultModel || model,
    modelSlots: {
      ...config.modelSlots,
      [slot]: model,
    },
  });
}

function missingAdapter(providerId: ProviderId): ProviderExecutionResult {
  return {
    ok: false,
    error: createProviderError(providerId, "unsupported_capability", `No adapter registered for ${providerId}.`, {
      userMessage: "当前 Provider 尚未注册可执行适配器。",
    }),
  };
}

function missingMethod(
  providerId: ProviderId,
  capability: ProviderMappedRequestKind,
): ProviderExecutionResult {
  return {
    ok: false,
    error: createProviderError(providerId, "unsupported_capability", `Adapter does not implement ${capability}.`, {
      userMessage: "当前 Provider 不支持该生成能力。",
    }),
  };
}

export async function executeMappedProviderRequest(
  input: ProviderExecutionInput,
  registry: ProviderAdapterRegistry = createMockProviderRegistry(),
): Promise<ProviderExecutionResult> {
  const parsed = ProviderExecutionInputSchema.parse(input);
  const providerId = ProviderIdSchema.parse(parsed.mappedRequest.providerId);
  const config = configForMappedRequestModel(parsed.config, parsed.mappedRequest);
  const adapter = registry[providerId];
  if (!adapter) return missingAdapter(providerId);

  if (parsed.mappedRequest.kind === "briefGeneration") {
    if (!adapter.generateBrief) return missingMethod(providerId, "briefGeneration");
    const mappedRequest: ProviderBriefMappedRequest = ProviderBriefMappedRequestSchema.parse(parsed.mappedRequest);
    return adapter.generateBrief(mappedRequest.request, config);
  }

  if (parsed.mappedRequest.kind === "imageGeneration") {
    if (!adapter.generateImage) return missingMethod(providerId, "imageGeneration");
    const mappedRequest: ProviderImageMappedRequest = ProviderImageMappedRequestSchema.parse(parsed.mappedRequest);
    return adapter.generateImage(mappedRequest.request, config);
  }

  if (parsed.mappedRequest.kind === "imageEdit") {
    if (!adapter.editImage) return missingMethod(providerId, "imageEdit");
    const mappedRequest: ProviderImageEditMappedRequest = ProviderImageEditMappedRequestSchema.parse(parsed.mappedRequest);
    return adapter.editImage(mappedRequest.request, config);
  }

  if (parsed.mappedRequest.kind === "upscale") {
    if (!adapter.upscale) return missingMethod(providerId, "upscale");
    const mappedRequest: ProviderUpscaleMappedRequest = ProviderUpscaleMappedRequestSchema.parse(parsed.mappedRequest);
    return adapter.upscale(mappedRequest.request, config);
  }

  if (!adapter.removeBackground) return missingMethod(providerId, "backgroundRemoval");
  const mappedRequest: ProviderBackgroundRemovalMappedRequest = ProviderBackgroundRemovalMappedRequestSchema.parse(parsed.mappedRequest);
  return adapter.removeBackground(mappedRequest.request, config);
}

export async function executeMappedProviderRequestWithCredentials(
  input: ProviderExecutionWithCredentialInput,
  resolver?: CredentialResolver,
  registry: ProviderAdapterRegistry = createMockProviderRegistry(),
): Promise<ProviderExecutionResult> {
  const parsed = ProviderExecutionWithCredentialInputSchema.parse(input);
  const providerId = ProviderIdSchema.parse(parsed.mappedRequest.providerId);
  const storedConfig = StoredProviderConfigSchema.parse(parsed.storedConfig);

  if (storedConfig.providerId !== providerId) {
    return {
      ok: false,
      error: createProviderError(providerId, "invalid_request", "Mapped request and stored provider config mismatch.", {
        userMessage: "Provider configuration does not match this request.",
      }),
    };
  }

  const runtimeConfig = await resolveProviderRuntimeConfig({
    storedConfig,
    ...(parsed.credentialRef ? { credentialRef: parsed.credentialRef } : {}),
    ...(resolver ? { resolver } : {}),
  });

  if (!runtimeConfig.ok) return runtimeConfig;

  const manifest = getProviderManifest(providerId);
  if (manifest.apiKeyRequired && !(runtimeConfig.value.apiKey || "").trim()) {
    return {
      ok: false,
      error: createProviderError(providerId, "auth_failed", "Provider API key is required but was not resolved.", {
        userMessage: "Provider API key is required before live execution.",
      }),
    };
  }

  return executeMappedProviderRequest(
    {
      mappedRequest: parsed.mappedRequest,
      config: runtimeConfig.value,
    },
    registry,
  );
}

export function normalizeProviderExecutionResult(result: ProviderExecutionResult): ProviderExecutionResult {
  if (result.ok) {
    return {
      ok: true,
      value: ProviderExecutionResponseSchema.parse(result.value),
    };
  }

  return {
    ok: false,
    error: ProviderErrorSchema.parse(result.error),
  };
}
