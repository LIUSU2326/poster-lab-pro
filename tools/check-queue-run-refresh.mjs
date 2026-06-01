import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const issues = [];
const root = process.cwd();

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required queue refresh file`);
    return "";
  }
}

const httpService = read("src/http-generation-service.js");
const binding = read("src/form-binding.js");
const apiService = read("src/api/service.ts");
const runRoute = read("app/api/workspaces/[workspaceId]/queue-plans/[jobId]/run/route.ts");
const queueViewModel = read("src/data/queue-view-model.js");
const taskChrome = read("src/render/task-chrome.js");
const pkg = read("package.json");

for (const token of [
  "runQueuePlan",
  "loadWorkspaceSnapshot",
  "queueRun",
  "workspaceReload",
]) {
  if (!httpService.includes(token)) issues.push(`http-generation-service.js: missing ${token}`);
}

for (const token of [
  "setRuntimeWorkspaceSnapshot",
  "serviceFlow.workspaceReload",
]) {
  if (!binding.includes(token)) issues.push(`form-binding.js: missing runtime refresh token ${token}`);
}

for (const token of [
  "createWorkspaceQueueWorker",
  "QueuePlanRunApiRequestSchema",
  "QueuePlanRunApiResponseSchema",
  "runQueuePlan",
]) {
  if (!apiService.includes(token)) issues.push(`service.ts: missing queue run token ${token}`);
}

for (const token of [
  "nextLocalApiService.runQueuePlan",
  "routeWorkspaceId",
  "jobId",
  "jsonEnvelope",
]) {
  if (!runRoute.includes(token)) issues.push(`queue plan run route: missing ${token}`);
}

for (const token of [
  "getRuntimeWorkspaceSnapshot",
  "createRuntimeQueueViewModel",
  "snapshot.queuePlans",
  "snapshot.queueSummaries",
]) {
  if (!queueViewModel.includes(token)) issues.push(`queue-view-model.js: missing runtime queue token ${token}`);
}

if (!taskChrome.includes("renderTaskChrome")) {
  issues.push("task-chrome.js: missing compact task chrome renderer");
}

if (!pkg.includes("queue-refresh:check")) {
  issues.push("package.json: missing queue-refresh:check script");
}

for (const [fileName, source] of [
  ["form-binding.js", binding],
  ["task-chrome.js", taskChrome],
  ["queue-view-model.js", queueViewModel],
]) {
  if (source.includes("fetch(")) {
    issues.push(`${fileName}: fetch must stay isolated to HTTP client/data services`);
  }
}

async function runRuntimeCheck() {
  const { workspaceSnapshot } = await import(pathToFileURL(path.join(root, "src/data/workspace-snapshot.js")).href);
  const { runHttpGenerationServiceFlow } = await import(pathToFileURL(path.join(root, "src/http-generation-service.js")).href);
  const { setRuntimeWorkspaceSnapshot, getRuntimeWorkspaceSnapshot } = await import(pathToFileURL(path.join(root, "src/state.js")).href);
  const { createQueueViewModel } = await import(pathToFileURL(path.join(root, "src/data/queue-view-model.js")).href);
  const { modeSpecs } = await import(pathToFileURL(path.join(root, "src/data/modes.js")).href);

  const snapshot = JSON.parse(JSON.stringify(workspaceSnapshot));
  const jobId = "job-http-refresh-check";
  const queuePlan = {
    job: {
      id: jobId,
      projectId: snapshot.project.id,
      mode: "poster",
      title: "HTTP refresh check",
      status: "succeeded",
      providerId: "openai",
      createdAt: "2026-05-21T00:00:00.000Z",
      updatedAt: "2026-05-21T00:00:10.000Z",
    },
    tasks: [
      {
        id: "task-http-refresh-1",
        jobId,
        kind: "imageGeneration",
        mode: "poster",
        providerId: "openai",
        providerCapability: "imageGeneration",
        status: "succeeded",
        stage: "complete",
        progress: 100,
        attempt: 1,
        input: { schemeId: "scheme-poster-01", platformPreset: "tiktok", width: 1080, height: 1920, model: "gpt-image-1" },
        output: { providerResultIds: ["provider-result-http-refresh-1"] },
        dependencies: [],
        cost: { currency: "USD", estimatedCost: 0.24 },
        elapsedMs: 12000,
        errors: [],
        createdAt: "2026-05-21T00:00:00.000Z",
        updatedAt: "2026-05-21T00:00:10.000Z",
      },
    ],
    events: [],
  };
  const reloadedSnapshot = {
    ...snapshot,
    queuePlans: [queuePlan],
    queueSummaries: [{ jobId, total: 1, completed: 1, failed: 0, progress: 100, estimatedCost: 0.24, elapsedMs: 12000 }],
    results: [
      {
        id: "result-http-refresh-1",
        projectId: snapshot.project.id,
        schemeId: "scheme-poster-01",
        jobId,
        mode: "poster",
        width: 1080,
        height: 1920,
        platformPreset: "tiktok",
        language: null,
        model: "gpt-image-1",
        status: "ready",
        taskId: "task-http-refresh-1",
        providerResultId: "provider-result-http-refresh-1",
        thumbnailUrl: null,
        assetUrl: null,
        favorite: false,
        archivedAt: null,
        metadata: {},
        createdAt: "2026-05-21T00:00:10.000Z",
        updatedAt: "2026-05-21T00:00:10.000Z",
      },
    ],
    metadata: {
      ...snapshot.metadata,
      revision: snapshot.metadata.revision + 2,
      updatedAt: "2026-05-21T00:00:10.000Z",
    },
  };
  const calls = [];

  const fakeFetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });

    if (url.endsWith("/snapshot")) {
      return envelope({ summary: { workspaceId: snapshot.metadata.workspaceId } }, "trace-refresh-save");
    }
    if (url.endsWith("/prompts")) {
      return envelope({
        promptPackage: {
          id: "prompt-refresh-check",
          target: "image",
          projectId: snapshot.project.id,
          mode: "poster",
          schemeId: "scheme-poster-01",
          assets: [],
          platform: { platformPreset: "tiktok", aspectRatio: "9:16", width: 1080, height: 1920 },
          finalPrompt: "HTTP queue refresh prompt",
        },
      }, "trace-refresh-prompts");
    }
    if (url.endsWith("/provider-requests")) {
      return envelope({ mappedRequest: { kind: "imageGeneration" } }, "trace-refresh-provider");
    }
    if (url.endsWith("/queue-plans")) {
      return envelope({ queuePlan, summary: reloadedSnapshot.queueSummaries[0] }, "trace-refresh-plan");
    }
    if (url.endsWith("/run")) {
      return envelope({
        workspace: reloadedSnapshot,
        summary: reloadedSnapshot.queueSummaries[0],
        resultCount: 1,
        archiveRowCount: 1,
      }, "trace-refresh-run");
    }
    if (url.endsWith(`/api/workspaces/${snapshot.metadata.workspaceId}`)) {
      return envelope({ snapshot: reloadedSnapshot }, "trace-refresh-reload");
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  const submission = {
    status: "submitting",
    traceId: "trace-http-refresh-check",
    providerId: "openai",
    promptPackageCreate: {
      routeId: "prompt.package.create",
      payload: {
        snapshot,
        target: "image",
        mode: "poster",
        schemeId: "scheme-poster-01",
        platformPreset: "tiktok",
        aspectRatio: "9:16",
      },
    },
    queuePlanCreate: {
      routeId: "queue.plan.create",
      payload: {
        projectId: snapshot.project.id,
        mode: "poster",
        providerId: "openai",
        schemeIds: ["scheme-poster-01"],
        platformPresets: ["tiktok"],
        imagesPerScheme: 1,
        includeImageEdit: false,
        includeUpscale: false,
        includeBackgroundRemoval: false,
      },
    },
  };

  const flow = await runHttpGenerationServiceFlow(submission, { fetchImpl: fakeFetch });
  if (!flow.ok) issues.push("HTTP queue refresh flow should complete successfully");
  if (flow.queueRun?.data?.resultCount !== 1) issues.push("queueRun should expose generated result count");
  if (!flow.workspaceReload?.data?.snapshot) issues.push("workspaceReload should include a refreshed snapshot");
  if (calls.length !== 5) issues.push("HTTP queue refresh flow should make five route calls when queue-run returns the refreshed workspace");
  const expectedMethods = ["POST", "POST", "POST", "POST", "POST"];
  expectedMethods.forEach((method, index) => {
    if (calls[index]?.method !== method) issues.push(`HTTP queue refresh call ${index + 1} should use ${method}`);
  });

  setRuntimeWorkspaceSnapshot(flow.workspaceReload.data.snapshot, "http");
  const runtimeSnapshot = getRuntimeWorkspaceSnapshot();
  if (!runtimeSnapshot.results.some((result) => result.id === "result-http-refresh-1")) {
    issues.push("runtime snapshot should include refreshed queue results");
  }
  const queue = createQueueViewModel(modeSpecs.poster);
  if (queue.summary.completed !== 1 || queue.summary.total !== 1) {
    issues.push("queue view model should read completed queue state from runtime snapshot");
  }
}

function envelope(data, traceId) {
  return {
    status: 200,
    async json() {
      return {
        ok: true,
        data,
        meta: { traceId, createdAt: "2026-05-21T00:00:00.000Z" },
      };
    },
  };
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Queue run refresh checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Queue run refresh checks passed.");
