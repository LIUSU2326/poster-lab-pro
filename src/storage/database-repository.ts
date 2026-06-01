import { z } from "zod";
import {
  WorkspaceSnapshotSchema,
  type StorageLoadResult,
  type StorageRepository,
  type StorageSaveResult,
  type WorkspaceSnapshot,
  type WorkspaceSnapshotSummary,
  summarizeWorkspaceSnapshot,
} from "./contracts";
import {
  type DatabaseArchiveRow,
  type DatabaseAssetRow,
  type DatabaseProviderConfigRow,
  type DatabaseResultRow,
  type DatabaseWorkspaceRow,
  workspaceSnapshotFromDatabaseRow,
  workspaceSnapshotToDatabaseRows,
} from "./database-schema";

export const DatabaseStatementNameSchema = z.enum([
  "upsertWorkspace",
  "deleteAssets",
  "insertAsset",
  "deleteResults",
  "insertResult",
  "deleteProviderConfigs",
  "insertProviderConfig",
  "deleteArchiveRows",
  "insertArchiveRow",
  "loadWorkspace",
  "listWorkspaces",
]);

export type DatabaseStatementName = z.infer<typeof DatabaseStatementNameSchema>;

export type DatabaseStatement<TParams extends Record<string, unknown> = Record<string, unknown>> = {
  name: DatabaseStatementName;
  sql: string;
  params: TParams;
};

export type DatabaseExecutor = {
  execute(statement: DatabaseStatement): Promise<void>;
  queryOne(statement: DatabaseStatement): Promise<unknown | null>;
  queryMany(statement: DatabaseStatement): Promise<unknown[]>;
};

export type DatabaseClient = DatabaseExecutor & {
  transaction<T>(fn: (tx: DatabaseExecutor) => Promise<T>): Promise<T>;
};

function statement<TParams extends Record<string, unknown>>(
  name: DatabaseStatementName,
  sql: string,
  params: TParams,
): DatabaseStatement<TParams> {
  return { name, sql, params };
}

function upsertWorkspace(row: DatabaseWorkspaceRow) {
  return statement("upsertWorkspace", "insert into workspaces (...) values (...) on conflict(workspace_id) do update set snapshot_json = excluded.snapshot_json", {
    row,
  });
}

function deleteAssets(workspaceId: string) {
  return statement("deleteAssets", "delete from workspace_assets where workspace_id = :workspaceId", { workspaceId });
}

function insertAsset(row: DatabaseAssetRow) {
  return statement("insertAsset", "insert into workspace_assets (...) values (...)", { row });
}

function deleteResults(workspaceId: string) {
  return statement("deleteResults", "delete from workspace_results where workspace_id = :workspaceId", { workspaceId });
}

function insertResult(row: DatabaseResultRow) {
  return statement("insertResult", "insert into workspace_results (...) values (...)", { row });
}

function deleteProviderConfigs(workspaceId: string) {
  return statement("deleteProviderConfigs", "delete from provider_configs where workspace_id = :workspaceId", { workspaceId });
}

function insertProviderConfig(row: DatabaseProviderConfigRow) {
  return statement("insertProviderConfig", "insert into provider_configs (...) values (...)", { row });
}

function deleteArchiveRows(workspaceId: string) {
  return statement("deleteArchiveRows", "delete from archive_rows where workspace_id = :workspaceId", { workspaceId });
}

function insertArchiveRow(row: DatabaseArchiveRow) {
  return statement("insertArchiveRow", "insert into archive_rows (...) values (...)", { row });
}

function loadWorkspace(workspaceId: string) {
  return statement("loadWorkspace", "select * from workspaces where workspace_id = :workspaceId", { workspaceId });
}

function listWorkspaces(projectId?: string) {
  return statement("listWorkspaces", "select * from workspaces where (:projectId is null or project_id = :projectId)", {
    projectId: projectId ?? null,
  });
}

function parseLoadedSnapshot(row: unknown): StorageLoadResult {
  try {
    return {
      ok: true,
      snapshot: workspaceSnapshotFromDatabaseRow(row),
    };
  } catch (error) {
    return {
      ok: false,
      code: "invalid_snapshot",
      message: `Workspace snapshot row could not be parsed: ${(error as Error).message}`,
    };
  }
}

export function createDatabaseWorkspaceRepository(client: DatabaseClient): StorageRepository {
  return {
    backend: "database",

    async saveSnapshot(snapshot: WorkspaceSnapshot): Promise<StorageSaveResult> {
      const parsed = WorkspaceSnapshotSchema.parse(snapshot);
      const rows = workspaceSnapshotToDatabaseRows(parsed);
      const workspaceId = rows.workspace.workspaceId;

      await client.transaction(async (tx) => {
        await tx.execute(upsertWorkspace(rows.workspace));

        await tx.execute(deleteAssets(workspaceId));
        for (const row of rows.assets) await tx.execute(insertAsset(row));

        await tx.execute(deleteResults(workspaceId));
        for (const row of rows.results) await tx.execute(insertResult(row));

        await tx.execute(deleteProviderConfigs(workspaceId));
        for (const row of rows.providerConfigs) await tx.execute(insertProviderConfig(row));

        await tx.execute(deleteArchiveRows(workspaceId));
        for (const row of rows.archiveRows) await tx.execute(insertArchiveRow(row));
      });

      const storedSnapshot = workspaceSnapshotFromDatabaseRow(rows.workspace);
      return {
        ok: true,
        snapshot: summarizeWorkspaceSnapshot(storedSnapshot),
      };
    },

    async loadSnapshot(workspaceId: string): Promise<StorageLoadResult> {
      const row = await client.queryOne(loadWorkspace(workspaceId));
      if (!row) {
        return {
          ok: false,
          code: "not_found",
          message: `Workspace snapshot ${workspaceId} was not found.`,
        };
      }

      return parseLoadedSnapshot(row);
    },

    async listSnapshots(projectId?: string): Promise<WorkspaceSnapshotSummary[]> {
      const rows = await client.queryMany(listWorkspaces(projectId));
      const summaries: WorkspaceSnapshotSummary[] = [];

      for (const row of rows) {
        const loaded = parseLoadedSnapshot(row);
        if (loaded.ok) summaries.push(summarizeWorkspaceSnapshot(loaded.snapshot));
      }

      return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
  };
}
