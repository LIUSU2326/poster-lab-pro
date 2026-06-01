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
const schemaModels = read("src/schema/models.js");
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
if (!schemaModels.includes("subjectReference|gameCharacter|prop|gameLogo")) {
  issues.push("models.js: icon mode should accept subject, character, prop, or logo as primary icon reference");
}
if (!schemaModels.includes('collab: ["gameCharacter", "collabCharacter", "gameLogo", "brandLogo?", "background?"]')) {
  issues.push("models.js: collab mode should keep partner brand logo optional while requiring both character identities and game logo");
}
if (!schemaModels.includes('announcement: ["gameCharacter?", "background?", "gameLogo?", "brandLogo?", "uiScreenshot?"]')) {
  issues.push("models.js: announcement mode should treat uploaded visuals as optional copy-safe references");
}
if (!adapters.includes('icon: ["subjectReference", "gameCharacter", "prop", "gameLogo"')) {
  issues.push("workspace-adapters.js: icon asset ordering should prioritize all primary icon reference roles");
}
if (!adapters.includes('announcement: ["gameCharacter", "background", "gameLogo", "brandLogo", "uiScreenshot"]')) {
  issues.push("workspace-adapters.js: announcement asset ordering should expose optional copy-safe references");
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
  snapshot.assets.push(
    {
      id: "asset-old-duplicate-hero",
      projectId: snapshot.project.id,
      role: "gameCharacter",
      label: "Duplicate Hero",
      sourceType: "uploaded",
      previewUrl: "http://localhost:3000/uploads/workspaces/check/old-duplicate-hero.png",
      metadata: { originalFileName: "old-duplicate-hero.png" },
      usage: ["input", "reference"],
      storageKey: "projects/project-pizza-kitchen/assets/gameCharacter/asset-old-duplicate-hero.png",
      mimeType: "image/png",
      byteSize: 1200,
      checksum: "sha256-old-duplicate-hero",
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z",
    },
    {
      id: "asset-new-duplicate-hero",
      projectId: snapshot.project.id,
      role: "gameCharacter",
      label: "Duplicate Hero",
      sourceType: "uploaded",
      previewUrl: "http://localhost:3000/uploads/workspaces/check/new-duplicate-hero.png",
      metadata: { originalFileName: "new-duplicate-hero.png" },
      usage: ["input", "reference"],
      storageKey: "projects/project-pizza-kitchen/assets/gameCharacter/asset-new-duplicate-hero.png",
      mimeType: "image/png",
      byteSize: 1400,
      checksum: "sha256-new-duplicate-hero",
      createdAt: "2026-05-21T00:00:00.000Z",
      updatedAt: "2026-05-21T00:00:00.000Z",
    },
  );

  const fakeFetch = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method, headers: init.headers, body });
    if (init.method === "POST" && url.endsWith("/snapshot")) {
      return {
        status: 200,
        async json() {
          return {
            ok: true,
            data: { summary: { workspaceId: snapshot.metadata.workspaceId } },
            meta: {
              traceId: "trace-workspace-data-save-check",
              workspaceId: snapshot.metadata.workspaceId,
              revision: body?.snapshot?.metadata?.revision || snapshot.metadata.revision + 1,
              createdAt: "2026-05-21T00:00:00.000Z",
            },
          };
        },
      };
    }
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
  if (calls.length !== 2) issues.push("workspace data service should load once and persist normalized duplicate-asset cleanup once");
  if (!calls[0]?.url.endsWith(`/api/workspaces/${snapshot.metadata.workspaceId}`)) {
    issues.push("workspace data service should target the workspace GET route");
  }
  if (calls[0]?.method !== "GET") issues.push("workspace data service should use GET");
  if (!calls[1]?.url.endsWith(`/api/workspaces/${snapshot.metadata.workspaceId}/snapshot`)) {
    issues.push("workspace data service should persist the normalized workspace snapshot");
  }
  if (calls[1]?.method !== "POST") issues.push("workspace data service should POST the normalized workspace state");
  if ((calls[1]?.body?.snapshot?.schemes || []).length !== (snapshot.schemes || []).length) {
    issues.push("workspace data service should preserve schemes during workspace normalization");
  }
  if ((calls[1]?.body?.snapshot?.results || []).length !== (snapshot.results || []).length) {
    issues.push("workspace data service should preserve results during workspace normalization");
  }
  const cleanedAssets = calls[1]?.body?.snapshot?.assets || [];
  if (cleanedAssets.some((asset) => asset.id === "asset-old-duplicate-hero")) {
    issues.push("workspace data service should drop stale same role+label asset records during workspace normalization");
  }
  if (!cleanedAssets.some((asset) => asset.id === "asset-new-duplicate-hero")) {
    issues.push("workspace data service should keep the latest same role+label asset record during workspace normalization");
  }
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
