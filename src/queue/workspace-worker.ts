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
import { evaluateLiveExecutionGate, LiveExecutionSafetyInputSchema } from "./live-execution-gate";
import { getProviderManifest } from "../providers/manifests";
import type { ProviderAdapterRegistry } from "../providers/executor";
import type { LocalResultFileStore, ResultStoredFileMetadata } from "../results/file-store";
import type { ProviderId } from "../schema/zod";
import { providerCredentialKeyRef } from "../api/provider-credential-refs";
import { isPosterIntegratedReferenceAsset, posterAssetSemanticRole } from "../assets/semantic-roles";
import {
  applyPosterAssetOverlays,
  prepareImageForTargetSize,
  repairIconCanvasEdges,
  type ImageOutputProcessing,
  type PosterAssetOverlayInputAsset,
} from "../results/image-post-processing";
import { auditResultQuality } from "../results/quality-audit";
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
  liveExecution: LiveExecutionSafetyInputSchema.extend({
    enabled: z.boolean().default(false),
  }).optional(),
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
  resultFileStore?: Pick<LocalResultFileStore, "storeDataUrl"> & Partial<Pick<LocalResultFileStore, "readStoredFile">>;
  useMockCredentials?: boolean;
  requireLiveExecutionGate?: boolean;
  isCancellationRequested?: (jobId: string) => boolean;
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

function resultIdPart(value: string | null | undefined, fallback = "run"): string {
  const text = String(value || "").trim();
  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) return parsed.toString(36);
  return text
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    || fallback;
}

function resultIdForTask(task: QueueTask, index: number, createdAt: string, providerResultId: string): string {
  const runPart = resultIdPart(createdAt);
  const providerPart = resultIdPart(providerResultId, "").slice(0, 18);
  return ["result", task.id, String(index + 1), runPart, providerPart].filter(Boolean).join("-");
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

function projectAssetRoles(snapshot: WorkspaceSnapshot | undefined, projectId: string): string[] {
  if (!snapshot) return [];
  return snapshot.assets
    .filter((asset) => asset.projectId === projectId)
    .map((asset) => asset.role);
}

function resultQualityTextTargets(snapshot: WorkspaceSnapshot | undefined, task: QueueTask): string[] {
  if (!snapshot) return [];
  const modeState = snapshot.modeStates.find((item) => item.mode === task.mode);
  if (task.mode === "poster") {
    const slogan = posterSloganForScheme(snapshot, task.input.schemeId);
    return slogan ? [slogan] : [];
  }
  if (task.mode === "logo" && modeState?.modeForm.mode === "logo") {
    return [modeState.modeForm.wordmark].filter((item) => item.trim().length > 0);
  }
  if (task.mode === "announcement" && modeState?.modeForm.mode === "announcement") {
    return [modeState.modeForm.announcementTitle].filter((item) => item.trim().length > 0);
  }
  if (task.mode === "collab" && modeState?.modeForm.mode === "collab") {
    return [modeState.modeForm.collabBrandName].filter((item) => item.trim().length > 0);
  }
  return [];
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
  const language = snapshot.modeStates.find((item) => item.mode === scheme?.mode)?.sloganSettings.languages[0];
  return (language ? slogans[language] : null)
    || slogans["en-US"]
    || slogans["zh-CN"]
    || slogans["ja-JP"]
    || slogans["ko-KR"]
    || null;
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
    id: resultIdForTask(task, index, createdAt, providerResultId),
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
      })
    : null;
  const initialDataUrl = overlayed?.dataUrl || prepared.dataUrl;
  const initialQualityAudit = await auditResultQuality({
    mode: input.task.mode,
    dataUrl: initialDataUrl,
    width: prepared.width,
    height: prepared.height,
    targetWidth: input.task.input.width || null,
    targetHeight: input.task.input.height || null,
    assetRoles: projectAssetRoles(input.snapshot, input.projectId),
    overlayApplied: Boolean(overlayed?.processing?.applied.length),
    textTargets: resultQualityTextTargets(input.snapshot, input.task),
  });
  const iconRepairFinding = input.task.mode === "icon"
    ? initialQualityAudit.findings.find((finding) =>
        finding.code === "icon-rounded-mask-risk" || finding.code === "icon-edge-text-mark-risk")
    : null;
  const iconRepair = iconRepairFinding
    ? await repairIconCanvasEdges({
        dataUrl: initialDataUrl,
        width: prepared.width,
        height: prepared.height,
        reason: iconRepairFinding.code === "icon-edge-text-mark-risk" ? "edgeTextMarkRisk" : "roundedMaskRisk",
      })
    : null;
  const finalDataUrl = iconRepair?.dataUrl || initialDataUrl;
  const qualityAudit = iconRepair?.processing
    ? await auditResultQuality({
        mode: input.task.mode,
        dataUrl: finalDataUrl,
        width: iconRepair.width,
        height: iconRepair.height,
        targetWidth: input.task.input.width || null,
        targetHeight: input.task.input.height || null,
        assetRoles: projectAssetRoles(input.snapshot, input.projectId),
        overlayApplied: Boolean(overlayed?.processing?.applied.length),
        textTargets: resultQualityTextTargets(input.snapshot, input.task),
      })
    : initialQualityAudit;
  const resultFile = await storeResultFile({
    ...(input.fileStore ? { fileStore: input.fileStore } : {}),
    workspaceId: input.workspaceId,
    task: input.task,
    providerAsset,
    resultId: resultIdForTask(input.task, input.index, input.createdAt, input.providerResultId),
    index: input.index,
    width: prepared.width,
    height: prepared.height,
    dataUrl: finalDataUrl,
  });
  const result = resultFromTask(
    input.task,
    input.providerResultId,
    input.index,
    input.createdAt,
    resultFile,
    prepared.processing,
    { width: prepared.width, height: prepared.height },
    {
      ...(overlayed?.processing ? { assetOverlayProcessing: overlayed.processing } : {}),
      ...(iconRepair?.processing ? { iconPostProcessing: iconRepair.processing } : {}),
      qualityAudit,
    },
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

function schemeIdsForPlan(plan: QueuePlan): Set<string> {
  const ids = new Set<string>();
  for (const task of plan.tasks) {
    if (typeof task.input.schemeId === "string" && task.input.schemeId) ids.add(task.input.schemeId);
    if (Array.isArray(task.input.schemeIds)) {
      task.input.schemeIds.forEach((schemeId) => {
        if (typeof schemeId === "string" && schemeId) ids.add(schemeId);
      });
    }
  }
  return ids;
}

function mergeTouchedSchemes(existing: WorkspaceSnapshot["schemes"], incoming: WorkspaceSnapshot["schemes"], touchedIds: Set<string>): WorkspaceSnapshot["schemes"] {
  if (touchedIds.size === 0) return existing;
  const merged = new Map(existing.map((scheme) => [scheme.id, scheme]));
  for (const scheme of incoming) {
    if (touchedIds.has(scheme.id)) merged.set(scheme.id, scheme);
  }
  return [...merged.values()];
}

function mergeTouchedModeState(existing: WorkspaceSnapshot["modeStates"], incoming: WorkspaceSnapshot["modeStates"], mode: QueuePlan["job"]["mode"]): WorkspaceSnapshot["modeStates"] {
  const incomingState = incoming.find((item) => item.mode === mode);
  if (!incomingState) return existing;
  return existing.map((item) => (item.mode === mode ? {
    ...item,
    selectedSchemeIds: incomingState.selectedSchemeIds,
    updatedAt: incomingState.updatedAt || item.updatedAt,
  } : item));
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
    keyRef: source === "secretStore"
      ? providerCredentialKeyRef({ workspaceId, providerId: config.providerId, keyRef: config.credentialKeyRef })
      : config.providerId,
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
    keyRef: source === "secretStore"
      ? providerCredentialKeyRef({ workspaceId, providerId: config.providerId, keyRef: config.credentialKeyRef })
      : config.providerId,
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
      if (options.requireLiveExecutionGate) {
        const liveExecution = parsed.liveExecution || {
          enabled: false,
          estimatedCost: summarizeQueue(initialPlan).estimatedCost || 0,
          maxAcceptedCost: 0,
          confirmations: {
            liveRun: false,
            providerCost: false,
            externalProvider: false,
            resultStorage: false,
          },
        };
        const gate = evaluateLiveExecutionGate({
          providerId: initialPlan.job.providerId,
          enabled: liveExecution.enabled,
          estimatedCost: liveExecution.estimatedCost,
          maxAcceptedCost: liveExecution.maxAcceptedCost,
          confirmations: liveExecution.confirmations,
          credentialReady: Boolean(credentialRef && credentialResolver),
          transportReady: Boolean(options.providerRegistry),
          resultStorageReady: Boolean(options.resultFileStore),
        });
        if (!gate.allowed) {
          const blockerCodes = gate.blockers.map((blocker) => blocker.code).join(", ");
          throw new Error(`Live provider execution blocked by safety gate: ${blockerCodes || gate.message}`);
        }
      }
      const runResult = await runMockQueuePlan(initialPlan, {
        snapshot,
        storedConfig,
        ...(credentialRef ? { credentialRef } : {}),
        credentialRefs,
        ...(credentialResolver ? { credentialResolver } : {}),
        ...(options.providerRegistry ? { registry: options.providerRegistry } : {}),
        ...(options.resultFileStore ? { resultFileStore: options.resultFileStore } : {}),
        ...(options.isCancellationRequested ? { isCancellationRequested: options.isCancellationRequested } : {}),
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
      const latestLoaded = await repository.loadSnapshot(parsed.workspaceId);
      const latestSnapshot = latestLoaded.ok ? latestLoaded.snapshot : baseSnapshot;
      const touchedSchemeIds = schemeIdsForPlan(safeRunPlan);
      const nextSnapshot = WorkspaceSnapshotSchema.parse({
        ...latestSnapshot,
        activeMode: baseSnapshot.activeMode,
        schemes: mergeTouchedSchemes(latestSnapshot.schemes, baseSnapshot.schemes, touchedSchemeIds),
        modeStates: mergeTouchedModeState(latestSnapshot.modeStates, baseSnapshot.modeStates, safeRunPlan.job.mode),
        queuePlans: mergeQueuePlans(latestSnapshot.queuePlans, safeRunPlan),
        queueSummaries: mergeQueueSummaries(latestSnapshot.queueSummaries, summarizeQueue(safeRunPlan)),
        results: mergeResults(latestSnapshot.results, newResults),
        archiveRows: mergeArchiveRows(latestSnapshot.archiveRows, newArchiveRows),
        metadata: {
          ...latestSnapshot.metadata,
          revision: latestSnapshot.metadata.revision + 1,
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
