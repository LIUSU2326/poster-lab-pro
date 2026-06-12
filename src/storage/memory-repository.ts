import {
  WorkspaceSnapshotSchema,
  type StorageLoadResult,
  type StorageRepository,
  type StorageSaveResult,
  type WorkspaceSnapshot,
  type WorkspaceSnapshotSummary,
  summarizeWorkspaceSnapshot,
} from "./contracts";

function cloneSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return WorkspaceSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
}

export function createMemoryDraftRepository(seedSnapshots: WorkspaceSnapshot[] = []): StorageRepository {
  const snapshots = new Map<string, WorkspaceSnapshot>();

  for (const snapshot of seedSnapshots) {
    const parsed = WorkspaceSnapshotSchema.parse(snapshot);
    snapshots.set(parsed.metadata.workspaceId, cloneSnapshot(parsed));
  }

  return {
    backend: "memory",

    async saveSnapshot(snapshot: WorkspaceSnapshot): Promise<StorageSaveResult> {
      const parsed = WorkspaceSnapshotSchema.parse(snapshot);
      snapshots.set(parsed.metadata.workspaceId, cloneSnapshot(parsed));
      return {
        ok: true,
        snapshot: summarizeWorkspaceSnapshot(parsed),
      };
    },

    async loadSnapshot(workspaceId: string): Promise<StorageLoadResult> {
      const snapshot = snapshots.get(workspaceId);
      if (!snapshot) {
        return {
          ok: false,
          code: "not_found",
          message: `Workspace snapshot ${workspaceId} was not found.`,
        };
      }

      return {
        ok: true,
        snapshot: cloneSnapshot(snapshot),
      };
    },

    async listSnapshots(projectId?: string): Promise<WorkspaceSnapshotSummary[]> {
      return [...snapshots.values()]
        .filter((snapshot) => !projectId || snapshot.project.id === projectId)
        .map((snapshot) => summarizeWorkspaceSnapshot(snapshot))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async deleteSnapshot(workspaceId: string): Promise<boolean> {
      return snapshots.delete(workspaceId);
    },
  };
}
