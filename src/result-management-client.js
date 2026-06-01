import { getRuntimeWorkspaceSnapshot, setRuntimeWorkspaceSnapshot, state } from './state.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function encodeSegment(value) {
  return encodeURIComponent(String(value));
}

async function postJson(path, payload, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Workspace snapshot persistence requires fetch.");
  }

  const response = await fetchImpl(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  try {
    return await response.json();
  } catch {
    return {
      ok: false,
      error: {
        code: "bad_response",
        message: "Workspace save route returned an unreadable response.",
      },
    };
  }
}

async function deleteJson(path, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Workspace result deletion requires fetch.");
  }

  const response = await fetchImpl(path, {
    method: "DELETE",
  });

  try {
    return await response.json();
  } catch {
    return {
      ok: false,
      error: {
        code: "bad_response",
        message: "Result delete route returned an unreadable response.",
      },
    };
  }
}

function touchSnapshot(snapshot) {
  const updatedAt = nowIso();
  return {
    ...snapshot,
    metadata: {
      ...snapshot.metadata,
      revision: Number(snapshot.metadata?.revision || 0) + 1,
      updatedAt,
    },
  };
}

function removeResultReferences(snapshot, resultIds) {
  const resultSet = new Set(resultIds);
  return {
    ...snapshot,
    results: (snapshot.results || []).filter((result) => !resultSet.has(result.id)),
    archiveRows: (snapshot.archiveRows || []).filter((row) => !resultSet.has(row.resultAssetId)),
  };
}

function applySnapshot(nextSnapshot, source) {
  setRuntimeWorkspaceSnapshot(nextSnapshot, source);
}

async function persistSnapshot(nextSnapshot, options = {}) {
  if (state.workspaceLoadStatus !== "http" && state.apiMode !== "http") {
    applySnapshot(nextSnapshot, "static");
    return { ok: true, transport: "static" };
  }

  const workspaceId = nextSnapshot.metadata.workspaceId;
  const envelope = await postJson(`/api/workspaces/${encodeSegment(workspaceId)}/snapshot`, { snapshot: nextSnapshot }, options);
  if (envelope.ok) {
    applySnapshot(nextSnapshot, "http");
  }
  return {
    ...envelope,
    transport: "http",
  };
}

export async function deleteResultForWorkbench(input = {}, options = {}) {
  const resultId = input.resultId || "";
  if (!resultId) {
    return {
      ok: false,
      error: { message: "缺少要删除的结果 ID。" },
    };
  }

  const snapshot = clone(getRuntimeWorkspaceSnapshot());
  const result = (snapshot.results || []).find((item) => item.id === resultId);
  if (!result) {
    return {
      ok: false,
      error: { message: "找不到要删除的结果。" },
    };
  }

  const usesHttp = state.workspaceLoadStatus === "http" || state.apiMode === "http";
  if (usesHttp) {
    const workspaceId = snapshot.metadata.workspaceId;
    const envelope = await deleteJson(
      `/api/workspaces/${encodeSegment(workspaceId)}/results/${encodeSegment(resultId)}`,
      options,
    );
    if (envelope.ok) {
      const nextSnapshot = envelope.data?.snapshot || touchSnapshot(removeResultReferences(snapshot, [resultId]));
      applySnapshot(nextSnapshot, "http");
    }
    return {
      ...envelope,
      transport: "http",
    };
  }

  const nextSnapshot = touchSnapshot(removeResultReferences(snapshot, [resultId]));
  return persistSnapshot(nextSnapshot, options);
}
