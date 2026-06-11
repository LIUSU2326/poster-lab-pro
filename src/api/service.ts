import { z } from "zod";
import { createPromptPackage } from "../prompts/builder";
import {
  createEncryptedProviderCredentialVault,
  type EncryptedProviderCredentialVault,
  type ProviderCredentialVaultStatus,
} from "../providers/encrypted-credential-vault";
import {
  evaluateQueuePlanCapabilityGate,
  providerCapabilityGateUserMessage,
} from "../providers/capability-gate";
import { mapPromptPackageToProviderRequest } from "../providers/request-mapper";
import type { ProviderAdapterRegistry } from "../providers/executor";
import { createBatchQueuePlan } from "../queue/planner";
import { summarizeQueue } from "../queue/contracts";
import { createAssetLibraryService } from "../assets/library-service";
import { createWorkspaceQueueWorker } from "../queue/workspace-worker";
import { createResultDownloadDescriptor } from "../results/download-descriptor";
import { auditResultQuality } from "../results/quality-audit";
import {
  ResultStoredFileMetadataSchema,
  type LocalResultFileStore,
  type ResultStoredFileMetadata,
} from "../results/file-store";
import type { ProductionMode } from "../schema/zod";
import {
  createMemoryDraftRepository,
  type StorageRepository,
  type StorageLoadResult,
  type StoredProviderConfig,
  type StoredResultAsset,
  type WorkspaceSnapshot,
} from "../storage";
import { normalizeMimoProviderBaseUrl, normalizeMimoProviderModel } from "../providers/mimo-compat";
import { normalizeOpenAIBaseUrl } from "../providers/openai-compat";
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
  ProviderCredentialActivateApiRequestSchema,
  ProviderCredentialActivateApiResponseSchema,
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
  type ProviderCredentialActivateApiRequest,
  type ProviderCredentialActivateApiResponse,
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
  resultFileStore?: Pick<LocalResultFileStore, "storeDataUrl" | "deleteStoredFile"> & Partial<Pick<LocalResultFileStore, "readStoredFile">>;
  requireLiveExecutionGate?: boolean;
  isQueueCancellationRequested?: (jobId: string) => boolean;
};

export type LocalApiService = {
  loadWorkspaceSnapshot(request: WorkspaceSnapshotLoadRequest): Promise<WorkspaceSnapshotLoadResponse>;
  saveWorkspaceSnapshot(request: WorkspaceSnapshotSaveRequest): Promise<WorkspaceSnapshotSaveResponse>;
  createPromptPackage(request: PromptPackageCreateApiRequest): Promise<PromptPackageCreateApiResponse>;
  mapProviderRequest(request: ProviderRequestMapApiRequest): Promise<ProviderRequestMapApiResponse>;
  getProviderCredentialStatus(request: ProviderCredentialStatusApiRequest): Promise<ProviderCredentialStatusApiResponse>;
  saveProviderCredential(request: ProviderCredentialSaveApiRequest): Promise<ProviderCredentialSaveApiResponse>;
  activateProviderCredential(request: ProviderCredentialActivateApiRequest): Promise<ProviderCredentialActivateApiResponse>;
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

function resultFileMetadataFromUnknown(value: unknown): ResultStoredFileMetadata | null {
  if (!value || typeof value !== "object") return null;
  const parsed = ResultStoredFileMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const QUALITY_AUDIT_REQUIRED_METRICS: Record<ProductionMode, string[]> = {
  poster: ["posterHasIntegratedReference", "posterHasLogoReference", "posterHasCopyTarget"],
  icon: [
    "iconCornerAlpha",
    "iconCenterAlpha",
    "iconLightCornerDarkEdgeContainerRisk",
    "iconOuterEdgeColorMarkRatio",
    "iconEdgeTextMarkRisk",
  ],
  logo: ["logoTextStrategy"],
  announcement: ["announcementCopyStrategy"],
  collab: ["collabPartnerBrandStrategy"],
};

function qualityAuditNeedsRefresh(result: StoredResultAsset): boolean {
  const audit = result.metadata.qualityAudit;
  if (!audit || typeof audit !== "object") return true;
  const auditRecord = audit as Record<string, unknown>;
  if (auditRecord.version !== "result-quality-audit.v1" || auditRecord.mode !== result.mode) return true;
  const metrics = auditRecord.metrics;
  if (!metrics || typeof metrics !== "object") return true;
  const metricRecord = metrics as Record<string, unknown>;
  return QUALITY_AUDIT_REQUIRED_METRICS[result.mode].some((key) => !(key in metricRecord));
}

function projectAssetRoles(snapshot: WorkspaceSnapshot, projectId: string): string[] {
  return snapshot.assets
    .filter((asset) => asset.projectId === projectId)
    .map((asset) => asset.role);
}

function posterSloganForResult(snapshot: WorkspaceSnapshot, result: StoredResultAsset): string | null {
  const scheme = snapshot.schemes.find((item) => item.id === result.schemeId);
  const slogans = scheme?.slogans || {};
  const language = snapshot.modeStates.find((item) => item.mode === result.mode)?.sloganSettings.languages[0];
  return (language ? slogans[language] : null)
    || slogans["en-US"]
    || slogans["zh-CN"]
    || slogans["ja-JP"]
    || slogans["ko-KR"]
    || null;
}

function qualityAuditTextTargets(snapshot: WorkspaceSnapshot, result: StoredResultAsset): string[] {
  const modeState = snapshot.modeStates.find((item) => item.mode === result.mode);
  if (result.mode === "poster") {
    const slogan = posterSloganForResult(snapshot, result);
    return slogan ? [slogan] : [];
  }
  if (result.mode === "logo" && modeState?.modeForm.mode === "logo") {
    return [modeState.modeForm.wordmark].filter((item) => item.trim().length > 0);
  }
  if (result.mode === "announcement" && modeState?.modeForm.mode === "announcement") {
    return [modeState.modeForm.announcementTitle].filter((item) => item.trim().length > 0);
  }
  if (result.mode === "collab" && modeState?.modeForm.mode === "collab") {
    return [modeState.modeForm.collabBrandName].filter((item) => item.trim().length > 0);
  }
  return [];
}

function resultDataUrlFromProviderAsset(result: StoredResultAsset): string | null {
  const providerAsset = result.metadata.providerAsset;
  if (!providerAsset || typeof providerAsset !== "object") return null;
  const dataUrl = (providerAsset as Record<string, unknown>).dataUrl;
  return typeof dataUrl === "string" && dataUrl.startsWith("data:") ? dataUrl : null;
}

async function resultDataUrlForQualityRefresh(
  result: StoredResultAsset,
  fileStore?: Pick<LocalResultFileStore, "readStoredFile">,
): Promise<string | null> {
  const fromProviderAsset = resultDataUrlFromProviderAsset(result);
  if (fromProviderAsset) return fromProviderAsset;

  const resultFile = resultFileMetadataFromUnknown(result.metadata.resultFile);
  if (!resultFile || !fileStore) return null;
  const stored = await fileStore.readStoredFile(resultFile.storageKey);
  return `data:${resultFile.mimeType};base64,${Buffer.from(stored.bytes).toString("base64")}`;
}

async function refreshResultQualityAudits(input: {
  snapshot: WorkspaceSnapshot;
  resultFileStore?: Partial<Pick<LocalResultFileStore, "readStoredFile">>;
  updatedAt?: string;
}): Promise<{ snapshot: WorkspaceSnapshot; updated: boolean }> {
  const staleResults = input.snapshot.results.filter(qualityAuditNeedsRefresh);
  if (staleResults.length === 0) return { snapshot: input.snapshot, updated: false };

  const fileStore = input.resultFileStore?.readStoredFile
    ? { readStoredFile: input.resultFileStore.readStoredFile.bind(input.resultFileStore) }
    : undefined;
  const refreshed = new Map<string, StoredResultAsset>();

  for (const result of staleResults) {
    const dataUrl = await resultDataUrlForQualityRefresh(result, fileStore);
    const qualityAudit = await auditResultQuality({
      mode: result.mode,
      dataUrl,
      width: result.width,
      height: result.height,
      targetWidth: result.width,
      targetHeight: result.height,
      assetRoles: projectAssetRoles(input.snapshot, result.projectId),
      overlayApplied: Boolean((result.metadata.assetOverlayProcessing as { applied?: unknown[] } | undefined)?.applied?.length),
      textTargets: qualityAuditTextTargets(input.snapshot, result),
    });
    refreshed.set(result.id, {
      ...result,
      metadata: {
        ...result.metadata,
        qualityAudit,
      },
      updatedAt: input.updatedAt || result.updatedAt,
    });
  }

  const updatedAt = input.updatedAt || new Date().toISOString();
  return {
    updated: true,
    snapshot: {
      ...input.snapshot,
      results: input.snapshot.results.map((result) => refreshed.get(result.id) || result),
      metadata: {
        ...input.snapshot.metadata,
        revision: input.snapshot.metadata.revision + 1,
        updatedAt,
      },
    },
  };
}

type StoredCredentialProfile = StoredProviderConfig["credentialProfiles"][number];

function normalizeProviderModelSlots(providerId: string, slots: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(slots)
      .map(([slot, model]) => [slot, normalizeMimoProviderModel(providerId, model)])
      .filter(([, model]) => model),
  );
}

function normalizeProviderBaseUrl(providerId: string, value: string | null | undefined): string {
  if (providerId === "openai") return normalizeOpenAIBaseUrl(value);
  return normalizeMimoProviderBaseUrl(providerId, value);
}

function defaultCredentialProfileLabel(profiles: StoredCredentialProfile[]): string {
  if (profiles.length === 0) return "默认 Key";
  return `Key ${profiles.length + 1}`;
}

function mergeCredentialProfiles(input: {
  existing?: StoredProviderConfig | undefined;
  status: ProviderCredentialVaultStatus;
  label?: string | undefined;
  clearKeyRef?: string | undefined;
}): StoredCredentialProfile[] {
  const existingProfiles = Array.isArray(input.existing?.credentialProfiles)
    ? input.existing.credentialProfiles
    : [];
  let profiles = input.clearKeyRef
    ? existingProfiles.filter((profile) => profile.keyRef !== input.clearKeyRef)
    : [...existingProfiles];

  if (!input.clearKeyRef && input.status.configured) {
    const index = profiles.findIndex((profile) => profile.keyRef === input.status.keyRef);
    const previous = index >= 0 ? profiles[index] : null;
    const nextProfile: StoredCredentialProfile = {
      keyRef: input.status.keyRef,
      label: input.label?.trim() || previous?.label || defaultCredentialProfileLabel(profiles),
      apiKeyMasked: input.status.apiKeyMasked,
      updatedAt: input.status.updatedAt || new Date().toISOString(),
    };
    if (index >= 0) profiles[index] = nextProfile;
    else profiles = [...profiles, nextProfile];
  }

  return profiles;
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
  label?: string | undefined;
  enabledFallback?: boolean;
  clear?: boolean;
  clearKeyRef?: string | undefined;
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
  const clearKeyRef = input.clearKeyRef || (input.clear ? input.status.keyRef : undefined);
  const credentialProfiles = mergeCredentialProfiles({
    existing,
    status: input.status,
    label: input.label,
    ...(clearKeyRef ? { clearKeyRef } : {}),
  });
  const currentActiveKeyRef = existing?.credentialKeyRef || providerCredentialKeyRef({
    workspaceId: input.workspaceId,
    providerId: input.status.providerId,
  });
  const nextActiveKeyRef = input.status.configured
    ? input.status.keyRef
    : clearKeyRef && currentActiveKeyRef === clearKeyRef
      ? credentialProfiles[0]?.keyRef || undefined
      : currentActiveKeyRef;
  const activeProfile = credentialProfiles.find((profile) => profile.keyRef === nextActiveKeyRef);
  const activeMasked = input.status.configured && input.status.keyRef === nextActiveKeyRef
    ? input.status.apiKeyMasked
    : activeProfile?.apiKeyMasked || "";
  const hasApiKey = Boolean(input.status.configured || activeProfile);
  const status = !hasApiKey
    ? "idle" as const
    : input.status.configured
      ? "success" as const
      : "warning" as const;
  const providerId = input.status.providerId;
  const modelSlots = normalizeProviderModelSlots(providerId, {
    ...(existing?.modelSlots || {}),
    ...(input.settings?.modelSlots || {}),
  });
  const defaultModel = normalizeMimoProviderModel(providerId, input.settings?.defaultModel ?? existing?.defaultModel ?? "");
  if (providerId === "mimo") {
    delete modelSlots.image;
    if (defaultModel && !modelSlots.concept) modelSlots.concept = defaultModel;
  } else if (defaultModel && !modelSlots.image) {
    modelSlots.image = defaultModel;
  }
  const nextConfig = {
    providerId,
    enabled: hasApiKey ? input.settings?.enabled ?? existing?.enabled ?? input.enabledFallback ?? true : false,
    status,
    hasApiKey,
    apiKeyMasked: activeMasked,
    ...(nextActiveKeyRef ? { credentialKeyRef: nextActiveKeyRef } : {}),
    credentialProfiles,
    baseUrl: normalizeProviderBaseUrl(providerId, input.settings?.baseUrl ?? existing?.baseUrl ?? ""),
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

async function providerCredentialKeyRefForRequest(
  repository: StorageRepository,
  input: { workspaceId: string; providerId: string; keyRef?: string | undefined },
): Promise<string> {
  if (input.keyRef?.trim()) {
    return providerCredentialKeyRef({
      workspaceId: input.workspaceId,
      providerId: input.providerId,
      keyRef: input.keyRef,
    });
  }

  const loaded = await repository.loadSnapshot(input.workspaceId);
  if (loaded.ok) {
    const activeKeyRef = loaded.snapshot.providerConfigs[input.providerId as keyof typeof loaded.snapshot.providerConfigs]?.credentialKeyRef;
    if (activeKeyRef) {
      return providerCredentialKeyRef({
        workspaceId: input.workspaceId,
        providerId: input.providerId,
        keyRef: activeKeyRef,
      });
    }
  }

  return providerCredentialKeyRef(input);
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
    ...(options.isQueueCancellationRequested ? { isCancellationRequested: options.isQueueCancellationRequested } : {}),
  });

  return {
    async loadWorkspaceSnapshot(request) {
      try {
        const parsed = WorkspaceSnapshotLoadRequestSchema.parse(request);
        const loaded = await repository.loadSnapshot(parsed.workspaceId);

        if (!loaded.ok) {
          return WorkspaceSnapshotLoadResponseSchema.parse(storageLoadFailure(loaded, parsed.workspaceId));
        }

        const refreshed = await refreshResultQualityAudits({
          snapshot: loaded.snapshot,
          ...(options.resultFileStore ? { resultFileStore: options.resultFileStore } : {}),
        });
        if (refreshed.updated) await repository.saveSnapshot(refreshed.snapshot);

        return WorkspaceSnapshotLoadResponseSchema.parse({
          ok: true,
          data: { snapshot: refreshed.snapshot },
          meta: createApiMeta({
            workspaceId: refreshed.snapshot.metadata.workspaceId,
            revision: refreshed.snapshot.metadata.revision,
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
        const keyRef = await providerCredentialKeyRefForRequest(repository, parsed);
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
        const keyRef = await providerCredentialKeyRefForRequest(repository, parsed);
        const status = await credentialVault.save({
          providerId: parsed.providerId,
          keyRef,
          apiKey: parsed.apiKey.trim(),
        });
        const mirror = await updateProviderCredentialMirror({
          repository,
          workspaceId: parsed.workspaceId,
          status,
          label: parsed.label,
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

    async activateProviderCredential(request) {
      try {
        const parsed = ProviderCredentialActivateApiRequestSchema.parse(request);
        const keyRef = providerCredentialKeyRef({
          workspaceId: parsed.workspaceId,
          providerId: parsed.providerId,
          keyRef: parsed.keyRef,
        });
        const credentialStatus = await describeProviderCredentialStatus({
          credentialVault,
          providerId: parsed.providerId,
          keyRef,
        });
        const status = credentialStatus.status;
        const mirror = await updateProviderCredentialMirror({
          repository,
          workspaceId: parsed.workspaceId,
          status,
          settings: {
            enabled: status.configured,
          },
        });
        if ("failure" in mirror && mirror.failure) {
          return ProviderCredentialActivateApiResponseSchema.parse(mirror.failure);
        }

        return ProviderCredentialActivateApiResponseSchema.parse({
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
        return ProviderCredentialActivateApiResponseSchema.parse(
          failureFromError(error, {
            ...(workspaceId ? { workspaceId } : {}),
          }),
        );
      }
    },

    async deleteProviderCredential(request) {
      try {
        const parsed = ProviderCredentialDeleteApiRequestSchema.parse(request);
        const loaded = await repository.loadSnapshot(parsed.workspaceId);
        const existingConfig = loaded.ok ? loaded.snapshot.providerConfigs[parsed.providerId] : null;
        const keyRef = await providerCredentialKeyRefForRequest(repository, parsed);
        const remainingProfiles = (existingConfig?.credentialProfiles || []).filter((profile) => profile.keyRef !== keyRef);
        const nextActiveKeyRef = existingConfig?.credentialKeyRef === keyRef
          ? remainingProfiles[0]?.keyRef
          : existingConfig?.credentialKeyRef;
        const revoked = await credentialVault.revoke({
          providerId: parsed.providerId,
          keyRef,
        });
        const statusKeyRef = nextActiveKeyRef || keyRef;
        const status = await credentialVault.describe({
          providerId: parsed.providerId,
          keyRef: statusKeyRef,
        });
        const mirror = await updateProviderCredentialMirror({
          repository,
          workspaceId: parsed.workspaceId,
          status,
          clear: !nextActiveKeyRef,
          clearKeyRef: keyRef,
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
        const capabilityGate = evaluateQueuePlanCapabilityGate({
          mode: parsed.mode,
          providerId: parsed.providerId,
          ...(parsed.providerRoutes ? { providerRoutes: parsed.providerRoutes } : {}),
          regenerateSchemes: parsed.regenerateSchemes,
          includeImageGeneration: parsed.includeImageGeneration,
          includeImageEdit: parsed.includeImageEdit,
          includeUpscale: parsed.includeUpscale,
          includeBackgroundRemoval: parsed.includeBackgroundRemoval,
        });
        if (!capabilityGate.ok) {
          return QueuePlanCreateApiResponseSchema.parse(createFailure({
            code: "unsupported_capability",
            ...(parsed.workspaceId ? { workspaceId: parsed.workspaceId } : {}),
            message: providerCapabilityGateUserMessage(capabilityGate),
            details: { capabilityGate },
          }));
        }
        const queuePlan = createBatchQueuePlan({
          projectId: parsed.projectId,
          mode: parsed.mode,
          providerId: parsed.providerId,
          providerRoutes: parsed.providerRoutes,
          schemeIds: parsed.schemeIds,
          platformPresets: parsed.platformPresets,
          aspectRatios: parsed.aspectRatios,
          customSize: parsed.customSize,
          selectionMode: parsed.selectionMode,
          planStrategy: parsed.planStrategy,
          imagesPerScheme: parsed.imagesPerScheme,
          includeImageGeneration: parsed.includeImageGeneration,
          includeImageEdit: parsed.includeImageEdit,
          includeUpscale: parsed.includeUpscale,
          includeBackgroundRemoval: parsed.includeBackgroundRemoval,
	          regenerateSchemes: parsed.regenerateSchemes,
	          ...(parsed.batchId ? { batchId: parsed.batchId } : {}),
	          ...(parsed.sourceResultId ? { sourceResultId: parsed.sourceResultId } : {}),
	          ...(parsed.editInstruction ? { editInstruction: parsed.editInstruction } : {}),
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
        const refreshed = await refreshResultQualityAudits({
          snapshot: result.workspace,
          ...(options.resultFileStore ? { resultFileStore: options.resultFileStore } : {}),
        });
        if (refreshed.updated) await repository.saveSnapshot(refreshed.snapshot);

        return QueuePlanRunApiResponseSchema.parse({
          ok: true,
          data: {
            ...result,
            workspace: refreshed.snapshot,
          },
          meta: createApiMeta({
            workspaceId: parsed.workspaceId,
            revision: refreshed.snapshot.metadata.revision,
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
