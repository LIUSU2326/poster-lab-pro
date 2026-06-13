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
import { logoTextPolicyBlock, logoWordmarkTextRisk } from "./logo-text-policy";
import { announcementCopySafetyBlock, announcementCopySafetyPolicy, collabBrandSafetyBlock } from "./mode-safety-policy";
import { imageRenderableSloganRule, integratedSloganTreatmentRule, normalizeImageRenderableSlogan } from "./slogan-policy";
import {
  posterFocalHierarchyLock,
  posterHeroPerformanceScaleLock,
  posterInWorldBrandTreatmentLock,
  posterLogoSingleUseLock,
  posterPoseClarityLock,
  posterTextEconomyLock,
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
const FINAL_PROMPT_MAX_CHARS = 18000;
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

const multiReferencePromptAssetRoles = new Set<StoredAssetRecord["role"]>([
  "gameCharacter",
  "collabCharacter",
]);

function promptAssetSlotKey(asset: StoredAssetRecord): string {
  if (multiReferencePromptAssetRoles.has(asset.role)) {
    return `${asset.role}|${asset.id}`;
  }
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
    .filter((asset) => asset.projectId === snapshot.project.id && allowedRoles.has(asset.role))
    .filter((asset) => {
      if (mode !== "logo") return true;
      return !(asset.role === "prop" && assetSemanticRole(asset) === "antagonist");
    });
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
    return dateValue(right.updatedAt || right.createdAt) - dateValue(left.updatedAt || left.createdAt);
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

function findSchemeForPromptMode(snapshot: WorkspaceSnapshot, mode: ProductionMode, schemeId: string | null) {
  if (schemeId) {
    return snapshot.schemes.find((item) => item.id === schemeId && item.mode === mode);
  }
  return snapshot.schemes.find((item) => item.mode === mode);
}

function createSlogans(snapshot: WorkspaceSnapshot, modeState: WorkspaceModeState, schemeId: string | null) {
  if (modeState.mode === "icon" || modeState.mode === "logo") return {};
  const scheme = findSchemeForPromptMode(snapshot, modeState.mode, schemeId);
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
        characterAssets.length > 0 ? `Exact playable roster count: ${characterAssets.length}. Use only ${characterAssets.map((asset) => asset.placeholder || asset.label).join(", ")} as visible playable heroes.` : "",
        characterAssets.length === 1 ? "Single-character rule: do not write or render a squad, allies, teammates, or extra human helpers; only [Game Character 1] may appear as the playable hero." : "",
        characterAssets.length > 1 ? "Multi-character usage requirement: every uploaded protagonist asset must appear as a separate readable in-world character in poster schemes and image prompts. Do not omit the second character, merge them, treat one as a small decoration, or collapse them into alternate views of one hero." : "",
        characterAssets.length > 0 ? "Poster must visibly use each uploaded protagonist asset as one integrated in-world character with model-sheet identity preserved, not as a sticker, generic redraw, or duplicated cutout." : "",
        bossAssets.length > 0 ? "BOSS anchor requirement: uploaded antagonist/BOSS assets are available campaign story anchors, not mandatory centerpieces for every poster. If the selected scheme is threat-led, show them as integrated threats with preserved silhouette, scale pressure, contact shadows, atmosphere, debris, and environmental reaction; if the scheme is gameplay/reward/cozy/collection/map/lineup led, they may become secondary pressure, foreshadowing, trophy, environmental hazard, or stay absent." : "",
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
    ? "Character roster lock: visible hero/player characters must come from uploaded gameCharacter references only. Do not invent extra heroes, random mascots, or generic human characters."
    : "";
  const multiCollabRule = collabAssets.length > 1
    ? "Collab character rule: each collabCharacter asset is a separate independent partner character. Keep them distinct and never merge identities."
    : "";

  return [`Required slots: ${requiredText}.`, fusionDirective, posterAssetContract, rosterLockRule, multiCharacterRule, multiCollabRule, ...assetLines].filter(Boolean).join("\n");
}

function formatModeForm(modeState: WorkspaceModeState): string {
  const form = modeState.modeForm;
  if (form.mode === "collab") {
    const partnerName = form.collabBrandName?.trim() || "unspecified partner brand";
    return `Partner brand: ${partnerName}. Collab style injection: ${form.collabStyleInjection}. Character placeholders only: ${form.characterPlaceholdersOnly}. Prevent merge: ${form.preventCharacterMerge}.`;
  }
  if (form.mode === "announcement") {
    const announcementTitle = form.announcementTitle?.trim() || form.copyPreset || "game announcement";
    const policy = announcementCopySafetyPolicy(announcementTitle);
    return `Announcement title: ${announcementTitle}. Layout mode: ${form.layoutMode}. Group shot when multi-character: ${form.groupShotWhenMultiCharacter}. Copy safety strategy: ${policy.strategy}.`;
  }
	  if (form.mode === "logo") {
	    const sourceWordmark = form.wordmark?.trim() || modeState.projectBrief.projectName?.trim() || "logo wordmark";
	    const policy = logoWordmarkTextRisk(sourceWordmark);
	    const wordmarkText = policy.strategy === "exactShortWordmark"
	      ? sourceWordmark
	      : "redacted for copy-safe blank wordmark plate";
	    return `Wordmark: ${wordmarkText}. Selected logo style: ${styleTagsText(form.styleTags)}. Solid background: ${form.solidBackground}. Background color: ${form.backgroundColor}. Wordmark is primary: ${form.wordmarkIsPrimarySubject}. Logo text strategy: ${policy.strategy}.`;
	  }
  if (form.mode === "icon") {
    return `Selected icon style: ${styleTagsText(form.styleTags)}. Aspect ratio: ${form.aspectRatio}. No text: ${form.noText}. Full-bleed square: ${form.fullBleedSquare}. Composition reference rotation: ${form.compositionReferenceRotation}.`;
  }
  return `Style tags: ${form.styleTags.join(", ")}. Composition reference strength: ${form.compositionReferenceStrength}.`;
}

function styleTagsText(styleTags: string[]): string {
  const text = styleTags.map((item) => item.trim()).filter(Boolean).slice(0, 1).join(", ");
  return text || "not selected";
}

function formatFocusGuidancePolicy(modeState: WorkspaceModeState): string {
  const rawFocus = modeState.projectBrief.focusGuidance?.trim();
  if (!modeState.projectBrief.focusGuidanceEnabled || !rawFocus) {
    return "Focus guidance: not active. Choose the strongest campaign KV story from project description, uploaded assets, and the selected scheme.";
  }

  return [
    `Focus guidance: ${rawFocus}.`,
    "Focus guidance handling: treat this as a soft creative emphasis, not a literal scene lock. It must never override uploaded asset identity, the user project brief, story clarity, or poster quality.",
    "Focus guidance impact requirement: every generated scheme must visibly translate at least one active focus item into a concrete camera, action, environment, prop, lighting, or copy-area decision in the brief and image prompt.",
    "If focus guidance mentions giant scale, micro perspective, cozy, character, gameplay, collection, romance, puzzle, or any other emphasis, translate it into a project-native poster promise and vary the architecture, viewpoint, format, environment, and story beat.",
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
    ? "Default style lock: because no explicit style reference or selected style is active, the generated poster world must follow the uploaded protagonist assets' cartoon game art language. Use project-specific illustrated terrain, clean silhouettes, rounded shapes, stylized line/cel shading, and vibrant game-poster color. Do not use photorealistic product photography, realistic unrelated 3D render, or stock-advertising lighting."
    : "Style coherence rule: the generated poster world must share one art direction with the final uploaded assets. Do not switch to a conflicting photorealistic or stock-photo look unless that is explicitly selected by the user.";

  return [
    "Quality target: premium game marketing key visual polish, adapted to the selected or uploaded art style rather than forcing photorealism.",
    styleConstraint,
    styleWorldRule,
    "Art-direction target: the image must feel like one designed game campaign KV generated as a unified illustration, not a random background with static assets placed on top.",
    "Semantic asset target: first decide each uploaded asset's poster duty: protagonist, antagonist, brandLogo, prop, environment, styleReference, compositionReference, keySubject, or supportingAsset. The duty controls how it enters the story and how strongly identity must be preserved.",
    "Pipeline target: generate the full integrated KV when the provider can consume image references. Uploaded protagonist, antagonist, key subject, prop, environment, and logo references are visual anchors; the model may change pose, expression, camera angle, action, lighting, scale, and perspective to create a vivid poster moment while preserving recognizable identity, silhouette, colors, and key props.",
    "Integrated subject rule: include uploaded protagonists as living in-world actors with action intent, facial expression, readable body language, contact shadows, environmental occlusion, and story interaction. When a selected scheme uses an uploaded antagonist/key subject, integrate it with the same lighting and story logic instead of making it a sticker. Props should be used or activated in the scene; environment references should become world design.",
    "Reference pose release: identity lock does not mean copying the exact uploaded front-facing/static pose. Keep identity, but repaint heroes and any scheme-used BOSS/key subject with a new performance such as 3/4 turn, stride, leap, recoil, attack wind-up, defensive block, grip/contact, landing dust, or foreshortened prop/tool angle.",
    posterPoseClarityLock(),
    "BOSS performance lock: if a selected scheme uses uploaded BOSS/antagonist/key subject assets, they must not become scaled-up stickers in the same still pose or static standee staging; stage a lunge, brace, swing, doorway burst, landing impact, silhouette loom, route blockage, trophy state, or physical reaction while preserving silhouette and signature details.",
    posterFocalHierarchyLock(),
    posterHeroPerformanceScaleLock(),
    posterSubjectAccessoryStrictnessLock(),
    posterLogoSingleUseLock(),
    posterTextEconomyLock(),
    posterInWorldBrandTreatmentLock(),
    "One-appearance rule: use each uploaded protagonist, antagonist, key subject, brand logo, and prop once according to semantic duty. Do not duplicate them as both large and small copies, do not add replacement heroes, and do not paste unchanged sticker cutouts unless a fallback compositor is explicitly requested.",
    "Focus guidance hierarchy: any user focus guidance is a creative lens only. It is lower priority than uploaded identity references, the chosen KV architecture, coherent story composition, and market-ready image quality.",
    "Composition target: one clear project-native focal point, strong foreground-midground-background depth, dynamic camera angle, readable silhouette hierarchy, environmental or gameplay storytelling, a readable player promise/objective/emotional beat/character-vs-BOSS beat when appropriate, and enough negative space for logo and slogan.",
    "Cinematic KV target: borrow the language of high-end film/game announcement posters within the uploaded art style: decisive trailer-moment or emotional/gameplay storytelling, deliberate camera, strong backlight/rim light or quiet premium practical light, atmosphere, particles/VFX when genre-appropriate, and dramatic value contrast.",
    "KV architecture target: prefer a designed campaign structure rather than a simple horizontal battlefield. Strong options can include dynamic split-world contrast, portal/breach reveal, foreground prop divider, character lineup, gameplay-proof board/level surface, cozy room/shop/farm format, world/setting reveal, comic-panel mission montage, giant-scale project terrain, or reward/progression payoff.",
    "Blueprint target: every poster should be planned as five visual layers: foreground framing or gameplay surface, uploaded hero performance with readable faces when present, project-native focus such as BOSS/threat when appropriate, core mechanic, reward, relationship, puzzle, collection, character charm, or emotional hook, world/game-loop context, and integrated logo/copy safe area.",
    "Production design checklist: specify camera height/lens feel/perspective, foreground framing, midground action, background reveal, key-fill-rim lighting, volumetric haze, particles/VFX, cast/contact shadows, color/value grouping, material texture, and a typography/logo integration plan.",
    "One-second read target: the thumbnail must immediately communicate the game fantasy, player promise, protagonist objective or BOSS/threat when relevant, and the current project's core hook without relying on long text.",
    "Hero performance target: at least one uploaded playable character must be large enough to read facial identity, emotion, action pose, and signature prop. Avoid back-facing-only, tiny, hidden, or static cutout hero staging.",
    "Set-piece target: use a memorable project-native location or poster format: character lineup, cozy room, shop/farm/home, gameplay board, puzzle layout, UI-like decision surface, collectible shelf, world map, doors, bases, roads, cliffs, portals, props, paths, terrain breaks, machines, town elements, or framed vistas. Avoid empty pastel sky, generic backdrops, unrelated sample-project backgrounds, and central mascot-ad layouts.",
    "Grounded action target: at least one uploaded hero must have a physical or readable action connection to the core mechanic, objective, prop, environment, other character, or BOSS/threat when present: blocking, climbing, striking, sliding, casting, repairing, piloting, pulling, decorating, serving, solving, collecting, defending, or causing visible impact. Avoid heroes floating symmetrically around the scene like stickers.",
    "Flat-scene ban: do not settle for characters standing left/right on a flat surface with mountains behind them. If giant-scale scenery is used, it must create scale drama, vertical layering, foreground framing, danger, and a clear story beat.",
    "Rendering target: dramatic but clean lighting, contact shadows, rim light, cast shadows, atmospheric depth, crisp focal detail, controlled background complexity, polished color grading, high contrast around the main subjects, and refined materials inside the chosen art style.",
    "Contact target: visible characters, BOSS/threats, props, and gameplay objects must have clear foot/hand contact points or equivalent object contact points, cast shadows, small occlusion, bounce color, and local material reaction wherever they touch props, terrain, UI-like surfaces, tools, or each other.",
    "Limb/anatomy sanity target: visible playable characters must keep coherent arms, hands, fingers, legs, and tool grips. No extra duplicated arms, double forearms, front-and-back duplicate hands, disconnected hands, broken wrists, fused fingers, or impossible limb overlaps.",
    posterPoseClarityLock(),
    "World-building target: transform the current project premise into the right project-native world or format: fantasy, tactical, adventure, cozy, puzzle, simulation, sports, social, story, collection, management, or action visual space with readable depth. Do not introduce a premise from an unrelated sample project.",
    "Avoid: duplicate copies of the same uploaded asset, sticker-like pasted cutouts, floating isolated elements, random extra characters, extra hands, third feet, duplicated legs, prop-as-limb silhouettes, generic mascot substitutions, cluttered UI/text, cheap clip-art, plastic toy look, muddy lighting, tabletop wallpaper composition, unrelated commercial scenery, photorealistic product photography, and realistic product renders.",
  ].join("\n");
}

function formatModeQualityDirection(modeState: WorkspaceModeState, assets: PromptAssetBinding[]): string {
  if (modeState.mode === "poster") return formatPosterQualityDirection(modeState, assets);

  const fusionDirective = modeAssetFusionDirective(modeState.mode, assets);
  const sharedRules = [
    "Mode quality target: use uploaded assets as semantic visual references for AI integrated redraw, not as pasted sticker layers.",
    fusionDirective,
    "Preserve each asset's assigned semantic duty from the Mode Asset References section while adapting it to this mode's visual goal.",
    "Uploaded subject accessory lock: do not add new shields, weapons, armor, tools, costume parts, horns, crowns, props, facial details, beard/mustache, or signature accessories to uploaded subjects unless those details are clearly visible in the reference. Express action through pose, camera, lighting, particles, environment, and existing visible props only.",
  ].filter(Boolean).join("\n");

  if (modeState.mode === "icon") {
    return [
      sharedRules,
      "Icon quality target: premium game/app icon, perfect 1:1 square, one single dominant subject, bold readable silhouette, high contrast, minimal background, crisp focal detail, and readable at 64px.",
      "Icon asset handling: uploaded character, prop, BOSS-like subject, or logo reference can become the main icon subject, but it must be redrawn/simplified into a clean icon form with stronger silhouette and fewer details.",
      "Icon canvas lock: generate clean full-bleed 1:1 square artwork with one dominant subject. Rounded corners, badge-like framing, or app-icon styling are acceptable only when intentional and polished; do not add a white border, empty corner padding, crop marks, or a separate dark container that shrinks the subject.",
      "Icon edge cleanliness lock: no border frame, no white margin, no crop marks, no reference-sheet side markings, no barcode-like strokes, no numerals, no digits, no decorative glyphs, no colored edge labels, no top-edge sample-sheet marks, and no tiny black side labels near the canvas edges.",
      "Icon reference isolation: if any uploaded reference contains logo text, UI, poster copy, or edge markings, ignore those text/edge marks completely and render only the single clean subject or non-letter motif.",
      "Icon exclusions: ABSOLUTELY NO TEXT, no letters, no numbers, no logo lettering, no captions, no UI copy, no pseudo-text marks, no pseudo-text edge marks, no poster scene complexity, no multi-character battle scene, no invented shield/weapon/tool/accessory, no white border, no accidental padding, and no copied static asset pose.",
    ].join("\n");
  }

  if (modeState.mode === "logo") {
    return [
	      sharedRules,
	      "Logo quality target: readable wordmark/mark system is the primary subject, with clean silhouette, premium material finish, strong brand rhythm, and a pure solid-color background suitable for later compositing.",
	      "Logo asset handling: uploaded logos are brand continuity references for shape, color, letter rhythm, and style. Preserve exact spelling only when reliable; otherwise design a clean copy-safe mark or blank wordmark treatment without fake replacement text.",
	      "Logo copy-safe blank lock: when Logo Text Strategy is copySafeBlankWordmark, do not render any readable letters, partial project-title words, uploaded-logo text, pseudo-letters, subtitles, slogans, or decorative fake typography.",
	      "Logo exclusions: do not turn logo mode into a poster scene, character scene, product render, landscape, or sticker collage. Do not invent look-alike words, substitute letters, repeat the uploaded logo as a pasted sticker, or let props/characters dominate the wordmark.",
	    ].join("\n");
	  }

  if (modeState.mode === "announcement") {
    return [
      sharedRules,
      "Announcement quality target: readable in-game announcement/event visual with clear title hierarchy, deliberate copy-safe area, polished UI/event art direction, and quiet enough background for later text placement.",
      "Announcement asset handling: uploaded characters or key subjects can act as guide/presenter/event support around the announcement surface; uploaded logos should be small clean lockups; backgrounds and UI screenshots guide panel material and spacing.",
      "Announcement exclusions: do not cover the headline/copy zone, do not turn the image into a battle poster, do not generate garbled operational text, fake title words, repeated watermark logos, or busy effects behind copy.",
    ].join("\n");
  }

  if (modeState.mode === "collab") {
    return [
      sharedRules,
      "Collab quality target: premium collaboration campaign visual where both identities stay separate but feel unified through one scene, shared lighting, matching materials, clear interaction story, and balanced brand presence.",
      "Collab placeholder alias lock: if any scheme text says [Collab Character] or [Partner Character], treat it as [Collab Partner] and bind it to the uploaded collabCharacter visual reference.",
      "Collab asset handling: [Game Character] and [Collab Partner] must remain separate visible entities. Keep each uploaded character/logo identity independent; show relationship through exchanged props, mirrored actions, shared set piece, or in-world event staging.",
      "Collab scale balance lock: [Game Character] and [Collab Partner] must both be large enough to read at thumbnail size; neither side may shrink into a background mascot or tiny corner decoration. Use balanced foreground/midground staging with a visible interaction touchpoint.",
      "Collab partner-first lock: when a collabCharacter reference exists, it is not optional decorative art. Give [Collab Partner] a readable co-star action moment with comparable scale to [Game Character] before designing logos, plates, props, or background spectacle.",
      "Collab two-character audit: exactly one [Game Character] and exactly one [Collab Partner] should be the primary living co-stars when both references exist. Do not add a third lead, merge them, hide one behind a plate, or reduce either side to a logo-only presence.",
      "Collab brand-copy lock: do not render readable letters, logo text, partner names, fake sponsor words, pseudo-letters, or warped uploaded-logo lettering unless an uploaded logo can be reproduced perfectly; if spelling is uncertain, use blank non-letter brand plates or neutral emblems.",
      "Collab exclusions: do not merge characters, average traits, swap identities, create a hybrid mascot, fuse two logos into one fake mark, invent partner brand names, invent fake sponsor logos, render fake partner slogans, paste logos side-by-side without a story, output visible pseudo-text, or let one brand erase the other.",
      "Collab missing-brandLogo rule: if no uploaded brandLogo exists for a partner, reserve a polished blank partner brand plate plus polished blank game/partner brand plates, neutral emblems, or copy-safe lockup areas instead of generating readable fake partner wordmarks or distorted game-logo text.",
    ].join("\n");
  }

  return sharedRules;
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
    posterTextEconomyLock(),
    posterInWorldBrandTreatmentLock(),
    "Prefer rendering the exact slogan text when clean spelling is possible.",
    "If the slogan is rendered in the image, it must be custom game-campaign lettering integrated into the art direction: matching the uploaded logo's playful chunky style, with outline, shadow, lighting, perspective, and color grading that belong to the scene.",
    "The slogan may sit on an in-world sign, ribbon, energy stroke, parchment, smoke/steam shape, hologram, banner, or dimensional title plate, but it must not look like a plain system font or PPT overlay.",
    "If clean spelling cannot be preserved, still create the visible slogan placement as a polished blank slogan-safe plate/ribbon area and render only the uploaded game logo; do not output broken text, flat overlay typography, or silently remove the copy area.",
  ].join("\n");
}

function formatModeTypographyDirection(
  mode: ProductionMode,
  slogans: Partial<Record<SloganLanguage, string>>,
): string {
  if (mode === "poster") return formatPosterTypographyDirection(slogans);
  if (mode === "icon") {
    return "Icon mode ignores campaign copy and slogan text. The generated image must contain absolutely no text, no letters, no numbers, no numerals, no pseudo-text edge marks, no captions, no logo lettering, and no UI copy.";
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
    "Do not invent partner brand names, fake sponsor logos, readable partner wordmarks, pseudo-letters, or distorted uploaded-logo words when no uploaded brandLogo is present; use polished blank partner/game brand plates or neutral emblems instead.",
  ].filter(Boolean).join("\n");
}

function formatLogoTextDirection(modeState: WorkspaceModeState, assets: PromptAssetBinding[]): string {
  if (modeState.mode !== "logo" || modeState.modeForm.mode !== "logo") return "";
  return logoTextPolicyBlock({
    wordmark: modeState.modeForm.wordmark,
    hasUploadedLogoReference: assets.some((asset) => assetSemanticRole(asset) === "brandLogo"),
  });
}

function formatModeSafetyDirection(modeState: WorkspaceModeState, assets: PromptAssetBinding[]): {
  title: string;
  content: string;
} | null {
  if (modeState.mode === "announcement" && modeState.modeForm.mode === "announcement") {
    return {
      title: "Announcement Copy Safety Strategy",
      content: announcementCopySafetyBlock(modeState.modeForm.announcementTitle),
    };
  }
  if (modeState.mode === "collab" && modeState.modeForm.mode === "collab") {
    return {
      title: "Collab Brand Safety Strategy",
      content: collabBrandSafetyBlock({
        collabBrandName: modeState.modeForm.collabBrandName,
        hasPartnerBrandLogo: assets.some((asset) => asset.role === "brandLogo"),
      }),
    };
  }
  return null;
}

function selectedStyleRenderingDirective(style: string, modeLabel: string): string {
  const normalized = style.trim().toLowerCase();
  if (!normalized) return "";

  if (/像素|街机|pixel|8[- ]?bit|16[- ]?bit|arcade/i.test(style)) {
    return [
      `Hard selected-style rendering lock for "${style}": the final ${modeLabel} must visibly read as retro pixel art / arcade pixel key art, not smooth 3D or painterly illustration.`,
      "Use low-resolution pixel-grid aesthetics, blocky silhouettes, crisp square pixels, limited-palette color ramps, tile/sprite-like edges, pixelated lighting, dithering, stepped shadows, and readable chunky game-art shapes.",
      "Translate uploaded character, BOSS, logo, and prop identities into pixel-art sprites or pixel-art poster elements. Preserve identity, but redraw the render language as pixel art.",
      "Negative style lock: no smooth cinematic 3D, no clay render, no soft airbrush, no photorealistic materials, no glossy realistic lighting, and no painterly brush blending.",
    ].join("\n");
  }

  if (/黏土|clay|plasticine/i.test(style)) {
    return `Hard selected-style rendering lock for "${style}": use tactile clay / plasticine materials, hand-shaped rounded forms, soft studio-like highlights, and subtle fingerprints; avoid flat vector or realistic photography.`;
  }

  if (/二次元|赛璐璐|anime|cel/i.test(style)) {
    return [
      `Hard selected-style rendering lock for "${style}": the final ${modeLabel} must read as polished anime / cel-shaded game key art.`,
      "Use clean silhouette shapes, confident contour lines, crisp cel shadow blocks, expressive faces, graphic highlights, saturated but controlled color, and simplified material detail.",
      "Negative style lock: no clay render, no photorealism, no low-poly faceting, no heavy oil-paint brush blending, and no generic smooth 3D toy render.",
    ].join("\n");
  }

  if (/水彩|watercolor/i.test(style)) {
    return `Hard selected-style rendering lock for "${style}": use translucent watercolor washes, paper texture, soft pigment blooms, gentle edge bleed, and light layered color; avoid glossy 3D materials.`;
  }

  if (/低多边形|low[- ]?poly/i.test(style)) {
    return `Hard selected-style rendering lock for "${style}": use readable low-poly geometry, faceted planes, crisp angular silhouettes, simplified materials, and graphic lighting; avoid smooth painterly blending.`;
  }

  if (/欧美扁平|矢量|扁平|极简|vector|flat|minimal/i.test(style)) {
    return [
      `Hard selected-style rendering lock for "${style}": render as clean flat/vector campaign art, not cinematic 3D.`,
      "Use simplified geometric silhouettes, large color fields, precise edges, minimal texture, bold shape contrast, and poster-like negative space.",
      "Negative style lock: no realistic material grain, no soft painterly rendering, no volumetric overload, and no photorealistic lighting.",
    ].join("\n");
  }

  if (/国风|水墨|国潮|ink|chinese/i.test(style)) {
    return [
      `Hard selected-style rendering lock for "${style}": make Chinese ink / guochao visual language clearly dominant.`,
      "Use brush-like edge rhythm, ink-wash value transitions, controlled red/gold/black accents when appropriate, paper or mural texture, and graphic negative space.",
      "Keep uploaded identities readable, but translate materials and VFX into ink, pigment, paper, lacquer, or mural-like treatment.",
    ].join("\n");
  }

  if (/赛博|霓虹|科幻|机甲|cyber|neon|sci[- ]?fi|mecha/i.test(style)) {
    return [
      `Hard selected-style rendering lock for "${style}": the whole ${modeLabel} must visibly use neon sci-fi / cyber game art language.`,
      "Use electric rim light, emissive signs, holographic glow, dark value base, cyan-magenta contrast, tech-panel shapes, scanline or circuit accents, and hard specular highlights.",
      "Negative style lock: no warm medieval fantasy default, no clay toy finish, no soft watercolor, and no generic sunny cartoon unless converted into neon-tech form.",
    ].join("\n");
  }

  if (/暗黑|哥特|史诗暗金|RPG|dark|gothic/i.test(style)) {
    return [
      `Hard selected-style rendering lock for "${style}": use epic dark RPG poster art with dramatic value contrast.`,
      "Use deep shadows, gold or ember accents, cathedral/ruin/ritual shapes when project-appropriate, hard rim light, smoke, sparks, and weighty material texture.",
      "Do not brighten into cheerful toy art unless the project brief explicitly requires a cute-dark contrast.",
    ].join("\n");
  }

  if (/吉卜力|童话|治愈|童趣|手绘|绘本|ghibli|storybook|cozy|healing/i.test(style)) {
    return [
      `Hard selected-style rendering lock for "${style}": use warm storybook / cozy hand-drawn campaign art.`,
      "Use soft organic shapes, gentle light, painterly-but-clean edges, appealing character warmth, environmental charm, and readable emotion before spectacle.",
      "Negative style lock: no harsh battle-only composition, no photorealism, no black-gold RPG finish, and no aggressive neon unless the brief demands contrast.",
    ].join("\n");
  }

  if (/电竞|猛兽|esports/i.test(style)) {
    return `Hard selected-style rendering lock for "${style}": use esports badge/key-art energy: bold mascot silhouette, aggressive diagonal motion, sharp glow edges, high contrast, impact typography-safe zones, and trophy-like lighting.`;
  }

  if (/钻金|轻奢|产品|luxury|premium/i.test(style)) {
    return `Hard selected-style rendering lock for "${style}": use premium product/KV polish with controlled black-gold or jewel lighting, clean reflections, elegant negative space, refined material highlights, and no cluttered sticker collage.`;
  }

  if (/街头|涂鸦|graffiti|street/i.test(style)) {
    return `Hard selected-style rendering lock for "${style}": use street graffiti energy with spray texture, sticker/poster-wall layering, bold outlines, paint drips, high-saturation accents, and raw urban graphic rhythm.`;
  }

  if (/蒸汽|机械|朋克|steampunk/i.test(style)) {
    return `Hard selected-style rendering lock for "${style}": use steampunk mechanical styling: brass/copper materials, gears, rivets, pressure gauges, smoky warm light, worn metal texture, and engineered prop silhouettes.`;
  }

  if (/漫画分镜|复古海报|comic|storyboard|retro poster/i.test(style)) {
    return `Hard selected-style rendering lock for "${style}": use a designed poster/comic print language with panel rhythm, halftone or print texture, bold framing, readable silhouettes, and intentional graphic copy-safe areas.`;
  }

  if (/纸艺|剪纸|paper/i.test(style)) {
    return `Hard selected-style rendering lock for "${style}": use layered paper/cutout craft language with visible stacked planes, paper fibers, soft paper shadows, handmade edge variation, and simplified forms.`;
  }

  if (/硬表面|3D|hard[- ]?surface/i.test(style)) {
    return `Hard selected-style rendering lock for "${style}": use crisp stylized 3D hard-surface finish with beveled forms, controlled specular highlights, clean material separation, and precise silhouette design; avoid mushy painterly blur.`;
  }

  return `Selected-style execution lock for "${style}": make this style visibly dominant in palette, rendering method, line/edge language, material finish, lighting, and surface treatment across the whole ${modeLabel}.`;
}

function formatStyleStrategy(modeState: WorkspaceModeState, assets: PromptAssetBinding[]): string {
  const form = modeState.modeForm;
  if (modeState.mode === "poster" && form.mode !== "poster") return "";
  if (modeState.mode === "logo" && form.mode !== "logo") return "";
  if (modeState.mode === "icon" && form.mode !== "icon") return "";
  if (!["poster", "logo", "icon"].includes(modeState.mode)) return "";

  const styleAssets = assets.filter((asset) => assetSemanticRole(asset) === "styleReference");
  const characterAssets = assets.filter((asset) => assetSemanticRole(asset) === "protagonist");
  const subjectAssets = assets.filter((asset) => ["subjectReference", "prop", "gameLogo"].includes(asset.role));
  const selectedStyle = form.mode === "poster" || form.mode === "logo" || form.mode === "icon"
    ? form.styleTags[0]?.trim() || ""
    : "";
  const modeLabel = modeState.mode === "icon" ? "icon" : modeState.mode === "logo" ? "logo" : "poster";
  const priorityRule = modeState.mode === "poster"
    ? [
      "Style priority order:",
      "1. Uploaded styleReference image, when present.",
      "2. Manually selected style tag, when no styleReference image is present.",
      "3. Uploaded gameCharacter asset art style, when neither of the above is present.",
    ].join(" ")
    : [
      `${modeLabel} style priority order:`,
      "1. Uploaded styleReference image, when present.",
      "2. Manually selected style tag, when no styleReference image is present.",
      "3. Uploaded primary subject/logo reference art finish, when neither of the above is present.",
    ].join(" ");

  if (styleAssets.length > 0) {
    return [
      priorityRule,
      `Active style source: uploaded style reference image(s): ${styleAssets.map((asset) => `${asset.label} (${asset.assetId})`).join(", ")}.`,
      selectedStyle ? `Selected style tag "${selectedStyle}" is secondary because the uploaded style reference has priority.` : "",
      modeState.mode === "poster"
        ? "Apply the style reference to the whole poster's rendering, palette, lighting, material finish, and atmosphere while preserving character, BOSS, and logo identity from their own uploaded assets."
        : `Apply the style reference to the whole ${modeLabel}'s rendering, palette, material finish, outline language, and polish while preserving the mode constraints.`,
    ].filter(Boolean).join("\n");
  }

  if (selectedStyle) {
    return [
      priorityRule,
      `Active style source: selected style tag "${selectedStyle}".`,
      selectedStyleRenderingDirective(selectedStyle, modeLabel),
      modeState.mode === "poster"
        ? "Use this selected style as the dominant art direction for the whole poster, while preserving uploaded character identity, BOSS shape, and logo readability."
        : `Use this selected style as the dominant art direction for the ${modeLabel}, while preserving uploaded visual identity and the mode's readability rules.`,
    ].join("\n");
  }

  const fallbackStyleAssets = modeState.mode === "poster" ? characterAssets : subjectAssets;
  if (fallbackStyleAssets.length > 0) {
    return [
      priorityRule,
      `Active style source: uploaded ${modeState.mode === "poster" ? "character" : "primary subject/logo"} asset art style from ${fallbackStyleAssets.map((asset) => `${asset.label} (${asset.assetId})`).join(", ")}.`,
      modeState.mode === "poster"
        ? "Infer and extend the character reference art style to the whole poster: line quality, proportions, rendering method, color palette, shading, material finish, and cute/action tone."
        : `Infer and simplify the uploaded reference art finish into a clean ${modeLabel} style: silhouette, color rhythm, material finish, edge contrast, and small-size readability.`,
      modeState.mode === "poster"
        ? "Do not restyle the poster into a generic cinematic 3D, realistic, anime, or painterly look unless that style is already visible in the uploaded character assets."
        : `Do not turn the ${modeLabel} into a poster scene or generic unrelated style unless that style is explicitly selected or visible in the uploaded reference.`,
    ].join("\n");
  }

  return [
    priorityRule,
    `Active style source: project context only because no style reference, selected style tag, or ${modeState.mode === "poster" ? "character" : "primary subject/logo"} asset is available.`,
  ].join("\n");
}

function formatOutputSuiteStrategy(
  modeState: WorkspaceModeState,
  platform: ReturnType<typeof createPlatformConstraint>,
): string {
  const outputSettings = modeState.outputSettings;
  if (modeState.mode !== "poster" || outputSettings.selectionMode !== "suite") return "";
  const aspectRatios = Array.isArray(outputSettings.aspectRatios) && outputSettings.aspectRatios.length > 0
    ? outputSettings.aspectRatios
    : [platform.aspectRatio];
  const suiteCount = Math.max(1, Math.min(5, Math.round(Number(outputSettings.schemeCount || 1))));
  const imagesPerScheme = Math.max(1, Math.round(Number(outputSettings.imagesPerScheme || 1)));
  const planStrategy = outputSettings.planStrategy === "independent" ? "independent" : "unified";
  const strategyText = planStrategy === "independent"
    ? "Independent suite strategy: each output size needs its own size-specific poster scheme, composition, safe-area logic, and visual emphasis. Do not reuse one unchanged scene across all sizes."
    : "Unified suite strategy: one poster scheme is adapted across every size in the suite. Keep the same story beat and identity, but plan flexible safe areas, crop-safe focal hierarchy, and responsive logo/copy zones.";

  return [
    `Output suite mode: ${planStrategy}.`,
    `Suite count: ${suiteCount}; suite sizes: ${aspectRatios.join(" / ")}; images per scheme: ${imagesPerScheme}.`,
    strategyText,
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

function sanitizeSchemePromptBlockText(text: string): string {
  const normalized = text.trim();
  if (!normalized) return "";
  const cleaned = normalized
    .replace(/##\s*A+\s*Cinematic Game KV Quality Override/gi, "## Cinematic Game KV Quality Override")
    .replace(/\n*##\s*(?:Mandatory KV Composition Architecture Override|Cinematic Game KV Quality Override)[\s\S]*$/gi, "")
    .trim();
  return cleaned || normalized;
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
  const scheme = findSchemeForPromptMode(input.snapshot, input.mode, input.schemeId);
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

  const qualityDirection = formatModeQualityDirection(input.modeState, input.assets);
  if (qualityDirection) {
    sections.push(
      section({
        id: input.mode === "poster" ? "poster-quality" : "mode-quality",
        title: input.mode === "poster" ? "Poster Quality Bar" : "Mode Quality Bar",
        source: "mode",
        priority: 94,
        content: qualityDirection,
      }),
    );
  }

  const logoTextDirection = formatLogoTextDirection(input.modeState, input.assets);
  if (logoTextDirection) {
    sections.push(
      section({
        id: "logo-text-strategy",
        title: "Logo Text Strategy",
        source: "mode",
        locked: true,
        priority: 93,
        content: logoTextDirection,
      }),
    );
  }

  const modeSafetyDirection = formatModeSafetyDirection(input.modeState, input.assets);
  if (modeSafetyDirection) {
    sections.push(
      section({
        id: input.mode === "announcement" ? "announcement-copy-safety" : "collab-brand-safety",
        title: modeSafetyDirection.title,
        source: "mode",
        locked: true,
        priority: 93,
        content: modeSafetyDirection.content,
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
	        content: [
	          `${scheme.code}: ${scheme.title}`,
	          scheme.brief,
	          ...scheme.promptBlocks
	            .map((block) => {
	              const text = sanitizeSchemePromptBlockText(block.text);
	              return text ? `${block.title}: ${text}` : "";
	            })
	            .filter(Boolean),
	        ].join("\n"),
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
  return clampPromptLengthWithRequiredClosingBlock({
    body: sectionText,
    closingBlock: `## Mode Guardrails\n${hardRules}`,
  });
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

function clampPromptLength(prompt: string): string {
  if (prompt.length <= FINAL_PROMPT_MAX_CHARS) return prompt;
  const suffix = "\n\n## Prompt Trim Notice\nPrompt was compacted to fit the provider request limit. Keep the highest-priority sections and asset constraints above authoritative.";
  return `${trimPromptAtBoundary(prompt, FINAL_PROMPT_MAX_CHARS - suffix.length)}${suffix}`;
}

function clampPromptLengthWithRequiredClosingBlock(input: {
  body: string;
  closingBlock: string;
}): string {
  const prompt = `${input.body}\n\n${input.closingBlock}`;
  if (prompt.length <= FINAL_PROMPT_MAX_CHARS) return prompt;

  const notice = "\n\n## Prompt Trim Notice\nPrompt was compacted to fit the prompt package limit. Keep the highest-priority sections, asset constraints, and Mode Guardrails authoritative.";
  const closing = `\n\n${input.closingBlock}`;
  const bodyBudget = FINAL_PROMPT_MAX_CHARS - notice.length - closing.length;
  if (bodyBudget <= 0) return clampPromptLength(prompt);
  return `${trimPromptAtBoundary(input.body, bodyBudget)}${notice}${closing}`;
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
  const selectedScheme = parsed.target === "brief"
    ? null
    : findSchemeForPromptMode(parsed.snapshot, mode, parsed.schemeId || null);
  if (parsed.target === "image" && !selectedScheme) {
    throw new Error(`Image prompt packages require a ${mode} scheme.`);
  }
  const schemeId = parsed.target === "brief"
    ? parsed.schemeId || null
    : selectedScheme?.id || null;
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
    formatOutputSuiteStrategy(modeState, platform),
  ].filter(Boolean).join("\n");
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
