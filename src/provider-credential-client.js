import { state } from './state.js';
import { loadWorkspaceSnapshotForWorkbench } from './workspace-data-service.js';

function encodeSegment(value) {
  return encodeURIComponent(String(value));
}

function credentialPath(workspaceId, providerId) {
  return `/api/workspaces/${encodeSegment(workspaceId)}/provider-credentials/${encodeSegment(providerId)}`;
}

function connectionTestPath(workspaceId, providerId) {
  return `${credentialPath(workspaceId, providerId)}/connection-test`;
}

async function readEnvelope(response) {
  try {
    return await response.json();
  } catch {
    return {
      ok: false,
      error: {
        code: "bad_request",
        message: "Credential route returned an unreadable JSON response.",
        fieldErrors: {},
        details: { status: response.status },
      },
      meta: {
        traceId: `trace-provider-credential-client-${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
      },
    };
  }
}

async function requestJson(path, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Provider credential client requires a fetch implementation.");
  }

  const response = await fetchImpl(path, {
    method: options.method || "GET",
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  return readEnvelope(response);
}

function applyStatus(envelope, providerId) {
  if (envelope.ok && envelope.data?.status) {
    const configured = Boolean(envelope.data.status.configured);
    state.providerCredential = {
      status: "success",
      error: null,
      providerId,
      masked: envelope.data.status.apiKeyMasked || "",
      configured,
      updatedAt: envelope.data.status.updatedAt || null,
    };
    if (providerId === state.provider) {
      state.liveGate.runtimeCredentialReady = configured;
    }
  } else {
    state.providerCredential = {
      ...state.providerCredential,
      status: "error",
      providerId,
      error: envelope.error?.message || "Provider credential request failed.",
    };
    if (providerId === state.provider) {
      state.liveGate.runtimeCredentialReady = false;
    }
  }

  return envelope;
}

function applyConnectionResult(envelope, providerId) {
  if (envelope.ok && envelope.data?.result) {
    const result = envelope.data.result;
    state.providerConnection = {
      status: result.status,
      phase: "success",
      error: null,
      providerId,
      ok: Boolean(result.ok),
      attemptedNetwork: Boolean(result.attemptedNetwork),
      checkedAt: result.checkedAt || null,
      elapsedMs: result.elapsedMs || 0,
      message: result.userMessage || result.message,
      errorCode: result.errorCode || null,
      retryable: Boolean(result.retryable),
      modelCount: typeof result.modelCount === "number" ? result.modelCount : null,
      defaultModel: result.defaultModel || "",
      defaultModelAvailable:
        typeof result.defaultModelAvailable === "boolean" ? result.defaultModelAvailable : null,
      sampledModels: Array.isArray(result.sampledModels) ? result.sampledModels : [],
    };
  } else {
    state.providerConnection = {
      ...state.providerConnection,
      phase: "error",
      status: "unavailable",
      providerId,
      ok: false,
      error: envelope.error?.message || "Provider connection test failed.",
      message: envelope.error?.message || "Provider connection test failed.",
    };
  }

  return envelope;
}

export async function loadProviderCredentialStatusForWorkbench(options = {}) {
  const providerId = options.providerId || state.provider;
  const workspaceId = options.workspaceId || state.workspaceId;

  state.providerCredential = {
    status: "loading",
    providerId,
    masked: "",
    configured: false,
    updatedAt: null,
    error: null,
  };

  const envelope = await requestJson(credentialPath(workspaceId, providerId), {
    ...options,
    method: "GET",
  });
  return applyStatus(envelope, providerId);
}

export async function saveProviderCredentialForWorkbench(input, options = {}) {
  const providerId = input?.providerId || state.provider;
  const workspaceId = input?.workspaceId || state.workspaceId;
  const apiKey = input?.apiKey || "";
  const baseUrl =
    input?.baseUrl ??
    document.querySelector(`[data-provider-base-url="${providerId}"]`)?.value?.trim() ??
    "";
  const defaultModel =
    input?.defaultModel ??
    document.querySelector(`[data-provider-default-model="${providerId}"]`)?.value?.trim() ??
    "";
  const modelSlots = Object.fromEntries(
    Array.from(document.querySelectorAll(`[data-provider-model-slot][data-provider-id="${providerId}"]`))
      .map((control) => [control.dataset.providerModelSlot, control.value?.trim()])
      .filter(([slot, value]) => slot && value),
  );

  state.providerCredential = {
    ...state.providerCredential,
    status: "saving",
    providerId,
    error: null,
  };

  const envelope = await requestJson(credentialPath(workspaceId, providerId), {
    ...options,
    method: "POST",
    body: {
      apiKey,
      baseUrl,
      defaultModel,
      enabled: true,
      ...(Object.keys(modelSlots).length > 0 ? { modelSlots } : defaultModel ? { modelSlots: { image: defaultModel } } : {}),
    },
  });
  applyStatus(envelope, providerId);

  if (envelope.ok) {
    await loadWorkspaceSnapshotForWorkbench({ workspaceId, fetchImpl: options.fetchImpl });
    if (providerId === state.provider) {
      state.liveGate.runtimeCredentialReady = Boolean(envelope.data?.status?.configured);
    }
  }

  return envelope;
}

export async function revokeProviderCredentialForWorkbench(input = {}, options = {}) {
  const providerId = input.providerId || state.provider;
  const workspaceId = input.workspaceId || state.workspaceId;

  state.providerCredential = {
    ...state.providerCredential,
    status: "revoking",
    providerId,
    error: null,
  };

  const envelope = await requestJson(credentialPath(workspaceId, providerId), {
    ...options,
    method: "DELETE",
  });
  applyStatus(envelope, providerId);

  if (envelope.ok) {
    await loadWorkspaceSnapshotForWorkbench({ workspaceId, fetchImpl: options.fetchImpl });
    if (providerId === state.provider) {
      state.liveGate.runtimeCredentialReady = false;
    }
  }

  return envelope;
}

export async function testProviderConnectionForWorkbench(input = {}, options = {}) {
  const providerId = input.providerId || state.provider;
  const workspaceId = input.workspaceId || state.workspaceId;

  state.providerConnection = {
    ...state.providerConnection,
    phase: "testing",
    status: "degraded",
    providerId,
    error: null,
    message: "Testing provider connection...",
  };

  const envelope = await requestJson(connectionTestPath(workspaceId, providerId), {
    ...options,
    method: "POST",
    body: {
      verifyModels: input.verifyModels ?? true,
      timeoutMs: input.timeoutMs || 10000,
    },
  });
  applyConnectionResult(envelope, providerId);

  if (providerId === state.provider) {
    state.liveGate.transportReady = Boolean(envelope.ok && envelope.data?.result?.ok);
  }

  if (envelope.ok) {
    await loadWorkspaceSnapshotForWorkbench({ workspaceId, fetchImpl: options.fetchImpl });
  }

  return envelope;
}
