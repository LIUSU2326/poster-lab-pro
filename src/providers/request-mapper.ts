import { z } from "zod";
import { ProviderIdSchema, SloganLanguageSchema, type ProviderId, type ProductionMode } from "../schema/zod";
import {
  isPosterIntegratedReferenceAsset,
  posterAssetCompactConstraint,
  posterAssetFusionStrategy,
  posterAssetReferenceName,
  posterAssetSemanticInventory,
  posterAssetSemanticRole,
  type PosterAssetSemanticRole,
} from "../assets/semantic-roles";
import { PromptPackageSchema, type PromptAssetBinding, type PromptPackage } from "../prompts/contracts";
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
import {
  posterCinematicKvQualityDirective,
  posterHeroPerformanceScaleLock,
  posterIdentitySafeMotionRule,
  posterLogoSingleUseLock,
  posterKvArchitectureDirective,
  posterKvAssetCountsFromAssets,
  posterSubjectAccessoryStrictnessLock,
} from "./poster-kv-architectures";

const PROVIDER_PROMPT_MAX_CHARS = 12000;

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

function roleConstraint(binding: PromptAssetBinding): string {
  return posterAssetCompactConstraint(binding);
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
  roleIndex: number,
): ProviderAssetReference {
  const asset = snapshot.assets.find((item) => item.id === binding.assetId);
  const candidateUrl = binding.url || assetUrl(asset);
  const semanticRole = posterAssetSemanticRole(binding);
  const description = [
    binding.label,
    `semanticRole=${semanticRole}`,
    `binding=${binding.binding}`,
    `constraint=${roleConstraint(binding)}`,
    binding.required ? "required" : "optional",
    binding.placeholder ? `placeholder=${binding.placeholder}` : "",
    ["gameCharacter", "collabCharacter"].includes(binding.role) ? `independentCharacterIndex=${roleIndex}` : "",
    `fusion=${posterAssetFusionStrategy(binding)}`,
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
    description: description.slice(0, 500),
  });
}

export function assetsFromPromptPackage(
  promptPackage: PromptPackage,
  snapshot: WorkspaceSnapshot,
): ProviderAssetReference[] {
  const roleCounters = new Map<string, number>();
  return promptPackage.assets.map((asset) => {
    const nextIndex = (roleCounters.get(asset.role) || 0) + 1;
    roleCounters.set(asset.role, nextIndex);
    return toProviderAssetReference(asset, snapshot, nextIndex);
  });
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
  return `${normalized.slice(0, Math.max(0, maxChars - suffix.length)).trimEnd()}${suffix}`;
}

function joinPromptBlocks(blocks: string[]): string {
  return blocks.map((block) => block.trim()).filter(Boolean).join("\n\n");
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
    "Copy-safe fallback: if clean spelling is not possible, still create a visible polished blank slogan-safe plate/ribbon/sign in the intended copy area; do not omit the copy area entirely and do not generate garbled text.",
  ].join("\n");
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

function posterIntegratedKvPromptFromPromptPackage(promptPackage: PromptPackage): string {
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
  const hasStyleReference = promptPackage.assets.some((asset) => posterAssetSemanticRole(asset) === "styleReference");
  const hasCharacterReference = promptPackage.assets.some((asset) => posterAssetSemanticRole(asset) === "protagonist");
  const styleRule = hasStyleReference
    ? "Visual style lock: match the uploaded styleReference image for rendering, palette, lighting, line quality, and material finish. Do not drift into photorealistic food photography unless the styleReference itself is photorealistic."
    : hasCharacterReference
      ? "Visual style lock: match the uploaded gameCharacter asset art direction for the whole world plate. Use a stylized 2D cartoon game illustration language: rounded readable shapes, clean graphic silhouettes, confident line-art feeling, soft cel/painterly shading, bright appetizing colors, and premium mobile-game key-art polish. Do not use photorealistic food photography, realistic 3D product render, camera macro food shot, or stock-photo background."
      : "Visual style lock: use a stylized game campaign illustration style, not photorealistic food photography, unless the user explicitly selected a realistic style.";
  const semanticGroups = promptPackage.assets.reduce((groups, asset) => {
    const semanticRole = posterAssetSemanticRole(asset);
    groups.set(semanticRole, [...(groups.get(semanticRole) || []), asset]);
    return groups;
  }, new Map<PosterAssetSemanticRole, PromptAssetBinding[]>());
  const characters = semanticGroups.get("protagonist") || [];
  const bosses = semanticGroups.get("antagonist") || [];
  const logos = semanticGroups.get("brandLogo") || [];
  const sloganTargets = Object.entries(promptPackage.slogans)
    .map(([language, slogan]) => `${language}: ${slogan}`)
    .join("\n");
  const assetRoleInventory = posterAssetSemanticInventory(promptPackage.assets);
  const referenceMap = [
    characters.length > 0
      ? [
        `Exact playable roster count: ${characters.length}. Render only ${characters.map((asset, index) => asset.placeholder || `[Game Character ${index + 1}]`).join(", ")} as playable/human/chef heroes.`,
        characters.length === 1
          ? "Single-character lock: if any scheme text says chef squad/team/heroes, reinterpret that as only [Game Character 1]. Do not add any other chef, human helper, teammate, or replacement protagonist."
          : "Multi-character lock: keep each uploaded character independent; do not merge, average, recolor, or swap traits.",
      ].join(" ")
      : "",
    bosses.length > 0 ? `Antagonist lock: ${bosses.map((asset, index) => posterAssetReferenceName(asset, index + 1)).join(", ")} means the uploaded BOSS/key-subject reference(s); preserve identity while redrawing as dominant in-world threat(s).` : "",
    logos.length > 0 ? `Logo lock: ${logos.map((asset, index) => posterAssetReferenceName(asset, index + 1)).join(", ")} means uploaded logo/brand reference(s); render exact lettering only when it can stay accurate, otherwise reserve one polished blank logo-safe treatment without fake text.` : "",
  ].filter(Boolean).join("\n");
  const sloganPriorityBlock = integratedSloganPriorityBlock(sloganTargets);

  const architectureBlock = posterKvArchitectureDirective({
    seed: promptPackage.schemeId || promptPackage.id,
    assetCounts: posterKvAssetCountsFromAssets(promptPackage.assets),
    preferredText: sectionText,
  });

  return joinPromptBlocksWithinLimit({
    criticalBlocks: [
    "## Integrated Game Campaign KV Task",
    "Generate the final unified premium game campaign key visual as one coherent illustration.",
    compactPromptBlock(schemeText, 1100),
    "Default pipeline: AI integrated redraw. Use uploaded image references as identity, semantic, style, composition, and brand anchors inside the model generation. Do not plan a separate background plate for local sticker compositing.",
    "Use uploaded image references as binding visual anchors, not as static stickers. Subject assets may change pose, expression, action, camera angle, lighting, scale, and perspective to become vivid in-world actors or objects while preserving their recognizable identity.",
    assetRoleInventory ? `## Uploaded Asset Role Semantics and Fusion Strategies\n${assetRoleInventory}` : "",
    referenceMap ? `## Exact Uploaded Reference Map\n${referenceMap}` : "",
    "ABSOLUTE HIGHEST PRIORITY - REFERENCE IDENTITY AND BLENDING: replicate the recognizable visual identity from uploaded identity/subject references while integrating them into the new scene's lighting. Preserve character face shape, hair colors, costume palette, body proportions, signature prop/tool, line weight, BOSS silhouette, crown, eye, teeth, tongue, mouth, color blocks, prop shape, and uploaded logo design.",
    "Reference identity may only be reposed or re-lit. Do not age-up, add beard/mustache, change hairstyle or hair color, change costume, change body type/proportions, change species, or replace a chibi/mascot reference with a generic adult character.",
    posterIdentitySafeMotionRule(),
    "Reference pose release: identity lock does not mean copying the exact uploaded front-facing/static pose. Repaint each uploaded hero/BOSS as a living actor with at least one visible performance change: 3/4 turn, stride, leap, recoil, attack wind-up, defensive block, grip/contact with a prop, landing dust, squash/stretch, or foreshortened limb/tool angle.",
    "BOSS performance lock: the uploaded BOSS/key threat must not read as a scaled-up sticker in the same standing pose. Stage it lunging, bracing, swinging, bursting through the set, landing with dust, or reacting to impact while preserving its silhouette and signature details.",
    posterHeroPerformanceScaleLock(),
    posterSubjectAccessoryStrictnessLock(),
    staticSchemeActionRewriteRule(),
    "Do not give uploaded characters new weapons, armor, swords, shields, adult facial structures, noses, beards, mustaches, or costume variants unless those details are clearly present in the reference image.",
    "If the scheme prompt uses placeholders such as [Game Character 1], [Game Character 2], [Boss], or [Game Logo], replace those placeholders with the corresponding uploaded visual references. Do not describe or invent their physical appearance from text.",
    "Placeholder annotation rule: any written appearance, species, clothing, weapon, logo-lettering, color, or anatomy description attached to a placeholder is non-binding unless it is visibly present in the uploaded reference. The uploaded image reference is the source of truth; ignore conflicting or embellished placeholder descriptions.",
    "Scheme text sanitation rule: if the selected scheme text names a placeholder's clothing, face, body, weapon, shield, logo lettering, or other appearance details, treat those words as non-binding staging notes only. The uploaded image reference remains the only source of truth for visual identity.",
    "The uploaded subjects and brand elements must look repainted into the same scene, not pasted on top: apply environmental color grading, rim light, contact shadows, bounce light, atmospheric perspective, partial foreground occlusion, material interaction, and VFX overlap across their bodies or surfaces.",
    "Contact and occlusion audit: every place an uploaded hero, BOSS, prop, or logo treatment touches another object must show overlap edge, contact shadow, cast shadow, bounce color, and local material reaction. No clean cutout silhouettes floating above the scene.",
    styleRule,
    "The poster must show a concrete story moment: uploaded heroes in action against the uploaded BOSS/key subject, with readable intent, movement, pressure, and environmental reaction.",
    "Design with cinematic composition, strong depth, dramatic lighting, polished color grading, foreground/midground/background separation, and a clear hero-vs-BOSS focal hierarchy.",
    "Art-direction checklist for the final render: visible camera/lens/perspective choice, foreground framing, midground action, background reveal, key/fill/rim lighting, volumetric haze, particles/VFX, cast and contact shadows, color/value grouping, material texture, and in-world logo/typography integration.",
    "Set-piece and action requirement: build a memorable physical campaign location and connect at least one uploaded hero to the BOSS or environment through blocking, climbing, striking, sliding, cooking, pulling, defending, or impact. Avoid empty pastel sky, generic food-field backdrops, centered mascot-ad layouts, and symmetrical floating heroes.",
    "Subject scale and weight requirement: the uploaded BOSS/key threat must feel physically planted or forcefully airborne with a clear landing/impact path, not a mascot sticker. The uploaded hero must have a readable support surface, grip, impact point, or motion trail with a cast shadow.",
    "Cinematic escalation must come from the scene design: asymmetrical low-angle or forced-perspective camera, one dominant diagonal action path, foreground occlusion, practical light source, rim/back light, volumetric beams, dust/steam/ember/sauce particles, and visible environmental reaction. Do not solve cinematic quality by making the uploaded characters into different, more realistic people.",
    "Allocate one readable campaign-safe logo treatment when uploaded logo/brand assets are present. Render the exact uploaded logo only when the letterforms can stay accurate; otherwise create a polished blank logo-safe sign/title plate using brand colors and shape language; do not invent look-alike words, substitute letters, or create an alternate fake logo. Integrate the slogan as custom game-poster lettering or an in-world sign/ribbon, with correct spelling when possible; if spelling cannot be guaranteed, leave a natural blank sign/ribbon/title plate rather than generating garbled text.",
    posterLogoSingleUseLock(),
    "Use each uploaded protagonist, antagonist, key subject, brand logo, and prop according to its semantic duty. Do not create duplicate large/small copies, alternate replacement characters, or extra generic chef heroes.",
    "Hard exclusion summary: No duplicate uploaded asset. No generic replacement hero. No extra random chef protagonist. No sticker collage. No unchanged front-facing cutout look. No flat tabletop wallpaper.",
    ],
    flexibleBlocks: [
      { text: architectureBlock, maxChars: 3200, minChars: 900 },
      { text: supportingSectionText ? `## Workspace Creative Direction\n${supportingSectionText}` : sectionText, maxChars: 1200, minChars: 300 },
    ],
    closingBlocks: [
    sloganPriorityBlock,
    "Allocate one readable campaign-safe logo treatment when uploaded logo/brand assets are present.",
    posterLogoSingleUseLock(),
    "Logo copy safety lock: do not invent look-alike words, substitute letters, or create alternate fake logo text. Use the uploaded logo exactly only when readable, otherwise reserve a polished blank logo-safe treatment.",
    posterHeroPerformanceScaleLock(),
    "BOSS performance lock: the uploaded BOSS/key threat must not read as a scaled-up sticker in the same standing pose. Stage it lunging, bracing, swinging, bursting through the set, landing with dust, or reacting to impact while preserving its silhouette and signature details.",
    posterSubjectAccessoryStrictnessLock(),
    "Subject scale and weight requirement: the uploaded BOSS/key threat must feel physically planted or forcefully airborne with a clear landing/impact path, not a mascot sticker. The uploaded hero must have a readable support surface, grip, impact point, or motion trail with a cast shadow.",
    "Set-piece and action requirement: connect at least one uploaded hero to the BOSS or environment through blocking, climbing, striking, sliding, cooking, pulling, defending, or visible impact.",
    "Placeholder annotation rule: any written appearance, species, clothing, weapon, logo-lettering, color, or anatomy description attached to a placeholder is non-binding unless it is visibly present in the uploaded reference.",
    "Scheme text sanitation rule: if selected scheme text names a placeholder's clothing, face, body, weapon, shield, logo lettering, or other appearance details, treat those words as non-binding staging notes only. The uploaded image reference remains the only source of truth for visual identity.",
    "Contact and occlusion audit: every place an uploaded hero, BOSS, prop, or logo treatment touches another object must show overlap edge, contact shadow, cast shadow, bounce color, and local material reaction. No clean cutout silhouettes floating above the scene.",
    "The uploaded subjects and brand elements must look repainted into the same scene with environmental color grading, rim light, contact shadows, bounce light, atmospheric perspective, foreground occlusion, material interaction, and VFX overlap.",
    staticSchemeActionRewriteRule(),
    "Use a deliberate campaign composition architecture, not a default side-scrolling food battlefield. Favor one of these KV structures when it fits the scheme: diagonal split-world contrast, restaurant-window/portal breach, foreground weapon/utensil divider, boss reveal framed by doorway/canyon, comic-panel mission montage, or triumphant hero-on-defeated-boss trophy shot.",
    "Use the full requested canvas as artwork. Do not add black bars, letterbox bands, white borders, frames, UI chrome, or presentation margins.",
    "Show the story through character action and environment response: impact glow, sauce splash arcs, cheese stretch trails, dust, flying ingredients, motion trails, atmospheric haze, rim-light pockets, foreground framing, and scale cues.",
    "World-building direction: turn the food theme into a fantasy adventure battlefield or giant edible landscape with illustrated terrain, not a flat pizza surface or close-up product photo.",
    "## Hard KV Exclusions",
    "No duplicate uploaded asset. No generic replacement hero. No extra random chef protagonist. No sticker collage. No unchanged front-facing cutout look. No flat tabletop wallpaper. No empty pastel sky. No centered mascot-ad layout. No symmetrical floating corner heroes. No photorealistic pizza macro photography. No realistic food commercial render. No black bars. No letterbox. No border frame.",
    "Focus guidance handling: user focus guidance is only a creative emphasis. It must not override the assigned KV architecture, uploaded asset identity, readable story conflict, or production-quality composition. If the focus says giant pizza/giant food/micro perspective, translate that into scale drama and camera energy without reducing the poster to a flat pizza-floor scene.",
    "## Mode Guardrails",
    guardrails,
    ],
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

function posterIdentitySafePlatePromptFromPromptPackage(promptPackage: PromptPackage): string {
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
    ? "Style source: use the uploaded styleReference for rendering, palette, lighting, line quality, and finish."
    : "Style source: create a premium stylized 2D cartoon mobile-game KV scene with rounded readable shapes, clean silhouettes, lively line-art feeling, soft cel/painterly shading, appetizing colors, and polished campaign lighting.";

  return [
    "## Identity-Safe Game Campaign KV Plate",
    "Generate the high-quality full-bleed poster SCENE PLATE only. This is the cinematic environment, lighting, depth, action staging, and atmosphere for a final campaign key visual.",
    styleRule,
    "Important pipeline rule: uploaded characters, BOSS/key subject, and logo will be composited after this generation from the original uploaded files to preserve exact identity. Therefore do NOT render finished copies of uploaded characters, BOSS, or logo inside this scene plate.",
    "When the selected scheme mentions [Game Character 1], [Game Character 2], [Boss], [Game Logo], or any uploaded subject placeholder, translate those placeholders into empty action zones, light pools, impact bursts, shadow/contact areas, foreground occlusion, and safe-area staging. Do not draw visible bodies, humans, chefs, mascots, faces, monster forms, logo letters, shadow silhouettes, placeholder silhouettes, or any substitute subject for those placeholders.",
    "Instead, leave natural action zones and lighting pockets for later compositing: left/front hero zone, right/front hero zone, center/right BOSS zone, upper natural negative-space glow pocket, and lower-right breathable copy-safe area. Do not place signs or labels there.",
    "Make the empty stage feel designed, not blank: use readable foreground platforms, cast-light pools, sauce splash arcs, cheese stretch trails, dust, flying ingredients, impact glow, rim-light pockets, atmospheric haze, foreground framing, scale cues, and a clear hero-vs-BOSS battle path.",
    "Quality target: premium game marketing key visual background art with strong composition, layered foreground/midground/background depth, dramatic directional light, polished color grading, and clear silhouette hierarchy.",
    posterCinematicKvQualityDirective(),
    "World-building target: transform the food premise into a fantasy adventure battlefield or giant edible landscape. Avoid flat tabletop wallpaper, close-up food product photography, realistic macro food shots, stock-photo lighting, or empty generic valleys.",
    "Text rule: no text of any kind. Do not render final slogan text, fake logo, the words GAME LOGO, labels, signboards, wooden plaques, blank UI panels, fake title plates, UI badges, watermark, or any readable/garbled letters. Leave natural negative space and lighting-safe areas only.",
    "Use the full requested canvas as artwork. Do not add black bars, letterbox bands, white borders, frames, UI chrome, or presentation margins.",
    sectionText,
    "## Hard Plate Exclusions",
    "No finished uploaded character copies. No finished BOSS copy. No finished logo copy. No people. No chefs. No mascots. No monsters. No generic replacement heroes. No random chef protagonists. No duplicate characters. No shadow silhouettes or placeholder silhouettes. No text. No letters. No GAME LOGO words. No blank signboards or fake UI panels. No sticker collage. No flat pizza wallpaper. No photorealistic pizza macro photography. No black bars. No borders.",
    "## Mode Guardrails",
    guardrails,
  ].filter(Boolean).join("\n\n").slice(0, 12000);
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
    assets: assetsFromPromptPackage(input.promptPackage, input.snapshot),
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
  const count = input.count ?? modeState.outputSettings.imagesPerScheme;
  const useIdentitySafePlate = shouldUsePosterScenePlateFallback(input.promptPackage);

  const request = ImageGenerationRequestSchema.parse({
    context: createRequestContext(input),
    schemeId: input.promptPackage.schemeId,
    prompt: input.promptPackage.mode === "poster"
      ? useIdentitySafePlate
        ? posterIdentitySafePlatePromptFromPromptPackage(input.promptPackage)
        : posterIntegratedKvPromptFromPromptPackage(input.promptPackage)
      : input.promptPackage.finalPrompt,
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
