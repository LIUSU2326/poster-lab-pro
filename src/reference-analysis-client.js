import { getRuntimeWorkspaceSnapshot, setRuntimeWorkspaceSnapshot, state } from "./state.js";
import { saveWorkspaceSnapshotForWorkbench } from "./workspace-data-service.js";

function encodeSegment(value) {
  return encodeURIComponent(String(value));
}

function analysisPath(workspaceId, providerId) {
  return `/api/workspaces/${encodeSegment(workspaceId)}/provider-credentials/${encodeSegment(providerId)}/reference-analysis`;
}

async function readEnvelope(response) {
  try {
    return await response.json();
  } catch {
    return {
      ok: false,
      error: {
        code: "bad_response",
        message: "Reference analysis route returned unreadable JSON.",
      },
    };
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function commitReferenceAnalysisToWorkspace(key, input, envelope) {
  if (!envelope?.ok) return null;
  const text = String(envelope.data?.text || "").trim();
  if (!text) return null;

  const updatedAt = nowIso();
  const snapshot = clone(getRuntimeWorkspaceSnapshot());
  const previous = Array.isArray(snapshot.referenceAnalyses) ? snapshot.referenceAnalyses : [];
  const analysis = {
    key,
    kind: input.kind || "composition",
    role: input.role || "compositionReference",
    label: input.label || "Reference image",
    providerId: envelope.data?.providerId || input.providerId || state.provider,
    model: envelope.data?.model || "",
    text,
    createdAt: previous.find((item) => item.key === key)?.createdAt || updatedAt,
    updatedAt,
  };

  snapshot.referenceAnalyses = [
    ...previous.filter((item) => item.key !== key),
    analysis,
  ].slice(-12);
  snapshot.metadata = {
    ...snapshot.metadata,
    revision: snapshot.metadata.revision + 1,
    updatedAt,
  };
  setRuntimeWorkspaceSnapshot(snapshot, "reference-analysis");
  return snapshot;
}

export async function analyzeReferenceImageForWorkbench(input = {}, options = {}) {
  const providerId = input.providerId || state.provider;
  const workspaceId = input.workspaceId || state.workspaceId;
  const key = input.key || `${input.role || "reference"}:${input.kind || "analysis"}`;
  const imageDataUrl = input.imageDataUrl || state.referenceUploadDataUrls?.[key] || "";

  if (!imageDataUrl) {
    return {
      ok: false,
      error: {
        code: "missing_image",
        message: "请重新上传图片后再提取。",
      },
    };
  }

  state.referenceAnalysis = {
    ...(state.referenceAnalysis || {}),
    [key]: {
      status: "running",
      providerId,
      kind: input.kind || "composition",
      updatedAt: new Date().toISOString(),
    },
  };

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const response = await fetchImpl(analysisPath(workspaceId, providerId), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      kind: input.kind || "composition",
      role: input.role || "compositionReference",
      label: input.label || "Reference image",
      ...(input.model ? { model: input.model } : {}),
      imageDataUrl,
    }),
  });
  const envelope = await readEnvelope(response);
  const committedSnapshot = commitReferenceAnalysisToWorkspace(key, input, envelope);
  if (committedSnapshot?.metadata?.workspaceId) {
    try {
      const saveEnvelope = await saveWorkspaceSnapshotForWorkbench({
        workspaceId,
        snapshot: committedSnapshot,
        fetchImpl,
      });
      if (!saveEnvelope.ok) {
        state.workspaceLoadError = saveEnvelope.error?.message || "Reference analysis saved in memory, but workspace persistence failed.";
      }
    } catch (error) {
      state.workspaceLoadError = error instanceof Error
        ? error.message
        : "Reference analysis saved in memory, but workspace persistence failed.";
    }
  }

  state.referenceAnalysis = {
    ...(state.referenceAnalysis || {}),
    [key]: {
      status: envelope.ok ? "ready" : "error",
      providerId,
      kind: input.kind || "composition",
      label: input.label || "Reference image",
      text: envelope.ok ? envelope.data?.text || "" : "",
      model: envelope.ok ? envelope.data?.model || "" : "",
      error: envelope.ok ? null : envelope.error?.message || "Reference analysis failed.",
      updatedAt: new Date().toISOString(),
    },
  };

  return envelope;
}
