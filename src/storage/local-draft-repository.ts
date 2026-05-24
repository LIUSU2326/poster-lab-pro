import {
  WorkspaceSnapshotSchema,
  type StorageRepository,
  type StorageSaveResult,
  type WorkspaceSnapshot,
  type WorkspaceSnapshotSummary,
  summarizeWorkspaceSnapshot,
} from "./contracts";
import { containsUnredactedSecret } from "./redaction";

const DEFAULT_NAMESPACE = "poster-lab-pro";

export type LocalDraftRepositoryOptions = {
  storage?: Storage;
  namespace?: string;
};

function cloneSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return WorkspaceSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
}

function resolveStorage(options: LocalDraftRepositoryOptions): Storage {
  if (options.storage) return options.storage;
  if (typeof globalThis.localStorage !== "undefined") return globalThis.localStorage;
  throw new Error("Local draft storage is not available in this runtime.");
}

function snapshotKey(namespace: string, workspaceId: string): string {
  return `${namespace}:workspace:${workspaceId}`;
}

function indexKey(namespace: string): string {
  return `${namespace}:workspace-index`;
}

function readIndex(storage: Storage, namespace: string): string[] {
  const raw = storage.getItem(indexKey(namespace));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeIndex(storage: Storage, namespace: string, workspaceIds: string[]): void {
  storage.setItem(indexKey(namespace), JSON.stringify([...new Set(workspaceIds)]));
}

export function createBrowserLocalDraftRepository(
  options: LocalDraftRepositoryOptions = {},
): StorageRepository {
  const namespace = options.namespace || DEFAULT_NAMESPACE;
  const storage = resolveStorage(options);

  return {
    backend: "localDraft",
    async saveSnapshot(snapshot: WorkspaceSnapshot): Promise<StorageSaveResult> {
      const parsed = WorkspaceSnapshotSchema.parse(snapshot);
      if (containsUnredactedSecret(parsed)) {
        throw new Error("Refusing to persist a workspace snapshot with unredacted secrets.");
      }

      const clean = cloneSnapshot(parsed);
      const summary = summarizeWorkspaceSnapshot(clean);
      storage.setItem(snapshotKey(namespace, clean.metadata.workspaceId), JSON.stringify(clean));
      writeIndex(storage, namespace, [clean.metadata.workspaceId, ...readIndex(storage, namespace)]);

      return {
        ok: true,
        snapshot: summary,
      };
    },
    async loadSnapshot(workspaceId: string) {
      const raw = storage.getItem(snapshotKey(namespace, workspaceId));
      if (!raw) {
        return {
          ok: false,
          code: "not_found",
          message: `No local draft snapshot exists for ${workspaceId}.`,
        };
      }

      try {
        return {
          ok: true,
          snapshot: WorkspaceSnapshotSchema.parse(JSON.parse(raw)),
        };
      } catch {
        return {
          ok: false,
          code: "invalid_snapshot",
          message: `Local draft snapshot ${workspaceId} could not be parsed.`,
        };
      }
    },
    async listSnapshots(projectId?: string): Promise<WorkspaceSnapshotSummary[]> {
      const summaries = readIndex(storage, namespace)
        .map((workspaceId) => storage.getItem(snapshotKey(namespace, workspaceId)))
        .filter((raw): raw is string => Boolean(raw))
        .flatMap((raw) => {
          try {
            const snapshot = WorkspaceSnapshotSchema.parse(JSON.parse(raw));
            if (projectId && snapshot.project.id !== projectId) return [];
            return [summarizeWorkspaceSnapshot(snapshot)];
          } catch {
            return [];
          }
        });

      return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
  };
}
