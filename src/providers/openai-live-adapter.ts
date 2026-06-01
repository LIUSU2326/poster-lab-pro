import { z } from "zod";
import { ProviderConfigFormSchema, type ProviderConfigForm } from "../schema/zod";
import {
  ImageGenerationRequestSchema,
  ProviderHealthResponseSchema,
  ProviderImageResponseSchema,
  ProviderResultAssetSchema,
  createProviderError,
  type GenerationProviderAdapter,
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
  modeAssetFusionDirective,
} from "../assets/semantic-roles";

const OPENAI_PROVIDER_ID = "openai" as const;
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const OPENAI_IMAGE_GENERATIONS_PATH = "/images/generations";

const OpenAIImageDataSchema = z
  .object({
    url: z.string().url().optional(),
    b64_json: z.string().min(1).optional(),
    revised_prompt: z.string().optional(),
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
  body: z.record(z.string(), z.unknown()),
});

export const OpenAIImageTransportResponseSchema = z.object({
  ok: z.boolean(),
  status: z.number().int(),
  body: z.unknown(),
});

export type OpenAIImageGenerationResponse = z.infer<typeof OpenAIImageGenerationResponseSchema>;
export type OpenAIImageTransportRequest = z.infer<typeof OpenAIImageTransportRequestSchema>;
export type OpenAIImageTransportResponse = z.infer<typeof OpenAIImageTransportResponseSchema>;
export type OpenAIImageTransport = (
  request: OpenAIImageTransportRequest,
) => Promise<OpenAIImageTransportResponse>;

export type OpenAILiveImageAdapterOptions = {
  transport?: OpenAIImageTransport;
  now?: () => number;
};

function validateOpenAIConfig(config: ProviderConfigForm): ProviderConfigValidation {
  const parsed = ProviderConfigFormSchema.parse(config);
  const missing: (keyof ProviderConfigForm)[] = [];
  const warnings: string[] = [];

  if (parsed.providerId !== OPENAI_PROVIDER_ID) {
    warnings.push(`Config providerId ${parsed.providerId} does not match adapter ${OPENAI_PROVIDER_ID}.`);
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

function normalizeBaseUrl(config: ProviderConfigForm): string {
  return (config.baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
}

function imageModel(request: ImageGenerationRequest, config: ProviderConfigForm): string {
  return request.model || config.modelSlots.image || config.defaultModel || "gpt-image-2";
}

function modeQualityInstruction(request: ImageGenerationRequest): string {
  switch (request.context.mode) {
    case "icon":
      return [
        "Quality bar: premium game/app icon, one dominant subject silhouette, minimal background, crisp focal detail, strong value contrast, and 64px readability.",
        "Composition bar: perfect 1:1 square, full-bleed icon framing, no text, no logo lettering, no captions, no UI copy, and no poster scene complexity.",
      ].join(" ");
    case "logo":
      return [
        "Quality bar: premium game logo/mark system, readable wordmark or emblem construction, crisp bevel/material finish, clean silhouette, and brand-safe typography.",
        "Composition bar: logo/wordmark is primary on a clean solid-color background when requested; props, characters, or uploaded logo references may influence motifs but must not become a poster scene.",
        "Logo text safety: do not invent fake replacement lettering for uploaded logo references; preserve exact spelling only when reliable, otherwise design a clean copy-safe mark or blank wordmark treatment.",
      ].join(" ");
    case "announcement":
      return [
        "Quality bar: readable in-game announcement or event visual with strong copy hierarchy, clean title/copy safe area, and polished UI/event art direction.",
        "Composition bar: uploaded subjects support the announcement surface without covering headline or key copy.",
      ].join(" ");
    case "collab":
      return [
        "Quality bar: premium collaboration campaign visual with two identities kept separate but unified by shared lighting, materials, scene, and interaction story.",
        "Composition bar: dual-character and dual-logo balance without merging identities or creating fake hybrid marks.",
      ].join(" ");
    case "poster":
    default:
      return [
        "Quality bar: premium game campaign key visual polish adapted to the active art style.",
        "Use cinematic lighting, layered foreground/midground/background depth, refined material detail, crisp focal hierarchy, polished color grading, and campaign-ready logo/slogan safe areas.",
        "Poster integrated KV style lock: generate a stylized illustrated game world matching the uploaded character art direction by description. Use rounded readable shapes, clean graphic silhouettes, soft cel/painterly shading, vibrant appetizing colors, fantasy edible-world terrain, expressive character acting, and a clear hero-vs-BOSS story moment. Use the full requested canvas as artwork. Do not use photorealistic pizza macro photography, realistic 3D food render, stock-photo background, duplicate assets, generic replacement heroes, black bars, letterbox bands, or border frames.",
      ].join(" ");
  }
}

function imagePrompt(request: ImageGenerationRequest): string {
  const hasPosterMode = request.context.mode === "poster";
  const fusionDirective = request.assets.length ? modeAssetFusionDirective(request.context.mode, request.assets) : "";
  const referenceInstruction = modeReferenceInstruction(request);
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
  return [request.prompt, qualityInstruction, assetInstruction, negativeInstruction].filter(Boolean).join("\n\n");
}

function hasSemanticRole(request: ImageGenerationRequest, role: ReturnType<typeof assetSemanticRole>): boolean {
  return request.assets.some((asset) => assetSemanticRole(asset) === role);
}

function modeReferenceInstruction(request: ImageGenerationRequest): string {
  switch (request.context.mode) {
    case "icon":
      return "Icon reference handling: choose one dominant uploaded subject or motif and simplify/redraw it into a clean 1:1 icon silhouette. Do not create a poster scene, multi-character battle, copied sticker, or any text.";
    case "logo":
      return "Logo reference handling: use uploaded assets as brand continuity, motif, material, or shape references for a wordmark/mark system. Do not turn them into a scene or pasted collage.";
    case "announcement":
      return "Announcement reference handling: use uploaded assets as supporting art around a readable copy-safe announcement panel. Do not cover the title/copy area or generate garbled operational text.";
    case "collab":
      return "Collab reference handling: keep uploaded characters and logos as separate identities unified by one scene, shared lighting, materials, and interaction. Do not merge identities or create hybrid marks.";
    case "poster":
    default:
      return "Use each uploaded character, BOSS/key subject, and logo once as an integrated in-world element. Do not create duplicate large/small copies or sticker-like pasted versions of the same asset.";
  }
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
      return "Character roster lock: visible hero/player characters must come from uploaded gameCharacter references only. Do not add generic chef heroes, random human mascots, or replacement player characters.";
  }
}

function modeSpecificBrandLogoInstruction(request: ImageGenerationRequest): string {
  if (!hasSemanticRole(request, "brandLogo")) return "";
  switch (request.context.mode) {
    case "icon":
      return "Icon logo rule: uploaded logos may guide color, symbol shape, or brand style, but icon mode must not render logo lettering or readable text.";
    case "logo":
      return "Logo text safety: uploaded logos guide brand continuity. Preserve exact spelling only when reliable; otherwise design a clean copy-safe mark or blank wordmark treatment. Do not invent fake replacement lettering.";
    case "announcement":
      return "Announcement logo rule: use uploaded logos as small clean lockups or reserved brand-safe areas, never as fake repeated watermark text.";
    case "collab":
      return "Collab logo rule: keep each uploaded logo/brand identity separate and readable; do not fuse two logos into one fake hybrid mark.";
    case "poster":
    default:
      return "Logo text safety: use the exact uploaded logo only when lettering can stay accurate; otherwise reserve a polished blank logo-safe title plate/sign that fits the scene. Do not invent fake logo words, substitute letters, or generate garbled text.";
  }
}

function imageSize(request: ImageGenerationRequest): string {
  return `${request.width}x${request.height}`;
}

function missingConfigResult<T>(config: ProviderConfigForm): ProviderResult<T> {
  const validation = validateOpenAIConfig(config);
  const hasMissingApiKey = validation.missing.includes("apiKey");

  return {
    ok: false,
    error: createProviderError(
      OPENAI_PROVIDER_ID,
      hasMissingApiKey ? "auth_failed" : "missing_config",
      `OpenAI live adapter is missing configuration: ${validation.missing.join(", ")}`,
      {
        userMessage: hasMissingApiKey
          ? "OpenAI API key is required before live image generation."
          : "OpenAI provider configuration is incomplete.",
      },
    ),
  };
}

function unavailableTransportResult<T>(): ProviderResult<T> {
  return {
    ok: false,
    error: createProviderError(
      OPENAI_PROVIDER_ID,
      "provider_unavailable",
      "OpenAI live adapter requires an injected HTTP transport before network execution.",
      {
        userMessage: "OpenAI live execution is not connected in this environment.",
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
          type: z.string().optional(),
          code: z.union([z.string(), z.number()]).optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .safeParse(body);
  const providerMessage = parsedError.success ? parsedError.data.error?.message : undefined;
  const message = providerMessage || `OpenAI image generation failed with HTTP ${status}.`;

  if (status <= 0) {
    return {
      ok: false,
      error: createProviderError(OPENAI_PROVIDER_ID, "provider_unavailable", message, {
        retryable: true,
        userMessage: "OpenAI network request failed. Check proxy, VPN, or provider connectivity.",
      }),
    };
  }

  if (status === 401 || status === 403) {
    return {
      ok: false,
      error: createProviderError(OPENAI_PROVIDER_ID, "auth_failed", message, {
        userMessage: "OpenAI authentication failed. Check the API key and provider access.",
      }),
    };
  }

  if (status === 429) {
    return {
      ok: false,
      error: createProviderError(OPENAI_PROVIDER_ID, "rate_limited", message, {
        retryable: true,
        userMessage: "OpenAI rate limit was reached. Retry after the provider limit resets.",
      }),
    };
  }

  if (status === 402) {
    return {
      ok: false,
      error: createProviderError(OPENAI_PROVIDER_ID, "quota_exceeded", message, {
        userMessage: "OpenAI quota or billing limit was reached.",
      }),
    };
  }

  if (status >= 500) {
    return {
      ok: false,
      error: createProviderError(OPENAI_PROVIDER_ID, "provider_unavailable", message, {
        retryable: true,
        userMessage: "OpenAI is temporarily unavailable. Retry later.",
      }),
    };
  }

  return {
    ok: false,
    error: createProviderError(OPENAI_PROVIDER_ID, "invalid_request", message, {
      userMessage: "OpenAI rejected the image generation request.",
    }),
  };
}

function parseImageResponse(
  request: ImageGenerationRequest,
  model: string,
  body: unknown,
  elapsedMs: number,
): ProviderResult<ProviderImageResponse> {
  const parsed = OpenAIImageGenerationResponseSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      error: createProviderError(OPENAI_PROVIDER_ID, "invalid_request", "OpenAI image response did not match the expected schema.", {
        userMessage: "OpenAI returned an unexpected image response.",
      }),
    };
  }

  const assets = parsed.data.data
    .map((item, index) => {
      const rawAsset: Record<string, unknown> = {
        id: `openai-${request.context.traceId || request.context.jobId || request.schemeId}-${index + 1}`,
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
      error: createProviderError(OPENAI_PROVIDER_ID, "invalid_request", "OpenAI image response did not include URL or base64 assets.", {
        userMessage: "OpenAI returned no usable image assets.",
      }),
    };
  }

  return {
    ok: true,
    value: ProviderImageResponseSchema.parse({
      providerId: OPENAI_PROVIDER_ID,
      model,
      assets,
      usage: {
        imageCount: assets.length,
        elapsedMs,
      },
    }),
  };
}

export function createOpenAIHttpTransport(fetchImpl: typeof fetch): OpenAIImageTransport {
  return async (request) => {
    const parsed = OpenAIImageTransportRequestSchema.parse(request);
    let response: Response;
    try {
      response = await fetchImpl(parsed.url, {
        method: parsed.method,
        headers: parsed.headers,
        body: JSON.stringify(parsed.body),
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

    return OpenAIImageTransportResponseSchema.parse({
      ok: response.ok,
      status: response.status,
      body,
    });
  };
}

export function createOpenAILiveImageAdapter(options: OpenAILiveImageAdapterOptions = {}): GenerationProviderAdapter {
  const manifest = getProviderManifest(OPENAI_PROVIDER_ID);
  const now = options.now || Date.now;

  return {
    manifest,

    validateConfig(config) {
      return validateOpenAIConfig(config);
    },

    async healthCheck(config): Promise<ProviderResult<ProviderHealthResponse>> {
      const validation = validateOpenAIConfig(config);
      if (!validation.ok) {
        return {
          ok: true,
          value: ProviderHealthResponseSchema.parse({
            providerId: OPENAI_PROVIDER_ID,
            ok: false,
            status: "not_configured",
            message: `OpenAI live adapter is missing configuration: ${validation.missing.join(", ")}`,
          }),
        };
      }

      return {
        ok: true,
        value: ProviderHealthResponseSchema.parse({
          providerId: OPENAI_PROVIDER_ID,
          ok: Boolean(options.transport),
          status: options.transport ? "ready" : "unavailable",
          message: options.transport
            ? "OpenAI live adapter is configured with an injected transport."
            : "OpenAI live adapter is configured but has no injected transport.",
        }),
      };
    },

    async generateImage(request: ImageGenerationRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderImageResponse>> {
      const parsedRequest = ImageGenerationRequestSchema.parse(request);
      const parsedConfig = ProviderConfigFormSchema.parse(config);
      const validation = validateOpenAIConfig(parsedConfig);
      if (!validation.ok) return missingConfigResult(parsedConfig);
      if (!options.transport) return unavailableTransportResult();

      const model = imageModel(parsedRequest, parsedConfig);
      const startedAt = now();
      const transportResponse = await options.transport(
        OpenAIImageTransportRequestSchema.parse({
          url: `${normalizeBaseUrl(parsedConfig)}${OPENAI_IMAGE_GENERATIONS_PATH}`,
          method: "POST",
          headers: {
            Authorization: `Bearer ${parsedConfig.apiKey}`,
            "Content-Type": "application/json",
          },
          body: {
            model,
            prompt: imagePrompt(parsedRequest),
            size: imageSize(parsedRequest),
            n: parsedRequest.count,
          },
        }),
      );
      const parsedTransportResponse = OpenAIImageTransportResponseSchema.parse(transportResponse);

      if (!parsedTransportResponse.ok) {
        return providerErrorFromStatus(parsedTransportResponse.status, parsedTransportResponse.body);
      }

      return parseImageResponse(parsedRequest, model, parsedTransportResponse.body, Math.max(0, now() - startedAt));
    },
  };
}
