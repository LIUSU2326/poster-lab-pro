import { state, setRuntimeWorkspaceSnapshot } from './state.js';

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

function nowIso() {
  return new Date().toISOString();
}

function dateValue(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function assetDedupeKey(asset) {
  return [
    asset.role,
    asset.checksum || asset.metadata?.originalFileName || asset.storageKey || asset.id,
    asset.byteSize ?? "",
  ].join("|");
}

function assetSlotKey(asset) {
  const label = String(asset.label || "").trim();
  return label ? `${asset.role}|${label}` : `${asset.role}|${asset.id}`;
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
  const bySlot = new Map();
  for (const asset of byKey.values()) {
    const key = assetSlotKey(asset);
    const existing = bySlot.get(key);
    if (!existing || dateValue(asset.updatedAt || asset.createdAt) >= dateValue(existing.updatedAt || existing.createdAt)) {
      bySlot.set(key, asset);
    }
  }
  return [...bySlot.values()].sort((left, right) => dateValue(left.createdAt) - dateValue(right.createdAt));
}

function normalizeLoadedWorkspaceState(snapshot) {
  const updatedAt = nowIso();
  const assets = dedupeFreshSessionAssets(snapshot.assets || []);
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
  const modeStates = (snapshot.modeStates || []).map((modeState) => ({
    ...modeState,
    selectedSchemeIds: (modeState.selectedSchemeIds || []).filter((schemeId) => schemeIds.has(schemeId)),
  }));
  const changed = JSON.stringify({
    assets,
    characters,
    brandKit,
    modeStates,
  }) !== JSON.stringify({
    assets: snapshot.assets || [],
    characters: snapshot.characters || [],
    brandKit: snapshot.brandKit,
    modeStates: snapshot.modeStates || [],
  });

  if (!changed) return { snapshot, changed: false };

  return {
    snapshot: {
      ...snapshot,
      assets,
      characters,
      brandKit,
      modeStates: modeStates.map((modeState) => ({
        ...modeState,
        updatedAt,
      })),
      metadata: {
        ...snapshot.metadata,
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
    async loadWorkspaceSnapshot(workspaceId) {
      return getJson(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}`, options);
    },

    async saveWorkspaceSnapshot(workspaceId, payload) {
      return postJson(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}/snapshot`, payload, options);
    },
  };
}

export async function loadWorkspaceSnapshotForWorkbench(options = {}) {
  const workspaceId = options.workspaceId || state.workspaceId;
  const service = createHttpWorkspaceDataService(options);

  state.workspaceLoadStatus = "loading";
  state.workspaceLoadError = null;

  const envelope = await service.loadWorkspaceSnapshot(workspaceId);

  if (envelope.ok && envelope.data?.snapshot) {
    const normalized = normalizeLoadedWorkspaceState(envelope.data.snapshot);
    if (normalized.changed) {
      const saved = await service.saveWorkspaceSnapshot(workspaceId, { snapshot: normalized.snapshot });
      if (saved.ok) {
        setRuntimeWorkspaceSnapshot(normalized.snapshot, "http");
      } else {
        setRuntimeWorkspaceSnapshot(normalized.snapshot, "http");
        state.workspaceLoadError = saved.error?.message || "Failed to persist normalized workspace state.";
      }
    } else {
      setRuntimeWorkspaceSnapshot(normalized.snapshot, "http");
    }
  } else {
    state.workspaceLoadStatus = "error";
    state.workspaceLoadError = envelope.error?.message || "Failed to load workspace snapshot.";
  }

  return envelope;
}
