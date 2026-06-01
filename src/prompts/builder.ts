import { z } from "zod";
import {
  PlatformPresetSchema,
  ProductionModeSchema,
  type ProductionMode,
  SloganLanguageSchema,
} from "../schema/zod";
import { getModeAssetSlots, getRequiredAssetSlots } from "../assets/slot-definitions";
import {
  assetCompactConstraint,
  assetFusionStrategy,
  assetSemanticInventory,
  assetSemanticRole,
  modeAssetFusionDirective,
  posterAssetReferenceName,
  type AssetSemanticRole,
} from "../assets/semantic-roles";
import { WorkspaceSnapshotSchema, type StoredAssetRecord, type WorkspaceModeState, type WorkspaceSnapshot } from "../storage/contracts";
import {
  PromptAssetBindingSchema,
  PromptBuildTargetSchema,
  PromptPackageSchema,
  PromptPlatformConstraintSchema,
  PromptSectionSchema,
  PromptValidationSchema,
  type PromptAssetBinding,
  type PromptBuildTarget,
  type PromptGuardrailRule,
  type PromptPackage,
  type PromptSection,
  type PromptValidation,
} from "./contracts";
import { getPromptGuardrails, lockedFieldsForPromptMode } from "./guardrails";
import { imageRenderableSloganRule, integratedSloganTreatmentRule, normalizeImageRenderableSlogan } from "./slogan-policy";
import {
  posterHeroPerformanceScaleLock,
  posterLogoSingleUseLock,
  posterSubjectAccessoryStrictnessLock,
} from "../providers/poster-kv-architectures";

export const PromptBuilderInputSchema = z.object({
  snapshot: WorkspaceSnapshotSchema,
  target: PromptBuildTargetSchema.default("image"),
  mode: ProductionModeSchema.optional(),
  schemeId: z.string().min(1).optional(),
  platformPreset: PlatformPresetSchema.optional(),
  aspectRatio: z.string().min(1).optional(),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
});

export type PromptBuilderInput = z.infer<typeof PromptBuilderInputSchema>;
type SloganLanguage = z.infer<typeof SloganLanguageSchema>;
const FINAL_PROMPT_MAX_CHARS = 12000;
const ICON_PRIMARY_ASSET_ROLES = new Set(["subjectReference", "gameCharacter", "prop", "gameLogo"]);
const SECTION_CONTENT_MAX_CHARS = 4000;

function clampSectionContent(content: string): string {
  if (content.length <= SECTION_CONTENT_MAX_CHARS) return content;
  const suffix = "\n[Section compacted to fit prompt package limits.]";
  return `${content.slice(0, SECTION_CONTENT_MAX_CHARS - suffix.length)}${suffix}`;
}

function section(params: {
  id: string;
  title: string;
  content: string;
  source: PromptSection["source"];
  locked?: boolean;
  priority?: number;
}): PromptSection {
  return PromptSectionSchema.parse({
    required: true,
    locked: false,
    priority: 50,
    ...params,
    content: clampSectionContent(params.content),
  });
}

function findModeState(snapshot: WorkspaceSnapshot, mode: ProductionMode): WorkspaceModeState {
  const modeState = snapshot.modeStates.find((item) => item.mode === mode);
  if (!modeState) throw new Error(`Missing workspace mode state for ${mode}.`);
  return modeState;
}

function inferSize(aspectRatio: string): { width: number | null; height: number | null } {
  const sizeMatch = aspectRatio.match(/^(\d{3,5})x(\d{3,5})$/);
  if (sizeMatch) {
    return {
      width: Number(sizeMatch[1]),
      height: Number(sizeMatch[2]),
    };
  }

  if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
  if (aspectRatio === "16:9") return { width: 1920, height: 1080 };
  if (aspectRatio === "4:3") return { width: 1600, height: 1200 };
  if (aspectRatio === "3:4") return { width: 1200, height: 1600 };
  if (aspectRatio === "1:1") return { width: 1024, height: 1024 };
  return { width: null, height: null };
}

function createPlatformConstraint(input: {
  modeState: WorkspaceModeState;
  platformPreset?: z.infer<typeof PlatformPresetSchema>;
  aspectRatio?: string;
  width?: number;
  height?: number;
}) {
  const platformPreset = input.platformPreset || input.modeState.outputSettings.platformPresets[0] || "custom";
  const aspectRatio = input.aspectRatio || input.modeState.outputSettings.aspectRatios[0] || "1:1";
  const inferred = inferSize(aspectRatio);

  return PromptPlatformConstraintSchema.parse({
    platformPreset,
    aspectRatio,
    width: input.width || input.modeState.outputSettings.customSize?.width || inferred.width,
    height: input.height || input.modeState.outputSettings.customSize?.height || inferred.height,
    safeArea:
      input.modeState.mode === "icon"
        ? "Fill the entire square canvas while keeping the subject recognizable at small app icon sizes."
        : "Keep logo, headline, and main subject clear after platform cropping.",
    copyLengthHint:
      input.modeState.mode === "announcement"
        ? "Announcement copy must be short, operational, and readable."
        : "Campaign slogan should stay punchy and legible.",
  });
}

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

function assetUrl(asset: StoredAssetRecord): string | null {
  return asset.previewUrl || null;
}

function isExampleAssetUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname === "example.com";
  } catch {
    return /example\.com/i.test(url);
  }
}

function isDemoAsset(asset: StoredAssetRecord): boolean {
  return asset.metadata?.mockAsset === true || isExampleAssetUrl(assetUrl(asset));
}

function dateValue(value: string | null | undefined): number {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function assetMetadataString(asset: StoredAssetRecord, key: string): string | null {
  const value = asset.metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function promptAssetDedupeKey(asset: StoredAssetRecord): string {
  return [
    asset.role,
    asset.checksum || assetMetadataString(asset, "originalFileName") || asset.storageKey || asset.id,
    asset.byteSize ?? "",
  ].join("|");
}

function promptAssetSlotKey(asset: StoredAssetRecord): string {
  const label = asset.label.trim();
  return label ? `${asset.role}|${label}` : `${asset.role}|${asset.id}`;
}

function dedupeLatestPromptAssets(assets: StoredAssetRecord[]): StoredAssetRecord[] {
  const byKey = new Map<string, StoredAssetRecord>();
  for (const asset of assets) {
    const key = promptAssetDedupeKey(asset);
    const existing = byKey.get(key);
    if (!existing || dateValue(asset.updatedAt || asset.createdAt) >= dateValue(existing.updatedAt || existing.createdAt)) {
      byKey.set(key, asset);
    }
  }

  const bySlot = new Map<string, StoredAssetRecord>();
  for (const asset of byKey.values()) {
    const key = promptAssetSlotKey(asset);
    const existing = bySlot.get(key);
    if (!existing || dateValue(asset.updatedAt || asset.createdAt) >= dateValue(existing.updatedAt || existing.createdAt)) {
      bySlot.set(key, asset);
    }
  }

  return [...bySlot.values()];
}

function roleInstruction(asset: PromptAssetBinding, mode: ProductionMode): string {
  return `${assetCompactConstraint(asset, { mode })}; ${assetFusionStrategy(asset, { mode })}`;
}

function createAssetBinding(asset: StoredAssetRecord, mode: ProductionMode): PromptAssetBinding {
  const bindingByRole: Record<StoredAssetRecord["role"], PromptAssetBinding["binding"]> = {
    gameCharacter: "identityLock",
    collabCharacter: "identityLock",
    gameLogo: "logoLock",
    brandLogo: "logoLock",
    background: "backgroundReference",
    prop: "subjectReference",
    uiScreenshot: "styleReference",
    styleReference: "styleReference",
    compositionReference: "compositionReference",
    subjectReference: "subjectReference",
  };

  const placeholder =
    mode === "collab" && asset.role === "gameCharacter"
      ? "[Game Character]"
      : mode === "collab" && asset.role === "collabCharacter"
        ? "[Collab Partner]"
        : null;
  const roleIsRequired = isRequiredAssetRoleForPrompt(mode, asset.role);
  const url = assetUrl(asset);

  return PromptAssetBindingSchema.parse({
    assetId: asset.id,
    role: asset.role,
    label: asset.label,
    binding: bindingByRole[asset.role],
    required: roleIsRequired,
    placeholder,
    url,
    mimeType: asset.mimeType,
    storageKey: asset.storageKey,
    providerReady: isProviderSafeAssetUrl(url),
  });
}

function isIconPrimaryAssetRole(role: string): boolean {
  return ICON_PRIMARY_ASSET_ROLES.has(role);
}

function isRequiredAssetRoleForPrompt(mode: ProductionMode, role: string): boolean {
  if (mode === "icon") return isIconPrimaryAssetRole(role);
  return getRequiredAssetSlots(mode).some((slot) => slot.role === role);
}

function assignPosterAssetPlaceholders(assets: PromptAssetBinding[], mode: ProductionMode): PromptAssetBinding[] {
  if (mode !== "poster") return assets;
  const semanticCounters = new Map<AssetSemanticRole, number>();
  return assets.map((asset) => {
    const semanticRole = assetSemanticRole(asset);
    const nextIndex = (semanticCounters.get(semanticRole) || 0) + 1;
    semanticCounters.set(semanticRole, nextIndex);
    const placeholder = posterAssetReferenceName(asset, nextIndex);
    return PromptAssetBindingSchema.parse({
      ...asset,
      placeholder,
    });
  });
}

function assetsForPromptMode(snapshot: WorkspaceSnapshot, mode: ProductionMode): StoredAssetRecord[] {
  const allowedRoles = new Set(getModeAssetSlots(mode).map((slot) => slot.role));
  const requiredRoles = new Set(getRequiredAssetSlots(mode).map((slot) => slot.role));
  const modeAssets = snapshot.assets
    .filter((asset) => asset.projectId === snapshot.project.id && allowedRoles.has(asset.role));
  const realRoles = new Set(modeAssets.filter((asset) => !isDemoAsset(asset)).map((asset) => asset.role));
  const hasRealIconPrimary = mode === "icon" && modeAssets.some((asset) =>
    !isDemoAsset(asset) && isIconPrimaryAssetRole(asset.role),
  );
  const hasRealAssets = realRoles.size > 0;
  const candidates = hasRealAssets
    ? modeAssets.filter((asset) =>
        !isDemoAsset(asset) || (!hasRealIconPrimary && !realRoles.has(asset.role) && requiredRoles.has(asset.role)),
      )
    : modeAssets;
  return dedupeLatestPromptAssets(candidates).sort((left, right) => {
    const leftDemo = isDemoAsset(left) ? 1 : 0;
    const rightDemo = isDemoAsset(right) ? 1 : 0;
    if (leftDemo !== rightDemo) return leftDemo - rightDemo;
    return dateValue(left.createdAt) - dateValue(right.createdAt);
  });
}

function assetsForRequiredSlot(params: {
  mode: ProductionMode;
  slotRole: string;
  assets: PromptAssetBinding[];
}): PromptAssetBinding[] {
  if (params.mode === "icon" && params.slotRole === "subjectReference") {
    return params.assets.filter((asset) => isIconPrimaryAssetRole(asset.role));
  }
  return params.assets.filter((asset) => asset.role === params.slotRole);
}

function requiredSlotLabel(mode: ProductionMode, slot: ReturnType<typeof getRequiredAssetSlots>[number]): string {
  if (mode === "icon" && slot.role === "subjectReference") {
    return "Icon primary subject (subjectReference, gameCharacter, prop, or gameLogo)";
  }
  return `${slot.label} (${slot.role})`;
}

function createSlogans(snapshot: WorkspaceSnapshot, modeState: WorkspaceModeState, schemeId: string | null) {
  if (modeState.mode === "icon" || modeState.mode === "logo") return {};
  const scheme = schemeId ? snapshot.schemes.find((item) => item.id === schemeId) : undefined;
  const targetLanguage = modeState.sloganSettings.languages[0] || "en-US";
  if (modeState.sloganSettings.mode === "off") {
    return {};
  }

  if (modeState.sloganSettings.mode === "global" && modeState.sloganSettings.globalSlogan) {
    return {
      [targetLanguage]: modeState.sloganSettings.globalSlogan,
    } as Partial<Record<SloganLanguage, string>>;
  }

  if (!scheme?.slogans?.[targetLanguage]) return {};

  const normalized = normalizeImageRenderableSlogan({
    slogan: scheme.slogans[targetLanguage],
    language: targetLanguage,
    brandTerms: [
      snapshot.project.name,
      ...(snapshot.brandKit?.fixedBrandTerms || []),
    ],
    contextText: [
      scheme.title,
      scheme.brief,
      ...(scheme.promptBlocks || []).map((block) => block.text),
    ].join("\n"),
  });

  return normalized
    ? { [targetLanguage]: normalized } as Partial<Record<SloganLanguage, string>>
    : {};
}

function formatBrand(snapshot: WorkspaceSnapshot): string {
  if (!snapshot.brandKit) return "No brand kit is configured. Use project context only.";
  return [
    `Brand terms: ${snapshot.brandKit.fixedBrandTerms.join(", ") || snapshot.project.name}.`,
    `Primary colors: ${snapshot.brandKit.primaryColors.join(", ") || "not specified"}.`,
    `Typography style: ${snapshot.brandKit.typographyStyle || "not specified"}.`,
    `Banned elements: ${snapshot.brandKit.bannedElements.join(", ") || "none"}.`,
  ].join("\n");
}

function formatCharacters(snapshot: WorkspaceSnapshot, mode: ProductionMode, assets: PromptAssetBinding[]): string {
  const includedAssetIds = new Set(assets.map((asset) => asset.assetId));
  const identityAssets = assets.filter((asset) => asset.binding === "identityLock");
  if (snapshot.characters.length === 0 && identityAssets.length === 0) return "No character profiles are configured.";
  if (mode === "collab") {
    return [
      "Use placeholders only during planning: [Game Character] and [Collab Partner].",
      "Appearance must come exclusively from uploaded reference assets.",
      `Locked reference asset ids: ${identityAssets.map((asset) => asset.assetId).join(", ") || "none"}.`,
    ].join("\n");
  }

  const characterLines = snapshot.characters
    .map((character) => ({
      ...character,
      referenceAssetIds: character.referenceAssetIds.filter((assetId) => includedAssetIds.has(assetId)),
    }))
    .filter((character) => character.referenceAssetIds.length > 0)
    .map((character) => {
      const strength = Math.round(character.consistencyStrength * 100);
      return `${character.name}: lockAppearance=${character.lockAppearance}, consistency=${strength}%, references=${character.referenceAssetIds.join(", ")}.`;
    })
    .join("\n");

  if (characterLines) return characterLines;
  if (identityAssets.length > 0) {
    return [
      `Uploaded character identity locks: ${identityAssets.map((asset) => `${asset.label} (${asset.assetId})`).join(", ")}.`,
      "Treat each uploaded character image as a locked model sheet. Keep the exact readable identity: face shape, hair color and silhouette, costume, body proportion, line weight, colors, and original held prop/tool.",
      "You may only adjust pose, scale, lighting, and perspective enough to integrate the character into the key-art scene; do not add new human heroes or redesign the uploaded characters.",
    ].join(" ");
  }
  return "No character profiles are configured for the currently bound uploaded assets.";
}

function formatAssetInventory(assets: PromptAssetBinding[], mode: ProductionMode): string {
  const requiredSlots = getRequiredAssetSlots(mode);
  const requiredText =
    requiredSlots.length > 0
      ? requiredSlots.map((slot) => `${slot.label} (${slot.role})`).join(", ")
      : "No required asset slots for this mode.";
  const assetLines = assets.length > 0
    ? assets.map((asset) => {
        const urlState = asset.providerReady ? "provider-ready URL" : asset.url ? "browser/local preview only" : "no URL";
        const placeholder = asset.placeholder ? ` placeholder=${asset.placeholder}` : "";
        return `- ${asset.label}: sourceRole=${asset.role}, semanticRole=${assetSemanticRole(asset)}, binding=${asset.binding}, required=${asset.required}, ${urlState}, assetId=${asset.assetId}${placeholder}. Fusion: ${roleInstruction(asset, mode)}.`;
      })
    : ["- No mode-relevant assets are currently bound."];

  const semanticGroups = assets.reduce((groups, asset) => {
    const semanticRole = assetSemanticRole(asset);
    groups.set(semanticRole, [...(groups.get(semanticRole) || []), asset]);
    return groups;
  }, new Map<AssetSemanticRole, PromptAssetBinding[]>());
  const characterAssets = semanticGroups.get("protagonist") || [];
  const collabAssets = assets.filter((asset) => asset.role === "collabCharacter");
  const logoAssets = semanticGroups.get("brandLogo") || [];
  const bossAssets = semanticGroups.get("antagonist") || [];
  const propAssets = semanticGroups.get("prop") || [];
  const environmentAssets = semanticGroups.get("environment") || [];
  const fusionDirective = modeAssetFusionDirective(mode, assets);
  const semanticInventory = assetSemanticInventory(assets, { mode });
  const posterAssetContract = mode === "poster" && assets.length > 0
    ? [
        "Asset usage contract: uploaded input/reference assets are binding visual constraints with semantic poster duties, not loose inspiration and not local sticker overlays.",
        "Default generation path: AI integrated redraw. The image model should repaint/repose visible references into the scene with lighting, perspective, contact shadows, occlusion, and VFX overlap.",
        semanticInventory ? `Semantic asset map:\n${semanticInventory}` : "",
        characterAssets.length > 0 ? `Exact playable roster count: ${characterAssets.length}. Use only ${characterAssets.map((asset) => asset.placeholder || asset.label).join(", ")} as visible playable/human/chef heroes.` : "",
        characterAssets.length === 1 ? "Single-character rule: do not write or render a chef squad, allies, teammates, or extra human helpers; only [Game Character 1] may appear as the playable hero." : "",
        characterAssets.length > 0 ? "Poster must visibly use each uploaded protagonist asset as one integrated in-world character with model-sheet identity preserved, not as a sticker, generic redraw, or duplicated cutout." : "",
        bossAssets.length > 0 ? "Poster must visibly include uploaded antagonist/BOSS assets as integrated threats with preserved silhouette and key identity, scale pressure, contact shadows, atmosphere, debris, and environmental reaction." : "",
        logoAssets.length > 0 ? "Poster must allocate one readable campaign-safe logo treatment for uploaded logo/wordmark assets. Render the exact uploaded logo only when its letterforms can stay accurate; otherwise leave a polished blank logo-safe sign/title plate that uses the brand colors/shape language without fake text. Do not invent look-alike words, substitute letters, or create alternate fake logos." : "",
        propAssets.length > 0 ? "Uploaded prop/item assets should become story objects: held, used, foregrounded, chased, defended, or triggering action." : "",
        environmentAssets.length > 0 ? "Uploaded environment assets guide world, material, mood, and set-piece design; reinterpret them into depth instead of copying a flat background." : "",
        "One-appearance rule: every uploaded protagonist, antagonist, key subject, brand logo, and prop should appear according to its semantic duty unless the user explicitly asks for repeats.",
      ].filter(Boolean).join(" ")
    : "";
  const multiCharacterRule = characterAssets.length > 1
    ? [
        "Multi-character rule: each protagonist/gameCharacter asset is a separate independent character, not alternate images of one character.",
        "When the poster concept can support a group composition, include multiple uploaded game characters as distinct characters and preserve each one's appearance.",
        "Do not merge, average, or swap visual traits between separate character references.",
      ].join(" ")
    : "";
  const rosterLockRule = mode === "poster" && characterAssets.length > 0
    ? "Character roster lock: visible hero/player characters must come from uploaded gameCharacter references only. Do not invent extra chef heroes, random mascots, or generic human characters."
    : "";
  const multiCollabRule = collabAssets.length > 1
    ? "Collab character rule: each collabCharacter asset is a separate independent partner character. Keep them distinct and never merge identities."
    : "";

  return [`Required slots: ${requiredText}.`, fusionDirective, posterAssetContract, rosterLockRule, multiCharacterRule, multiCollabRule, ...assetLines].filter(Boolean).join("\n");
}

function formatModeForm(modeState: WorkspaceModeState): string {
  const form = modeState.modeForm;
  if (form.mode === "collab") {
    return `Collab style injection: ${form.collabStyleInjection}. Character placeholders only: ${form.characterPlaceholdersOnly}. Prevent merge: ${form.preventCharacterMerge}.`;
  }
  if (form.mode === "announcement") {
    return `Announcement title: ${form.announcementTitle}. Layout mode: ${form.layoutMode}. Group shot when multi-character: ${form.groupShotWhenMultiCharacter}.`;
  }
  if (form.mode === "logo") {
    return `Wordmark: ${form.wordmark}. Solid background: ${form.solidBackground}. Background color: ${form.backgroundColor}. Wordmark is primary: ${form.wordmarkIsPrimarySubject}.`;
  }
  if (form.mode === "icon") {
    return `Aspect ratio: ${form.aspectRatio}. No text: ${form.noText}. Full-bleed square: ${form.fullBleedSquare}. Composition reference rotation: ${form.compositionReferenceRotation}.`;
  }
  return `Style tags: ${form.styleTags.join(", ")}. Composition reference strength: ${form.compositionReferenceStrength}.`;
}

function formatFocusGuidancePolicy(modeState: WorkspaceModeState): string {
  const rawFocus = modeState.projectBrief.focusGuidance?.trim();
  if (!modeState.projectBrief.focusGuidanceEnabled || !rawFocus) {
    return "Focus guidance: not active. Choose the strongest campaign KV story from project description, uploaded assets, and the selected scheme.";
  }

  return [
    `Focus guidance: ${rawFocus}.`,
    "Focus guidance handling: treat this as a soft creative emphasis, not a literal scene lock. It must never override uploaded asset identity, the assigned KV architecture, story clarity, or poster quality.",
    "If focus guidance mentions giant food, giant pizza, micro perspective, or scale words, reinterpret it as scale drama and camera energy. Do not make every scheme a flat pizza-floor scene; vary the architecture, viewpoint, environment, and story beat.",
  ].join("\n");
}

function formatPosterQualityDirection(modeState: WorkspaceModeState, assets: PromptAssetBinding[]): string {
  if (modeState.mode !== "poster") return "";

  const hasUploadedStyle = assets.some((asset) => assetSemanticRole(asset) === "styleReference");
  const hasSelectedStyle = modeState.modeForm.mode === "poster" && modeState.modeForm.styleTags.length > 0;
  const hasProtagonistReference = assets.some((asset) => assetSemanticRole(asset) === "protagonist");
  const styleConstraint = hasUploadedStyle || hasSelectedStyle || hasProtagonistReference
    ? "Keep the active style source intact, but raise the finish level: richer lighting, deeper value range, cleaner silhouettes, refined materials, and premium game-marketing polish."
    : "Choose a premium game-marketing art direction with cinematic lighting and strong market readability.";
  const hasCharacterStyleDefault = !hasUploadedStyle && !hasSelectedStyle && hasProtagonistReference;
  const styleWorldRule = hasCharacterStyleDefault
    ? "Default style lock: because no explicit style reference or selected style is active, the generated poster world must follow the uploaded protagonist assets' cartoon game art language. Use illustrated food-world terrain, clean silhouettes, rounded shapes, stylized line/cel shading, and vibrant game-poster color. Do not use photorealistic pizza macro photography, realistic 3D food render, or stock food-advertising lighting."
    : "Style coherence rule: the generated poster world must share one art direction with the final uploaded assets. Do not switch to a conflicting photorealistic or stock-photo look unless that is explicitly selected by the user.";

  return [
    "Quality target: premium game marketing key visual polish, adapted to the selected or uploaded art style rather than forcing photorealism.",
    styleConstraint,
    styleWorldRule,
    "Art-direction target: the image must feel like one designed game campaign KV generated as a unified illustration, not a random background with static assets placed on top.",
    "Semantic asset target: first decide each uploaded asset's poster duty: protagonist, antagonist, brandLogo, prop, environment, styleReference, compositionReference, keySubject, or supportingAsset. The duty controls how it enters the story and how strongly identity must be preserved.",
    "Pipeline target: generate the full integrated KV when the provider can consume image references. Uploaded protagonist, antagonist, key subject, prop, environment, and logo references are visual anchors; the model may change pose, expression, camera angle, action, lighting, scale, and perspective to create a vivid poster moment while preserving recognizable identity, silhouette, colors, and key props.",
    "Integrated subject rule: include uploaded protagonists and uploaded antagonist/key subjects as living in-world actors with action intent, facial expression, readable body language, contact shadows, environmental occlusion, and story interaction. Props should be used or activated in the scene; environment references should become world design. Do not keep assets as static front-facing cutouts.",
    "Reference pose release: identity lock does not mean copying the exact uploaded front-facing/static pose. Keep identity, but repaint heroes and BOSS with a new performance such as 3/4 turn, stride, leap, recoil, attack wind-up, defensive block, grip/contact, landing dust, or foreshortened prop/tool angle.",
    "BOSS performance lock: uploaded BOSS/antagonist/key subject assets must not become scaled-up stickers in the same still pose or static standee staging; stage a lunge, brace, swing, doorway burst, landing impact, or physical reaction while preserving silhouette and signature details.",
    posterHeroPerformanceScaleLock(),
    posterSubjectAccessoryStrictnessLock(),
    posterLogoSingleUseLock(),
    "One-appearance rule: use each uploaded protagonist, antagonist, key subject, brand logo, and prop once according to semantic duty. Do not duplicate them as both large and small copies, do not add replacement chef heroes, and do not paste unchanged sticker cutouts unless a fallback compositor is explicitly requested.",
    "Focus guidance hierarchy: any user focus guidance is a creative lens only. It is lower priority than uploaded identity references, the chosen KV architecture, coherent story composition, and market-ready image quality.",
    "Composition target: one clear hero focal point, strong foreground-midground-background depth, dynamic camera angle, readable silhouette hierarchy, environmental storytelling, character-vs-BOSS conflict, and enough negative space for logo and slogan.",
    "AAAAAAAAAAA cinematic target: borrow the language of high-end film/game announcement posters within the uploaded art style: decisive trailer-moment storytelling, low-angle or forced-perspective camera, strong backlight/rim light, volumetric beams, colored fill, particles/VFX following action direction, and dramatic value contrast.",
    "KV architecture target: prefer a designed campaign structure rather than a simple horizontal battlefield. Strong options include diagonal kitchen-vs-wildlands split, restaurant-window/portal breach, foreground weapon/utensil divider, BOSS reveal through a doorway/canyon, comic-panel mission montage, tiny heroes against giant edible terrain, or a trophy shot after defeating the BOSS.",
    "Blueprint target: every poster should be planned as five visual layers: oversized foreground framing, uploaded hero performance with readable faces, uploaded BOSS pressure, world/game-loop context, and integrated logo/copy safe area.",
    "Production design checklist: specify camera height/lens feel/perspective, foreground framing, midground action, background reveal, key-fill-rim lighting, volumetric haze, particles/VFX, cast/contact shadows, color/value grouping, material texture, and a typography/logo integration plan.",
    "One-second read target: the thumbnail must immediately communicate the game fantasy, the hero-vs-BOSS conflict, and the cooking/adventure hook without relying on long text.",
    "Hero performance target: at least one uploaded playable character must be large enough to read facial identity, emotion, action pose, and signature prop. Avoid back-facing-only, tiny, hidden, or static cutout hero staging.",
    "Set-piece target: use a memorable location and physical story space with doors, counters, ovens, cliffs, portals, props, paths, terrain breaks, or framed vistas. Avoid empty pastel sky, generic food-field backgrounds, and central mascot-ad layouts.",
    "Grounded action target: at least one uploaded hero must have a physical action connection to the BOSS or environment: blocking, climbing, striking, sliding, cooking, pulling, defending, or causing visible impact. Avoid heroes floating symmetrically around the BOSS like stickers.",
    "Flat-scene ban: do not settle for characters standing left/right on a pizza surface with mountains behind them. If giant food is used, it must create scale drama, vertical layering, foreground framing, danger, and a clear story beat.",
    "Rendering target: dramatic but clean lighting, contact shadows, rim light, cast shadows, atmospheric depth, crisp focal detail, controlled background complexity, polished color grading, high contrast around the main subjects, and refined materials inside the chosen art style.",
    "Contact target: visible characters and BOSS must have clear foot/hand contact points, cast shadows, small occlusion, bounce color, and local material reaction wherever they touch props, terrain, weapons, or each other.",
    "World-building target: transform the food premise into a fantasy adventure battlefield or giant edible landscape with playable-space depth, not a close-up food photo.",
    "Avoid: duplicate copies of the same uploaded asset, sticker-like pasted cutouts, floating isolated elements, random extra chef characters, generic mascot substitutions, cluttered UI/text, cheap clip-art, plastic toy look, muddy lighting, tabletop wallpaper composition, flat food surface used as the whole scene, photorealistic food photography, and realistic pizza product renders.",
  ].join("\n");
}

function formatPosterTypographyDirection(slogans: Partial<Record<SloganLanguage, string>>): string {
  const sloganText = Object.entries(slogans)
    .map(([language, slogan]) => `${language}: ${slogan}`)
    .join("\n");
  if (!sloganText) return "";

  return [
    "Typography treatment for poster text:",
    sloganText,
    "Slogan mode is active. The final poster must allocate a visible campaign-copy treatment for the slogan instead of omitting it.",
    imageRenderableSloganRule(Object.keys(slogans)[0] || "en-US"),
    integratedSloganTreatmentRule(),
    "Prefer rendering the exact slogan text when clean spelling is possible.",
    "If the slogan is rendered in the image, it must be custom game-campaign lettering integrated into the art direction: matching the uploaded logo's playful chunky style, with outline, shadow, lighting, perspective, and color grading that belong to the scene.",
    "The slogan may sit on an in-world sign, ribbon, sauce stroke, parchment, steam shape, or dimensional title plate, but it must not look like a plain system font or PPT overlay.",
    "If clean spelling cannot be preserved, still create the visible slogan placement as a polished blank slogan-safe plate/ribbon area and render only the uploaded game logo; do not output broken text, flat overlay typography, or silently remove the copy area.",
  ].join("\n");
}

function formatModeTypographyDirection(
  mode: ProductionMode,
  slogans: Partial<Record<SloganLanguage, string>>,
): string {
  if (mode === "poster") return formatPosterTypographyDirection(slogans);
  if (mode === "icon") {
    return "Icon mode ignores campaign copy and slogan text. The generated image must contain absolutely no text, no letters, no captions, no logo lettering, and no UI copy.";
  }
  if (mode === "logo") {
    return "Logo mode uses only the configured wordmark/mark system. Do not add campaign slogans, subtitles, decorative fake words, or poster copy; preserve exact spelling only when reliable, otherwise use a clean copy-safe mark treatment.";
  }
  if (mode === "announcement") {
    return [
      "Announcement typography treatment:",
      Object.entries(slogans).map(([language, slogan]) => `${language}: ${slogan}`).join("\n"),
      "Prioritize a clean title/copy-safe UI panel or in-world announcement surface.",
      "Render exact short copy only when spelling can stay clean; otherwise leave polished blank text fields or plates for later copy placement.",
      "Do not generate garbled letters, fake title words, or let characters cover the announcement copy zone.",
    ].filter(Boolean).join("\n");
  }
  return [
    "Collaboration typography treatment:",
    Object.entries(slogans).map(([language, slogan]) => `${language}: ${slogan}`).join("\n"),
    "Use only short readable campaign copy when clean spelling is likely; otherwise reserve a polished blank copy-safe lockup.",
    "Keep both brand/logo identities separate and avoid fake hybrid logo text.",
  ].filter(Boolean).join("\n");
}

function formatStyleStrategy(modeState: WorkspaceModeState, assets: PromptAssetBinding[]): string {
  if (modeState.mode !== "poster" || modeState.modeForm.mode !== "poster") return "";

  const styleAssets = assets.filter((asset) => assetSemanticRole(asset) === "styleReference");
  const characterAssets = assets.filter((asset) => assetSemanticRole(asset) === "protagonist");
  const selectedStyle = modeState.modeForm.styleTags[0]?.trim() || "";
  const priorityRule = [
    "Style priority order:",
    "1. Uploaded styleReference image, when present.",
    "2. Manually selected style tag, when no styleReference image is present.",
    "3. Uploaded gameCharacter asset art style, when neither of the above is present.",
  ].join(" ");

  if (styleAssets.length > 0) {
    return [
      priorityRule,
      `Active style source: uploaded style reference image(s): ${styleAssets.map((asset) => `${asset.label} (${asset.assetId})`).join(", ")}.`,
      selectedStyle ? `Selected style tag "${selectedStyle}" is secondary because the uploaded style reference has priority.` : "",
      "Apply the style reference to the whole poster's rendering, palette, lighting, material finish, and atmosphere while preserving character, BOSS, and logo identity from their own uploaded assets.",
    ].filter(Boolean).join("\n");
  }

  if (selectedStyle) {
    return [
      priorityRule,
      `Active style source: selected style tag "${selectedStyle}".`,
      "Use this selected style as the dominant art direction for the whole poster, while preserving uploaded character identity, BOSS shape, and logo readability.",
    ].join("\n");
  }

  if (characterAssets.length > 0) {
    return [
      priorityRule,
      `Active style source: uploaded character asset art style from ${characterAssets.map((asset) => `${asset.label} (${asset.assetId})`).join(", ")}.`,
      "Infer and extend the character reference art style to the whole poster: line quality, proportions, rendering method, color palette, shading, material finish, and cute/action tone.",
      "Do not restyle the poster into a generic cinematic 3D, realistic, anime, or painterly look unless that style is already visible in the uploaded character assets.",
    ].join("\n");
  }

  return [
    priorityRule,
    "Active style source: project context only because no style reference, selected style tag, or character asset is available.",
  ].join("\n");
}

function formatReferenceAnalyses(snapshot: WorkspaceSnapshot): string {
  const analyses = [...(snapshot.referenceAnalyses || [])]
    .filter((item) => item.text.trim())
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  if (analyses.length === 0) return "";

  const labels: Record<string, string> = {
    style: "Style extraction",
    composition: "Composition-only extraction",
    full: "Full image-to-prompt extraction",
  };
  return analyses
    .slice(0, 4)
    .map((item) => {
      const text = item.text.length > 800 ? `${item.text.slice(0, 800)}...` : item.text;
      return [
        `${labels[item.kind] || item.kind}: ${item.label}`,
        `Provider: ${item.providerId}, model: ${item.model}.`,
        text,
      ].join("\n");
    })
    .join("\n\n");
}

function buildSections(input: {
  snapshot: WorkspaceSnapshot;
  mode: ProductionMode;
  modeState: WorkspaceModeState;
  schemeId: string | null;
  platformText: string;
  slogans: Partial<Record<SloganLanguage, string>>;
  assets: PromptAssetBinding[];
}): PromptSection[] {
  const scheme = input.schemeId ? input.snapshot.schemes.find((item) => item.id === input.schemeId) : undefined;
  const sections = [
    section({
      id: "project",
      title: "Project Context",
      source: "project",
      priority: 100,
      content: [
        `Game: ${input.snapshot.project.name}.`,
        `Description: ${input.snapshot.project.description}`,
        `Genre: ${input.snapshot.project.genre || "not specified"}.`,
        `Selling points: ${input.snapshot.project.coreSellingPoints.join(", ") || "not specified"}.`,
        formatFocusGuidancePolicy(input.modeState),
      ].join("\n"),
    }),
    section({
      id: "mode",
      title: "Mode Configuration",
      source: "mode",
      locked: ["collab", "logo", "icon"].includes(input.mode),
      priority: 95,
      content: formatModeForm(input.modeState),
    }),
    section({
      id: "style-strategy",
      title: "Visual Style Strategy",
      source: "mode",
      priority: 96,
      content: formatStyleStrategy(input.modeState, input.assets) || "Use the mode configuration style direction.",
    }),
    section({
      id: "brand",
      title: "Brand Kit",
      source: "brand",
      priority: 80,
      content: formatBrand(input.snapshot),
    }),
    section({
      id: "characters",
      title: "Character Consistency",
      source: "character",
      locked: input.mode === "collab",
      priority: 90,
      content: formatCharacters(input.snapshot, input.mode, input.assets),
    }),
    section({
      id: "assets",
      title: "Mode Asset References",
      source: "asset",
      priority: 82,
      content: formatAssetInventory(input.assets, input.mode),
    }),
    section({
      id: "platform",
      title: "Platform And Size",
      source: "platform",
      priority: 75,
      content: input.platformText,
    }),
  ];

  if (input.mode === "poster") {
    sections.push(
      section({
        id: "poster-quality",
        title: "Poster Quality Bar",
        source: "mode",
        priority: 94,
        content: formatPosterQualityDirection(input.modeState, input.assets),
      }),
    );
  }

  if (scheme) {
    sections.push(
      section({
        id: "scheme",
        title: "Selected Scheme",
        source: "scheme",
        priority: 85,
        content: [`${scheme.code}: ${scheme.title}`, scheme.brief, ...scheme.promptBlocks.map((block) => `${block.title}: ${block.text}`)].join("\n"),
      }),
    );
  }

  const sloganText = Object.entries(input.slogans)
    .map(([language, slogan]) => `${language}: ${slogan}`)
    .join("\n");
  if (sloganText) {
    sections.push(
      section({
        id: "slogans",
        title: "Slogan Pack",
        source: "slogan",
        priority: 70,
        content: sloganText,
      }),
      section({
        id: "poster-typography",
        title: "Poster Typography Integration",
        source: "slogan",
        priority: 84,
        content: formatModeTypographyDirection(input.mode, input.slogans),
      }),
    );
  }

  const referenceAnalysisText = formatReferenceAnalyses(input.snapshot);
  if (referenceAnalysisText) {
    sections.push(
      section({
        id: "reference-analysis",
        title: "Reference Analysis",
        source: "asset",
        priority: 86,
        content: referenceAnalysisText,
      }),
    );
  }

  return sections.sort((a, b) => b.priority - a.priority);
}

function buildFinalPrompt(sections: PromptSection[], guardrails: PromptGuardrailRule[]): string {
  const sectionText = sections.map((item) => `## ${item.title}\n${item.content}`).join("\n\n");
  const hardRules = guardrails
    .map((item) => `${item.severity.toUpperCase()}: ${item.rule}`)
    .join("\n");
  return clampPromptLength(`${sectionText}\n\n## Mode Guardrails\n${hardRules}`);
}

function clampPromptLength(prompt: string): string {
  if (prompt.length <= FINAL_PROMPT_MAX_CHARS) return prompt;
  const suffix = "\n\n## Prompt Trim Notice\nPrompt was compacted to fit the provider request limit. Keep the highest-priority sections and asset constraints above authoritative.";
  return `${prompt.slice(0, FINAL_PROMPT_MAX_CHARS - suffix.length)}${suffix}`;
}

function validatePromptPackage(params: {
  target: PromptBuildTarget;
  mode: ProductionMode;
  sections: PromptSection[];
  assets: PromptAssetBinding[];
  guardrails: PromptGuardrailRule[];
  finalPrompt: string;
}): PromptValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const hardRules = params.guardrails.filter((item) => item.severity === "hard");
  const sectionText = params.sections.map((item) => item.content).join("\n");

  if (hardRules.length === 0) errors.push("Prompt package has no hard guardrails.");

  for (const slot of getRequiredAssetSlots(params.mode)) {
    const roleAssets = assetsForRequiredSlot({
      mode: params.mode,
      slotRole: slot.role,
      assets: params.assets,
    });
    if (roleAssets.length === 0) {
      const issue = `Missing required asset: ${requiredSlotLabel(params.mode, slot)}.`;
      if (params.target === "image") errors.push(issue);
      else warnings.push(issue);
      continue;
    }

    const hasProviderReadyReference = roleAssets.some((asset) => asset.providerReady);
    if (!hasProviderReadyReference) {
      const hasPlaceholderUrl = roleAssets.some((asset) => isExampleAssetUrl(asset.url));
      const issue = hasPlaceholderUrl
        ? `Required asset still points to a demo placeholder URL and cannot be sent as a visual reference: ${requiredSlotLabel(params.mode, slot)}. Re-upload the real image asset.`
        : `Required asset is not provider-ready: ${requiredSlotLabel(params.mode, slot)}.`;
      if (params.target === "image") errors.push(issue);
      else warnings.push(issue);
    }
  }

  if (params.mode === "collab") {
    if (!params.finalPrompt.includes("[Game Character]") || !params.finalPrompt.includes("[Collab Partner]")) {
      errors.push("Collab prompt must include [Game Character] and [Collab Partner] placeholders.");
    }
    if (/\b(face|hair|clothing|outfit|eyes|skin tone|body shape)\b/i.test(sectionText)) {
      errors.push("Collab planning sections must not invent appearance details.");
    }
  }

  if (params.mode === "logo") {
    if (!/solid-color background/i.test(params.finalPrompt)) errors.push("Logo prompt must require a pure solid-color background.");
    if (!/wordmark/i.test(params.finalPrompt)) errors.push("Logo prompt must make the wordmark primary.");
  }

  if (params.mode === "icon") {
    if (!params.finalPrompt.includes("1:1")) errors.push("Icon prompt must lock 1:1 output.");
    if (!/no text/i.test(params.finalPrompt)) errors.push("Icon prompt must forbid text.");
    if (!/full-bleed/i.test(params.finalPrompt)) errors.push("Icon prompt must require full-bleed square composition.");
  }

  if (params.mode === "announcement" && !/Layout mode/i.test(sectionText)) {
    warnings.push("Announcement prompt should include selected typography layout mode.");
  }

  if (params.assets.length === 0) warnings.push("Prompt package has no asset bindings.");

  return PromptValidationSchema.parse({
    ok: errors.length === 0,
    errors,
    warnings,
    lockedFields: lockedFieldsForPromptMode(params.mode),
  });
}

export function createPromptPackage(input: PromptBuilderInput): PromptPackage {
  const parsed = PromptBuilderInputSchema.parse(input);
  const mode = parsed.mode || parsed.snapshot.activeMode;
  const modeState = findModeState(parsed.snapshot, mode);
  const schemeId = parsed.target === "brief"
    ? parsed.schemeId || null
    : parsed.schemeId || parsed.snapshot.schemes.find((item) => item.mode === mode)?.id || null;
  const platform = createPlatformConstraint({
    modeState,
    ...(parsed.platformPreset ? { platformPreset: parsed.platformPreset } : {}),
    ...(parsed.aspectRatio ? { aspectRatio: parsed.aspectRatio } : {}),
    ...(parsed.width ? { width: parsed.width } : {}),
    ...(parsed.height ? { height: parsed.height } : {}),
  });
  const slogans = createSlogans(parsed.snapshot, modeState, schemeId);
  const assets = assignPosterAssetPlaceholders(
    assetsForPromptMode(parsed.snapshot, mode).map((asset) => createAssetBinding(asset, mode)),
    mode,
  );
  const guardrails = getPromptGuardrails(mode, parsed.target);
  const platformText = [
    `Platform: ${platform.platformPreset}.`,
    `Aspect ratio: ${platform.aspectRatio}.`,
    `Size: ${platform.width || "auto"}x${platform.height || "auto"}.`,
    `Safe area: ${platform.safeArea}`,
    `Copy length: ${platform.copyLengthHint}`,
  ].join("\n");
  const sections = buildSections({
    snapshot: parsed.snapshot,
    mode,
    modeState,
    schemeId,
    platformText,
    slogans,
    assets,
  });
  const finalPrompt = buildFinalPrompt(sections, guardrails);
  const negativePrompt = guardrails
    .map((item) => item.negativeRule)
    .filter((item): item is string => Boolean(item))
    .join("\n");
  const validation = validatePromptPackage({
    target: parsed.target,
    mode,
    sections,
    assets,
    guardrails,
    finalPrompt,
  });

  return PromptPackageSchema.parse({
    id: `prompt-${parsed.target}-${mode}-${schemeId || "workspace"}`,
    target: parsed.target,
    projectId: parsed.snapshot.project.id,
    mode,
    schemeId,
    sections,
    assets,
    platform,
    slogans,
    guardrails,
    negativePrompt,
    finalPrompt,
    validation,
  });
}

export function createImagePromptPackage(input: Omit<PromptBuilderInput, "target">): PromptPackage {
  return createPromptPackage({ ...input, target: "image" });
}

export function createBriefPromptPackage(input: Omit<PromptBuilderInput, "target" | "schemeId">): PromptPackage {
  return createPromptPackage({ ...input, target: "brief" });
}
