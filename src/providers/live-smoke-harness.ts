import { z } from "zod";
import { PlatformPresetSchema, ProductionModeSchema, ProviderIdSchema } from "../schema/zod";
import { StoredProviderConfigSchema } from "../storage/contracts";
import {
  ImageGenerationRequestSchema,
  ProviderErrorCodeSchema,
  createProviderError,
  type ProviderError,
} from "./contracts";
import {
  ProviderCredentialRefSchema,
  type CredentialResolver,
} from "./credentials";
import {
  ProviderImageMappedRequestSchema,
  type ProviderImageMappedRequest,
} from "./request-mapper";
import {
  executeMappedProviderRequestWithCredentials,
  type ProviderAdapterRegistry,
} from "./executor";
import {
  LiveProviderExecutionModeSchema,
  createLiveProviderRegistry,
} from "./live-adapter-stubs";

export const LiveProviderSmokeStatusSchema = z.enum(["skipped", "blocked", "attempted"]);

export const LiveProviderSmokeInputSchema = z.object({
  enabled: z.boolean().default(false),
  providerId: ProviderIdSchema.default("openai"),
  storedConfig: StoredProviderConfigSchema.optional(),
  credentialRef: ProviderCredentialRefSchema.optional(),
  mode: ProductionModeSchema.default("poster"),
  platformPreset: PlatformPresetSchema.default("custom"),
  aspectRatio: z.string().min(1).default("1:1"),
  width: z.number().int().min(256).max(8192).default(1024),
  height: z.number().int().min(256).max(8192).default(1024),
  model: z.string().min(1).optional(),
  prompt: z.string().min(1).max(800).default("Smoke test provider execution without committing production output."),
  schemeId: z.string().min(1).default("scheme-live-provider-smoke"),
  traceId: z.string().min(1).optional(),
  liveMode: LiveProviderExecutionModeSchema.default("disabled"),
});

export const LiveProviderSmokeProviderResultSchema = z.object({
  ok: z.boolean(),
  code: ProviderErrorCodeSchema.optional(),
  userMessage: z.string().min(1).optional(),
});

export const LiveProviderSmokeResultSchema = z.object({
  status: LiveProviderSmokeStatusSchema,
  providerId: ProviderIdSchema,
  attempted: z.boolean(),
  message: z.string().min(1),
  providerResult: LiveProviderSmokeProviderResultSchema.optional(),
  traceId: z.string().min(1).optional(),
});

export type LiveProviderSmokeStatus = z.infer<typeof LiveProviderSmokeStatusSchema>;
export type LiveProviderSmokeInput = z.input<typeof LiveProviderSmokeInputSchema>;
export type LiveProviderSmokeResult = z.infer<typeof LiveProviderSmokeResultSchema>;

function summarizeError(error: ProviderError): z.infer<typeof LiveProviderSmokeProviderResultSchema> {
  return LiveProviderSmokeProviderResultSchema.parse({
    ok: false,
    code: error.code,
    userMessage: error.userMessage,
  });
}

function blockedProviderError(providerId: z.infer<typeof ProviderIdSchema>, message: string): ProviderError {
  return createProviderError(providerId, "invalid_request", message, {
    userMessage: message,
  });
}

function isCredentialOrConfigFailure(error: ProviderError): boolean {
  return error.code === "auth_failed" || error.code === "missing_config" || error.code === "invalid_request";
}

function createSmokeImageRequest(input: z.infer<typeof LiveProviderSmokeInputSchema>): ProviderImageMappedRequest {
  const storedConfig = StoredProviderConfigSchema.parse(input.storedConfig);
  const model = input.model || storedConfig.modelSlots.image || storedConfig.defaultModel || "provider-smoke-model";

  const request = ImageGenerationRequestSchema.parse({
    context: {
      projectId: "project-live-provider-smoke",
      mode: input.mode,
      providerId: input.providerId,
      ...(input.traceId ? { traceId: input.traceId } : {}),
    },
    schemeId: input.schemeId,
    prompt: input.prompt,
    assets: [],
    platformPreset: input.platformPreset,
    aspectRatio: input.aspectRatio,
    width: input.width,
    height: input.height,
    model,
    count: 1,
  });

  return ProviderImageMappedRequestSchema.parse({
    kind: "imageGeneration",
    providerId: input.providerId,
    model,
    promptPackageId: "prompt-package-live-provider-smoke",
    request,
  });
}

export async function runLiveProviderSmokeHarness(
  input: LiveProviderSmokeInput = {},
  resolver?: CredentialResolver,
  registry?: ProviderAdapterRegistry,
): Promise<LiveProviderSmokeResult> {
  const parsed = LiveProviderSmokeInputSchema.parse(input);

  if (!parsed.enabled) {
    return LiveProviderSmokeResultSchema.parse({
      status: "skipped",
      providerId: parsed.providerId,
      attempted: false,
      message: "Live provider smoke harness skipped because explicit opt-in was not provided.",
      ...(parsed.traceId ? { traceId: parsed.traceId } : {}),
    });
  }

  if (!parsed.storedConfig) {
    const error = blockedProviderError(parsed.providerId, "Stored provider config is required for live smoke execution.");
    return LiveProviderSmokeResultSchema.parse({
      status: "blocked",
      providerId: parsed.providerId,
      attempted: false,
      message: error.userMessage,
      providerResult: summarizeError(error),
      ...(parsed.traceId ? { traceId: parsed.traceId } : {}),
    });
  }

  const storedConfig = StoredProviderConfigSchema.parse(parsed.storedConfig);
  if (storedConfig.providerId !== parsed.providerId) {
    const error = blockedProviderError(parsed.providerId, "Stored provider config does not match the smoke provider.");
    return LiveProviderSmokeResultSchema.parse({
      status: "blocked",
      providerId: parsed.providerId,
      attempted: false,
      message: error.userMessage,
      providerResult: summarizeError(error),
      ...(parsed.traceId ? { traceId: parsed.traceId } : {}),
    });
  }

  const mappedRequest = createSmokeImageRequest({
    ...parsed,
    storedConfig,
  });
  const executionResult = await executeMappedProviderRequestWithCredentials(
    {
      mappedRequest,
      storedConfig,
      ...(parsed.credentialRef ? { credentialRef: parsed.credentialRef } : {}),
    },
    resolver,
    registry || createLiveProviderRegistry({
      mode: parsed.liveMode,
      providerIds: [parsed.providerId],
      reason: "Live provider smoke harness is exercising the adapter boundary only.",
    }),
  );

  if (!executionResult.ok) {
    const status: LiveProviderSmokeStatus = isCredentialOrConfigFailure(executionResult.error) ? "blocked" : "attempted";
    return LiveProviderSmokeResultSchema.parse({
      status,
      providerId: parsed.providerId,
      attempted: status === "attempted",
      message: executionResult.error.userMessage,
      providerResult: summarizeError(executionResult.error),
      ...(parsed.traceId ? { traceId: parsed.traceId } : {}),
    });
  }

  return LiveProviderSmokeResultSchema.parse({
    status: "attempted",
    providerId: parsed.providerId,
    attempted: true,
    message: "Live provider smoke execution reached a provider adapter and returned a typed result.",
    providerResult: {
      ok: true,
    },
    ...(parsed.traceId ? { traceId: parsed.traceId } : {}),
  });
}
