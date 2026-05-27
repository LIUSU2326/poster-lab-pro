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
      { userMessage: "当前 Provider 不支持该能力。请切换模型或供应商。" },
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
            userMessage: "Provider 配置不完整，无法生成方案。",
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
            title: `${parsed.projectName}：荒野料理远征海报 ${index + 1}`,
            brief: [
              "以厨师小队、巨型食材和餐厅经营目标为主轴，形成适合广告投放的游戏主视觉。",
              parsed.focusGuidance ? `侧重点：${parsed.focusGuidance}` : "",
            ].filter(Boolean).join(" "),
            prompt: "幻想料理冒险游戏海报，厨师小队携带锅铲和烹饪道具冲向巨型怪物食材，游戏 LOGO 位于上方安全区，明亮高饱和、可爱但有战斗张力，16:9 构图，主体清晰，留出宣传词空间。",
            promptZh: "幻想料理冒险游戏海报，厨师小队携带锅铲和烹饪道具冲向巨型怪物食材，游戏 LOGO 位于上方安全区，明亮高饱和、可爱但有战斗张力，主体清晰，留出宣传词空间。",
            promptEn: "Fantasy cooking adventure game poster, a chef squad carrying spatulas and cooking tools charging toward a giant monster ingredient, game logo in the upper safe area, bright saturated colors, cute but action driven, clear 16:9 composition with room for campaign slogan.",
            slogans: Object.fromEntries(parsed.languageTargets.map((language) => [
              language,
              language === "zh-CN"
                ? "狩猎巨型食材，端上荒野盛宴。"
                : "Hunt giant ingredients. Serve the wild feast.",
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
