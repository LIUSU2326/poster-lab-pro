import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const issues = [];
const root = process.cwd();

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required asset UI route file`);
    return "";
  }
}

const assetClient = read("src/asset-library-client.js");
const configPanel = read("src/render/config-panel.js");
const events = read("src/events.js");
const stateSource = read("src/state.js");
const pkg = read("package.json");

for (const token of [
  "createHttpAssetLibraryClient",
  "simulateWorkbenchAssetUpload",
  "uploadWorkbenchAssetFile",
  "createUploadPlan",
  "commitAssetRecord",
  "listWorkspaceAssets",
  "loadWorkspaceSnapshotForWorkbench",
]) {
  if (!assetClient.includes(token)) issues.push(`asset-library-client.js: missing ${token}`);
}

for (const token of [
  "simulate-asset-upload",
  "data-asset-role",
  "asset-route-status",
]) {
  if (!configPanel.includes(token)) issues.push(`config-panel.js: missing asset UI token ${token}`);
}

if (!events.includes("simulateWorkbenchAssetUpload")) {
  issues.push("events.js: asset action must call simulateWorkbenchAssetUpload");
}

if (!stateSource.includes("assetOperation")) {
  issues.push("state.js: missing assetOperation state");
}

if (!pkg.includes("asset-ui:check")) {
  issues.push("package.json: missing asset-ui:check script");
}

for (const [fileName, source] of [
  ["events.js", events],
  ["config-panel.js", configPanel],
  ["state.js", stateSource],
]) {
  if (source.includes("fetch(")) {
    issues.push(`${fileName}: fetch must stay isolated to client/data services`);
  }
}

async function runRuntimeCheck() {
const { workspaceSnapshot } = await import(pathToFileURL(path.join(root, "src/data/workspace-snapshot.js")).href);
  const { setRuntimeWorkspaceSnapshot, state, getRuntimeWorkspaceSnapshot } = await import(pathToFileURL(path.join(root, "src/state.js")).href);
  const { simulateWorkbenchAssetUpload, uploadWorkbenchAssetFile } = await import(pathToFileURL(path.join(root, "src/asset-library-client.js")).href);
  const calls = [];
  const snapshot = JSON.parse(JSON.stringify(workspaceSnapshot));
  const committedAsset = {
    id: "asset-styleReference-check",
    projectId: snapshot.project.id,
    role: "styleReference",
    label: "Style Reference",
    sourceType: "uploaded",
    previewUrl: null,
    metadata: { source: "asset-ui-check" },
    usage: ["input", "reference"],
    storageKey: "projects/project-pizza-kitchen/assets/styleReference/asset-styleReference-check.png",
    mimeType: "image/png",
    byteSize: 512000,
    checksum: "sha256-check",
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z",
  };
  let currentPlannedAsset = committedAsset;
  let currentCommittedAsset = committedAsset;

  state.apiMode = "http";
  setRuntimeWorkspaceSnapshot(snapshot, "http");

  const fakeFetch = async (url, init) => {
    const parsedBody = typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({
      url,
      method: init.method,
      body: parsedBody,
      bodyType: init.body && typeof init.body !== "string" ? init.body.constructor?.name : null,
    });

    if (url.endsWith("/assets/upload-plan")) {
      const body = parsedBody || {};
      const extension = body.mimeType === "image/webp" ? "webp" : body.mimeType === "image/jpeg" ? "jpg" : "png";
      const assetId = body.clientAssetId || committedAsset.id;
      currentPlannedAsset = {
        ...committedAsset,
        id: assetId,
        projectId: body.projectId || snapshot.project.id,
        role: body.role || committedAsset.role,
        label: body.label || committedAsset.label,
        previewUrl: null,
        metadata: {
          originalFileName: body.fileName || committedAsset.metadata.originalFileName,
          uploadId: `upload-${assetId}`,
          plannedAt: "2026-05-21T00:00:00.000Z",
        },
        usage: body.usage || ["input", "reference"],
        storageKey: `projects/${body.projectId || snapshot.project.id}/assets/${body.role || committedAsset.role}/${assetId}.${extension}`,
        mimeType: body.mimeType || committedAsset.mimeType,
        byteSize: body.byteSize || committedAsset.byteSize,
        checksum: body.checksum || committedAsset.checksum,
      };
      return {
        status: 200,
        async json() {
          return {
            ok: true,
            data: {
              uploadPlan: {
                uploadId: `upload-${currentPlannedAsset.id}`,
                assetId: currentPlannedAsset.id,
                workspaceId: snapshot.metadata.workspaceId,
                projectId: currentPlannedAsset.projectId,
                role: currentPlannedAsset.role,
                method: "PUT",
                uploadUrl: "upload://check",
                storageKey: currentPlannedAsset.storageKey,
                maxBytes: 26214400,
                acceptedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
                expiresAt: "2026-05-21T00:10:00.000Z",
              },
              assetDraft: currentPlannedAsset,
            },
            meta: { traceId: "trace-upload", workspaceId: snapshot.metadata.workspaceId, createdAt: "2026-05-21T00:00:00.000Z" },
          };
        },
      };
    }

    if (url.endsWith("/assets/upload-binary")) {
      return {
        status: 200,
        async json() {
          return {
            ok: true,
            data: {
              assetId: currentPlannedAsset.id,
              storageKey: currentPlannedAsset.storageKey,
              publicUrl: `http://localhost:3001/uploads/workspaces/${snapshot.metadata.workspaceId}/${currentPlannedAsset.storageKey}`,
              mimeType: currentPlannedAsset.mimeType,
              byteSize: currentPlannedAsset.byteSize,
            },
            meta: { traceId: "trace-binary", workspaceId: snapshot.metadata.workspaceId, createdAt: "2026-05-21T00:00:00.000Z" },
          };
        },
      };
    }

    if (url.includes("/assets?")) {
      return {
        status: 200,
        async json() {
          return {
            ok: true,
            data: { assets: [currentCommittedAsset] },
            meta: { traceId: "trace-list", workspaceId: snapshot.metadata.workspaceId, createdAt: "2026-05-21T00:00:00.000Z" },
          };
        },
      };
    }

    if (url.endsWith("/assets")) {
      currentCommittedAsset = parsedBody?.asset || currentPlannedAsset;
      return {
        status: 200,
        async json() {
          return {
            ok: true,
            data: { asset: currentCommittedAsset, summary: { workspaceId: snapshot.metadata.workspaceId, projectId: snapshot.project.id, projectName: snapshot.project.name, activeMode: "poster", revision: 2, assetCount: 3, schemeCount: 5, resultCount: 1, runningQueueCount: 0, updatedAt: "2026-05-21T00:00:00.000Z" } },
            meta: { traceId: "trace-commit", workspaceId: snapshot.metadata.workspaceId, revision: 2, createdAt: "2026-05-21T00:00:00.000Z" },
          };
        },
      };
    }

    if (url.endsWith(`/api/workspaces/${snapshot.metadata.workspaceId}`)) {
      return {
        status: 200,
        async json() {
          const reloadedSnapshot = {
            ...snapshot,
            assets: [...snapshot.assets, currentCommittedAsset],
            metadata: {
              ...snapshot.metadata,
              revision: snapshot.metadata.revision + 1,
              updatedAt: "2026-05-21T00:00:00.000Z",
            },
          };
          return {
            ok: true,
            data: { snapshot: reloadedSnapshot },
            meta: { traceId: "trace-reload", workspaceId: snapshot.metadata.workspaceId, revision: 2, createdAt: "2026-05-21T00:00:00.000Z" },
          };
        },
      };
    }

    throw new Error(`Unexpected URL ${url}`);
  };

  const result = await simulateWorkbenchAssetUpload(
    { role: "styleReference", label: "Style Reference" },
    { fetchImpl: fakeFetch, now: () => "2026-05-21T00:00:00.000Z" },
  );

  if (!result.ok || result.transport !== "http") issues.push("asset UI flow should complete in HTTP mode");
  const expected = ["/assets/upload-plan", "/assets", "/assets?", `/api/workspaces/${snapshot.metadata.workspaceId}`];
  expected.forEach((suffix, index) => {
    if (!calls[index]?.url.includes(suffix)) issues.push(`asset UI call ${index + 1} should include ${suffix}`);
  });
  if (calls[0]?.method !== "POST" || calls[1]?.method !== "POST" || calls[2]?.method !== "GET" || calls[3]?.method !== "GET") {
    issues.push("asset UI route flow should use POST, POST, GET, GET");
  }
  if (!getRuntimeWorkspaceSnapshot().assets.some((asset) => asset.id === currentCommittedAsset.id)) {
    issues.push("asset UI flow should refresh runtime snapshot with committed asset");
  }
  if (state.assetOperation?.status !== "ready") {
    issues.push("assetOperation should be ready after successful asset route flow");
  }

  state.apiMode = "http";
  setRuntimeWorkspaceSnapshot(snapshot, "http");
  calls.length = 0;

  const fileResult = await uploadWorkbenchAssetFile(
    {
      role: "gameCharacter",
      label: "Hero Chef",
      file: {
        name: "hero-chef.webp",
        type: "image/webp",
        size: 768000,
        lastModified: 1779408000000,
      },
      previewUrl: "blob:http://localhost:3001/hero-chef",
    },
    { fetchImpl: fakeFetch, now: () => "2026-05-21T00:00:00.000Z" },
  );

  if (!fileResult.ok) issues.push("real file metadata intake should complete through the asset route loop");
  if (calls[0]?.body?.fileName !== "hero-chef.webp") issues.push("file metadata intake should send the real file name");
  if (calls[0]?.body?.mimeType !== "image/webp") issues.push("file metadata intake should send the real mime type");
  if (calls[0]?.body?.byteSize !== 768000) issues.push("file metadata intake should send the real byte size");
  const fileExpected = ["/assets/upload-plan", "/assets/upload-binary", "/assets", "/assets?", `/api/workspaces/${snapshot.metadata.workspaceId}`];
  fileExpected.forEach((suffix, index) => {
    if (!calls[index]?.url.includes(suffix)) issues.push(`file asset UI call ${index + 1} should include ${suffix}`);
  });
  if (calls[1]?.bodyType !== "FormData") issues.push("file asset binary upload should send FormData");
  if (!calls[2]?.body?.asset?.previewUrl?.includes("/uploads/workspaces/")) {
    issues.push("file asset commit should use the local public upload URL");
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Asset UI route loop checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Asset UI route loop checks passed.");
