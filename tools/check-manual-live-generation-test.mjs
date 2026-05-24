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
    issues.push(`${filePath}: missing required manual live generation test file`);
    return "";
  }
}

const manualService = read("src/api/manual-live-generation.ts");
const contracts = read("src/api/contracts.ts");
const nextService = read("src/api/next-service.ts");
const nextRoute = read("app/api/workspaces/[workspaceId]/queue-plans/[jobId]/live-test/route.ts");
const apiIndex = read("src/api/index.ts");
const product = read("PRODUCT.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const decisions = read("DECISIONS.md");
const pkg = read("package.json");

for (const token of [
  "createManualLiveGenerationService",
  "createProviderDiagnosticService",
  "evaluateLiveExecutionGate",
  "runOpenAILiveQueue",
  "credentialVault.resolveCredential",
  "resultFileStore",
  "connectionTransport",
  "imageTransport",
]) {
  if (!manualService.includes(token)) issues.push(`manual-live-generation.ts: missing ${token}`);
}

for (const token of [
  "QueuePlanManualLiveTestApiRequestSchema",
  "QueuePlanManualLiveTestApiResponseSchema",
  "queue.plan.live.test",
  "/api/workspaces/:workspaceId/queue-plans/:jobId/live-test",
  "OpenAILiveQueueRunResultSchema",
  "LiveExecutionSafetyInputSchema",
]) {
  if (!contracts.includes(token)) issues.push(`contracts.ts: missing ${token}`);
}

if (!nextService.includes("nextManualLiveGenerationService")) {
  issues.push("next-service.ts: missing nextManualLiveGenerationService");
}
if (!nextService.includes("createOpenAIImageFetchTransport")) {
  issues.push("next-service.ts: missing OpenAI image fetch transport setup");
}
if (!nextRoute.includes("nextManualLiveGenerationService") || !nextRoute.includes("runManualLiveGenerationTest")) {
  issues.push("live-test route must delegate to nextManualLiveGenerationService.runManualLiveGenerationTest");
}
if (!nextRoute.includes("jsonEnvelope")) issues.push("live-test route must return jsonEnvelope");
if (!apiIndex.includes("manual-live-generation")) issues.push("src/api/index.ts: missing manual live generation export");

for (const [file, source] of [
  ["PRODUCT.md", product],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
]) {
  if (!source.includes("Manual Desktop Live Generation Test")) {
    issues.push(`${file}: missing Manual Desktop Live Generation Test update`);
  }
}
if (!decisions.includes("D077")) issues.push("DECISIONS.md: missing D077 manual live generation decision");
if (!pkg.includes("manual-live-generation:check")) {
  issues.push("package.json: missing manual-live-generation:check script");
}

for (const forbidden of ["process.env", "localStorage", "sessionStorage", "XMLHttpRequest", "axios", "api.openai.com"]) {
  if (manualService.includes(forbidden)) {
    issues.push(`manual live generation service must not read implicit credentials or hardcode providers (${forbidden})`);
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

function compiledModulePath(outDir, folder) {
  const direct = path.join(outDir, folder, "index.js");
  if (existsSync(direct)) return direct;
  return path.join(outDir, "src", folder, "index.js");
}

function allowedSafety() {
  return {
    estimatedCost: 0.1,
    maxAcceptedCost: 1,
    confirmations: {
      liveRun: true,
      providerCost: true,
      externalProvider: true,
      resultStorage: true,
    },
  };
}

async function createFixture({ api, queue, storage, results, providers, resultRoot }) {
  const snapshotBase = storage.createMockWorkspaceSnapshot();
  const plan = queue.createBatchQueuePlan({
    projectId: snapshotBase.project.id,
    mode: "poster",
    providerId: "openai",
    schemeIds: ["scheme-poster-01"],
    imagesPerScheme: 1,
    includeImageEdit: false,
    includeUpscale: false,
    includeBackgroundRemoval: false,
  });
  const snapshot = storage.WorkspaceSnapshotSchema.parse({
    ...snapshotBase,
    queuePlans: [plan],
    queueSummaries: [queue.summarizeQueue(plan)],
    results: [],
    archiveRows: [],
  });
  const repository = storage.createMemoryDraftRepository([snapshot]);
  const credentialVault = providers.createEncryptedProviderCredentialVault({
    masterKey: "manual-live-generation-check",
    now: () => "2026-05-23T00:00:00.000Z",
  });
  await credentialVault.save({
    providerId: "openai",
    keyRef: api.providerCredentialKeyRef({
      workspaceId: snapshot.metadata.workspaceId,
      providerId: "openai",
    }),
    apiKey: "OPENAI_MANUAL_KEY_TEST_PLACEHOLDER",
    updatedAt: "2026-05-23T00:00:00.000Z",
  });
  const resultFileStore = results.createLocalResultFileStore({
    rootDir: resultRoot,
    publicBaseUrl: "http://localhost:3000/generated-results/",
    now: () => "2026-05-23T00:00:00.000Z",
  });

  return { snapshot, plan, repository, credentialVault, resultFileStore };
}

async function runRuntimeCheck() {
  const outDir = path.join(root, `.tmp-manual-live-generation-build-${Date.now()}`);
  const resultRoot = path.join(root, `.tmp-manual-live-generation-results-${Date.now()}`);
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

    const api = await import(pathToFileURL(compiledModulePath(outDir, "api")).href);
    const queue = await import(pathToFileURL(compiledModulePath(outDir, "queue")).href);
    const storage = await import(pathToFileURL(compiledModulePath(outDir, "storage")).href);
    const results = await import(pathToFileURL(compiledModulePath(outDir, "results")).href);
    const providers = await import(pathToFileURL(compiledModulePath(outDir, "providers")).href);

    let connectionCalls = 0;
    let imageCalls = 0;
    let capturedConnectionAuth = "";
    let capturedImageAuth = "";

    const fixture = await createFixture({ api, queue, storage, results, providers, resultRoot });
    const service = api.createManualLiveGenerationService({
      repository: fixture.repository,
      credentialVault: fixture.credentialVault,
      connectionTransport: async (request) => {
        connectionCalls += 1;
        capturedConnectionAuth = request.headers.Authorization || "";
        return {
          ok: true,
          status: 200,
          body: { data: [{ id: "gpt-image-1" }] },
        };
      },
      imageTransport: async (request) => {
        imageCalls += 1;
        capturedImageAuth = request.headers.Authorization || "";
        return {
          ok: true,
          status: 200,
          body: { data: [{ b64_json: Buffer.from("manual-live-generation-image").toString("base64") }] },
        };
      },
      resultFileStore: fixture.resultFileStore,
      now: () => "2026-05-23T00:00:00.000Z",
      adapterNow: () => 1000,
    });

    const skipped = await service.runManualLiveGenerationTest({
      workspaceId: fixture.snapshot.metadata.workspaceId,
      jobId: fixture.plan.job.id,
      enabled: false,
      safety: allowedSafety(),
      traceId: "trace-manual-live-generation-skipped",
    });
    if (!skipped.ok || skipped.data.result.status !== "skipped") {
      issues.push("manual live test should skip when enabled=false");
    }
    if (connectionCalls !== 0 || imageCalls !== 0) {
      issues.push("manual live test should not call diagnostics or image transport when skipped");
    }

    const failingFixture = await createFixture({ api, queue, storage, results, providers, resultRoot });
    let failingImageCalls = 0;
    const failingService = api.createManualLiveGenerationService({
      repository: failingFixture.repository,
      credentialVault: failingFixture.credentialVault,
      connectionTransport: async () => ({
        ok: false,
        status: 401,
        body: { error: { message: "bad key" } },
      }),
      imageTransport: async () => {
        failingImageCalls += 1;
        return { ok: true, status: 200, body: { data: [] } };
      },
      resultFileStore: failingFixture.resultFileStore,
    });
    const diagnosticBlocked = await failingService.runManualLiveGenerationTest({
      workspaceId: failingFixture.snapshot.metadata.workspaceId,
      jobId: failingFixture.plan.job.id,
      enabled: true,
      safety: allowedSafety(),
      traceId: "trace-manual-live-generation-diagnostic-blocked",
    });
    if (
      !diagnosticBlocked.ok ||
      diagnosticBlocked.data.result.status !== "blocked" ||
      diagnosticBlocked.data.connection?.status !== "auth_failed"
    ) {
      issues.push("manual live test should block image generation when connection diagnostic fails");
    }
    if (failingImageCalls !== 0) {
      issues.push("manual live test must not call image transport after failed diagnostic");
    }

    const success = await service.runManualLiveGenerationTest({
      workspaceId: fixture.snapshot.metadata.workspaceId,
      jobId: fixture.plan.job.id,
      enabled: true,
      safety: allowedSafety(),
      traceId: "trace-manual-live-generation-success",
    });
    if (!success.ok || success.data.result.status !== "attempted" || !success.data.result.attempted) {
      issues.push("manual live test should attempt OpenAI live queue after diagnostic and safety gate pass");
    }
    if (success.ok && success.data.result.persistedFileCount !== 1) {
      issues.push("manual live test should persist returned dataUrl as a local result file");
    }
    if (connectionCalls !== 1 || imageCalls !== 1) {
      issues.push("manual live test should call connection diagnostic and image transport exactly once for success");
    }
    if (capturedConnectionAuth !== "Bearer OPENAI_MANUAL_KEY_TEST_PLACEHOLDER") {
      issues.push("connection diagnostic should receive the resolved saved credential only through its transport");
    }
    if (capturedImageAuth !== "Bearer OPENAI_MANUAL_KEY_TEST_PLACEHOLDER") {
      issues.push("image transport should receive the resolved saved credential only at live execution time");
    }
    if (JSON.stringify(success).includes("OPENAI_MANUAL_KEY_TEST_PLACEHOLDER")) {
      issues.push("manual live API response must not echo the clear-text API key");
    }

    const loaded = await fixture.repository.loadSnapshot(fixture.snapshot.metadata.workspaceId);
    if (!loaded.ok) {
      issues.push("manual live test should save the updated workspace snapshot");
    } else {
      const jobResults = loaded.snapshot.results.filter((item) => item.jobId === fixture.plan.job.id);
      if (jobResults.length !== 1) issues.push("manual live test should create one stored result for the queue job");
      if (!jobResults[0]?.metadata?.resultFile?.storageKey) {
        issues.push("manual live result should include resultFile metadata");
      }
      const snapshotText = JSON.stringify(loaded.snapshot);
      if (snapshotText.includes("OPENAI_MANUAL_KEY_TEST_PLACEHOLDER")) {
        issues.push("workspace snapshot must not contain the clear-text API key");
      }
      if (snapshotText.includes("data:image/png;base64")) {
        issues.push("workspace snapshot must not retain raw provider dataUrl payloads");
      }
    }
  } finally {
    for (const candidate of [outDir, resultRoot]) {
      const resolved = path.resolve(candidate);
      const allowed =
        resolved.startsWith(`${path.resolve(root)}${path.sep}`) &&
        (path.basename(resolved).startsWith(".tmp-manual-live-generation-build-") ||
          path.basename(resolved).startsWith(".tmp-manual-live-generation-results-"));
      if (allowed) rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Manual live generation test checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Manual live generation test checks passed.");
