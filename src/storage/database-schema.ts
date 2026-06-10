import { z } from "zod";
import {
  ProductionModeSchema,
  ProviderIdSchema,
  ProviderStatusSchema,
  ResultStatusSchema,
} from "../schema/zod";
import { ProviderModelSlotSchema } from "../providers/contracts";
import {
  StoredArchiveRowSchema,
  StoredAssetRecordSchema,
  StoredProviderConfigSchema,
  StoredResultAssetSchema,
  WorkspaceSnapshotSchema,
  type WorkspaceSnapshot,
} from "./contracts";
import { containsUnredactedSecret } from "./redaction";

export const databaseSchemaVersion = "database.v1";

export const DatabaseWorkspaceRowSchema = z.object({
  workspaceId: z.string().min(1),
  ownerId: z.string().min(1).nullable().default(null),
  projectId: z.string().min(1),
  projectName: z.string().max(80),
  activeMode: ProductionModeSchema,
  revision: z.number().int().min(1),
  snapshotJson: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const DatabaseAssetRowSchema = z.object({
  assetId: z.string().min(1),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  role: StoredAssetRecordSchema.shape.role,
  label: z.string().min(1),
  usageJson: z.string().min(1),
  metadataJson: z.string().min(1),
  storageKey: z.string().min(1).nullable().default(null),
  mimeType: z.string().min(1).nullable().default(null),
  byteSize: z.number().int().min(0).nullable().default(null),
  checksum: z.string().min(1).nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const DatabaseResultRowSchema = z.object({
  resultAssetId: z.string().min(1),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  schemeId: z.string().min(1),
  jobId: z.string().min(1),
  mode: ProductionModeSchema,
  status: ResultStatusSchema,
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  platformPreset: StoredResultAssetSchema.shape.platformPreset,
  language: StoredResultAssetSchema.shape.language.unwrap().nullable(),
  model: z.string().min(1),
  assetUrl: z.string().url().nullable().default(null),
  thumbnailUrl: z.string().url().nullable().default(null),
  metadataJson: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const DatabaseProviderConfigRowSchema = z.object({
  workspaceId: z.string().min(1),
  providerId: ProviderIdSchema,
  enabled: z.boolean(),
  status: ProviderStatusSchema,
  hasApiKey: z.boolean(),
  apiKeyMasked: z.string().max(120),
  credentialKeyRef: z.string().min(1).max(160).optional(),
  credentialProfilesJson: z.string().min(1).optional(),
  baseUrl: z.string(),
  defaultModel: z.string(),
  modelSlotsJson: z.string().min(1),
  updatedAt: z.string().datetime(),
});

export const DatabaseArchiveRowSchema = z.object({
  archiveRowId: z.string().min(1),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  resultAssetId: z.string().min(1),
  title: z.string().min(1),
  mode: ProductionModeSchema,
  model: z.string().min(1),
  state: StoredArchiveRowSchema.shape.state,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const DatabaseWorkspaceRowsSchema = z.object({
  workspace: DatabaseWorkspaceRowSchema,
  assets: z.array(DatabaseAssetRowSchema),
  results: z.array(DatabaseResultRowSchema),
  providerConfigs: z.array(DatabaseProviderConfigRowSchema),
  archiveRows: z.array(DatabaseArchiveRowSchema),
});

export const DatabaseProviderModelSlotsSchema = z.partialRecord(ProviderModelSlotSchema, z.string().min(1));

export type DatabaseWorkspaceRow = z.infer<typeof DatabaseWorkspaceRowSchema>;
export type DatabaseAssetRow = z.infer<typeof DatabaseAssetRowSchema>;
export type DatabaseResultRow = z.infer<typeof DatabaseResultRowSchema>;
export type DatabaseProviderConfigRow = z.infer<typeof DatabaseProviderConfigRowSchema>;
export type DatabaseArchiveRow = z.infer<typeof DatabaseArchiveRowSchema>;
export type DatabaseWorkspaceRows = z.infer<typeof DatabaseWorkspaceRowsSchema>;

function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid database JSON payload: ${(error as Error).message}`);
  }
}

export function workspaceSnapshotForDatabase(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const parsed = WorkspaceSnapshotSchema.parse(snapshot);
  const databaseSnapshot = WorkspaceSnapshotSchema.parse({
    ...parsed,
    metadata: {
      ...parsed.metadata,
      backend: "database",
    },
  });

  if (containsUnredactedSecret(databaseSnapshot)) {
    throw new Error("Database snapshots must not contain unredacted provider secrets.");
  }

  return databaseSnapshot;
}

export function workspaceSnapshotToDatabaseRows(snapshot: WorkspaceSnapshot): DatabaseWorkspaceRows {
  const databaseSnapshot = workspaceSnapshotForDatabase(snapshot);
  const workspaceId = databaseSnapshot.metadata.workspaceId;

  const workspace = DatabaseWorkspaceRowSchema.parse({
    workspaceId,
    ownerId: databaseSnapshot.metadata.ownerId,
    projectId: databaseSnapshot.project.id,
    projectName: databaseSnapshot.project.name,
    activeMode: databaseSnapshot.activeMode,
    revision: databaseSnapshot.metadata.revision,
    snapshotJson: stringifyJson(databaseSnapshot),
    createdAt: databaseSnapshot.metadata.createdAt,
    updatedAt: databaseSnapshot.metadata.updatedAt,
  });

  const assets = databaseSnapshot.assets.map((asset) =>
    DatabaseAssetRowSchema.parse({
      assetId: asset.id,
      workspaceId,
      projectId: asset.projectId,
      role: asset.role,
      label: asset.label,
      usageJson: stringifyJson(asset.usage),
      metadataJson: stringifyJson(asset.metadata),
      storageKey: asset.storageKey,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      checksum: asset.checksum,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    }),
  );

  const results = databaseSnapshot.results.map((result) =>
    DatabaseResultRowSchema.parse({
      resultAssetId: result.id,
      workspaceId,
      projectId: result.projectId,
      schemeId: result.schemeId,
      jobId: result.jobId,
      mode: result.mode,
      status: result.status,
      width: result.width,
      height: result.height,
      platformPreset: result.platformPreset,
      language: result.language ?? null,
      model: result.model,
      assetUrl: result.assetUrl,
      thumbnailUrl: result.thumbnailUrl,
      metadataJson: stringifyJson(result.metadata),
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    }),
  );

  const providerConfigs = Object.values(databaseSnapshot.providerConfigs).map((config) =>
    DatabaseProviderConfigRowSchema.parse({
      workspaceId,
      providerId: config.providerId,
      enabled: config.enabled,
      status: config.status,
      hasApiKey: config.hasApiKey,
      apiKeyMasked: config.apiKeyMasked,
      credentialKeyRef: config.credentialKeyRef,
      credentialProfilesJson: stringifyJson(config.credentialProfiles || []),
      baseUrl: config.baseUrl,
      defaultModel: config.defaultModel,
      modelSlotsJson: stringifyJson(config.modelSlots),
      updatedAt: config.updatedAt,
    }),
  );

  const archiveRows = databaseSnapshot.archiveRows.map((row) =>
    DatabaseArchiveRowSchema.parse({
      archiveRowId: row.id,
      workspaceId,
      projectId: row.projectId,
      resultAssetId: row.resultAssetId,
      title: row.title,
      mode: row.mode,
      model: row.model,
      state: row.state,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }),
  );

  return DatabaseWorkspaceRowsSchema.parse({
    workspace,
    assets,
    results,
    providerConfigs,
    archiveRows,
  });
}

export function workspaceSnapshotFromDatabaseRow(row: unknown): WorkspaceSnapshot {
  const parsed = DatabaseWorkspaceRowSchema.parse(row);
  return WorkspaceSnapshotSchema.parse(parseJson(parsed.snapshotJson));
}

export function providerConfigFromDatabaseRow(row: unknown) {
  const parsed = DatabaseProviderConfigRowSchema.parse(row);
  return StoredProviderConfigSchema.parse({
    providerId: parsed.providerId,
    enabled: parsed.enabled,
    status: parsed.status,
    hasApiKey: parsed.hasApiKey,
    apiKeyMasked: parsed.apiKeyMasked,
    credentialKeyRef: parsed.credentialKeyRef,
    credentialProfiles: parseJson(parsed.credentialProfilesJson || "[]"),
    baseUrl: parsed.baseUrl,
    defaultModel: parsed.defaultModel,
    modelSlots: DatabaseProviderModelSlotsSchema.parse(parseJson(parsed.modelSlotsJson)),
    updatedAt: parsed.updatedAt,
  });
}
