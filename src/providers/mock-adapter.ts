import {
  BriefGenerationRequestSchema,
  BackgroundRemovalRequestSchema,
  ImageEditRequestSchema,
  ImageGenerationRequestSchema,
  ProviderBriefResponseSchema,
  ProviderHealthResponseSchema,
  ProviderImageResponseSchema,
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
import type { ProviderConfigForm } from "../schema/zod";

function unsupported(manifest: ProviderManifest, capability: string) {
  return {
    ok: false,
    error: createProviderError(
      manifest.id,
      "unsupported_capability",
      `${manifest.displayName} mock adapter does not support ${capability}.`,
      { userMessage: "This mock provider does not support the requested capability." },
    ),
  } as const;
}

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

const transparentPngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6Xn9s8AAAAASUVORK5CYII=";

function staticImageResponse(
  manifest: ProviderManifest,
  model: string,
  width: number,
  height: number,
  imageCount = 1,
): ProviderImageResponse {
  return ProviderImageResponseSchema.parse({
    providerId: manifest.id,
    model,
    assets: Array.from({ length: imageCount }, (_, index) => ({
      id: `mock-${manifest.id}-${Date.now()}-${index + 1}`,
      mimeType: "image/png",
      width,
      height,
      dataUrl: transparentPngDataUrl,
      seed: `mock-seed-${index + 1}`,
    })),
    usage: {
      imageCount,
      estimatedCost: 0,
      elapsedMs: 0,
    },
  });
}

export function createMockProviderAdapter(manifest: ProviderManifest): GenerationProviderAdapter {
  const hasCapability = (capability: ProviderManifest["capabilities"][number]) => manifest.capabilities.includes(capability);

  return {
    manifest,

    validateConfig(config) {
      return validateProviderConfig(manifest, config);
    },

    async healthCheck(config): Promise<ProviderResult<ProviderHealthResponse>> {
      const validation = validateProviderConfig(manifest, config);
      return {
        ok: true,
        value: ProviderHealthResponseSchema.parse({
          providerId: manifest.id,
          ok: validation.ok,
          status: validation.ok ? "ready" : "not_configured",
          message: validation.ok
            ? `${manifest.displayName} mock adapter is ready.`
            : `${manifest.displayName} mock adapter is missing configuration: ${validation.missing.join(", ")}`,
        }),
      };
    },

    async generateBrief(request: BriefGenerationRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderBriefResponse>> {
      if (!hasCapability("briefGeneration")) return unsupported(manifest, "briefGeneration");
      const validation = validateProviderConfig(manifest, config);
      if (!validation.ok) {
        return {
          ok: false,
          error: createProviderError(manifest.id, "missing_config", `Missing config: ${validation.missing.join(", ")}`, {
            userMessage: "Provider config is incomplete, so schemes cannot be generated.",
          }),
        };
      }

      const parsed = BriefGenerationRequestSchema.parse(request);
      return {
        ok: true,
        value: ProviderBriefResponseSchema.parse({
          providerId: manifest.id,
          model: config.modelSlots.concept || config.defaultModel || "mock-concept-model",
          schemes: Array.from({ length: parsed.schemeCount }, (_, index) => ({
            title: `${parsed.projectName}: Campaign KV ${index + 1}`,
            brief: [
              "Build a premium campaign key visual from the current project's heroes, threat, setting, and core gameplay objective.",
              parsed.focusGuidance ? `Focus: ${parsed.focusGuidance}` : "",
            ].filter(Boolean).join(" "),
            prompt: "Premium game campaign key visual based on the current project description and uploaded assets, readable hero-vs-threat story, project-specific setting, integrated logo-safe area, cinematic lighting, clear 16:9 composition, room for campaign slogan.",
            promptZh: "Premium game campaign key visual based on the current project description and uploaded assets, readable hero-vs-threat story, project-specific setting, integrated logo-safe area, cinematic lighting, clear composition, room for campaign slogan.",
            promptEn: "Premium game campaign key visual based on the current project description and uploaded assets, readable hero-vs-threat story, project-specific setting, integrated logo-safe area, cinematic lighting, clear 16:9 composition, room for campaign slogan.",
            slogans: Object.fromEntries(parsed.languageTargets.map((language) => [
              language,
              language === "zh-CN"
                ? "Claim the Objective."
                : "Claim the Objective.",
            ])),
          })),
          usage: { estimatedCost: 0, elapsedMs: 0 },
        }),
      };
    },

    async generateImage(request: ImageGenerationRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderImageResponse>> {
      if (!hasCapability("imageGeneration")) return unsupported(manifest, "imageGeneration");
      const parsed = ImageGenerationRequestSchema.parse(request);
      return {
        ok: true,
        value: staticImageResponse(manifest, parsed.model || config.defaultModel || "mock-image-model", parsed.width, parsed.height, parsed.count),
      };
    },

    async editImage(request: ImageEditRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderImageResponse>> {
      if (!hasCapability("imageEdit")) return unsupported(manifest, "imageEdit");
      const parsed = ImageEditRequestSchema.parse(request);
      return {
        ok: true,
        value: staticImageResponse(manifest, parsed.model || config.defaultModel || "mock-edit-model", parsed.width, parsed.height),
      };
    },

    async upscale(request: UpscaleRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderImageResponse>> {
      if (!hasCapability("upscale")) return unsupported(manifest, "upscale");
      const parsed = UpscaleRequestSchema.parse(request);
      return {
        ok: true,
        value: staticImageResponse(manifest, parsed.model || config.defaultModel || "mock-upscale-model", 2048 * parsed.scale, 2048 * parsed.scale),
      };
    },

    async removeBackground(
      request: BackgroundRemovalRequest,
      config: ProviderConfigForm,
    ): Promise<ProviderResult<ProviderImageResponse>> {
      if (!hasCapability("backgroundRemoval")) return unsupported(manifest, "backgroundRemoval");
      const parsed = BackgroundRemovalRequestSchema.parse(request);
      return {
        ok: true,
        value: staticImageResponse(manifest, parsed.model || config.defaultModel || "mock-background-removal-model", 1024, 1024),
      };
    },
  };
}
