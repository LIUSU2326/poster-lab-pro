import { z } from "zod";
import { ProviderIdSchema, type ProviderConfigForm, type ProviderId } from "../schema/zod";
import {
  BackgroundRemovalRequestSchema,
  BriefGenerationRequestSchema,
  ImageEditRequestSchema,
  ImageGenerationRequestSchema,
  ProviderHealthResponseSchema,
  UpscaleRequestSchema,
  createProviderError,
  type BackgroundRemovalRequest,
  type BriefGenerationRequest,
  type GenerationProviderAdapter,
  type ImageEditRequest,
  type ImageGenerationRequest,
  type ProviderBriefResponse,
  type ProviderConfigValidation,
  type ProviderHealthResponse,
  type ProviderImageResponse,
  type ProviderManifest,
  type ProviderResult,
  type UpscaleRequest,
} from "./contracts";
import { getProviderManifest, providerManifestList } from "./manifests";
import type { ProviderAdapterRegistry } from "./executor";

export const LiveProviderExecutionModeSchema = z.enum(["disabled", "dryRun"]);

export const LiveProviderAdapterOptionsSchema = z.object({
  mode: LiveProviderExecutionModeSchema.default("disabled"),
  providerIds: z.array(ProviderIdSchema).optional(),
  reason: z.string().min(1).max(240).default("Live provider execution is disabled for the default MVP path."),
});

export type LiveProviderExecutionMode = z.infer<typeof LiveProviderExecutionModeSchema>;
export type LiveProviderAdapterOptions = z.input<typeof LiveProviderAdapterOptionsSchema>;

function validateProviderConfig(manifest: ProviderManifest, config: ProviderConfigForm): ProviderConfigValidation {
  const missing: (keyof ProviderConfigForm)[] = [];
  const warnings: string[] = [];

  if (config.providerId !== manifest.id) {
    warnings.push(`Config providerId ${config.providerId} does not match adapter ${manifest.id}.`);
  }
  if (manifest.apiKeyRequired && config.enabled && !config.apiKey?.trim()) {
    missing.push("apiKey");
  }
  if (manifest.baseUrlRequired && !config.baseUrl?.trim()) {
    missing.push("baseUrl");
  }
  if (config.enabled && !config.defaultModel?.trim()) {
    missing.push("defaultModel");
  }

  return {
    ok: missing.length === 0,
    missing,
    warnings,
  };
}

function liveProviderUnavailable<T>(
  manifest: ProviderManifest,
  capability: string,
  options: z.infer<typeof LiveProviderAdapterOptionsSchema>,
): ProviderResult<T> {
  return {
    ok: false,
    error: createProviderError(
      manifest.id,
      "provider_unavailable",
      `${manifest.displayName} live ${capability} adapter is registered as a ${options.mode} stub. ${options.reason}`,
      {
        retryable: false,
        userMessage: `${manifest.displayName} live provider is not enabled yet.`,
      },
    ),
  };
}

function unsupportedCapability<T>(manifest: ProviderManifest, capability: string): ProviderResult<T> {
  return {
    ok: false,
    error: createProviderError(
      manifest.id,
      "unsupported_capability",
      `${manifest.displayName} live adapter does not support ${capability}.`,
      {
        userMessage: `${manifest.displayName} does not support this generation capability.`,
      },
    ),
  };
}

function supports(manifest: ProviderManifest, capability: ProviderManifest["capabilities"][number]): boolean {
  return manifest.capabilities.includes(capability);
}

export function createLiveProviderAdapter(
  providerId: ProviderId,
  options: LiveProviderAdapterOptions = {},
): GenerationProviderAdapter {
  const manifest = getProviderManifest(providerId);
  const parsedOptions = LiveProviderAdapterOptionsSchema.parse(options);

  return {
    manifest,

    validateConfig(config) {
      return validateProviderConfig(manifest, config);
    },

    async healthCheck(config): Promise<ProviderResult<ProviderHealthResponse>> {
      const validation = validateProviderConfig(manifest, config);
      if (!validation.ok) {
        return {
          ok: true,
          value: ProviderHealthResponseSchema.parse({
            providerId: manifest.id,
            ok: false,
            status: "not_configured",
            message: `${manifest.displayName} live adapter is missing configuration: ${validation.missing.join(", ")}`,
          }),
        };
      }

      return {
        ok: true,
        value: ProviderHealthResponseSchema.parse({
          providerId: manifest.id,
          ok: false,
          status: "unavailable",
          message: `${manifest.displayName} live adapter is a ${parsedOptions.mode} stub. ${parsedOptions.reason}`,
        }),
      };
    },

    async generateBrief(request: BriefGenerationRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderBriefResponse>> {
      BriefGenerationRequestSchema.parse(request);
      validateProviderConfig(manifest, config);
      if (!supports(manifest, "briefGeneration")) return unsupportedCapability(manifest, "briefGeneration");
      return liveProviderUnavailable(manifest, "briefGeneration", parsedOptions);
    },

    async generateImage(request: ImageGenerationRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderImageResponse>> {
      ImageGenerationRequestSchema.parse(request);
      validateProviderConfig(manifest, config);
      if (!supports(manifest, "imageGeneration")) return unsupportedCapability(manifest, "imageGeneration");
      return liveProviderUnavailable(manifest, "imageGeneration", parsedOptions);
    },

    async editImage(request: ImageEditRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderImageResponse>> {
      ImageEditRequestSchema.parse(request);
      validateProviderConfig(manifest, config);
      if (!supports(manifest, "imageEdit")) return unsupportedCapability(manifest, "imageEdit");
      return liveProviderUnavailable(manifest, "imageEdit", parsedOptions);
    },

    async upscale(request: UpscaleRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderImageResponse>> {
      UpscaleRequestSchema.parse(request);
      validateProviderConfig(manifest, config);
      if (!supports(manifest, "upscale")) return unsupportedCapability(manifest, "upscale");
      return liveProviderUnavailable(manifest, "upscale", parsedOptions);
    },

    async removeBackground(
      request: BackgroundRemovalRequest,
      config: ProviderConfigForm,
    ): Promise<ProviderResult<ProviderImageResponse>> {
      BackgroundRemovalRequestSchema.parse(request);
      validateProviderConfig(manifest, config);
      if (!supports(manifest, "backgroundRemoval")) return unsupportedCapability(manifest, "backgroundRemoval");
      return liveProviderUnavailable(manifest, "backgroundRemoval", parsedOptions);
    },
  };
}

export function createLiveProviderRegistry(options: LiveProviderAdapterOptions = {}): ProviderAdapterRegistry {
  const parsedOptions = LiveProviderAdapterOptionsSchema.parse(options);
  const selected = new Set(parsedOptions.providerIds || providerManifestList.map((manifest) => manifest.id));

  return Object.fromEntries(
    providerManifestList
      .filter((manifest) => selected.has(manifest.id))
      .map((manifest) => [manifest.id, createLiveProviderAdapter(manifest.id, parsedOptions)]),
  ) as ProviderAdapterRegistry;
}
