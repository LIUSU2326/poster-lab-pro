import { resetWorkspaceSwitchUiState, state, setRuntimeWorkspaceSnapshot } from './state.js';

function encodeSegment(value) {
  return encodeURIComponent(String(value));
}

async function readEnvelope(response) {
  try {
    return await response.json();
  } catch {
    return {
      ok: false,
      error: {
        code: "bad_request",
        message: "Route returned an unreadable JSON response.",
        fieldErrors: {},
        details: { status: response.status },
      },
      meta: {
        traceId: `trace-workspace-client-${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
      },
    };
  }
}

async function getJson(path, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Workspace data service requires a fetch implementation.");
  }

  const response = await fetchImpl(path, {
    method: "GET",
    headers: {
      accept: "application/json",
    },
  });

  return readEnvelope(response);
}

async function postJson(path, payload, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Workspace data service requires a fetch implementation.");
  }

  const response = await fetchImpl(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readEnvelope(response);
}

async function patchJson(path, payload, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Workspace data service requires a fetch implementation.");
  }

  const response = await fetchImpl(path, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readEnvelope(response);
}

async function deleteJson(path, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Workspace data service requires a fetch implementation.");
  }

  const response = await fetchImpl(path, {
    method: "DELETE",
    headers: {
      accept: "application/json",
    },
  });

  return readEnvelope(response);
}

function nowIso() {
  return new Date().toISOString();
}

const legacyProjectNamePlaceholder = "New Game Campaign";
const legacyProjectDescriptionPlaceholder = "A game campaign project. Replace this with the actual game's genre, core loop, characters, enemies, setting, and marketing hook before generating schemes.";

function clearLegacyProjectPlaceholder(value) {
  const text = String(value ?? "");
  return text === legacyProjectNamePlaceholder || text === legacyProjectDescriptionPlaceholder ? "" : text;
}

function normalizeBlankProjectPlaceholders(snapshot) {
  const project = {
    ...snapshot.project,
    name: clearLegacyProjectPlaceholder(snapshot.project?.name),
    description: clearLegacyProjectPlaceholder(snapshot.project?.description),
  };
  const modeStates = (snapshot.modeStates || []).map((modeState) => ({
    ...modeState,
    projectBrief: {
      ...(modeState.projectBrief || {}),
      projectName: clearLegacyProjectPlaceholder(modeState.projectBrief?.projectName),
      gameDescription: clearLegacyProjectPlaceholder(modeState.projectBrief?.gameDescription),
    },
  }));

  return { project, modeStates };
}

function dateValue(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function assetDedupeKey(asset) {
  const fileFingerprint = asset.checksum || asset.metadata?.originalFileName || "";
  const byteSize = asset.byteSize ?? "";
  if (!fileFingerprint && byteSize === "") return `id|${asset.id}`;
  return [
    asset.role,
    String(asset.label || "").trim(),
    fileFingerprint,
    asset.mimeType || "",
    byteSize,
  ].join("|");
}

function isExampleAsset(asset) {
  const url = asset?.previewUrl || "";
  try {
    return new URL(url).hostname === "example.com";
  } catch {
    return /example\.com/i.test(url);
  }
}

function dedupeFreshSessionAssets(assets = []) {
  const realRoles = new Set(assets.filter((asset) => !isExampleAsset(asset)).map((asset) => asset.role));
  const candidates = assets.filter((asset) => !isExampleAsset(asset) || !realRoles.has(asset.role));
  const byKey = new Map();
  for (const asset of candidates) {
    const key = assetDedupeKey(asset);
    const existing = byKey.get(key);
    if (!existing || dateValue(asset.updatedAt || asset.createdAt) >= dateValue(existing.updatedAt || existing.createdAt)) {
      byKey.set(key, asset);
    }
  }
  return [...byKey.values()].sort((left, right) => dateValue(left.createdAt) - dateValue(right.createdAt));
}

function normalizeLoadedWorkspaceState(snapshot) {
  const updatedAt = nowIso();
  const sloganDefaultMigration = "2026-06-05-slogan-off-default";
  const sloganDefaultMigrationCutoff = Date.parse("2026-06-05T00:00:00.000Z");
  const snapshotUpdatedAt = Date.parse(snapshot.metadata?.updatedAt || "");
  const isBeforeSloganDefaultCutoff = !Number.isFinite(snapshotUpdatedAt) || snapshotUpdatedAt < sloganDefaultMigrationCutoff;
  const needsSloganDefaultMigration =
    snapshot.metadata?.sloganDefaultMigration !== sloganDefaultMigration && isBeforeSloganDefaultCutoff;
  const metadata = needsSloganDefaultMigration
    ? { ...snapshot.metadata, sloganDefaultMigration }
    : snapshot.metadata;
  const assets = dedupeFreshSessionAssets(snapshot.assets || []);
  const blankProjectPlaceholders = normalizeBlankProjectPlaceholders(snapshot);
  const assetIds = new Set(assets.map((asset) => asset.id));
  const gameLogoIds = assets.filter((asset) => asset.role === "gameLogo").map((asset) => asset.id);
  const schemeIds = new Set((snapshot.schemes || []).map((scheme) => scheme.id));
  const characters = (snapshot.characters || [])
    .map((character) => ({
      ...character,
      referenceAssetIds: (character.referenceAssetIds || []).filter((assetId) => assetIds.has(assetId)),
    }))
    .filter((character) => character.referenceAssetIds.length > 0);
  const brandKit = snapshot.brandKit
    ? {
        ...snapshot.brandKit,
        logos: gameLogoIds.length > 0
          ? gameLogoIds
          : (snapshot.brandKit.logos || []).filter((assetId) => assetIds.has(assetId)),
      }
    : snapshot.brandKit;
  const modeStates = blankProjectPlaceholders.modeStates.map((modeState) => {
    const nextModeState = {
      ...modeState,
      selectedSchemeIds: (modeState.selectedSchemeIds || []).filter((schemeId) => schemeIds.has(schemeId)),
    };
    if (
      needsSloganDefaultMigration
      && nextModeState.sloganSettings?.mode === "auto"
      && !String(nextModeState.sloganSettings?.globalSlogan || "").trim()
    ) {
      nextModeState.sloganSettings = {
        ...nextModeState.sloganSettings,
        mode: "off",
      };
    }
    return nextModeState;
  });
  const changed = JSON.stringify({
    assets,
    characters,
    brandKit,
    modeStates,
    metadata,
    project: blankProjectPlaceholders.project,
  }) !== JSON.stringify({
    assets: snapshot.assets || [],
    characters: snapshot.characters || [],
    brandKit: snapshot.brandKit,
    modeStates: snapshot.modeStates || [],
    metadata: snapshot.metadata,
    project: snapshot.project,
  });

  if (!changed) return { snapshot, changed: false };

  return {
    snapshot: {
      ...snapshot,
      assets,
      project: blankProjectPlaceholders.project,
      characters,
      brandKit,
      modeStates: modeStates.map((modeState) => ({
        ...modeState,
        updatedAt,
      })),
      metadata: {
        ...metadata,
        revision: Number(snapshot.metadata?.revision || 0) + 1,
        updatedAt,
      },
    },
    changed: true,
  };
}

export function createHttpWorkspaceDataService(options = {}) {
  const basePath = options.basePath || "";

  return {
    async listWorkspaceSnapshots() {
      return getJson(`${basePath}/api/workspaces`, options);
    },

    async createWorkspaceSnapshot(payload = {}) {
      return postJson(`${basePath}/api/workspaces`, payload, options);
    },

    async renameWorkspaceSnapshot(workspaceId, payload = {}) {
      return patchJson(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}`, payload, options);
    },

    async duplicateWorkspaceSnapshot(workspaceId, payload = {}) {
      return postJson(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}/duplicate`, payload, options);
    },

    async deleteWorkspaceSnapshot(workspaceId) {
      return deleteJson(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}`, options);
    },

    async loadWorkspaceSnapshot(workspaceId) {
      return getJson(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}`, options);
    },

    async saveWorkspaceSnapshot(workspaceId, payload) {
      return postJson(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}/snapshot`, payload, options);
    },
  };
}

function updateWorkspaceSummaries(envelope) {
  const summaries = envelope?.data?.workspaces;
  if (Array.isArray(summaries)) {
    state.workspaceSummaries = summaries;
  }
}

function setWorkspaceMessage(message) {
  state.workspaceMessage = message || "";
}

function activeWorkspaceIdFromList(requestedWorkspaceId) {
  const summaries = Array.isArray(state.workspaceSummaries) ? state.workspaceSummaries : [];
  if (requestedWorkspaceId && summaries.some((item) => item.workspaceId === requestedWorkspaceId)) {
    return requestedWorkspaceId;
  }
  return summaries[0]?.workspaceId || requestedWorkspaceId || state.workspaceId;
}

async function saveActiveWorkspaceBeforeSwitch(options = {}) {
  if (state.workspaceLoadStatus !== "http" && state.apiMode !== "http") return null;
  const snapshot = state.workspaceSnapshot;
  if (!snapshot?.metadata?.workspaceId) return null;
  const service = createHttpWorkspaceDataService(options);
  return service.saveWorkspaceSnapshot(snapshot.metadata.workspaceId, { snapshot });
}

function applyLoadedWorkspaceSnapshot(snapshot, source = "http", options = {}) {
  const nextSnapshot = options.preserveActiveMode && state.activeMode
    ? { ...snapshot, activeMode: state.activeMode }
    : snapshot;
  setRuntimeWorkspaceSnapshot(nextSnapshot, source);
  if (options.resetUi) resetWorkspaceSwitchUiState();
}

export async function loadWorkspaceListForWorkbench(options = {}) {
  const service = createHttpWorkspaceDataService(options);
  const envelope = await service.listWorkspaceSnapshots();
  updateWorkspaceSummaries(envelope);
  return envelope;
}

export async function loadWorkspaceSnapshotForWorkbench(options = {}) {
  const service = createHttpWorkspaceDataService(options);
  const listEnvelope = !options.workspaceId && !options.skipList ? await service.listWorkspaceSnapshots() : null;
  if (listEnvelope) updateWorkspaceSummaries(listEnvelope);
  const workspaceId = activeWorkspaceIdFromList(options.workspaceId || state.workspaceId);

  state.workspaceLoadStatus = "loading";
  state.workspaceLoadError = null;

  const envelope = await service.loadWorkspaceSnapshot(workspaceId);

  if (envelope.ok && envelope.data?.snapshot) {
    const normalized = normalizeLoadedWorkspaceState(envelope.data.snapshot);
    if (normalized.changed) {
      const saved = await service.saveWorkspaceSnapshot(workspaceId, { snapshot: normalized.snapshot });
      if (saved.ok) {
        applyLoadedWorkspaceSnapshot(normalized.snapshot, "http", {
          resetUi: options.resetUi,
          preserveActiveMode: options.preserveActiveMode,
        });
      } else {
        applyLoadedWorkspaceSnapshot(normalized.snapshot, "http", {
          resetUi: options.resetUi,
          preserveActiveMode: options.preserveActiveMode,
        });
        state.workspaceLoadError = saved.error?.message || "Failed to persist normalized workspace state.";
      }
    } else {
      applyLoadedWorkspaceSnapshot(normalized.snapshot, "http", {
        resetUi: options.resetUi,
        preserveActiveMode: options.preserveActiveMode,
      });
    }
  } else {
    state.workspaceLoadStatus = "error";
    state.workspaceLoadError = envelope.error?.message || "Failed to load workspace snapshot.";
  }

  return envelope;
}

export async function switchWorkspaceForWorkbench(workspaceId, options = {}) {
  if (!workspaceId || workspaceId === state.workspaceId) {
    state.projectSwitcherOpen = false;
    return { ok: true, skipped: true };
  }
  state.workspaceOperation = { action: "switch", workspaceId };
  setWorkspaceMessage("");
  await saveActiveWorkspaceBeforeSwitch(options);
  const envelope = await loadWorkspaceSnapshotForWorkbench({
    ...options,
    workspaceId,
    resetUi: true,
  });
  state.workspaceOperation = null;
  if (envelope.ok) {
    state.projectSwitcherOpen = false;
    state.workspaceRenameId = "";
    state.workspaceDeleteConfirmId = "";
  } else {
    setWorkspaceMessage(envelope.error?.message || "切换失败");
  }
  return envelope;
}

export async function createWorkspaceForWorkbench(options = {}) {
  const service = createHttpWorkspaceDataService(options);
  state.workspaceOperation = { action: "create" };
  setWorkspaceMessage("");
  await saveActiveWorkspaceBeforeSwitch(options);
  const envelope = await service.createWorkspaceSnapshot({
    name: options.name || "",
    sourceWorkspaceId: state.workspaceId,
  });
  updateWorkspaceSummaries(envelope);
  if (envelope.ok && envelope.data?.snapshot) {
    applyLoadedWorkspaceSnapshot(envelope.data.snapshot, "http", { resetUi: true });
    state.projectSwitcherOpen = false;
  } else {
    setWorkspaceMessage(envelope.error?.message || "新建失败");
  }
  state.workspaceOperation = null;
  return envelope;
}

export async function renameWorkspaceForWorkbench(workspaceId, name, options = {}) {
  const service = createHttpWorkspaceDataService(options);
  state.workspaceOperation = { action: "rename", workspaceId };
  setWorkspaceMessage("");
  const envelope = await service.renameWorkspaceSnapshot(workspaceId, { name });
  updateWorkspaceSummaries(envelope);
  if (envelope.ok && envelope.data?.snapshot && workspaceId === state.workspaceId) {
    applyLoadedWorkspaceSnapshot(envelope.data.snapshot, "http");
  }
  if (envelope.ok) {
    state.workspaceRenameId = "";
  } else {
    setWorkspaceMessage(envelope.error?.message || "重命名失败");
  }
  state.workspaceOperation = null;
  return envelope;
}

export async function duplicateWorkspaceForWorkbench(workspaceId, options = {}) {
  const service = createHttpWorkspaceDataService(options);
  state.workspaceOperation = { action: "duplicate", workspaceId };
  setWorkspaceMessage("");
  await saveActiveWorkspaceBeforeSwitch(options);
  const envelope = await service.duplicateWorkspaceSnapshot(workspaceId, {
    name: options.name || "",
  });
  updateWorkspaceSummaries(envelope);
  if (envelope.ok && envelope.data?.snapshot) {
    applyLoadedWorkspaceSnapshot(envelope.data.snapshot, "http", { resetUi: true });
    state.projectSwitcherOpen = false;
  } else {
    setWorkspaceMessage(envelope.error?.message || "复制失败");
  }
  state.workspaceOperation = null;
  return envelope;
}

export async function deleteWorkspaceForWorkbench(workspaceId, options = {}) {
  const service = createHttpWorkspaceDataService(options);
  state.workspaceOperation = { action: "delete", workspaceId };
  setWorkspaceMessage("");
  const envelope = await service.deleteWorkspaceSnapshot(workspaceId);
  updateWorkspaceSummaries(envelope);
  if (envelope.ok) {
    state.workspaceDeleteConfirmId = "";
    state.workspaceRenameId = "";
    if (workspaceId === state.workspaceId && envelope.data?.fallbackWorkspaceId) {
      await loadWorkspaceSnapshotForWorkbench({
        ...options,
        workspaceId: envelope.data.fallbackWorkspaceId,
        resetUi: true,
      });
    }
  } else {
    setWorkspaceMessage(envelope.error?.message || "删除失败");
  }
  state.workspaceOperation = null;
  return envelope;
}

export async function saveWorkspaceSnapshotForWorkbench(options = {}) {
  const workspaceId = options.workspaceId || state.workspaceId;
  const snapshot = options.snapshot || state.workspaceSnapshot;
  if (!snapshot?.metadata?.workspaceId) {
    throw new Error("Workspace snapshot save requires an active workspace snapshot.");
  }
  const service = createHttpWorkspaceDataService(options);
  return service.saveWorkspaceSnapshot(workspaceId, { snapshot });
}
