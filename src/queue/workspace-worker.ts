import { z } from "zod";
import {
  StoredArchiveRowSchema,
  StoredResultAssetSchema,
  WorkspaceSnapshotSchema,
  providerConfigFor,
  type StorageRepository,
  type StoredArchiveRow,
  type StoredAssetRecord,
  type StoredProviderConfig,
  type StoredResultAsset,
  type WorkspaceSnapshot,
  type WorkspaceSnapshotSummary,
} from "../storage/contracts";
import {
  createMemoryCredentialResolver,
  createProviderCredentialRef,
  type CredentialResolver,
  type ProviderCredentialRef,
} from "../providers/credentials";
import { getProviderManifest } from "../providers/manifests";
import type { ProviderAdapterRegistry } from "../providers/executor";
import type { LocalResultFileStore, ResultStoredFileMetadata } from "../results/file-store";
import type { ProviderId } from "../schema/zod";
import { providerCredentialKeyRef } from "../api/provider-credential-refs";
import { isPosterIntegratedReferenceAsset, posterAssetSemanticRole } from "../assets/semantic-roles";
import {
  applyPosterAssetOverlays,
  prepareImageForTargetSize,
  type ImageOutputProcessing,
  type PosterAssetOverlayInputAsset,
} from "../results/image-post-processing";
import { summarizeWorkspaceSnapshot } from "../storage/contracts";
import {
  QueuePlanSchema,
  QueueSummarySchema,
  summarizeQueue,
  type QueuePlan,
  type QueueSummary,
  type QueueTask,
} from "./contracts";
import { runMockQueuePlan } from "./mock-runner";

export const WorkspaceQueueWorkerInputSchema = z.object({
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
  archiveResults: z.boolean().default(true),
});

export const WorkspaceQueueWorkerResultSchema = z.object({
  workspace: WorkspaceSnapshotSchema,
  summary: QueueSummarySchema,
  resultCount: z.number().int().min(0),
  archiveRowCount: z.number().int().min(0),
});

export type WorkspaceQueueWorkerInput = z.infer<typeof WorkspaceQueueWorkerInputSchema>;
export type WorkspaceQueueWorkerResult = z.infer<typeof WorkspaceQueueWorkerResultSchema>;

export type WorkspaceQueueWorkerOptions = {
  repository: StorageRepository;
  now?: () => string;
  credentialResolver?: CredentialResolver;
  credentialRefs?: Partial<Record<ProviderId, ProviderCredentialRef>>;
  storedCredentialSource?: "runtime" | "secretStore";
  providerRegistry?: ProviderAdapterRegistry;
  resultFileStore?: Pick<LocalResultFileStore, "storeDataUrl">;
  useMockCredentials?: boolean;
};

function cloneSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return WorkspaceSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
}

async function loadWorkspace(repository: StorageRepository, workspaceId: string): Promise<WorkspaceSnapshot> {
  const loaded = await repository.loadSnapshot(workspaceId);
  if (!loaded.ok) throw new Error(loaded.message);
  return cloneSnapshot(loaded.snapshot);
}

function findQueuePlan(snapshot: WorkspaceSnapshot, jobId: string): QueuePlan {
  const plan = snapshot.queuePlans.find((candidate) => candidate.job.id === jobId);
  if (!plan) throw new Error(`Queue plan ${jobId} was not found in workspace ${snapshot.metadata.workspaceId}.`);
  return QueuePlanSchema.parse(plan);
}

function taskCreatesResult(task: QueueTask): boolean {
  return ["imageGeneration", "imageEdit", "upscale", "backgroundRemoval"].includes(task.kind);
}

function providerAssetFromTask(task: QueueTask, providerResultId: string, index: number): Record<string, unknown> | null {
  const providerAssets = task.output.metadata.providerAssets;
  if (!Array.isArray(providerAssets)) return null;
  const exact = providerAssets.find((asset) =>
    Boolean(asset && typeof asset === "object" && "id" in asset && asset.id === providerResultId),
  );
  const candidate = exact || providerAssets[index];
  return candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : null;
}

function stringField(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberField(source: Record<string, unknown> | null, key: string): number | null {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resultIdForTask(task: QueueTask, index: number): string {
  return `result-${task.id}-${index + 1}`;
}

function fileNameForResult(task: QueueTask, index: number, width: number, height: number): string {
  return [task.mode, task.input.schemeId || task.kind, `${width}x${height}`, String(index + 1)].join("-");
}

function providerAssetForMetadata(
  providerAsset: Record<string, unknown> | null,
  resultFile: ResultStoredFileMetadata | null,
): Record<string, unknown> | null {
  if (!providerAsset || !resultFile || !stringField(providerAsset, "dataUrl")) return providerAsset;
  const { dataUrl: _dataUrl, ...safeProviderAsset } = providerAsset;
  return {
    ...safeProviderAsset,
    dataUrlPersisted: true,
  };
}

function isExampleAssetUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname === "example.com";
  } catch {
    return /example\.com/i.test(url);
  }
}

function assetMetadataString(asset: StoredAssetRecord, key: string): string | null {
  const value = asset.metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function dateValue(value: string | null | undefined): number {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function overlayAssetDedupeKey(asset: StoredAssetRecord): string {
  return [
    asset.role,
    asset.checksum || assetMetadataString(asset, "originalFileName") || asset.storageKey || asset.id,
    asset.byteSize ?? "",
  ].join("|");
}

function latestUniqueOverlayAssets(assets: StoredAssetRecord[]): StoredAssetRecord[] {
  const byKey = new Map<string, StoredAssetRecord>();
  for (const asset of assets) {
    const key = overlayAssetDedupeKey(asset);
    const existing = byKey.get(key);
    if (!existing || dateValue(asset.updatedAt || asset.createdAt) >= dateValue(existing.updatedAt || existing.createdAt)) {
      byKey.set(key, asset);
    }
  }
  return [...byKey.values()];
}

function selectPosterOverlayAssets(snapshot: WorkspaceSnapshot): PosterAssetOverlayInputAsset[] {
  const candidates = latestUniqueOverlayAssets(snapshot.assets.filter((asset) =>
    asset.projectId === snapshot.project.id &&
    isPosterIntegratedReferenceAsset(asset) &&
    Boolean(asset.previewUrl) &&
    !isExampleAssetUrl(asset.previewUrl),
  ));
  const newestFirst = (left: StoredAssetRecord, right: StoredAssetRecord) =>
    dateValue(right.updatedAt || right.createdAt) - dateValue(left.updatedAt || left.createdAt);
  const props = candidates.filter((asset) =>
    ["antagonist", "prop", "keySubject"].includes(posterAssetSemanticRole(asset)),
  ).sort(newestFirst).slice(0, 1);
  const characters = candidates.filter((asset) => posterAssetSemanticRole(asset) === "protagonist").sort((left, right) =>
    dateValue(left.createdAt) - dateValue(right.createdAt),
  ).slice(0, 3);
  const logos = candidates.filter((asset) => posterAssetSemanticRole(asset) === "brandLogo").sort(newestFirst).slice(0, 1);

  return [...props, ...characters, ...logos].map((asset) => ({
    id: asset.id,
    role: asset.role,
    label: asset.label,
    previewUrl: asset.previewUrl || null,
    mimeType: asset.mimeType,
  }));
}

function metadataBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === 1;
}

function shouldApplyPosterAssetOverlay(task: QueueTask): boolean {
  if (process.env.POSTER_LAB_FORCE_ASSET_OVERLAY === "1") return true;
  if (process.env.POSTER_LAB_FORCE_SCENE_PLATE === "1") return true;
  if (process.env.POSTER_LAB_FORCE_ASSET_OVERLAY === "0") return false;
  return task.mode === "poster" && (
    metadataBoolean(task.output.metadata.assetOverlayFallback) ||
    metadataBoolean(task.output.metadata.posterAssetOverlayFallback)
  );
}

function posterSloganForScheme(snapshot: WorkspaceSnapshot | undefined, schemeId: string | null | undefined): string | null {
  if (!snapshot || !schemeId) return null;
  const scheme = snapshot.schemes.find((item) => item.id === schemeId);
  const slogans = scheme?.slogans || {};
  return slogans["en-US"] || slogans["zh-CN"] || slogans["ja-JP"] || slogans["ko-KR"] || null;
}

function sanitizeProviderAssetForQueue(providerAsset: unknown): unknown {
  if (!providerAsset || typeof providerAsset !== "object") return providerAsset;
  if (!("dataUrl" in providerAsset)) return providerAsset;
  const { dataUrl: _dataUrl, ...safeProviderAsset } = providerAsset as Record<string, unknown>;
  return {
    ...safeProviderAsset,
    dataUrlPersisted: true,
  };
}

function sanitizeQueuePlanProviderAssets(plan: QueuePlan): QueuePlan {
  return QueuePlanSchema.parse({
    ...plan,
    tasks: plan.tasks.map((task) => {
      const providerAssets = task.output.metadata.providerAssets;
      if (!Array.isArray(providerAssets)) return task;
      return {
        ...task,
        output: {
          ...task.output,
          metadata: {
            ...task.output.metadata,
            providerAssets: providerAssets.map(sanitizeProviderAssetForQueue),
          },
        },
      };
    }),
  });
}

async function storeResultFile(input: {
  fileStore?: Pick<LocalResultFileStore, "storeDataUrl">;
  workspaceId: string;
  task: QueueTask;
  providerAsset: Record<string, unknown> | null;
  resultId: string;
  index: number;
  width: number;
  height: number;
  dataUrl?: string | null;
}): Promise<ResultStoredFileMetadata | null> {
  const dataUrl = input.dataUrl || stringField(input.providerAsset, "dataUrl");
  if (!input.fileStore || !dataUrl) return null;

  return input.fileStore.storeDataUrl({
    workspaceId: input.workspaceId,
    resultId: input.resultId,
    fileName: fileNameForResult(input.task, input.index, input.width, input.height),
    dataUrl,
  });
}

function resultFromTask(
  task: QueueTask,
  providerResultId: string,
  index: number,
  createdAt: string,
  resultFile: ResultStoredFileMetadata | null = null,
  outputProcessing: ImageOutputProcessing | null = null,
  dimensions?: { width: number; height: number },
  extraMetadata: Record<string, unknown> = {},
): StoredResultAsset {
  const providerAsset = providerAssetFromTask(task, providerResultId, index);
  const safeProviderAsset = providerAssetForMetadata(providerAsset, resultFile);
  const assetUrl = stringField(providerAsset, "url");
  const width = dimensions?.width || numberField(providerAsset, "width") || task.input.width || 1024;
  const height = dimensions?.height || numberField(providerAsset, "height") || task.input.height || 1024;
  const { providerAssets: _providerAssets, ...taskMetadata } = task.output.metadata;

  return StoredResultAssetSchema.parse({
    id: resultIdForTask(task, index),
    projectId: task.jobId.split("-").slice(2).join("-") || "project",
    schemeId: task.input.schemeId || "scheme-unknown",
    jobId: task.jobId,
    mode: task.mode,
    width,
    height,
    platformPreset: task.input.platformPreset || "custom",
    language: null,
    model: task.input.model || task.kind,
    status: "ready",
    taskId: task.id,
    providerResultId,
    thumbnailUrl: null,
    assetUrl,
    favorite: false,
    archivedAt: null,
    metadata: {
      queueTaskKind: task.kind,
      sourceResultId: task.input.sourceResultId || null,
      providerCapability: task.providerCapability || null,
      ...taskMetadata,
      ...(resultFile ? { resultFile } : {}),
      ...(outputProcessing ? { outputProcessing } : {}),
      ...(safeProviderAsset ? { providerAsset: safeProviderAsset } : {}),
      ...extraMetadata,
    },
    createdAt,
    updatedAt: createdAt,
  });
}

async function resultFromTaskWithProject(input: {
  task: QueueTask;
  providerResultId: string;
  index: number;
  projectId: string;
  workspaceId: string;
  createdAt: string;
  fileStore?: Pick<LocalResultFileStore, "storeDataUrl">;
  snapshot?: WorkspaceSnapshot;
}): Promise<StoredResultAsset> {
  const providerAsset = providerAssetFromTask(input.task, input.providerResultId, input.index);
  const sourceWidth = numberField(providerAsset, "width") || input.task.input.width || 1024;
  const sourceHeight = numberField(providerAsset, "height") || input.task.input.height || 1024;
  const prepared = await prepareImageForTargetSize({
    dataUrl: stringField(providerAsset, "dataUrl"),
    sourceWidth,
    sourceHeight,
    targetWidth: input.task.input.width || null,
    targetHeight: input.task.input.height || null,
  });
  const overlayAssets = shouldApplyPosterAssetOverlay(input.task) && input.task.mode === "poster" && input.snapshot
    ? selectPosterOverlayAssets(input.snapshot)
    : [];
  const overlayed = overlayAssets.length > 0
    ? await applyPosterAssetOverlays({
        dataUrl: prepared.dataUrl,
        width: prepared.width,
        height: prepared.height,
        assets: overlayAssets,
        slogan: posterSloganForScheme(input.snapshot, input.task.input.schemeId),
      })
    : null;
  const resultFile = await storeResultFile({
    ...(input.fileStore ? { fileStore: input.fileStore } : {}),
    workspaceId: input.workspaceId,
    task: input.task,
    providerAsset,
    resultId: resultIdForTask(input.task, input.index),
    index: input.index,
    width: prepared.width,
    height: prepared.height,
    dataUrl: overlayed?.dataUrl || prepared.dataUrl,
  });
  const result = resultFromTask(
    input.task,
    input.providerResultId,
    input.index,
    input.createdAt,
    resultFile,
    prepared.processing,
    { width: prepared.width, height: prepared.height },
    overlayed?.processing ? { assetOverlayProcessing: overlayed.processing } : {},
  );
  return StoredResultAssetSchema.parse({
    ...result,
    projectId: input.projectId,
  });
}

function archiveRowFromResult(result: StoredResultAsset, createdAt: string): StoredArchiveRow {
  return StoredArchiveRowSchema.parse({
    id: `archive-${result.id}`,
    projectId: result.projectId,
    resultAssetId: result.id,
    title: `${result.mode} ${result.schemeId} ${result.width}x${result.height}`,
    mode: result.mode,
    model: result.model,
    state: "editable",
    createdAt,
    updatedAt: createdAt,
  });
}

function mergeResults(existing: StoredResultAsset[], incoming: StoredResultAsset[]): StoredResultAsset[] {
  const merged = new Map(existing.map((result) => [result.id, result]));
  for (const result of incoming) merged.set(result.id, result);
  return [...merged.values()];
}

function mergeArchiveRows(existing: StoredArchiveRow[], incoming: StoredArchiveRow[]): StoredArchiveRow[] {
  const merged = new Map(existing.map((row) => [row.id, row]));
  for (const row of incoming) merged.set(row.id, row);
  return [...merged.values()];
}

function mergeQueuePlans(existing: QueuePlan[], incoming: QueuePlan): QueuePlan[] {
  const merged = new Map(existing.map((plan) => [plan.job.id, plan]));
  merged.set(incoming.job.id, incoming);
  return [...merged.values()];
}

function mergeQueueSummaries(existing: QueueSummary[], incoming: QueueSummary): QueueSummary[] {
  const merged = new Map(existing.map((summary) => [summary.jobId, summary]));
  merged.set(incoming.jobId, incoming);
  return [...merged.values()];
}

function credentialRefFromStoredConfig(
  config: StoredProviderConfig | null | undefined,
  workspaceId: string,
  source: "runtime" | "secretStore" = "runtime",
): ProviderCredentialRef | undefined {
  if (!config?.hasApiKey) return undefined;
  return createProviderCredentialRef({
    providerId: config.providerId,
    source,
    keyRef: source === "secretStore" ? providerCredentialKeyRef({ workspaceId, providerId: config.providerId }) : config.providerId,
    apiKeyPreview: config.apiKeyMasked,
    configured: config.hasApiKey,
    updatedAt: config.updatedAt,
  });
}

function credentialRefsFromSnapshot(
  snapshot: WorkspaceSnapshot,
  explicitRefs: Partial<Record<ProviderId, ProviderCredentialRef>> | undefined,
  source: "runtime" | "secretStore",
): Partial<Record<ProviderId, ProviderCredentialRef>> {
  const refs: Partial<Record<ProviderId, ProviderCredentialRef>> = { ...(explicitRefs || {}) };
  for (const config of Object.values(snapshot.providerConfigs || {})) {
    if (!config?.providerId || refs[config.providerId]) continue;
    const ref = credentialRefFromStoredConfig(config, snapshot.metadata.workspaceId, source);
    if (ref) refs[config.providerId] = ref;
  }
  return refs;
}

function mockCredentialRefFromStoredConfig(
  config: StoredProviderConfig | null | undefined,
  workspaceId: string,
  source: "runtime" | "secretStore" = "runtime",
): ProviderCredentialRef | undefined {
  if (!config) return undefined;
  const manifest = getProviderManifest(config.providerId);
  if (!manifest.apiKeyRequired) return undefined;
  return createProviderCredentialRef({
    providerId: config.providerId,
    source,
    keyRef: source === "secretStore" ? providerCredentialKeyRef({ workspaceId, providerId: config.providerId }) : config.providerId,
    apiKeyPreview: `mock-${config.providerId}-queue-runtime-key`,
    configured: true,
    updatedAt: config.updatedAt,
  });
}

function addMockCredentialRefs(
  snapshot: WorkspaceSnapshot,
  refs: Partial<Record<ProviderId, ProviderCredentialRef>>,
  source: "runtime" | "secretStore",
): Partial<Record<ProviderId, ProviderCredentialRef>> {
  const nextRefs: Partial<Record<ProviderId, ProviderCredentialRef>> = { ...refs };
  for (const config of Object.values(snapshot.providerConfigs || {})) {
    if (!config?.providerId || nextRefs[config.providerId]) continue;
    const ref = mockCredentialRefFromStoredConfig(config, snapshot.metadata.workspaceId, source);
    if (ref) nextRefs[config.providerId] = ref;
  }
  return nextRefs;
}

function mockResolverForStoredConfig(config: StoredProviderConfig | null | undefined): CredentialResolver | undefined {
  if (!config) return undefined;
  const manifest = getProviderManifest(config.providerId);
  if (!manifest.apiKeyRequired) return undefined;
  return createMemoryCredentialResolver([
    {
      providerId: config.providerId,
      apiKey: `mock-${config.providerId}-queue-runtime-key`,
      expiresAt: null,
    },
  ]);
}

function mockResolverForStoredConfigs(configs: WorkspaceSnapshot["providerConfigs"]): CredentialResolver | undefined {
  const credentials = Object.values(configs || {})
    .filter((config): config is StoredProviderConfig => Boolean(config && getProviderManifest(config.providerId).apiKeyRequired))
    .map((config) => ({
      providerId: config.providerId,
      apiKey: `mock-${config.providerId}-queue-runtime-key`,
      expiresAt: null,
    }));
  return credentials.length ? createMemoryCredentialResolver(credentials) : undefined;
}

export function createWorkspaceQueueWorker(options: WorkspaceQueueWorkerOptions) {
  const { repository } = options;
  const now = options.now || (() => new Date().toISOString());

  return {
    async run(input: WorkspaceQueueWorkerInput): Promise<WorkspaceQueueWorkerResult> {
      const parsed = WorkspaceQueueWorkerInputSchema.parse(input);
      const snapshot = await loadWorkspace(repository, parsed.workspaceId);
      const initialPlan = findQueuePlan(snapshot, parsed.jobId);
      const storedConfig = providerConfigFor(snapshot, initialPlan.job.providerId);
      const storedCredentialSource = options.storedCredentialSource || (options.credentialResolver ? "secretStore" : "runtime");
      const useMockCredentials = options.useMockCredentials !== false;
      const baseCredentialRefs = credentialRefsFromSnapshot(snapshot, options.credentialRefs, storedCredentialSource);
      const credentialRefs = useMockCredentials
        ? addMockCredentialRefs(snapshot, baseCredentialRefs, storedCredentialSource)
        : baseCredentialRefs;
      const credentialRef = credentialRefs[initialPlan.job.providerId]
        || credentialRefFromStoredConfig(storedConfig, snapshot.metadata.workspaceId, storedCredentialSource);
      const credentialResolver = options.credentialResolver
        || (!useMockCredentials
          ? undefined
          : mockResolverForStoredConfigs(snapshot.providerConfigs) || mockResolverForStoredConfig(storedConfig));
      const runResult = await runMockQueuePlan(initialPlan, {
        snapshot,
        storedConfig,
        ...(credentialRef ? { credentialRef } : {}),
        credentialRefs,
        ...(credentialResolver ? { credentialResolver } : {}),
        ...(options.providerRegistry ? { registry: options.providerRegistry } : {}),
      });
      const createdAt = now();
      const baseSnapshot = runResult.workspace || snapshot;

      const resultBatches = await Promise.all(runResult.plan.tasks
        .filter((task) => task.status === "succeeded" && taskCreatesResult(task))
        .map((task) =>
          Promise.all(task.output.providerResultIds.map((providerResultId, index) =>
            resultFromTaskWithProject({
              task,
              providerResultId,
              index,
              projectId: baseSnapshot.project.id,
              workspaceId: baseSnapshot.metadata.workspaceId,
              createdAt,
              snapshot: baseSnapshot,
              ...(options.resultFileStore ? { fileStore: options.resultFileStore } : {}),
            }),
          )),
        ));
      const newResults = resultBatches.flat();

      const newArchiveRows = parsed.archiveResults ? newResults.map((result) => archiveRowFromResult(result, createdAt)) : [];
      const safeRunPlan = sanitizeQueuePlanProviderAssets(runResult.plan);
      const nextSnapshot = WorkspaceSnapshotSchema.parse({
        ...baseSnapshot,
        queuePlans: mergeQueuePlans(baseSnapshot.queuePlans, safeRunPlan),
        queueSummaries: mergeQueueSummaries(baseSnapshot.queueSummaries, summarizeQueue(safeRunPlan)),
        results: mergeResults(baseSnapshot.results, newResults),
        archiveRows: mergeArchiveRows(baseSnapshot.archiveRows, newArchiveRows),
        metadata: {
          ...baseSnapshot.metadata,
          revision: baseSnapshot.metadata.revision + 1,
          updatedAt: createdAt,
        },
      });

      await repository.saveSnapshot(nextSnapshot);

      return WorkspaceQueueWorkerResultSchema.parse({
        workspace: nextSnapshot,
        summary: summarizeQueue(runResult.plan),
        resultCount: newResults.length,
        archiveRowCount: newArchiveRows.length,
      });
    },
  };
}

export function summarizeWorkerWorkspace(snapshot: WorkspaceSnapshot): WorkspaceSnapshotSummary {
  return summarizeWorkspaceSnapshot(WorkspaceSnapshotSchema.parse(snapshot));
}
