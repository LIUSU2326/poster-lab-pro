import { readFileSync, rmSync, mkdirSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const issues = [];
const root = process.cwd();

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required database persistence file`);
    return "";
  }
}

const schemaSql = read("db/schema.sql");
const databaseSchema = read("src/storage/database-schema.ts");
const databaseRepository = read("src/storage/database-repository.ts");
const memoryDatabaseClient = read("src/storage/memory-database-client.ts");
const barrel = read("src/storage/index.ts");
const pkg = read("package.json");

for (const token of [
  "workspaces",
  "workspace_assets",
  "workspace_results",
  "provider_configs",
  "archive_rows",
  "snapshot_json",
  "api_key_masked",
]) {
  if (!schemaSql.includes(token)) issues.push(`db/schema.sql: missing ${token}`);
}

for (const token of [
  "databaseSchemaVersion",
  "DatabaseWorkspaceRowSchema",
  "DatabaseAssetRowSchema",
  "DatabaseResultRowSchema",
  "DatabaseProviderConfigRowSchema",
  "DatabaseArchiveRowSchema",
  "workspaceSnapshotToDatabaseRows",
  "workspaceSnapshotFromDatabaseRow",
  "containsUnredactedSecret",
]) {
  if (!databaseSchema.includes(token)) issues.push(`database-schema.ts: missing ${token}`);
}

for (const token of [
  "DatabaseClient",
  "DatabaseStatementNameSchema",
  "createDatabaseWorkspaceRepository",
  "saveSnapshot",
  "loadSnapshot",
  "listSnapshots",
  "workspaceSnapshotToDatabaseRows",
]) {
  if (!databaseRepository.includes(token)) issues.push(`database-repository.ts: missing ${token}`);
}

for (const token of ["createMemoryDatabaseClient", "transaction", "upsertWorkspace", "loadWorkspace", "listWorkspaces"]) {
  if (!memoryDatabaseClient.includes(token)) issues.push(`memory-database-client.ts: missing ${token}`);
}

for (const token of ["database-schema", "database-repository", "memory-database-client"]) {
  if (!barrel.includes(token)) issues.push(`index.ts: missing export for ${token}`);
}

if (!pkg.includes("database:check")) issues.push("package.json: missing database:check script");

const databaseSource = [databaseSchema, databaseRepository, memoryDatabaseClient].join("\n");
for (const forbidden of [
  "fetch(",
  "XMLHttpRequest",
  "axios",
  "localStorage",
  "sessionStorage",
  "writeFile",
  "readFile",
  "generateImage(",
  "healthCheck(",
  "api.openai.com",
]) {
  if (databaseSource.includes(forbidden)) {
    issues.push(`database persistence must not perform side effects or live provider calls (${forbidden})`);
  }
}

if (databaseSource.includes("apiKey:")) {
  issues.push("database persistence must not define or persist a clear-text apiKey field");
}

function resolveRelativeSpecifier(filePath, specifier) {
  if (/\.[cm]?js$|\.json$/.test(specifier)) return specifier;
  const base = path.resolve(path.dirname(filePath), specifier);
  if (existsSync(`${base}.js`)) return `${specifier}.js`;
  if (existsSync(path.join(base, "index.js"))) return `${specifier}/index.js`;
  return `${specifier}.js`;
}

function patchImports(filePath) {
  let text = readFileSync(filePath, "utf8");
  text = text.replace(/(from\s+["'])(\.?\.\/[^"']+)(["'])/g, (_match, start, specifier, end) => {
    return `${start}${resolveRelativeSpecifier(filePath, specifier)}${end}`;
  });
  writeFileSync(filePath, text, "utf8");
}

async function runRuntimeCheck() {
  const outDir = path.join(root, `.tmp-database-persistence-check-${Date.now()}`);
  mkdirSync(outDir, { recursive: true });

  try {
    const configFile = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
    if (configFile.error) {
      issues.push(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
      return;
    }

    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root, {
      noEmit: false,
      outDir,
      declaration: false,
      sourceMap: false,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      incremental: false,
    });
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const emitResult = program.emit();
    const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
    const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    if (errors.length > 0) {
      issues.push(ts.formatDiagnosticsWithColorAndContext(errors, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      }));
      return;
    }

    const stack = [outDir];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(entryPath);
        if (entry.isFile() && entry.name.endsWith(".js")) patchImports(entryPath);
      }
    }

    const storageModulePath = existsSync(path.join(outDir, "storage", "index.js"))
      ? path.join(outDir, "storage", "index.js")
      : path.join(outDir, "src", "storage", "index.js");
    const storage = await import(pathToFileURL(storageModulePath).href);
    const client = storage.createMemoryDatabaseClient();
    const repository = storage.createDatabaseWorkspaceRepository(client);
    const snapshot = storage.createMockWorkspaceSnapshot();
    const rows = storage.workspaceSnapshotToDatabaseRows(snapshot);

    if (rows.workspace.workspaceId !== snapshot.metadata.workspaceId) issues.push("database rows lost workspace id");
    if (rows.workspace.snapshotJson.includes("sk-workspace-example")) issues.push("snapshotJson contains an unredacted API key");
    if (!rows.providerConfigs.every((row) => !row.apiKeyMasked || row.apiKeyMasked.includes("****"))) {
      issues.push("provider config rows must use masked API key values");
    }

    const saved = await repository.saveSnapshot(snapshot);
    if (!saved.ok || saved.snapshot.workspaceId !== snapshot.metadata.workspaceId) {
      issues.push("database repository failed to save snapshot");
    }

    const loaded = await repository.loadSnapshot(snapshot.metadata.workspaceId);
    if (!loaded.ok) {
      issues.push("database repository failed to load saved snapshot");
    } else if (loaded.snapshot.metadata.backend !== "database") {
      issues.push("loaded snapshot must record database backend");
    }

    const missing = await repository.loadSnapshot("missing-workspace");
    if (missing.ok || missing.code !== "not_found") {
      issues.push("database repository missing load must return not_found");
    }

    const listed = await repository.listSnapshots(snapshot.project.id);
    if (listed.length !== 1 || listed[0].workspaceId !== snapshot.metadata.workspaceId) {
      issues.push("database repository failed to list saved snapshot");
    }
  } finally {
    const resolved = path.resolve(outDir);
    if (resolved.startsWith(`${path.resolve(root)}${path.sep}`) && path.basename(resolved).startsWith(".tmp-database-persistence-check-")) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Database persistence checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Database persistence checks passed.");
