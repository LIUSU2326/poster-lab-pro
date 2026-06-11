import {
  WorkspaceSnapshotSchema,
  type StorageRepository,
  type StoredAssetRecord,
  type WorkspaceSnapshot,
} from "../storage/contracts";
import {
  AssetCommitRequestSchema,
  AssetCommitResultSchema,
  AssetListRequestSchema,
  AssetListResultSchema,
  AssetUploadMimeTypeSchema,
  AssetUploadPlanRequestSchema,
  AssetUploadPlanResultSchema,
  maxUploadBytes,
  type AssetCommitRequest,
  type AssetCommitResult,
  type AssetListRequest,
  type AssetListResult,
  type AssetUploadPlanRequest,
  type AssetUploadPlanResult,
} from "./contracts";

export type AssetLibraryServiceOptions = {
  repository: StorageRepository;
  now?: () => string;
};

export type AssetLibraryService = {
  createUploadPlan(request: AssetUploadPlanRequest): Promise<AssetUploadPlanResult>;
  commitAsset(request: AssetCommitRequest): Promise<AssetCommitResult>;
  listAssets(request: AssetListRequest): Promise<AssetListResult>;
};

function cloneSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return WorkspaceSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
}

function safeSlug(value: string): string {
  const withoutExtension = value.replace(/\.[^.]+$/, "");
  const slug = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "asset";
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function createAssetId(input: AssetUploadPlanRequest): string {
  if (input.clientAssetId) return input.clientAssetId;
  return `asset-${input.role}-${safeSlug(input.fileName)}`;
}

function createStorageKey(input: AssetUploadPlanRequest, assetId: string): string {
  const extension = extensionForMimeType(input.mimeType);
  return `projects/${input.projectId}/assets/${input.role}/${assetId}.${extension}`;
}

async function loadWorkspace(repository: StorageRepository, workspaceId: string): Promise<WorkspaceSnapshot> {
  const loaded = await repository.loadSnapshot(workspaceId);
  if (!loaded.ok) throw new Error(loaded.message);
  return cloneSnapshot(loaded.snapshot);
}

function assetUploadFingerprint(asset: StoredAssetRecord): string {
  const fileName = typeof asset.metadata?.originalFileName === "string" ? asset.metadata.originalFileName : "";
  const checksum = asset.checksum || "";
  const byteSize = asset.byteSize ?? "";
  if (!checksum && !fileName && byteSize === "") return "";
  return [
    asset.role,
    asset.label,
    checksum || fileName,
    asset.mimeType || "",
    byteSize,
  ].join("|");
}

function isSameUploadedAsset(left: StoredAssetRecord, right: StoredAssetRecord): boolean {
  if (left.id === right.id) return true;
  const leftKey = assetUploadFingerprint(left);
  return Boolean(leftKey && leftKey === assetUploadFingerprint(right));
}

function mergeUploadedAsset(existing: StoredAssetRecord, incoming: StoredAssetRecord, updatedAt: string): StoredAssetRecord {
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt || incoming.createdAt,
    updatedAt,
    metadata: {
      ...(existing.metadata || {}),
      ...(incoming.metadata || {}),
    },
  };
}

function upsertAsset(
  snapshot: WorkspaceSnapshot,
  asset: StoredAssetRecord,
  replaceExisting: boolean,
  updatedAt: string,
): { snapshot: WorkspaceSnapshot; asset: StoredAssetRecord } {
  const existingIndex = snapshot.assets.findIndex((item) => item.id === asset.id);
  if (existingIndex >= 0 && !replaceExisting) {
    const existingAsset = snapshot.assets[existingIndex];
    if (!existingAsset) throw new Error(`Asset ${asset.id} already exists but could not be loaded.`);
    const committedAsset = mergeUploadedAsset(existingAsset, asset, updatedAt);
    return {
      asset: committedAsset,
      snapshot: WorkspaceSnapshotSchema.parse({
        ...snapshot,
        assets: snapshot.assets
          .filter((item) => !isSameUploadedAsset(item, committedAsset))
          .concat(committedAsset),
        metadata: {
          ...snapshot.metadata,
          revision: snapshot.metadata.revision + 1,
          updatedAt,
        },
      }),
    };
  }

  if (!replaceExisting) {
    const existingDuplicate = snapshot.assets.find((item) => isSameUploadedAsset(item, asset));
    if (existingDuplicate) {
      const committedAsset = mergeUploadedAsset(existingDuplicate, asset, updatedAt);
      return {
        asset: committedAsset,
        snapshot: WorkspaceSnapshotSchema.parse({
          ...snapshot,
          assets: snapshot.assets
            .filter((item) => !isSameUploadedAsset(item, committedAsset))
            .concat(committedAsset),
          metadata: {
            ...snapshot.metadata,
            revision: snapshot.metadata.revision + 1,
            updatedAt,
          },
        }),
      };
    }
  }

  const committedAsset = {
    ...asset,
    updatedAt,
  };
  const nextAssets = replaceExisting
    ? snapshot.assets.filter((item) => item.id !== committedAsset.id && !(item.role === committedAsset.role && item.label === committedAsset.label))
    : [...snapshot.assets];
  nextAssets.push(committedAsset);

  return {
    asset: committedAsset,
    snapshot: WorkspaceSnapshotSchema.parse({
      ...snapshot,
      assets: nextAssets,
      metadata: {
        ...snapshot.metadata,
        revision: snapshot.metadata.revision + 1,
        updatedAt,
      },
    }),
  };
}

function applyProjectDraft(
  snapshot: WorkspaceSnapshot,
  draft: AssetCommitRequest["projectDraft"],
  updatedAt: string,
): WorkspaceSnapshot {
  if (!draft) return snapshot;

  const projectName = draft.projectName ?? snapshot.project.name;
  const gameDescription = draft.gameDescription ?? snapshot.project.description;
  const modeStates = snapshot.modeStates.map((modeState) => {
    if (modeState.mode !== draft.mode) return modeState;
    return {
      ...modeState,
      projectBrief: {
        ...modeState.projectBrief,
        projectName,
        gameDescription,
        focusGuidanceEnabled: draft.focusGuidanceEnabled ?? modeState.projectBrief.focusGuidanceEnabled,
        focusGuidance: draft.focusGuidance ?? modeState.projectBrief.focusGuidance,
      },
      updatedAt,
    };
  });

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      name: projectName,
      description: gameDescription,
    },
    modeStates,
  };
}

export function createAssetLibraryService(options: AssetLibraryServiceOptions): AssetLibraryService {
  const { repository } = options;
  const now = options.now || (() => new Date().toISOString());

  return {
    async createUploadPlan(request) {
      const parsed = AssetUploadPlanRequestSchema.parse(request);
      const createdAt = now();
      const expiresAt = new Date(Date.parse(createdAt) + 10 * 60 * 1000).toISOString();
      const assetId = createAssetId(parsed);
      const uploadId = `upload-${assetId}`;
      const storageKey = createStorageKey(parsed, assetId);

      const assetDraft = {
        id: assetId,
        projectId: parsed.projectId,
        role: parsed.role,
        label: parsed.label,
        sourceType: "uploaded",
        metadata: {
          originalFileName: parsed.fileName,
          uploadId,
          plannedAt: createdAt,
        },
        usage: parsed.usage,
        storageKey,
        mimeType: parsed.mimeType,
        byteSize: parsed.byteSize,
        checksum: parsed.checksum ?? null,
        createdAt,
        updatedAt: createdAt,
      };

      return AssetUploadPlanResultSchema.parse({
        uploadPlan: {
          uploadId,
          assetId,
          workspaceId: parsed.workspaceId,
          projectId: parsed.projectId,
          role: parsed.role,
          method: "PUT",
          uploadUrl: `upload://workspaces/${parsed.workspaceId}/${storageKey}`,
          storageKey,
          maxBytes: maxUploadBytes,
          acceptedMimeTypes: AssetUploadMimeTypeSchema.options,
          expiresAt,
        },
        assetDraft,
      });
    },

    async commitAsset(request) {
      const parsed = AssetCommitRequestSchema.parse(request);
      const loadedSnapshot = await loadWorkspace(repository, parsed.workspaceId);
      const updatedAt = now();
      const snapshot = applyProjectDraft(loadedSnapshot, parsed.projectDraft, updatedAt);
      const asset = {
        ...parsed.asset,
        updatedAt,
      };
      const committed = upsertAsset(snapshot, asset, parsed.replaceExisting, updatedAt);
      const nextSnapshot = committed.snapshot;
      const saved = await repository.saveSnapshot(nextSnapshot);

      return AssetCommitResultSchema.parse({
        asset: committed.asset,
        summary: saved.snapshot,
      });
    },

    async listAssets(request) {
      const parsed = AssetListRequestSchema.parse(request);
      const snapshot = await loadWorkspace(repository, parsed.workspaceId);
      const assets = snapshot.assets.filter((asset) => {
        if (parsed.role && asset.role !== parsed.role) return false;
        if (parsed.usage && !asset.usage.includes(parsed.usage)) return false;
        return true;
      });

      return AssetListResultSchema.parse({ assets });
    },
  };
}
