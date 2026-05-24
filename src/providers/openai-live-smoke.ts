import { z } from "zod";
import { ProviderConfigFormSchema } from "../schema/zod";
import { StoredProviderConfigSchema } from "../storage/contracts";
import {
  ImageGenerationRequestSchema,
  ProviderErrorCodeSchema,
  createProviderError,
  type ProviderError,
} from "./contracts";
import {
  resolveProviderRuntimeConfig,
} from "./credentials";
import {
  createOpenAIHttpTransport,
  createOpenAILiveImageAdapter,
  type OpenAIImageTransport,
} from "./openai-live-adapter";
import { createRuntimeProviderCredentialStore } from "./runtime-credential-store";

const OPENAI_PROVIDER_ID = "openai" as const;

export const OpenAIManualLiveSmokeInputSchema = z.object({
  enabled: z.boolean().default(false),
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1).default("gpt-image-1"),
  prompt: z
    .string()
    .min(1)
    .max(800)
    .default("Create a small smoke-test game marketing poster. Keep it simple and non-branded."),
  width: z.number().int().min(256).max(8192).default(1024),
  height: z.number().int().min(256).max(8192).default(1024),
  baseUrl: z.string().url().or(z.literal("")).default(""),
  traceId: z.string().min(1).default("trace-openai-manual-live-smoke"),
});

export const OpenAIManualLiveSmokeAssetSummarySchema = z.object({
  source: z.enum(["url", "dataUrl"]),
  url: z.string().url().optional(),
  dataUrlLength: z.number().int().min(0).optional(),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
});

export const OpenAIManualLiveSmokeResultSchema = z.object({
  status: z.enum(["skipped", "blocked", "attempted"]),
  providerId: z.literal(OPENAI_PROVIDER_ID),
  attempted: z.boolean(),
  message: z.string().min(1),
  model: z.string().min(1).optional(),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
  apiKeyMasked: z.string().max(120).optional(),
  assetCount: z.number().int().min(0).optional(),
  firstAsset: OpenAIManualLiveSmokeAssetSummarySchema.optional(),
  providerError: z
    .object({
      code: ProviderErrorCodeSchema,
      retryable: z.boolean(),
      userMessage: z.string().min(1),
    })
    .optional(),
  traceId: z.string().min(1).optional(),
});

export type OpenAIManualLiveSmokeInput = z.input<typeof OpenAIManualLiveSmokeInputSchema>;
export type OpenAIManualLiveSmokeResult = z.infer<typeof OpenAIManualLiveSmokeResultSchema>;

export type OpenAIManualLiveSmokeOptions = {
  transport?: OpenAIImageTransport;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

function providerErrorSummary(error: ProviderError): NonNullable<OpenAIManualLiveSmokeResult["providerError"]> {
  return {
    code: error.code,
    retryable: error.retryable,
    userMessage: error.userMessage,
  };
}

function blockedResult(
  message: string,
  input: z.infer<typeof OpenAIManualLiveSmokeInputSchema>,
  error?: ProviderError,
  apiKeyMasked?: string,
): OpenAIManualLiveSmokeResult {
  return OpenAIManualLiveSmokeResultSchema.parse({
    status: "blocked",
    providerId: OPENAI_PROVIDER_ID,
    attempted: false,
    message,
    model: input.model,
    width: input.width,
    height: input.height,
    ...(apiKeyMasked ? { apiKeyMasked } : {}),
    ...(error ? { providerError: providerErrorSummary(error) } : {}),
    traceId: input.traceId,
  });
}

function createStoredConfig(input: z.infer<typeof OpenAIManualLiveSmokeInputSchema>) {
  return StoredProviderConfigSchema.parse({
    providerId: OPENAI_PROVIDER_ID,
    enabled: true,
    status: "idle",
    hasApiKey: true,
    apiKeyMasked: "runtime-only",
    baseUrl: input.baseUrl,
    defaultModel: input.model,
    modelSlots: {
      image: input.model,
    },
    updatedAt: new Date(0).toISOString(),
  });
}

function createSmokeRequest(input: z.infer<typeof OpenAIManualLiveSmokeInputSchema>) {
  return ImageGenerationRequestSchema.parse({
    context: {
      projectId: "project-openai-manual-live-smoke",
      mode: "poster",
      providerId: OPENAI_PROVIDER_ID,
      traceId: input.traceId,
    },
    schemeId: "scheme-openai-manual-live-smoke",
    prompt: input.prompt,
    assets: [],
    platformPreset: "custom",
    aspectRatio: `${input.width}x${input.height}`,
    width: input.width,
    height: input.height,
    model: input.model,
    count: 1,
  });
}

function firstAssetSummary(
  asset: z.infer<typeof OpenAIManualLiveSmokeAssetSummarySchema> | null,
): z.infer<typeof OpenAIManualLiveSmokeAssetSummarySchema> | undefined {
  if (!asset) return undefined;
  return OpenAIManualLiveSmokeAssetSummarySchema.parse(asset);
}

export async function runOpenAIManualLiveSmoke(
  input: OpenAIManualLiveSmokeInput = {},
  options: OpenAIManualLiveSmokeOptions = {},
): Promise<OpenAIManualLiveSmokeResult> {
  const parsed = OpenAIManualLiveSmokeInputSchema.parse(input);

  if (!parsed.enabled) {
    return OpenAIManualLiveSmokeResultSchema.parse({
      status: "skipped",
      providerId: OPENAI_PROVIDER_ID,
      attempted: false,
      message: "OpenAI live smoke skipped because --allow-live was not provided.",
      model: parsed.model,
      width: parsed.width,
      height: parsed.height,
      traceId: parsed.traceId,
    });
  }

  if (!parsed.apiKey?.trim()) {
    const error = createProviderError(OPENAI_PROVIDER_ID, "auth_failed", "OpenAI API key is required for manual live smoke.", {
      userMessage: "OpenAI API key is required for manual live smoke.",
    });
    return blockedResult(error.userMessage, parsed, error);
  }

  const runtimeCredentialStore = createRuntimeProviderCredentialStore();
  const credentialSession = runtimeCredentialStore.createSession({
    providerId: OPENAI_PROVIDER_ID,
    apiKey: parsed.apiKey,
    expiresInMs: 600_000,
  });
  const credentialRef = credentialSession.credentialRef;
  const storedConfig = createStoredConfig(parsed);
  const runtimeConfig = await resolveProviderRuntimeConfig({
    storedConfig,
    credentialRef,
    resolver: runtimeCredentialStore,
  });

  if (!runtimeConfig.ok) {
    return blockedResult(runtimeConfig.error.userMessage, parsed, runtimeConfig.error, credentialRef.maskedValue);
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const transport = options.transport || (fetchImpl ? createOpenAIHttpTransport(fetchImpl) : undefined);
  if (!transport) {
    const error = createProviderError(OPENAI_PROVIDER_ID, "provider_unavailable", "No HTTP transport is available for OpenAI live smoke.", {
      userMessage: "No HTTP transport is available for OpenAI live smoke.",
    });
    return blockedResult(error.userMessage, parsed, error, credentialRef.maskedValue);
  }

  const adapter = createOpenAILiveImageAdapter({
    transport,
    ...(options.now ? { now: options.now } : {}),
  });
  const request = createSmokeRequest(parsed);
  const config = ProviderConfigFormSchema.parse(runtimeConfig.value);

  try {
    const result = await adapter.generateImage?.(request, config);
    if (!result) {
      const error = createProviderError(OPENAI_PROVIDER_ID, "unsupported_capability", "OpenAI adapter does not expose image generation.", {
        userMessage: "OpenAI adapter does not expose image generation.",
      });
      return blockedResult(error.userMessage, parsed, error, credentialRef.maskedValue);
    }

    if (!result.ok) {
      return OpenAIManualLiveSmokeResultSchema.parse({
        status: "attempted",
        providerId: OPENAI_PROVIDER_ID,
        attempted: true,
        message: result.error.userMessage,
        model: parsed.model,
        width: parsed.width,
        height: parsed.height,
        apiKeyMasked: credentialRef.maskedValue,
        providerError: providerErrorSummary(result.error),
        traceId: parsed.traceId,
      });
    }

    const first = result.value.assets[0];
    const firstAsset = first
      ? firstAssetSummary({
          source: first.url ? "url" : "dataUrl",
          ...(first.url ? { url: first.url } : {}),
          ...(first.dataUrl ? { dataUrlLength: first.dataUrl.length } : {}),
          width: first.width,
          height: first.height,
        })
      : undefined;

    return OpenAIManualLiveSmokeResultSchema.parse({
      status: "attempted",
      providerId: OPENAI_PROVIDER_ID,
      attempted: true,
      message: "OpenAI live smoke reached the provider and returned a typed image result.",
      model: result.value.model,
      width: parsed.width,
      height: parsed.height,
      apiKeyMasked: credentialRef.maskedValue,
      assetCount: result.value.assets.length,
      ...(firstAsset ? { firstAsset } : {}),
      traceId: parsed.traceId,
    });
  } catch (error) {
    const providerError = createProviderError(
      OPENAI_PROVIDER_ID,
      "provider_unavailable",
      error instanceof Error ? error.message : "OpenAI live smoke failed while executing the transport.",
      {
        retryable: true,
        userMessage: "OpenAI live smoke could not reach the provider.",
      },
    );

    return OpenAIManualLiveSmokeResultSchema.parse({
      status: "attempted",
      providerId: OPENAI_PROVIDER_ID,
      attempted: true,
      message: providerError.userMessage,
      model: parsed.model,
      width: parsed.width,
      height: parsed.height,
      apiKeyMasked: credentialRef.maskedValue,
      providerError: providerErrorSummary(providerError),
      traceId: parsed.traceId,
    });
  }
}
