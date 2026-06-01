import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const issues = [];
const root = process.cwd();

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required HTTP generation service file`);
    return "";
  }
}

const httpService = read("src/http-generation-service.js");
const binding = read("src/form-binding.js");
const bridge = read("src/react/StaticWorkbenchBridge.tsx");
const stateSource = read("src/state.js");
const taskChrome = read("src/render/task-chrome.js");
const pkg = read("package.json");

for (const token of [
  "createHttpGenerationService",
  "runHttpGenerationServiceFlow",
  "saveWorkspaceSnapshot",
  "createPromptPackage",
  "mapProviderRequest",
  "createQueuePlan",
  "runQueuePlan",
  "liveExecution",
  "loadWorkspaceSnapshot",
  "fetchImpl",
]) {
  if (!httpService.includes(token)) issues.push(`http-generation-service.js: missing ${token}`);
}

if (!binding.includes("runHttpGenerationServiceFlow")) {
  issues.push("form-binding.js: must import runHttpGenerationServiceFlow");
}

if (!binding.includes('state.apiMode === "http"')) {
  issues.push("form-binding.js: must select HTTP mode from state.apiMode");
}

if (!bridge.includes("state.apiMode") || !bridge.includes('"http"')) {
  issues.push("StaticWorkbenchBridge.tsx: Next bridge must opt into HTTP mode");
}

if (!stateSource.includes("apiMode") || !stateSource.includes('api === "http"')) {
  issues.push("state.js: missing apiMode state and URL override");
}

if (!taskChrome.includes("compact-only") || taskChrome.includes("submission.transport")) {
  issues.push("task-chrome.js: task chrome should stay compact and hide internal submission transport details");
}

if (!pkg.includes("http-client:check")) {
  issues.push("package.json: missing http-client:check script");
}

for (const [fileName, source] of [
  ["form-binding.js", binding],
  ["events.js", read("src/events.js")],
  ["static-local-api-service.js", read("src/static-local-api-service.js")],
]) {
  if (source.includes("fetch(")) {
    issues.push(`${fileName}: fetch must stay isolated to http-generation-service.js`);
  }
}

async function runRuntimeCheck() {
  const { runHttpGenerationServiceFlow } = await import(pathToFileURL(path.join(root, "src/http-generation-service.js")).href);
  const { workspaceSnapshot } = await import(pathToFileURL(path.join(root, "src/data/workspace-snapshot.js")).href);
  const calls = [];
  const snapshot = JSON.parse(JSON.stringify(workspaceSnapshot));

  const fakeFetch = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method, body });
    if (url.endsWith("/snapshot")) {
      return {
        status: 200,
        async json() {
          return { ok: true, data: { summary: { workspaceId: snapshot.metadata.workspaceId } }, meta: { traceId: "t1", createdAt: "2026-05-21T00:00:00.000Z" } };
        },
      };
    }
    if (url.endsWith("/prompts")) {
      return {
        status: 200,
        async json() {
          return {
            ok: true,
            data: {
              promptPackage: {
                id: "prompt-http-check",
                target: "image",
                projectId: snapshot.project.id,
                mode: "poster",
                schemeId: "scheme-poster-01",
                assets: [],
                platform: { platformPreset: "tiktok", aspectRatio: "9:16", width: 1080, height: 1920 },
                finalPrompt: "HTTP check prompt",
              },
            },
            meta: { traceId: "t2", createdAt: "2026-05-21T00:00:00.000Z" },
          };
        },
      };
    }
    if (url.endsWith("/provider-requests")) {
      return {
        status: 200,
        async json() {
          return { ok: true, data: { mappedRequest: { kind: "imageGeneration" } }, meta: { traceId: "t3", createdAt: "2026-05-21T00:00:00.000Z" } };
        },
      };
    }
    if (url.endsWith("/queue-plans")) {
      return {
        status: 200,
        async json() {
          return {
            ok: true,
            data: {
              queuePlan: { job: { id: "job-http-check" }, tasks: [], events: [] },
              summary: { jobId: "job-http-check", total: 4, estimatedCost: 0.2 },
            },
            meta: { traceId: "t4", createdAt: "2026-05-21T00:00:00.000Z" },
          };
        },
      };
    }
    if (url.endsWith("/run")) {
      return {
        status: 200,
        async json() {
          return {
            ok: true,
            data: {
              workspace: { ...snapshot, queuePlans: [{ job: { id: "job-http-check" }, tasks: [], events: [] }] },
              summary: { jobId: "job-http-check", total: 4, completed: 4, failed: 0, progress: 1, estimatedCost: 0.2, elapsedMs: 1200 },
              resultCount: 4,
              archiveRowCount: 4,
            },
            meta: { traceId: "t5", createdAt: "2026-05-21T00:00:00.000Z" },
          };
        },
      };
    }
    if (url.endsWith(`/api/workspaces/${snapshot.metadata.workspaceId}`)) {
      return {
        status: 200,
        async json() {
          return { ok: true, data: { snapshot }, meta: { traceId: "t6", createdAt: "2026-05-21T00:00:00.000Z" } };
        },
      };
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  const submission = {
    status: "submitting",
    traceId: "trace-http-check",
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
        includeUpscale: true,
        includeBackgroundRemoval: true,
      },
    },
  };

  const liveExecution = {
    enabled: true,
    estimatedCost: 0.2,
    maxAcceptedCost: 1,
    confirmations: {
      liveRun: true,
      providerCost: true,
      externalProvider: true,
      resultStorage: true,
    },
  };
  const flow = await runHttpGenerationServiceFlow(submission, { fetchImpl: fakeFetch, liveExecution });
  if (!flow.ok || flow.transport !== "http") issues.push("HTTP flow should return ok with transport=http");
  const expectedOrder = ["/snapshot", "/prompts", "/provider-requests", "/queue-plans", "/run"];
  expectedOrder.forEach((suffix, index) => {
    if (!calls[index]?.url.endsWith(suffix)) issues.push(`HTTP call ${index + 1} should end with ${suffix}`);
  });
  if (calls.length !== 5) issues.push("HTTP generation service should use queue-run workspace payload without an extra final reload when available");
  if (calls.some((call) => call.method !== "POST")) issues.push("HTTP generation service should use POST for the normal generation flow");
  if (JSON.stringify(calls.find((call) => call.url.endsWith("/run"))?.body?.liveExecution) !== JSON.stringify(liveExecution)) {
    issues.push("HTTP flow should forward live execution gate payload into queue-run requests");
  }
  if (flow.queueRun?.data?.resultCount !== 4) issues.push("HTTP flow should expose queue run result count");
  if (!flow.workspaceReload?.ok || flow.workspaceReload.data?.snapshot?.queuePlans?.[0]?.job?.id !== "job-http-check") {
    issues.push("HTTP flow should refresh the frontend workspace from the queue-run response when available");
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("HTTP generation service checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("HTTP generation service checks passed.");
