import { readFileSync } from "node:fs";

const issues = [];

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required desktop live test control file`);
    return "";
  }
}

const stateSource = read("src/state.js");
const viewModelSource = read("src/data/live-gate-view-model.js");
const clientSource = read("src/manual-live-test-client.js");
const eventsSource = read("src/events.js");
const configSource = read("src/render/config-panel.js");
const taskChromeSource = read("src/render/task-chrome.js");
const stylesSource = read("styles.css");
const product = read("PRODUCT.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const decisions = read("DECISIONS.md");
const pkg = read("package.json");

for (const token of [
  "manualLiveTest",
  "phase",
  "persistedFileCount",
]) {
  if (!stateSource.includes(token)) issues.push(`state.js: missing manual live test state token ${token}`);
}

for (const token of [
  "getManualLiveTestViewModel",
  "getPreparedLiveQueueJobId",
  "Manual live test currently supports OpenAI-compatible and Google providers only.",
  "Create a queue job with the normal batch action first.",
]) {
  if (!viewModelSource.includes(token)) issues.push(`live-gate-view-model.js: missing ${token}`);
}

for (const token of [
  "runManualLiveTestForWorkbench",
  "createManualLiveTestPayload",
  "/live-test",
  "loadWorkspaceSnapshotForWorkbench",
]) {
  if (!clientSource.includes(token)) issues.push(`manual-live-test-client.js: missing ${token}`);
}

for (const [file, source, tokens] of [
  ["events.js", eventsSource, ["runManualLiveTestForWorkbench", "run-manual-live-test"]],
  ["config-panel.js", configSource, ["manual-live-test", "run-manual-live-test", "MANUAL LIVE TEST"]],
  ["task-chrome.js", taskChromeSource, ["manual-live-slim", "manual-live-context", "RESULT FILES"]],
  ["styles.css", stylesSource, ["manual-live-test", "manual-live-context", "manual-live-slim"]],
]) {
  for (const token of tokens) {
    if (!source.includes(token)) issues.push(`${file}: missing ${token}`);
  }
}

for (const [file, source] of [
  ["PRODUCT.md", product],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
]) {
  if (!source.includes("Desktop Live Test Control Surface")) {
    issues.push(`${file}: missing Desktop Live Test Control Surface update`);
  }
}

if (!decisions.includes("D078")) issues.push("DECISIONS.md: missing D078 desktop live test UI decision");
if (!pkg.includes("desktop-live-test-control:check")) {
  issues.push("package.json: missing desktop-live-test-control:check script");
}

for (const forbidden of ["api.openai.com", "OPENAI_API_KEY", "Authorization"]) {
  if ([clientSource, eventsSource, configSource, taskChromeSource].join("\n").includes(forbidden)) {
    issues.push(`desktop live test control must not expose provider credentials or direct provider calls (${forbidden})`);
  }
}

async function runRuntimeCheck() {
  const [{ state }, { modeSpecs }, manualClient] = await Promise.all([
    import("../src/state.js"),
    import("../src/data/modes.js"),
    import("../src/manual-live-test-client.js"),
  ]);

  let fetchCalls = 0;
  state.apiMode = "static";
  state.provider = "openai";
  state.manualLiveTest.phase = "idle";
  state.manualLiveTest.status = "not_started";

  const blockedEnvelope = await manualClient.runManualLiveTestForWorkbench({
    fetchImpl: async () => {
      fetchCalls += 1;
      return { json: async () => ({ ok: false }) };
    },
  });
  if (fetchCalls !== 0 || blockedEnvelope.ok !== false || state.manualLiveTest.status !== "blocked") {
    issues.push("manual live test client should block locally before HTTP mode is ready");
  }

  state.apiMode = "http";
  state.provider = "openai";
  state.activeMode = modeSpecs.poster.id;
  state.liveGate.enabled = true;
  state.liveGate.maxAcceptedCost = 99;
  state.liveGate.confirmations.liveRun = true;
  state.liveGate.confirmations.providerCost = true;
  state.liveGate.confirmations.externalProvider = true;
  state.liveGate.confirmations.resultStorage = true;
  state.liveGate.runtimeCredentialReady = true;
  state.liveGate.transportReady = true;
  state.liveGate.resultStorageReady = true;
  state.providerConnection.providerId = "openai";
  state.providerConnection.ok = true;
  state.providerConnection.status = "ok";
  state.manualLiveTest.phase = "idle";
  state.submission = {
    serviceFlow: {
      queuePlanCreate: {
        data: {
          queuePlan: {
            job: { id: "job-ui-check" },
          },
        },
      },
    },
  };

  let capturedPath = "";
  let capturedBody = null;
  const envelope = await manualClient.runManualLiveTestForWorkbench({
    fetchImpl: async (path, init) => {
      fetchCalls += 1;
      capturedPath = path;
      capturedBody = JSON.parse(init.body);
      return {
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            result: {
              status: "blocked",
              attempted: false,
              message: "Route reached for desktop control check.",
              traceId: capturedBody.traceId,
              resultCount: 0,
              persistedFileCount: 0,
            },
            connection: { status: "ok" },
          },
          meta: {
            traceId: capturedBody.traceId,
            createdAt: "2026-05-23T00:00:00.000Z",
          },
        }),
      };
    },
  });

  if (!envelope.ok || !capturedPath.endsWith("/api/workspaces/workspace-pizza-kitchen/queue-plans/job-ui-check/live-test")) {
    issues.push("manual live test client should POST to the local queue-plan live-test route");
  }
  if (capturedBody?.providerId !== "openai" || capturedBody?.enabled !== true) {
    issues.push("manual live test payload should explicitly target the selected enabled provider");
  }
  if (!capturedBody?.safety?.confirmations?.liveRun || !capturedBody?.safety?.confirmations?.resultStorage) {
    issues.push("manual live test payload should carry explicit live safety confirmations");
  }
  if (JSON.stringify(capturedBody).includes("apiKey") || JSON.stringify(capturedBody).includes("sk-")) {
    issues.push("manual live test payload must not include raw provider credentials");
  }
}

try {
  await runRuntimeCheck();
} catch (error) {
  issues.push(`desktop live test control runtime check failed: ${error instanceof Error ? error.message : String(error)}`);
}

if (issues.length > 0) {
  console.error("Desktop live test control checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Desktop live test control checks passed.");
