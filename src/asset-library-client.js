import { getRuntimeWorkspaceSnapshot, setRuntimeWorkspaceSnapshot, state } from './state.js';
import { createHttpWorkspaceDataService, loadWorkspaceSnapshotForWorkbench } from './workspace-data-service.js';
import { getActiveGenerationFormValues, updateGenerationFormField } from './generation-form-runtime.js';

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
        traceId: `trace-asset-client-${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
      },
    };
  }
}

async function postJson(path, payload, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Asset library client requires a fetch implementation.");
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

async function postMultipart(path, formData, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Asset library client requires a fetch implementation.");
  }

  const response = await fetchImpl(path, {
    method: "POST",
    body: formData,
  });

  return readEnvelope(response);
}

async function getJson(path, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Asset library client requires a fetch implementation.");
  }

  const response = await fetchImpl(path, {
    method: "GET",
    headers: {
      accept: "application/json",
    },
  });

  return readEnvelope(response);
}

function nowIso(options = {}) {
  return options.now ? options.now() : new Date().toISOString();
}

let clientAssetCounter = 0;
/** @type {Promise<unknown>} */
let assetMutationQueue = Promise.resolve();

/**
 * @template T
 * @param {() => T | Promise<T>} task
 * @returns {Promise<Awaited<T>>}
 */
function enqueueAssetMutation(task) {
  const nextTask = assetMutationQueue.then(task, task);
  assetMutationQueue = nextTask.catch(() => {});
  return nextTask;
}

function safeAssetSegment(value) {
  return String(value || "asset")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "asset";
}

function inferMimeType(fileName) {
  if (/\.jpe?g$/i.test(fileName)) return "image/jpeg";
  if (/\.webp$/i.test(fileName)) return "image/webp";
  return "image/png";
}

function createClientAssetId(input, options = {}) {
  clientAssetCounter += 1;
  const stamp = nowIso(options).replace(/[^0-9]/g, "").slice(0, 17) || Date.now().toString();
  const role = safeAssetSegment(input.role);
  const fileName = safeAssetSegment(input.fileName || input.label);
  return `asset-${role}-${fileName}-${stamp}-${clientAssetCounter}`.slice(0, 120);
}

function createUploadPayload(input, options = {}) {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const role = input.role || "styleReference";
  const label = input.label || "Reference Asset";
  const file = input.file || null;
  const fileName = input.fileName || file?.name || `${role}-${Date.now()}.png`;
  const mimeType = input.mimeType || file?.type || inferMimeType(fileName);
  const byteSize = input.byteSize ?? file?.size ?? 512000;

  return {
    workspaceId: snapshot.metadata.workspaceId,
    projectId: snapshot.project.id,
    role,
    label,
    fileName,
    mimeType,
    byteSize,
    checksum: input.checksum || `metadata-${role}-${fileName}-${byteSize}-${file?.lastModified || snapshot.metadata.revision}`,
    usage: ["input", "reference"],
    previewUrl: input.previewUrl || null,
    clientAssetId: input.clientAssetId || createClientAssetId({ role, label, fileName }, options),
  };
}

function appendUploadFile(formData, payload, file) {
  const fileName = payload.fileName;
  if (file && typeof file.arrayBuffer === "function") {
    formData.append("file", file, fileName);
    return;
  }

  if (typeof Blob === "function") {
    const fallbackBytes = new Uint8Array([0]);
    formData.append("file", new Blob([fallbackBytes], { type: payload.mimeType }), fileName);
    return;
  }

  formData.append("file", "");
}

function createBinaryUploadFormData(payload, uploadPlan, file) {
  if (typeof FormData !== "function") {
    throw new Error("Binary asset upload requires FormData support.");
  }

  const formData = new FormData();
  formData.set("assetId", uploadPlan.assetId);
  formData.set("storageKey", uploadPlan.storageKey);
  appendUploadFile(formData, payload, file);
  return formData;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isVisibleFormControl(control) {
  if (typeof HTMLElement === "undefined") return false;
  if (!(control instanceof HTMLElement)) return false;
  return Boolean(control.offsetParent || control.getClientRects().length > 0);
}

function formControlValue(control) {
  if (typeof HTMLInputElement !== "undefined" && control instanceof HTMLInputElement && control.type === "checkbox") return control.checked;
  return control.value;
}

function syncVisibleGenerationFormControlsForAssetMutation() {
  if (typeof document === "undefined") return;
  const values = new Map();
  document.querySelectorAll("[data-form-field]").forEach((control) => {
    const field = control.dataset?.formField;
    if (!field || !isVisibleFormControl(control)) return;
    values.set(field, formControlValue(control));
  });
  values.forEach((value, field) => updateGenerationFormField(field, value));
}

function currentProjectDraft() {
  const values = getActiveGenerationFormValues();
  return {
    mode: values.mode,
    projectName: values.projectBrief.projectName ?? "",
    gameDescription: values.projectBrief.gameDescription ?? "",
    focusGuidanceEnabled: Boolean(values.projectBrief.focusGuidanceEnabled),
    focusGuidance: values.projectBrief.focusGuidance || "",
  };
}

function createStaticAssetDraft(payload, options = {}) {
  const createdAt = nowIso(options);
  return {
    id: payload.clientAssetId,
    projectId: payload.projectId,
    role: payload.role,
    label: payload.label,
    sourceType: "uploaded",
    previewUrl: payload.previewUrl,
    metadata: {
      originalFileName: payload.fileName,
      uploadId: `upload-${payload.clientAssetId}`,
      plannedAt: createdAt,
      source: payload.previewUrl ? "local-file-metadata" : "static-simulated",
    },
    usage: payload.usage,
    storageKey: `projects/${payload.projectId}/assets/${payload.role}/${payload.clientAssetId}.png`,
    mimeType: payload.mimeType,
    byteSize: payload.byteSize,
    checksum: payload.checksum,
    createdAt,
    updatedAt: createdAt,
  };
}

function assetUploadFingerprint(asset) {
  const fileName = asset.metadata?.originalFileName || "";
  const checksum = asset.checksum || "";
  const byteSize = asset.byteSize ?? "";
  if (!checksum && !fileName && byteSize === "") return "";
  return [
    asset.role || "",
    asset.label || "",
    checksum || fileName,
    asset.mimeType || "",
    byteSize,
  ].join("|");
}

function isSameUploadedAsset(left, right) {
  if (left.id === right.id) return true;
  const leftKey = assetUploadFingerprint(left);
  return Boolean(leftKey && leftKey === assetUploadFingerprint(right));
}

function mergeUploadedAsset(existing, incoming, updatedAt) {
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt || incoming.createdAt,
    updatedAt,
    metadata: {
      ...(existing.metadata || {}),
      ...(incoming.metadata || {}),
    },
  };
}

function commitStaticAsset(asset, options = {}) {
  const snapshot = clone(getRuntimeWorkspaceSnapshot());
  const updatedAt = nowIso(options);
  const existing = snapshot.assets.find((item) => isSameUploadedAsset(item, asset));
  const committedAsset = existing
    ? mergeUploadedAsset(existing, asset, updatedAt)
    : { ...asset, updatedAt };
  const assets = snapshot.assets.filter((item) => !isSameUploadedAsset(item, committedAsset));
  assets.push(committedAsset);

  setRuntimeWorkspaceSnapshot({
    ...snapshot,
    assets,
    metadata: {
      ...snapshot.metadata,
      revision: snapshot.metadata.revision + 1,
      updatedAt,
    },
  }, "static");
}

export function createHttpAssetLibraryClient(options = {}) {
  const basePath = options.basePath || "";

  return {
    async createUploadPlan(workspaceId, payload) {
      return postJson(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}/assets/upload-plan`, payload, options);
    },

    async uploadAssetBinary(workspaceId, payload) {
      const formData = createBinaryUploadFormData(payload, payload.uploadPlan, payload.file);
      return postMultipart(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}/assets/upload-binary`, formData, options);
    },

    async commitAssetRecord(workspaceId, payload) {
      return postJson(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}/assets`, payload, options);
    },

    async listWorkspaceAssets(workspaceId, query = {}) {
      const params = new URLSearchParams();
      if (query.role) params.set("role", query.role);
      if (query.usage) params.set("usage", query.usage);
      const search = params.toString();
      return getJson(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}/assets${search ? `?${search}` : ""}`, options);
    },
  };
}

async function runWorkbenchAssetUpload(input = {}, options = {}) {
  syncVisibleGenerationFormControlsForAssetMutation();
  const projectDraft = currentProjectDraft();
  const payload = createUploadPayload(input, options);
  const workspaceId = payload.workspaceId;

  state.assetOperation = {
    status: "planning",
    role: payload.role,
    label: payload.label,
    transport: state.apiMode,
  };

  if (state.apiMode !== "http") {
    const assetDraft = createStaticAssetDraft(payload, options);
    commitStaticAsset(assetDraft, options);
    state.assetOperation = {
      status: "ready",
      role: payload.role,
      label: payload.label,
      transport: "static",
      assetId: assetDraft.id,
    };
    return {
      ok: true,
      transport: "static",
      uploadPlan: { ok: true, data: { assetDraft } },
      commit: { ok: true, data: { asset: assetDraft } },
      assetList: { ok: true, data: { assets: getRuntimeWorkspaceSnapshot().assets } },
      snapshotReload: { ok: true, data: { snapshot: getRuntimeWorkspaceSnapshot() } },
    };
  }

  const client = createHttpAssetLibraryClient(options);
  const uploadPlan = await client.createUploadPlan(workspaceId, payload);
  let binaryUpload = null;

  if (uploadPlan.ok && input.file) {
    state.assetOperation = {
      status: "uploading",
      role: payload.role,
      label: payload.label,
      transport: "http",
      assetId: uploadPlan.data.uploadPlan.assetId,
    };
    binaryUpload = await client.uploadAssetBinary(workspaceId, {
      ...payload,
      file: input.file,
      uploadPlan: uploadPlan.data.uploadPlan,
    });
  }

  const binaryPreviewUrl = binaryUpload?.ok ? binaryUpload.data.publicUrl : null;
  const canCommitAsset = uploadPlan.ok && (!input.file || binaryUpload?.ok);
  const plannedAsset = canCommitAsset
    ? {
        ...uploadPlan.data.assetDraft,
        previewUrl: binaryPreviewUrl || payload.previewUrl || uploadPlan.data.assetDraft.previewUrl || null,
        metadata: {
          ...uploadPlan.data.assetDraft.metadata,
          source: binaryPreviewUrl ? "local-binary" : payload.previewUrl ? "local-file-metadata" : uploadPlan.data.assetDraft.metadata?.source,
          localPublicUrl: binaryPreviewUrl || null,
        },
      }
    : null;
  const commit = canCommitAsset
    ? await client.commitAssetRecord(workspaceId, {
      asset: plannedAsset,
      replaceExisting: false,
      projectDraft,
    })
    : binaryUpload || uploadPlan;
  const assetList = commit.ok
    ? await client.listWorkspaceAssets(workspaceId, { role: payload.role, usage: "input" })
    : commit;
  const snapshotReload = commit.ok
    ? await loadWorkspaceSnapshotForWorkbench({ ...options, workspaceId })
    : commit;

  const ok = uploadPlan.ok && (!input.file || binaryUpload?.ok) && commit.ok && assetList.ok && snapshotReload.ok;

  state.assetOperation = {
    status: ok ? "ready" : "error",
    role: payload.role,
    label: payload.label,
    transport: "http",
    assetId: uploadPlan.ok ? plannedAsset.id : null,
    assetCount: assetList.ok ? assetList.data.assets.length : null,
    error: ok ? null : uploadPlan.error?.message || binaryUpload?.error?.message || commit.error?.message || assetList.error?.message || snapshotReload.error?.message,
  };

  return {
    ok,
    transport: "http",
    uploadPlan,
    binaryUpload,
    commit,
    assetList,
    snapshotReload,
  };
}

export function simulateWorkbenchAssetUpload(input = {}, options = {}) {
  return enqueueAssetMutation(() => runWorkbenchAssetUpload(input, options));
}

export function uploadWorkbenchAssetFile(input = {}, options = {}) {
  return simulateWorkbenchAssetUpload(input, options);
}

function removeAssetsFromSnapshot(snapshot, role, label, options = {}) {
  const updatedAt = nowIso(options);
  const targetAssetIds = new Set(Array.isArray(options.assetIds) ? options.assetIds.filter(Boolean) : []);
  const removedIds = new Set();
  const removedLabels = new Set();
  const nextAssets = snapshot.assets.filter((asset) => {
    const matchesById = targetAssetIds.size > 0 && targetAssetIds.has(asset.id);
    const matchesByRoleLabel = targetAssetIds.size === 0 && asset.role === role && (!label || asset.label === label);
    if (!matchesById && !matchesByRoleLabel) return true;
    removedIds.add(asset.id);
    if (asset.label) removedLabels.add(asset.label);
    return false;
  });
  const nextReferenceAnalyses = (snapshot.referenceAnalyses || []).filter((analysis) => {
    if (analysis.role !== role) return true;
    if (targetAssetIds.size > 0) {
      return !removedLabels.has(analysis.label);
    }
    if (!label) return false;
    return analysis.label !== label && !String(analysis.key || "").startsWith(`${role}:`);
  });

  if (removedIds.size === 0 && nextReferenceAnalyses.length === (snapshot.referenceAnalyses || []).length) {
    return {
      changed: false,
      snapshot,
      removedIds,
      removedLabels,
    };
  }

  return {
    changed: true,
    removedIds,
    removedLabels,
    snapshot: {
      ...snapshot,
      assets: nextAssets,
      characters: (snapshot.characters || [])
        .map((character) => ({
          ...character,
          referenceAssetIds: (character.referenceAssetIds || []).filter((assetId) => !removedIds.has(assetId)),
        }))
        .filter((character) => character.referenceAssetIds.length > 0),
      brandKit: snapshot.brandKit
        ? {
            ...snapshot.brandKit,
            logos: (snapshot.brandKit.logos || []).filter((assetId) => !removedIds.has(assetId)),
          }
        : snapshot.brandKit,
      referenceAnalyses: nextReferenceAnalyses,
      metadata: {
        ...snapshot.metadata,
        revision: snapshot.metadata.revision + 1,
        updatedAt,
      },
    },
  };
}

async function persistSnapshotIfNeeded(snapshot, options = {}) {
  if (state.apiMode !== "http") {
    return {
      ok: true,
      transport: "static",
      data: { snapshot },
    };
  }

  const workspaceId = snapshot.metadata.workspaceId;
  const service = createHttpWorkspaceDataService(options);
  return service.saveWorkspaceSnapshot(workspaceId, { snapshot });
}

async function runRemoveWorkbenchAssetsByRoleLabel(role, label = "", options = {}) {
  syncVisibleGenerationFormControlsForAssetMutation();
  const snapshot = clone(getRuntimeWorkspaceSnapshot());
  const removal = removeAssetsFromSnapshot(snapshot, role, label, options);

  state.referenceUploadDataUrls = Object.fromEntries(
    Object.entries(state.referenceUploadDataUrls || {}).filter(([key]) => {
      if (!key.startsWith(`${role}:`)) return true;
      if (removal.removedLabels?.has?.(key.slice(`${role}:`.length))) return false;
      if (!label) return false;
      if (key === `${role}:style` || key === `${role}:composition`) return false;
      return key !== `${role}:${label}` && !key.startsWith(`${role}:${label}:`);
    }),
  );
  state.referenceAnalysis = Object.fromEntries(
    Object.entries(state.referenceAnalysis || {}).filter(([key, value]) => {
      const matchesRole = key.startsWith(`${role}:`) || value?.role === role;
      if (!matchesRole) return true;
      if (removal.removedLabels?.has?.(value?.label) || removal.removedLabels?.has?.(key.slice(`${role}:`.length))) return false;
      if (!label) return false;
      return value?.label !== label && key !== `${role}:${label}` && !key.startsWith(`${role}:${label}:`);
    }),
  );

  if (!removal.changed) {
    state.assetOperation = null;
    return {
      ok: true,
      transport: state.apiMode === "http" ? "http" : "static",
      removedAssetIds: [],
      save: null,
    };
  }

  state.assetOperation = {
    status: "planning",
    role,
    label,
    transport: state.apiMode,
    action: "remove",
  };

  setRuntimeWorkspaceSnapshot(removal.snapshot, state.apiMode === "http" ? "http" : "static");
  const save = await persistSnapshotIfNeeded(removal.snapshot, options);

  if (!save.ok) {
    state.assetOperation = {
      status: "error",
      role,
      label,
      transport: state.apiMode,
      action: "remove",
      error: save.error?.message || "删除素材后保存工作区失败。",
    };
    return {
      ok: false,
      transport: state.apiMode === "http" ? "http" : "static",
      removedAssetIds: [...removal.removedIds],
      save,
    };
  }

  state.assetOperation = null;
  return {
    ok: true,
    transport: state.apiMode === "http" ? "http" : "static",
    removedAssetIds: [...removal.removedIds],
    save,
  };
}

export function removeWorkbenchAssetsByRoleLabel(role, label = "", options = {}) {
  return enqueueAssetMutation(() => runRemoveWorkbenchAssetsByRoleLabel(role, label, options));
}
