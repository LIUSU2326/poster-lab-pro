import { z } from "zod";
import { ProviderIdSchema, SloganLanguageSchema, type ProviderId, type ProductionMode } from "../schema/zod";
import { PromptPackageSchema, type PromptAssetBinding, type PromptPackage } from "../prompts/contracts";
import { WorkspaceSnapshotSchema, type WorkspaceModeState, type WorkspaceSnapshot } from "../storage/contracts";
import {
  BackgroundRemovalRequestSchema,
  BriefGenerationRequestSchema,
  ImageEditRequestSchema,
  ImageGenerationRequestSchema,
  ProviderAssetReferenceSchema,
  ProviderCapabilitySchema,
  ProviderModelSlotSchema,
  UpscaleRequestSchema,
  modeGuardrails,
  type BackgroundRemovalRequest,
  type BriefGenerationRequest,
  type ImageEditRequest,
  type ImageGenerationRequest,
  type ProviderAssetReference,
  type ProviderCapability,
  type ProviderModelSlot,
  type UpscaleRequest,
} from "./contracts";
import { getProviderManifest } from "./manifests";

export const ProviderMappedRequestKindSchema = z.enum([
  "briefGeneration",
  "imageGeneration",
  "imageEdit",
  "upscale",
  "backgroundRemoval",
]);

export const ProviderRequestMapperInputSchema = z.object({
  promptPackage: PromptPackageSchema,
  snapshot: WorkspaceSnapshotSchema,
  providerId: ProviderIdSchema,
  kind: ProviderMappedRequestKindSchema.optional(),
  model: z.string().min(1).optional(),
  count: z.number().int().min(1).max(8).optional(),
  jobId: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
});

export const ProviderBriefMappedRequestSchema = z.object({
  kind: z.literal("briefGeneration"),
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  promptPackageId: z.string().min(1),
  request: BriefGenerationRequestSchema,
});

export const ProviderImageMappedRequestSchema = z.object({
  kind: z.literal("imageGeneration"),
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  promptPackageId: z.string().min(1),
  request: ImageGenerationRequestSchema,
});

export const ProviderImageEditMappedRequestSchema = z.object({
  kind: z.literal("imageEdit"),
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  promptPackageId: z.string().min(1),
  request: ImageEditRequestSchema,
});

export const ProviderUpscaleMappedRequestSchema = z.object({
  kind: z.literal("upscale"),
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  promptPackageId: z.string().min(1),
  request: UpscaleRequestSchema,
});

export const ProviderBackgroundRemovalMappedRequestSchema = z.object({
  kind: z.literal("backgroundRemoval"),
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  promptPackageId: z.string().min(1),
  request: BackgroundRemovalRequestSchema,
});

export const ProviderMappedRequestSchema = z.discriminatedUnion("kind", [
  ProviderBriefMappedRequestSchema,
  ProviderImageMappedRequestSchema,
  ProviderImageEditMappedRequestSchema,
  ProviderUpscaleMappedRequestSchema,
  ProviderBackgroundRemovalMappedRequestSchema,
]);

export type ProviderRequestMapperInput = z.infer<typeof ProviderRequestMapperInputSchema>;
export type ProviderMappedRequestKind = z.infer<typeof ProviderMappedRequestKindSchema>;
export type ProviderBriefMappedRequest = z.infer<typeof ProviderBriefMappedRequestSchema>;
export type ProviderImageMappedRequest = z.infer<typeof ProviderImageMappedRequestSchema>;
export type ProviderImageEditMappedRequest = z.infer<typeof ProviderImageEditMappedRequestSchema>;
export type ProviderUpscaleMappedRequest = z.infer<typeof ProviderUpscaleMappedRequestSchema>;
export type ProviderBackgroundRemovalMappedRequest = z.infer<typeof ProviderBackgroundRemovalMappedRequestSchema>;
export type ProviderMappedRequest = z.infer<typeof ProviderMappedRequestSchema>;

const FALLBACK_MODELS: Record<ProviderModelSlot, string> = {
  concept: "gpt-4o",
  image: "gpt-image-1",
  styleReference: "gpt-4o",
  compositionReference: "gpt-4o",
  imageEdit: "gpt-image-1",
  upscale: "nightmareai/real-esrgan",
  backgroundRemoval: "cjwbw/rembg",
};

function isProviderSafeAssetUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "data:";
  } catch {
    return false;
  }
}

function findModeState(snapshot: WorkspaceSnapshot, mode: ProductionMode): WorkspaceModeState {
  const modeState = snapshot.modeStates.find((item) => item.mode === mode);
  if (!modeState) throw new Error(`Missing workspace mode state for ${mode}.`);
  return modeState;
}

function assertProviderCapability(providerId: ProviderId, capability: ProviderCapability): void {
  const manifest = getProviderManifest(providerId);
  if (!manifest.capabilities.includes(capability)) {
    throw new Error(`${manifest.displayName} does not support ${capability}.`);
  }
}

function inferDimensions(aspectRatio: string): { width: number; height: number } {
  const explicit = aspectRatio.match(/^(\d{3,5})x(\d{3,5})$/);
  if (explicit) {
    return {
      width: Number(explicit[1]),
      height: Number(explicit[2]),
    };
  }

  if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
  if (aspectRatio === "16:9") return { width: 1920, height: 1080 };
  if (aspectRatio === "4:3") return { width: 1600, height: 1200 };
  if (aspectRatio === "3:4") return { width: 1200, height: 1600 };
  if (aspectRatio === "1200x627") return { width: 1200, height: 627 };
  return { width: 1024, height: 1024 };
}

export function resolveProviderModel(input: {
  snapshot: WorkspaceSnapshot;
  providerId: ProviderId;
  slot: ProviderModelSlot;
  model?: string;
}): string {
  const parsedSlot = ProviderModelSlotSchema.parse(input.slot);
  const override = input.model?.trim();
  if (override) return override;

  const providerConfig = input.snapshot.providerConfigs[input.providerId];
  const slotModel = providerConfig?.modelSlots[parsedSlot]?.trim();
  if (slotModel) return slotModel;

  const defaultModel = providerConfig?.defaultModel?.trim();
  if (defaultModel) return defaultModel;

  const manifestModel = getProviderManifest(input.providerId).modelSlots[parsedSlot]?.[0]?.trim();
  return manifestModel || FALLBACK_MODELS[parsedSlot];
}

function toProviderAssetReference(
  binding: PromptAssetBinding,
  snapshot: WorkspaceSnapshot,
): ProviderAssetReference {
  const asset = snapshot.assets.find((item) => item.id === binding.assetId);
  const candidateUrl = binding.url || asset?.previewUrl || null;
  const description = [
    binding.label,
    `binding=${binding.binding}`,
    binding.required ? "required" : "optional",
    binding.placeholder ? `placeholder=${binding.placeholder}` : "",
    binding.storageKey ? `storageKey=${binding.storageKey}` : asset?.storageKey ? `storageKey=${asset.storageKey}` : "",
    binding.providerReady ? "providerReady=true" : "providerReady=false",
  ]
    .filter(Boolean)
    .join("; ");

  return ProviderAssetReferenceSchema.parse({
    id: binding.assetId,
    role: binding.role,
    ...(binding.mimeType || asset?.mimeType ? { mimeType: binding.mimeType || asset?.mimeType || undefined } : {}),
    ...(isProviderSafeAssetUrl(candidateUrl) ? { url: candidateUrl } : {}),
    description,
  });
}

export function assetsFromPromptPackage(
  promptPackage: PromptPackage,
  snapshot: WorkspaceSnapshot,
): ProviderAssetReference[] {
  return promptPackage.assets.map((asset) => toProviderAssetReference(asset, snapshot));
}

function assertPromptPackageReadyForProvider(promptPackage: PromptPackage): void {
  if (!promptPackage.validation.ok) {
    throw new Error(`Prompt package validation failed: ${promptPackage.validation.errors.join(" ")}`);
  }

  const missingRequiredUrls = promptPackage.assets.filter((asset) => asset.required && !asset.providerReady);
  if (missingRequiredUrls.length > 0) {
    const labels = missingRequiredUrls.map((asset) => `${asset.label} (${asset.role})`).join(", ");
    throw new Error(`Image generation requires provider-ready URLs for required assets: ${labels}.`);
  }
}

function createRequestContext(input: {
  promptPackage: PromptPackage;
  providerId: ProviderId;
  jobId?: string;
  traceId?: string;
}) {
  return {
    projectId: input.promptPackage.projectId,
    mode: input.promptPackage.mode,
    providerId: input.providerId,
    ...(input.jobId ? { jobId: input.jobId } : {}),
    ...(input.traceId ? { traceId: input.traceId } : {}),
  };
}

function languageTargetsFrom(promptPackage: PromptPackage, modeState: WorkspaceModeState): z.infer<
  typeof SloganLanguageSchema
>[] {
  const configured = modeState.sloganSettings.languages;
  if (configured.length > 0) return configured;

  const sloganLanguages = Object.keys(promptPackage.slogans).filter((language) =>
    SloganLanguageSchema.safeParse(language).success,
  ) as z.infer<typeof SloganLanguageSchema>[];

  return sloganLanguages.length > 0 ? sloganLanguages : ["zh-CN", "en-US"];
}

export function mapPromptPackageToBriefRequest(input: {
  promptPackage: PromptPackage;
  snapshot: WorkspaceSnapshot;
  providerId: ProviderId;
  model?: string;
  jobId?: string;
  traceId?: string;
}): ProviderBriefMappedRequest {
  assertProviderCapability(input.providerId, ProviderCapabilitySchema.parse("briefGeneration"));
  if (input.promptPackage.target !== "brief") {
    throw new Error("Brief generation requests require a brief prompt package.");
  }

  const modeState = findModeState(input.snapshot, input.promptPackage.mode);
  const model = resolveProviderModel({
    snapshot: input.snapshot,
    providerId: input.providerId,
    slot: "concept",
    ...(input.model ? { model: input.model } : {}),
  });
  const focusGuidance = modeState.projectBrief.focusGuidanceEnabled
    ? modeState.projectBrief.focusGuidance?.trim()
    : "";

  const request = BriefGenerationRequestSchema.parse({
    context: createRequestContext(input),
    projectName: modeState.projectBrief.projectName || input.snapshot.project.name,
    gameDescription: modeState.projectBrief.gameDescription || input.snapshot.project.description,
    ...(focusGuidance ? { focusGuidance } : {}),
    assets: assetsFromPromptPackage(input.promptPackage, input.snapshot),
    guardrails: modeGuardrails(input.promptPackage.mode),
    languageTargets: languageTargetsFrom(input.promptPackage, modeState),
    schemeCount: modeState.outputSettings.schemeCount,
  });

  return ProviderBriefMappedRequestSchema.parse({
    kind: "briefGeneration",
    providerId: input.providerId,
    model,
    promptPackageId: input.promptPackage.id,
    request,
  });
}

export function mapPromptPackageToImageRequest(input: {
  promptPackage: PromptPackage;
  snapshot: WorkspaceSnapshot;
  providerId: ProviderId;
  model?: string;
  count?: number;
  jobId?: string;
  traceId?: string;
}): ProviderImageMappedRequest {
  assertProviderCapability(input.providerId, ProviderCapabilitySchema.parse("imageGeneration"));
  if (input.promptPackage.target !== "image") {
    throw new Error("Image generation requests require an image prompt package.");
  }
  if (!input.promptPackage.schemeId) {
    throw new Error("Image generation requests require a scheme id.");
  }
  assertPromptPackageReadyForProvider(input.promptPackage);

  const modeState = findModeState(input.snapshot, input.promptPackage.mode);
  const inferredSize = inferDimensions(input.promptPackage.platform.aspectRatio);
  const model = resolveProviderModel({
    snapshot: input.snapshot,
    providerId: input.providerId,
    slot: "image",
    ...(input.model ? { model: input.model } : {}),
  });
  const count = input.count ?? modeState.outputSettings.imagesPerScheme;

  const request = ImageGenerationRequestSchema.parse({
    context: createRequestContext(input),
    schemeId: input.promptPackage.schemeId,
    prompt: input.promptPackage.finalPrompt,
    ...(input.promptPackage.negativePrompt.trim()
      ? { negativePrompt: input.promptPackage.negativePrompt.trim() }
      : {}),
    assets: assetsFromPromptPackage(input.promptPackage, input.snapshot),
    platformPreset: input.promptPackage.platform.platformPreset,
    aspectRatio: input.promptPackage.platform.aspectRatio,
    width: input.promptPackage.platform.width || inferredSize.width,
    height: input.promptPackage.platform.height || inferredSize.height,
    model,
    count,
  });

  return ProviderImageMappedRequestSchema.parse({
    kind: "imageGeneration",
    providerId: input.providerId,
    model,
    promptPackageId: input.promptPackage.id,
    request,
  });
}

export function mapPromptPackageToProviderRequest(input: ProviderRequestMapperInput): ProviderMappedRequest {
  const parsed = ProviderRequestMapperInputSchema.parse(input);
  const kind = parsed.kind || (parsed.promptPackage.target === "brief" ? "briefGeneration" : "imageGeneration");

  if (kind === "briefGeneration") {
    return mapPromptPackageToBriefRequest({
      promptPackage: parsed.promptPackage,
      snapshot: parsed.snapshot,
      providerId: parsed.providerId,
      ...(parsed.model ? { model: parsed.model } : {}),
      ...(parsed.jobId ? { jobId: parsed.jobId } : {}),
      ...(parsed.traceId ? { traceId: parsed.traceId } : {}),
    });
  }

  if (kind !== "imageGeneration") {
    throw new Error(`Prompt package mapper cannot build ${kind} requests without queue task context.`);
  }

  return mapPromptPackageToImageRequest({
    promptPackage: parsed.promptPackage,
    snapshot: parsed.snapshot,
    providerId: parsed.providerId,
    ...(parsed.model ? { model: parsed.model } : {}),
    ...(parsed.count ? { count: parsed.count } : {}),
    ...(parsed.jobId ? { jobId: parsed.jobId } : {}),
    ...(parsed.traceId ? { traceId: parsed.traceId } : {}),
  });
}
