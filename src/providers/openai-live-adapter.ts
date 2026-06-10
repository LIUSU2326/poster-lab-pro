import { z } from "zod";
import { ProviderConfigFormSchema, type ProviderConfigForm, type ProviderId } from "../schema/zod";
import {
  ImageGenerationRequestSchema,
  ImageEditRequestSchema,
  ProviderHealthResponseSchema,
  ProviderImageResponseSchema,
  ProviderResultAssetSchema,
  createProviderError,
  type GenerationProviderAdapter,
  type ImageEditRequest,
  type ImageGenerationRequest,
  type ProviderConfigValidation,
  type ProviderHealthResponse,
  type ProviderImageResponse,
  type ProviderResult,
} from "./contracts";
import { getProviderManifest } from "./manifests";
import {
  assetFusionStrategy,
  assetSemanticRole,
  isIntegratedReferenceAsset,
  modeAssetFusionDirective,
} from "../assets/semantic-roles";
import {
  AIGOCODE_DEFAULT_BASE_URL,
  AIGOCODE_DEFAULT_IMAGE_MODEL,
  normalizeAigocodeBaseUrl,
  normalizeAigocodeImageModel,
} from "./aigocode-compat";
import { OPENAI_DEFAULT_BASE_URL, normalizeOpenAIBaseUrl } from "./openai-compat";
import {
  providerCapabilityPromptNote,
  providerUsesExtraBodyImageReferences,
} from "./provider-capability-profiles";
import {
  posterFocalHierarchyLock,
  posterInWorldBrandTreatmentLock,
  posterTextEconomyLock,
} from "./poster-kv-architectures";

const OPENAI_PROVIDER_ID = "openai" as const;
const AIGOCODE_PROVIDER_ID = "aigocode" as const;
const AGNES_PROVIDER_ID = "agnes" as const;
const DEFAULT_OPENAI_BASE_URL = OPENAI_DEFAULT_BASE_URL;
const DEFAULT_AIGOCODE_BASE_URL = AIGOCODE_DEFAULT_BASE_URL;
const DEFAULT_AGNES_BASE_URL = "https://apihub.agnes-ai.com/v1";
export const OPENAI_IMAGE_GENERATIONS_PATH = "/images/generations";
export const OPENAI_IMAGE_EDITS_PATH = "/images/edits";
type OpenAICompatibleImageProviderId = Extract<ProviderId, "openai" | "aigocode" | "agnes">;

const OpenAIImageDataSchema = z
  .object({
    url: z.string().url().nullable().optional(),
    b64_json: z.string().min(1).nullable().optional(),
    revised_prompt: z.string().nullable().optional(),
  })
  .passthrough();

export const OpenAIImageGenerationResponseSchema = z
  .object({
    data: z.array(OpenAIImageDataSchema).default([]),
  })
  .passthrough();

export const OpenAIImageTransportRequestSchema = z.object({
  url: z.string().url(),
  method: z.literal("POST"),
  headers: z.record(z.string(), z.string()),
  body: z.union([
    z.record(z.string(), z.unknown()),
    z.instanceof(FormData),
  ]),
});

export const OpenAIImageTransportResponseSchema = z.object({
  ok: z.boolean(),
  status: z.number().int(),
  body: z.unknown(),
});

const OpenAIReferenceImageInputSchema = z.object({
  image_url: z.string().min(1),
});

export type OpenAIImageGenerationResponse = z.infer<typeof OpenAIImageGenerationResponseSchema>;
export type OpenAIReferenceImageInput = z.infer<typeof OpenAIReferenceImageInputSchema>;
export type OpenAIImageTransportRequest = z.infer<typeof OpenAIImageTransportRequestSchema>;
export type OpenAIImageTransportResponse = z.infer<typeof OpenAIImageTransportResponseSchema>;
export type OpenAIImageTransport = (
  request: OpenAIImageTransportRequest,
) => Promise<OpenAIImageTransportResponse>;
type OpenAIImageRequestPayload = {
  path: string;
  headers: Record<string, string>;
  body: OpenAIImageTransportRequest["body"];
};

export type OpenAILiveImageAdapterOptions = {
  providerId?: OpenAICompatibleImageProviderId;
  transport?: OpenAIImageTransport;
  now?: () => number;
};

function validateOpenAICompatibleConfig(providerId: OpenAICompatibleImageProviderId, config: ProviderConfigForm): ProviderConfigValidation {
  const parsed = ProviderConfigFormSchema.parse(config);
  const missing: (keyof ProviderConfigForm)[] = [];
  const warnings: string[] = [];

  if (parsed.providerId !== providerId) {
    warnings.push(`Config providerId ${parsed.providerId} does not match adapter ${providerId}.`);
  }
  if (!parsed.enabled) {
    missing.push("enabled");
  }
  if (!parsed.apiKey?.trim()) {
    missing.push("apiKey");
  }
  if (!parsed.defaultModel?.trim()) {
    missing.push("defaultModel");
  }

  return {
    ok: missing.length === 0,
    missing,
    warnings,
  };
}

function defaultBaseUrl(providerId: OpenAICompatibleImageProviderId): string {
  if (providerId === AIGOCODE_PROVIDER_ID) return DEFAULT_AIGOCODE_BASE_URL;
  return providerId === "agnes" ? DEFAULT_AGNES_BASE_URL : DEFAULT_OPENAI_BASE_URL;
}

function providerDisplayName(providerId: OpenAICompatibleImageProviderId): string {
  return getProviderManifest(providerId).displayName;
}

function normalizeBaseUrl(providerId: OpenAICompatibleImageProviderId, config: ProviderConfigForm): string {
  if (providerId === AIGOCODE_PROVIDER_ID) return normalizeAigocodeBaseUrl(config.baseUrl);
  if (providerId === OPENAI_PROVIDER_ID) return normalizeOpenAIBaseUrl(config.baseUrl);
  return (config.baseUrl?.trim() || defaultBaseUrl(providerId)).replace(/\/+$/, "");
}

function imageModel(providerId: OpenAICompatibleImageProviderId, request: ImageGenerationRequest, config: ProviderConfigForm): string {
  const fallback = providerId === "agnes"
    ? "agnes-image-2.1-flash"
    : providerId === AIGOCODE_PROVIDER_ID
      ? AIGOCODE_DEFAULT_IMAGE_MODEL
      : "gpt-image-2";
  const model = request.model || config.modelSlots.image || config.defaultModel || fallback;
  return providerId === AIGOCODE_PROVIDER_ID ? normalizeAigocodeImageModel(model) : model;
}

function editImageGenerationRequest(request: ImageEditRequest): ImageGenerationRequest {
  return ImageGenerationRequestSchema.parse({
    ...request,
    prompt: [
      request.prompt,
      "Result operation: visual reconstruction / image-to-image refinement of the selected result.",
      "The sourceResult reference image is the primary canvas to redraw from. Preserve its project identity, main characters, logo treatment, core composition relationship, aspect ratio, art style, and story beat unless the user explicitly asks to change a local detail.",
      request.editInstruction,
      "Refine by repainting and reconstructing the image with higher production quality: cleaner character integration, stronger contact shadows, better rim/key light, richer foreground-midground-background depth, more coherent VFX/particles, sharper focal hierarchy, improved color grading, and repaired malformed details.",
      "Fix local problems such as garbled text, fake logo lettering, anatomy drift, duplicated assets, low resolution, flat sticker/collage edges, pasted cutout lighting, muddy details, and weak composition pressure.",
      "Do not switch projects, add unrelated characters, invent new logos, change uploaded character identity, change BOSS identity, rewrite the scene premise, or create a completely different poster unless the edit instruction explicitly asks for that.",
    ].filter(Boolean).join("\n\n"),
    count: 1,
  });
}

function modeQualityInstruction(request: ImageGenerationRequest): string {
  switch (request.context.mode) {
    case "icon":
      return [
        "Quality bar: premium game/app icon, one dominant subject silhouette, minimal background, crisp focal detail, strong value contrast, and 64px readability.",
        "Composition bar: premium 1:1 square icon artwork with full-bleed clarity, one dominant subject, intentional polished edge treatment, no white border, no accidental corner padding, no separate dark container that shrinks the subject, no text, no pseudo-letters, no glyph-like strokes, no logo lettering, no captions, no UI copy, no poster scene complexity, and no invented shield/weapon/tool/accessory. Rounded corners or badge-like app-icon styling are acceptable when intentional and high quality.",
      ].join(" ");
    case "logo":
      return [
        "Quality bar: premium game logo/mark system, readable wordmark or emblem construction, crisp bevel/material finish, clean silhouette, and brand-safe typography.",
        "Composition bar: logo/wordmark is primary on a clean solid-color background when requested; props, characters, or uploaded logo references may influence motifs but must not become a poster scene.",
        "Logo text safety: do not invent fake replacement lettering for uploaded logo references; preserve exact spelling only when reliable, otherwise design a clean copy-safe mark or blank wordmark treatment.",
        "Logo Text Strategy lock: follow the prompt's Logo Text Strategy section exactly. Render exact short wordmarks only when reliable; otherwise reserve a polished blank wordmark plate, emblem, badge, or mark system for later vector/text refinement.",
      ].join(" ");
    case "announcement":
      return [
        "Quality bar: readable in-game announcement or event visual with strong copy hierarchy, clean title/copy safe area, and polished UI/event art direction.",
        "Composition bar: uploaded subjects support the announcement surface without covering headline or key copy.",
        "Announcement Copy Safety Strategy lock: follow the prompt's safety strategy exactly. Reserve calm editable title/body copy-safe fields; if exact text is uncertain, leave polished blank fields instead of garbled operational text or pseudo-copy.",
      ].join(" ");
    case "collab":
      return [
        "Quality bar: premium collaboration campaign visual with two identities kept separate but unified by shared lighting, materials, scene, and interaction story.",
        "Composition bar: dual-character and dual-logo balance without merging identities, inventing partner brand names, or creating fake hybrid marks.",
        "Collab Brand Safety Strategy lock: if no partner brandLogo reference is uploaded, reserve a polished blank partner brand plate or neutral emblem and do not generate fake readable partner wording.",
      ].join(" ");
    case "poster":
    default:
      return [
      "Quality bar: premium game campaign key visual polish adapted to the active art style.",
      "Use cinematic lighting, layered foreground/midground/background depth, refined material detail, crisp focal hierarchy, polished color grading, and campaign-ready logo/slogan safe areas.",
      posterFocalHierarchyLock(),
      posterTextEconomyLock(),
      posterInWorldBrandTreatmentLock(),
      "Poster integrated KV style lock: generate a stylized illustrated game world matching the uploaded character art direction by description. Use rounded readable shapes, clean graphic silhouettes, soft cel/painterly shading, vibrant game-poster colors, project-specific terrain, expressive character acting, and a clear trailer-moment story beat with objective pressure or BOSS threat. Use the full requested canvas as artwork. Do not use photorealistic product macro photography, realistic unrelated 3D render, stock-photo background, duplicate assets, generic replacement heroes, black bars, letterbox bands, or border frames.",
      ].join(" ");
  }
}

function compressedProviderPriorityInstruction(
  providerId: OpenAICompatibleImageProviderId,
  request: ImageGenerationRequest,
): string {
    const profile = getProviderManifest(providerId).imageGeneration;
  if (profile.promptProfile !== "compressed") return "";

  if (request.context.mode === "poster") {
    const architectureSummary = posterArchitectureSummaryFromPrompt(request.prompt);
    const sceneContract = posterCompressedSceneContract(request.prompt, architectureSummary);
    const protagonistAssets = request.assets.filter((asset) => assetSemanticRole(asset) === "protagonist");
    const bossAssets = request.assets.filter((asset) => {
      const role = assetSemanticRole(asset);
      return role === "antagonist" || role === "keySubject";
    });
    const logoAssets = request.assets.filter((asset) => assetSemanticRole(asset) === "brandLogo");
    const compositionGuides = request.assets.filter((asset) => assetSemanticRole(asset) === "compositionReference");
    const styleGuides = request.assets.filter((asset) => assetSemanticRole(asset) === "styleReference");
    const hasHero = hasSemanticRole(request, "protagonist");
    const hasBoss = hasSemanticRole(request, "antagonist") || hasSemanticRole(request, "keySubject");
    const hasLogo = hasSemanticRole(request, "brandLogo");
    const hasTextTarget = /slogan|campaign-copy|copy-safe|typography|logo treatment|title plate/i.test(request.prompt);
    const forceBlankTextPlates = profile.textRendering === "low" && hasTextTarget;
    const required = [
      hasHero ? "uploaded protagonist as a large readable actor" : "",
      hasBoss ? "uploaded BOSS/key threat as a physically dominant threat" : "",
      hasLogo ? "one logo-safe in-world treatment" : "",
      hasTextTarget ? "visible blank slogan/copy-safe area tied to the scene" : "",
    ].filter(Boolean).join("; ");

    return [
      "COMPRESSED MODEL PRIORITY CONTRACT:",
      "Follow this short contract before the longer creative prompt below.",
      "AGNES/COMPRESSED POSTER ORDER: first solve required uploaded anchors and story action; only then add background detail. The image is rejected if it becomes a generic pretty scene with small pasted references.",
      providerId === AGNES_PROVIDER_ID
        ? "AGNES POSTER REFERENCE INPUT: identity, BOSS/key-subject, logo, and prop images are supplied through extra_body.image as image-to-image references. StyleReference and compositionReference are handled through text/analysis and the selected scheme architecture only, so they must not collapse every scheme into the same scene."
        : "",
      architectureSummary
        ? `SELECTED SCHEME ARCHITECTURE LOCK: ${architectureSummary}. This architecture is the primary structure for this image; do not reuse the same scene, pose arrangement, or background composition from another scheme in the batch.`
        : "SELECTED SCHEME ARCHITECTURE LOCK: follow the selected scheme's own scene structure and story beat. Do not reuse the same scene, pose arrangement, or background composition from another scheme in the batch.",
      sceneContract,
      compositionGuides.length > 0
        ? `COMPOSITION GUIDE LOCK: use ${compositionGuides.map((asset) => asset.id).join(", ")} only for camera/layout/diagonal structure/foreground-midground-background scale/safe-area hierarchy. Do not copy its text, logo, characters, monsters, unrelated objects, UI, or scene content, and do not let this guide make every scheme share the same scene.`
        : "",
      styleGuides.length > 0
        ? `STYLE GUIDE LOCK: use ${styleGuides.map((asset) => asset.id).join(", ")} only for rendering language, palette, line quality, lighting, material finish, and polish. Do not copy its subjects, logo, layout, text, or scene content.`
        : "",
      required ? `Poster required anchors: ${required}.` : "",
      protagonistAssets.length === 1
        ? `EXACT HERO ROSTER LOCK: render one and only one playable hero from ${protagonistAssets[0]?.id}. If the prompt says squad/team/staff/helpers, reinterpret it as this single uploaded hero only. No extra human helpers, no helper crowd, no background duplicate heroes.`
        : "",
      protagonistAssets.length > 1
        ? `EXACT HERO ROSTER LOCK: render exactly ${protagonistAssets.length} uploaded playable heroes, one per reference. Do not add unuploaded helpers, crowds, or duplicate hero copies.`
        : "",
      bossAssets.length > 0
        ? `EXACT BOSS ROSTER LOCK: render the uploaded BOSS/key threat as one dominant threat subject from ${bossAssets.map((asset) => asset.id).join(", ")}. Do not split it into multiple small monsters, background copies, minions, or decorative mascots.`
        : "",
      logoAssets.length > 0
        ? `EXACT LOGO LOCK: create one and only one logo-safe treatment for ${logoAssets.map((asset) => asset.id).join(", ")}.`
        : "",
      forceBlankTextPlates
        ? "LOW TEXT RELIABILITY LOCK: this provider is not reliable for spelling. Do NOT render readable words, pseudo-letters, warped logo text, title text, slogan text, or glyph-like strokes. Use large polished blank in-world logo/slogan plates only, with clean empty surfaces for later copy."
        : "",
      "KV ACTION MINI-BRIEF: one large readable uploaded hero, one physically dominant uploaded BOSS/key threat, one integrated blank or exact-safe logo/copy area, one shared ground plane, visible contact shadows, foreground occlusion, rim light, and VFX crossing in front of the subjects.",
      posterFocalHierarchyLock(),
      posterTextEconomyLock(),
      posterInWorldBrandTreatmentLock(),
      "STRICT TYPOGRAPHY COUNT LOCK: the entire poster may contain at most one typography-bearing campaign zone after the logo is placed. If a slogan is shown on a sign, banner, ribbon, or plate, do not create any other text plate, lower-left/lower-right label, corner badge, decorative subtitle, secondary plaque, blank caption panel, or repeated translation anywhere else.",
      "REFERENCE PANEL BAN: reference images are private model sheets, not picture-in-picture content. Do not place a copied reference image, black-background cutout, side-by-side comparison panel, model-sheet panel, empty black block, or sticker pasted from an uploaded asset anywhere on the final canvas.",
      "STYLE CONSISTENCY LOCK: keep the entire image in one stylized game illustration language. No photorealistic people, no real-world crowd, no spectators, no adult realistic knight, no stock-photo background, no live-action advertising look, and no pasted cartoon stickers over a realistic scene.",
      "EMPTY BACKGROUND BAN: do not render a plain sky, plain gradient, studio backdrop, isolated mascot pose, icon-like character lineup, or empty two-character cutout. The final image must be a full campaign scene.",
      "MINIMUM ENVIRONMENT CHECKLIST: include one readable foreground prop or occluder, one shared ground plane, one midground action touchpoint, one background set-piece from the current project such as portal, base defense, canyon route, town gate, battlefield lane, machine room, fortress, forest path, or objective zone, plus particles, rim light, and contact shadows.",
      "The poster fails if a required anchor is absent, tiny, hidden, duplicated, or replaced by a generic subject.",
      "Hero and BOSS must share the same camera, perspective, lighting, contact shadows, occlusion, particles/VFX, and story action. Do not make a pretty background with small sticker-like subjects.",
      "Logo/slogan treatment should be integrated as one in-world sign, plaque, banner, smoke/energy stroke, carved/metal relief, hologram, flag, or blank copy-safe plate; no fake text, no garbled words, no floating PPT-style overlay, and no second slogan plaque.",
    ].filter(Boolean).join("\n");
  }

  if (request.context.mode === "collab") {
    const partner = request.assets.find((asset) => asset.role === "collabCharacter");
    const gameCharacter = request.assets.find((asset) => asset.role === "gameCharacter");
    return [
      "COMPRESSED MODEL PRIORITY CONTRACT:",
      "Follow this short contract before the longer creative prompt below.",
      "COLLAB DUAL-STAR ORDER: first draw two large readable co-stars with equal importance, then add scene, props, blank brand plates, and effects. Do not start from logos or background.",
      partner && gameCharacter
        ? "REFERENCE USE LOCK: uploaded images are identity/model-sheet references only, not the source canvas, background, crop, or single image to transform. Newly compose one frame that contains BOTH referenced characters."
        : "",
      partner ? `Collab partner anchor: ${partner.id} must appear as a separate readable co-star.` : "",
      gameCharacter ? `Game character anchor: ${gameCharacter.id} must appear as a separate readable co-star.` : "",
      partner && gameCharacter
        ? "DUAL-SUBJECT FRAMING LOCK: compose the uploaded collab partner and uploaded game character as the two primary foreground subjects, each occupying meaningful visual weight. A one-character image is invalid even if the environment is polished."
        : "",
      partner && gameCharacter
        ? "Both co-stars need comparable visual weight, shared lighting, same ground plane, contact shadows, and one clear interaction touchpoint such as left/right handoff, guarding one objective, racing, exchanging an item, rescuing, or reacting to the same impact. The image fails if one side disappears, becomes tiny, hides behind a prop/plate, turns into a logo-only presence, or the two identities merge into a hybrid."
        : "",
      partner && gameCharacter
        ? "Two-character audit: render exactly one uploaded collab partner and exactly one uploaded game character as the primary living characters. No third lead character, no background crowd, no character fusion, no side reduced to decorative mascot."
        : "",
      "EMPTY COLLAB BACKGROUND BAN: do not render a single mascot on a plain sky/gradient, empty beach, or simple fence backdrop. Build a shared campaign moment with both sides visibly interacting.",
      "Use blank non-letter plates or neutral emblems for uncertain brand text. Do not invent partner names, fake sponsor words, or hybrid logo lettering.",
    ].filter(Boolean).join("\n");
  }

  return "";
}

function posterArchitectureSummaryFromPrompt(prompt: string): string {
  const architectureLine = prompt.match(/Architecture:\s*([^\n]+)/i)?.[1]
    || prompt.match(/KV构图母版[:：]\s*([^\n。]+(?:。[^。\n]+)?)/)?.[1]
    || "";
  return architectureLine.replace(/\s+/g, " ").trim().slice(0, 240);
}

function posterSelectedSchemeExcerpt(prompt: string): string {
  const match = prompt.match(/## Selected Scheme\s+([\s\S]*?)(?:\n\n## |\n## |$)/i);
  return (match?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 1400);
}

function posterCompressedSceneContract(prompt: string, architectureSummary = ""): string {
  const text = (architectureSummary || posterSelectedSchemeExcerpt(prompt) || prompt.slice(0, 1800)).toLowerCase();
  const contracts: string[] = [];
  const hasPortal = /传送门|portal|gate|doorway|入口|golden light|金光/.test(text);
  const hasGiant = /巨物|微缩|giant|macro|miniature|微距|huge|oversized|colossal/.test(text);
  const hasObjectivePressure = /objective|mission|timer|route|base|town|defense|siege|raid|upgrade|resource|计时器|任务|路线|基地|城镇|防守|资源/.test(text);

  if (hasPortal) {
    contracts.push(
      "glowing portal or breach discovery scene, not a normal field: show a project-specific gate, doorway, relic, screen, map route, wall breach, or environmental opening becoming a bright portal, golden volumetric light, project-specific particles, and the uploaded BOSS/key threat visible or reaching from the other side",
    );
  } else if (hasGiant) {
    contracts.push(
      "forced-perspective giant-scale adventure based on the current project: oversized enemy, machine, structure, terrain, spell, vehicle, gate, or obstacle, with the uploaded hero small-but-readable in the foreground and the uploaded BOSS/key threat as the oversized pressure source",
    );
  } else if (hasObjectivePressure) {
    contracts.push(
      "objective-pressure battlefield, not a generic meadow: show the current project's mission pressure, base/town/resource/route/timer/upgrade objective, warning glow, dust, sparks, debris, and the uploaded BOSS/key threat breaking into or attacking the objective zone",
    );
  }
  if (/荒野|hunt|hunting|battlefield|战场|boss|base|town|route|quest|mission|defense/.test(text) && contracts.length === 0) {
    contracts.push(
      "project-specific adventure or tactical battlefield with foreground action, visible BOSS pressure, environmental reaction, and a campaign key-visual set piece instead of a simple mascot lineup",
    );
  }

  if (contracts.length === 0) return "";

  return [
    "SCHEME-SPECIFIC MANDATORY SCENE:",
    ...contracts.slice(0, 2).map((contract) => `- ${contract}.`),
    "This short English scene contract overrides generic reference-image similarity. A blue-sky grassy hero lineup, repeated pastoral field, or unchanged asset group pose is invalid for this scheme.",
  ].join("\n");
}

function imagePrompt(providerId: OpenAICompatibleImageProviderId, request: ImageGenerationRequest): string {
  const compressedPriorityInstruction = compressedProviderPriorityInstruction(providerId, request);
  const hasPosterMode = request.context.mode === "poster";
  const fusionDirective = request.assets.length ? modeAssetFusionDirective(request.context.mode, request.assets) : "";
  const referenceInstruction = modeReferenceInstruction(request);
  const subjectAccessoryInstruction = modeSubjectAccessoryInstruction(request);
  const protagonistInstruction = modeSpecificProtagonistInstruction(request);
  const brandLogoInstruction = modeSpecificBrandLogoInstruction(request);
  const assetInstruction = request.assets.length
      ? [
        "Uploaded asset constraints:",
        hasPosterMode
          ? "For poster mode, generate the final integrated game campaign KV when the model can use the provided reference details. Uploaded characters, BOSS/key subject, and logo are identity/model-sheet anchors, not static stickers."
          : "Treat listed assets as binding semantic visual references for the active mode. If the provider cannot ingest the images directly, follow their role descriptions and fusion strategies as strictly as possible.",
        hasPosterMode
          ? "Characters and BOSS may change pose, expression, action, camera angle, lighting, and perspective, but must preserve recognizable identity. Use each uploaded character, BOSS/key subject, and logo once; no duplicate large/small copies."
          : referenceInstruction,
        hasPosterMode
          ? "StyleReference and compositionReference assets are guide-only inputs: extract rendering/camera/layout/focal hierarchy, but never copy their text, logos, characters, monsters, props, unrelated objects, UI, or full scene."
          : "",
        subjectAccessoryInstruction,
        fusionDirective,
        request.assets.some((asset) => asset.role === "styleReference")
          ? "A styleReference image is present and has priority over selected style tags and character-derived style for rendering, palette, lighting, and finish."
          : "",
        protagonistInstruction,
        hasPosterMode
          ? "Placeholder annotation rule: any written appearance, species, clothing, weapon, logo-lettering, color, or anatomy description attached to [Game Character], [Boss], [Game Logo], [Prop], or [Key Subject] is non-binding unless it is visibly present in the uploaded reference. Ignore conflicting or embellished placeholder descriptions."
          : "",
        brandLogoInstruction,
        ...request.assets.map((asset) => [
          `- ${asset.role}: ${asset.id}`,
          `semanticRole=${assetSemanticRole(asset)}`,
          `fusion=${assetFusionStrategy(asset, { mode: request.context.mode })}`,
          asset.description || "",
          asset.url ? `referenceUrl=${asset.url}` : "",
        ].filter(Boolean).join("; ")),
      ].join("\n")
    : "";
  const negativeInstruction = request.negativePrompt?.trim()
    ? `Avoid: ${request.negativePrompt.trim()}`
    : "";
  const qualityInstruction = [
    modeQualityInstruction(request),
    "Avoid flat collage, cheap clip-art, generic replacement characters, duplicated asset copies, and conflicting photorealistic backgrounds.",
  ].join(" ");
  const providerNote = providerCapabilityPromptNote({
    providerId,
    mode: request.context.mode,
    hasReferenceAssets: request.assets.length > 0,
    hasTextTargets: /slogan|wordmark|announcement|copy|logo text|typography/i.test(request.prompt),
  });
  return [
    compressedPriorityInstruction,
    request.prompt,
    qualityInstruction,
    assetInstruction,
    providerNote,
    negativeInstruction,
  ].filter(Boolean).join("\n\n");
}

function hasSemanticRole(request: ImageGenerationRequest, role: ReturnType<typeof assetSemanticRole>): boolean {
  return request.assets.some((asset) => assetSemanticRole(asset) === role);
}

function modeReferenceInstruction(request: ImageGenerationRequest): string {
  switch (request.context.mode) {
    case "icon":
      return "Icon reference handling: choose one dominant uploaded subject or motif and simplify/redraw it into a clean 1:1 icon silhouette. Do not create a poster scene, multi-character battle, copied sticker, invented shield/weapon/tool/accessory, or any text.";
    case "logo":
      return "Logo reference handling: use uploaded assets as brand continuity, motif, material, or shape references for a wordmark/mark system. Do not turn them into a scene or pasted collage, and use Logo Text Strategy rather than pseudo-letters.";
    case "announcement":
      return "Announcement reference handling: use uploaded assets as supporting art around a readable copy-safe announcement panel. Do not cover the title/copy area, and follow Announcement Copy Safety Strategy instead of generating garbled operational text.";
    case "collab":
      return "Collab reference handling: keep uploaded characters and logos as separate identities unified by one scene, shared lighting, materials, and interaction. Follow Collab Brand Safety Strategy; do not merge identities, invent partner brand names, or create hybrid marks.";
    case "poster":
    default:
      return "Use each uploaded character, BOSS/key subject, and logo once as an integrated in-world element. Do not create duplicate large/small copies or sticker-like pasted versions of the same asset.";
  }
}

function modeSubjectAccessoryInstruction(request: ImageGenerationRequest): string {
  if (request.assets.length === 0 || request.context.mode === "poster") return "";
  return "Uploaded subject accessory lock: do not add new shields, weapons, armor, tools, costume parts, horns, crowns, props, facial features, facial hair, or signature accessories to uploaded characters, BOSS/key subjects, collab characters, or icon subjects unless those details are clearly visible in the reference. Express action through pose, camera, lighting, particles, environment, and existing visible props only.";
}

function modeSpecificProtagonistInstruction(request: ImageGenerationRequest): string {
  if (!hasSemanticRole(request, "protagonist")) return "";
  switch (request.context.mode) {
    case "icon":
      return "Icon character rule: a gameCharacter reference may become the single main icon subject, but no extra characters or crowded group scenes.";
    case "logo":
      return "Logo character rule: character references may inspire mascot-like motifs only if the wordmark/mark remains primary.";
    case "announcement":
      return "Announcement character rule: character references may act as presenters or supporting cast without covering headline/copy hierarchy.";
    case "collab":
      return "Collab character rule: visible characters must come from uploaded gameCharacter/collabCharacter references and remain separate; no generic replacements or merged traits.";
    case "poster":
    default:
      return "Character roster lock: visible hero/player characters must come from uploaded gameCharacter references only. Do not add generic heroes, random human mascots, or replacement player characters.";
  }
}

function modeSpecificBrandLogoInstruction(request: ImageGenerationRequest): string {
  const hasBrandLogo = hasSemanticRole(request, "brandLogo");
  if (request.context.mode === "collab" && !hasBrandLogo) {
    return "Collab logo rule: no uploaded partner brandLogo is present. Do not invent partner brand names, fake sponsor logos, fake brand slogans, or readable partner wordmarks; reserve a polished blank partner brand plate, neutral emblem, or copy-safe lockup area instead.";
  }
  if (!hasBrandLogo) return "";
  switch (request.context.mode) {
    case "icon":
      return "Icon logo rule: uploaded logos may guide color, symbol shape, or brand style, but icon mode must not render logo lettering or readable text.";
	    case "logo":
	      return "Logo text safety: uploaded logos guide brand continuity through color, silhouette, rhythm, spacing, and material style. Follow Logo Text Strategy exactly. In copy-safe blank wordmark mode, do not render readable letters, uploaded-logo text, project-title fragments, partial words, pseudo-letters, slogans, or decorative fake typography; use a polished blank wordmark plate, emblem, badge, or mark system.";
    case "announcement":
      return "Announcement logo rule: use uploaded logos as small clean lockups or reserved brand-safe areas, never as fake repeated watermark text.";
    case "collab":
      return "Collab logo rule: keep each uploaded logo/brand identity separate and readable; do not fuse two logos into one fake hybrid mark, and do not invent partner brand names or fake sponsor slogans for missing logo slots.";
    case "poster":
    default:
      return "Logo text safety: use the exact uploaded logo only when lettering can stay accurate; otherwise reserve a polished blank logo-safe title plate/sign that fits the scene. Do not invent fake logo words, substitute letters, or generate garbled text.";
  }
}

function imageSize(request: ImageGenerationRequest): string {
  return `${request.width}x${request.height}`;
}

function missingConfigResult<T>(providerId: OpenAICompatibleImageProviderId, config: ProviderConfigForm): ProviderResult<T> {
  const validation = validateOpenAICompatibleConfig(providerId, config);
  const hasMissingApiKey = validation.missing.includes("apiKey");
  const displayName = providerDisplayName(providerId);

  return {
    ok: false,
    error: createProviderError(
      providerId,
      hasMissingApiKey ? "auth_failed" : "missing_config",
      `${displayName} live adapter is missing configuration: ${validation.missing.join(", ")}`,
      {
        userMessage: hasMissingApiKey
          ? `${displayName} API key is required before live image generation.`
          : `${displayName} provider configuration is incomplete.`,
      },
    ),
  };
}

function unavailableTransportResult<T>(providerId: OpenAICompatibleImageProviderId): ProviderResult<T> {
  const displayName = providerDisplayName(providerId);
  return {
    ok: false,
    error: createProviderError(
      providerId,
      "provider_unavailable",
      `${displayName} live adapter requires an injected HTTP transport before network execution.`,
      {
        userMessage: `${displayName} live execution is not connected in this environment.`,
      },
    ),
  };
}

function providerErrorFromStatus<T>(providerId: OpenAICompatibleImageProviderId, status: number, body: unknown): ProviderResult<T> {
  const displayName = providerDisplayName(providerId);
  const parsedError = z
    .object({
      error: z
        .object({
          message: z.string().optional(),
          type: z.string().optional(),
          code: z.union([z.string(), z.number()]).optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .safeParse(body);
  const providerMessage = parsedError.success ? parsedError.data.error?.message : undefined;
  const message = providerMessage || `${displayName} image generation failed with HTTP ${status}.`;

  if (status <= 0) {
    return {
      ok: false,
      error: createProviderError(providerId, "provider_unavailable", message, {
        retryable: true,
        userMessage: `${displayName} network request failed. Check proxy, VPN, or provider connectivity.`,
      }),
    };
  }

  if (status === 401 || status === 403) {
    return {
      ok: false,
      error: createProviderError(providerId, "auth_failed", message, {
        userMessage: `${displayName} authentication failed. Check the API key and provider access.`,
      }),
    };
  }

  if (status === 429) {
    return {
      ok: false,
      error: createProviderError(providerId, "rate_limited", message, {
        retryable: true,
        userMessage: `${displayName} rate limit was reached. Retry after the provider limit resets.`,
      }),
    };
  }

  if (status === 402) {
    return {
      ok: false,
      error: createProviderError(providerId, "quota_exceeded", message, {
        userMessage: `${displayName} quota or billing limit was reached.`,
      }),
    };
  }

  if (status >= 500) {
    return {
      ok: false,
      error: createProviderError(providerId, "provider_unavailable", message, {
        retryable: true,
        userMessage: `${displayName} is temporarily unavailable. Retry later.`,
      }),
    };
  }

  return {
    ok: false,
    error: createProviderError(providerId, "invalid_request", message, {
      userMessage: `${displayName} rejected the image generation request.`,
    }),
  };
}

function parseImageResponse(
  providerId: OpenAICompatibleImageProviderId,
  request: ImageGenerationRequest,
  model: string,
  body: unknown,
  elapsedMs: number,
): ProviderResult<ProviderImageResponse> {
  const displayName = providerDisplayName(providerId);
  const parsed = OpenAIImageGenerationResponseSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      error: createProviderError(providerId, "invalid_request", `${displayName} image response did not match the expected schema.`, {
        userMessage: `${displayName} returned an unexpected image response.`,
      }),
    };
  }

  const assets = parsed.data.data
    .map((item, index) => {
      const rawAsset: Record<string, unknown> = {
        id: `${providerId}-${request.context.traceId || request.context.jobId || request.schemeId}-${index + 1}`,
        mimeType: "image/png",
        width: request.width,
        height: request.height,
      };

      if (item.url) rawAsset.url = item.url;
      if (item.b64_json) rawAsset.dataUrl = `data:image/png;base64,${item.b64_json}`;
      if (item.revised_prompt) rawAsset.seed = `revised-prompt-${index + 1}`;
      if (!item.url && !item.b64_json) return null;

      return ProviderResultAssetSchema.parse(rawAsset);
    })
    .filter((asset): asset is NonNullable<typeof asset> => asset !== null);

  if (assets.length === 0) {
    return {
      ok: false,
      error: createProviderError(providerId, "invalid_request", `${displayName} image response did not include URL or base64 assets.`, {
        userMessage: `${displayName} returned no usable image assets.`,
      }),
    };
  }

  return {
    ok: true,
    value: ProviderImageResponseSchema.parse({
      providerId,
      model,
      assets,
      usage: {
        imageCount: assets.length,
        elapsedMs,
      },
    }),
  };
}

function isLocalReferenceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function parseDataUrl(value: string): { mimeType: string; data: string } | null {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) return null;
  return {
    mimeType: match[1] || "image/png",
    data: match[2] || "",
  };
}

function extensionForImageMimeType(mimeType: string): string {
  if (/jpe?g/i.test(mimeType)) return "jpg";
  if (/webp/i.test(mimeType)) return "webp";
  if (/gif/i.test(mimeType)) return "gif";
  return "png";
}

function dataUrlToFile(value: string, name: string): File | null {
  const parsed = parseDataUrl(value);
  if (!parsed?.data) return null;
  const bytes = Buffer.from(parsed.data, "base64");
  if (bytes.byteLength === 0) return null;
  return new File([bytes], name, { type: parsed.mimeType });
}

async function localImageUrlToDataUrl(url: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(url);
  if (!response.ok) return url;

  const contentType = response.headers.get("content-type") || "image/png";
  if (!contentType.startsWith("image/")) return url;

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0) return url;
  return `data:${contentType.split(";")[0]};base64,${bytes.toString("base64")}`;
}

async function imageUrlToFile(url: string, name: string, fetchImpl: typeof fetch): Promise<File | null> {
  const dataUrl = parseDataUrl(url);
  if (dataUrl) {
    return dataUrlToFile(
      url,
      `${name}.${extensionForImageMimeType(dataUrl.mimeType)}`,
    );
  }

  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "image/png";
    if (!contentType.startsWith("image/")) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0) return null;
    const mimeType = contentType.split(";")[0] || "image/png";
    return new File([bytes], `${name}.${extensionForImageMimeType(mimeType)}`, { type: mimeType });
  } catch {
    return null;
  }
}

async function prepareOpenAIImageBodyForTransport(
  body: OpenAIImageTransportRequest["body"],
  fetchImpl: typeof fetch,
): Promise<OpenAIImageTransportRequest["body"]> {
  if (body instanceof FormData) return body;

  const extraBody = body.extra_body;
  if (!extraBody || typeof extraBody !== "object" || Array.isArray(extraBody)) return body;

  const image = (extraBody as Record<string, unknown>).image;
  if (!Array.isArray(image)) return body;

  const preparedImages = await Promise.all(image.map(async (item) => {
    if (typeof item !== "string" || !isLocalReferenceUrl(item)) return item;
    return localImageUrlToDataUrl(item, fetchImpl);
  }));

  return {
    ...body,
    extra_body: {
      ...(extraBody as Record<string, unknown>),
      image: preparedImages,
    },
  };
}

async function imageUrlToBase64(url: string, fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "image/png";
    if (!contentType.startsWith("image/")) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0) return null;
    return bytes.toString("base64");
  } catch {
    return null;
  }
}

async function attachImageResponseDataUrls(body: unknown, fetchImpl: typeof fetch): Promise<unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const record = body as Record<string, unknown>;
  const data = record.data;
  if (!Array.isArray(data)) return body;

  const preparedData = await Promise.all(data.map(async (item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const asset = item as Record<string, unknown>;
    if (typeof asset.b64_json === "string" && asset.b64_json.length > 0) return item;
    if (typeof asset.url !== "string" || !/^https?:\/\//i.test(asset.url)) return item;

    const b64Json = await imageUrlToBase64(asset.url, fetchImpl);
    return b64Json ? { ...asset, b64_json: b64Json } : item;
  }));

  return {
    ...record,
    data: preparedData,
  };
}

export function createOpenAIHttpTransport(fetchImpl: typeof fetch): OpenAIImageTransport {
  return async (request) => {
    const parsed = OpenAIImageTransportRequestSchema.parse(request);
    const requestBody = await prepareOpenAIImageBodyForTransport(parsed.body, fetchImpl);
    const isMultipart = requestBody instanceof FormData;
    let response: Response;
    try {
      response = await fetchImpl(parsed.url, {
        method: parsed.method,
        headers: isMultipart
          ? Object.fromEntries(Object.entries(parsed.headers).filter(([key]) => key.toLowerCase() !== "content-type"))
          : parsed.headers,
        body: isMultipart ? requestBody : JSON.stringify(requestBody),
      });
    } catch (error) {
      return OpenAIImageTransportResponseSchema.parse({
        ok: false,
        status: 0,
        body: {
          error: {
            message: error instanceof Error ? error.message : "OpenAI network request failed.",
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
    if (response.ok) {
      body = await attachImageResponseDataUrls(body, fetchImpl);
    }

    return OpenAIImageTransportResponseSchema.parse({
      ok: response.ok,
      status: response.status,
      body,
    });
  };
}

function referenceImageUrls(
  providerId: OpenAICompatibleImageProviderId,
  request: ImageGenerationRequest,
): string[] {
  return Array.from(new Set(
    request.assets
      .filter((asset) => shouldSendRawReferenceAsset(providerId, request, asset))
      .map((asset) => asset.url || "")
      .filter((url) => /^(https?:\/\/|data:image\/)/i.test(url)),
  ));
}

function shouldSendRawReferenceAsset(
  providerId: OpenAICompatibleImageProviderId,
  request: ImageGenerationRequest,
  asset: ImageGenerationRequest["assets"][number],
): boolean {
  if (asset.role === "sourceResult") return true;
  if (providerId === OPENAI_PROVIDER_ID) return true;
  if (!isIntegratedReferenceAsset(asset)) return false;
  if (providerId === AGNES_PROVIDER_ID && request.context.mode === "poster") {
    const semanticRole = assetSemanticRole(asset);
    if (semanticRole === "compositionReference" || semanticRole === "styleReference") return false;
  }
  return true;
}

async function referenceImageInputs(
  providerId: OpenAICompatibleImageProviderId,
  request: ImageGenerationRequest,
): Promise<string[]> {
  const urls = referenceImageUrls(providerId, request);
  const resolved = await Promise.all(urls.map(async (url) => {
    if (/^data:image\//i.test(url)) return url;
    if (isLocalReferenceUrl(url)) return await localImageUrlToDataUrl(url, fetch);
    return url;
  }));
  return resolved.filter(Boolean);
}

class OpenAIReferenceImageError extends Error {
  constructor(
    readonly providerId: OpenAICompatibleImageProviderId,
    readonly expectedCount: number,
    readonly preparedCount: number,
  ) {
    super(`OpenAI reference image intake prepared ${preparedCount}/${expectedCount} reference images.`);
  }
}

function referenceImageErrorResult<T>(error: unknown): ProviderResult<T> | null {
  if (!(error instanceof OpenAIReferenceImageError)) return null;
  const displayName = providerDisplayName(error.providerId);
  return {
    ok: false,
    error: createProviderError(error.providerId, "invalid_request", error.message, {
      userMessage: `${displayName} could not read the uploaded reference image files, so generation was stopped instead of silently ignoring the assets. Please re-upload the missing assets or use a provider that can read them.`,
    }),
  };
}

async function referenceImageFiles(
  providerId: OpenAICompatibleImageProviderId,
  request: ImageGenerationRequest,
): Promise<File[]> {
  const urls = referenceImageUrls(providerId, request).slice(0, 16);
  const files = await Promise.all(urls.map(async (url, index) =>
    imageUrlToFile(url, `reference-${index + 1}`, fetch),
  ));
  const prepared = files.filter((file): file is File => file !== null);
  if (prepared.length !== urls.length) {
    throw new OpenAIReferenceImageError(providerId, urls.length, prepared.length);
  }
  return prepared;
}

function appendOpenAIEditFormField(form: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") return;
  form.append(key, String(value));
}

function openAIModelAllowsInputFidelity(model: string): boolean {
  return !/^gpt-image-2(?:\b|-)/i.test(model.trim());
}

async function imageRequestPayload(
  providerId: OpenAICompatibleImageProviderId,
  model: string,
  request: ImageGenerationRequest,
): Promise<OpenAIImageRequestPayload> {
  if (providerId === OPENAI_PROVIDER_ID && referenceImageUrls(providerId, request).length > 0) {
    const formData = new FormData();
    appendOpenAIEditFormField(formData, "model", model);
    appendOpenAIEditFormField(formData, "prompt", imagePrompt(providerId, request));
    appendOpenAIEditFormField(formData, "size", imageSize(request));
    appendOpenAIEditFormField(formData, "n", request.count);
    if (openAIModelAllowsInputFidelity(model)) {
      appendOpenAIEditFormField(formData, "input_fidelity", "high");
    }
    for (const file of await referenceImageFiles(providerId, request)) {
      formData.append("image[]", file);
    }
    return {
      path: OPENAI_IMAGE_EDITS_PATH,
      headers: {},
      body: formData,
    };
  }

  const body: Record<string, unknown> = {
    model,
    prompt: imagePrompt(providerId, request),
    size: imageSize(request),
    n: request.count,
  };

  if (providerUsesExtraBodyImageReferences(providerId)) {
    const imageUrls = await referenceImageInputs(providerId, request);
    if (imageUrls.length > 0) {
      body.extra_body = {
        image: imageUrls,
        response_format: "url",
      };
      if (providerId === AGNES_PROVIDER_ID) {
        body.tags = ["img2img"];
      }
    }
  }

  return {
    path: OPENAI_IMAGE_GENERATIONS_PATH,
    headers: {
      "Content-Type": "application/json",
    },
    body,
  };
}

export function createOpenAILiveImageAdapter(options: OpenAILiveImageAdapterOptions = {}): GenerationProviderAdapter {
  const providerId = options.providerId || OPENAI_PROVIDER_ID;
  const manifest = getProviderManifest(providerId);
  const now = options.now || Date.now;
  const displayName = manifest.displayName;

  async function generateParsedImage(
    parsedRequest: ImageGenerationRequest,
    parsedConfig: ProviderConfigForm,
  ): Promise<ProviderResult<ProviderImageResponse>> {
    const validation = validateOpenAICompatibleConfig(providerId, parsedConfig);
    if (!validation.ok) return missingConfigResult(providerId, parsedConfig);
    if (!options.transport) return unavailableTransportResult(providerId);

    const model = imageModel(providerId, parsedRequest, parsedConfig);
    let payload: OpenAIImageRequestPayload;
    try {
      payload = await imageRequestPayload(providerId, model, parsedRequest);
    } catch (error) {
      const referenceError = referenceImageErrorResult<ProviderImageResponse>(error);
      if (referenceError) return referenceError;
      throw error;
    }
    const startedAt = now();
    const transportResponse = await options.transport(
      OpenAIImageTransportRequestSchema.parse({
        url: `${normalizeBaseUrl(providerId, parsedConfig)}${payload.path}`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${(parsedConfig.apiKey || "").trim()}`,
          ...payload.headers,
        },
        body: payload.body,
      }),
    );
    const parsedTransportResponse = OpenAIImageTransportResponseSchema.parse(transportResponse);

    if (!parsedTransportResponse.ok) {
      return providerErrorFromStatus(providerId, parsedTransportResponse.status, parsedTransportResponse.body);
    }

    return parseImageResponse(providerId, parsedRequest, model, parsedTransportResponse.body, Math.max(0, now() - startedAt));
  }

  return {
    manifest,

    validateConfig(config) {
      return validateOpenAICompatibleConfig(providerId, config);
    },

    async healthCheck(config): Promise<ProviderResult<ProviderHealthResponse>> {
      const validation = validateOpenAICompatibleConfig(providerId, config);
      if (!validation.ok) {
        return {
          ok: true,
          value: ProviderHealthResponseSchema.parse({
            providerId,
            ok: false,
            status: "not_configured",
            message: `${displayName} live adapter is missing configuration: ${validation.missing.join(", ")}`,
          }),
        };
      }

      return {
        ok: true,
        value: ProviderHealthResponseSchema.parse({
          providerId,
          ok: Boolean(options.transport),
          status: options.transport ? "ready" : "unavailable",
          message: options.transport
            ? `${displayName} live adapter is configured with an injected transport.`
            : `${displayName} live adapter is configured but has no injected transport.`,
        }),
      };
    },

    async generateImage(request: ImageGenerationRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderImageResponse>> {
      const parsedRequest = ImageGenerationRequestSchema.parse(request);
      const parsedConfig = ProviderConfigFormSchema.parse(config);
      return generateParsedImage(parsedRequest, parsedConfig);
    },

    async editImage(request: ImageEditRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderImageResponse>> {
      const parsedRequest = ImageEditRequestSchema.parse(request);
      const parsedConfig = ProviderConfigFormSchema.parse(config);
      return generateParsedImage(editImageGenerationRequest(parsedRequest), parsedConfig);
    },
  };
}
