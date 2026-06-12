import { z } from "zod";
import {
  PlatformPresetSchema,
  ProductionModeSchema,
  ProviderIdSchema,
} from "../schema/zod";
import { PromptBuilderInputSchema } from "../prompts/builder";
import { PromptPackageSchema } from "../prompts/contracts";
import { ProviderCredentialVaultStatusSchema } from "../providers/encrypted-credential-vault";
import { ProviderConnectionTestResultSchema } from "../providers/connection-diagnostic-contracts";
import { ProviderMappedRequestSchema, ProviderRequestMapperInputSchema } from "../providers/request-mapper";
import { QueuePlanSchema, QueueSummarySchema } from "../queue/contracts";
import { WorkspaceQueueWorkerInputSchema, WorkspaceQueueWorkerResultSchema } from "../queue/workspace-worker";
import { WorkspaceSnapshotSchema, WorkspaceSnapshotSummarySchema } from "../storage/contracts";
import {
  AssetCommitRequestSchema,
  AssetCommitResultSchema,
  AssetBinaryUploadResultSchema,
  AssetListRequestSchema,
  AssetListResultSchema,
  AssetUploadPlanRequestSchema,
  AssetUploadPlanResultSchema,
} from "../assets/contracts";
import { ResultDownloadDescriptorSchema } from "../results/download-descriptor";

export const ApiHttpMethodSchema = z.enum(["GET", "POST", "PATCH", "DELETE"]);
export const ApiRouteIdSchema = z.enum([
  "workspace.list",
  "workspace.create",
  "workspace.rename",
  "workspace.duplicate",
  "workspace.delete",
  "workspace.snapshot.load",
  "workspace.snapshot.save",
  "prompt.package.create",
  "provider.request.map",
  "provider.credential.status",
  "provider.credential.save",
  "provider.credential.delete",
  "provider.connection.test",
  "queue.plan.create",
  "queue.plan.run",
  "asset.upload.plan",
  "asset.binary.upload",
  "asset.record.commit",
  "asset.library.list",
  "result.download.describe",
  "result.delete",
]);

export const ApiErrorCodeSchema = z.enum([
  "bad_request",
  "validation_error",
  "not_found",
  "unsupported_provider",
  "unsupported_capability",
  "unauthorized",
  "conflict",
  "internal",
]);

export const ApiEnvelopeMetaSchema = z.object({
  traceId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  revision: z.number().int().min(1).optional(),
  createdAt: z.string().datetime(),
});

export const ApiErrorSchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string().min(1),
  fieldErrors: z.record(z.string(), z.array(z.string().min(1))).default({}),
  details: z.record(z.string(), z.unknown()).default({}),
});

export const ApiFailureEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: ApiErrorSchema,
  meta: ApiEnvelopeMetaSchema,
});

function apiSuccessEnvelope<DataSchema extends z.ZodTypeAny>(data: DataSchema) {
  return z.object({
    ok: z.literal(true),
    data,
    meta: ApiEnvelopeMetaSchema,
  });
}

export const WorkspaceSnapshotLoadRequestSchema = z.object({
  workspaceId: z.string().min(1),
});

export const WorkspaceSnapshotLoadResponseSchema = z.union([
  apiSuccessEnvelope(
    z.object({
      snapshot: WorkspaceSnapshotSchema,
    }),
  ),
  ApiFailureEnvelopeSchema,
]);

export const WorkspaceSnapshotSaveRequestSchema = z.object({
  snapshot: WorkspaceSnapshotSchema,
});

export const WorkspaceSnapshotSaveResponseSchema = z.union([
  apiSuccessEnvelope(
    z.object({
      summary: WorkspaceSnapshotSummarySchema,
    }),
  ),
  ApiFailureEnvelopeSchema,
]);

export const WorkspaceListResponseSchema = z.union([
  apiSuccessEnvelope(
    z.object({
      workspaces: z.array(WorkspaceSnapshotSummarySchema),
    }),
  ),
  ApiFailureEnvelopeSchema,
]);

export const WorkspaceCreateRequestSchema = z.object({
  name: z.string().max(80).optional(),
  sourceWorkspaceId: z.string().min(1).optional(),
});

export const WorkspaceRenameRequestSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().max(80),
});

export const WorkspaceDuplicateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().max(80).optional(),
});

export const WorkspaceDeleteRequestSchema = z.object({
  workspaceId: z.string().min(1),
});

export const WorkspaceMutationResponseSchema = z.union([
  apiSuccessEnvelope(
    z.object({
      summary: WorkspaceSnapshotSummarySchema,
      snapshot: WorkspaceSnapshotSchema,
      workspaces: z.array(WorkspaceSnapshotSummarySchema).optional(),
    }),
  ),
  ApiFailureEnvelopeSchema,
]);

export const WorkspaceDeleteResponseSchema = z.union([
  apiSuccessEnvelope(
    z.object({
      deletedWorkspaceId: z.string().min(1),
      fallbackWorkspaceId: z.string().min(1).nullable().default(null),
      workspaces: z.array(WorkspaceSnapshotSummarySchema),
    }),
  ),
  ApiFailureEnvelopeSchema,
]);

export const PromptPackageCreateApiRequestSchema = PromptBuilderInputSchema;

export const PromptPackageCreateApiResponseSchema = z.union([
  apiSuccessEnvelope(
    z.object({
      promptPackage: PromptPackageSchema,
    }),
  ),
  ApiFailureEnvelopeSchema,
]);

export const ProviderRequestMapApiRequestSchema = ProviderRequestMapperInputSchema;

export const ProviderRequestMapApiResponseSchema = z.union([
  apiSuccessEnvelope(
    z.object({
      mappedRequest: ProviderMappedRequestSchema,
    }),
  ),
  ApiFailureEnvelopeSchema,
]);

export const ProviderCredentialStatusApiRequestSchema = z.object({
  workspaceId: z.string().min(1),
  providerId: ProviderIdSchema,
  keyRef: z.string().min(1).max(160).optional(),
});

export const ProviderCredentialStatusApiResponseSchema = z.union([
  apiSuccessEnvelope(
    z.object({
      status: ProviderCredentialVaultStatusSchema,
      providerConfigUpdated: z.boolean().optional(),
      recoveredInvalidCredential: z.boolean().optional(),
    }),
  ),
  ApiFailureEnvelopeSchema,
]);

export const ProviderCredentialSaveApiRequestSchema = ProviderCredentialStatusApiRequestSchema.extend({
  apiKey: z.string().min(1).max(4096),
  label: z.string().min(1).max(80).optional(),
  baseUrl: z.string().url().or(z.literal("")).optional(),
  defaultModel: z.string().min(1).max(120).optional(),
  enabled: z.boolean().default(true),
  modelSlots: z.record(z.string().min(1), z.string().min(1)).optional(),
});

export const ProviderCredentialSaveApiResponseSchema = z.union([
  apiSuccessEnvelope(
    z.object({
      status: ProviderCredentialVaultStatusSchema,
      providerConfigUpdated: z.boolean(),
    }),
  ),
  ApiFailureEnvelopeSchema,
]);

export const ProviderCredentialDeleteApiRequestSchema = ProviderCredentialStatusApiRequestSchema;

export const ProviderCredentialActivateApiRequestSchema = ProviderCredentialStatusApiRequestSchema.extend({
  keyRef: z.string().min(1).max(160),
});

export const ProviderCredentialActivateApiResponseSchema = ProviderCredentialStatusApiResponseSchema;

export const ProviderCredentialDeleteApiResponseSchema = z.union([
  apiSuccessEnvelope(
    z.object({
      status: ProviderCredentialVaultStatusSchema,
      revoked: z.boolean(),
      providerConfigUpdated: z.boolean(),
    }),
  ),
  ApiFailureEnvelopeSchema,
]);

export const ProviderConnectionTestApiRequestSchema = ProviderCredentialStatusApiRequestSchema.extend({
  model: z.string().min(1).max(160).optional(),
  strictModel: z.boolean().default(false),
  verifyModels: z.boolean().default(true),
  timeoutMs: z.number().int().min(1000).max(30000).default(10000),
});

export const ProviderConnectionTestApiResponseSchema = z.union([
  apiSuccessEnvelope(
    z.object({
      result: ProviderConnectionTestResultSchema,
      providerConfigUpdated: z.boolean(),
    }),
  ),
  ApiFailureEnvelopeSchema,
]);

export const QueuePlanCreateApiRequestSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  projectId: z.string().min(1),
  mode: ProductionModeSchema,
  providerId: ProviderIdSchema.default("openai"),
  providerRoutes: z
    .record(
      z.string().min(1),
      z.object({
        providerId: ProviderIdSchema,
        model: z.string().min(1).optional(),
      }),
    )
    .optional(),
  schemeIds: z.array(z.string().min(1)).min(1),
  platformPresets: z.array(PlatformPresetSchema).min(1).optional(),
  aspectRatios: z.array(z.string().min(1)).min(1).optional(),
  customSize: z
    .object({
      width: z.number().int().min(256).max(8192),
      height: z.number().int().min(256).max(8192),
    })
    .nullable()
    .optional(),
  selectionMode: z.enum(["single", "suite", "custom-size"]).default("single"),
  planStrategy: z.enum(["unified", "independent"]).default("unified"),
  imagesPerScheme: z.number().int().min(1).max(8).default(1),
  includeImageGeneration: z.boolean().default(true),
  includeImageEdit: z.boolean().default(false),
  includeUpscale: z.boolean().default(false),
	  includeBackgroundRemoval: z.boolean().default(false),
	  sourceResultId: z.string().min(1).optional(),
	  editInstruction: z.string().min(1).max(2000).optional(),
	  regenerateSchemes: z.boolean().default(true),
	  batchId: z.string().min(1).max(80).optional(),
	});

export const QueuePlanCreateApiResponseSchema = z.union([
  apiSuccessEnvelope(
    z.object({
      queuePlan: QueuePlanSchema,
      summary: QueueSummarySchema,
    }),
  ),
  ApiFailureEnvelopeSchema,
]);

export const QueuePlanRunApiRequestSchema = WorkspaceQueueWorkerInputSchema;

export const QueuePlanRunApiResponseSchema = z.union([
  apiSuccessEnvelope(WorkspaceQueueWorkerResultSchema),
  ApiFailureEnvelopeSchema,
]);

export const AssetUploadPlanApiRequestSchema = AssetUploadPlanRequestSchema;

export const AssetUploadPlanApiResponseSchema = z.union([
  apiSuccessEnvelope(AssetUploadPlanResultSchema),
  ApiFailureEnvelopeSchema,
]);

export const AssetBinaryUploadApiRequestSchema = z.object({
  workspaceId: z.string().min(1),
  assetId: z.string().min(1),
  storageKey: z.string().min(1),
  fileName: z.string().min(1).max(180).optional(),
  mimeType: z.string().min(1).optional(),
  byteSize: z.number().int().min(1).optional(),
});

export const AssetBinaryUploadApiResponseSchema = z.union([
  apiSuccessEnvelope(AssetBinaryUploadResultSchema),
  ApiFailureEnvelopeSchema,
]);

export const AssetCommitApiRequestSchema = AssetCommitRequestSchema;

export const AssetCommitApiResponseSchema = z.union([
  apiSuccessEnvelope(AssetCommitResultSchema),
  ApiFailureEnvelopeSchema,
]);

export const AssetListApiRequestSchema = AssetListRequestSchema;

export const AssetListApiResponseSchema = z.union([
  apiSuccessEnvelope(AssetListResultSchema),
  ApiFailureEnvelopeSchema,
]);

export const ResultDownloadDescribeApiRequestSchema = z.object({
  workspaceId: z.string().min(1),
  resultId: z.string().min(1),
});

export const ResultDownloadDescribeApiResponseSchema = z.union([
  apiSuccessEnvelope(
    z.object({
      descriptor: ResultDownloadDescriptorSchema,
    }),
  ),
  ApiFailureEnvelopeSchema,
]);

export const ResultDeleteApiRequestSchema = z.object({
  workspaceId: z.string().min(1),
  resultId: z.string().min(1),
});

export const ResultDeleteApiResponseSchema = z.union([
  apiSuccessEnvelope(
    z.object({
      summary: WorkspaceSnapshotSummarySchema,
      snapshot: WorkspaceSnapshotSchema,
      deletedResultId: z.string().min(1),
      deletedArchiveRowCount: z.number().int().min(0),
      deletedFile: z.boolean(),
      deletedStorageKey: z.string().min(1).optional(),
    }),
  ),
  ApiFailureEnvelopeSchema,
]);

export const ApiRouteMetadataSchema = z.object({
  routeId: ApiRouteIdSchema,
  method: ApiHttpMethodSchema,
  path: z.string().min(1),
});

export type ApiHttpMethod = z.infer<typeof ApiHttpMethodSchema>;
export type ApiRouteId = z.infer<typeof ApiRouteIdSchema>;
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiEnvelopeMeta = z.infer<typeof ApiEnvelopeMetaSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ApiFailureEnvelope = z.infer<typeof ApiFailureEnvelopeSchema>;
export type WorkspaceSnapshotLoadRequest = z.infer<typeof WorkspaceSnapshotLoadRequestSchema>;
export type WorkspaceSnapshotLoadResponse = z.infer<typeof WorkspaceSnapshotLoadResponseSchema>;
export type WorkspaceSnapshotSaveRequest = z.infer<typeof WorkspaceSnapshotSaveRequestSchema>;
export type WorkspaceSnapshotSaveResponse = z.infer<typeof WorkspaceSnapshotSaveResponseSchema>;
export type WorkspaceListResponse = z.infer<typeof WorkspaceListResponseSchema>;
export type WorkspaceCreateRequest = z.infer<typeof WorkspaceCreateRequestSchema>;
export type WorkspaceRenameRequest = z.infer<typeof WorkspaceRenameRequestSchema>;
export type WorkspaceDuplicateRequest = z.infer<typeof WorkspaceDuplicateRequestSchema>;
export type WorkspaceDeleteRequest = z.infer<typeof WorkspaceDeleteRequestSchema>;
export type WorkspaceMutationResponse = z.infer<typeof WorkspaceMutationResponseSchema>;
export type WorkspaceDeleteResponse = z.infer<typeof WorkspaceDeleteResponseSchema>;
export type PromptPackageCreateApiRequest = z.infer<typeof PromptPackageCreateApiRequestSchema>;
export type PromptPackageCreateApiResponse = z.infer<typeof PromptPackageCreateApiResponseSchema>;
export type ProviderRequestMapApiRequest = z.infer<typeof ProviderRequestMapApiRequestSchema>;
export type ProviderRequestMapApiResponse = z.infer<typeof ProviderRequestMapApiResponseSchema>;
export type ProviderCredentialStatusApiRequest = z.infer<typeof ProviderCredentialStatusApiRequestSchema>;
export type ProviderCredentialStatusApiResponse = z.infer<typeof ProviderCredentialStatusApiResponseSchema>;
export type ProviderCredentialSaveApiRequest = z.infer<typeof ProviderCredentialSaveApiRequestSchema>;
export type ProviderCredentialSaveApiResponse = z.infer<typeof ProviderCredentialSaveApiResponseSchema>;
export type ProviderCredentialDeleteApiRequest = z.infer<typeof ProviderCredentialDeleteApiRequestSchema>;
export type ProviderCredentialDeleteApiResponse = z.infer<typeof ProviderCredentialDeleteApiResponseSchema>;
export type ProviderCredentialActivateApiRequest = z.infer<typeof ProviderCredentialActivateApiRequestSchema>;
export type ProviderCredentialActivateApiResponse = z.infer<typeof ProviderCredentialActivateApiResponseSchema>;
export type ProviderConnectionTestApiRequest = z.infer<typeof ProviderConnectionTestApiRequestSchema>;
export type ProviderConnectionTestApiResponse = z.infer<typeof ProviderConnectionTestApiResponseSchema>;
export type QueuePlanCreateApiRequest = z.input<typeof QueuePlanCreateApiRequestSchema>;
export type QueuePlanCreateApiResponse = z.infer<typeof QueuePlanCreateApiResponseSchema>;
export type QueuePlanRunApiRequest = z.infer<typeof QueuePlanRunApiRequestSchema>;
export type QueuePlanRunApiResponse = z.infer<typeof QueuePlanRunApiResponseSchema>;
export type AssetUploadPlanApiRequest = z.infer<typeof AssetUploadPlanApiRequestSchema>;
export type AssetUploadPlanApiResponse = z.infer<typeof AssetUploadPlanApiResponseSchema>;
export type AssetBinaryUploadApiRequest = z.infer<typeof AssetBinaryUploadApiRequestSchema>;
export type AssetBinaryUploadApiResponse = z.infer<typeof AssetBinaryUploadApiResponseSchema>;
export type AssetCommitApiRequest = z.infer<typeof AssetCommitApiRequestSchema>;
export type AssetCommitApiResponse = z.infer<typeof AssetCommitApiResponseSchema>;
export type AssetListApiRequest = z.infer<typeof AssetListApiRequestSchema>;
export type AssetListApiResponse = z.infer<typeof AssetListApiResponseSchema>;
export type ResultDownloadDescribeApiRequest = z.infer<typeof ResultDownloadDescribeApiRequestSchema>;
export type ResultDownloadDescribeApiResponse = z.infer<typeof ResultDownloadDescribeApiResponseSchema>;
export type ResultDeleteApiRequest = z.infer<typeof ResultDeleteApiRequestSchema>;
export type ResultDeleteApiResponse = z.infer<typeof ResultDeleteApiResponseSchema>;

export type ApiRouteContract = {
  routeId: ApiRouteId;
  method: ApiHttpMethod;
  path: string;
  requestSchema: z.ZodTypeAny;
  responseSchema: z.ZodTypeAny;
};

export const apiRouteContracts = {
  workspaceList: {
    routeId: "workspace.list",
    method: "GET",
    path: "/api/workspaces",
    requestSchema: z.object({}).default({}),
    responseSchema: WorkspaceListResponseSchema,
  },
  workspaceCreate: {
    routeId: "workspace.create",
    method: "POST",
    path: "/api/workspaces",
    requestSchema: WorkspaceCreateRequestSchema,
    responseSchema: WorkspaceMutationResponseSchema,
  },
  workspaceRename: {
    routeId: "workspace.rename",
    method: "PATCH",
    path: "/api/workspaces/:workspaceId",
    requestSchema: WorkspaceRenameRequestSchema,
    responseSchema: WorkspaceMutationResponseSchema,
  },
  workspaceDuplicate: {
    routeId: "workspace.duplicate",
    method: "POST",
    path: "/api/workspaces/:workspaceId/duplicate",
    requestSchema: WorkspaceDuplicateRequestSchema,
    responseSchema: WorkspaceMutationResponseSchema,
  },
  workspaceDelete: {
    routeId: "workspace.delete",
    method: "DELETE",
    path: "/api/workspaces/:workspaceId",
    requestSchema: WorkspaceDeleteRequestSchema,
    responseSchema: WorkspaceDeleteResponseSchema,
  },
  workspaceSnapshotLoad: {
    routeId: "workspace.snapshot.load",
    method: "GET",
    path: "/api/workspaces/:workspaceId",
    requestSchema: WorkspaceSnapshotLoadRequestSchema,
    responseSchema: WorkspaceSnapshotLoadResponseSchema,
  },
  workspaceSnapshotSave: {
    routeId: "workspace.snapshot.save",
    method: "POST",
    path: "/api/workspaces/:workspaceId/snapshot",
    requestSchema: WorkspaceSnapshotSaveRequestSchema,
    responseSchema: WorkspaceSnapshotSaveResponseSchema,
  },
  promptPackageCreate: {
    routeId: "prompt.package.create",
    method: "POST",
    path: "/api/workspaces/:workspaceId/prompts",
    requestSchema: PromptPackageCreateApiRequestSchema,
    responseSchema: PromptPackageCreateApiResponseSchema,
  },
  providerRequestMap: {
    routeId: "provider.request.map",
    method: "POST",
    path: "/api/workspaces/:workspaceId/provider-requests",
    requestSchema: ProviderRequestMapApiRequestSchema,
    responseSchema: ProviderRequestMapApiResponseSchema,
  },
  providerCredentialStatus: {
    routeId: "provider.credential.status",
    method: "GET",
    path: "/api/workspaces/:workspaceId/provider-credentials/:providerId",
    requestSchema: ProviderCredentialStatusApiRequestSchema,
    responseSchema: ProviderCredentialStatusApiResponseSchema,
  },
  providerCredentialSave: {
    routeId: "provider.credential.save",
    method: "POST",
    path: "/api/workspaces/:workspaceId/provider-credentials/:providerId",
    requestSchema: ProviderCredentialSaveApiRequestSchema,
    responseSchema: ProviderCredentialSaveApiResponseSchema,
  },
  providerCredentialDelete: {
    routeId: "provider.credential.delete",
    method: "DELETE",
    path: "/api/workspaces/:workspaceId/provider-credentials/:providerId",
    requestSchema: ProviderCredentialDeleteApiRequestSchema,
    responseSchema: ProviderCredentialDeleteApiResponseSchema,
  },
  providerConnectionTest: {
    routeId: "provider.connection.test",
    method: "POST",
    path: "/api/workspaces/:workspaceId/provider-credentials/:providerId/connection-test",
    requestSchema: ProviderConnectionTestApiRequestSchema,
    responseSchema: ProviderConnectionTestApiResponseSchema,
  },
  queuePlanCreate: {
    routeId: "queue.plan.create",
    method: "POST",
    path: "/api/workspaces/:workspaceId/queue-plans",
    requestSchema: QueuePlanCreateApiRequestSchema,
    responseSchema: QueuePlanCreateApiResponseSchema,
  },
  queuePlanRun: {
    routeId: "queue.plan.run",
    method: "POST",
    path: "/api/workspaces/:workspaceId/queue-plans/:jobId/run",
    requestSchema: QueuePlanRunApiRequestSchema,
    responseSchema: QueuePlanRunApiResponseSchema,
  },
  assetUploadPlan: {
    routeId: "asset.upload.plan",
    method: "POST",
    path: "/api/workspaces/:workspaceId/assets/upload-plan",
    requestSchema: AssetUploadPlanApiRequestSchema,
    responseSchema: AssetUploadPlanApiResponseSchema,
  },
  assetBinaryUpload: {
    routeId: "asset.binary.upload",
    method: "POST",
    path: "/api/workspaces/:workspaceId/assets/upload-binary",
    requestSchema: AssetBinaryUploadApiRequestSchema,
    responseSchema: AssetBinaryUploadApiResponseSchema,
  },
  assetCommit: {
    routeId: "asset.record.commit",
    method: "POST",
    path: "/api/workspaces/:workspaceId/assets",
    requestSchema: AssetCommitApiRequestSchema,
    responseSchema: AssetCommitApiResponseSchema,
  },
  assetList: {
    routeId: "asset.library.list",
    method: "GET",
    path: "/api/workspaces/:workspaceId/assets",
    requestSchema: AssetListApiRequestSchema,
    responseSchema: AssetListApiResponseSchema,
  },
  resultDownloadDescribe: {
    routeId: "result.download.describe",
    method: "GET",
    path: "/api/workspaces/:workspaceId/results/:resultId/download",
    requestSchema: ResultDownloadDescribeApiRequestSchema,
    responseSchema: ResultDownloadDescribeApiResponseSchema,
  },
  resultDelete: {
    routeId: "result.delete",
    method: "DELETE",
    path: "/api/workspaces/:workspaceId/results/:resultId",
    requestSchema: ResultDeleteApiRequestSchema,
    responseSchema: ResultDeleteApiResponseSchema,
  },
} satisfies Record<string, ApiRouteContract>;

export const apiRouteContractList = Object.values(apiRouteContracts);

export function getApiRouteContract(routeId: ApiRouteId): ApiRouteContract {
  const contract = apiRouteContractList.find((item) => item.routeId === routeId);
  if (!contract) throw new Error(`Unknown API route contract: ${routeId}`);
  return contract;
}
