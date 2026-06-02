import { z } from "zod";
import {
  PlatformPresetSchema,
  ProductionModeSchema,
  ProviderIdSchema,
  SloganLanguageSchema,
  type ProductionMode,
  type ProviderConfigForm,
  type ProviderId,
} from "../schema/zod";

export const ProviderCapabilitySchema = z.enum([
  "briefGeneration",
  "imageGeneration",
  "imageEdit",
  "upscale",
  "backgroundRemoval",
  "styleReferenceAnalysis",
  "compositionReferenceAnalysis",
  "healthCheck",
  "costEstimate",
]);

export const ProviderModelSlotSchema = z.enum([
  "concept",
  "image",
  "styleReference",
  "compositionReference",
  "imageEdit",
  "upscale",
  "backgroundRemoval",
]);

export const ProviderErrorCodeSchema = z.enum([
  "missing_config",
  "unsupported_capability",
  "invalid_request",
  "provider_unavailable",
  "rate_limited",
  "auth_failed",
  "quota_exceeded",
  "unknown",
]);

export const ProviderAssetReferenceSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  mimeType: z.string().min(1).optional(),
  url: z.string().url().optional(),
  description: z.string().max(500).optional(),
});

export const ProviderModeGuardrailSchema = z.object({
  mode: ProductionModeSchema,
  rules: z.array(z.string().min(1)).min(1),
  lockedFields: z.array(z.string().min(1)).default([]),
});

export const ProviderManifestSchema = z.object({
  id: ProviderIdSchema,
  name: z.string().min(1),
  displayName: z.string().min(1),
  baseUrlRequired: z.boolean().default(false),
  apiKeyRequired: z.boolean().default(true),
  capabilities: z.array(ProviderCapabilitySchema).min(1),
  modelSlots: z.partialRecord(ProviderModelSlotSchema, z.array(z.string().min(1)).min(1)),
  supportedModes: z.array(ProductionModeSchema).min(1),
  notes: z.array(z.string().min(1)).default([]),
});

export const ProviderRequestContextSchema = z.object({
  projectId: z.string().min(1),
  mode: ProductionModeSchema,
  providerId: ProviderIdSchema,
  jobId: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
});

export const BriefGenerationRequestSchema = z.object({
  context: ProviderRequestContextSchema,
  projectName: z.string().min(1).max(80),
  gameDescription: z.string().min(1).max(2000),
  focusGuidance: z.string().max(500).optional(),
  creativeDirection: z.string().max(4000).optional(),
  assets: z.array(ProviderAssetReferenceSchema).default([]),
  guardrails: ProviderModeGuardrailSchema,
  languageTargets: z.array(SloganLanguageSchema).min(1).max(1),
  schemeCount: z.number().int().min(1).max(20),
});

export const ImageGenerationRequestSchema = z.object({
  context: ProviderRequestContextSchema,
  schemeId: z.string().min(1),
  prompt: z.string().min(1).max(12000),
  negativePrompt: z.string().max(3000).optional(),
  assets: z.array(ProviderAssetReferenceSchema).default([]),
  platformPreset: PlatformPresetSchema,
  aspectRatio: z.string().min(1),
  width: z.number().int().min(256).max(8192),
  height: z.number().int().min(256).max(8192),
  model: z.string().min(1),
  count: z.number().int().min(1).max(8).default(1),
});

export const ImageEditRequestSchema = ImageGenerationRequestSchema.extend({
  sourceResultId: z.string().min(1),
  maskAssetId: z.string().min(1).optional(),
  editInstruction: z.string().min(1).max(2000),
});

export const UpscaleRequestSchema = z.object({
  context: ProviderRequestContextSchema,
  sourceResultId: z.string().min(1),
  model: z.string().min(1),
  scale: z.union([z.literal(2), z.literal(4)]).default(2),
});

export const BackgroundRemovalRequestSchema = z.object({
  context: ProviderRequestContextSchema,
  sourceResultId: z.string().min(1),
  model: z.string().min(1),
  outputBackground: z.enum(["transparent", "solid"]).default("transparent"),
});

export const ProviderUsageSchema = z.object({
  promptTokens: z.number().int().min(0).optional(),
  imageCount: z.number().int().min(0).optional(),
  estimatedCost: z.number().min(0).optional(),
  elapsedMs: z.number().int().min(0).optional(),
});

export const ProviderResultAssetSchema = z.object({
  id: z.string().min(1),
  mimeType: z.string().min(1),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  url: z.string().url().optional(),
  dataUrl: z.string().startsWith("data:").optional(),
  seed: z.string().optional(),
});

export const ProviderBriefResponseSchema = z.object({
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  schemes: z.array(
    z.object({
      title: z.string().min(1),
      brief: z.string().min(1),
      prompt: z.string().min(1),
      promptZh: z.string().min(1).optional(),
      promptEn: z.string().min(1).optional(),
      slogans: z.partialRecord(SloganLanguageSchema, z.string().min(1)),
    }),
  ),
  usage: ProviderUsageSchema.default({}),
});

export const ProviderImageResponseSchema = z.object({
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  assets: z.array(ProviderResultAssetSchema).min(1),
  usage: ProviderUsageSchema.default({}),
});

export const ProviderHealthResponseSchema = z.object({
  providerId: ProviderIdSchema,
  ok: z.boolean(),
  status: z.enum(["not_configured", "ready", "degraded", "unavailable"]),
  message: z.string().min(1),
});

export const ProviderErrorSchema = z.object({
  providerId: ProviderIdSchema,
  code: ProviderErrorCodeSchema,
  retryable: z.boolean().default(false),
  message: z.string().min(1),
  userMessage: z.string().min(1),
});

export type ProviderCapability = z.infer<typeof ProviderCapabilitySchema>;
export type ProviderModelSlot = z.infer<typeof ProviderModelSlotSchema>;
export type ProviderErrorCode = z.infer<typeof ProviderErrorCodeSchema>;
export type ProviderAssetReference = z.infer<typeof ProviderAssetReferenceSchema>;
export type ProviderManifest = z.infer<typeof ProviderManifestSchema>;
export type ProviderError = z.infer<typeof ProviderErrorSchema>;
export type ProviderRequestContext = z.infer<typeof ProviderRequestContextSchema>;
export type BriefGenerationRequest = z.infer<typeof BriefGenerationRequestSchema>;
export type ImageGenerationRequest = z.infer<typeof ImageGenerationRequestSchema>;
export type ImageEditRequest = z.infer<typeof ImageEditRequestSchema>;
export type UpscaleRequest = z.infer<typeof UpscaleRequestSchema>;
export type BackgroundRemovalRequest = z.infer<typeof BackgroundRemovalRequestSchema>;
export type ProviderBriefResponse = z.infer<typeof ProviderBriefResponseSchema>;
export type ProviderImageResponse = z.infer<typeof ProviderImageResponseSchema>;
export type ProviderHealthResponse = z.infer<typeof ProviderHealthResponseSchema>;

export type ProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ProviderError };

export type ProviderConfigValidation = {
  ok: boolean;
  missing: readonly (keyof ProviderConfigForm)[];
  warnings: readonly string[];
};

export type GenerationProviderAdapter = {
  manifest: ProviderManifest;
  validateConfig(config: ProviderConfigForm): ProviderConfigValidation;
  healthCheck(config: ProviderConfigForm): Promise<ProviderResult<ProviderHealthResponse>>;
  generateBrief?(request: BriefGenerationRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderBriefResponse>>;
  generateImage?(request: ImageGenerationRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderImageResponse>>;
  editImage?(request: ImageEditRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderImageResponse>>;
  upscale?(request: UpscaleRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderImageResponse>>;
  removeBackground?(
    request: BackgroundRemovalRequest,
    config: ProviderConfigForm,
  ): Promise<ProviderResult<ProviderImageResponse>>;
};

export function createProviderError(
  providerId: ProviderId,
  code: z.infer<typeof ProviderErrorCodeSchema>,
  message: string,
  options: { retryable?: boolean; userMessage?: string } = {},
): ProviderError {
  return ProviderErrorSchema.parse({
    providerId,
    code,
    message,
    retryable: options.retryable ?? false,
    userMessage: options.userMessage ?? message,
  });
}

export function modeGuardrails(mode: ProductionMode): z.infer<typeof ProviderModeGuardrailSchema> {
  const rulesByMode: Record<ProductionMode, string[]> = {
    poster: ["Keep game logo readable.", "Respect platform safe areas.", "Do not copy protected IP."],
    collab: ["Use [Game Character] and [Collab Partner] placeholders only.", "Do NOT merge both entities."],
    announcement: ["Keep announcement copy readable.", "Use group-shot planning when multiple characters are present."],
    logo: [
      "Wordmark is the primary subject.",
      "Use a pure solid-color background.",
      "Use Logo Text Strategy: exact short wordmark only when reliable; otherwise reserve a polished blank wordmark plate for later vector/text refinement.",
    ],
    icon: ["Aspect ratio is locked to 1:1.", "No text.", "Full-bleed square composition with sharp corners."],
  };

  return ProviderModeGuardrailSchema.parse({
    mode,
    rules: rulesByMode[mode],
    lockedFields:
      mode === "collab"
        ? ["characterPlaceholdersOnly", "preventCharacterMerge"]
        : mode === "logo"
          ? ["solidBackground", "wordmarkIsPrimarySubject"]
          : mode === "icon"
            ? ["aspectRatio", "noText", "fullBleedSquare"]
            : [],
  });
}
