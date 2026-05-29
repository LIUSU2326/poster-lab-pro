import { z } from "zod";
import {
  PlatformPresetSchema,
  ProductionModeSchema,
  type ProductionMode,
  SloganLanguageSchema,
} from "../schema/zod";
import { getModeAssetSlots, getRequiredAssetSlots } from "../assets/slot-definitions";
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
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "data:";
  } catch {
    return false;
  }
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
  const roleIsRequired = getRequiredAssetSlots(mode).some((slot) => slot.role === asset.role);
  const url = asset.previewUrl || null;

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

function assetsForPromptMode(snapshot: WorkspaceSnapshot, mode: ProductionMode): StoredAssetRecord[] {
  const allowedRoles = new Set(getModeAssetSlots(mode).map((slot) => slot.role));
  return snapshot.assets.filter((asset) => asset.projectId === snapshot.project.id && allowedRoles.has(asset.role));
}

function createSlogans(snapshot: WorkspaceSnapshot, modeState: WorkspaceModeState, schemeId: string | null) {
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

  return scheme?.slogans?.[targetLanguage]
    ? { [targetLanguage]: scheme.slogans[targetLanguage] } as Partial<Record<SloganLanguage, string>>
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

function formatCharacters(snapshot: WorkspaceSnapshot, mode: ProductionMode): string {
  if (snapshot.characters.length === 0) return "No character profiles are configured.";
  if (mode === "collab") {
    return [
      "Use placeholders only during planning: [Game Character] and [Collab Partner].",
      "Appearance must come exclusively from uploaded reference assets.",
      `Locked reference asset ids: ${snapshot.characters.flatMap((item) => item.referenceAssetIds).join(", ")}.`,
    ].join("\n");
  }

  return snapshot.characters
    .map((character) => {
      const strength = Math.round(character.consistencyStrength * 100);
      return `${character.name}: lockAppearance=${character.lockAppearance}, consistency=${strength}%, references=${character.referenceAssetIds.join(", ")}.`;
    })
    .join("\n");
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
        return `- ${asset.label}: role=${asset.role}, binding=${asset.binding}, required=${asset.required}, ${urlState}, assetId=${asset.assetId}${placeholder}.`;
      })
    : ["- No mode-relevant assets are currently bound."];

  const characterAssets = assets.filter((asset) => asset.role === "gameCharacter");
  const collabAssets = assets.filter((asset) => asset.role === "collabCharacter");
  const multiCharacterRule = characterAssets.length > 1
    ? [
        "Multi-character rule: each gameCharacter asset is a separate independent character, not alternate images of one character.",
        "When the poster concept can support a group composition, include multiple uploaded game characters as distinct characters and preserve each one's appearance.",
        "Do not merge, average, or swap visual traits between separate character references.",
      ].join(" ")
    : "";
  const multiCollabRule = collabAssets.length > 1
    ? "Collab character rule: each collabCharacter asset is a separate independent partner character. Keep them distinct and never merge identities."
    : "";

  return [`Required slots: ${requiredText}.`, multiCharacterRule, multiCollabRule, ...assetLines].filter(Boolean).join("\n");
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
      const text = item.text.length > 1200 ? `${item.text.slice(0, 1200)}...` : item.text;
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
        `Focus guidance: ${input.modeState.projectBrief.focusGuidance || "not specified"}.`,
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
      content: formatCharacters(input.snapshot, input.mode),
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
  return `${sectionText}\n\n## Mode Guardrails\n${hardRules}`;
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
    const roleAssets = params.assets.filter((asset) => asset.role === slot.role);
    if (roleAssets.length === 0) {
      const issue = `Missing required asset: ${slot.label} (${slot.role}).`;
      if (params.target === "image") errors.push(issue);
      else warnings.push(issue);
      continue;
    }

    const hasProviderReadyReference = roleAssets.some((asset) => asset.providerReady);
    if (!hasProviderReadyReference) {
      const issue = `Required asset is not provider-ready: ${slot.label} (${slot.role}).`;
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
  const assets = assetsForPromptMode(parsed.snapshot, mode).map((asset) => createAssetBinding(asset, mode));
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
