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
    issues.push(`${filePath}: missing required queue worker file`);
    return "";
  }
}

const worker = read("src/queue/workspace-worker.ts");
const mockRunner = read("src/queue/mock-runner.ts");
const queueIndex = read("src/queue/index.ts");
const pkg = read("package.json");
const product = read("PRODUCT.md");
const decisions = read("DECISIONS.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");

for (const token of [
  "WorkspaceQueueWorkerInputSchema",
  "WorkspaceQueueWorkerResultSchema",
  "createWorkspaceQueueWorker",
  "StoredResultAssetSchema",
  "StoredArchiveRowSchema",
  "runMockQueuePlan",
  "executeMappedProviderRequestWithCredentials",
  "createProviderCredentialRef",
  "createMemoryCredentialResolver",
  "credentialResolver",
  "credentialRefs",
  "StorageRepository",
  "mergeQueuePlans",
  "mergeQueueSummaries",
]) {
  if (![worker, mockRunner].join("\n").includes(token)) issues.push(`workspace worker/runner: missing ${token}`);
}

for (const token of ["workspace-worker", "createWorkspaceQueueWorker", "WorkspaceQueueWorkerInputSchema"]) {
  if (!queueIndex.includes(token)) issues.push(`queue/index.ts: missing export for ${token}`);
}

for (const [file, source] of [
  ["PRODUCT.md", product],
  ["DECISIONS.md", decisions],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
]) {
  if (!source.includes("Queue Worker") && !source.includes("queue worker")) {
    issues.push(`${file}: missing queue worker update`);
  }
}

if (!pkg.includes("queue-worker:check")) issues.push("package.json: missing queue-worker:check script");

for (const forbidden of [
  "fetch(",
  "XMLHttpRequest",
  "axios",
  "localStorage",
  "sessionStorage",
  "writeFile",
  "readFile",
  "api.openai.com",
  "S3Client",
]) {
  if ([worker, mockRunner].join("\n").includes(forbidden)) {
    issues.push(`queue worker must not call live network, browser storage, or file APIs by default (${forbidden})`);
  }
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

function withProviderReadyMockAssets(snapshot) {
  return {
    ...snapshot,
    assets: snapshot.assets.map((asset) => ({
      ...asset,
      metadata: { ...(asset.metadata || {}), mockAsset: true },
      previewUrl: `https://cdn.poster-lab.test/queue-worker/${asset.id}.png`,
    })),
  };
}

async function runRuntimeCheck() {
  const outDir = path.join(root, `.tmp-queue-worker-check-${Date.now()}`);
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

    const queueModulePath = existsSync(path.join(outDir, "queue", "index.js"))
      ? path.join(outDir, "queue", "index.js")
      : path.join(outDir, "src", "queue", "index.js");
    const storageModulePath = existsSync(path.join(outDir, "storage", "index.js"))
      ? path.join(outDir, "storage", "index.js")
      : path.join(outDir, "src", "storage", "index.js");

    const queue = await import(pathToFileURL(queueModulePath).href);
    const storage = await import(pathToFileURL(storageModulePath).href);
    const baseSnapshot = withProviderReadyMockAssets(storage.createMockWorkspaceSnapshot());
    const plan = queue.createBatchQueuePlan({
      projectId: baseSnapshot.project.id,
      mode: "poster",
      providerId: "qwen",
      schemeIds: ["scheme-poster-01"],
      imagesPerScheme: 1,
      includeImageEdit: false,
      includeUpscale: false,
      includeBackgroundRemoval: false,
    });
    const snapshot = storage.WorkspaceSnapshotSchema.parse({
      ...baseSnapshot,
      queuePlans: [plan],
      queueSummaries: [queue.summarizeQueue(plan)],
      results: [],
      archiveRows: [],
    });
    const repository = storage.createMemoryDraftRepository([snapshot]);
    const workerService = queue.createWorkspaceQueueWorker({
      repository,
      now: () => "2026-05-21T12:00:00.000Z",
    });

    const result = await workerService.run({
      workspaceId: snapshot.metadata.workspaceId,
      jobId: plan.job.id,
    });

    if (result.summary.progress !== 100 || result.summary.completed !== plan.tasks.length) {
      issues.push("queue worker should complete the mock queue plan");
    }
    if (result.resultCount < 1) {
      issues.push("queue worker should create result assets for image tasks");
    }
    if (result.archiveRowCount !== result.resultCount) {
      issues.push("queue worker should archive every generated result by default");
    }

    const loaded = await repository.loadSnapshot(snapshot.metadata.workspaceId);
    if (!loaded.ok) {
      issues.push("queue worker should save updated workspace snapshot");
      return;
    }

    const newResults = loaded.snapshot.results.filter((item) => item.jobId === plan.job.id);
    if (newResults.length !== result.resultCount) {
      issues.push("saved workspace should contain worker result records");
    }
    if (!newResults.some((item) => item.metadata.providerExecution === "credential-aware")) {
      issues.push("saved result records should preserve credential-aware provider execution lineage");
    }
    if (newResults.some((item) => item.metadata.assetOverlayProcessing)) {
      issues.push("poster queue worker should not apply uploaded asset overlay by default");
    }
    if (!loaded.snapshot.queueSummaries.some((summary) => summary.jobId === plan.job.id && summary.progress === 100)) {
      issues.push("saved workspace should include updated queue summary");
    }

    const mixedProviderPlan = queue.createBatchQueuePlan({
      projectId: baseSnapshot.project.id,
      mode: "poster",
      providerId: "deepseek",
      providerRoutes: {
        image: { providerId: "google" },
      },
      schemeIds: ["scheme-poster-01"],
      imagesPerScheme: 1,
      includeImageEdit: false,
      includeUpscale: false,
      includeBackgroundRemoval: false,
    });
    const mixedProviderSnapshot = storage.WorkspaceSnapshotSchema.parse({
      ...baseSnapshot,
      queuePlans: [mixedProviderPlan],
      queueSummaries: [queue.summarizeQueue(mixedProviderPlan)],
      results: [],
      archiveRows: [],
    });
    const mixedProviderRepository = storage.createMemoryDraftRepository([mixedProviderSnapshot]);
    const mixedProviderWorker = queue.createWorkspaceQueueWorker({
      repository: mixedProviderRepository,
      now: () => "2026-05-21T12:00:00.000Z",
    });
    const mixedProviderRun = await mixedProviderWorker.run({
      workspaceId: mixedProviderSnapshot.metadata.workspaceId,
      jobId: mixedProviderPlan.job.id,
    });
    if (mixedProviderRun.summary.failed > 0 || mixedProviderRun.summary.completed !== mixedProviderPlan.tasks.length) {
      issues.push("queue worker should resolve credentials per task provider in mixed-provider plans");
    }

    const missingCredentialPlan = queue.createBatchQueuePlan({
      projectId: baseSnapshot.project.id,
      mode: "poster",
      providerId: "openai",
      schemeIds: ["scheme-poster-01"],
      imagesPerScheme: 1,
      includeImageEdit: false,
      includeUpscale: false,
      includeBackgroundRemoval: false,
    });
    const missingCredentialRun = await queue.runMockQueuePlan(missingCredentialPlan, {
      storedConfig: baseSnapshot.providerConfigs.openai,
      credentialRef: {
        providerId: "openai",
        source: "runtime",
        keyRef: "openai",
        configured: true,
        maskedValue: "sk-****test",
        updatedAt: "2026-05-21T12:00:00.000Z",
      },
      credentialResolver: {
        async resolveCredential(ref) {
          return {
            ok: false,
            error: {
              providerId: ref.providerId,
              code: "auth_failed",
              retryable: false,
              message: "Credential is intentionally unavailable for this queue worker check.",
              userMessage: "Provider credential is not configured or cannot be resolved.",
            },
          };
        },
      },
    });
    if (!missingCredentialRun.summary.failed) {
      issues.push("queue provider execution should fail when required credentials are unresolved");
    }
    if (!missingCredentialRun.plan.tasks.some((task) => task.error?.code === "auth_failed")) {
      issues.push("missing queue credentials should surface structured auth_failed task errors");
    }
  } finally {
    const resolved = path.resolve(outDir);
    if (resolved.startsWith(`${path.resolve(root)}${path.sep}`) && path.basename(resolved).startsWith(".tmp-queue-worker-check-")) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Queue worker checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Queue worker checks passed.");
