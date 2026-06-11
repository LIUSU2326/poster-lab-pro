import { z } from "zod";
import { ProviderIdSchema, SloganLanguageSchema, type ProviderId, type ProductionMode } from "../schema/zod";
import {
  assetCompactConstraint,
  assetFusionStrategy,
  assetSemanticInventory,
  assetSemanticRole,
  isIntegratedReferenceAsset,
  isPosterIntegratedReferenceAsset,
  posterAssetReferenceName,
  modeAssetFusionDirective,
  type AssetSemanticRole,
  type PosterAssetSemanticRole,
} from "../assets/semantic-roles";
import { PromptPackageSchema, type PromptAssetBinding, type PromptPackage } from "../prompts/contracts";
import { logoWordmarkTextRisk } from "../prompts/logo-text-policy";
import { integratedSloganTreatmentRule } from "../prompts/slogan-policy";
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
import { normalizeMimoProviderModel } from "./mimo-compat";
import { providerImagePromptMaxChars } from "./provider-capability-profiles";
import {
  posterCinematicKvQualityDirective,
  posterFocalHierarchyLock,
  posterHeroPerformanceScaleLock,
  posterInWorldBrandTreatmentLock,
  posterIdentitySafeMotionRule,
  posterLogoSingleUseLock,
  posterKvArchitectureDirective,
  posterKvAssetCountsFromAssets,
  posterTextEconomyLock,
  posterSubjectAccessoryStrictnessLock,
} from "./poster-kv-architectures";

const PROVIDER_PROMPT_MAX_CHARS = 18000;

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
  concept: "gpt-5.5",
  image: "gpt-image-2",
  styleReference: "gpt-5.5",
  compositionReference: "gpt-5.5",
  imageEdit: "gpt-image-2",
  upscale: "nightmareai/real-esrgan",
  backgroundRemoval: "cjwbw/rembg",
};

function isProviderSafeAssetUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  if (isExampleAssetUrl(url)) return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "data:";
  } catch {
    return false;
  }
}

function assetUrl(asset: WorkspaceSnapshot["assets"][number] | undefined): string | null {
  return asset?.previewUrl || null;
}

function isExampleAssetUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname === "example.com";
  } catch {
    return /example\.com/i.test(url);
  }
}

function roleConstraint(binding: PromptAssetBinding, mode: ProductionMode): string {
  return assetCompactConstraint(binding, { mode });
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
  if (slotModel) return normalizeMimoProviderModel(input.providerId, slotModel);

  const manifestModel = getProviderManifest(input.providerId).modelSlots[parsedSlot]?.[0]?.trim();
  if (manifestModel) return normalizeMimoProviderModel(input.providerId, manifestModel);

  const defaultModel = providerConfig?.defaultModel?.trim();
  return normalizeMimoProviderModel(input.providerId, defaultModel || FALLBACK_MODELS[parsedSlot]);
}

type ProviderAssetReferenceOptions = {
  copySafeLogoText?: boolean;
  imageGeneration?: boolean;
};

function toProviderAssetReference(
  binding: PromptAssetBinding,
  snapshot: WorkspaceSnapshot,
  roleIndex: number,
  mode: ProductionMode,
  options: ProviderAssetReferenceOptions = {},
): ProviderAssetReference {
  const asset = snapshot.assets.find((item) => item.id === binding.assetId);
  const candidateUrl = binding.url || assetUrl(asset);
  const semanticRole = assetSemanticRole(binding);
  const description = [
    binding.label,
    `semanticRole=${semanticRole}`,
    `binding=${binding.binding}`,
    `constraint=${roleConstraint(binding, mode)}`,
    binding.required ? "required" : "optional",
    binding.placeholder ? `placeholder=${binding.placeholder}` : "",
    ["gameCharacter", "collabCharacter"].includes(binding.role) ? `independentCharacterIndex=${roleIndex}` : "",
    `fusion=${assetFusionStrategy(binding, { mode })}`,
    binding.storageKey ? `storageKey=${binding.storageKey}` : asset?.storageKey ? `storageKey=${asset.storageKey}` : "",
    binding.providerReady ? "providerReady=true" : "providerReady=false",
  ]
    .filter(Boolean)
    .join("; ");
  const providerDescription = options.copySafeLogoText && mode === "logo" && semanticRole === "brandLogo"
    ? redactLogoCopySafePhrases(description)
    : description;

  return ProviderAssetReferenceSchema.parse({
    id: binding.assetId,
    role: binding.role,
    ...(binding.mimeType || asset?.mimeType ? { mimeType: binding.mimeType || asset?.mimeType || undefined } : {}),
    ...(isProviderSafeAssetUrl(candidateUrl) ? { url: candidateUrl } : {}),
    description: providerDescription.slice(0, 500),
  });
}

const ICON_IMAGE_REFERENCE_PRIORITY: Record<AssetSemanticRole, number> = {
  keySubject: 0,
  protagonist: 1,
  prop: 2,
  antagonist: 3,
  brandLogo: 4,
  environment: 99,
  styleReference: 99,
  compositionReference: 99,
  supportingAsset: 99,
};

function orderedByImageReferencePriority(
  mode: ProductionMode,
  assets: PromptAssetBinding[],
): PromptAssetBinding[] {
  return assets
    .map((asset, index) => ({ asset, index }))
    .sort((left, right) => {
      if (mode === "icon") {
        const roleDelta = ICON_IMAGE_REFERENCE_PRIORITY[assetSemanticRole(left.asset)]
          - ICON_IMAGE_REFERENCE_PRIORITY[assetSemanticRole(right.asset)];
        if (roleDelta !== 0) return roleDelta;
      }
      return left.index - right.index;
    })
    .map((item) => item.asset);
}

function firstAsset(
  assets: PromptAssetBinding[],
  predicate: (asset: PromptAssetBinding) => boolean,
): PromptAssetBinding | undefined {
  return assets.find(predicate);
}

function uniqueAssets(assets: Array<PromptAssetBinding | undefined>): PromptAssetBinding[] {
  const seen = new Set<string>();
  return assets.filter((asset): asset is PromptAssetBinding => {
    if (!asset || seen.has(asset.assetId)) return false;
    seen.add(asset.assetId);
    return true;
  });
}

function filterImageReferenceAssetsForMode(
  promptPackage: PromptPackage,
  options: ProviderAssetReferenceOptions,
): PromptAssetBinding[] {
  if (!options.imageGeneration || promptPackage.target !== "image") return promptPackage.assets;

  const assets = promptPackage.assets.filter(isIntegratedReferenceAsset);
  if (promptPackage.mode === "poster") {
    const styleGuide = firstAsset(promptPackage.assets, (asset) => assetSemanticRole(asset) === "styleReference");
    const compositionGuide = firstAsset(promptPackage.assets, (asset) => assetSemanticRole(asset) === "compositionReference");
    return uniqueAssets([...assets, compositionGuide, styleGuide]);
  }

  const bySemanticRole = (role: AssetSemanticRole) => (asset: PromptAssetBinding) =>
    assetSemanticRole(asset) === role;
  const bySourceRole = (...roles: string[]) => (asset: PromptAssetBinding) => roles.includes(asset.role);
  const ordered = orderedByImageReferencePriority(promptPackage.mode, assets);

  switch (promptPackage.mode) {
    case "icon": {
      const subject = ordered.find((asset) => {
        const semanticRole = assetSemanticRole(asset);
        return semanticRole === "keySubject"
          || semanticRole === "protagonist"
          || semanticRole === "prop"
          || semanticRole === "antagonist"
          || semanticRole === "brandLogo";
      });
      return subject ? [subject] : [];
    }
    case "logo":
      if (options.copySafeLogoText) return [];
      return uniqueAssets([firstAsset(assets, bySemanticRole("brandLogo"))]);
    case "announcement":
      return [];
    case "collab": {
      const gameCharacter = firstAsset(assets, (asset) =>
        bySourceRole("gameCharacter")(asset) || assetSemanticRole(asset) === "keySubject");
      const collabCharacter = firstAsset(assets, bySourceRole("collabCharacter"));
      const gameLogo = firstAsset(assets, bySourceRole("gameLogo"));
      const partnerLogo = firstAsset(assets, bySourceRole("brandLogo"));
      return partnerLogo
        ? uniqueAssets([gameCharacter, collabCharacter, gameLogo, partnerLogo])
        : uniqueAssets([gameCharacter, collabCharacter]);
    }
    default:
      return assets;
  }
}

function imageReferencePolicyPromptBlock(
  promptPackage: PromptPackage,
  imageAssets: ProviderAssetReference[],
  options: ProviderAssetReferenceOptions,
): string {
  if (promptPackage.target !== "image" || promptPackage.mode === "poster") return "";
  const included = imageAssets.length
    ? imageAssets.map((asset) => `${asset.role}/semanticRole=${assetSemanticRole(asset)}`).join(", ")
    : "none";
  const analysisOnly = promptPackage.assets
    .filter((asset) => !isIntegratedReferenceAsset(asset))
    .map((asset) => `${asset.role}/semanticRole=${assetSemanticRole(asset)}`)
    .join(", ");
  const shared = [
    "## Mode-Specific Visual Reference Intake",
    `Raw image references sent to the image model for this mode: ${included}.`,
    analysisOnly ? `Analysis-only references not sent as raw images: ${analysisOnly}.` : "",
    "Style and composition reference images are analysis inputs only. Use their extracted style, camera, layout, safe-area, and visual-flow notes; do not copy their characters, objects, logos, scenery, UI, text, brand content, or project-specific motifs into the generated image.",
    "Uploaded assets that are not sent as raw images are still represented by the prompt, reference analysis, semantic role map, and mode rules. Do not copy a full poster/layout/text-heavy reference image unless the current mode explicitly asks for that format.",
  ];
  const modeRule: Record<ProductionMode, string> = {
    poster: "",
    icon: "Icon mode isolation: use at most one uploaded subject/motif as identity reference. Do not copy poster composition, slogan lettering, UI panels, multi-character battle scenes, reference-sheet borders, crop marks, side labels, edge numbers, barcode-like strokes, or text from any uploaded reference. Final output must be a 1:1 text-free icon with one bold subject and minimal background. If the attached raw reference is a character, draw that character only; do not add a second large object, shield, weapon, unrelated prop, badge, or hand-held item unless it is visibly present in that reference.",
    logo: options.copySafeLogoText
      ? "Logo mode copy-safe isolation: no raw logo lettering reference is sent because the requested wordmark is text-risky. Build a clean blank logo/wordmark plate, emblem, or mark system from non-text brand cues only. No scene, no characters, no poster background, no pseudo-letters."
      : "Logo mode isolation: use only brand/logo references as raw images. Other uploaded assets are motif/style context only, not scene subjects. Final output must be a logo/mark system, not a poster or character scene.",
    announcement: "Announcement mode isolation: raw references are limited to brand/supporting presenter imagery. Build a calm in-game announcement panel or event card with a strong copy-safe area; do not turn the render into an action poster and do not generate garbled operational text.",
    collab: "Collab mode isolation: raw references are limited to participant identities and, only when both sides have uploaded brand references, separate brand logos. If the partner brandLogo is missing, do not use or redraw uploaded gameLogo lettering as visible text; reserve blank non-letter brand plates or neutral emblems. Render one clear instance of each side, keep them separate, and show a shared interaction; do not duplicate either side, merge them into a hybrid, or generate pseudo-letters.",
  };
  return [...shared, modeRule[promptPackage.mode]].filter(Boolean).join("\n");
}

function logoCopySafeImagePromptFromPromptPackage(input: {
  promptPackage: PromptPackage;
  modeState: WorkspaceModeState;
  maxChars: number;
}): string {
  const backgroundColor = input.modeState.modeForm.mode === "logo"
    ? input.modeState.modeForm.backgroundColor
    : "#ffffff";
  return joinPromptBlocks([
    "## Logo Asset Task",
    "Create a clean standalone game brand mark asset, not a scene, poster, title screen, splash art, menu, or character illustration.",
    `Use a pure solid-color background (${backgroundColor || "#ffffff"}). Center one polished blank non-letter title plaque, emblem, badge, or mark system with strong silhouette and export-ready edges.`,
    "No readable text anywhere. Do not render words, captions, pseudo-letters, subtitles, slogans, labels, or internal instruction terms. Do not render the concepts copy, safe, wordmark, blank, prompt, enforcement, logo mode, or provider note as visible letters.",
    "Do not render player characters, BOSS creatures, monsters, portals, rooms, battles, landscape backgrounds, UI panels, coins, weapons, unrelated scene content, or poster storytelling. Use only abstract non-text motifs such as geometric emblems, spark shapes, quest-route arcs, shield-like contour, bevels, highlights, and brand-colored materials.",
    "The output should feel like a production logo/badge source image: simple, centered, readable as a silhouette at small size, with generous clear space.",
    "Final audit before rendering: one centered non-text mark on a plain solid background; zero characters; zero scene; zero readable letters.",
  ]).slice(0, input.maxChars);
}

function announcementImagePromptFromPromptPackage(input: {
  promptPackage: PromptPackage;
  maxChars: number;
}): string {
  return joinPromptBlocks([
    "## Game Announcement Card Task",
    "Create a polished in-game announcement/event card layout, not a campaign poster, battle KV, logo screen, or action illustration.",
    "Highest priority: reserve a large calm editable copy area as the main visual hierarchy. The copy area should occupy roughly half of the canvas and read as a natural UI panel, parchment board, menu card, signboard, or event notice surface.",
    "Keep the copy area intentionally blank or filled with simple non-readable placeholder strokes only. Do not generate operational text, fake text, slogans, pseudo-letters, title words, instruction words, or garbled lettering.",
    "Use one small blank decorative brand badge or empty header medallion if needed; it must contain no readable letters. Do not copy or invent a game title.",
    "Use optional small non-specific side decoration only if it does not compete with the copy area. No character squads, no battle pose, no BOSS, no action scene, no large mascot, no large logo.",
    "Use a quiet illustrated game UI feel: clear foreground panel, soft themed background, low visual noise behind text zones, restrained particles, readable margins, and obvious hierarchy. Culinary-adventure motifs may appear as subtle frame ornaments only.",
    "Final audit before rendering: it must look like an announcement card with a blank editable copy zone, not a poster. One tiny blank badge maximum. No character group. No readable generated text.",
  ]).slice(0, input.maxChars);
}

function nonPosterImagePromptFromPromptPackage(input: {
  promptPackage: PromptPackage;
  snapshot: WorkspaceSnapshot;
  modeState: WorkspaceModeState;
  assets: ProviderAssetReference[];
  copySafeLogoText: boolean;
  maxChars: number;
}): string {
  const policyBlock = imageReferencePolicyPromptBlock(input.promptPackage, input.assets, {
    copySafeLogoText: input.copySafeLogoText,
    imageGeneration: true,
  });
  const mandatoryModeContract = input.promptPackage.mode === "collab"
    ? collabMandatoryVisualContract(input.assets)
    : "";
  if (input.promptPackage.mode === "logo" && input.copySafeLogoText) {
    return joinPromptBlocks([
      policyBlock,
      mandatoryModeContract,
      logoCopySafeImagePromptFromPromptPackage({
        promptPackage: input.promptPackage,
        modeState: input.modeState,
        maxChars: input.maxChars,
      }),
    ]).slice(0, input.maxChars);
  }
  if (input.promptPackage.mode === "announcement") {
    return joinPromptBlocks([
      policyBlock,
      mandatoryModeContract,
      announcementImagePromptFromPromptPackage({
        promptPackage: input.promptPackage,
        maxChars: input.maxChars,
      }),
    ]).slice(0, input.maxChars);
  }
  return joinPromptBlocks([
    policyBlock,
    mandatoryModeContract,
    redactLogoCopySafeWordmarkPrompt({
      prompt: normalizeModePlaceholderAliases(input.promptPackage.finalPrompt, input.promptPackage.mode),
      snapshot: input.snapshot,
      modeState: input.modeState,
    }),
  ]).slice(0, input.maxChars);
}

export function assetsFromPromptPackage(
  promptPackage: PromptPackage,
  snapshot: WorkspaceSnapshot,
  options: ProviderAssetReferenceOptions = {},
): ProviderAssetReference[] {
  const roleCounters = new Map<string, number>();
  return filterImageReferenceAssetsForMode(promptPackage, options).map((asset) => {
    const nextIndex = (roleCounters.get(asset.role) || 0) + 1;
    roleCounters.set(asset.role, nextIndex);
    return toProviderAssetReference(asset, snapshot, nextIndex, promptPackage.mode, options);
  });
}

function providerImageAssetsForRequest(input: {
  promptPackage: PromptPackage;
  snapshot: WorkspaceSnapshot;
  providerId: ProviderId;
  copySafeLogoText: boolean;
}): ProviderAssetReference[] {
  const assets = assetsFromPromptPackage(input.promptPackage, input.snapshot, {
    copySafeLogoText: input.copySafeLogoText,
    imageGeneration: true,
  });

  return assets;
}

function creativeDirectionFromPromptPackage(promptPackage: PromptPackage): string {
  return promptPackage.sections
    .map((section) => `## ${section.title}\n${section.content}`)
    .join("\n\n")
    .slice(0, 4000);
}

function demotePlaceholderAppearanceDescriptions(text: string): string {
  const placeholder = String.raw`\[(?:Game Character \d+|Boss(?: \d+)?|Game Logo|Brand Logo|Prop \d+|Key Subject \d+|Supporting Asset \d+)\]`;
  const appearanceTerms = [
    "保持",
    "保留",
    "面部",
    "脸",
    "发型",
    "头发",
    "服装",
    "比例",
    "武器",
    "盾牌",
    "身体",
    "字母",
    "logo",
    "lettering",
    "preserve",
    "face",
    "hair",
    "costume",
    "weapon",
    "shield",
    "body",
    "anatomy",
  ].join("|");
  const placeholderParenthetical = new RegExp(`(${placeholder})[（(][^）)]*(?:${appearanceTerms})[^）)]*[）)]`, "giu");
  return text
    .replace(placeholderParenthetical, "$1")
    .replace(/手持其标志性的[^，。,.]+/g, "使用上传参考中的标志性道具")
    .replace(/手持[^，。,.]*(?:武器|盾牌|工具|道具)[^，。,.]*/g, "使用上传参考中的道具")
    .replace(/holding (?:its|their|the) signature [^,.]+/gi, "using its uploaded signature prop/tool")
    .replace(/\n{3,}/g, "\n\n");
}

function compactPromptBlock(text: string, maxChars: number): string {
  const normalized = text.replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized || normalized.length <= maxChars) return normalized;
  const suffix = "\n[Block compacted to preserve higher-priority identity, integration, logo, typography, and guardrail rules.]";
  return `${trimPromptAtBoundary(normalized, Math.max(0, maxChars - suffix.length))}${suffix}`;
}

function trimPromptAtBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const clipped = text.slice(0, maxChars).trimEnd();
  const boundary = Math.max(
    clipped.lastIndexOf("\n\n"),
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("。"),
    clipped.lastIndexOf("; "),
    clipped.lastIndexOf("；"),
    clipped.lastIndexOf(" "),
  );
  return (boundary > maxChars * 0.72 ? clipped.slice(0, boundary + 1) : clipped).trimEnd();
}

function joinPromptBlocks(blocks: string[]): string {
  return blocks.map((block) => block.trim()).filter(Boolean).join("\n\n");
}

function normalizeModePlaceholderAliases(text: string, mode: ProductionMode): string {
  if (mode !== "collab") return text;
  return text
    .replace(/\[Collab Character\]/gi, "[Collab Partner]")
    .replace(/\[Partner Character\]/gi, "[Collab Partner]");
}

function joinPromptBlocksWithinLimit(input: {
  criticalBlocks: string[];
  flexibleBlocks: Array<{ text: string; maxChars: number; minChars?: number }>;
  closingBlocks: string[];
  maxChars?: number;
}): string {
  const maxChars = input.maxChars || PROVIDER_PROMPT_MAX_CHARS;
  const criticalBlocks = input.criticalBlocks.map((block) => block.trim()).filter(Boolean);
  const closingBlocks = input.closingBlocks.map((block) => block.trim()).filter(Boolean);
  const output = [...criticalBlocks];
  const closingText = joinPromptBlocks(closingBlocks);

  for (const [index, block] of input.flexibleBlocks.entries()) {
    const remainingFlexibleMin = input.flexibleBlocks
      .slice(index + 1)
      .reduce((sum, item) => sum + (item.text.trim() ? item.minChars || 0 : 0), 0);
    const usedWithoutClosing = joinPromptBlocks(output).length;
    const separatorBudget = 4 * (output.length + closingBlocks.length + 1);
    const available = maxChars - usedWithoutClosing - closingText.length - remainingFlexibleMin - separatorBudget;
    const budget = Math.min(block.maxChars, available);
    if (budget >= (block.minChars || 160)) {
      output.push(compactPromptBlock(block.text, budget));
    }
  }

  const prompt = joinPromptBlocks([...output, ...closingBlocks]);
  if (prompt.length <= maxChars) return prompt;

  const bodyBudget = maxChars - closingText.length - 4;
  if (bodyBudget >= 400) {
    return joinPromptBlocks([compactPromptBlock(joinPromptBlocks(output), bodyBudget), closingText]);
  }
  return compactPromptBlock(prompt, maxChars);
}

function integratedSloganPriorityBlock(sloganTargets: string): string {
  if (!sloganTargets) return "";
  return [
    "## Integrated Slogan Treatment Lock",
    "Slogan visibility requirement: slogan mode is active for this image.",
    sloganTargets,
    "Render the exact slogan text as integrated game-campaign lettering if clean spelling is possible.",
    "scene-derived requirement: the slogan must be tied to this specific scheme's action, prop, BOSS threat, or set-piece material, not a generic caption that could fit any poster.",
    integratedSloganTreatmentRule(),
    "Single-use typography requirement: the exact slogan/copy treatment may appear once only. No duplicate small subtitle, lower-left or lower-right plaque, bottom plaque, caption, corner badge, watermark, blank extra title plate, translated repeat, or second slogan block.",
    "Copy-safe fallback: if clean spelling is not possible, still create a visible polished blank slogan-safe plate/ribbon/sign in the intended copy area; do not omit the copy area entirely and do not generate garbled text.",
  ].join("\n");
}

function posterRequiredAnchorNames(
  assets: PromptAssetBinding[],
  role: PosterAssetSemanticRole,
  fallbackLabel: string,
): string {
  const matches = assets.filter((asset) => assetSemanticRole(asset) === role);
  if (matches.length === 0) return "";
  return matches
    .map((asset, index) => asset.placeholder || posterAssetReferenceName(asset, index + 1))
    .join(", ") || fallbackLabel;
}

function styleStrategyText(promptPackage: PromptPackage): string {
  return promptPackage.sections.find((section) => section.id === "style-strategy")?.content || "";
}

function posterMandatoryVisualContract(input: {
  promptPackage: PromptPackage;
  sloganTargets: string;
}): string {
  const heroAssets = input.promptPackage.assets.filter((asset) => assetSemanticRole(asset) === "protagonist");
  const heroNames = heroAssets
    .map((asset, index) => asset.placeholder || posterAssetReferenceName(asset, index + 1))
    .join(", ") || posterRequiredAnchorNames(input.promptPackage.assets, "protagonist", "[Game Character]");
  const bossNames = posterRequiredAnchorNames(input.promptPackage.assets, "antagonist", "[Boss]");
  const logoNames = posterRequiredAnchorNames(input.promptPackage.assets, "brandLogo", "[Game Logo]");
  const required = [
    heroNames ? `protagonist anchor(s): ${heroNames}` : "",
    bossNames ? `BOSS/threat anchor(s): ${bossNames}` : "",
    logoNames ? `single brand/logo treatment: ${logoNames}` : "",
    input.sloganTargets ? "visible integrated slogan/copy-safe treatment" : "",
  ].filter(Boolean);

  if (required.length === 0) return "";

  return [
    "## Non-Negotiable Poster Visual Contract",
    `Final image fails if any required visual anchor is absent, tiny, hidden, duplicated, or replaced: ${required.join("; ")}.`,
    heroAssets.length > 1
      ? `Multi-character hero requirement: every uploaded protagonist anchor must appear as a separate readable in-world character: ${heroNames}. They must not be merged, averaged, swapped, omitted, hidden behind a prop/plate, or reduced to tiny decorations.`
      : "",
    heroNames && heroAssets.length <= 1
      ? "Hero anchor requirement: at least one uploaded protagonist is a large readable foreground/midground actor with visible face/emotion, changed action pose, contact shadow, and set-piece/BOSS interaction."
      : "",
    bossNames
      ? "BOSS anchor requirement: the uploaded BOSS/key threat is a physically dominant campaign subject, not a background ornament. It reads as a large secondary campaign object or main threat with lunge/impact/recoil intent, scale pressure, contact/landing cues, debris, particles, and environmental reaction."
      : "",
    logoNames
      ? "Logo anchor requirement: use exactly one campaign-safe logo treatment. Reproduce uploaded lettering only if accurate; otherwise create one polished blank in-world sign/title plate without fake letters."
      : "",
    input.sloganTargets
      ? "Slogan anchor requirement: slogan mode is active; reserve one large visible slogan area tied to the scheme action/material: in-world sign, energy stroke, smoke ribbon, flag, carved plaque, neon board, metal/stone relief, hologram, or battle banner. If spelling is unsafe, leave the plate blank but visible. Do not repeat the same slogan as a second plaque, subtitle, caption, corner badge, bottom label, lower-left label, or lower-right label."
      : "",
    heroAssets.length > 1
      ? "Pre-render checklist: all uploaded hero identities visible as separate characters; uploaded BOSS threat visible; single logo treatment visible/reserved; slogan-safe area visible when active; contact shadows, occlusion, and VFX connect subjects to the world."
      : "Pre-render checklist: uploaded hero identity visible; uploaded BOSS threat visible; single logo treatment visible/reserved; slogan-safe area visible when active; contact shadows, occlusion, and VFX connect subjects to the world.",
  ].filter(Boolean).join("\n");
}

function collabMandatoryVisualContract(assets: ProviderAssetReference[]): string {
  const collabPartner = assets.find((asset) => asset.role === "collabCharacter");
  const gameCharacter = assets.find((asset) => asset.role === "gameCharacter");
  const brandReferences = assets.filter((asset) => assetSemanticRole(asset) === "brandLogo");
  if (!collabPartner && !gameCharacter && brandReferences.length === 0) return "";

  return [
    "## Non-Negotiable Collab Dual-Subject Contract",
    collabPartner && gameCharacter
      ? "Partner-first co-star lock / dual co-star lock: design the composition around TWO large readable co-stars before adding backgrounds, props, brand plates, particles, or decorations. [Game Character] and [Collab Partner] must both be visible at comparable scale in the same frame, preferably left/right or foreground/midground with a shared handoff, defense, race, rescue, exchange, or impact interaction."
      : "",
    collabPartner && gameCharacter
      ? "Image-reference handling: treat every uploaded image as an identity/model-sheet reference only, not as the source canvas, background, or crop to transform. The final frame must be newly composed and must include both referenced characters."
      : "",
    collabPartner
      ? `The uploaded collabCharacter reference (${collabPartner.id}) is [Collab Partner]. It must appear as a separate readable co-star, never as a tiny background mascot, hidden decoration, merged hybrid, or omitted partner.`
      : "",
    gameCharacter
      ? `The uploaded gameCharacter reference (${gameCharacter.id}) is [Game Character]. It must appear as a separate readable co-star with its own preserved identity.`
      : "",
    collabPartner && gameCharacter
      ? "do not merge characters: [Collab Partner] and [Game Character] must remain two separate identities with separate silhouettes and roles."
      : "",
    collabPartner && gameCharacter
      ? "Both co-stars must have comparable visual importance: balanced foreground/midground scale, readable silhouettes, shared lighting, and a visible interaction touchpoint such as exchanged props, guarding the same objective, racing through the same portal, rescuing, handing off an item, or reacting to the same impact."
      : "",
    collabPartner && gameCharacter
      ? "Two-character audit: render exactly one [Collab Partner] and exactly one [Game Character] as the primary characters. Do not add a third lead, do not replace either side with a logo-only presence, and do not hide either character behind a prop, plate, or crowd."
      : "",
    collabPartner && gameCharacter
      ? "Shared-scene integration: the two co-stars must share the same perspective, ground plane, contact shadows, rim light, color grading, and environmental VFX so the collab feels native to one world rather than two stickers placed side by side."
      : "",
    "The image fails if the two sides are fused into one character, one side disappears, one side becomes a logo-only presence, or the partner is reduced to a background icon.",
    brandReferences.length > 0
      ? "Brand/logo handling: keep uploaded brand references separate. Use exact lettering only when clean; otherwise use blank non-letter plates or neutral emblems. Do not invent fake partner names, fake sponsor words, or hybrid logo text."
      : "Brand/logo handling: no uploaded brandLogo exists for a partner. Create blank non-letter partner/game brand plates or neutral emblems only; do not generate readable partner names, fake sponsor words, or distorted game-logo text.",
  ].filter(Boolean).join("\n");
}

function staticSchemeActionRewriteRule(): string {
  return "Static scheme action rewrite: if selected scheme text says a character/BOSS stands, sits, is placed, is located, faces off, or simply presses in from one side, reinterpret that staging into an active trailer moment: sprint, leap, block, parry, swing, brace, slide, climb, land with dust, burst through a doorway/portal, collide with the set piece, or react to impact. Preserve uploaded identity, but do not preserve static standee staging.";
}

function rewriteStaticPosterActionPhrases(text: string): string {
  return text
    .replace(/(\[Game Character \d+\])\s+stands heroically\s+(on|at|along|in|near)\s+/giu, "$1 actively sprints, blocks, or slides $2 ")
    .replace(/(\[Game Character \d+\])\s+stands(?:\s+heroically)?\b/giu, "$1 lunges in a 3/4 readable action pose")
    .replace(/(\[Game Character \d+\])\s+is\s+(?:placed|located|positioned)\b/giu, "$1 is staged mid-action")
    .replace(/(\[Boss(?: \d+)?\])\s+(?:presses in|presses from one side|stands|is placed|is located|is positioned)\b/giu, "$1 lunges, swings, or recoils with a clear attack path")
    .replace(/(\[Game Character \d+\])\s*(?:英勇地)?站在/giu, "$1 以3/4动态姿态冲刺、格挡或滑行在")
    .replace(/(\[Game Character \d+\])\s*(?:位于|被放置在|处于)/giu, "$1 正在动作中穿过")
    .replace(/(\[Boss(?: \d+)?\])\s*从一侧压迫/giu, "$1 从一侧猛冲、挥击或撞入")
    .replace(/(\[Boss(?: \d+)?\])\s*(?:站在|位于|被放置在|处于)/giu, "$1 以攻击或冲击姿态占据");
}

function posterIntegratedKvPromptFromPromptPackage(
  promptPackage: PromptPackage,
  maxChars = PROVIDER_PROMPT_MAX_CHARS,
): string {
  const allowedSectionIds = new Set([
    "project",
    "mode",
    "style-strategy",
    "poster-quality",
    "scheme",
    "characters",
    "assets",
    "slogans",
    "poster-typography",
    "platform",
    "reference-analysis",
  ]);
  const sectionText = rewriteStaticPosterActionPhrases(demotePlaceholderAppearanceDescriptions(promptPackage.sections
    .filter((section) => allowedSectionIds.has(section.id))
    .sort((left, right) => {
      if (left.id === "scheme" && right.id !== "scheme") return -1;
      if (right.id === "scheme" && left.id !== "scheme") return 1;
      return 0;
    })
    .map((section) => `## ${section.title}\n${section.content}`)
    .join("\n\n")));
  const schemeText = rewriteStaticPosterActionPhrases(demotePlaceholderAppearanceDescriptions(promptPackage.sections
    .filter((section) => section.id === "scheme")
    .map((section) => `## ${section.title}\n${section.content}`)
    .join("\n\n")));
  const supportingSectionText = rewriteStaticPosterActionPhrases(demotePlaceholderAppearanceDescriptions(promptPackage.sections
    .filter((section) => allowedSectionIds.has(section.id) && section.id !== "scheme")
    .map((section) => `## ${section.title}\n${section.content}`)
    .join("\n\n")));
  const guardrails = promptPackage.guardrails
    .map((item) => `${item.severity.toUpperCase()}: ${item.rule}`)
    .join("\n");
  const hasStyleReference = promptPackage.assets.some((asset) => assetSemanticRole(asset) === "styleReference");
  const hasCompositionReference = promptPackage.assets.some((asset) => assetSemanticRole(asset) === "compositionReference");
  const hasCharacterReference = promptPackage.assets.some((asset) => assetSemanticRole(asset) === "protagonist");
  const styleStrategy = styleStrategyText(promptPackage);
  const hasSelectedStyle = /Active style source:\s*selected style tag/i.test(styleStrategy);
  const styleRule = hasStyleReference
      ? "Visual style lock: follow the styleReference visual guide and any extracted style analysis for rendering, palette, lighting, line quality, and material finish. Do not copy the style reference image's characters, objects, logos, scenery, layout, text, brand content, or project-specific motifs."
    : hasSelectedStyle
      ? "Visual style lock: follow the manually selected style library tag as the dominant rendering standard for palette, lighting, shape language, material finish, and overall art direction. Uploaded characters/BOSS/logo still define identity only and must be adapted into that selected style without redesigning their recognizable traits."
    : hasCharacterReference
      ? "Visual style lock: no styleReference image and no selected style tag are active, so match the uploaded character art direction / uploaded gameCharacter asset art direction for the whole world plate. Use a stylized 2D cartoon game illustration language: rounded readable shapes, clean graphic silhouettes, confident line-art feeling, soft cel/painterly shading, vibrant game-poster colors, and premium mobile-game key-art polish. Do not use photorealistic product photography, realistic unrelated 3D render, camera macro product shot, or stock-photo background."
      : "Visual style lock: use a stylized game campaign illustration style, not photorealistic product photography, unless the user explicitly selected a realistic style.";
  const analysisOnlyRule = [
    hasStyleReference
      ? "Style reference handling: the uploaded styleReference is a visual guide only. Apply only its rendering language, palette, lighting, materials, line quality, and finish; never reproduce its source content."
      : "",
    hasCompositionReference
      ? "Composition reference handling: the uploaded compositionReference is a visual guide only. Extract camera, layout, subject scale, diagonal/foreground structure, negative space, safe-area, visual flow, and focal hierarchy; never reproduce its source content, brands, characters, UI, scene, title text, slogan text, logo, monster, unrelated objects, or decorative words."
      : "",
  ].filter(Boolean).join(" ");
  const semanticGroups = promptPackage.assets.reduce((groups, asset) => {
    const semanticRole = assetSemanticRole(asset);
    groups.set(semanticRole, [...(groups.get(semanticRole) || []), asset]);
    return groups;
  }, new Map<PosterAssetSemanticRole, PromptAssetBinding[]>());
  const characters = semanticGroups.get("protagonist") || [];
  const bosses = semanticGroups.get("antagonist") || [];
  const logos = semanticGroups.get("brandLogo") || [];
  const sloganTargets = Object.entries(promptPackage.slogans)
    .map(([language, slogan]) => `${language}: ${slogan}`)
    .join("\n");
  const assetRoleInventory = assetSemanticInventory(promptPackage.assets, { mode: promptPackage.mode });
  const fusionDirective = modeAssetFusionDirective(promptPackage.mode, promptPackage.assets);
  const referenceMap = [
    characters.length > 0
      ? [
        `Exact playable roster count: ${characters.length}. Render every listed uploaded protagonist as a playable hero: ${characters.map((asset, index) => asset.placeholder || `[Game Character ${index + 1}]`).join(", ")}.`,
        characters.length === 1
        ? "Single-character lock: if any scheme text says squad/team/heroes, reinterpret that as only [Game Character 1]. Do not add any other human helper, teammate, or replacement protagonist."
          : "Multi-character lock: all uploaded characters must be visible as separate readable characters; do not merge, average, omit, hide, recolor, or swap traits.",
      ].join(" ")
      : "",
    bosses.length > 0 ? `Antagonist lock: ${bosses.map((asset, index) => posterAssetReferenceName(asset, index + 1)).join(", ")} means the uploaded BOSS/key-subject reference(s); preserve identity while redrawing as dominant in-world threat(s).` : "",
    logos.length > 0 ? `Logo lock: ${logos.map((asset, index) => posterAssetReferenceName(asset, index + 1)).join(", ")} means uploaded logo/brand reference(s); render exact lettering only when it can stay accurate, otherwise reserve one polished blank logo-safe treatment without fake text.` : "",
  ].filter(Boolean).join("\n");
  const sloganPriorityBlock = integratedSloganPriorityBlock(sloganTargets);
  const visualContract = posterMandatoryVisualContract({ promptPackage, sloganTargets });
  const schemeAnchor = compactPromptBlock(schemeText, 900);

  const architectureBlock = posterKvArchitectureDirective({
    seed: promptPackage.schemeId || promptPackage.id,
    assetCounts: posterKvAssetCountsFromAssets(promptPackage.assets),
    preferredText: sectionText,
  });

  return joinPromptBlocksWithinLimit({
    criticalBlocks: [
    "## Integrated Game Campaign KV Task",
    "Generate the final unified premium game campaign key visual as one coherent illustration.",
    "Default pipeline: AI integrated redraw. REFERENCE PANEL BAN: use uploaded raw image references as identity, subject, prop, environment, brand anchors, and visual guide references inside the model generation, never as copied picture-in-picture panels. StyleReference and compositionReference are guide-only inputs: extract their style/camera/layout logic but never copy their content, words, logos, characters, monsters, unrelated props, or scene. Do not plan a separate background plate for local sticker compositing.",
    assetRoleInventory ? "## Uploaded Asset Role Semantics and Fusion Strategies\nUse each uploaded asset according to its semantic duty and fusion strategy; these duties override loose scheme wording." : "",
    "Reference pose release: identity lock does not mean copying the exact uploaded front-facing/static pose. Repaint each uploaded hero/BOSS as a living actor with at least one visible performance change: 3/4 turn, stride, leap, recoil, attack wind-up, defensive block, grip/contact with a prop, landing dust, squash/stretch, or foreshortened limb/tool angle.",
    analysisOnlyRule,
    schemeAnchor,
    visualContract,
    characters.length > 1
      ? "KV ACTION MINI-BRIEF: every uploaded hero appears as a readable separate actor, one physically dominant uploaded BOSS/key threat, one integrated blank or exact-safe logo/copy area, one shared ground plane, visible contact shadows, foreground occlusion, rim light, and VFX crossing in front of the subjects."
      : "KV ACTION MINI-BRIEF: one large readable uploaded hero, one physically dominant uploaded BOSS/key threat, one integrated blank or exact-safe logo/copy area, one shared ground plane, visible contact shadows, foreground occlusion, rim light, and VFX crossing in front of the subjects.",
    posterFocalHierarchyLock(),
    posterTextEconomyLock(),
    posterInWorldBrandTreatmentLock(),
    "REFERENCE PANEL BAN: reference images are private model sheets or analysis documents, not picture-in-picture content. Do not place a copied reference image, black-background cutout, side-by-side comparison panel, model-sheet panel, empty black block, or sticker pasted from an uploaded asset anywhere on the final canvas.",
    "Use uploaded image references as binding visual anchors, not as static stickers. Subject assets may change pose, expression, action, camera angle, lighting, scale, and perspective to become vivid in-world actors or objects while preserving their recognizable identity.",
    "BOSS performance lock: the uploaded BOSS/key threat must not read as a scaled-up sticker in the same standing pose. Stage it lunging, bracing, swinging, bursting through the set, landing with dust, or reacting to impact while preserving its silhouette and signature details.",
    posterHeroPerformanceScaleLock(),
    posterSubjectAccessoryStrictnessLock(),
    staticSchemeActionRewriteRule(),
    assetRoleInventory ? `## Detailed Uploaded Asset Role Map\n${assetRoleInventory}` : "",
    referenceMap ? `## Exact Uploaded Reference Map\n${referenceMap}` : "",
    "ABSOLUTE HIGHEST PRIORITY - REFERENCE IDENTITY AND BLENDING: replicate the recognizable visual identity from uploaded identity/subject references while integrating them into the new scene's lighting. Preserve character face shape, hair colors, costume palette, body proportions, signature prop/tool, line weight, BOSS silhouette, crown, eye, teeth, tongue, mouth, color blocks, prop shape, and uploaded logo design.",
    "Reference identity may only be reposed or re-lit. Do not age-up, add beard/mustache, change hairstyle or hair color, change costume, change body type/proportions, change species, or replace a chibi/mascot reference with a generic adult character.",
    posterIdentitySafeMotionRule(),
    "Do not give uploaded characters new weapons, armor, swords, shields, adult facial structures, noses, beards, mustaches, or costume variants unless those details are clearly present in the reference image.",
    "If the scheme prompt uses placeholders such as [Game Character 1], [Game Character 2], [Boss], or [Game Logo], replace those placeholders with the corresponding uploaded visual references. Do not describe or invent their physical appearance from text.",
    "Placeholder annotation rule: any written appearance, species, clothing, weapon, logo-lettering, color, or anatomy description attached to a placeholder is non-binding unless it is visibly present in the uploaded reference. The uploaded image reference is the source of truth; ignore conflicting or embellished placeholder descriptions.",
    "Scheme text sanitation rule: if the selected scheme text names a placeholder's clothing, face, body, weapon, shield, logo lettering, or other appearance details, treat those words as non-binding staging notes only. The uploaded image reference remains the only source of truth for visual identity.",
    "The uploaded subjects and brand elements must look repainted into the same scene, not pasted on top: apply environmental color grading, rim light, contact shadows, bounce light, atmospheric perspective, partial foreground occlusion, material interaction, and VFX overlap across their bodies or surfaces.",
    "Contact and occlusion audit: every place an uploaded hero, BOSS, prop, or logo treatment touches another object must show overlap edge, contact shadow, cast shadow, bounce color, and local material reaction. No clean cutout silhouettes floating above the scene.",
    "Limb and hand sanity audit: every visible playable character must have a coherent arm/hand count, clear wrist-to-hand connection, intentional prop grip, and no duplicated forearms, front-and-back duplicate hands, disconnected hands, fused fingers, or impossible limb overlaps.",
    styleRule,
    "The poster must show a concrete story moment: uploaded heroes in action against the uploaded BOSS/key subject, with readable intent, movement, pressure, and environmental reaction.",
    "Design with cinematic composition, strong depth, dramatic lighting, polished color grading, foreground/midground/background separation, and a clear trailer-moment focal hierarchy built around protagonist action, objective pressure, environmental pressure, or BOSS threat.",
    "Art-direction checklist for the final render: visible camera/lens/perspective choice, foreground framing, midground action, background reveal, key/fill/rim lighting, volumetric haze, particles/VFX, cast and contact shadows, color/value grouping, material texture, and in-world logo/typography integration.",
    "Set-piece and action requirement: build a memorable physical campaign location from the current project and connect at least one uploaded hero to the BOSS or environment through blocking, climbing, striking, sliding, casting, repairing, piloting, pulling, defending, or impact. Avoid empty pastel sky, generic backdrops, unrelated sample-project scenes, centered mascot-ad layouts, and symmetrical floating heroes.",
    "Subject scale and weight requirement: the uploaded BOSS/key threat must feel physically planted or forcefully airborne with a clear landing/impact path, not a mascot sticker. The uploaded hero must have a readable support surface, grip, impact point, or motion trail with a cast shadow.",
    "Cinematic escalation must come from the scene design: asymmetrical low-angle or forced-perspective camera, one dominant diagonal action path, foreground occlusion, practical light source, rim/back light, volumetric beams, dust, smoke, sparks, embers, magic/tech particles, debris, and visible environmental reaction. Do not solve cinematic quality by making the uploaded characters into different, more realistic people.",
    "Allocate one readable campaign-safe logo treatment when uploaded logo/brand assets are present. Render the exact uploaded logo only when the letterforms can stay accurate; otherwise create a polished blank logo-safe sign/title plate using brand colors and shape language; do not invent look-alike words, substitute letters, or create an alternate fake logo. Integrate the slogan as custom game-poster lettering or an in-world sign/ribbon, with correct spelling when possible; if spelling cannot be guaranteed, leave a natural blank sign/ribbon/title plate rather than generating garbled text.",
    posterLogoSingleUseLock(),
    "Use each uploaded protagonist, antagonist, key subject, brand logo, and prop according to its semantic duty. Do not create duplicate large/small copies, alternate replacement characters, or extra generic heroes.",
    "Hard exclusion summary: No duplicate uploaded asset. No style/composition reference content copied into the scene. No generic replacement hero. No extra random protagonist. No sticker collage. No unchanged front-facing cutout look. No flat tabletop wallpaper.",
    ],
    flexibleBlocks: [
      { text: architectureBlock, maxChars: 3200, minChars: 900 },
      { text: fusionDirective ? `## Universal Asset Fusion Contract\n${fusionDirective}` : "", maxChars: 900, minChars: 260 },
      { text: supportingSectionText ? `## Workspace Creative Direction\n${supportingSectionText}` : sectionText, maxChars: 1200, minChars: 300 },
    ],
    closingBlocks: [
    characters.length > 1
      ? "Pre-render checklist: every uploaded hero identity visible as a separate character; uploaded BOSS threat visible; single logo treatment visible or reserved; slogan-safe area visible when active; contact shadows, occlusion, and VFX connect subjects to the world."
      : "Pre-render checklist: uploaded hero identity visible; uploaded BOSS threat visible; single logo treatment visible or reserved; slogan-safe area visible when active; contact shadows, occlusion, and VFX connect subjects to the world.",
    "Selected-scheme architecture lock: each image must visibly follow its own selected scheme architecture and story beat. A shared compositionReference may guide camera rhythm only; it must not cause multiple schemes to reuse the same background, pose arrangement, set piece, or scene.",
    "Scenario uniqueness lock: do not collapse this render into the default boss-versus-hero standoff if the selected scheme implies chase, discovery, defense, objective crisis, resource raid, route escort, victory payoff, town chaos, or expedition. The location family, camera grammar, mission objective, BOSS role, and emotional beat must match the selected scheme rather than a reused confrontation template.",
    sloganPriorityBlock,
    "Allocate one readable campaign-safe logo treatment when uploaded logo/brand assets are present.",
    posterLogoSingleUseLock(),
    posterFocalHierarchyLock(),
    posterTextEconomyLock(),
    posterInWorldBrandTreatmentLock(),
    "Logo copy safety lock: do not invent look-alike words, substitute letters, or create alternate fake logo text. Use the uploaded logo exactly only when readable, otherwise reserve a polished blank logo-safe treatment.",
    posterHeroPerformanceScaleLock(),
    "BOSS performance lock: the uploaded BOSS/key threat must not read as a scaled-up sticker in the same standing pose. Stage it lunging, bracing, swinging, bursting through the set, landing with dust, or reacting to impact while preserving its silhouette and signature details.",
    posterSubjectAccessoryStrictnessLock(),
    "Subject scale and weight requirement: the uploaded BOSS/key threat must feel physically planted or forcefully airborne with a clear landing/impact path, not a mascot sticker. The uploaded hero must have a readable support surface, grip, impact point, or motion trail with a cast shadow.",
    "Set-piece and action requirement: connect at least one uploaded hero to the BOSS or environment through blocking, climbing, striking, sliding, casting, repairing, piloting, pulling, defending, or visible impact.",
    "Placeholder annotation rule: any written appearance, species, clothing, weapon, logo-lettering, color, or anatomy description attached to a placeholder is non-binding unless it is visibly present in the uploaded reference.",
    "Scheme text sanitation rule: if selected scheme text names a placeholder's clothing, face, body, weapon, shield, logo lettering, or other appearance details, treat those words as non-binding staging notes only. The uploaded image reference remains the only source of truth for visual identity.",
    "Contact and occlusion audit: every place an uploaded hero, BOSS, prop, or logo treatment touches another object must show overlap edge, contact shadow, cast shadow, bounce color, and local material reaction. No clean cutout silhouettes floating above the scene.",
    "Limb and hand sanity audit: every visible playable character must have a coherent arm/hand count, clear wrist-to-hand connection, intentional prop grip, and no duplicated forearms, front-and-back duplicate hands, disconnected hands, fused fingers, or impossible limb overlaps.",
    "The uploaded subjects and brand elements must look repainted into the same scene with environmental color grading, rim light, contact shadows, bounce light, atmospheric perspective, foreground occlusion, material interaction, and VFX overlap.",
    staticSchemeActionRewriteRule(),
    "Use a deliberate campaign composition architecture, not a default side-scrolling battlefield. Favor one of these KV structures when it fits the scheme: dynamic split-world contrast, portal/breach reveal, foreground weapon/prop divider, boss reveal framed by doorway/canyon, comic-panel mission montage, or triumphant hero-on-defeated-boss trophy shot.",
    "Use the full requested canvas as artwork. Do not add black bars, letterbox bands, white borders, frames, UI chrome, or presentation margins.",
    "Show the story through character action and environment response: impact glow, energy arcs, dust, debris, sparks, magic/tech trails, weather, motion trails, atmospheric haze, rim-light pockets, foreground framing, and scale cues.",
    "World-building direction: turn the current project premise into a fantasy, tactical, adventure, simulation, or action battlefield with illustrated terrain and playable depth. Do not introduce scenery from an unrelated sample project.",
    "## Hard KV Exclusions",
    "No duplicate uploaded asset. No second slogan/copy plaque. No lower-left or lower-right repeated label. No corner badge with campaign copy. No extra blank title plate. No copied reference image. No copied styleReference or compositionReference content. No black-background cutout. No side-by-side comparison panel. No model-sheet panel. No empty black block. No generic replacement hero. No extra random protagonist. No sticker collage. No unchanged front-facing cutout look. No flat tabletop wallpaper. No empty pastel sky. No centered mascot-ad layout. No symmetrical floating corner heroes. No photorealistic product macro photography. No unrelated commercial render unless explicitly requested. No black bars. No letterbox. No border frame.",
    "Focus guidance handling: user focus guidance is only a creative emphasis. It must not override the assigned KV architecture, uploaded asset identity, readable story conflict, or production-quality composition. If the focus says giant scale or micro perspective, translate that into scale drama and camera energy without reducing the poster to a flat side-view scene. When focus guidance is active, visibly translate at least one focus item into camera, action, environment, prop, lighting, or copy-area design.",
    "## Mode Guardrails",
    guardrails,
    ],
    maxChars,
  });
}

function hasPosterLockedAssets(promptPackage: PromptPackage): boolean {
  return promptPackage.mode === "poster" && promptPackage.assets.some((asset) =>
    isPosterIntegratedReferenceAsset(asset),
  );
}

function shouldUsePosterScenePlateFallback(promptPackage: PromptPackage): boolean {
  if (promptPackage.mode !== "poster" || !hasPosterLockedAssets(promptPackage)) return false;
  return process.env.POSTER_LAB_FORCE_ASSET_OVERLAY === "1" || process.env.POSTER_LAB_FORCE_SCENE_PLATE === "1";
}

function posterIdentitySafePlatePromptFromPromptPackage(
  promptPackage: PromptPackage,
  maxChars = PROVIDER_PROMPT_MAX_CHARS,
): string {
  const allowedSectionIds = new Set([
    "project",
    "mode",
    "style-strategy",
    "poster-quality",
    "scheme",
    "platform",
    "reference-analysis",
  ]);
  const sectionText = promptPackage.sections
    .filter((section) => allowedSectionIds.has(section.id))
    .map((section) => `## ${section.title}\n${section.content}`)
    .join("\n\n");
  const guardrails = promptPackage.guardrails
    .map((item) => `${item.severity.toUpperCase()}: ${item.rule}`)
    .join("\n");
  const styleRule = promptPackage.assets.some((asset) => asset.role === "styleReference")
    ? "Style source: use only the extracted styleReference analysis for rendering, palette, lighting, line quality, and finish. Do not copy source-image content, subjects, logos, scenes, UI, or text from the style reference."
    : "Style source: create a premium stylized 2D cartoon mobile-game KV scene with rounded readable shapes, clean silhouettes, lively line-art feeling, soft cel/painterly shading, appetizing colors, and polished campaign lighting.";

  return [
    "## Identity-Safe Game Campaign KV Plate",
    "Generate the high-quality full-bleed poster SCENE PLATE only. This is the cinematic environment, lighting, depth, action staging, and atmosphere for a final campaign key visual.",
    styleRule,
    "Important pipeline rule: uploaded characters, BOSS/key subject, and logo will be composited after this generation from the original uploaded files to preserve exact identity. Therefore do NOT render finished copies of uploaded characters, BOSS, or logo inside this scene plate.",
    "When the selected scheme mentions [Game Character 1], [Game Character 2], [Boss], [Game Logo], or any uploaded subject placeholder, translate those placeholders into empty action zones, light pools, impact bursts, shadow/contact areas, foreground occlusion, and safe-area staging. Do not draw visible bodies, humans, mascots, faces, monster forms, logo letters, shadow silhouettes, placeholder silhouettes, or any substitute subject for those placeholders.",
    "Instead, leave natural action zones and lighting pockets for later compositing: left/front hero zone, right/front hero zone, center/right BOSS zone, upper natural negative-space glow pocket, and lower-right breathable copy-safe area. Do not place signs or labels there.",
    "Make the empty stage feel designed, not blank: use readable foreground platforms, cast-light pools, project-specific energy arcs, dust, debris, sparks, impact glow, rim-light pockets, atmospheric haze, foreground framing, scale cues, and a clear protagonist objective or BOSS-threat action path.",
    "Quality target: premium game marketing key visual background art with strong composition, layered foreground/midground/background depth, dramatic directional light, polished color grading, and clear silhouette hierarchy.",
    posterCinematicKvQualityDirective(),
    "World-building target: transform the current project premise into a fantasy, tactical, adventure, simulation, or action battlefield with playable depth. Avoid unrelated sample-project scenery, flat tabletop wallpaper, close-up product photography, realistic macro product shots, stock-photo lighting, or empty generic valleys.",
    "Text rule: no text of any kind. Do not render final slogan text, fake logo, the words GAME LOGO, labels, signboards, wooden plaques, blank UI panels, fake title plates, UI badges, watermark, or any readable/garbled letters. Leave natural negative space and lighting-safe areas only.",
    "Use the full requested canvas as artwork. Do not add black bars, letterbox bands, white borders, frames, UI chrome, or presentation margins.",
    sectionText,
    "## Hard Plate Exclusions",
    "No finished uploaded character copies. No finished BOSS copy. No finished logo copy. No people. No mascots. No monsters. No generic replacement heroes. No random protagonists. No duplicate characters. No shadow silhouettes or placeholder silhouettes. No text. No letters. No GAME LOGO words. No blank signboards or fake UI panels. No sticker collage. No flat product wallpaper. No photorealistic product macro photography. No black bars. No borders.",
    "## Mode Guardrails",
    guardrails,
  ].filter(Boolean).join("\n\n").slice(0, maxChars);
}

function assertPromptPackageReadyForProvider(promptPackage: PromptPackage): void {
  if (!promptPackage.validation.ok) {
    throw new Error(`Prompt package validation failed: ${promptPackage.validation.errors.join(" ")}`);
  }

  const missingRequiredUrls = promptPackage.assets.filter((asset) => asset.required && !asset.providerReady);
  if (missingRequiredUrls.length > 0) {
    const labels = missingRequiredUrls.map((asset) => `${asset.label} (${asset.role})`).join(", ");
    const hasPlaceholderUrl = missingRequiredUrls.some((asset) => isExampleAssetUrl(asset.url));
    throw new Error(
      hasPlaceholderUrl
        ? `Image generation requires real uploaded visual reference files. Required asset(s) still use demo placeholder URLs and must be re-uploaded: ${labels}.`
        : `Image generation requires provider-ready URLs for required assets: ${labels}.`,
    );
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LOGO_COPY_SAFE_VISUAL_TOKEN_REPLACEMENTS: Record<string, string> = {
  adventure: "quest motif",
  adventures: "quest motif",
};

const LOGO_COPY_SAFE_TRANSLATED_TOKEN_REPLACEMENTS: Record<string, [string, string][]> = {
  adventure: [["冒险", "探索旅程"]],
  adventures: [["冒险", "探索旅程"]],
};

const LOGO_COPY_SAFE_PHRASE_REPLACEMENTS: [RegExp, string][] = [
  [/\bbrand\/wordmark reference\b/gi, "brand motif reference"],
  [/\bpreserve readable brand rhythm\b/gi, "preserve non-text brand rhythm"],
  [/\breadable brand rhythm\b/gi, "non-text brand rhythm"],
  [/\blettering rhythm\b/gi, "non-text silhouette rhythm"],
  [/\bletter rhythm\b/gi, "non-text silhouette rhythm"],
  [/\breadable wordmark construction\b/gi, "blank mark construction"],
  [/\bwordmark construction\b/gi, "blank mark construction"],
  [/\breadable wordmark\/mark system\b/gi, "blank wordmark plate/mark system"],
  [/\breadable wordmark\b/gi, "blank wordmark plate"],
  [/\breadable brand construction\b/gi, "brand construction without readable letters"],
  [/\bpreserve exact spelling\b/gi, "avoid generated spelling"],
  [/\btypography style\b/gi, "graphic shape style"],
  [/\btypography\b/gi, "graphic shapes"],
];

function logoCopySafeComponentTerms(terms: string[]): string[] {
  const components = terms.flatMap((term) => term.match(/[A-Za-z0-9]{3,}/g) || []);
  return components.filter((term, index, all) => all.findIndex((candidate) =>
    candidate.toLowerCase() === term.toLowerCase()) === index);
}

function logoCopySafeTokenReplacement(token: string): string {
  return LOGO_COPY_SAFE_VISUAL_TOKEN_REPLACEMENTS[token.toLowerCase()] || "reserved non-text brand motif";
}

function redactLogoCopySafePhrases(text: string): string {
  return LOGO_COPY_SAFE_PHRASE_REPLACEMENTS.reduce((current, [pattern, replacement]) =>
    current.replace(pattern, replacement), text);
}

function isLogoCopySafeBlankWordmarkModeState(modeState: WorkspaceModeState): boolean {
  const form = modeState.modeForm;
  if (form.mode !== "logo") return false;
  return logoWordmarkTextRisk(form.wordmark).strategy === "copySafeBlankWordmark";
}

function redactLogoCopySafeWordmarkPrompt(input: {
  prompt: string;
  snapshot: WorkspaceSnapshot;
  modeState: WorkspaceModeState;
}): string {
  const form = input.modeState.modeForm;
  if (form.mode !== "logo") return input.prompt;
  const policy = logoWordmarkTextRisk(form.wordmark);
  if (policy.strategy !== "copySafeBlankWordmark") return input.prompt;
  const terms = [
    policy.wordmark,
    input.snapshot.project.name,
    ...(input.snapshot.brandKit?.fixedBrandTerms || []),
  ]
    .map((term) => term.trim())
    .filter((term, index, all) => term.length >= 3 && all.indexOf(term) === index);
  const fullyRedacted = terms.reduce((text, term) =>
    text.replace(new RegExp(escapeRegExp(term), "gi"), "the reserved blank brand wordmark"), input.prompt);
  const componentRedacted = logoCopySafeComponentTerms(terms).reduce((text, term) => {
    const replacement = logoCopySafeTokenReplacement(term);
    const tokenRedacted = text.replace(new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi"), replacement);
    return (LOGO_COPY_SAFE_TRANSLATED_TOKEN_REPLACEMENTS[term.toLowerCase()] || []).reduce((translatedText, [source, target]) =>
      translatedText.replace(new RegExp(escapeRegExp(source), "g"), target), tokenRedacted);
  }, fullyRedacted);
  const redacted = redactLogoCopySafePhrases(componentRedacted);
  const combined = [
    "COPY-SAFE BLANK WORDMARK ENFORCEMENT: the configured brand text and its word fragments are intentionally redacted from this image prompt. Treat redacted project/category wording only as non-text visual motifs. Do not render readable letters, words, uploaded-logo text, project-title fragments, category labels, partial words, pseudo-letters, subtitles, slogans, or decorative fake typography. Produce a polished blank wordmark plate, emblem, badge, or mark system only.",
    redacted,
  ].join("\n\n");
  return trimPromptAtBoundary(combined, PROVIDER_PROMPT_MAX_CHARS);
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
  const configuredLanguage = configured[0];
  if (configuredLanguage) return [configuredLanguage];

  const sloganLanguages = Object.keys(promptPackage.slogans).filter((language) =>
    SloganLanguageSchema.safeParse(language).success,
  ) as z.infer<typeof SloganLanguageSchema>[];
  const sloganLanguage = sloganLanguages[0];

  return sloganLanguage ? [sloganLanguage] : ["en-US"];
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
  const schemeCount = Math.max(1, Math.min(20,
    modeState.selectedSchemeIds?.length || modeState.outputSettings.schemeCount,
  ));

  const request = BriefGenerationRequestSchema.parse({
    context: createRequestContext(input),
    projectName: modeState.projectBrief.projectName || input.snapshot.project.name,
    gameDescription: modeState.projectBrief.gameDescription || input.snapshot.project.description,
    ...(focusGuidance ? { focusGuidance } : {}),
    creativeDirection: creativeDirectionFromPromptPackage(input.promptPackage),
    assets: assetsFromPromptPackage(input.promptPackage, input.snapshot, {
      copySafeLogoText: isLogoCopySafeBlankWordmarkModeState(modeState),
    }),
    guardrails: modeGuardrails(input.promptPackage.mode),
    languageTargets: languageTargetsFrom(input.promptPackage, modeState),
    schemeCount,
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
  const promptMaxChars = Math.min(PROVIDER_PROMPT_MAX_CHARS, providerImagePromptMaxChars(input.providerId));
  const count = input.count ?? modeState.outputSettings.imagesPerScheme;
  const useIdentitySafePlate = shouldUsePosterScenePlateFallback(input.promptPackage);
  const copySafeLogoText = isLogoCopySafeBlankWordmarkModeState(modeState);
  const assets = providerImageAssetsForRequest({
    promptPackage: input.promptPackage,
    snapshot: input.snapshot,
    providerId: input.providerId,
    copySafeLogoText,
  });

  const prompt = input.promptPackage.mode === "poster"
    ? useIdentitySafePlate
      ? posterIdentitySafePlatePromptFromPromptPackage(input.promptPackage, promptMaxChars)
      : posterIntegratedKvPromptFromPromptPackage(input.promptPackage, promptMaxChars)
    : nonPosterImagePromptFromPromptPackage({
        promptPackage: input.promptPackage,
        snapshot: input.snapshot,
        modeState,
        assets,
        copySafeLogoText,
        maxChars: promptMaxChars,
      });
  const request = ImageGenerationRequestSchema.parse({
    context: createRequestContext(input),
    schemeId: input.promptPackage.schemeId,
    prompt,
    ...(input.promptPackage.negativePrompt.trim()
      ? { negativePrompt: input.promptPackage.negativePrompt.trim() }
      : {}),
    assets,
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
