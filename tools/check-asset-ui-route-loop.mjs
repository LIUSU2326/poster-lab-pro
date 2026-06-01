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
  "referenceAnalyses",
  "referenceAnalysis",
]) {
  if (!assetClient.includes(token)) issues.push(`asset-library-client.js: missing ${token}`);
}

for (const token of [
  "simulate-asset-upload",
  "data-asset-role",
  "asset-route-status",
  "renderAssetOperation()",
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
  const {
    removeWorkbenchAssetsByRoleLabel,
    simulateWorkbenchAssetUpload,
    uploadWorkbenchAssetFile,
  } = await import(pathToFileURL(path.join(root, "src/asset-library-client.js")).href);
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
  let serverSnapshot = snapshot;

  state.apiMode = "http";
  setRuntimeWorkspaceSnapshot(serverSnapshot, "http");

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
        projectId: body.projectId || serverSnapshot.project.id,
        role: body.role || committedAsset.role,
        label: body.label || committedAsset.label,
        previewUrl: null,
        metadata: {
          originalFileName: body.fileName || committedAsset.metadata.originalFileName,
          uploadId: `upload-${assetId}`,
          plannedAt: "2026-05-21T00:00:00.000Z",
        },
        usage: body.usage || ["input", "reference"],
        storageKey: `projects/${body.projectId || serverSnapshot.project.id}/assets/${body.role || committedAsset.role}/${assetId}.${extension}`,
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
                workspaceId: serverSnapshot.metadata.workspaceId,
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
            meta: { traceId: "trace-upload", workspaceId: serverSnapshot.metadata.workspaceId, createdAt: "2026-05-21T00:00:00.000Z" },
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
              publicUrl: `http://localhost:3001/uploads/workspaces/${serverSnapshot.metadata.workspaceId}/${currentPlannedAsset.storageKey}`,
              mimeType: currentPlannedAsset.mimeType,
              byteSize: currentPlannedAsset.byteSize,
            },
            meta: { traceId: "trace-binary", workspaceId: serverSnapshot.metadata.workspaceId, createdAt: "2026-05-21T00:00:00.000Z" },
          };
        },
      };
    }

    if (url.includes("/assets?")) {
      const requestUrl = new URL(url, "http://localhost");
      const role = requestUrl.searchParams.get("role");
      const usage = requestUrl.searchParams.get("usage");
      const assets = serverSnapshot.assets.filter((asset) => {
        if (role && asset.role !== role) return false;
        if (usage && !(asset.usage || []).includes(usage)) return false;
        return true;
      });
      return {
        status: 200,
        async json() {
          return {
            ok: true,
            data: { assets },
            meta: { traceId: "trace-list", workspaceId: serverSnapshot.metadata.workspaceId, createdAt: "2026-05-21T00:00:00.000Z" },
          };
        },
      };
    }

    if (url.endsWith("/assets")) {
      currentCommittedAsset = parsedBody?.asset || currentPlannedAsset;
      const replaceExisting = Boolean(parsedBody?.replaceExisting);
      const nextAssets = serverSnapshot.assets.filter((asset) => (
        replaceExisting
          ? asset.id !== currentCommittedAsset.id
            && !(asset.role === currentCommittedAsset.role && asset.label === currentCommittedAsset.label)
          : asset.id !== currentCommittedAsset.id
      ));
      serverSnapshot = {
        ...serverSnapshot,
        assets: [...nextAssets, currentCommittedAsset],
        metadata: {
          ...serverSnapshot.metadata,
          revision: serverSnapshot.metadata.revision + 1,
          updatedAt: "2026-05-21T00:00:00.000Z",
        },
      };
      return {
        status: 200,
        async json() {
          return {
            ok: true,
            data: { asset: currentCommittedAsset, summary: { workspaceId: serverSnapshot.metadata.workspaceId, projectId: serverSnapshot.project.id, projectName: serverSnapshot.project.name, activeMode: serverSnapshot.activeMode, revision: serverSnapshot.metadata.revision, assetCount: serverSnapshot.assets.length, schemeCount: serverSnapshot.schemes.length, resultCount: serverSnapshot.results.length, runningQueueCount: 0, updatedAt: serverSnapshot.metadata.updatedAt } },
            meta: { traceId: "trace-commit", workspaceId: serverSnapshot.metadata.workspaceId, revision: serverSnapshot.metadata.revision, createdAt: "2026-05-21T00:00:00.000Z" },
          };
        },
      };
    }

    if (url.endsWith(`/api/workspaces/${serverSnapshot.metadata.workspaceId}`)) {
      return {
        status: 200,
        async json() {
          return {
            ok: true,
            data: { snapshot: serverSnapshot },
            meta: { traceId: "trace-reload", workspaceId: serverSnapshot.metadata.workspaceId, revision: serverSnapshot.metadata.revision, createdAt: "2026-05-21T00:00:00.000Z" },
          };
        },
      };
    }

    if (url.endsWith(`/api/workspaces/${serverSnapshot.metadata.workspaceId}/snapshot`)) {
      serverSnapshot = parsedBody?.snapshot || serverSnapshot;
      return {
        status: 200,
        async json() {
          return {
            ok: true,
            data: {
              summary: {
                workspaceId: serverSnapshot.metadata.workspaceId,
                projectId: serverSnapshot.project.id,
                projectName: serverSnapshot.project.name,
                activeMode: serverSnapshot.activeMode,
                revision: serverSnapshot.metadata.revision,
                assetCount: serverSnapshot.assets.length,
                schemeCount: serverSnapshot.schemes.length,
                resultCount: serverSnapshot.results.length,
                runningQueueCount: 0,
                updatedAt: serverSnapshot.metadata.updatedAt,
              },
            },
            meta: { traceId: "trace-save-snapshot", workspaceId: serverSnapshot.metadata.workspaceId, revision: serverSnapshot.metadata.revision, createdAt: "2026-05-21T00:00:00.000Z" },
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
  const expected = ["/assets/upload-plan", "/assets", "/assets?", `/api/workspaces/${snapshot.metadata.workspaceId}`, `/api/workspaces/${snapshot.metadata.workspaceId}/snapshot`];
  expected.forEach((suffix, index) => {
    if (!calls[index]?.url.includes(suffix)) issues.push(`asset UI call ${index + 1} should include ${suffix}`);
  });
  if (calls[0]?.method !== "POST" || calls[1]?.method !== "POST" || calls[2]?.method !== "GET" || calls[3]?.method !== "GET" || calls[4]?.method !== "POST") {
    issues.push("asset UI route flow should use POST, POST, GET, GET, POST");
  }
  if (!getRuntimeWorkspaceSnapshot().assets.some((asset) => asset.id === currentCommittedAsset.id)) {
    issues.push("asset UI flow should refresh runtime snapshot with committed asset");
  }
  if (state.assetOperation?.status !== "ready") {
    issues.push("assetOperation should be ready after successful asset route flow");
  }
  if (calls[1]?.body?.replaceExisting !== true) {
    issues.push("asset commit should replace an existing slot asset by default");
  }

  state.apiMode = "http";
  serverSnapshot = snapshot;
  setRuntimeWorkspaceSnapshot(serverSnapshot, "http");
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
  const fileExpected = ["/assets/upload-plan", "/assets/upload-binary", "/assets", "/assets?", `/api/workspaces/${snapshot.metadata.workspaceId}`, `/api/workspaces/${snapshot.metadata.workspaceId}/snapshot`];
  fileExpected.forEach((suffix, index) => {
    if (!calls[index]?.url.includes(suffix)) issues.push(`file asset UI call ${index + 1} should include ${suffix}`);
  });
  if (calls[1]?.bodyType !== "FormData") issues.push("file asset binary upload should send FormData");
  if (!calls[2]?.body?.asset?.previewUrl?.includes("/uploads/workspaces/")) {
    issues.push("file asset commit should use the local public upload URL");
  }
  if (calls[2]?.body?.replaceExisting !== true) {
    issues.push("file asset commit should replace an existing slot asset by default");
  }

  const oldLogo = {
    ...committedAsset,
    id: "asset-old-logo",
    role: "gameLogo",
    label: "游戏 Logo",
    previewUrl: "http://localhost:3001/uploads/workspaces/check/old-logo.png",
    storageKey: "projects/project-pizza-kitchen/assets/gameLogo/asset-old-logo.png",
    checksum: "sha256-old-logo",
  };
  const oldBoss = {
    ...committedAsset,
    id: "asset-old-boss",
    role: "prop",
    label: "Boss",
    previewUrl: "http://localhost:3001/uploads/workspaces/check/old-boss.png",
    storageKey: "projects/project-pizza-kitchen/assets/prop/asset-old-boss.png",
    checksum: "sha256-old-boss",
  };

  serverSnapshot = {
    ...snapshot,
    assets: [...snapshot.assets, oldLogo, oldBoss],
    referenceAnalyses: [
      ...(snapshot.referenceAnalyses || []),
      {
        key: "gameLogo:style",
        kind: "style",
        role: "gameLogo",
        label: "游戏 Logo",
        providerId: "google",
        model: "gemini-check",
        text: "Old logo style analysis should be removed with the logo asset.",
        createdAt: "2026-05-21T00:00:00.000Z",
        updatedAt: "2026-05-21T00:00:00.000Z",
      },
      {
        key: "prop:composition",
        kind: "composition",
        role: "prop",
        label: "Boss",
        providerId: "google",
        model: "gemini-check",
        text: "Old boss composition analysis should be removed with the boss asset.",
        createdAt: "2026-05-21T00:00:00.000Z",
        updatedAt: "2026-05-21T00:00:00.000Z",
      },
    ],
    metadata: {
      ...snapshot.metadata,
      revision: snapshot.metadata.revision + 1,
      updatedAt: "2026-05-21T00:00:00.000Z",
    },
  };
  setRuntimeWorkspaceSnapshot(serverSnapshot, "http");
  state.referenceUploadDataUrls = {
    "gameLogo:style": "data:image/png;base64,OLDLOGO",
    "prop:composition": "data:image/png;base64,OLDBOSS",
    "styleReference:style": "data:image/png;base64,KEEP",
  };
  state.referenceAnalysis = {
    "gameLogo:style": { status: "ready", role: "gameLogo", label: "游戏 Logo" },
    "prop:composition": { status: "ready", role: "prop", label: "Boss" },
    "styleReference:style": { status: "ready", role: "styleReference", label: "Keep" },
  };
  calls.length = 0;

  const logoDelete = await removeWorkbenchAssetsByRoleLabel(
    "gameLogo",
    "游戏 Logo",
    { fetchImpl: fakeFetch, now: () => "2026-05-21T00:00:00.000Z" },
  );
  const bossDelete = await removeWorkbenchAssetsByRoleLabel(
    "prop",
    "Boss",
    { fetchImpl: fakeFetch, now: () => "2026-05-21T00:00:00.000Z" },
  );

  if (!logoDelete.ok || !bossDelete.ok) {
    issues.push("asset deletion should persist through the workspace snapshot route");
  }
  if (serverSnapshot.assets.some((asset) => asset.id === oldLogo.id || asset.id === oldBoss.id)) {
    issues.push("deleted logo and boss assets should be removed from the persisted workspace snapshot");
  }
  if ((serverSnapshot.referenceAnalyses || []).some((analysis) => analysis.key === "gameLogo:style" || analysis.key === "prop:composition")) {
    issues.push("deleted logo and boss reference analyses should be removed from the persisted workspace snapshot");
  }
  if (state.referenceUploadDataUrls["gameLogo:style"] || state.referenceUploadDataUrls["prop:composition"]) {
    issues.push("deleted logo and boss upload data URLs should be cleared from local state");
  }
  if (state.referenceAnalysis["gameLogo:style"] || state.referenceAnalysis["prop:composition"]) {
    issues.push("deleted logo and boss reference analysis state should be cleared locally");
  }
  if (!state.referenceUploadDataUrls["styleReference:style"] || !state.referenceAnalysis["styleReference:style"]) {
    issues.push("unrelated reference analysis state should be preserved when deleting other asset roles");
  }
  const deleteSaveCalls = calls.filter((call) => call.url.endsWith(`/api/workspaces/${snapshot.metadata.workspaceId}/snapshot`));
  if (deleteSaveCalls.length < 2) {
    issues.push("asset deletion should save the workspace snapshot before the next upload reloads it");
  }

  calls.length = 0;
  const newBossResult = await uploadWorkbenchAssetFile(
    {
      role: "prop",
      label: "Boss",
      file: {
        name: "new-boss.png",
        type: "image/png",
        size: 1024000,
        lastModified: 1779408000000,
      },
      previewUrl: "blob:http://localhost:3001/new-boss",
    },
    { fetchImpl: fakeFetch, now: () => "2026-05-21T00:00:00.000Z" },
  );

  if (!newBossResult.ok) {
    issues.push("upload after deleting old assets should complete successfully");
  }
  if (getRuntimeWorkspaceSnapshot().assets.some((asset) => asset.id === oldLogo.id || asset.id === oldBoss.id)) {
    issues.push("deleted logo and boss assets should not reappear after a later asset upload reloads the snapshot");
  }
  if ((getRuntimeWorkspaceSnapshot().referenceAnalyses || []).some((analysis) => analysis.key === "gameLogo:style" || analysis.key === "prop:composition")) {
    issues.push("deleted logo and boss reference analyses should not reappear after a later asset upload reloads the snapshot");
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Asset UI route loop checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Asset UI route loop checks passed.");
