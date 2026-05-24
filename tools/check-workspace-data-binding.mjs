import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const issues = [];
const root = process.cwd();

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required workspace data binding file`);
    return "";
  }
}

const workspaceService = read("src/workspace-data-service.js");
const stateSource = read("src/state.js");
const bridge = read("src/react/StaticWorkbenchBridge.tsx");
const configPanel = read("src/render/config-panel.js");
const topbar = read("src/render/topbar.js");
const adapters = read("src/data/workspace-adapters.js");
const binding = read("src/form-binding.js");
const pkg = read("package.json");

for (const token of [
  "createHttpWorkspaceDataService",
  "loadWorkspaceSnapshotForWorkbench",
  "loadWorkspaceSnapshot",
  "fetchImpl",
  'method: "GET"',
]) {
  if (!workspaceService.includes(token)) issues.push(`workspace-data-service.js: missing ${token}`);
}

for (const token of [
  "workspaceSnapshot",
  "workspaceLoadStatus",
  "workspaceLoadError",
  "getRuntimeWorkspaceSnapshot",
  "setRuntimeWorkspaceSnapshot",
  "adaptRuntimeScheme",
]) {
  if (!stateSource.includes(token)) issues.push(`state.js: missing runtime workspace token ${token}`);
}

if (!bridge.includes("loadWorkspaceSnapshotForWorkbench")) {
  issues.push("StaticWorkbenchBridge.tsx: Next bridge must load workspace snapshot through HTTP data service");
}

for (const [fileName, source, token] of [
  ["config-panel.js", configPanel, "getWorkspaceProject"],
  ["topbar.js", topbar, "getWorkspaceSnapshotSummary"],
  ["workspace-adapters.js", adapters, "getRuntimeWorkspaceSnapshot"],
  ["form-binding.js", binding, "getRuntimeWorkspaceSnapshot"],
]) {
  if (!source.includes(token)) issues.push(`${fileName}: missing runtime data binding token ${token}`);
}

if (!pkg.includes("workspace-data:check")) {
  issues.push("package.json: missing workspace-data:check script");
}

for (const [fileName, source] of [
  ["form-binding.js", binding],
  ["events.js", read("src/events.js")],
  ["static-local-api-service.js", read("src/static-local-api-service.js")],
]) {
  if (source.includes("fetch(")) {
    issues.push(`${fileName}: fetch must stay outside form/event/static service binding`);
  }
}

async function runRuntimeCheck() {
  const { workspaceSnapshot } = await import(pathToFileURL(path.join(root, "src/data/workspace-snapshot.js")).href);
  const { state, getRuntimeWorkspaceSnapshot } = await import(pathToFileURL(path.join(root, "src/state.js")).href);
  const { loadWorkspaceSnapshotForWorkbench } = await import(pathToFileURL(path.join(root, "src/workspace-data-service.js")).href);
  const calls = [];
  const snapshot = JSON.parse(JSON.stringify(workspaceSnapshot));
  snapshot.metadata.revision = 12;
  snapshot.project.name = "HTTP Bound Project";

  const fakeFetch = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers });
    return {
      status: 200,
      async json() {
        return {
          ok: true,
          data: { snapshot },
          meta: {
            traceId: "trace-workspace-data-check",
            workspaceId: snapshot.metadata.workspaceId,
            revision: snapshot.metadata.revision,
            createdAt: "2026-05-21T00:00:00.000Z",
          },
        };
      },
    };
  };

  const envelope = await loadWorkspaceSnapshotForWorkbench({
    workspaceId: snapshot.metadata.workspaceId,
    fetchImpl: fakeFetch,
  });

  if (!envelope.ok) issues.push("workspace data service should return a successful envelope");
  if (calls.length !== 1) issues.push("workspace data service should make exactly one load call");
  if (!calls[0]?.url.endsWith(`/api/workspaces/${snapshot.metadata.workspaceId}`)) {
    issues.push("workspace data service should target the workspace GET route");
  }
  if (calls[0]?.method !== "GET") issues.push("workspace data service should use GET");
  if (state.workspaceLoadStatus !== "http") issues.push("runtime workspace state should be marked as http after load");
  if (getRuntimeWorkspaceSnapshot().project.name !== "HTTP Bound Project") {
    issues.push("runtime workspace snapshot should replace the default static snapshot");
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Workspace data binding checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Workspace data binding checks passed.");
