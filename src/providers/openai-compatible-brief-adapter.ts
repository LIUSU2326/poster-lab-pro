import { z } from "zod";
import { posterAssetFusionStrategy, posterAssetSemanticRole } from "../assets/semantic-roles";
import { ProviderConfigFormSchema, type ProviderConfigForm } from "../schema/zod";
import type { ProviderId } from "../schema/zod";
import {
  BriefGenerationRequestSchema,
  ProviderBriefResponseSchema,
  ProviderHealthResponseSchema,
  createProviderError,
  type BriefGenerationRequest,
  type GenerationProviderAdapter,
  type ProviderBriefResponse,
  type ProviderConfigValidation,
  type ProviderHealthResponse,
  type ProviderResult,
} from "./contracts";
import { getProviderManifest } from "./manifests";
import {
  posterCinematicKvQualityDirective,
  posterFocalHierarchyLock,
  posterHeroPerformanceScaleLock,
  posterInWorldBrandTreatmentLock,
  posterIdentitySafeMotionRule,
	  posterLogoSingleUseLock,
	  posterKvArchitectureBriefSlots,
	  posterKvArchitectureDiversityRequirement,
	  posterKvArchitectureSlotSeed,
  posterKvAssetCountsFromAssets,
  posterKvRenderPromptAugmentation,
  posterSchemeBlueprintRequirement,
  posterStaticSchemeLanguageBan,
  posterTextEconomyLock,
  posterSubjectAccessoryStrictnessLock,
} from "./poster-kv-architectures";
import { sanitizePosterSchemeText } from "./poster-scheme-sanitizer";
import { imageRenderableSloganRule, integratedSloganTreatmentRule, normalizeImageRenderableSlogan } from "../prompts/slogan-policy";
import { normalizeMimoProviderBaseUrl, normalizeMimoProviderModel } from "./mimo-compat";
import { AIGOCODE_DEFAULT_BASE_URL, normalizeAigocodeBaseUrl } from "./aigocode-compat";
import { normalizeOpenAIBaseUrl } from "./openai-compat";

const CHAT_COMPLETIONS_PATH = "/chat/completions";

const defaultBaseUrls: Partial<Record<ProviderId, string>> = {
  openai: "https://api.openai.com/v1",
  aigocode: AIGOCODE_DEFAULT_BASE_URL,
  deepseek: "https://api.deepseek.com",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  agnes: "https://apihub.agnes-ai.com/v1",
  mimo: "https://token-plan-cn.xiaomimimo.com/v1",
};

export const OpenAICompatibleChatTransportRequestSchema = z.object({
  url: z.string().url(),
  method: z.literal("POST"),
  headers: z.record(z.string(), z.string()),
  body: z.record(z.string(), z.unknown()),
});

export const OpenAICompatibleChatTransportResponseSchema = z.object({
  ok: z.boolean(),
  status: z.number().int(),
  body: z.unknown(),
});

const ChatCompletionResponseSchema = z
  .object({
    choices: z.array(
      z
        .object({
          message: z
            .object({
              content: z.union([z.string(), z.array(z.unknown())]).optional(),
            })
            .passthrough()
            .optional(),
        })
        .passthrough(),
    ).default([]),
    usage: z
      .object({
        prompt_tokens: z.number().int().min(0).optional(),
        completion_tokens: z.number().int().min(0).optional(),
        total_tokens: z.number().int().min(0).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const BriefCompletionSchema = z.object({
  schemes: z.array(
    z.object({
      title: z.string().min(1),
      brief: z.string().min(1),
      prompt: z.string().min(1),
      promptZh: z.string().min(1).optional(),
      promptEn: z.string().min(1).optional(),
      slogans: z.record(z.string(), z.string()).default({}),
    }),
  ).min(1),
});

const SUPPORTED_SLOGAN_LANGUAGES = ["zh-CN", "en-US", "ja-JP", "ko-KR"] as const;
type BriefScheme = z.infer<typeof BriefCompletionSchema>["schemes"][number];

export type OpenAICompatibleChatTransportRequest = z.infer<typeof OpenAICompatibleChatTransportRequestSchema>;
export type OpenAICompatibleChatTransportResponse = z.infer<typeof OpenAICompatibleChatTransportResponseSchema>;
export type OpenAICompatibleChatTransport = (
  request: OpenAICompatibleChatTransportRequest,
) => Promise<OpenAICompatibleChatTransportResponse>;

export type OpenAICompatibleBriefAdapterOptions = {
  providerId: ProviderId;
  transport?: OpenAICompatibleChatTransport;
  now?: () => number;
};

const OPENAI_COMPATIBLE_CHAT_TIMEOUT_MS = Math.max(
  60_000,
  Math.min(300_000, Number(process.env.POSTER_LAB_CHAT_TIMEOUT_MS || 180_000) || 180_000),
);

export function createOpenAICompatibleChatFetchTransport(fetchImpl: typeof fetch): OpenAICompatibleChatTransport {
  return async (request) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_COMPATIBLE_CHAT_TIMEOUT_MS);

    try {
      const response = await fetchImpl(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") || "";
      const body = contentType.includes("application/json") ? await response.json() : await response.text();
      return OpenAICompatibleChatTransportResponseSchema.parse({
        ok: response.ok,
        status: response.status,
        body,
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return OpenAICompatibleChatTransportResponseSchema.parse({
        ok: false,
        status: 0,
        body: {
          error: {
            code: aborted ? "timeout" : "network_error",
            message: aborted
              ? `Chat provider request timed out after ${OPENAI_COMPATIBLE_CHAT_TIMEOUT_MS}ms.`
              : error instanceof Error ? error.message : "Chat provider network request failed.",
          },
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

function validateConfig(providerId: ProviderId, config: ProviderConfigForm): ProviderConfigValidation {
  const parsed = ProviderConfigFormSchema.parse(config);
  const missing: (keyof ProviderConfigForm)[] = [];
  const warnings: string[] = [];

  if (parsed.providerId !== providerId) {
    warnings.push(`Config providerId ${parsed.providerId} does not match adapter ${providerId}.`);
  }
  if (!parsed.enabled) missing.push("enabled");
  if (!parsed.apiKey?.trim()) missing.push("apiKey");
  if (
    !parsed.defaultModel?.trim()
    && !parsed.modelSlots.concept?.trim()
    && !getProviderManifest(providerId).modelSlots.concept?.[0]?.trim()
  ) {
    missing.push("defaultModel");
  }

  return {
    ok: missing.length === 0,
    missing,
    warnings,
  };
}

function normalizeBaseUrl(providerId: ProviderId, config: ProviderConfigForm): string {
  if (providerId === "aigocode") return normalizeAigocodeBaseUrl(config.baseUrl);
  if (providerId === "openai") return normalizeOpenAIBaseUrl(config.baseUrl || defaultBaseUrls[providerId] || "");
  return normalizeMimoProviderBaseUrl(providerId, config.baseUrl?.trim() || defaultBaseUrls[providerId] || "");
}

function conceptModel(config: ProviderConfigForm): string {
  return normalizeMimoProviderModel(
    config.providerId,
    config.modelSlots.concept || getProviderManifest(config.providerId).modelSlots.concept?.[0] || config.defaultModel || "gpt-5.5",
  );
}

function configError<T>(providerId: ProviderId, config: ProviderConfigForm): ProviderResult<T> {
  const validation = validateConfig(providerId, config);
  const hasMissingApiKey = validation.missing.includes("apiKey");
  return {
    ok: false,
    error: createProviderError(
      providerId,
      hasMissingApiKey ? "auth_failed" : "missing_config",
      `Provider is missing configuration: ${validation.missing.join(", ")}`,
      {
        userMessage: hasMissingApiKey ? "请先保存 API Key，再生成海报方案。" : "当前供应商配置不完整。",
      },
    ),
  };
}

function transportError<T>(providerId: ProviderId): ProviderResult<T> {
  return {
    ok: false,
    error: createProviderError(providerId, "provider_unavailable", "Chat transport is not connected.", {
      userMessage: "当前供应商的文本生成通道未连接。",
    }),
  };
}

function statusError<T>(providerId: ProviderId, status: number, body: unknown): ProviderResult<T> {
  const message = typeof body === "string"
    ? body
    : body && typeof body === "object" && "error" in body
      ? JSON.stringify((body as Record<string, unknown>).error)
      : JSON.stringify(body);
  const isTransportTimeout = status === 0 && /timeout|timed out|abort/i.test(message);
  return {
    ok: false,
    error: createProviderError(
      providerId,
      status === 401 || status === 403 ? "auth_failed" : isTransportTimeout ? "provider_unavailable" : "unknown",
      message,
      {
        userMessage: status === 401 || status === 403
          ? "API Key 校验失败，请检查供应商和模型。"
          : isTransportTimeout
            ? "供应商方案生成响应超时，请稍后重试或切换更快的方案模型。"
            : "供应商返回错误，方案生成失败。",
      },
    ),
  };
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

function buildBriefMessages(request: BriefGenerationRequest) {
  if (request.context.mode !== "poster") return buildModeBriefMessages(request);
  return buildPosterBriefMessages(request);
}

function buildPosterBriefMessages(request: BriefGenerationRequest) {
  const targetLanguage = request.languageTargets[0] || "en-US";
  const randomizationSeed = request.context.traceId || request.context.jobId || `${Date.now()}`;
  const assets = briefAssetInventory(request);

  return [
    {
      role: "system",
      content: [
        "You are a senior game marketing art director.",
        "Return JSON only. No markdown, no commentary.",
        "Each scheme must include title, brief, prompt, promptZh, promptEn, and slogans.",
        "The title field must be written in Simplified Chinese, even when the slogan target language is English, Japanese, or Korean.",
        "promptZh must be a Chinese image-generation prompt. promptEn must be an English image-generation prompt.",
        "Field separation is mandatory: brief is the user-facing KV main visual plan, with composition, story moment, camera, foreground/midground/background, logo/copy area, and art-direction intent. Do not put meta labels, quality overrides, architecture-template labels, or raw model instructions in brief.",
        "prompt, promptZh, and promptEn are the AI base render instructions derived from the brief. They may contain provider-neutral quality rules, placeholders, reference-identity locks, typography rules, and negative constraints.",
        "languageTargets contains exactly one target slogan language. Return slogans only for that selected language.",
        "Infer each uploaded asset's semantic poster duty from semanticRole, role, label, and description: protagonist, antagonist, brandLogo, prop, environment, styleReference, compositionReference, keySubject, or supportingAsset.",
        "If multiple assets share semanticRole protagonist/gameCharacter, each one is an independent game character reference. When 2-4 protagonist assets are listed, every poster scheme and image prompt must include every uploaded protagonist placeholder / every listed protagonist placeholder as separate readable characters; never merge, omit, average, or treat one as a tiny decoration.",
        "Aim for premium game campaign key visual polish while respecting uploaded or selected art style.",
        "Do not plan duplicate large/small copies of the same uploaded character, BOSS, or logo.",
        "When protagonist/gameCharacter assets are present, visible hero/player characters must come from those uploaded references only. Do not invent extra heroes, helpers, or generic human mascots.",
        "If only one protagonist/gameCharacter asset is present, plan exactly one playable hero. Do not write squad, team, allies, or multiple heroes unless multiple protagonist assets are listed.",
        "Do not write a scheme where uploaded playable characters are only back-facing, hidden, tiny, or looking away. Their faces, expressions, body language, and signature props must be readable in front view, 3/4 front view, or strong profile.",
        posterFocalHierarchyLock(),
        posterHeroPerformanceScaleLock(),
        posterIdentitySafeMotionRule(),
        posterSubjectAccessoryStrictnessLock(),
        "Do not write schemes that preserve the exact uploaded front-facing/static pose. Identity is locked, but posture should become a new performance: 3/4 turn, stride, leap, recoil, attack wind-up, defensive block, grip/contact, landing dust, or foreshortened prop/tool angle.",
        "For uploaded BOSS/key-subject assets, plan a threat performance rather than a scaled-up sticker: lunge, brace, swing, burst through a doorway, land with dust, or react to impact while preserving the uploaded silhouette and signature details.",
        "Never make a scheme depend on static standee staging such as the hero simply standing on a divider and the BOSS merely pressing in from one side. Convert those ideas into a trailer moment with sprinting, blocking, sliding, impact, doorway/portal burst, or weapon/prop collision.",
        posterStaticSchemeLanguageBan(),
        "When uploaded character/BOSS/logo assets are present, image prompts must use placeholders such as [Game Character 1], [Game Character 2], [Boss], and [Game Logo] instead of describing hair, face, clothes, gender, skin, colors, or exact logo lettering.",
        "If a placeholder needs a role noun, use generic role language only. Do not attach descriptive appearance clauses to placeholders; the uploaded image reference defines identity and visual details.",
        "Never ask the image model to add age, beard, mustache, hairstyle changes, costume changes, body-type changes, or generic person redesigns to uploaded characters.",
        "Each image prompt should describe actions, camera, composition, environment interaction, VFX, lighting, and story tension around those placeholders, and must forbid plain overlay/PPT typography.",
        posterLogoSingleUseLock(),
        posterTextEconomyLock(),
        posterInWorldBrandTreatmentLock(),
        "Treat focusGuidance as soft creative emphasis only. It must not override uploaded identity references, assigned KV architecture, story readability, or production-quality composition.",
        "When focusGuidance is active/non-empty, every scheme brief and image prompt must visibly translate at least one focus item into a concrete camera, action, environment, prop, lighting, slogan, or copy-area decision.",
        "Every scheme must carry a real art-direction blueprint: camera/lens/perspective, layered depth, key/fill/rim lighting, volumetric atmosphere, particles/VFX, contact/cast shadows, color/value grouping, material texture, and logo/typography integration.",
        posterCinematicKvQualityDirective(),
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Generate poster design schemes for batch image generation.",
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
          "Generate NEW random poster schemes for this batch.",
          "Assign the requiredKvArchitectureSlots in order: scheme 1 uses slot 1, scheme 2 uses slot 2, and so on. The slot is mandatory and must be visible in both brief and image prompt.",
          "brief must read like KV 主视觉详细策划: describe the scene design, layout, storytelling, camera, background, character/BOSS performance, and logo/copy safe area. Do not write phrases such as KV architecture master, Cinematic Game KV Quality Override, Mandatory KV Composition Architecture Override, movie-grade enhancement, AI render base, negative prompt, or other low-level model command labels in brief.",
          "prompt/promptZh/promptEn must read like AI 底层渲染指令: convert the brief into concrete image-generation instructions with placeholders, action, camera, lighting, VFX, style, logo/slogan treatment, and exclusions.",
          "Treat focusGuidance as a soft creative lens, not a literal mandatory scene. If it mentions giant scale, micro perspective, or scale, reinterpret it as scale drama/camera energy and vary the architecture; do not make every scheme a flat side-view battlefield.",
          "When focusGuidance is active/non-empty, every scheme brief and every image prompt must visibly translate at least one focus item into a concrete camera, action, environment, prop, lighting, slogan, or copy-area decision. Do not ignore active focus guidance.",
          "Every scheme brief must include a concrete shot blueprint: foreground framing, uploaded hero performance, BOSS pressure, world context, logo/copy safe area, and camera angle.",
          "Every scheme brief must include a production design blueprint: camera height/lens feel/perspective, foreground-midground-background layers, key/fill/rim lighting, volumetric haze, particles/VFX, cast/contact shadows, color/value grouping, material texture, and typography/logo integration.",
          posterSchemeBlueprintRequirement(),
          posterFocalHierarchyLock(),
          posterTextEconomyLock(),
          posterInWorldBrandTreatmentLock(),
          "For every uploaded asset, explicitly honor its semantic duty. Protagonists carry performance; antagonists carry threat/scale; brandLogo assets stay readable and scene-integrated; prop assets become used story objects; environment assets guide world design; styleReference controls rendering; compositionReference controls layout only.",
          "For uploaded brandLogo/gameLogo assets, render the exact logo visual design and letterform rhythm only when spelling can stay accurate. Do not ask the image model to invent look-alike words, substitute letters, or create a fake replacement logo; use a polished blank logo-safe sign/title plate if exact spelling cannot be guaranteed.",
          posterLogoSingleUseLock(),
          posterTextEconomyLock(),
          posterInWorldBrandTreatmentLock(),
          posterCinematicKvQualityDirective(),
          "Every image prompt must carry that production design forward as explicit image instructions, not as a generic one-sentence scene description.",
          "Every scheme must stage a memorable physical set piece from the current project: town, base, battlefield, cliffs, tunnels, portal, doorway breach, route, command area, machine room, fortress, settlement, arena, or objective zone. Avoid empty pastel sky, generic backdrop, unrelated sample-project scenery, and centered mascot-ad composition.",
          "At least one uploaded hero must physically interact with the BOSS or environment: blocking, climbing, striking, sliding, casting, repairing, piloting, pulling, defending, or causing visible impact. Do not place heroes as symmetrical floating stickers around a central BOSS.",
          "Every image prompt must include a KV quality self-check: one-second readability, strong thumbnail silhouette, obvious story conflict, layered depth, directional lighting, and no cheap sticker collage.",
          "Each scheme should have one coherent story scene, strong focal hierarchy, layered depth, cinematic lighting, polished color grading, and campaign-ready logo/slogan safe areas.",
          "Every scheme must explicitly use its assigned high-impact KV composition architecture. Do not substitute a generic tiny-heroes-on-landscape concept unless the assigned slot itself asks for giant-scale pressure.",
          posterKvArchitectureDiversityRequirement(),
          "Use divergent story-composition archetypes across the batch, such as boss encounter, base siege, resource raid, wilderness chase, town defense, portal discovery, victory payoff, caravan expedition, route push, upgrade crisis, or training-to-boss-fight contrast.",
          "Batch diversity hard lock: each scheme brief must explicitly name a different scenarioFamily, mission objective, location family, camera grammar, BOSS/threat role, and emotional beat. No two schemes may share the same central set-piece or the same 'hero faces BOSS in a fiery tunnel/arena' template.",
          "If uploaded BOSS assets are present, they may recur for identity continuity, but their story function must change across schemes: attacker, silhouette beyond a portal, route blocker, objective disruptor, aftermath trophy, base-siege pressure, or environmental hazard. Do not repeat the same centered lunging BOSS composition.",
          "Do not default to a simple horizontal scene with heroes standing left and right on a flat surface. Giant-scale scenery can be used only when it creates scale drama, foreground framing, vertical layers, danger, and a clear story beat.",
          "Every scheme must have a unique title, unique visual direction, unique image prompt, unique camera angle, and unique story moment. Do not reuse the same sentence template across schemes.",
          "Every scheme title must be concise Simplified Chinese, 6-16 Chinese characters when possible. Do not return English titles such as Comic Panel, Oven Portal, Ambush, or Break In.",
          "Avoid flat sticker collage, cheap clip-art composition, floating elements, tabletop wallpaper, unrelated sample-project scenery, random extra mascots, generic replacement characters, and duplicate copies of uploaded assets.",
          "If exactly one protagonist/gameCharacter asset is listed, design around [Game Character 1] as the only playable hero. Multiple-hero language is forbidden in that case.",
          "If two or more protagonist/gameCharacter assets are listed, every scheme brief and every image prompt must visibly use every uploaded protagonist placeholder, such as [Game Character 1] and [Game Character 2], as separate readable characters in the same scene. The image fails if one uploaded character is omitted, hidden, merged, or reduced to a small logo-like decoration.",
          posterFocalHierarchyLock(),
          posterHeroPerformanceScaleLock(),
          posterSubjectAccessoryStrictnessLock(),
          "Do not write back-facing-only or looking-away hero staging. Uploaded character faces must be readable in front view, 3/4 front view, or strong profile.",
          "Do not preserve the exact uploaded static pose as the final performance. Keep identity, but ask for a new body line, stride, block, leap, recoil, swing, contact point, or foreshortened prop/tool angle.",
          posterStaticSchemeLanguageBan(),
          "The BOSS prompt must describe a real threat action or physical reaction, not a still mascot pose enlarged beside the scene.",
          "If a scheme uses a split-world divider, the hero must actively cross, block on, slide along, leap from, or collide with that divider; the BOSS must lunge, strike, burst through, or recoil from impact rather than simply stand on the opposite side.",
          "Never add age shifts, beard/mustache, hairstyle changes, costume changes, body-type changes, or generic person redesigns to uploaded character placeholders.",
          "For every protagonist/gameCharacter prompt, use placeholders and state that the placeholder preserves the uploaded reference identity/model sheet, without spelling out physical details.",
          "For every antagonist/BOSS/key-subject prompt, use the [Boss] or key-subject placeholder and state that it preserves the uploaded identity from its reference, without redesigning it.",
          "When describing a placeholder's action, do not name a specific uploaded tool, weapon, costume, face, or body feature in text. Say the placeholder uses its uploaded signature prop/tool only if visible in the reference, and let the image reference define what that prop/tool is.",
          "For slogan or headline text, require a visible copy treatment: custom game-campaign lettering integrated into the scene when clean spelling is possible, or a polished blank title plate/ribbon in the copy area if clean spelling cannot be guaranteed. Never silently omit the copy area, never request fake logo text, and never request plain overlay/PPT typography.",
          imageRenderableSloganRule(targetLanguage),
          "The slogan phrase must be derived from the assigned scheme's story beat, action verb, threat, prop, or set-piece material, so it feels written for that exact KV rather than pasted in later. Avoid generic three-part lists; prefer concrete copy such as a weapon/portal/impact/objective/BOSS-action phrase when those elements define the scheme.",
          integratedSloganTreatmentRule(),
          "If a richer campaign line is needed, put that sentence in brief/prompt only; the slogans field must stay short enough to render cleanly inside one poster image.",
          "Do not assume a logo exists unless an asset with semanticRole brandLogo is present.",
          "If no image assets are provided, create concepts from project description and focus guidance only.",
          "Use multiple protagonist/gameCharacter assets as separate characters in poster schemes; do not choose only one uploaded character when multiple playable references are provided.",
          "Respect creativeDirection for selected style tags, output sizes, composition/reference analysis, and prompt constraints.",
          `Return exactly one slogan language: ${targetLanguage}.`,
        ],
        outputShape: {
          schemes: [
            {
              title: "Chinese poster scheme title",
              brief: "Chinese visual direction and layout plan",
              prompt: "Image prompt suitable for the selected image model",
              promptZh: "Chinese image prompt",
              promptEn: "English image prompt",
              slogans: {
                [targetLanguage]: "scene-derived 3-8 word image-renderable slogan",
              },
            },
          ],
        },
      }),
    },
  ];
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
    "Every scheme title must be concise Simplified Chinese. Do not return an English title.",
  ];

  if (mode === "icon") {
    return [
      ...shared,
      "Icon mode hard lock: 1:1 square, one single dominant subject, no text, no logo lettering, no captions, no poster scene, no multi-character battle, no empty corner padding, no white border, and no separate container that shrinks the subject. Rounded corners are acceptable when intentional and polished.",
      "Icon prompt must prioritize bold silhouette, simple readable shape, high contrast, minimal background detail, full-bleed square composition, crisp focal detail, and 64px readability.",
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

function buildModeBriefMessages(request: BriefGenerationRequest) {
  const targetLanguage = request.languageTargets[0] || "en-US";
  const randomizationSeed = request.context.traceId || request.context.jobId || `${Date.now()}`;
  const assets = briefAssetInventory(request);
  const mode = request.context.mode;

  return [
    {
      role: "system",
      content: [
        "You are a senior game creative production director.",
        "Return JSON only. No markdown, no commentary.",
        "Each scheme must include title, brief, prompt, promptZh, promptEn, and slogans.",
        "The title field must be written in Simplified Chinese, regardless of slogan language.",
        "promptZh must be a Chinese image-generation prompt. promptEn must be an English image-generation prompt.",
        "This request is mode-specific. Do not inherit poster/KV architecture rules unless mode is poster.",
        "Do not plan pasted overlays. Uploaded assets are identity, brand, style, composition, or subject references that should be redrawn naturally according to the current mode.",
        modeBriefIdentityRule(mode),
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
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
        assets,
        rules: modeBriefRules(mode, targetLanguage),
        outputShape: modeBriefOutputShape(mode, targetLanguage),
      }),
    },
  ];
}

function contentToString(content: string | unknown[] | undefined): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object" && "text" in part) return String((part as Record<string, unknown>).text || "");
    return "";
  }).join("");
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

function parseBriefContent(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  return BriefCompletionSchema.parse(coerceBriefCompletion(JSON.parse(fenced || trimmed)));
}

const genericPosterFallbackBeats = [
  {
    title: "Hero Breach Clash",
    action: "The uploaded hero pushes through a dramatic breach while the uploaded boss/key threat erupts from the opposite side, creating a clear collision moment tied to the current game's premise.",
    camera: "Low-angle 24mm wide shot with a foreground project-specific prop or terrain break, midground hero impact, and background threat reveal.",
    slogan: "Break Through the Siege",
  },
  {
    title: "Base Under Siege",
    action: "The current project's town, base, settlement, squad line, or protected objective is under pressure while the uploaded hero defends against the boss/key threat.",
    camera: "Wide siege composition with foreground barricade or route marker, midground hero defense, and background enemy pressure with smoke, sparks, and rim light.",
    slogan: "Hold the Town Together",
  },
  {
    title: "Route Push Ambush",
    action: "The uploaded hero advances along a project-specific road, bridge, battlefield lane, forest path, or tactical route while the boss/key threat ambushes from the route ahead.",
    camera: "Dynamic chase camera with strong motion path, foreground debris, readable hero action, and the boss blocking the horizon line.",
    slogan: "Push the Route Home",
  },
  {
    title: "Giant Threat Pressure",
    action: "A giant project-specific enemy, machine, structure, spell, or obstacle looms over the uploaded hero, creating forced-perspective scale drama without changing the uploaded identities.",
    camera: "Extreme near-far perspective with foreground scale cue, midground readable hero, and background oversized threat casting shadow across the scene.",
    slogan: "Face the Giant Pressure",
  },
  {
    title: "Objective Victory Payoff",
    action: "The uploaded hero secures a key objective seconds after a hard fight, with the boss/key threat defeated or pushed back and the campaign logo area integrated into the scene.",
    camera: "Heroic center composition with foreground aftermath, midground hero performance, and background world context that explains the game's core loop.",
    slogan: "Claim the Hard-Won Prize",
  },
  {
    title: "Portal Discovery",
    action: "The uploaded hero discovers or activates a project-specific gate, relic, screen, map route, magical opening, or strategic objective while danger appears beyond it.",
    camera: "Over-the-shoulder discovery shot with glowing reveal, layered depth, readable hero reaction, and the boss/key threat visible beyond the opening.",
    slogan: "Enter the Hidden Fight",
  },
];

function createGenericPosterFallbackScheme(request: BriefGenerationRequest, index: number): BriefScheme {
  const targetLanguage = request.languageTargets[0] || "en-US";
  const beat = genericPosterFallbackBeats[index % genericPosterFallbackBeats.length]!;
  const title = `${beat.title} ${index + 1}`;
  const projectLine = request.gameDescription
    ? `Project premise: ${request.gameDescription}`
    : `Project premise: ${request.projectName}`;
  const prompt = [
    "Cinematic game campaign key visual, redraw uploaded assets as one integrated illustration, no sticker collage.",
    projectLine,
    beat.camera,
    beat.action,
    "Preserve uploaded character, boss, prop, environment, and logo identities while changing only pose, action, camera, lighting, scale, and scene integration.",
    "Use one campaign-safe logo/copy area. If exact spelling is unsafe, reserve a polished blank title plate or banner instead of fake text.",
    "Foreground-midground-background depth, key/rim light, atmospheric haze, project-specific particles, debris, contact shadows, and motion trails.",
    "Do not introduce scenery from an unrelated sample project. Use only the current project description and uploaded assets as the source of truth.",
  ].join(" ");

  return {
    title,
    brief: `${title}: ${beat.action} ${beat.camera}`,
    prompt,
    promptZh: prompt,
    promptEn: prompt,
    slogans: targetLanguage === "zh-CN" ? { [targetLanguage]: title.slice(0, 16) } : { [targetLanguage]: beat.slogan },
  };
}

function createModeFallbackScheme(request: BriefGenerationRequest, index: number): BriefScheme {
  const mode = request.context.mode;
  const targetLanguage = request.languageTargets[0] || "en-US";
  const title = mode === "icon"
    ? `单主体图标方案 ${index + 1}`
    : mode === "logo"
      ? `品牌标识方案 ${index + 1}`
      : mode === "announcement"
        ? `公告版式方案 ${index + 1}`
        : `联名互动方案 ${index + 1}`;
  const prompt = [
    `${mode} mode fallback scheme ${index + 1}.`,
    modeBriefIdentityRule(mode),
    "Use uploaded assets as references only, redraw naturally for the mode, and keep this scheme visually distinct from the others.",
  ].join(" ");
  return {
    title,
    brief: `${title}：当供应商返回方案不足时自动补齐，保持当前模式目标和素材职责。`,
    prompt,
    promptZh: prompt,
    promptEn: prompt,
    slogans: mode === "icon" || mode === "logo" ? {} : { [targetLanguage]: title },
  };
}

function ensureBriefSchemeCount(parsed: z.infer<typeof BriefCompletionSchema>, request: BriefGenerationRequest): z.infer<typeof BriefCompletionSchema> {
  const schemes = parsed.schemes.slice(0, request.schemeCount);
  for (let index = schemes.length; index < request.schemeCount; index += 1) {
    schemes.push(request.context.mode === "poster"
      ? createGenericPosterFallbackScheme(request, index)
      : createModeFallbackScheme(request, index));
  }
  return {
    ...parsed,
    schemes,
  };
}

function normalizePosterSchemes(parsed: z.infer<typeof BriefCompletionSchema>, request: BriefGenerationRequest) {
  const completed = ensureBriefSchemeCount(parsed, request);
  const targetLanguage = request.languageTargets[0] || "en-US";
  const seed = request.context.traceId || request.context.jobId || `${Date.now()}`;
  const assetCounts = posterKvAssetCountsFromAssets(request.assets);
  return completed.schemes.slice(0, request.schemeCount).map((scheme, index) => {
    const title = sanitizePosterSchemeText(scheme.title) || scheme.title;
    const brief = sanitizePosterSchemeText(scheme.brief) || scheme.brief;
    const prompt = sanitizePosterSchemeText(scheme.prompt) || scheme.prompt;
    const promptZh = sanitizePosterSchemeText(scheme.promptZh || scheme.prompt) || prompt;
    const promptEn = sanitizePosterSchemeText(scheme.promptEn || scheme.prompt) || prompt;
    const architectureSeed = posterKvArchitectureSlotSeed(seed, index);
    const renderAugmentation = posterKvRenderPromptAugmentation({
      seed: architectureSeed,
      assetCounts,
      preferredText: [brief, prompt, promptZh, promptEn].join("\n"),
    });
    const slogans = Object.fromEntries(
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
	      brief: trimBriefTextAtBoundary(brief, 1800),
	      prompt: trimBriefTextAtBoundary(`${renderAugmentation}\n\n${prompt}`, 8000),
	      promptZh: trimBriefTextAtBoundary(`${renderAugmentation}\n\n${promptZh}`, 8000),
	      promptEn: trimBriefTextAtBoundary(`${renderAugmentation}\n\n${promptEn}`, 8000),
	      slogans,
	    };
  });
}

function modeQualityLock(mode: BriefGenerationRequest["context"]["mode"]): { brief: string; prompt: string } {
  switch (mode) {
    case "icon":
      return {
        brief: "Icon 模式锁定：1:1 方形、单一主主体、无文字、无海报/KV 场景、低背景复杂度、64px 仍可读；圆角可接受但不能有白边或劣质容器框。",
        prompt: "ICON MODE ONLY: create a premium 1:1 game/app icon, one single dominant subject, absolutely no text or logo lettering, no poster scene, no multi-character battle, full-bleed square composition, no white border or accidental padding, minimal background, high contrast, readable at 64px. Rounded corners are acceptable when intentional and polished.",
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

function trimBriefTextAtBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength).trimEnd();
  const boundary = Math.max(
    clipped.lastIndexOf("\n\n"),
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("。"),
    clipped.lastIndexOf("; "),
    clipped.lastIndexOf("；"),
    clipped.lastIndexOf(" "),
  );
  return (boundary > maxLength * 0.72 ? clipped.slice(0, boundary + 1) : clipped).trimEnd();
}

function normalizeModeSchemes(parsed: z.infer<typeof BriefCompletionSchema>, request: BriefGenerationRequest) {
  const completed = ensureBriefSchemeCount(parsed, request);
  const targetLanguage = request.languageTargets[0] || "en-US";
  const mode = request.context.mode;
  const qualityLock = modeQualityLock(mode);
  return completed.schemes.slice(0, request.schemeCount).map((scheme) => {
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
	      brief: trimBriefTextAtBoundary(`${qualityLock.brief}\n${brief}`, 1800),
	      prompt: trimBriefTextAtBoundary(`${qualityLock.prompt}\n\n${prompt}`, 18000),
	      promptZh: trimBriefTextAtBoundary(`${qualityLock.prompt}\n\n${promptZh}`, 18000),
	      promptEn: trimBriefTextAtBoundary(`${qualityLock.prompt}\n\n${promptEn}`, 18000),
	      slogans,
	    };
  });
}

function normalizeSchemes(parsed: z.infer<typeof BriefCompletionSchema>, request: BriefGenerationRequest) {
  if (request.context.mode === "poster") return normalizePosterSchemes(parsed, request);
  return normalizeModeSchemes(parsed, request);
}

export function createOpenAICompatibleBriefAdapter(options: OpenAICompatibleBriefAdapterOptions): GenerationProviderAdapter {
  const providerId = options.providerId;
  const manifest = getProviderManifest(providerId);
  const now = options.now || Date.now;

  return {
    manifest,

    validateConfig(config) {
      return validateConfig(providerId, config);
    },

    async healthCheck(config): Promise<ProviderResult<ProviderHealthResponse>> {
      const validation = validateConfig(providerId, config);
      return {
        ok: true,
        value: ProviderHealthResponseSchema.parse({
          providerId,
          ok: validation.ok && Boolean(options.transport),
          status: validation.ok && options.transport ? "ready" : "not_configured",
          message: validation.ok ? "文本方案生成通道已配置。" : `缺少配置：${validation.missing.join(", ")}`,
        }),
      };
    },

    async generateBrief(request: BriefGenerationRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderBriefResponse>> {
      const parsedRequest = BriefGenerationRequestSchema.parse(request);
      const parsedConfig = ProviderConfigFormSchema.parse(config);
      const validation = validateConfig(providerId, parsedConfig);
      if (!manifest.capabilities.includes("briefGeneration")) {
        return {
          ok: false,
          error: createProviderError(providerId, "unsupported_capability", `${providerId} does not support briefGeneration.`, {
            userMessage: "当前供应商不支持方案生成。",
          }),
        };
      }
      if (!validation.ok) return configError(providerId, parsedConfig);
      if (!options.transport) return transportError(providerId);

      const baseUrl = normalizeBaseUrl(providerId, parsedConfig);
      if (!baseUrl) return configError(providerId, parsedConfig);

      const model = conceptModel(parsedConfig);
      const startedAt = now();
      const transportResponse = await options.transport(
        OpenAICompatibleChatTransportRequestSchema.parse({
          url: `${baseUrl}${CHAT_COMPLETIONS_PATH}`,
          method: "POST",
          headers: {
            Authorization: `Bearer ${(parsedConfig.apiKey || "").trim()}`,
            "Content-Type": "application/json",
          },
          body: {
            model,
            messages: buildBriefMessages(parsedRequest),
            temperature: 0.85,
          },
        }),
      );
      const parsedTransportResponse = OpenAICompatibleChatTransportResponseSchema.parse(transportResponse);
      if (!parsedTransportResponse.ok) return statusError(providerId, parsedTransportResponse.status, parsedTransportResponse.body);

      try {
        const response = ChatCompletionResponseSchema.parse(parsedTransportResponse.body);
        const content = contentToString(response.choices[0]?.message?.content);
        const parsedBrief = parseBriefContent(content);
        return {
          ok: true,
          value: ProviderBriefResponseSchema.parse({
            providerId,
            model,
            schemes: normalizeSchemes(parsedBrief, parsedRequest),
            usage: {
              promptTokens: response.usage?.prompt_tokens || response.usage?.total_tokens || 0,
              elapsedMs: Math.max(0, now() - startedAt),
            },
          }),
        };
      } catch (error) {
        return {
          ok: false,
          error: createProviderError(providerId, "unknown", error instanceof Error ? error.message : "Invalid brief response.", {
            userMessage: "供应商返回的方案结构无法解析。",
          }),
        };
      }
    },
  };
}
