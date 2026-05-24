import { z } from "zod";
import {
  createGoogleImageFetchTransport as createGoogleHttpTransport,
  createOpenAIHttpTransport,
  type GoogleImageTransport,
  type OpenAIImageTransport,
  type ProviderConnectionTransport,
} from "../providers";
import type { EncryptedProviderCredentialVault } from "../providers/encrypted-credential-vault";
import type { LocalResultFileStore } from "../results";
import { evaluateLiveExecutionGate, runGoogleLiveQueue, runOpenAILiveQueue } from "../queue";
import type { StorageRepository } from "../storage";
import {
  ApiFailureEnvelopeSchema,
  QueuePlanManualLiveTestApiRequestSchema,
  QueuePlanManualLiveTestApiResponseSchema,
  type ApiErrorCode,
  type ApiFailureEnvelope,
  type QueuePlanManualLiveTestApiRequest,
  type QueuePlanManualLiveTestApiResponse,
} from "./contracts";
import { createApiMeta } from "./service";
import { providerCredentialKeyRef } from "./provider-credential-refs";
import { createProviderDiagnosticService } from "./provider-diagnostics";

const OPENAI_PROVIDER_ID = "openai" as const;
const GOOGLE_PROVIDER_ID = "google" as const;
type ManualLiveProviderId = typeof OPENAI_PROVIDER_ID | typeof GOOGLE_PROVIDER_ID;

export type ManualLiveGenerationServiceOptions = {
  repository: StorageRepository;
  credentialVault: EncryptedProviderCredentialVault;
  connectionTransport?: ProviderConnectionTransport;
  imageTransport?: OpenAIImageTransport;
  googleImageTransport?: GoogleImageTransport;
  resultFileStore?: Pick<LocalResultFileStore, "storeDataUrl">;
  now?: () => string;
  adapterNow?: () => number;
};

export type ManualLiveGenerationService = {
  runManualLiveGenerationTest(
    request: QueuePlanManualLiveTestApiRequest,
  ): Promise<QueuePlanManualLiveTestApiResponse>;
};

function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  return error.issues.reduce<Record<string, string[]>>((fields, issue) => {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
    fields[key] = [...(fields[key] || []), issue.message];
    return fields;
  }, {});
}

function failure(input: {
  code: ApiErrorCode;
  message: string;
  workspaceId?: string;
  fieldErrors?: Record<string, string[]>;
  details?: Record<string, unknown>;
}): ApiFailureEnvelope {
  return ApiFailureEnvelopeSchema.parse({
    ok: false,
    error: {
      code: input.code,
      message: input.message,
      fieldErrors: input.fieldErrors || {},
      details: input.details || {},
    },
    meta: createApiMeta({
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    }),
  });
}

function failureFromError(error: unknown, workspaceId?: string): ApiFailureEnvelope {
  if (error instanceof z.ZodError) {
    return failure({
      code: "validation_error",
      message: "Manual live generation test validation failed.",
      fieldErrors: fieldErrorsFromZod(error),
      ...(workspaceId ? { workspaceId } : {}),
    });
  }

  return failure({
    code: "internal",
    message: error instanceof Error ? error.message : "Unexpected manual live generation test error.",
    ...(workspaceId ? { workspaceId } : {}),
  });
}

function safeLiveResult(input: {
  status: "skipped" | "blocked";
  providerId: ManualLiveProviderId;
  message: string;
  traceId: string;
  gate?: ReturnType<typeof evaluateLiveExecutionGate>;
  apiKeyMasked?: string;
}) {
  return {
    status: input.status,
    providerId: input.providerId,
    attempted: false,
    message: input.message,
    ...(input.apiKeyMasked ? { apiKeyMasked: input.apiKeyMasked } : {}),
    ...(input.gate ? { gate: input.gate } : {}),
    traceId: input.traceId,
  };
}

function maskedCredentialInput(apiKeyMasked: string): { apiKeyMasked: string } | Record<string, never> {
  return apiKeyMasked ? { apiKeyMasked } : {};
}

export function createOpenAIImageFetchTransport(fetchImpl: typeof fetch): OpenAIImageTransport {
  return createOpenAIHttpTransport(fetchImpl);
}

export function createGoogleImageFetchTransport(fetchImpl: typeof fetch): GoogleImageTransport {
  return createGoogleHttpTransport(fetchImpl);
}

function imageTransportReady(input: {
  providerId: ManualLiveProviderId;
  openaiTransport?: OpenAIImageTransport | undefined;
  googleTransport?: GoogleImageTransport | undefined;
}): boolean {
  if (input.providerId === GOOGLE_PROVIDER_ID) return Boolean(input.googleTransport);
  return Boolean(input.openaiTransport);
}

export function createManualLiveGenerationService(
  options: ManualLiveGenerationServiceOptions,
): ManualLiveGenerationService {
  const diagnosticService = createProviderDiagnosticService({
    repository: options.repository,
    credentialVault: options.credentialVault,
    ...(options.connectionTransport ? { transport: options.connectionTransport } : {}),
  });

  return {
    async runManualLiveGenerationTest(request) {
      const workspaceId = typeof request?.workspaceId === "string" ? request.workspaceId : undefined;

      try {
        const parsed = QueuePlanManualLiveTestApiRequestSchema.parse(request);
        const loaded = await options.repository.loadSnapshot(parsed.workspaceId);
        if (!loaded.ok) {
          return QueuePlanManualLiveTestApiResponseSchema.parse(
            failure({
              code: loaded.code === "not_found" ? "not_found" : "internal",
              workspaceId: parsed.workspaceId,
              message: loaded.message,
              details: { storageCode: loaded.code },
            }),
          );
        }

        const plan = loaded.snapshot.queuePlans.find((candidate) => candidate.job.id === parsed.jobId);
        if (!plan) {
          return QueuePlanManualLiveTestApiResponseSchema.parse(
            failure({
              code: "not_found",
              workspaceId: parsed.workspaceId,
              message: `Queue plan ${parsed.jobId} was not found.`,
            }),
          );
        }
        if (parsed.providerId !== OPENAI_PROVIDER_ID && parsed.providerId !== GOOGLE_PROVIDER_ID) {
          return QueuePlanManualLiveTestApiResponseSchema.parse(
            failure({
              code: "unsupported_provider",
              workspaceId: parsed.workspaceId,
              message: "Manual live generation test currently supports OpenAI-compatible and Google queue jobs only.",
              details: { providerId: parsed.providerId },
            }),
          );
        }

        if (plan.job.providerId !== parsed.providerId) {
          return QueuePlanManualLiveTestApiResponseSchema.parse(
            failure({
              code: "unsupported_provider",
              workspaceId: parsed.workspaceId,
              message: "Manual live generation test provider must match the prepared queue job provider.",
              details: { requestProviderId: parsed.providerId, jobProviderId: plan.job.providerId },
            }),
          );
        }

        const credentialStatus = await options.credentialVault.describe({
          providerId: parsed.providerId,
          keyRef: providerCredentialKeyRef({
            workspaceId: parsed.workspaceId,
            providerId: parsed.providerId,
          }),
        });
        const gate = evaluateLiveExecutionGate({
          enabled: parsed.enabled,
          providerId: parsed.providerId,
          credentialReady: Boolean(credentialStatus.credentialRef),
          transportReady: Boolean(
            options.connectionTransport &&
              imageTransportReady({
                providerId: parsed.providerId,
                openaiTransport: options.imageTransport,
                googleTransport: options.googleImageTransport,
              }),
          ),
          resultStorageReady: Boolean(options.resultFileStore),
          estimatedCost: parsed.safety.estimatedCost,
          maxAcceptedCost: parsed.safety.maxAcceptedCost,
          confirmations: parsed.safety.confirmations,
        });

        if (!gate.allowed) {
          return QueuePlanManualLiveTestApiResponseSchema.parse({
            ok: true,
            data: {
              result: safeLiveResult({
                status: gate.status === "skipped" ? "skipped" : "blocked",
                providerId: parsed.providerId,
                message: gate.message,
                traceId: parsed.traceId,
                gate,
                ...maskedCredentialInput(credentialStatus.apiKeyMasked),
              }),
              providerConfigUpdated: false,
            },
            meta: createApiMeta({ workspaceId: parsed.workspaceId }),
          });
        }

        const connectionEnvelope = await diagnosticService.testProviderConnection({
          workspaceId: parsed.workspaceId,
          providerId: parsed.providerId,
          timeoutMs: parsed.timeoutMs,
          verifyModels: true,
        });
        if (!connectionEnvelope.ok) {
          return QueuePlanManualLiveTestApiResponseSchema.parse(connectionEnvelope);
        }

        const connection = connectionEnvelope.data.result;
        if (!connection.ok) {
          return QueuePlanManualLiveTestApiResponseSchema.parse({
            ok: true,
            data: {
              result: safeLiveResult({
                status: "blocked",
                providerId: parsed.providerId,
                message: connection.userMessage,
                traceId: parsed.traceId,
                gate,
                ...maskedCredentialInput(credentialStatus.apiKeyMasked),
              }),
              connection,
              providerConfigUpdated: connectionEnvelope.data.providerConfigUpdated,
            },
            meta: createApiMeta({ workspaceId: parsed.workspaceId }),
          });
        }

        if (!credentialStatus.credentialRef) {
          return QueuePlanManualLiveTestApiResponseSchema.parse({
            ok: true,
            data: {
              result: safeLiveResult({
                status: "blocked",
                providerId: parsed.providerId,
                message: "Saved provider credential is not configured.",
                traceId: parsed.traceId,
                gate,
              }),
              connection,
              providerConfigUpdated: connectionEnvelope.data.providerConfigUpdated,
            },
            meta: createApiMeta({ workspaceId: parsed.workspaceId }),
          });
        }

        const resolvedCredential = await options.credentialVault.resolveCredential(credentialStatus.credentialRef);
        if (!resolvedCredential.ok) {
          return QueuePlanManualLiveTestApiResponseSchema.parse({
            ok: true,
            data: {
              result: safeLiveResult({
                status: "blocked",
                providerId: parsed.providerId,
                message: resolvedCredential.error.userMessage,
                traceId: parsed.traceId,
                gate,
                ...maskedCredentialInput(credentialStatus.apiKeyMasked),
              }),
              connection,
              providerConfigUpdated: connectionEnvelope.data.providerConfigUpdated,
            },
            meta: createApiMeta({ workspaceId: parsed.workspaceId }),
          });
        }

        const queueInput = {
          enabled: parsed.enabled,
          workspaceId: parsed.workspaceId,
          jobId: parsed.jobId,
          apiKey: resolvedCredential.value.apiKey,
          safety: parsed.safety,
          traceId: parsed.traceId,
        };
        const queueOptions = {
          repository: options.repository,
          ...(options.resultFileStore ? { resultFileStore: options.resultFileStore } : {}),
          ...(options.now ? { now: options.now } : {}),
          ...(options.adapterNow ? { adapterNow: options.adapterNow } : {}),
        };
        const result =
          parsed.providerId === GOOGLE_PROVIDER_ID
            ? await runGoogleLiveQueue(queueInput, {
                ...queueOptions,
                ...(options.googleImageTransport ? { transport: options.googleImageTransport } : {}),
              })
            : await runOpenAILiveQueue(queueInput, {
                ...queueOptions,
                ...(options.imageTransport ? { transport: options.imageTransport } : {}),
              });

        return QueuePlanManualLiveTestApiResponseSchema.parse({
          ok: true,
          data: {
            result,
            connection,
            providerConfigUpdated: connectionEnvelope.data.providerConfigUpdated,
          },
          meta: createApiMeta({
            workspaceId: parsed.workspaceId,
            ...(result.workspace?.revision ? { revision: result.workspace.revision } : {}),
          }),
        });
      } catch (error) {
        return QueuePlanManualLiveTestApiResponseSchema.parse(failureFromError(error, workspaceId));
      }
    },
  };
}
