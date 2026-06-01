import {
  DatabaseArchiveRowSchema,
  DatabaseAssetRowSchema,
  DatabaseProviderConfigRowSchema,
  DatabaseResultRowSchema,
  DatabaseWorkspaceRowSchema,
} from "./database-schema";
import {
  DatabaseStatementNameSchema,
  type DatabaseClient,
  type DatabaseExecutor,
  type DatabaseStatement,
} from "./database-repository";

type MemoryDatabaseState = {
  workspaces: Map<string, unknown>;
  assets: Map<string, unknown[]>;
  results: Map<string, unknown[]>;
  providerConfigs: Map<string, unknown[]>;
  archiveRows: Map<string, unknown[]>;
};

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneMap(map: Map<string, unknown[]>): Map<string, unknown[]> {
  return new Map([...map.entries()].map(([key, value]) => [key, cloneValue(value)]));
}

function cloneState(state: MemoryDatabaseState): MemoryDatabaseState {
  return {
    workspaces: new Map([...state.workspaces.entries()].map(([key, value]) => [key, cloneValue(value)])),
    assets: cloneMap(state.assets),
    results: cloneMap(state.results),
    providerConfigs: cloneMap(state.providerConfigs),
    archiveRows: cloneMap(state.archiveRows),
  };
}

function replaceState(target: MemoryDatabaseState, source: MemoryDatabaseState): void {
  target.workspaces = source.workspaces;
  target.assets = source.assets;
  target.results = source.results;
  target.providerConfigs = source.providerConfigs;
  target.archiveRows = source.archiveRows;
}

function rowParam<T>(statement: DatabaseStatement, schema: { parse(value: unknown): T }): T {
  return schema.parse(statement.params.row);
}

function workspaceIdParam(statement: DatabaseStatement): string {
  const workspaceId = statement.params.workspaceId;
  if (typeof workspaceId !== "string" || !workspaceId) {
    throw new Error(`${statement.name} requires a workspaceId parameter.`);
  }
  return workspaceId;
}

function projectIdParam(statement: DatabaseStatement): string | null {
  const projectId = statement.params.projectId;
  if (projectId === null || projectId === undefined) return null;
  if (typeof projectId !== "string" || !projectId) {
    throw new Error(`${statement.name} requires a string projectId parameter.`);
  }
  return projectId;
}

function createExecutor(state: MemoryDatabaseState): DatabaseExecutor {
  return {
    async execute(statement: DatabaseStatement): Promise<void> {
      const name = DatabaseStatementNameSchema.parse(statement.name);

      switch (name) {
        case "upsertWorkspace": {
          const row = rowParam(statement, DatabaseWorkspaceRowSchema);
          state.workspaces.set(row.workspaceId, cloneValue(row));
          return;
        }
        case "deleteAssets": {
          state.assets.set(workspaceIdParam(statement), []);
          return;
        }
        case "insertAsset": {
          const row = rowParam(statement, DatabaseAssetRowSchema);
          state.assets.set(row.workspaceId, [...(state.assets.get(row.workspaceId) || []), cloneValue(row)]);
          return;
        }
        case "deleteResults": {
          state.results.set(workspaceIdParam(statement), []);
          return;
        }
        case "insertResult": {
          const row = rowParam(statement, DatabaseResultRowSchema);
          state.results.set(row.workspaceId, [...(state.results.get(row.workspaceId) || []), cloneValue(row)]);
          return;
        }
        case "deleteProviderConfigs": {
          state.providerConfigs.set(workspaceIdParam(statement), []);
          return;
        }
        case "insertProviderConfig": {
          const row = rowParam(statement, DatabaseProviderConfigRowSchema);
          state.providerConfigs.set(row.workspaceId, [...(state.providerConfigs.get(row.workspaceId) || []), cloneValue(row)]);
          return;
        }
        case "deleteArchiveRows": {
          state.archiveRows.set(workspaceIdParam(statement), []);
          return;
        }
        case "insertArchiveRow": {
          const row = rowParam(statement, DatabaseArchiveRowSchema);
          state.archiveRows.set(row.workspaceId, [...(state.archiveRows.get(row.workspaceId) || []), cloneValue(row)]);
          return;
        }
        default:
          throw new Error(`${name} is not an execute statement.`);
      }
    },

    async queryOne(statement: DatabaseStatement): Promise<unknown | null> {
      const name = DatabaseStatementNameSchema.parse(statement.name);
      if (name !== "loadWorkspace") throw new Error(`${name} is not a queryOne statement.`);
      const row = state.workspaces.get(workspaceIdParam(statement));
      return row ? cloneValue(row) : null;
    },

    async queryMany(statement: DatabaseStatement): Promise<unknown[]> {
      const name = DatabaseStatementNameSchema.parse(statement.name);
      if (name !== "listWorkspaces") throw new Error(`${name} is not a queryMany statement.`);
      const projectId = projectIdParam(statement);
      return [...state.workspaces.values()]
        .filter((row) => {
          const parsed = DatabaseWorkspaceRowSchema.parse(row);
          return !projectId || parsed.projectId === projectId;
        })
        .map((row) => cloneValue(row));
    },
  };
}

export function createMemoryDatabaseClient(): DatabaseClient {
  const state: MemoryDatabaseState = {
    workspaces: new Map(),
    assets: new Map(),
    results: new Map(),
    providerConfigs: new Map(),
    archiveRows: new Map(),
  };

  const executor = createExecutor(state);

  return {
    ...executor,

    async transaction<T>(fn: (tx: DatabaseExecutor) => Promise<T>): Promise<T> {
      const before = cloneState(state);
      try {
        return await fn(executor);
      } catch (error) {
        replaceState(state, before);
        throw error;
      }
    },
  };
}
