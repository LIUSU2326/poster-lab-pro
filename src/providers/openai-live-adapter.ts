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
  return request.model || config.modelSlots.image || config.defaultModel || "gpt-image-1";
}

function imagePrompt(request: ImageGenerationRequest): string {
  if (!request.negativePrompt?.trim()) return request.prompt;
  return `${request.prompt}\n\nAvoid: ${request.negativePrompt.trim()}`;
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
