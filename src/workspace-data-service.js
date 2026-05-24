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

export function createHttpWorkspaceDataService(options = {}) {
  const basePath = options.basePath || "";

  return {
    async loadWorkspaceSnapshot(workspaceId) {
      return getJson(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}`, options);
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
    setRuntimeWorkspaceSnapshot(envelope.data.snapshot, "http");
  } else {
    state.workspaceLoadStatus = "error";
    state.workspaceLoadError = envelope.error?.message || "Failed to load workspace snapshot.";
  }

  return envelope;
}
