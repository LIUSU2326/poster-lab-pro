import { z } from "zod";
import {
  AssetSchema,
  BrandKitSchema,
  CharacterProfileSchema,
  ModeFormSchema,
  OutputSettingsFormSchema,
  ProductionModeSchema,
  ProjectBriefFormSchema,
  ProjectSchema,
  ProviderIdSchema,
  ProviderStatusSchema,
  ResultAssetSchema,
  SchemeBriefSchema,
  SloganSettingsFormSchema,
  type ProviderId,
} from "../schema/zod";
import { QueuePlanSchema, QueueSummarySchema } from "../queue/contracts";
import { ProviderModelSlotSchema } from "../providers/contracts";

export const WorkspaceSnapshotVersionSchema = z.literal("workspace.v1");
export const StorageBackendSchema = z.enum(["memory", "localDraft", "database", "exportFile"]);
export const StoredAssetUsageSchema = z.enum(["input", "reference", "generated", "mask", "export"]);

export const StoredProviderConfigSchema = z.object({
  providerId: ProviderIdSchema,
  enabled: z.boolean().default(false),
  status: ProviderStatusSchema.default("idle"),
  hasApiKey: z.boolean().default(false),
  apiKeyMasked: z.string().max(120).default(""),
  baseUrl: z.string().url().or(z.literal("")).default(""),
  defaultModel: z.string().max(120).default(""),
  modelSlots: z.partialRecord(ProviderModelSlotSchema, z.string().min(1)).default({}),
  updatedAt: z.string().datetime(),
});

export const StoredAssetRecordSchema = AssetSchema.extend({
  usage: z.array(StoredAssetUsageSchema).min(1).default(["input"]),
  storageKey: z.string().min(1).nullable().default(null),
  mimeType: z.string().min(1).nullable().default(null),
  byteSize: z.number().int().min(0).nullable().default(null),
  checksum: z.string().min(1).nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const StoredResultAssetSchema = ResultAssetSchema.extend({
  taskId: z.string().min(1),
  providerResultId: z.string().min(1).nullable().default(null),
  thumbnailUrl: z.string().url().nullable().default(null),
  assetUrl: z.string().url().nullable().default(null),
  favorite: z.boolean().default(false),
  archivedAt: z.string().datetime().nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const StoredArchiveRowSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  resultAssetId: z.string().min(1),
  title: z.string().min(1).max(160),
  mode: ProductionModeSchema,
  model: z.string().min(1),
  state: z.enum(["editable", "missing", "archived"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const StoredReferenceAnalysisSchema = z.object({
  key: z.string().min(1).max(160),
  kind: z.enum(["composition", "full", "style"]),
  role: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  providerId: ProviderIdSchema,
  model: z.string().min(1).max(160),
  text: z.string().min(1).max(8000),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const WorkspaceModeStateSchema = z.object({
  mode: ProductionModeSchema,
  projectBrief: ProjectBriefFormSchema,
  outputSettings: OutputSettingsFormSchema,
  sloganSettings: SloganSettingsFormSchema,
  modeForm: ModeFormSchema,
  selectedSchemeIds: z.array(z.string().min(1)).default([]),
  updatedAt: z.string().datetime(),
});

export const WorkspaceSnapshotMetadataSchema = z.object({
  workspaceId: z.string().min(1),
  ownerId: z.string().min(1).nullable().default(null),
  backend: StorageBackendSchema.default("memory"),
  revision: z.number().int().min(1).default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const WorkspaceSnapshotSchema = z.object({
  version: WorkspaceSnapshotVersionSchema,
  metadata: WorkspaceSnapshotMetadataSchema,
  activeMode: ProductionModeSchema,
  project: ProjectSchema,
  brandKit: BrandKitSchema.nullable().default(null),
  characters: z.array(CharacterProfileSchema).default([]),
  assets: z.array(StoredAssetRecordSchema).default([]),
  providerConfigs: z.partialRecord(ProviderIdSchema, StoredProviderConfigSchema).default({}),
  modeStates: z.array(WorkspaceModeStateSchema).min(1),
  schemes: z.array(SchemeBriefSchema).default([]),
  queuePlans: z.array(QueuePlanSchema).default([]),
  queueSummaries: z.array(QueueSummarySchema).default([]),
  referenceAnalyses: z.array(StoredReferenceAnalysisSchema).default([]),
  results: z.array(StoredResultAssetSchema).default([]),
  archiveRows: z.array(StoredArchiveRowSchema).default([]),
});

export const WorkspaceSnapshotSummarySchema = z.object({
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  activeMode: ProductionModeSchema,
  revision: z.number().int().min(1),
  assetCount: z.number().int().min(0),
  schemeCount: z.number().int().min(0),
  resultCount: z.number().int().min(0),
  runningQueueCount: z.number().int().min(0),
  updatedAt: z.string().datetime(),
});

export type WorkspaceSnapshotVersion = z.infer<typeof WorkspaceSnapshotVersionSchema>;
export type StorageBackend = z.infer<typeof StorageBackendSchema>;
export type StoredAssetUsage = z.infer<typeof StoredAssetUsageSchema>;
export type StoredProviderConfig = z.infer<typeof StoredProviderConfigSchema>;
export type StoredAssetRecord = z.infer<typeof StoredAssetRecordSchema>;
export type StoredResultAsset = z.infer<typeof StoredResultAssetSchema>;
export type StoredArchiveRow = z.infer<typeof StoredArchiveRowSchema>;
export type StoredReferenceAnalysis = z.infer<typeof StoredReferenceAnalysisSchema>;
export type WorkspaceModeState = z.infer<typeof WorkspaceModeStateSchema>;
export type WorkspaceSnapshotMetadata = z.infer<typeof WorkspaceSnapshotMetadataSchema>;
export type WorkspaceSnapshot = z.infer<typeof WorkspaceSnapshotSchema>;
export type WorkspaceSnapshotSummary = z.infer<typeof WorkspaceSnapshotSummarySchema>;

export type StorageSaveResult = {
  ok: true;
  snapshot: WorkspaceSnapshotSummary;
};

export type StorageLoadResult =
  | { ok: true; snapshot: WorkspaceSnapshot }
  | { ok: false; code: "not_found" | "version_mismatch" | "invalid_snapshot"; message: string };

export type StorageRepository = {
  backend: StorageBackend;
  saveSnapshot(snapshot: WorkspaceSnapshot): Promise<StorageSaveResult>;
  loadSnapshot(workspaceId: string): Promise<StorageLoadResult>;
  listSnapshots(projectId?: string): Promise<WorkspaceSnapshotSummary[]>;
};

export function summarizeWorkspaceSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshotSummary {
  return WorkspaceSnapshotSummarySchema.parse({
    workspaceId: snapshot.metadata.workspaceId,
    projectId: snapshot.project.id,
    projectName: snapshot.project.name,
    activeMode: snapshot.activeMode,
    revision: snapshot.metadata.revision,
    assetCount: snapshot.assets.length,
    schemeCount: snapshot.schemes.length,
    resultCount: snapshot.results.length,
    runningQueueCount: snapshot.queuePlans.filter((plan) => plan.job.status === "running" || plan.job.status === "queued").length,
    updatedAt: snapshot.metadata.updatedAt,
  });
}

export function providerConfigFor(snapshot: WorkspaceSnapshot, providerId: ProviderId): StoredProviderConfig | null {
  return snapshot.providerConfigs[providerId] || null;
}
