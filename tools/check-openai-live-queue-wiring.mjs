import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const issues = [];
const root = process.cwd();

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required file`);
    return "";
  }
}

const liveQueue = read("src/queue/openai-live-queue.ts");
const worker = read("src/queue/workspace-worker.ts");
const runner = read("src/queue/mock-runner.ts");
const queueIndex = read("src/queue/index.ts");
const decisions = read("DECISIONS.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const product = read("PRODUCT.md");
const pkg = read("package.json");

for (const token of [
  "OpenAILiveQueueRunInputSchema",
  "OpenAILiveQueueRunResultSchema",
  "runOpenAILiveQueue",
  "LiveExecutionSafetyInputSchema",
  "evaluateLiveExecutionGate",
  "createRuntimeProviderCredentialStore",
  "createOpenAILiveImageAdapter",
  "resultFileStore",
  "transport",
]) {
  if (!liveQueue.includes(token)) issues.push(`openai-live-queue.ts: missing ${token}`);
}

for (const token of ["resultFileStore", "storeDataUrl", "resultFile", "dataUrlPersisted"]) {
  if (!worker.includes(token)) issues.push(`workspace-worker.ts: missing live result persistence token ${token}`);
}

for (const token of ["ProviderModelSlotSchema", "resolveTaskModel"]) {
  if (!runner.includes(token)) issues.push(`mock-runner.ts: missing model slot resolution token ${token}`);
}

for (const token of ["runOpenAILiveQueue", "OpenAILiveQueueRunInputSchema"]) {
  if (!queueIndex.includes(token)) issues.push(`src/queue/index.ts: missing live queue export ${token}`);
}

for (const [file, source] of [
  ["DECISIONS.md", decisions],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
  ["PRODUCT.md", product],
]) {
  if (!source.includes("Live Queue") && !source.includes("live queue")) {
    issues.push(`${file}: missing live queue wiring update`);
  }
}

if (!decisions.includes("D072")) issues.push("DECISIONS.md: missing D072 live queue decision");
if (!pkg.includes("openai-live-queue:check")) issues.push("package.json: missing openai-live-queue:check script");

for (const forbidden of ["process.env", "localStorage", "sessionStorage", "XMLHttpRequest", "axios"]) {
  if (liveQueue.includes(forbidden)) issues.push(`live queue helper must not read implicit credentials or browser storage (${forbidden})`);
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
  const outDir = path.join(root, `.tmp-openai-live-queue-build-${Date.now()}`);
  const resultRoot = path.join(root, `.tmp-openai-live-queue-results-${Date.now()}`);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(resultRoot, { recursive: true });

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
      issues.push(
        ts.formatDiagnosticsWithColorAndContext(errors, {
          getCanonicalFileName: (fileName) => fileName,
          getCurrentDirectory: () => root,
          getNewLine: () => "\n",
        }),
      );
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
    const resultsModulePath = existsSync(path.join(outDir, "results", "index.js"))
      ? path.join(outDir, "results", "index.js")
      : path.join(outDir, "src", "results", "index.js");

    const queue = await import(pathToFileURL(queueModulePath).href);
    const storage = await import(pathToFileURL(storageModulePath).href);
    const results = await import(pathToFileURL(resultsModulePath).href);

    const baseSnapshot = storage.createMockWorkspaceSnapshot();
    const plan = queue.createBatchQueuePlan({
      projectId: baseSnapshot.project.id,
      mode: "poster",
      providerId: "openai",
      schemeIds: ["scheme-poster-01"],
      imagesPerScheme: 2,
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
    const store = results.createLocalResultFileStore({
      rootDir: resultRoot,
      publicBaseUrl: "http://localhost:3000/generated-results/",
      now: () => "2026-05-23T00:00:00.000Z",
    });

    let transportCalls = 0;
    let capturedRequest = null;
    const transport = async (request) => {
      transportCalls += 1;
      capturedRequest = request;
      return {
        ok: true,
        status: 200,
        body: {
          data: [
            { b64_json: Buffer.from("live-queue-image-one").toString("base64") },
            { b64_json: Buffer.from("live-queue-image-two").toString("base64") },
          ],
        },
      };
    };

    const skipped = await queue.runOpenAILiveQueue(
      {
        enabled: false,
        workspaceId: snapshot.metadata.workspaceId,
        jobId: plan.job.id,
        apiKey: "sk-should-not-run",
      },
      { repository, resultFileStore: store, transport },
    );
    if (skipped.status !== "skipped" || transportCalls !== 0) {
      issues.push("live queue should skip without explicit opt-in and avoid transport calls");
    }

    const missingKey = await queue.runOpenAILiveQueue(
      {
        enabled: true,
        workspaceId: snapshot.metadata.workspaceId,
        jobId: plan.job.id,
      },
      { repository, resultFileStore: store, transport },
    );
    if (missingKey.status !== "blocked" || transportCalls !== 0) {
      issues.push("live queue should block missing API key before adapter execution");
    }

    const missingSafety = await queue.runOpenAILiveQueue(
      {
        enabled: true,
        workspaceId: snapshot.metadata.workspaceId,
        jobId: plan.job.id,
        apiKey: "OPENAI_QUEUE_KEY_TEST_PLACEHOLDER",
      },
      { repository, resultFileStore: store, transport },
    );
    if (missingSafety.status !== "blocked" || !missingSafety.gate?.blockers?.some((item) => item.code === "missing_live_confirmation") || transportCalls !== 0) {
      issues.push("live queue should block missing user safety confirmations before adapter execution");
    }

    const missingTransport = await queue.runOpenAILiveQueue(
      {
        enabled: true,
        workspaceId: snapshot.metadata.workspaceId,
        jobId: plan.job.id,
        apiKey: "OPENAI_QUEUE_KEY_TEST_PLACEHOLDER",
        safety: {
          estimatedCost: 0.1,
          maxAcceptedCost: 1,
          confirmations: {
            liveRun: true,
            providerCost: true,
            externalProvider: true,
            resultStorage: true,
          },
        },
      },
      { repository, resultFileStore: store },
    );
    if (missingTransport.status !== "blocked" || transportCalls !== 0) {
      issues.push("live queue should block missing transport before provider execution");
    }

    const success = await queue.runOpenAILiveQueue(
      {
        enabled: true,
        workspaceId: snapshot.metadata.workspaceId,
        jobId: plan.job.id,
        apiKey: "OPENAI_QUEUE_KEY_TEST_PLACEHOLDER",
        safety: {
          estimatedCost: 0.1,
          maxAcceptedCost: 1,
          confirmations: {
            liveRun: true,
            providerCost: true,
            externalProvider: true,
            resultStorage: true,
          },
        },
        traceId: "trace-openai-live-queue-check",
      },
      {
        repository,
        resultFileStore: store,
        transport,
        now: () => "2026-05-23T00:00:00.000Z",
        adapterNow: () => 1000,
      },
    );

    if (success.status !== "attempted" || !success.attempted || success.summary?.progress !== 100) {
      issues.push("live queue should complete through fake OpenAI transport");
    }
    if (success.gate?.status !== "allowed") {
      issues.push("live queue success should include an allowed safety gate decision");
    }
    if (transportCalls !== 1) issues.push("live queue should call injected transport exactly once for one image task");
    if (capturedRequest?.headers?.Authorization !== "Bearer OPENAI_QUEUE_KEY_TEST_PLACEHOLDER") {
      issues.push("live queue should pass runtime API key only into the injected transport request");
    }
    if (capturedRequest?.body?.model !== "gpt-image-1" || capturedRequest?.body?.n !== 2) {
      issues.push("live queue should resolve symbolic model slots and preserve requested image count");
    }
    if (success.resultCount !== 2 || success.persistedFileCount !== 2) {
      issues.push("live queue should persist every returned dataUrl provider asset");
    }

    const loaded = await repository.loadSnapshot(snapshot.metadata.workspaceId);
    if (!loaded.ok) {
      issues.push("live queue should save the updated workspace snapshot");
      return;
    }
    const jobResults = loaded.snapshot.results.filter((item) => item.jobId === plan.job.id);
    if (jobResults.length !== 2) issues.push("saved live queue snapshot should contain two image results");
    for (const result of jobResults) {
      if (!result.metadata.resultFile?.storageKey) {
        issues.push("saved live queue result should include resultFile metadata");
      }
      if (result.metadata.providerAsset?.dataUrl) {
        issues.push("saved live queue result should not keep raw provider dataUrl metadata after persistence");
      }
      if (!result.metadata.providerAsset?.dataUrlPersisted) {
        issues.push("saved live queue result should mark provider dataUrl as persisted");
      }
    }
    if (JSON.stringify(loaded.snapshot).includes("OPENAI_QUEUE_KEY_TEST_PLACEHOLDER")) {
      issues.push("workspace snapshot must not contain the clear-text OpenAI API key");
    }
    const descriptor = results.createResultDownloadDescriptor({
      snapshot: loaded.snapshot,
      resultId: jobResults[0]?.id || "",
    });
    if (!descriptor?.available || descriptor.source !== "localFile") {
      issues.push("download descriptor should resolve live queue persisted files as localFile");
    }
  } finally {
    for (const candidate of [outDir, resultRoot]) {
      const resolved = path.resolve(candidate);
      const allowed =
        resolved.startsWith(`${path.resolve(root)}${path.sep}`) &&
        (path.basename(resolved).startsWith(".tmp-openai-live-queue-build-") ||
          path.basename(resolved).startsWith(".tmp-openai-live-queue-results-"));
      if (allowed) rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("OpenAI live queue wiring checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("OpenAI live queue wiring checks passed.");
