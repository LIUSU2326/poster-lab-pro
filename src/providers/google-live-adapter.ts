import { z } from "zod";
import {
  assetFusionStrategy,
  assetSemanticInventory,
  assetSemanticRole,
  isPosterIntegratedReferenceAsset,
  modeAssetFusionDirective,
  posterAssetFusionStrategy,
  posterAssetReferenceName,
  posterAssetSemanticRole,
  type PosterAssetSemanticRole,
} from "../assets/semantic-roles";
import { ProviderConfigFormSchema, type ProviderConfigForm } from "../schema/zod";
import {
  BriefGenerationRequestSchema,
  ImageGenerationRequestSchema,
  ProviderBriefResponseSchema,
  ProviderHealthResponseSchema,
  ProviderImageResponseSchema,
  ProviderResultAssetSchema,
  createProviderError,
  type BriefGenerationRequest,
  type GenerationProviderAdapter,
  type ImageGenerationRequest,
  type ProviderBriefResponse,
  type ProviderConfigValidation,
  type ProviderHealthResponse,
  type ProviderImageResponse,
  type ProviderResult,
} from "./contracts";
import { getProviderManifest } from "./manifests";
import {
  posterCinematicKvQualityDirective,
  posterHeroPerformanceScaleLock,
  posterIdentitySafeMotionRule,
  posterLogoSingleUseLock,
  posterKvArchitectureBriefSlots,
  posterKvArchitectureDiversityRequirement,
  posterKvArchitectureDirective,
  posterKvArchitectureSlotSeed,
  posterKvAssetCountsFromAssets,
  posterKvBriefAugmentation,
  posterSchemeBlueprintRequirement,
  posterStaticSchemeLanguageBan,
  posterSubjectAccessoryStrictnessLock,
} from "./poster-kv-architectures";
import { sanitizePosterSchemeText } from "./poster-scheme-sanitizer";
import { imageRenderableSloganRule, integratedSloganTreatmentRule, normalizeImageRenderableSlogan } from "../prompts/slogan-policy";

const GOOGLE_PROVIDER_ID = "google" as const;
const DEFAULT_GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
export const GOOGLE_GENERATE_CONTENT_METHOD = "generateContent";
const GOOGLE_IMAGE_ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;
const SUPPORTED_SLOGAN_LANGUAGES = ["zh-CN", "en-US", "ja-JP", "ko-KR"] as const;

const GoogleInlineDataSchema = z
  .object({
    mimeType: z.string().min(1).optional(),
    mime_type: z.string().min(1).optional(),
    data: z.string().min(1).optional(),
  })
  .passthrough();

const GooglePartSchema = z
  .object({
    text: z.string().optional(),
    inlineData: GoogleInlineDataSchema.optional(),
    inline_data: GoogleInlineDataSchema.optional(),
  })
  .passthrough();

type GoogleRequestPart = z.infer<typeof GooglePartSchema>;

class ReferenceAssetError extends Error {
  constructor(
    readonly assetId: string,
    readonly url: string,
    reason: string,
  ) {
    super(`Reference asset ${assetId} could not be read from ${url}: ${reason}`);
    this.name = "ReferenceAssetError";
  }
}

export const GoogleGenerateContentResponseSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            content: z
              .object({
                parts: z.array(GooglePartSchema).default([]),
              })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

const GoogleBriefCompletionSchema = z.object({
  schemes: z.array(
    z.object({
      title: z.string().min(1),
      brief: z.string().min(1),
      prompt: z.string().min(1),
      promptZh: z.string().min(1).optional(),
      promptEn: z.string().min(1).optional(),
      slogans: z
        .partialRecord(z.enum(SUPPORTED_SLOGAN_LANGUAGES), z.string().min(1))
        .default({}),
    }),
  ).min(1),
});

export const GoogleImageTransportRequestSchema = z.object({
  url: z.string().url(),
  method: z.literal("POST"),
  headers: z.record(z.string(), z.string()),
  body: z.record(z.string(), z.unknown()),
});

export const GoogleImageTransportResponseSchema = z.object({
  ok: z.boolean(),
  status: z.number().int(),
  body: z.unknown(),
});

export type GoogleGenerateContentResponse = z.infer<typeof GoogleGenerateContentResponseSchema>;
export type GoogleImageTransportRequest = z.infer<typeof GoogleImageTransportRequestSchema>;
export type GoogleImageTransportResponse = z.infer<typeof GoogleImageTransportResponseSchema>;
export type GoogleImageTransport = (
  request: GoogleImageTransportRequest,
) => Promise<GoogleImageTransportResponse>;

export type GoogleLiveImageAdapterOptions = {
  transport?: GoogleImageTransport;
  now?: () => number;
};

function validateGoogleConfig(config: ProviderConfigForm): ProviderConfigValidation {
  const parsed = ProviderConfigFormSchema.parse(config);
  const missing: (keyof ProviderConfigForm)[] = [];
  const warnings: string[] = [];

  if (parsed.providerId !== GOOGLE_PROVIDER_ID) {
    warnings.push(`Config providerId ${parsed.providerId} does not match adapter ${GOOGLE_PROVIDER_ID}.`);
  }
  if (!parsed.enabled) missing.push("enabled");
  if (!parsed.apiKey?.trim()) missing.push("apiKey");
  if (!parsed.defaultModel?.trim()) missing.push("defaultModel");

  return {
    ok: missing.length === 0,
    missing,
    warnings,
  };
}

function normalizeBaseUrl(config: ProviderConfigForm): string {
  return (config.baseUrl?.trim() || DEFAULT_GOOGLE_BASE_URL).replace(/\/+$/, "");
}

function imageModel(request: ImageGenerationRequest, config: ProviderConfigForm): string {
  return normalizeGoogleImageModel(request.model || config.modelSlots.image || config.defaultModel || "gemini-3-pro-image-preview");
}

function briefModel(request: BriefGenerationRequest, config: ProviderConfigForm): string {
  const candidate = request.context.providerId === GOOGLE_PROVIDER_ID
    ? config.modelSlots.concept || config.defaultModel || "gemini-2.5-flash"
    : config.defaultModel || "gemini-2.5-flash";
  return candidate.includes("image") ? "gemini-2.5-flash" : candidate;
}

function briefModelCandidates(request: BriefGenerationRequest, config: ProviderConfigForm): string[] {
  const primary = briefModel(request, config);
  const candidates = [primary];
  if (primary !== "gemini-2.5-pro") candidates.push("gemini-2.5-pro");
  return Array.from(new Set(candidates));
}

function shouldTryNextBriefModel<T>(result: ProviderResult<T>): boolean {
  return !result.ok && result.error.code === "provider_unavailable" && result.error.retryable;
}

function normalizeGoogleImageModel(model: string): string {
  const value = model.trim();
  if (value === "gemini-3.1-flash-image-preview" || value === "gemini-3-flash-image-preview") {
    return "gemini-2.5-flash-image";
  }
  return value;
}

function isLogoCopySafeBlankWordmarkPrompt(prompt: string): boolean {
  return /COPY-SAFE BLANK WORDMARK ENFORCEMENT|copy-safe blank wordmark/i.test(prompt);
}

function imagePrompt(request: ImageGenerationRequest): string {
  const hasPosterMode = request.context.mode === "poster";
  const logoCopySafeBlankWordmark = request.context.mode === "logo" && isLogoCopySafeBlankWordmarkPrompt(request.prompt);
  const hasPosterReferenceAssets = hasPosterMode && request.assets.some((asset) => isPosterIntegratedReferenceAsset(asset));
  const assetInventory = request.assets.length ? assetSemanticInventory(request.assets, { mode: request.context.mode }) : "";
  const fusionDirective = modeAssetFusionDirective(request.context.mode, request.assets);
  const referenceIdentityInstruction = modeReferenceIdentityInstruction(request);
  const subjectAccessoryInstruction = modeSubjectAccessoryInstruction(request);
  const antagonistInstruction = modeSpecificAntagonistInstruction(request);
  const brandLogoInstruction = modeSpecificBrandLogoInstruction(request);
  const protagonistInstruction = modeSpecificProtagonistInstruction(request);
  const multiProtagonistInstruction = modeSpecificMultiProtagonistInstruction(request);
  const modeQualityInstruction = (() => {
    if (request.context.mode === "icon") {
      return [
        "Quality bar: premium game/app icon, one dominant subject silhouette, minimal background, crisp focal detail, strong value contrast, and 64px readability.",
        "Composition bar: perfect 1:1 square artwork that fills all four corners, full-bleed icon framing, no OS app-icon mask, no rounded black square/container, no empty corner padding, no text, no logo lettering, no captions, no UI copy, no poster scene complexity, no invented shield/weapon/tool/accessory.",
      ].join(" ");
    }
    if (request.context.mode === "logo") {
      return [
        "Quality bar: premium game logo/mark system, readable wordmark or emblem construction, crisp bevel/material finish, clean silhouette, and brand-safe typography.",
        "Composition bar: logo/wordmark is primary on a clean solid-color background when requested; props or characters may influence motifs but must not become a poster scene.",
        "Logo Text Strategy lock: follow the prompt's Logo Text Strategy section exactly. Render exact short wordmarks only when reliable; otherwise reserve a polished blank wordmark plate, emblem, badge, or mark system for later vector/text refinement.",
      ].join(" ");
    }
    if (request.context.mode === "announcement") {
      return [
        "Quality bar: readable in-game announcement or event visual with strong copy hierarchy, clean title/copy safe area, and polished UI/event art direction.",
        "Composition bar: uploaded subjects support the announcement surface without covering headline or key copy.",
        "Announcement Copy Safety Strategy lock: follow the prompt's safety strategy exactly. Reserve calm editable title/body copy-safe fields; if exact text is uncertain, leave polished blank fields instead of garbled operational text or pseudo-copy.",
      ].join(" ");
    }
    if (request.context.mode === "collab") {
      return [
        "Quality bar: premium collaboration campaign visual with two identities kept separate but unified by shared lighting, materials, scene, and interaction story.",
        "Composition bar: dual-character and dual-logo balance without merging identities, inventing partner brand names, or creating fake hybrid marks.",
        "Collab Brand Safety Strategy lock: if no partner brandLogo reference is uploaded, reserve a polished blank partner brand plate or neutral emblem and do not generate fake readable partner wording.",
      ].join(" ");
    }
    return [
      "Quality bar: premium game campaign key visual polish adapted to the active art style, with cinematic lighting, layered depth, refined materials, crisp focal detail, and strong silhouette hierarchy.",
      "Composition bar: one coherent story scene, one clear hero focal point, readable logo/slogan safe area, foreground-midground-background separation, and no sticker-collage feeling.",
    ].join(" ");
  })();
  const sizeInstruction = [
    `Target output: ${request.width}x${request.height}, aspect ratio ${request.aspectRatio}, platform ${request.platformPreset}.`,
    "The provider may return a native canvas size; compose for this crop target and keep important content inside safe margins.",
    modeQualityInstruction,
    request.aspectRatio === "9:16"
      ? "Compose as a tall mobile game poster, not a centered square flyer."
      : "Respect the requested platform crop and keep key text inside the safe area.",
  ].join(" ");
  const posterInstruction = hasPosterMode
      ? [
        "HIGHEST PRIORITY OVERRIDE FOR POSTER MODE:",
        "Generate the final integrated game campaign key visual as one coherent illustration, not a background plate for later sticker compositing.",
        "Default pipeline: AI integrated redraw. Use uploaded references as identity, semantic, brand, world, style, and composition inputs inside generation rather than planning a local paste-back step.",
        "Use uploaded character, antagonist/key subject, prop, environment, and logo references as binding visual anchors. Subjects may change pose, expression, action, camera angle, lighting, scale, and perspective to become vivid in-world actors or objects.",
        "Reference images are the source of truth and override any text implication. Text may only direct action, camera, staging, lighting, and environment; it must never redesign identity.",
        "If the plan prompt uses placeholders such as [Game Character 1], [Game Character 2], [Boss], or [Game Logo], those placeholders mean the uploaded image references. Do not invent their hair, face, clothes, body, logo lettering, or BOSS anatomy from text.",
        "Placeholder annotation rule: any written appearance, species, clothing, weapon, logo-lettering, color, or anatomy description attached to a placeholder is non-binding unless it is visibly present in the uploaded reference. Ignore conflicting or embellished placeholder descriptions.",
        "Preserve recognizable identity: face shape, hair colors, costume palette, body proportions, original tool/prop, line weight, BOSS silhouette, crown, eye, teeth, tongue, mouth, color blocks, and uploaded logo design.",
        "Do not age-up, masculinize/feminize, add beard/mustache, change hairstyle, change hair color, change costume, change species, change body scale, or replace a chibi/mascot reference with a generic adult character.",
        posterIdentitySafeMotionRule(),
        "Reference pose release: identity lock does not mean copying the exact uploaded front-facing/static pose. Repaint each uploaded hero/BOSS as a living actor with at least one visible performance change: 3/4 turn, stride, leap, recoil, attack wind-up, defensive block, grip/contact with a prop, landing dust, squash/stretch, or foreshortened limb/tool angle.",
        "BOSS performance lock: the uploaded BOSS/key threat must not read as a scaled-up sticker in the same standing pose. Stage it lunging, bracing, swinging, bursting through the set, landing with dust, or reacting to impact while preserving its silhouette and signature details.",
        posterHeroPerformanceScaleLock(),
        posterSubjectAccessoryStrictnessLock(),
        "Static scheme action rewrite: if selected scheme text says a character/BOSS stands, sits, is placed, is located, faces off, or simply presses in from one side, reinterpret that staging into an active trailer moment: sprint, leap, block, parry, swing, brace, slide, climb, land with dust, burst through a doorway/portal, collide with the set piece, or react to impact. Preserve uploaded identity, but do not preserve static standee staging.",
        "Do not give uploaded characters new weapons, armor, swords, shields, adult facial structures, noses, beards, mustaches, or costume variants unless those details are clearly present in the reference image.",
        "Blend the uploaded identities into the scene: environmental color grading, cinematic rim light, contact shadows, bounce light, atmospheric perspective, foreground occlusion, VFX overlap, and matching brush/line quality must remove any cutout or collage feeling.",
        "Contact and occlusion audit: every hero/BOSS foot, hand, weapon, or body part that touches a surface must create contact shadow, cast shadow, small occlusion, bounce color, and local material reaction. Avoid clean cutout edges floating over props or terrain.",
        "Style fidelity rule: if no explicit style reference is supplied, match the uploaded character art direction as a stylized 2D cartoon game world with rounded readable shapes, clean graphic silhouettes, soft cel/painterly shading, vibrant appetizing colors, and premium mobile-game key-art polish.",
        "Do not generate photorealistic pizza macro photography, realistic food commercial renders, stock-photo backgrounds, or a realistic 3D food surface unless the user explicitly selected a realistic style.",
        "Premium KV production rules:",
        "The poster must feel designed as a game marketing key visual: dramatic background, strong depth, directional light, expressive character acting, BOSS pressure, atmospheric effects, and a clear hero-vs-BOSS story moment.",
        "Breathtaking cinematic campaign brief: complex environmental storytelling, foreground elements framing the shot, dynamic character/BOSS interaction, volumetric haze, sparks, sauce/cheese trails, ingredient debris, rim-light pockets, and premium color grading.",
        "Cinematic escalation must come from the set piece: asymmetrical low-angle or forced-perspective camera, one dominant diagonal action path, practical light source, rim/back light, volumetric beams, dust/steam/ember/sauce particles, and visible environmental reaction. Never solve quality by redesigning the uploaded characters into different people.",
        "Use a deliberate campaign composition architecture, not a default side-scrolling scene. Favor one of these KV structures when it fits the scheme: diagonal split-world contrast, restaurant-window/portal breach, foreground hero weapon as divider, boss reveal framed by doorway/canyon, comic-panel mission montage, or triumphant hero-on-defeated-boss trophy shot.",
        "Stage character action and environment response together: dust trails, sauce splash arcs, cheese stretch trails, rim light, impact glow, flying ingredients, framing leaves, readable foreground platforms, and contact shadows.",
        "Subject scale and weight requirement: the uploaded BOSS/key threat must feel physically planted or forcefully airborne with a clear landing/impact path, not a mascot sticker. The uploaded hero must have a readable support surface, grip, impact point, or motion trail with a cast shadow.",
        "Use the full requested canvas as artwork. Do not add black bars, letterbox bands, white borders, frames, UI chrome, or presentation margins.",
        "Allocate one readable campaign-safe logo treatment when uploaded logo/brand references are present. Render the exact uploaded logo only when its letterforms can stay accurate; otherwise use a polished blank logo-safe sign/title plate that fits the scene and echoes brand colors/shape language; do not invent look-alike words, substitute letters, or create an alternate fake logo. Integrate the slogan as custom game-campaign lettering or an in-world sign/ribbon with correct spelling when possible; if spelling is uncertain, reserve a polished blank sign/ribbon/title plate instead of rendering garbled text.",
        posterLogoSingleUseLock(),
        integratedSloganTreatmentRule(),
        "Do not generate extra duplicate player characters, duplicate BOSS copies, alternate replacement heroes, or generic chef protagonists.",
        "Avoid a flat tabletop/food-surface wallpaper composition. If giant food is used, turn it into a stylized fantasy adventure battlefield with depth, horizon, foreground framing, playable terrain, and scale cues.",
        "For slogan text when a concrete slogan is listed in the prompt: do not silently omit the copy treatment. Either render the exact slogan as custom game-campaign lettering matching the logo style with outline, shadow, lighting, and perspective, or reserve a polished visible blank sign/ribbon/title plate for later copy if clean spelling cannot be guaranteed.",
      ].join("\n")
    : "";
  const assetInstruction = request.assets.length
      ? [
        "Provider asset constraints:",
        hasPosterMode
          ? "For poster mode, the reference images are binding identity and brand inputs. Use them visibly as integrated, living in-world poster subjects, not as unchanged pasted stickers."
          : "The reference images below are binding visual inputs, not loose inspiration. Use them according to the current mode's semantic duty and redraw/simplify them inside the generated result rather than pasting unchanged pixels.",
        hasPosterMode
          ? "Use each uploaded protagonist, antagonist/key subject, brand logo, prop, and environment reference according to its semantic duty. Keep identity consistent while changing pose, expression, action, lighting, scale, and perspective for a vivid KV moment. Do not create large/small duplicate copies."
          : "Use each uploaded asset once according to its role unless the mode explicitly asks for variants. Do not create duplicate large/small copies, alternate redraws, or sticker-like pasted versions of the same asset.",
        referenceIdentityInstruction,
        subjectAccessoryInstruction,
        fusionDirective,
        assetInventory ? `Uploaded asset semantic duties:\n${assetInventory}` : "",
        request.assets.some((asset) => assetSemanticRole(asset) === "styleReference")
          ? "A styleReference image is present. It has priority over selected style tags and character-derived style for rendering, palette, lighting, and finish."
          : "",
        ...request.assets.map((asset) => {
          const semanticRole = assetSemanticRole(asset);
          const parts = [
            `${asset.role}: ${asset.id}`,
            `semanticRole=${semanticRole}`,
            `fusion=${assetFusionStrategy(asset, { mode: request.context.mode })}`,
            asset.description,
            asset.url
              ? logoCopySafeBlankWordmark && semanticRole === "brandLogo"
                ? "referenceUrl=withheld for copy-safe blank wordmark mode; use non-text brand cues only"
                : `referenceUrl=${asset.url}`
              : "",
          ].filter(Boolean);
          return `- ${parts.join("; ")}`;
        }),
        "Do not invent details that conflict with locked character, logo, or brand references.",
        antagonistInstruction,
        brandLogoInstruction,
        multiProtagonistInstruction,
        protagonistInstruction,
      ].join("\n")
    : "";
  const negativeInstruction = request.negativePrompt?.trim()
    ? `Avoid: ${request.negativePrompt.trim()}`
    : "";
  const posterNegativeInstruction = hasPosterMode
    ? "Hard negative for integrated KV: duplicate uploaded asset, duplicate logo, duplicate BOSS, generic replacement hero, extra random chef protagonist, unchanged front-facing cutout look, sticker collage, flat tabletop wallpaper, photorealistic pizza macro photography, realistic food product render, stock photo background, black bars, letterbox, border frame."
    : "";

  return [
    posterInstruction,
    hasPosterMode ? posterReferenceMappingInstruction(request) : "",
    hasPosterMode
      ? posterKvArchitectureDirective({
        seed: `${request.context.traceId || request.context.jobId || request.schemeId}-${request.schemeId}`,
        assetCounts: posterKvAssetCountsFromAssets(request.assets),
        preferredText: request.prompt,
      })
      : "",
    request.prompt,
    hasPosterReferenceAssets
      ? "Final render rule: this must be a single finished KV illustration generated from the uploaded references, not a separate scene plate and not a local compositing target."
      : "",
    assetInstruction,
    sizeInstruction,
    posterNegativeInstruction,
    negativeInstruction,
  ].filter(Boolean).join("\n\n");
}

function protagonistCount(request: ImageGenerationRequest): number {
  return request.assets.filter((asset) => assetSemanticRole(asset) === "protagonist").length;
}

function hasSemanticRole(request: ImageGenerationRequest, role: ReturnType<typeof assetSemanticRole>): boolean {
  return request.assets.some((asset) => assetSemanticRole(asset) === role);
}

function modeReferenceIdentityInstruction(request: ImageGenerationRequest): string {
  if (request.assets.length === 0) return "";
  switch (request.context.mode) {
    case "icon":
      return "Icon reference lock: uploaded subject assets are identity/silhouette anchors for one simplified icon subject. Preserve recognizable colors, proportions, markings, and visible key props while redrawing into a bold small-size-readable icon form. No invented shield/weapon/tool/accessory, no copied static pose, and no text.";
    case "logo":
      return "Logo reference lock: uploaded visual assets are brand-continuity or motif references for a mark/wordmark system. Extract shape rhythm, color, material, and symbolic cues without turning the output into a character scene or poster. Use Logo Text Strategy rather than pseudo-letters.";
    case "announcement":
      return "Announcement reference lock: uploaded characters, subjects, logos, UI, and environments are supporting references around a readable announcement surface. Preserve identity where used, but keep the title/copy zone clear and follow Announcement Copy Safety Strategy.";
    case "collab":
      return "Collab reference lock: uploaded character and logo references remain separate identities. Preserve each side's recognizable silhouette, colors, styling, and brand cues while unifying them through scene lighting, material, and interaction. Follow Collab Brand Safety Strategy; do not invent partner brand names or fake sponsor wordmarks for any side that lacks an uploaded brandLogo.";
    case "poster":
    default:
      return [
        "Treat uploaded character images as locked model sheets for identity: face, hair, proportions, costume, colors, original tool/prop, line weight, and silhouette. The pose and expression should become more dynamic for the poster; do not preserve the exact same front-facing reference pose unless no other identity-safe pose is possible.",
        "Identity lock means no new facial hair, age shift, body-type shift, hairstyle swap, costume swap, or generic chef redesign. If a character reference is a small chibi/mascot, keep that exact chibi/mascot identity while only changing pose and expression.",
      ].join("\n");
  }
}

function modeSubjectAccessoryInstruction(request: ImageGenerationRequest): string {
  if (request.assets.length === 0 || request.context.mode === "poster") return "";
  return "Uploaded subject accessory lock: do not add new shields, weapons, armor, tools, costume parts, horns, crowns, props, facial features, facial hair, or signature accessories to uploaded characters, BOSS/key subjects, collab characters, or icon subjects unless those details are clearly visible in the reference. Express action through pose, camera, lighting, particles, environment, and existing visible props only.";
}

function modeSpecificMultiProtagonistInstruction(request: ImageGenerationRequest): string {
  if (protagonistCount(request) <= 1) return "";
  switch (request.context.mode) {
    case "icon":
      return "Multiple character references in icon mode are alternatives or style/identity cues; choose one dominant subject and do not make a crowded group icon.";
    case "logo":
      return "Multiple character references in logo mode are motif inputs only; do not turn the logo into a group character illustration.";
    case "announcement":
      return "Multiple character references in announcement mode may form a supporting cast around the copy-safe panel, but they must not cover the title/copy area.";
    case "collab":
      return "Multiple character references in collab mode are separate identities; keep them distinct and never merge, average, or swap visual traits.";
    case "poster":
    default:
      return "Multiple gameCharacter references are separate characters. Include them as distinct characters when the composition supports a group poster; do not merge their appearances.";
  }
}

function modeSpecificAntagonistInstruction(request: ImageGenerationRequest): string {
  if (!hasSemanticRole(request, "antagonist")) return "";
  switch (request.context.mode) {
    case "icon":
      return "Antagonist icon rule: if the uploaded BOSS/key subject is the icon subject, simplify it into one bold creature/item silhouette with high contrast and no surrounding battle scene.";
    case "logo":
      return "Antagonist logo rule: use uploaded BOSS/key subject traits only as symbolic motifs in the mark; do not render a full scene or character illustration behind the wordmark.";
    case "announcement":
      return "Antagonist announcement rule: use uploaded BOSS/key subject only as an event cue or supporting art element around the copy-safe panel, never as a threat that covers the announcement text.";
    case "collab":
      return "Antagonist collab rule: if an antagonist/key subject appears, keep it as a separate participant or shared-world cue; do not merge it with either collaboration identity.";
    case "poster":
    default:
      return "A BOSS/key subject reference is present. Include it as a visible antagonist or key creature while preserving its uploaded silhouette, crown, mouth, eye, teeth, tongue, and color blocks rather than replacing it with a generic monster.";
  }
}

function modeSpecificBrandLogoInstruction(request: ImageGenerationRequest): string {
  const hasBrandLogo = hasSemanticRole(request, "brandLogo");
  if (request.context.mode === "collab" && !hasBrandLogo) {
    return "Brand collab rule: no uploaded partner brandLogo is present. Do not invent partner brand names, fake sponsor logos, fake brand slogans, or readable partner wordmarks; reserve a polished blank partner brand plate, neutral emblem, or copy-safe lockup area instead.";
  }
  if (!hasBrandLogo) return "";
  switch (request.context.mode) {
    case "icon":
      return "Brand icon rule: uploaded logos may guide colors, symbol shape, or brand energy, but icon mode must not render logo lettering, captions, or readable text.";
    case "logo":
      return "Brand logo rule: uploaded logos guide wordmark rhythm, colors, silhouette, spacing, material finish, and brand continuity. Follow Logo Text Strategy exactly. In copy-safe blank wordmark mode, do not render readable letters, uploaded-logo text, project-title fragments, partial words, pseudo-letters, slogans, or decorative fake typography; use a polished blank wordmark plate, emblem, badge, or mark system.";
    case "announcement":
      return "Brand announcement rule: use uploaded logos as clean small lockups or reserved brand-safe areas. Do not create fake replacement logo text or repeated watermark patterns.";
    case "collab":
      return "Brand collab rule: keep each uploaded logo/brand identity separate and readable within one unified scene; do not fuse two logos into one fake hybrid mark, and do not invent partner brand names or fake sponsor slogans for missing logo slots.";
    case "poster":
    default:
      return "A gameLogo reference is present. Allocate one readable logo-safe treatment. Use the exact uploaded logo/wordmark only if letterforms can stay accurate; otherwise leave a polished blank logo-safe plate/sign. Do not redraw a different logo, invent look-alike words, substitute letters, or add a second logo.";
  }
}

function modeSpecificProtagonistInstruction(request: ImageGenerationRequest): string {
  if (!hasSemanticRole(request, "protagonist")) return "";
  switch (request.context.mode) {
    case "icon":
      return "Icon subject roster lock: when a gameCharacter reference is used, it should become the single main icon subject or be omitted in favor of a stronger selected subject; do not add extra characters.";
    case "logo":
      return "Logo character rule: uploaded characters may influence mascot/brand-world motifs only if they support the mark; do not let character art dominate the wordmark.";
    case "announcement":
      return "Announcement character rule: uploaded characters may act as presenters or supporting cast around the copy-safe panel; do not add random extra cast or cover the headline.";
    case "collab":
      return "Collab character roster lock: visible characters must come from uploaded gameCharacter/collabCharacter references and remain distinct; do not add generic replacements or merge traits.";
    case "poster":
    default:
      return "Character roster lock: visible hero/player characters must come from uploaded gameCharacter references only. Do not add generic chef heroes, random human mascots, or replacement player characters.";
  }
}

function posterReferenceMappingInstruction(request: ImageGenerationRequest): string {
  const semanticGroups = request.assets.reduce((groups, asset) => {
    const semanticRole = posterAssetSemanticRole(asset);
    groups.set(semanticRole, [...(groups.get(semanticRole) || []), asset]);
    return groups;
  }, new Map<PosterAssetSemanticRole, ImageGenerationRequest["assets"]>());
  const characters = semanticGroups.get("protagonist") || [];
  const bosses = semanticGroups.get("antagonist") || [];
  const logos = semanticGroups.get("brandLogo") || [];
  const props = semanticGroups.get("prop") || [];
  const environments = semanticGroups.get("environment") || [];
  const lines: string[] = [];

  if (characters.length > 0) {
    const names = characters.map((asset, index) => posterAssetReferenceName(asset, index + 1)).join(", ");
    lines.push(
      `Exact playable roster: render exactly ${characters.length} uploaded protagonist reference${characters.length > 1 ? "s" : ""}: ${names}.`,
      "Do not add any other human, chef, mascot, helper, teammate, or replacement protagonist. If the scheme says chef squad/team/heroes, reinterpret it as only the uploaded roster above.",
      characters.length === 1
        ? "Single-character lock: only [Game Character 1] may appear as the playable hero."
        : "Multi-character lock: keep each uploaded character separate; never merge, average, recolor, or swap traits between them.",
    );
  }

  if (bosses.length > 0) {
    lines.push(`Antagonist mapping: ${bosses.map((asset, index) => posterAssetReferenceName(asset, index + 1)).join(", ")} means uploaded BOSS/key-subject reference(s). Render each as a dominant in-world threat, preserving silhouette and key features while allowing scale, attack/recoil/lunge pose, lighting, and environmental interaction; do not keep the exact static standing pose if a readable identity-safe action pose is possible.`);
  }

  if (logos.length > 0) {
    lines.push(
      `Logo mapping: ${logos.map((asset, index) => posterAssetReferenceName(asset, index + 1)).join(", ")} means uploaded logo/brand image(s). Place each once in a campaign-safe area, without redrawing a different wordmark.`,
      "Do not wrap the logo in an oversized wooden sign or banner unless the scheme specifically asks for that object; keep the logo readable but secondary to the character-vs-BOSS story moment.",
    );
  }

  if (props.length > 0) {
    lines.push(`Prop mapping: ${props.map((asset, index) => posterAssetReferenceName(asset, index + 1)).join(", ")} are story objects. They may be held, used, foregrounded, chased, defended, or turned into action triggers instead of floating beside the poster.`);
  }

  if (environments.length > 0) {
    lines.push(`Environment mapping: ${environments.map((asset, index) => posterAssetReferenceName(asset, index + 1)).join(", ")} should inform the world, terrain, material, lighting mood, and set-piece design rather than being copied as a flat background.`);
  }

  return lines.length > 0 ? ["[EXACT REFERENCE ROLE MAP]", ...lines].join("\n") : "";
}

function parseDataUrl(url: string): { mimeType: string; data: string } | null {
  const match = url.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) return null;
  return {
    mimeType: match[1] || "image/png",
    data: match[2] || "",
  };
}

function isLocalReferenceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname)
      && parsed.pathname.includes("/uploads/");
  } catch {
    return false;
  }
}

function isExampleReferenceUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "example.com";
  } catch {
    return /example\.com/i.test(url);
  }
}

function shouldFetchInlineReferenceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) && !isExampleReferenceUrl(url);
  } catch {
    return false;
  }
}

async function inlineDataFromAsset(asset: ImageGenerationRequest["assets"][number] | BriefGenerationRequest["assets"][number]) {
  const url = asset.url || "";
  if (!url) return null;
  const dataUrl = parseDataUrl(url);
  if (dataUrl?.data) return dataUrl;
  const localReference = isLocalReferenceUrl(url);
  if (!shouldFetchInlineReferenceUrl(url) || typeof globalThis.fetch !== "function") return null;

  try {
    const response = await globalThis.fetch(url);
    if (!response.ok) {
      throw new ReferenceAssetError(asset.id, url, `HTTP ${response.status}`);
    }
    const mimeType = response.headers.get("content-type") || asset.mimeType || "image/png";
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 1) {
      throw new ReferenceAssetError(asset.id, url, "empty image response");
    }
    return {
      mimeType,
      data: Buffer.from(bytes).toString("base64"),
    };
  } catch (error) {
    if (!localReference) return null;
    if (error instanceof ReferenceAssetError) throw error;
    throw new ReferenceAssetError(asset.id, url, error instanceof Error ? error.message : "fetch failed");
  }
}

function referenceAssetResult<T>(error: unknown): ProviderResult<T> | null {
  if (!(error instanceof ReferenceAssetError)) return null;
  return {
    ok: false,
    error: createProviderError(GOOGLE_PROVIDER_ID, "invalid_request", error.message, {
      userMessage: "上传素材的视觉参考图无法读取或内联，已停止生成，避免模型在没有参考图的情况下重新发挥。请重新上传缺失素材后再生成。",
    }),
  };
}

function assetInlineReferenceRequired(
  asset: ImageGenerationRequest["assets"][number] | BriefGenerationRequest["assets"][number],
  options: { requireInlineIntegratedReferences?: boolean },
): boolean {
  if (!options.requireInlineIntegratedReferences || !isPosterIntegratedReferenceAsset(asset)) return false;
  if (asset.url) return true;
  return /\brequired\b|providerReady=true/i.test(asset.description || "");
}

async function referencePartsForAssets(
  assets: ImageGenerationRequest["assets"] | BriefGenerationRequest["assets"],
  options: {
    mode?: ImageGenerationRequest["context"]["mode"] | BriefGenerationRequest["context"]["mode"];
    scenePlateOnly?: boolean;
    requireInlineIntegratedReferences?: boolean;
    withholdLogoTextReferences?: boolean;
  } = {},
): Promise<GoogleRequestPart[]> {
  const parts: GoogleRequestPart[] = [];
  const roleCounters = new Map<string, number>();
  for (const asset of assets) {
    const skipInlineForScenePlate = Boolean(options.scenePlateOnly && isPosterIntegratedReferenceAsset(asset));
    const withholdLogoTextReference = Boolean(
      options.withholdLogoTextReferences &&
        options.mode === "logo" &&
        posterAssetSemanticRole(asset) === "brandLogo",
    );
    const referenceLabel = withholdLogoTextReference
      ? "[BRAND MOTIF REFERENCE WITHHELD FOR COPY-SAFE LOGO TEXT: the uploaded logo image contains readable lettering, so it is not sent as an inline visual reference. Use only non-text brand cues described in the prompt: colors, silhouette rhythm, material style, plate shape, spacing, and emblem motifs. Do not render readable letters.]"
      : skipInlineForScenePlate
        ? scenePlateReferenceLabelForAsset(asset, roleCounters)
        : referenceLabelForAsset(asset, roleCounters, options.mode);
    parts.push({
      text: [
        referenceLabel,
        `Reference asset ${asset.role}: ${asset.id}.`,
        asset.description || "",
        withholdLogoTextReference
          ? "Inline image intentionally withheld to prevent copied, partial, or pseudo-readable wordmark text in copy-safe blank Logo mode."
          : skipInlineForScenePlate
            ? "Use this asset only as a role placeholder for empty staging and later local compositing. Do not render it, do not invent a substitute, and do not render labels or placeholder words for it."
            : asset.url
              ? options.mode === "logo" && posterAssetSemanticRole(asset) === "brandLogo"
                ? "The following inline image is a non-text brand reference for colors, silhouette, layout rhythm, bevel/material style, and emblem motifs. Follow Logo Text Strategy; do not copy readable letters unless an exact short wordmark is explicitly requested."
                : "The following inline image is a binding visual/model-sheet/brand reference for this exact semantic role, not loose inspiration. Redraw it naturally into the scene when its role requires visible use."
              : "",
      ].filter(Boolean).join(" "),
    });
    if (withholdLogoTextReference) continue;
    if (skipInlineForScenePlate) continue;
    const inlineData = await inlineDataFromAsset(asset);
    if (inlineData?.data) {
      parts.push({ inlineData });
    } else if (assetInlineReferenceRequired(asset, options)) {
      throw new ReferenceAssetError(
        asset.id,
        asset.url || "(missing reference URL)",
        "inline image data unavailable for integrated redraw",
      );
    }
  }
  return parts;
}

function scenePlateReferenceLabelForAsset(
  asset: ImageGenerationRequest["assets"][number] | BriefGenerationRequest["assets"][number],
  roleCounters: Map<string, number>,
): string {
  const semanticRole = posterAssetSemanticRole(asset);
  const nextIndex = (roleCounters.get(semanticRole) || 0) + 1;
  roleCounters.set(semanticRole, nextIndex);
  const referenceName = posterAssetReferenceName(asset, nextIndex);
  if (semanticRole === "protagonist") {
    return `[SCENE PLATE PLACEHOLDER ONLY: ${referenceName} will be composited later from the uploaded file. Do not draw any human, chef, mascot, body, face, silhouette, shadow silhouette, or substitute for this placeholder.]`;
  }
  if (semanticRole === "antagonist") {
    return `[SCENE PLATE PLACEHOLDER ONLY: ${referenceName} will be composited later from the uploaded file. Do not draw any monster, creature, face, eye, mouth, teeth, silhouette, shadow silhouette, or substitute for this placeholder.]`;
  }
  if (semanticRole === "brandLogo") {
    return `[SCENE PLATE PLACEHOLDER ONLY: ${referenceName} will be composited later from the uploaded file. Do not draw any logo, logo-like shape, title, sign, label, text, letters, or placeholder words such as GAME LOGO.]`;
  }
  if (semanticRole === "styleReference") {
    return "[VISUAL REFERENCE: target art style, palette, lighting, brush/line quality]";
  }
  if (semanticRole === "compositionReference") {
    return "[VISUAL REFERENCE: target layout/composition only]";
  }
  return `[SCENE PLATE PLACEHOLDER ONLY: ${referenceName} informs later local compositing or fallback staging. Do not draw a finished copy or placeholder label.]`;
}

function referenceLabelForAsset(
  asset: ImageGenerationRequest["assets"][number] | BriefGenerationRequest["assets"][number],
  roleCounters: Map<string, number>,
  mode?: ImageGenerationRequest["context"]["mode"] | BriefGenerationRequest["context"]["mode"],
): string {
  const semanticRole = posterAssetSemanticRole(asset);
  const nextIndex = (roleCounters.get(semanticRole) || 0) + 1;
  roleCounters.set(semanticRole, nextIndex);
  const referenceName = posterAssetReferenceName(asset, nextIndex);
  if (semanticRole === "protagonist") {
    return `[CRITICAL VISUAL REFERENCE: this image defines ${referenceName}. Copy the exact identity: visible hair color, face, costume, body proportions, original tool/prop, line weight, chibi/mascot scale, and absence/presence of facial hair. You may change pose, expression, action, camera angle, lighting, and scene integration only when identity remains recognizable.]`;
  }
  if (semanticRole === "antagonist") {
    return `[CRITICAL VISUAL REFERENCE: this image defines ${referenceName}. Copy the exact antagonist/BOSS identity: silhouette, face/marking details, mouth, eyes, teeth, crown/horns/tools, color blocks, and graphic line quality. You may change pose, scale, attack motion, lighting, and scene integration.]`;
  }
  if (semanticRole === "brandLogo") {
    if (mode === "logo") {
      return `[BRAND MOTIF REFERENCE: ${referenceName} supplies color palette, silhouette rhythm, material finish, spacing, and emblem/plate styling. Follow Logo Text Strategy. In copy-safe blank wordmark mode, do NOT render readable letters, copied logo text, pseudo-letters, project-title fragments, or any subset of the uploaded wordmark.]`;
    }
    return `[CRITICAL LOGO REFERENCE: exact appearance of ${referenceName}. Include this uploaded logo/wordmark once, integrated into the campaign art without inventing a replacement.]`;
  }
  if (semanticRole === "prop") {
    return `[VISUAL REFERENCE: this image defines ${referenceName}. Preserve recognizable shape, colors, markings, and material cues; redraw it as a story prop that is used, held, foregrounded, chased, or activated inside the scene.]`;
  }
  if (semanticRole === "environment") {
    return `[VISUAL REFERENCE: this image defines ${referenceName}. Use it for world, location, terrain, mood, materials, and lighting cues; reinterpret it into the poster set piece rather than copying a flat background.]`;
  }
  if (semanticRole === "keySubject") {
    return `[CRITICAL VISUAL REFERENCE: this image defines ${referenceName}. Preserve the key subject identity, silhouette, colors, and face/marking details while redrawing it with scene lighting, contact, perspective, and interaction.]`;
  }
  if (semanticRole === "styleReference") {
    return "[VISUAL REFERENCE: target art style, palette, lighting, brush/line quality]";
  }
  if (semanticRole === "compositionReference") {
    return "[VISUAL REFERENCE: target layout/composition only]";
  }
  return `[VISUAL REFERENCE: ${referenceName}. ${posterAssetFusionStrategy(asset)}.]`;
}

async function imagePromptParts(request: ImageGenerationRequest): Promise<GoogleRequestPart[]> {
  const isPosterWithReferences = request.context.mode === "poster" && request.assets.some((asset) =>
    isPosterIntegratedReferenceAsset(asset),
  );
  const scenePlateOnly = request.context.mode === "poster" && /Identity-Safe Game Campaign KV Plate|SCENE PLATE only/i.test(request.prompt);
  const withholdLogoTextReferences = request.context.mode === "logo" && isLogoCopySafeBlankWordmarkPrompt(request.prompt);
  const referenceParts = await referencePartsForAssets(request.assets, {
    mode: request.context.mode,
    scenePlateOnly,
    requireInlineIntegratedReferences: isPosterWithReferences && !scenePlateOnly,
    withholdLogoTextReferences,
  });
  const finalPlateRule = isPosterWithReferences && scenePlateOnly
    ? [
      "[ABSOLUTE HIGHEST PRIORITY - IDENTITY-SAFE PLATE]",
      "Generate only the cinematic scene plate: environment, lighting, atmosphere, action trails, impact zones, foreground occlusion, particles, and empty staging pockets.",
      "The plate must contain ZERO visible people, chefs, mascots, monsters, BOSS faces, playable characters, logo marks, signs, labels, or typography. The locked subjects will be composited afterward from the original uploaded files.",
      "If the prompt mentions [Game Character 1], [Game Character 2], [Boss], [Game Logo], or any uploaded subject placeholder, convert them into empty light pools, impact marks, contact-shadow pads, action trails, foreground occlusion, and safe-area staging. Do not draw bodies, faces, monster forms, logo letters, shadow silhouettes, placeholder silhouettes, or placeholder text.",
      "No text of any kind: no GAME LOGO words, no fake title, no fake logo, no label, no signboard, no banner text, no watermark, no UI panel, no blank wooden plaque.",
      "Leave believable light pools, contact-shadow zones, foreground occlusion, and VFX paths where the uploaded subjects can be integrated later.",
    ].join("\n")
    : "";
  const finalIdentityRule = isPosterWithReferences && !scenePlateOnly
    ? [
      "[ABSOLUTE HIGHEST PRIORITY - REFERENCE IDENTITY, SEMANTIC DUTY & BLENDING]",
      "You MUST use the provided inline visual references according to their semantic duties while redrawing them into one coherent final poster.",
      "For identity/subject references, replicate recognizable visual identity while changing pose, expression, camera angle, action, scale, and lighting as needed for the poster.",
      "The visual references above override the written scene prompt below. If the prompt says chef, hero, warrior, or squad, interpret those words as actions/roles for the uploaded references only, never as permission to create a new person.",
      "Placeholder annotation rule: any written appearance, species, clothing, weapon, logo-lettering, color, or anatomy description attached to a placeholder is non-binding unless it is visibly present in the uploaded reference. Ignore conflicting or embellished placeholder descriptions.",
      "Do not add beard/mustache, change hair color, change hairstyle, change costume, age-up the character, alter chibi proportions, or replace any reference with a generic adult chef.",
      posterIdentitySafeMotionRule(),
      "Do not invent new weapons, armor, shields, facial features, facial hair, adult proportions, or costume variants unless those details are visible in the uploaded reference.",
      posterSubjectAccessoryStrictnessLock(),
      request.assets.some((asset) => posterAssetSemanticRole(asset) === "protagonist")
        ? "Every uploaded playable protagonist that appears must have a readable face and expression in front view, 3/4 front view, or strong profile. Do not render any uploaded playable character only from the back, hidden, tiny, or visually subordinate to the environment."
        : "",
      request.assets.some((asset) => posterAssetSemanticRole(asset) === "protagonist")
        ? posterHeroPerformanceScaleLock()
        : "",
      request.assets.some((asset) => posterAssetSemanticRole(asset) === "antagonist")
        ? "The uploaded antagonist/BOSS must feel like the scene threat: preserve its identity but give it weight, scale, attack intent, contact shadows, atmosphere, debris, and environmental reaction."
        : "",
      request.assets.some((asset) => posterAssetSemanticRole(asset) === "brandLogo")
        ? `The uploaded logo/wordmark must not become a fake replacement. Render the exact uploaded logo only when its letterforms can stay accurate. Otherwise integrate one polished blank logo-safe sign/title plate, neon, carved plate, flag, UI emblem, or title lockup that echoes the brand colors/shape language without fake text. ${posterLogoSingleUseLock()}`
        : "",
      request.assets.some((asset) => posterAssetSemanticRole(asset) === "prop")
        ? "Uploaded props/items should become action objects: held, used, foregrounded, defended, chased, or triggering the story beat."
        : "",
      "DO NOT alter core design, invent new character features, replace the BOSS, redraw a different logo, or leave references as pasted cutouts.",
      "DO deeply integrate visible subjects into the new scene's lighting: environmental color grading, rim light, contact shadows, bounce lighting, atmospheric perspective, foreground occlusion, material contact, and VFX overlap must make them feel physically present.",
      "Failure to match reference identities while making them feel alive inside the scene is unacceptable.",
    ].join("\n")
    : "";
  const finalGenericFusionRule = !isPosterWithReferences && request.assets.length > 0
    ? [
      "[REFERENCE FUSION RULE]",
      modeAssetFusionDirective(request.context.mode, request.assets),
      "The inline visual references above override loose text guesses. Preserve each reference according to its semantic duty while adapting it to the current mode's visual goal.",
      request.context.mode === "icon"
        ? "Icon mode requires clean full-canvas 1:1 square artwork, one dominant subject, ABSOLUTELY NO TEXT, no OS app-icon mask or rounded black container, no invented shield/weapon/tool/accessory, minimal background detail, high contrast, and 64px readability."
        : "",
      request.context.mode === "logo"
        ? "Logo mode requires wordmark/mark system clarity. Follow Logo Text Strategy exactly. If the strategy is copy-safe blank, render no readable letters or project-title fragments; use a polished blank wordmark plate, emblem, badge, or mark system. Do not turn the result into a cinematic scene and do not invent fake replacement lettering or pseudo-letters for uploaded logo references."
        : "",
      modeSubjectAccessoryInstruction(request),
      modeSpecificBrandLogoInstruction(request),
    ].filter(Boolean).join("\n")
    : "";
  return [
    ...referenceParts,
    { text: imagePrompt(request) },
    ...(finalPlateRule ? [{ text: finalPlateRule }] : []),
    ...(finalIdentityRule ? [{ text: finalIdentityRule }] : []),
    ...(finalGenericFusionRule ? [{ text: finalGenericFusionRule }] : []),
  ];
}

function briefAssetInventory(request: BriefGenerationRequest) {
  return request.assets.map((asset) => ({
    role: asset.role,
    semanticRole: posterAssetSemanticRole(asset),
    id: asset.id,
    description: asset.description || "",
    mimeType: asset.mimeType,
    hasUrl: Boolean(asset.url),
    fusionStrategy: posterAssetFusionStrategy(asset),
  }));
}

function modeBriefTask(mode: BriefGenerationRequest["context"]["mode"]): string {
  switch (mode) {
    case "icon":
      return "Generate icon design schemes for batch image generation. This is not poster or KV planning.";
    case "logo":
      return "Generate logo and brand mark design schemes for batch image generation. This is not poster or scene planning.";
    case "announcement":
      return "Generate announcement visual design schemes for batch image generation. This is not poster or cinematic KV planning.";
    case "collab":
      return "Generate collaboration campaign visual schemes for batch image generation. Keep partner identities separate. This is not generic poster KV planning.";
    default:
      return "Generate mode-specific design schemes for batch image generation. This is not poster KV planning.";
  }
}

function modeBriefIdentityRule(mode: BriefGenerationRequest["context"]["mode"]): string {
  switch (mode) {
    case "icon":
      return "Icon reference planning: choose one dominant uploaded subject or brand motif as the icon subject, preserve its identity/silhouette/colors as a reference, and redraw/simplify it into one clean icon form.";
    case "logo":
      return "Logo reference planning: uploaded logos are brand references, not prompts for fake replacement words. Preserve brand shape language and letterform rhythm only when spelling can stay accurate.";
    case "announcement":
      return "Announcement reference planning: uploaded characters, props, and logos support a readable event/update panel. They must not steal priority from the announcement copy-safe area.";
    case "collab":
      return "Collab reference planning: each uploaded character, logo, and partner asset remains a separate identity. Do not merge two brands, characters, or logos into one hybrid.";
    default:
      return "Mode reference planning: preserve each uploaded asset according to semanticRole and redraw it naturally for this mode.";
  }
}

function modeBriefRules(mode: BriefGenerationRequest["context"]["mode"], targetLanguage: string): string[] {
  const shared = [
    "Generate NEW random schemes for this mode only.",
    "Do not mention KV composition templates, poster architecture slots, poster key visual, cinematic poster scene, or poster slogan placement unless mode is poster.",
    "For every uploaded asset, infer semantic duty from semanticRole, original role, label, and description. Do not write logic as if only gameCharacter, prop, and gameLogo can matter.",
    "Use placeholders such as [Game Character 1], [Boss], [Game Logo], [Prop 1], [Collab Character 1], or [Key Subject 1] instead of describing exact hair, face, clothing, anatomy, or logo lettering.",
    modeBriefIdentityRule(mode),
    "Respect creativeDirection, selected style tags, output size, reference analysis, and prompt constraints.",
    "Every scheme must have a unique title, unique visual direction, and unique image prompt without reusing a sentence template.",
  ];

  if (mode === "icon") {
    return [
      ...shared,
      "Icon mode hard lock: 1:1 square, one single dominant subject, no text, no logo lettering, no captions, no poster scene, no multi-character battle, no OS app icon rounded mask, no black rounded container, no empty corner padding.",
      "Icon prompt must prioritize bold silhouette, simple readable shape, high contrast, minimal background detail, full-bleed square corners, crisp focal detail, and 64px readability.",
      "If several uploaded assets exist, choose one best subject or brand motif for each scheme instead of crowding them together.",
      "slogans must be an empty object for icon mode.",
    ];
  }

  if (mode === "logo") {
    return [
      ...shared,
      "Logo mode hard lock: design a logo, symbol, badge, wordmark, or title lockup. Do not create a cinematic scene, character battle, poster background, environmental set piece, or campaign slogan art.",
      "Logo Text Strategy: use exact provided brand text only when it can stay readable; otherwise create a polished blank wordmark plate, emblem, symbol, or lettering-safe construction without pseudo-letters.",
      "When planning a copy-safe blank wordmark plate, do not place the project name, uploaded-logo letters, partial title words, readable alphabet letters, or pseudo-letters in image prompts. Refer to the brand only as an uploaded brand reference or reserved blank wordmark area.",
      "Uploaded logo references guide brand color, silhouette, rhythm, and finish. Do not generate a fake replacement logo or look-alike gibberish.",
      "slogans must be an empty object for logo mode.",
    ];
  }

  if (mode === "announcement") {
    return [
      ...shared,
      "Announcement mode hard lock: readable update/event graphic first, with a calm copy-safe panel or UI surface. Do not turn it into a battle poster or movie KV.",
      "Characters and props may frame, point to, or lightly interact with the panel, but they must not cover the headline/copy area.",
      "If exact announcement text cannot be rendered cleanly, plan polished blank fields or title plates instead of fake text or pseudo-letters.",
      imageRenderableSloganRule(targetLanguage),
      "If slogans are returned, keep one short exact announcement-style title only; avoid generic hype copy and avoid long paragraphs.",
    ];
  }

  return [
    ...shared,
    "Collab mode hard lock: show a collaboration relationship with two distinct sides, separate character identities, and separate logo/brand zones unified by one scene or graphic system.",
    "Do not merge both sides into one hybrid character, one hybrid logo, or one fake partner brand. Use a blank partner brand plate when partner text cannot stay accurate.",
    "The relationship should be readable through interaction, exchange, handoff, rivalry, invitation, split-stage, or shared prop/event design.",
    imageRenderableSloganRule(targetLanguage),
    "If slogans are returned, keep them short and tied to the collaboration interaction rather than poster hype.",
  ];
}

function modeBriefOutputShape(mode: BriefGenerationRequest["context"]["mode"], targetLanguage: string) {
  const slogans = mode === "icon" || mode === "logo" ? {} : { [targetLanguage]: "short mode-specific line or title" };
  return {
    schemes: [
      {
        title: mode === "icon" ? "Chinese icon scheme title" : "Chinese mode-specific scheme title",
        brief: "Chinese visual direction and layout plan for this mode",
        prompt: "Image prompt suitable for the selected image model and this mode",
        promptZh: "Chinese image-generation prompt",
        promptEn: "English image-generation prompt",
        slogans,
      },
    ],
  };
}

function modeBriefPrompt(request: BriefGenerationRequest): string {
  const targetLanguage = request.languageTargets[0] || "en-US";
  const randomizationSeed = request.context.traceId || request.context.jobId || `${Date.now()}`;
  const mode = request.context.mode;

  return [
    "You are a senior game creative production director.",
    "Return JSON only. Do not use markdown.",
    "This request is mode-specific. Do not inherit poster/KV architecture rules unless mode is poster.",
    "Do not plan pasted overlays. Uploaded assets are identity, brand, style, composition, or subject references that should be redrawn naturally according to the current mode.",
    modeBriefIdentityRule(mode),
    JSON.stringify({
      task: modeBriefTask(mode),
      mode,
      projectName: request.projectName,
      gameDescription: request.gameDescription,
      focusGuidance: request.focusGuidance || "",
      creativeDirection: request.creativeDirection || "",
      guardrails: request.guardrails,
      languageTargets: request.languageTargets,
      schemeCount: request.schemeCount,
      randomizationSeed,
      assets: briefAssetInventory(request),
      rules: modeBriefRules(mode, targetLanguage),
      outputShape: modeBriefOutputShape(mode, targetLanguage),
    }),
  ].join("\n\n");
}

function briefPrompt(request: BriefGenerationRequest): string {
  if (request.context.mode !== "poster") return modeBriefPrompt(request);
  const targetLanguage = request.languageTargets[0] || "en-US";
  const randomizationSeed = request.context.traceId || request.context.jobId || `${Date.now()}`;
  const assets = briefAssetInventory(request);

  return [
    "You are a senior game marketing art director.",
    "Generate NEW poster design schemes for batch image generation.",
    "Return JSON only. Do not use markdown.",
    JSON.stringify({
      projectName: request.projectName,
      gameDescription: request.gameDescription,
      focusGuidance: request.focusGuidance || "",
      creativeDirection: request.creativeDirection || "",
      guardrails: request.guardrails,
      languageTargets: request.languageTargets,
      schemeCount: request.schemeCount,
      randomizationSeed,
      requiredKvArchitectureSlots: posterKvArchitectureBriefSlots(request.schemeCount, randomizationSeed),
      assets,
      rules: [
        "Assign the requiredKvArchitectureSlots in order: scheme 1 uses slot 1, scheme 2 uses slot 2, and so on. The slot is mandatory and must be visible in both brief and image prompt.",
        "Treat focusGuidance as a soft creative emphasis, not a literal mandatory scene. It must never override requiredKvArchitectureSlots, uploaded asset identity, story clarity, or KV quality.",
        "If focusGuidance mentions giant pizza, giant food, micro perspective, or scale, reinterpret it as scale drama/camera energy and vary the scene architecture. Do not default every scheme to a flat pizza-floor battlefield.",
        "Every scheme brief must include a concrete shot blueprint: foreground framing, uploaded hero performance, BOSS pressure, world context, logo/copy safe area, and camera angle.",
        "Every scheme brief must include a production design blueprint: camera height/lens feel/perspective, foreground-midground-background layers, key/fill/rim lighting, volumetric haze, particles/VFX, cast/contact shadows, color/value grouping, material texture, and typography/logo integration.",
        posterSchemeBlueprintRequirement(),
        "For every uploaded asset, infer semantic duty from semanticRole, original role, label, and description. Do not write logic as if only gameCharacter, prop, and gameLogo can matter.",
        "Asset duty examples: protagonist assets carry identity/performance; antagonist assets carry threat/scale; brandLogo assets stay readable and scene-integrated; prop assets become used story objects; environment assets guide world design; styleReference controls rendering; compositionReference controls layout only.",
        posterCinematicKvQualityDirective(),
        "Every image prompt must carry that production design forward as explicit image instructions, not as a generic one-sentence scene description.",
        "Every scheme must stage a memorable physical set piece: restaurant interior, oven portal, cliffs, tunnels, kitchen counter battlefield, doorway breach, market/VIP pressure, or wilderness route. Avoid empty pastel sky, generic food-field backdrop, and centered mascot-ad composition.",
        "At least one uploaded hero must physically interact with the BOSS or environment: blocking, climbing, striking, sliding, cooking, pulling, defending, or causing visible impact. Do not place heroes as symmetrical floating stickers around a central BOSS.",
        "Every image prompt must include a KV quality self-check: one-second readability, strong thumbnail silhouette, obvious story conflict, layered depth, directional lighting, and no cheap sticker collage.",
        "Each scheme must be meaningfully different in composition, visual hook, and campaign angle.",
        "Each scheme must target premium game key art / campaign key visual polish while respecting the active uploaded or selected art style.",
        "Plan one coherent story scene with one clear focal hierarchy, layered depth, cinematic lighting, polished color grading, and campaign-ready logo/slogan safe areas.",
        "Every scheme must explicitly use its assigned high-impact KV composition architecture. Do not substitute a generic tiny-heroes-on-pizza-landscape concept unless the assigned slot itself asks for giant food terrain.",
        posterKvArchitectureDiversityRequirement(),
        "Use divergent story-composition archetypes across the batch, such as boss encounter, kitchen siege, ingredient heist, wilderness chase, restaurant defense, portal discovery, victory feast, caravan expedition, VIP demand versus ingredient hunt, or staff-training-to-boss-fight contrast.",
        "Do not default to a simple horizontal scene with heroes standing left and right on a pizza surface. Giant food can be used only when it creates scale drama, foreground framing, vertical layers, danger, and a clear story beat.",
        "Every scheme must have a unique title, unique visual direction, unique image prompt, unique camera angle, and unique story moment. Do not reuse the same sentence template across schemes.",
        "Do not plan duplicate large/small copies of the same uploaded character, BOSS, or logo. Each uploaded visual identity should appear once unless the brief explicitly asks for repeats.",
        "Avoid flat sticker collage, cheap clip-art composition, floating elements, tabletop food wallpaper, generic extra mascots, and random replacement characters.",
        "When protagonist/gameCharacter assets are present, visible hero/player characters must come from those uploaded references only. Do not invent extra chef heroes or generic human mascots.",
        "If only one protagonist/gameCharacter asset is present, plan exactly one playable hero. Do not write chef squad, team, allies, or multiple heroes unless multiple protagonist assets are listed.",
        "Do not write a scheme where uploaded playable characters are only back-facing, hidden, tiny, or looking away. Their faces, expressions, body language, and signature props must be readable in front view, 3/4 front view, or strong profile.",
        posterHeroPerformanceScaleLock(),
        posterSubjectAccessoryStrictnessLock(),
        posterStaticSchemeLanguageBan(),
        "For image prompts with uploaded identity, subject, BOSS, prop, or logo references, do NOT describe their exact physical appearance, clothing, gender, skin color, hair, logo lettering, or anatomy. Use placeholders such as [Game Character 1], [Boss], [Game Logo], [Prop 1], or [Key Subject 1], and describe only semantic duty, action, power effects, camera, composition, and environment interaction.",
        "If a placeholder needs a role noun, use generic role language only. Do not attach descriptive appearance clauses to placeholders; the image reference, not the generated brief text, defines identity and visual details.",
        "When describing a placeholder's action, do not name a specific uploaded tool, weapon, costume, face, or body feature in text. Say the placeholder uses its uploaded signature prop/tool only if visible in the reference, and let the image reference define what that prop/tool is.",
        "Never ask the image model to add age, beard, mustache, hairstyle changes, costume changes, body-type changes, or generic chef/person redesigns to uploaded characters.",
        "For every gameCharacter prompt, include that the placeholder must preserve the uploaded reference identity/model sheet, but do not spell out physical details.",
        "For every BOSS/key-subject prompt, include that the [Boss] placeholder preserves the uploaded BOSS silhouette and key identity from its reference, but do not redesign it.",
        "For logo, slogan, or headline text, prefer exact uploaded logo letterforms or custom game-campaign lettering integrated into the scene only when clean spelling is possible. If logo or slogan spelling cannot be preserved, require a polished blank logo/copy-safe sign, title plate, or ribbon in the intended area. Never request fake logo text, look-alike words, silent copy omission, or plain overlay/PPT typography.",
        posterLogoSingleUseLock(),
        imageRenderableSloganRule(targetLanguage),
        "The slogan phrase must be derived from the assigned scheme's story beat, action verb, threat, prop, or set-piece material, so it feels written for that exact KV rather than pasted in later. Avoid generic three-part lists; prefer concrete copy such as a knife/oven/portal/impact/BOSS-action phrase when those elements define the scheme.",
        integratedSloganTreatmentRule(),
        "If a richer campaign line is needed, put that sentence in brief/prompt only; the slogans field must stay short enough to render cleanly inside one poster image.",
        "Do not assume a logo exists unless an asset with semanticRole brandLogo is present.",
        "If no image assets are provided, create concepts from the project description only.",
        "If multiple assets share a semantic role, each one is an independent reference unless explicitly described as an alternate view. Use multiple characters/props when the composition supports it, without merging or averaging appearances.",
        `Return exactly one slogan language: ${targetLanguage}.`,
        "Keep prompts suitable for game marketing posters.",
        "Respect creativeDirection for selected styles, output sizes, composition/reference analysis, and prompt constraints.",
      ],
      outputShape: {
        schemes: [
          {
            title: "Chinese poster scheme title",
            brief: "Chinese visual direction and layout plan",
            prompt: "Image prompt suitable for the selected image model",
              promptZh: "Chinese image-generation prompt",
              promptEn: "English image-generation prompt",
              slogans: {
                [targetLanguage]: "scene-derived 2-6 word image-renderable slogan",
              },
            },
        ],
      },
    }),
  ].join("\n\n");
}

async function briefPromptParts(request: BriefGenerationRequest): Promise<GoogleRequestPart[]> {
  return [
    { text: briefPrompt(request) },
    ...await referencePartsForAssets(request.assets, {
      mode: request.context.mode,
      withholdLogoTextReferences: request.context.mode === "logo",
    }),
  ];
}

function googleAspectRatio(request: ImageGenerationRequest): typeof GOOGLE_IMAGE_ASPECT_RATIOS[number] {
  if ((GOOGLE_IMAGE_ASPECT_RATIOS as readonly string[]).includes(request.aspectRatio)) {
    return request.aspectRatio as typeof GOOGLE_IMAGE_ASPECT_RATIOS[number];
  }

  const ratio = request.width / request.height;
  const candidates = GOOGLE_IMAGE_ASPECT_RATIOS.map((value) => {
    const [width = 1, height = 1] = value.split(":").map(Number);
    return {
      value,
      distance: Math.abs(ratio - width / height),
    };
  });
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.value || "1:1";
}

function googleImageGenerationConfig(model: string, request: ImageGenerationRequest): Record<string, unknown> {
  return {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: {
      aspectRatio: googleAspectRatio(request),
    },
  };
}

function googleBriefGenerationConfig(): Record<string, unknown> {
  return {
    temperature: 0.85,
    responseMimeType: "application/json",
  };
}

function dimensionsFromPng(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!pngSignature.every((value, index) => bytes[index] === value)) return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function dimensionsFromJpeg(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1] ?? 0;
    const segmentLength = bytes.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null;
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame && offset + 8 < bytes.length) {
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function dimensionsFromInlineData(input: {
  mimeType: string;
  data: string;
  fallback: { width: number; height: number };
}): { width: number; height: number } {
  try {
    const bytes = Buffer.from(input.data, "base64");
    const normalizedMimeType = input.mimeType.toLowerCase();
    const dimensions =
      normalizedMimeType.includes("png")
        ? dimensionsFromPng(bytes)
        : normalizedMimeType.includes("jpeg") || normalizedMimeType.includes("jpg")
          ? dimensionsFromJpeg(bytes)
          : dimensionsFromPng(bytes) || dimensionsFromJpeg(bytes);
    return dimensions || input.fallback;
  } catch {
    return input.fallback;
  }
}

function missingConfigResult<T>(config: ProviderConfigForm): ProviderResult<T> {
  const validation = validateGoogleConfig(config);
  const hasMissingApiKey = validation.missing.includes("apiKey");

  return {
    ok: false,
    error: createProviderError(
      GOOGLE_PROVIDER_ID,
      hasMissingApiKey ? "auth_failed" : "missing_config",
      `Google live adapter is missing configuration: ${validation.missing.join(", ")}`,
      {
        userMessage: hasMissingApiKey
          ? "Google AI Studio API key is required before live generation."
          : "Google provider configuration is incomplete.",
      },
    ),
  };
}

function unavailableTransportResult<T>(): ProviderResult<T> {
  return {
    ok: false,
    error: createProviderError(
      GOOGLE_PROVIDER_ID,
      "provider_unavailable",
      "Google live adapter requires an injected HTTP transport before network execution.",
      {
        userMessage: "Google live execution is not connected in this environment.",
      },
    ),
  };
}

function providerErrorFromStatus<T>(status: number, body: unknown): ProviderResult<T> {
  const parsedError = z
    .object({
      error: z
        .object({
          message: z.string().optional(),
          status: z.string().optional(),
          code: z.union([z.string(), z.number()]).optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .safeParse(body);
  const providerMessage = parsedError.success ? parsedError.data.error?.message : undefined;
  const message = providerMessage || `Google image generation failed with HTTP ${status}.`;

  if (status <= 0) {
    return {
      ok: false,
      error: createProviderError(GOOGLE_PROVIDER_ID, "provider_unavailable", message, {
        retryable: true,
        userMessage: "Google network request failed. Check proxy, VPN, or provider connectivity.",
      }),
    };
  }

  if (status === 401 || status === 403) {
    return {
      ok: false,
      error: createProviderError(GOOGLE_PROVIDER_ID, "auth_failed", message, {
        userMessage: "Google authentication failed. Check the API key and model access.",
      }),
    };
  }

  if (status === 429) {
    return {
      ok: false,
      error: createProviderError(GOOGLE_PROVIDER_ID, "rate_limited", message, {
        retryable: true,
        userMessage: "Google rate limit was reached. Retry after the provider limit resets.",
      }),
    };
  }

  if (status === 402) {
    return {
      ok: false,
      error: createProviderError(GOOGLE_PROVIDER_ID, "quota_exceeded", message, {
        userMessage: "Google billing or quota is unavailable for this account.",
      }),
    };
  }

  if (status >= 500) {
    return {
      ok: false,
      error: createProviderError(GOOGLE_PROVIDER_ID, "provider_unavailable", message, {
        retryable: true,
        userMessage: "Google is temporarily unavailable. Retry later.",
      }),
    };
  }

  return {
    ok: false,
    error: createProviderError(GOOGLE_PROVIDER_ID, "invalid_request", message, {
      userMessage: "Google rejected the image generation request.",
    }),
  };
}

function extractInlineImages(input: {
  request: ImageGenerationRequest;
  model: string;
  body: unknown;
}): Array<z.infer<typeof ProviderResultAssetSchema>> {
  const parsed = GoogleGenerateContentResponseSchema.safeParse(input.body);
  if (!parsed.success) return [];

  return parsed.data.candidates
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part, index) => {
      const inlineData = part.inlineData || part.inline_data;
      if (!inlineData?.data) return null;
      const mimeType = inlineData.mimeType || inlineData.mime_type || "image/png";
      const dimensions = dimensionsFromInlineData({
        mimeType,
        data: inlineData.data,
        fallback: {
          width: input.request.width,
          height: input.request.height,
        },
      });
      return ProviderResultAssetSchema.parse({
        id: `google-${input.request.context.traceId || input.request.context.jobId || input.request.schemeId}-${index + 1}`,
        mimeType,
        width: dimensions.width,
        height: dimensions.height,
        dataUrl: `data:${mimeType};base64,${inlineData.data}`,
        seed: input.model,
      });
    })
    .filter((asset): asset is z.infer<typeof ProviderResultAssetSchema> => asset !== null);
}

function extractText(body: unknown): string {
  const parsed = GoogleGenerateContentResponseSchema.safeParse(body);
  if (!parsed.success) return "";
  return parsed.data.candidates
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizeBriefScheme(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const title = firstString(record, ["title", "schemeTitle", "scheme_title", "posterTitle", "conceptTitle", "name", "方案标题", "标题"]);
  const brief = firstString(record, [
    "brief",
    "visualDirection",
    "visual_direction",
    "direction",
    "layoutPlan",
    "layout",
    "description",
    "concept",
    "artDirection",
    "shotBlueprint",
    "视觉方向",
    "方案说明",
  ]);
  const prompt = firstString(record, [
    "prompt",
    "imagePrompt",
    "image_prompt",
    "generationPrompt",
    "imageGenerationPrompt",
    "finalPrompt",
    "promptZh",
    "promptEn",
    "生图提示词",
    "中文提示词",
  ]);
  const slogan = firstString(record, ["slogan", "tagline", "headline", "copy", "宣传词"]);
  const slogans = record.slogans && typeof record.slogans === "object"
    ? record.slogans
    : slogan
      ? { "en-US": slogan }
      : {};

  if (!title && !brief && !prompt) return value;
  return {
    ...record,
    title: title || brief?.slice(0, 80) || "海报设计方案",
    brief: brief || title || "AI generated poster visual direction.",
    prompt: prompt || brief || title || "Premium game campaign key visual.",
    promptZh: firstString(record, ["promptZh", "中文提示词"]) || prompt || brief,
    promptEn: firstString(record, ["promptEn", "English Prompt", "englishPrompt"]) || prompt || brief,
    slogans,
  };
}

function isSchemeLikeArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.some((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return Boolean(firstString(record, [
      "title",
      "schemeTitle",
      "scheme_title",
      "posterTitle",
      "conceptTitle",
      "brief",
      "visualDirection",
      "visual_direction",
      "prompt",
      "imagePrompt",
      "image_prompt",
      "generationPrompt",
      "方案标题",
      "视觉方向",
      "生图提示词",
    ]));
  });
}

function coerceBriefCompletion(value: unknown): unknown {
  if (Array.isArray(value)) return { schemes: value.map(normalizeBriefScheme) };
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  for (const key of ["schemes", "posterSchemes", "poster_schemes", "plans", "concepts", "items", "results"]) {
    if (Array.isArray(record[key])) return { schemes: record[key].map(normalizeBriefScheme) };
  }

  for (const nestedKey of ["data", "result", "output"]) {
    const nested = record[nestedKey];
    if (nested && typeof nested === "object") {
      const coerced = coerceBriefCompletion(nested);
      if (coerced && typeof coerced === "object" && Array.isArray((coerced as Record<string, unknown>).schemes)) {
        return coerced;
      }
    }
  }

  const singleScheme = normalizeBriefScheme(record);
  if (singleScheme && typeof singleScheme === "object") {
    const schemeRecord = singleScheme as Record<string, unknown>;
    if (
      typeof schemeRecord.title === "string" &&
      typeof schemeRecord.brief === "string" &&
      typeof schemeRecord.prompt === "string"
    ) {
      return { schemes: [singleScheme] };
    }
  }

  const firstObjectArray = Object.values(record).find(isSchemeLikeArray);
  return firstObjectArray ? { schemes: firstObjectArray.map(normalizeBriefScheme) } : value;
}

function parseBriefText(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  return GoogleBriefCompletionSchema.parse(coerceBriefCompletion(JSON.parse(fenced || trimmed)));
}

function normalizePosterBriefSchemes(parsed: z.infer<typeof GoogleBriefCompletionSchema>, request: BriefGenerationRequest) {
  const targetLanguage = request.languageTargets[0] || "en-US";
  const seed = request.context.traceId || request.context.jobId || `${Date.now()}`;
  return parsed.schemes.slice(0, request.schemeCount).map((scheme, index) => {
    const title = sanitizePosterSchemeText(scheme.title) || scheme.title;
    const brief = sanitizePosterSchemeText(scheme.brief) || scheme.brief;
    const prompt = sanitizePosterSchemeText(scheme.prompt) || scheme.prompt;
    const promptZh = sanitizePosterSchemeText(scheme.promptZh || scheme.prompt) || prompt;
    const promptEn = sanitizePosterSchemeText(scheme.promptEn || scheme.prompt) || prompt;
    const architectureSeed = posterKvArchitectureSlotSeed(seed, index);
    const architectureBrief = posterKvBriefAugmentation(architectureSeed);
    const architecturePrompt = posterKvArchitectureDirective({
      seed: architectureSeed,
      assetCounts: posterKvAssetCountsFromAssets(request.assets),
    });
    const cinematicBrief = "电影级强化：方案必须具备明确镜头语言、主光/逆光/体积光、粒子/VFX、前中后景纵深、可读角色表演、环境 set-piece 和一个可被理解的故事瞬间。";
    return {
      title,
      brief: `${architectureBrief}\n${cinematicBrief}\n${brief}`.slice(0, 1800),
      prompt: `${prompt}\n\n${architecturePrompt}`.slice(0, 12000),
      promptZh: `${promptZh}\n\n${architecturePrompt}`.slice(0, 12000),
      promptEn: `${promptEn}\n\n${architecturePrompt}`.slice(0, 12000),
      slogans: Object.fromEntries(
        SUPPORTED_SLOGAN_LANGUAGES
          .filter((language) => language === targetLanguage && scheme.slogans[language])
          .flatMap((language) => {
            const slogan = scheme.slogans[language];
            if (!slogan) return [];
            const normalized = normalizeImageRenderableSlogan({
              slogan,
              language,
              brandTerms: [request.projectName],
              contextText: [
                title,
                brief,
                prompt,
                promptZh,
                promptEn,
              ].join("\n"),
            });
            return normalized ? [[language, normalized] as const] : [];
          }),
      ),
    };
  });
}

function modeQualityLock(mode: BriefGenerationRequest["context"]["mode"]): { brief: string; prompt: string } {
  switch (mode) {
    case "icon":
      return {
        brief: "Icon 模式锁定：1:1 方形、单一主主体、无文字、无海报/KV 场景、低背景复杂度、全画布方角、64px 仍可读。",
        prompt: "ICON MODE ONLY: create a premium 1:1 game/app icon, one single dominant subject, absolutely no text or logo lettering, no poster scene, no multi-character battle, no rounded app-mask/container, full-bleed sharp square corners, minimal background, high contrast, readable at 64px.",
      };
    case "logo":
      return {
        brief: "Logo 模式锁定：标识/徽章/字标优先，不做电影场景或海报，不生成乱码假字。",
        prompt: "LOGO MODE ONLY: create a brand logo, symbol, badge, wordmark, or title lockup, not a poster or cinematic scene. If the wordmark is copy-safe blank, render no readable letters, uploaded-logo text, project-title fragments, partial words, slogans, or pseudo-letters; use a polished blank wordmark plate, emblem, badge, or mark system.",
      };
    case "announcement":
      return {
        brief: "Announcement 模式锁定：信息安全区和公告面板优先，角色/道具只做引导或氛围，不抢文案区域。",
        prompt: "ANNOUNCEMENT MODE ONLY: create a readable announcement/update graphic with a calm copy-safe panel or UI surface, no fake text, no battle-poster staging, characters and props only support or frame the message area.",
      };
    case "collab":
      return {
        brief: "Collab 模式锁定：双方角色/Logo 独立但统一场景，不融合成一个角色或假 Logo。",
        prompt: "COLLAB MODE ONLY: create a collaboration visual with separate identities and brand zones unified by one interaction or graphic system, no hybrid character, no hybrid/fake logo, use blank partner brand plates when text cannot be exact.",
      };
    default:
      return {
        brief: "模式锁定：按当前模式目标生成，不继承海报 KV 架构。",
        prompt: "MODE-SPECIFIC OUTPUT ONLY: follow the current mode target and do not turn this into a poster/KV composition.",
      };
  }
}

function sanitizeNonPosterModeText(text: string, mode: BriefGenerationRequest["context"]["mode"]): string {
  const replacement = mode === "icon"
    ? "game icon"
    : mode === "logo"
      ? "brand logo"
      : mode === "announcement"
        ? "announcement visual"
        : "collaboration visual";
  return text
    .replace(/KV构图母版[:：]?/gi, "")
    .replace(/requiredKvArchitectureSlots/gi, "modeSpecificPlanning")
    .replace(/高完成度游戏主视觉海报/g, replacement)
    .replace(/游戏主视觉海报/g, replacement)
    .replace(/game marketing poster/gi, replacement)
    .replace(/premium game key art poster/gi, replacement)
    .replace(/poster key visual/gi, replacement)
    .replace(/cinematic key visual/gi, replacement)
    .replace(/\bKV\b/g, replacement);
}

function normalizeModeBriefSchemes(parsed: z.infer<typeof GoogleBriefCompletionSchema>, request: BriefGenerationRequest) {
  const targetLanguage = request.languageTargets[0] || "en-US";
  const mode = request.context.mode;
  const qualityLock = modeQualityLock(mode);
  return parsed.schemes.slice(0, request.schemeCount).map((scheme) => {
    const title = sanitizeNonPosterModeText(scheme.title, mode) || scheme.title;
    const brief = sanitizeNonPosterModeText(scheme.brief, mode) || scheme.brief;
    const prompt = sanitizeNonPosterModeText(scheme.prompt, mode) || scheme.prompt;
    const promptZh = sanitizeNonPosterModeText(scheme.promptZh || scheme.prompt, mode) || prompt;
    const promptEn = sanitizeNonPosterModeText(scheme.promptEn || scheme.prompt, mode) || prompt;
    const slogans = mode === "icon" || mode === "logo"
      ? {}
      : Object.fromEntries(
        SUPPORTED_SLOGAN_LANGUAGES
          .filter((language) => language === targetLanguage && scheme.slogans[language])
          .flatMap((language) => {
            const slogan = scheme.slogans[language];
            if (!slogan) return [];
            const normalized = normalizeImageRenderableSlogan({
              slogan,
              language,
              brandTerms: [request.projectName],
              contextText: [
                title,
                brief,
                prompt,
                promptZh,
                promptEn,
              ].join("\n"),
            });
            return normalized ? [[language, normalized] as const] : [];
          }),
      );
    return {
      title,
      brief: `${qualityLock.brief}\n${brief}`.slice(0, 1800),
      prompt: `${qualityLock.prompt}\n\n${prompt}`.slice(0, 12000),
      promptZh: `${qualityLock.prompt}\n\n${promptZh}`.slice(0, 12000),
      promptEn: `${qualityLock.prompt}\n\n${promptEn}`.slice(0, 12000),
      slogans,
    };
  });
}

function normalizeBriefSchemes(parsed: z.infer<typeof GoogleBriefCompletionSchema>, request: BriefGenerationRequest) {
  if (request.context.mode === "poster") return normalizePosterBriefSchemes(parsed, request);
  return normalizeModeBriefSchemes(parsed, request);
}

function parseBriefResponse(
  request: BriefGenerationRequest,
  model: string,
  body: unknown,
  elapsedMs: number,
): ProviderResult<ProviderBriefResponse> {
  try {
    const text = extractText(body);
    if (!text) {
      return {
        ok: false,
        error: createProviderError(GOOGLE_PROVIDER_ID, "invalid_request", "Google brief response did not include text.", {
          userMessage: "Google returned no usable poster scheme text.",
        }),
      };
    }
    const parsed = parseBriefText(text);
    return {
      ok: true,
      value: ProviderBriefResponseSchema.parse({
        providerId: GOOGLE_PROVIDER_ID,
        model,
        schemes: normalizeBriefSchemes(parsed, request),
        usage: {
          promptTokens: 0,
          elapsedMs,
        },
      }),
    };
  } catch (error) {
    return {
      ok: false,
      error: createProviderError(GOOGLE_PROVIDER_ID, "unknown", error instanceof Error ? error.message : "Invalid brief response.", {
        userMessage: "Google returned a poster scheme format that could not be parsed.",
      }),
    };
  }
}

function parseImageResponse(
  request: ImageGenerationRequest,
  model: string,
  body: unknown,
  elapsedMs: number,
): ProviderResult<ProviderImageResponse> {
  const assets = extractInlineImages({ request, model, body });
  if (assets.length === 0) {
    return {
      ok: false,
      error: createProviderError(
        GOOGLE_PROVIDER_ID,
        "invalid_request",
        "Google image response did not include inline image data.",
        {
          userMessage: "Google returned no usable image asset.",
        },
      ),
    };
  }

  return {
    ok: true,
    value: ProviderImageResponseSchema.parse({
      providerId: GOOGLE_PROVIDER_ID,
      model,
      assets,
      usage: {
        imageCount: assets.length,
        elapsedMs,
      },
    }),
  };
}

export function createGoogleImageFetchTransport(fetchImpl: typeof fetch): GoogleImageTransport {
  return async (request) => {
    const parsed = GoogleImageTransportRequestSchema.parse(request);
    let response: Response;
    try {
      response = await fetchImpl(parsed.url, {
        method: parsed.method,
        headers: parsed.headers,
        body: JSON.stringify(parsed.body),
      });
    } catch (error) {
      return GoogleImageTransportResponseSchema.parse({
        ok: false,
        status: 0,
        body: {
          error: {
            message: error instanceof Error ? error.message : "Google network request failed.",
          },
        },
      });
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    return GoogleImageTransportResponseSchema.parse({
      ok: response.ok,
      status: response.status,
      body,
    });
  };
}

export function createGoogleLiveImageAdapter(options: GoogleLiveImageAdapterOptions = {}): GenerationProviderAdapter {
  const manifest = getProviderManifest(GOOGLE_PROVIDER_ID);
  const now = options.now || Date.now;

  return {
    manifest,

    validateConfig(config) {
      return validateGoogleConfig(config);
    },

    async healthCheck(config): Promise<ProviderResult<ProviderHealthResponse>> {
      const validation = validateGoogleConfig(config);
      if (!validation.ok) {
        return {
          ok: true,
          value: ProviderHealthResponseSchema.parse({
            providerId: GOOGLE_PROVIDER_ID,
            ok: false,
            status: "not_configured",
            message: `Google live adapter is missing configuration: ${validation.missing.join(", ")}`,
          }),
        };
      }

      return {
        ok: true,
        value: ProviderHealthResponseSchema.parse({
          providerId: GOOGLE_PROVIDER_ID,
          ok: Boolean(options.transport),
          status: options.transport ? "ready" : "unavailable",
          message: options.transport
            ? "Google live adapter is configured with an injected transport."
            : "Google live adapter is configured but has no injected transport.",
        }),
      };
    },

    async generateBrief(request: BriefGenerationRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderBriefResponse>> {
      const parsedRequest = BriefGenerationRequestSchema.parse(request);
      const parsedConfig = ProviderConfigFormSchema.parse(config);
      const validation = validateGoogleConfig(parsedConfig);
      if (!validation.ok) return missingConfigResult(parsedConfig);
      if (!options.transport) return unavailableTransportResult();

      const startedAt = now();
      let parts: GoogleRequestPart[];
      try {
        parts = await briefPromptParts(parsedRequest);
      } catch (error) {
        const assetError = referenceAssetResult<ProviderBriefResponse>(error);
        if (assetError) return assetError;
        throw error;
      }

      let fallbackError: ProviderResult<ProviderBriefResponse> | null = null;
      for (const model of briefModelCandidates(parsedRequest, parsedConfig)) {
        const transportResponse = await options.transport(
          GoogleImageTransportRequestSchema.parse({
            url: `${normalizeBaseUrl(parsedConfig)}/models/${encodeURIComponent(model)}:${GOOGLE_GENERATE_CONTENT_METHOD}`,
            method: "POST",
            headers: {
              "x-goog-api-key": parsedConfig.apiKey,
              "Content-Type": "application/json",
            },
            body: {
              contents: [
                {
                  parts,
                },
              ],
              generationConfig: googleBriefGenerationConfig(),
            },
          }),
        );
        const parsedTransportResponse = GoogleImageTransportResponseSchema.parse(transportResponse);

        if (!parsedTransportResponse.ok) {
          const statusResult = providerErrorFromStatus<ProviderBriefResponse>(
            parsedTransportResponse.status,
            parsedTransportResponse.body,
          );
          fallbackError = statusResult;
          if (shouldTryNextBriefModel(statusResult)) continue;
          return statusResult;
        }

        return parseBriefResponse(parsedRequest, model, parsedTransportResponse.body, Math.max(0, now() - startedAt));
      }

      return fallbackError || providerErrorFromStatus<ProviderBriefResponse>(0, {
        error: { message: "Google brief generation failed before any model returned a response." },
      });
    },

    async generateImage(request: ImageGenerationRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderImageResponse>> {
      const parsedRequest = ImageGenerationRequestSchema.parse(request);
      const parsedConfig = ProviderConfigFormSchema.parse(config);
      const validation = validateGoogleConfig(parsedConfig);
      if (!validation.ok) return missingConfigResult(parsedConfig);
      if (!options.transport) return unavailableTransportResult();

      const model = imageModel(parsedRequest, parsedConfig);
      const startedAt = now();
      let parts: GoogleRequestPart[];
      try {
        parts = await imagePromptParts(parsedRequest);
      } catch (error) {
        const assetError = referenceAssetResult<ProviderImageResponse>(error);
        if (assetError) return assetError;
        throw error;
      }
      const transportResponse = await options.transport(
        GoogleImageTransportRequestSchema.parse({
          url: `${normalizeBaseUrl(parsedConfig)}/models/${encodeURIComponent(model)}:${GOOGLE_GENERATE_CONTENT_METHOD}`,
          method: "POST",
          headers: {
            "x-goog-api-key": parsedConfig.apiKey,
            "Content-Type": "application/json",
          },
          body: {
            contents: [
              {
                parts,
              },
            ],
            generationConfig: googleImageGenerationConfig(model, parsedRequest),
          },
        }),
      );
      const parsedTransportResponse = GoogleImageTransportResponseSchema.parse(transportResponse);

      if (!parsedTransportResponse.ok) {
        return providerErrorFromStatus(parsedTransportResponse.status, parsedTransportResponse.body);
      }

      return parseImageResponse(parsedRequest, model, parsedTransportResponse.body, Math.max(0, now() - startedAt));
    },
  };
}
