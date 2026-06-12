import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  WorkspaceSnapshotSchema,
  type StorageLoadResult,
  type StorageRepository,
  type StorageSaveResult,
  type WorkspaceSnapshot,
  type WorkspaceSnapshotSummary,
  summarizeWorkspaceSnapshot,
} from "./contracts";

type JsonFileWorkspaceStore = {
  version: "workspace-store.v1";
  snapshots: WorkspaceSnapshot[];
};

export type JsonFileWorkspaceRepositoryOptions = {
  filePath: string;
  seedSnapshots?: WorkspaceSnapshot[];
};

function cloneSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return WorkspaceSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
}

export function createJsonFileWorkspaceRepository(
  options: JsonFileWorkspaceRepositoryOptions,
): StorageRepository {
  const filePath = path.resolve(options.filePath);
  const seedSnapshots = (options.seedSnapshots || []).map(cloneSnapshot);
  const snapshots = new Map<string, WorkspaceSnapshot>();
  let loaded = false;

  async function persist(): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const store: JsonFileWorkspaceStore = {
      version: "workspace-store.v1",
      snapshots: [...snapshots.values()].map(cloneSnapshot),
    };
    await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
  }

  async function load(): Promise<void> {
    if (loaded) return;
    loaded = true;

    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<JsonFileWorkspaceStore>;
      for (const snapshot of parsed.snapshots || []) {
        const safeSnapshot = WorkspaceSnapshotSchema.parse(snapshot);
        snapshots.set(safeSnapshot.metadata.workspaceId, cloneSnapshot(safeSnapshot));
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }

    if (snapshots.size === 0) {
      for (const snapshot of seedSnapshots) {
        snapshots.set(snapshot.metadata.workspaceId, cloneSnapshot(snapshot));
      }
      if (snapshots.size > 0) await persist();
    }
  }

  return {
    backend: "database",

    async saveSnapshot(snapshot: WorkspaceSnapshot): Promise<StorageSaveResult> {
      await load();
      const parsed = WorkspaceSnapshotSchema.parse(snapshot);
      snapshots.set(parsed.metadata.workspaceId, cloneSnapshot(parsed));
      await persist();
      return {
        ok: true,
        snapshot: summarizeWorkspaceSnapshot(parsed),
      };
    },

    async loadSnapshot(workspaceId: string): Promise<StorageLoadResult> {
      await load();
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
      await load();
      return [...snapshots.values()]
        .filter((snapshot) => !projectId || snapshot.project.id === projectId)
        .map((snapshot) => summarizeWorkspaceSnapshot(snapshot))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async deleteSnapshot(workspaceId: string): Promise<boolean> {
      await load();
      const deleted = snapshots.delete(workspaceId);
      if (deleted) await persist();
      return deleted;
    },
  };
}
