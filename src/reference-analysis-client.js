import { state } from "./state.js";

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
      imageDataUrl,
    }),
  });
  const envelope = await readEnvelope(response);

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
