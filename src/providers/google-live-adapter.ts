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

const GOOGLE_PROVIDER_ID = "google" as const;
const DEFAULT_GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
export const GOOGLE_GENERATE_CONTENT_METHOD = "generateContent";
const GOOGLE_IMAGE_ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;

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
  return request.model || config.modelSlots.image || config.defaultModel || "gemini-2.5-flash-image";
}

function imagePrompt(request: ImageGenerationRequest): string {
  const sizeInstruction = [
    `Target output: ${request.width}x${request.height}, aspect ratio ${request.aspectRatio}, platform ${request.platformPreset}.`,
    "The provider may return a native canvas size; compose for this crop target and keep important content inside safe margins.",
    request.aspectRatio === "9:16"
      ? "Compose as a tall mobile game poster, not a centered square flyer."
      : "Respect the requested platform crop and keep key text inside the safe area.",
  ].join(" ");
  const assetInstruction = request.assets.length
    ? [
        "Provider asset constraints:",
        ...request.assets.map((asset) => {
          const parts = [
            `${asset.role}: ${asset.id}`,
            asset.description,
            asset.url ? `referenceUrl=${asset.url}` : "",
          ].filter(Boolean);
          return `- ${parts.join("; ")}`;
        }),
        "Do not invent details that conflict with locked character, logo, or brand references.",
      ].join("\n")
    : "";
  const negativeInstruction = request.negativePrompt?.trim()
    ? `Avoid: ${request.negativePrompt.trim()}`
    : "";

  return [request.prompt, assetInstruction, sizeInstruction, negativeInstruction].filter(Boolean).join("\n\n");
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
          ? "Google AI Studio API key is required before live image generation."
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
    const response = await fetchImpl(parsed.url, {
      method: parsed.method,
      headers: parsed.headers,
      body: JSON.stringify(parsed.body),
    });

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

    async generateImage(request: ImageGenerationRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderImageResponse>> {
      const parsedRequest = ImageGenerationRequestSchema.parse(request);
      const parsedConfig = ProviderConfigFormSchema.parse(config);
      const validation = validateGoogleConfig(parsedConfig);
      if (!validation.ok) return missingConfigResult(parsedConfig);
      if (!options.transport) return unavailableTransportResult();

      const model = imageModel(parsedRequest, parsedConfig);
      const startedAt = now();
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
                parts: [
                  {
                    text: imagePrompt(parsedRequest),
                  },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
              imageConfig: {
                aspectRatio: googleAspectRatio(parsedRequest),
              },
            },
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
