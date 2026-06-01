import { z } from "zod";
import { createPromptPackage } from "../prompts/builder";
import {
  createEncryptedProviderCredentialVault,
  type EncryptedProviderCredentialVault,
  type ProviderCredentialVaultStatus,
} from "../providers/encrypted-credential-vault";
import { mapPromptPackageToProviderRequest } from "../providers/request-mapper";
import type { ProviderAdapterRegistry } from "../providers/executor";
import { createBatchQueuePlan } from "../queue/planner";
import { summarizeQueue } from "../queue/contracts";
import { createAssetLibraryService } from "../assets/library-service";
import { createWorkspaceQueueWorker } from "../queue/workspace-worker";
import { createResultDownloadDescriptor } from "../results/download-descriptor";
import { ResultStoredFileMetadataSchema, type LocalResultFileStore } from "../results/file-store";
import {
  createMemoryDraftRepository,
  type StorageRepository,
  type StorageLoadResult,
} from "../storage";
import { providerCredentialKeyRef } from "./provider-credential-refs";
import {
  ApiEnvelopeMetaSchema,
  ApiFailureEnvelopeSchema,
  AssetCommitApiRequestSchema,
  AssetCommitApiResponseSchema,
  AssetListApiRequestSchema,
  AssetListApiResponseSchema,
  AssetUploadPlanApiRequestSchema,
  AssetUploadPlanApiResponseSchema,
  PromptPackageCreateApiRequestSchema,
  PromptPackageCreateApiResponseSchema,
  ProviderCredentialDeleteApiRequestSchema,
  ProviderCredentialDeleteApiResponseSchema,
  ProviderCredentialSaveApiRequestSchema,
  ProviderCredentialSaveApiResponseSchema,
  ProviderCredentialStatusApiRequestSchema,
  ProviderCredentialStatusApiResponseSchema,
  ProviderRequestMapApiRequestSchema,
  ProviderRequestMapApiResponseSchema,
  QueuePlanCreateApiRequestSchema,
  QueuePlanCreateApiResponseSchema,
  QueuePlanRunApiRequestSchema,
  QueuePlanRunApiResponseSchema,
  ResultDeleteApiRequestSchema,
  ResultDeleteApiResponseSchema,
  ResultDownloadDescribeApiRequestSchema,
  ResultDownloadDescribeApiResponseSchema,
  WorkspaceSnapshotLoadRequestSchema,
  WorkspaceSnapshotLoadResponseSchema,
  WorkspaceSnapshotSaveRequestSchema,
  WorkspaceSnapshotSaveResponseSchema,
  type ApiEnvelopeMeta,
  type ApiErrorCode,
  type ApiFailureEnvelope,
  type AssetCommitApiRequest,
  type AssetCommitApiResponse,
  type AssetListApiRequest,
  type AssetListApiResponse,
  type AssetUploadPlanApiRequest,
  type AssetUploadPlanApiResponse,
  type PromptPackageCreateApiRequest,
  type PromptPackageCreateApiResponse,
  type ProviderCredentialDeleteApiRequest,
  type ProviderCredentialDeleteApiResponse,
  type ProviderCredentialSaveApiRequest,
  type ProviderCredentialSaveApiResponse,
  type ProviderCredentialStatusApiRequest,
  type ProviderCredentialStatusApiResponse,
  type ProviderRequestMapApiRequest,
  type ProviderRequestMapApiResponse,
  type QueuePlanCreateApiRequest,
  type QueuePlanCreateApiResponse,
  type QueuePlanRunApiRequest,
  type QueuePlanRunApiResponse,
  type ResultDeleteApiRequest,
  type ResultDeleteApiResponse,
  type ResultDownloadDescribeApiRequest,
  type ResultDownloadDescribeApiResponse,
  type WorkspaceSnapshotLoadRequest,
  type WorkspaceSnapshotLoadResponse,
  type WorkspaceSnapshotSaveRequest,
  type WorkspaceSnapshotSaveResponse,
} from "./contracts";

export type LocalApiServiceOptions = {
  repository?: StorageRepository;
  credentialVault?: EncryptedProviderCredentialVault;
  providerRegistry?: ProviderAdapterRegistry;
  resultFileStore?: Pick<LocalResultFileStore, "storeDataUrl" | "deleteStoredFile">;
  requireLiveExecutionGate?: boolean;
};

export type LocalApiService = {
  loadWorkspaceSnapshot(request: WorkspaceSnapshotLoadRequest): Promise<WorkspaceSnapshotLoadResponse>;
  saveWorkspaceSnapshot(request: WorkspaceSnapshotSaveRequest): Promise<WorkspaceSnapshotSaveResponse>;
  createPromptPackage(request: PromptPackageCreateApiRequest): Promise<PromptPackageCreateApiResponse>;
  mapProviderRequest(request: ProviderRequestMapApiRequest): Promise<ProviderRequestMapApiResponse>;
  getProviderCredentialStatus(request: ProviderCredentialStatusApiRequest): Promise<ProviderCredentialStatusApiResponse>;
  saveProviderCredential(request: ProviderCredentialSaveApiRequest): Promise<ProviderCredentialSaveApiResponse>;
  deleteProviderCredential(request: ProviderCredentialDeleteApiRequest): Promise<ProviderCredentialDeleteApiResponse>;
  createQueuePlan(request: QueuePlanCreateApiRequest): Promise<QueuePlanCreateApiResponse>;
  runQueuePlan(request: QueuePlanRunApiRequest): Promise<QueuePlanRunApiResponse>;
  createAssetUploadPlan(request: AssetUploadPlanApiRequest): Promise<AssetUploadPlanApiResponse>;
  commitAssetRecord(request: AssetCommitApiRequest): Promise<AssetCommitApiResponse>;
  listWorkspaceAssets(request: AssetListApiRequest): Promise<AssetListApiResponse>;
  describeResultDownload(request: ResultDownloadDescribeApiRequest): Promise<ResultDownloadDescribeApiResponse>;
  deleteResult(request: ResultDeleteApiRequest): Promise<ResultDeleteApiResponse>;
};

let traceSequence = 0;

function nextTraceId(): string {
  traceSequence += 1;
  return `trace-local-api-${Date.now()}-${traceSequence}`;
}

export function createApiMeta(input: { workspaceId?: string; revision?: number } = {}): ApiEnvelopeMeta {
  return ApiEnvelopeMetaSchema.parse({
    traceId: nextTraceId(),
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    ...(typeof input.revision === "number" ? { revision: input.revision } : {}),
    createdAt: new Date().toISOString(),
  });
}

function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  return error.issues.reduce<Record<string, string[]>>((fields, issue) => {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
    fields[key] = [...(fields[key] || []), issue.message];
    return fields;
  }, {});
}

function createFailure(input: {
  code: ApiErrorCode;
  message: string;
  workspaceId?: string;
  revision?: number;
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
      ...(typeof input.revision === "number" ? { revision: input.revision } : {}),
    }),
  });
}

function failureFromError(error: unknown, input: { workspaceId?: string; revision?: number } = {}): ApiFailureEnvelope {
  if (error instanceof z.ZodError) {
    return createFailure({
      code: "validation_error",
      message: "Request validation failed.",
      fieldErrors: fieldErrorsFromZod(error),
      ...input,
    });
  }

  return createFailure({
    code: "internal",
    message: error instanceof Error ? error.message : "Unexpected local API service error.",
    ...input,
  });
}

function storageLoadFailure(result: Extract<StorageLoadResult, { ok: false }>, workspaceId: string): ApiFailureEnvelope {
  const code: ApiErrorCode = result.code === "not_found" ? "not_found" : "internal";
  return createFailure({
    code,
    workspaceId,
    message: result.message,
    details: { storageCode: result.code },
  });
}

function workspaceIdFromUnknown(request: unknown): string | undefined {
  if (!request || typeof request !== "object") return undefined;
  const candidate = (request as { workspaceId?: unknown }).workspaceId;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

function resultFileMetadataFromUnknown(value: unknown): { storageKey: string } | null {
  if (!value || typeof value !== "object") return null;
  const parsed = ResultStoredFileMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function updateProviderCredentialMirror(input: {
  repository: StorageRepository;
  workspaceId: string;
  status: ProviderCredentialVaultStatus;
  settings?: {
    baseUrl?: string | undefined;
    defaultModel?: string | undefined;
    enabled?: boolean | undefined;
    modelSlots?: Record<string, string> | undefined;
  };
  enabledFallback?: boolean;
  clear?: boolean;
}): Promise<{ updated: boolean; revision?: number; failure?: ApiFailureEnvelope }> {
  const loaded = await input.repository.loadSnapshot(input.workspaceId);
  if (!loaded.ok) {
    return {
      updated: false,
      failure: storageLoadFailure(loaded, input.workspaceId),
    };
  }

  const existing = loaded.snapshot.providerConfigs[input.status.providerId];
  const updatedAt = input.status.updatedAt || new Date().toISOString();
  const modelSlots = {
    ...(existing?.modelSlots || {}),
    ...(input.settings?.modelSlots || {}),
  };
  const defaultModel = input.settings?.defaultModel || existing?.defaultModel || "";
  if (defaultModel && !modelSlots.image) modelSlots.image = defaultModel;
  const nextConfig = {
    providerId: input.status.providerId,
    enabled: input.clear ? false : input.settings?.enabled ?? existing?.enabled ?? input.enabledFallback ?? input.status.configured,
    status: input.clear ? "idle" as const : input.status.configured ? "success" as const : "idle" as const,
    hasApiKey: input.clear ? false : input.status.configured,
    apiKeyMasked: input.clear ? "" : input.status.apiKeyMasked,
    baseUrl: input.settings?.baseUrl ?? existing?.baseUrl ?? "",
    defaultModel,
    modelSlots,
    updatedAt,
  };
  const nextSnapshot = {
    ...loaded.snapshot,
    providerConfigs: {
      ...loaded.snapshot.providerConfigs,
      [input.status.providerId]: nextConfig,
    },
    metadata: {
      ...loaded.snapshot.metadata,
      revision: loaded.snapshot.metadata.revision + 1,
      updatedAt,
    },
  };

  await input.repository.saveSnapshot(nextSnapshot);
  return {
    updated: true,
    revision: nextSnapshot.metadata.revision,
  };
}

async function describeProviderCredentialStatus(input: {
  credentialVault: EncryptedProviderCredentialVault;
  providerId: z.infer<typeof ProviderCredentialStatusApiRequestSchema>["providerId"];
  keyRef: string;
}): Promise<{ status: ProviderCredentialVaultStatus; recoveredInvalidCredential: boolean }> {
  const status = await input.credentialVault.describe({
    providerId: input.providerId,
    keyRef: input.keyRef,
  });

  if (!status.credentialRef) {
    return { status, recoveredInvalidCredential: false };
  }

  const resolved = await input.credentialVault.resolveCredential(status.credentialRef);
  if (resolved.ok) {
    return { status, recoveredInvalidCredential: false };
  }

  const errorText = `${resolved.error.message} ${resolved.error.userMessage}`.toLowerCase();
  const shouldRecover = resolved.error.code === "auth_failed" && errorText.includes("decrypt");
  if (!shouldRecover) {
    return { status, recoveredInvalidCredential: false };
  }

  await input.credentialVault.revoke({
    providerId: input.providerId,
    keyRef: input.keyRef,
  });
  const recoveredStatus = await input.credentialVault.describe({
    providerId: input.providerId,
    keyRef: input.keyRef,
  });

  return {
    status: recoveredStatus,
    recoveredInvalidCredential: true,
  };
}

export function createLocalApiService(options: LocalApiServiceOptions = {}): LocalApiService {
  const repository = options.repository || createMemoryDraftRepository();
  const credentialVault = options.credentialVault || createEncryptedProviderCredentialVault({
    masterKey: `local-api-service-process-vault-${Date.now()}-${Math.random()}`,
  });
  const assetLibrary = createAssetLibraryService({ repository });
  const queueWorker = createWorkspaceQueueWorker({
    repository,
    ...(options.credentialVault
      ? {
          credentialResolver: credentialVault,
          storedCredentialSource: "secretStore" as const,
        }
      : {}),
    ...(options.providerRegistry ? { providerRegistry: options.providerRegistry } : {}),
    ...(options.resultFileStore ? { resultFileStore: options.resultFileStore } : {}),
    ...(options.requireLiveExecutionGate ? { requireLiveExecutionGate: true } : {}),
  });

  return {
    async loadWorkspaceSnapshot(request) {
      try {
        const parsed = WorkspaceSnapshotLoadRequestSchema.parse(request);
        const loaded = await repository.loadSnapshot(parsed.workspaceId);

        if (!loaded.ok) {
          return WorkspaceSnapshotLoadResponseSchema.parse(storageLoadFailure(loaded, parsed.workspaceId));
        }

        return WorkspaceSnapshotLoadResponseSchema.parse({
          ok: true,
          data: { snapshot: loaded.snapshot },
          meta: createApiMeta({
            workspaceId: loaded.snapshot.metadata.workspaceId,
            revision: loaded.snapshot.metadata.revision,
          }),
        });
      } catch (error) {
        const workspaceId = workspaceIdFromUnknown(request);
        return WorkspaceSnapshotLoadResponseSchema.parse(
          failureFromError(error, {
            ...(workspaceId ? { workspaceId } : {}),
          }),
        );
      }
    },

    async saveWorkspaceSnapshot(request) {
      try {
        const parsed = WorkspaceSnapshotSaveRequestSchema.parse(request);
        const saved = await repository.saveSnapshot(parsed.snapshot);

        return WorkspaceSnapshotSaveResponseSchema.parse({
          ok: true,
          data: { summary: saved.snapshot },
          meta: createApiMeta({
            workspaceId: parsed.snapshot.metadata.workspaceId,
            revision: parsed.snapshot.metadata.revision,
          }),
        });
      } catch (error) {
        return WorkspaceSnapshotSaveResponseSchema.parse(failureFromError(error));
      }
    },

    async createPromptPackage(request) {
      try {
        const parsed = PromptPackageCreateApiRequestSchema.parse(request);
        const promptPackage = createPromptPackage(parsed);

        return PromptPackageCreateApiResponseSchema.parse({
          ok: true,
          data: { promptPackage },
          meta: createApiMeta({
            workspaceId: parsed.snapshot.metadata.workspaceId,
            revision: parsed.snapshot.metadata.revision,
          }),
        });
      } catch (error) {
        return PromptPackageCreateApiResponseSchema.parse(failureFromError(error));
      }
    },

    async mapProviderRequest(request) {
      try {
        const parsed = ProviderRequestMapApiRequestSchema.parse(request);
        const mappedRequest = mapPromptPackageToProviderRequest(parsed);

        return ProviderRequestMapApiResponseSchema.parse({
          ok: true,
          data: { mappedRequest },
          meta: createApiMeta({
            workspaceId: parsed.snapshot.metadata.workspaceId,
            revision: parsed.snapshot.metadata.revision,
          }),
        });
      } catch (error) {
        return ProviderRequestMapApiResponseSchema.parse(failureFromError(error));
      }
    },

    async getProviderCredentialStatus(request) {
      try {
        const parsed = ProviderCredentialStatusApiRequestSchema.parse(request);
        const keyRef = providerCredentialKeyRef(parsed);
        const credentialStatus = await describeProviderCredentialStatus({
          credentialVault,
          providerId: parsed.providerId,
          keyRef,
        });
        const status = credentialStatus.status;
        const mirror = status.configured
          ? await updateProviderCredentialMirror({
              repository,
              workspaceId: parsed.workspaceId,
              status,
              settings: {
                enabled: true,
              },
            })
          : credentialStatus.recoveredInvalidCredential
            ? await updateProviderCredentialMirror({
                repository,
                workspaceId: parsed.workspaceId,
                status,
                clear: true,
              })
          : { updated: false };
        if ("failure" in mirror && mirror.failure) {
          return ProviderCredentialStatusApiResponseSchema.parse(mirror.failure);
        }

        return ProviderCredentialStatusApiResponseSchema.parse({
          ok: true,
          data: {
            status,
            providerConfigUpdated: mirror.updated,
            recoveredInvalidCredential: credentialStatus.recoveredInvalidCredential,
          },
          meta: createApiMeta({
            workspaceId: parsed.workspaceId,
            ...(mirror.revision ? { revision: mirror.revision } : {}),
          }),
        });
      } catch (error) {
        const workspaceId = workspaceIdFromUnknown(request);
        return ProviderCredentialStatusApiResponseSchema.parse(
          failureFromError(error, {
            ...(workspaceId ? { workspaceId } : {}),
          }),
        );
      }
    },

    async saveProviderCredential(request) {
      try {
        const parsed = ProviderCredentialSaveApiRequestSchema.parse(request);
        const status = await credentialVault.save({
          providerId: parsed.providerId,
          keyRef: providerCredentialKeyRef(parsed),
          apiKey: parsed.apiKey,
        });
        const mirror = await updateProviderCredentialMirror({
          repository,
          workspaceId: parsed.workspaceId,
          status,
          settings: {
            baseUrl: parsed.baseUrl,
            defaultModel: parsed.defaultModel,
            enabled: parsed.enabled,
            modelSlots: parsed.modelSlots,
          },
          enabledFallback: true,
        });
        if (mirror.failure) return ProviderCredentialSaveApiResponseSchema.parse(mirror.failure);

        return ProviderCredentialSaveApiResponseSchema.parse({
          ok: true,
          data: {
            status,
            providerConfigUpdated: mirror.updated,
          },
          meta: createApiMeta({
            workspaceId: parsed.workspaceId,
            ...(mirror.revision ? { revision: mirror.revision } : {}),
          }),
        });
      } catch (error) {
        const workspaceId = workspaceIdFromUnknown(request);
        return ProviderCredentialSaveApiResponseSchema.parse(
          failureFromError(error, {
            ...(workspaceId ? { workspaceId } : {}),
          }),
        );
      }
    },

    async deleteProviderCredential(request) {
      try {
        const parsed = ProviderCredentialDeleteApiRequestSchema.parse(request);
        const keyRef = providerCredentialKeyRef(parsed);
        const revoked = await credentialVault.revoke({
          providerId: parsed.providerId,
          keyRef,
        });
        const status = await credentialVault.describe({
          providerId: parsed.providerId,
          keyRef,
        });
        const mirror = await updateProviderCredentialMirror({
          repository,
          workspaceId: parsed.workspaceId,
          status,
          clear: true,
        });
        if (mirror.failure) return ProviderCredentialDeleteApiResponseSchema.parse(mirror.failure);

        return ProviderCredentialDeleteApiResponseSchema.parse({
          ok: true,
          data: {
            status,
            revoked,
            providerConfigUpdated: mirror.updated,
          },
          meta: createApiMeta({
            workspaceId: parsed.workspaceId,
            ...(mirror.revision ? { revision: mirror.revision } : {}),
          }),
        });
      } catch (error) {
        const workspaceId = workspaceIdFromUnknown(request);
        return ProviderCredentialDeleteApiResponseSchema.parse(
          failureFromError(error, {
            ...(workspaceId ? { workspaceId } : {}),
          }),
        );
      }
    },

    async createQueuePlan(request) {
      try {
        const parsed = QueuePlanCreateApiRequestSchema.parse(request);
        const queuePlan = createBatchQueuePlan({
          projectId: parsed.projectId,
          mode: parsed.mode,
          providerId: parsed.providerId,
          providerRoutes: parsed.providerRoutes,
          schemeIds: parsed.schemeIds,
          platformPresets: parsed.platformPresets,
          aspectRatios: parsed.aspectRatios,
          customSize: parsed.customSize,
          imagesPerScheme: parsed.imagesPerScheme,
          includeImageGeneration: parsed.includeImageGeneration,
          includeImageEdit: parsed.includeImageEdit,
          includeUpscale: parsed.includeUpscale,
          includeBackgroundRemoval: parsed.includeBackgroundRemoval,
          regenerateSchemes: parsed.regenerateSchemes,
          ...(parsed.batchId ? { batchId: parsed.batchId } : {}),
          ...(parsed.sourceResultId ? { sourceResultId: parsed.sourceResultId } : {}),
        });
        const summary = summarizeQueue(queuePlan);

        if (parsed.workspaceId) {
          const loaded = await repository.loadSnapshot(parsed.workspaceId);
          if (!loaded.ok) {
            return QueuePlanCreateApiResponseSchema.parse(storageLoadFailure(loaded, parsed.workspaceId));
          }
          const updatedAt = new Date().toISOString();
          await repository.saveSnapshot({
            ...loaded.snapshot,
            queuePlans: [
              ...loaded.snapshot.queuePlans.filter((plan) => plan.job.id !== queuePlan.job.id),
              queuePlan,
            ],
            queueSummaries: [
              ...loaded.snapshot.queueSummaries.filter((candidate) => candidate.jobId !== summary.jobId),
              summary,
            ],
            metadata: {
              ...loaded.snapshot.metadata,
              revision: loaded.snapshot.metadata.revision + 1,
              updatedAt,
            },
          });
        }

        return QueuePlanCreateApiResponseSchema.parse({
          ok: true,
          data: { queuePlan, summary },
          meta: createApiMeta(),
        });
      } catch (error) {
        return QueuePlanCreateApiResponseSchema.parse(failureFromError(error));
      }
    },

    async runQueuePlan(request) {
      try {
        const parsed = QueuePlanRunApiRequestSchema.parse(request);
        const result = await queueWorker.run(parsed);

        return QueuePlanRunApiResponseSchema.parse({
          ok: true,
          data: result,
          meta: createApiMeta({
            workspaceId: parsed.workspaceId,
            revision: result.workspace.metadata.revision,
          }),
        });
      } catch (error) {
        const workspaceId = workspaceIdFromUnknown(request);
        return QueuePlanRunApiResponseSchema.parse(
          failureFromError(error, {
            ...(workspaceId ? { workspaceId } : {}),
          }),
        );
      }
    },

    async createAssetUploadPlan(request) {
      try {
        const parsed = AssetUploadPlanApiRequestSchema.parse(request);
        const result = await assetLibrary.createUploadPlan(parsed);

        return AssetUploadPlanApiResponseSchema.parse({
          ok: true,
          data: result,
          meta: createApiMeta({
            workspaceId: parsed.workspaceId,
          }),
        });
      } catch (error) {
        const workspaceId = workspaceIdFromUnknown(request);
        return AssetUploadPlanApiResponseSchema.parse(
          failureFromError(error, {
            ...(workspaceId ? { workspaceId } : {}),
          }),
        );
      }
    },

    async commitAssetRecord(request) {
      try {
        const parsed = AssetCommitApiRequestSchema.parse(request);
        const result = await assetLibrary.commitAsset(parsed);

        return AssetCommitApiResponseSchema.parse({
          ok: true,
          data: result,
          meta: createApiMeta({
            workspaceId: parsed.workspaceId,
            revision: result.summary.revision,
          }),
        });
      } catch (error) {
        const workspaceId = workspaceIdFromUnknown(request);
        return AssetCommitApiResponseSchema.parse(
          failureFromError(error, {
            ...(workspaceId ? { workspaceId } : {}),
          }),
        );
      }
    },

    async listWorkspaceAssets(request) {
      try {
        const parsed = AssetListApiRequestSchema.parse(request);
        const result = await assetLibrary.listAssets(parsed);

        return AssetListApiResponseSchema.parse({
          ok: true,
          data: result,
          meta: createApiMeta({
            workspaceId: parsed.workspaceId,
          }),
        });
      } catch (error) {
        const workspaceId = workspaceIdFromUnknown(request);
        return AssetListApiResponseSchema.parse(
          failureFromError(error, {
            ...(workspaceId ? { workspaceId } : {}),
          }),
        );
      }
    },

    async describeResultDownload(request) {
      try {
        const parsed = ResultDownloadDescribeApiRequestSchema.parse(request);
        const loaded = await repository.loadSnapshot(parsed.workspaceId);

        if (!loaded.ok) {
          return ResultDownloadDescribeApiResponseSchema.parse(storageLoadFailure(loaded, parsed.workspaceId));
        }

        const descriptor = createResultDownloadDescriptor({
          snapshot: loaded.snapshot,
          resultId: parsed.resultId,
        });
        if (!descriptor) {
          return ResultDownloadDescribeApiResponseSchema.parse(
            createFailure({
              code: "not_found",
              workspaceId: parsed.workspaceId,
              revision: loaded.snapshot.metadata.revision,
              message: `Result ${parsed.resultId} was not found.`,
            }),
          );
        }

        return ResultDownloadDescribeApiResponseSchema.parse({
          ok: true,
          data: { descriptor },
          meta: createApiMeta({
            workspaceId: parsed.workspaceId,
            revision: loaded.snapshot.metadata.revision,
          }),
        });
      } catch (error) {
        const workspaceId = workspaceIdFromUnknown(request);
        return ResultDownloadDescribeApiResponseSchema.parse(
          failureFromError(error, {
            ...(workspaceId ? { workspaceId } : {}),
          }),
        );
      }
    },

    async deleteResult(request) {
      try {
        const parsed = ResultDeleteApiRequestSchema.parse(request);
        const loaded = await repository.loadSnapshot(parsed.workspaceId);

        if (!loaded.ok) {
          return ResultDeleteApiResponseSchema.parse(storageLoadFailure(loaded, parsed.workspaceId));
        }

        const result = loaded.snapshot.results.find((candidate) => candidate.id === parsed.resultId);
        if (!result) {
          return ResultDeleteApiResponseSchema.parse(
            createFailure({
              code: "not_found",
              workspaceId: parsed.workspaceId,
              revision: loaded.snapshot.metadata.revision,
              message: `Result ${parsed.resultId} was not found.`,
            }),
          );
        }

        const resultFile = resultFileMetadataFromUnknown(result.metadata?.resultFile);
        let deletedFile = false;
        if (resultFile?.storageKey && options.resultFileStore?.deleteStoredFile) {
          deletedFile = await options.resultFileStore.deleteStoredFile(resultFile.storageKey);
        }

        const updatedAt = new Date().toISOString();
        const nextSnapshot = {
          ...loaded.snapshot,
          results: loaded.snapshot.results.filter((candidate) => candidate.id !== parsed.resultId),
          archiveRows: loaded.snapshot.archiveRows.filter((row) => row.resultAssetId !== parsed.resultId),
          metadata: {
            ...loaded.snapshot.metadata,
            revision: loaded.snapshot.metadata.revision + 1,
            updatedAt,
          },
        };
        const deletedArchiveRowCount = loaded.snapshot.archiveRows.length - nextSnapshot.archiveRows.length;
        const saved = await repository.saveSnapshot(nextSnapshot);

        return ResultDeleteApiResponseSchema.parse({
          ok: true,
          data: {
            summary: saved.snapshot,
            snapshot: nextSnapshot,
            deletedResultId: parsed.resultId,
            deletedArchiveRowCount,
            deletedFile,
            ...(resultFile?.storageKey ? { deletedStorageKey: resultFile.storageKey } : {}),
          },
          meta: createApiMeta({
            workspaceId: parsed.workspaceId,
            revision: nextSnapshot.metadata.revision,
          }),
        });
      } catch (error) {
        const workspaceId = workspaceIdFromUnknown(request);
        return ResultDeleteApiResponseSchema.parse(
          failureFromError(error, {
            ...(workspaceId ? { workspaceId } : {}),
          }),
        );
      }
    },
  };
}
