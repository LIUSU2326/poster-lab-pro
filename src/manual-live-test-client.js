import { getActiveMode, state } from './state.js';
import {
  getManualLiveTestViewModel,
  getPreparedLiveQueueJobId,
  getLiveGateViewModel,
} from './data/live-gate-view-model.js';
import { submitGenerationDraft } from './form-binding.js';
import {
  loadProviderCredentialStatusForWorkbench,
  testProviderConnectionForWorkbench,
} from './provider-credential-client.js';
import { loadWorkspaceSnapshotForWorkbench } from './workspace-data-service.js';
import {
  evaluateQueuePlanCapabilityGate,
  providerCapabilityGateUserMessage,
} from './provider-capabilities.js';

function encodeSegment(value) {
  return encodeURIComponent(String(value));
}

function nowIso() {
  return new Date().toISOString();
}

function createTraceId() {
  return `trace-manual-live-ui-${Date.now().toString(36)}`;
}

function routeProviderForSlot(slot) {
  return state.providerSlotRoutes?.[slot]?.providerId || state.provider || "openai";
}

function routeModelForSlot(slot, providerId) {
  const route = state.providerSlotRoutes?.[slot] || {};
  const config = state.workspaceSnapshot?.providerConfigs?.[providerId] || {};
  return route.model || config.modelSlots?.[slot] || config.defaultModel || "";
}

function getManualLiveProviderId() {
  return routeProviderForSlot("concept");
}

function getManualLiveCapabilityBlockers(activeMode) {
  const conceptProviderId = routeProviderForSlot("concept");
  const imageProviderId = routeProviderForSlot("image");
  const gate = evaluateQueuePlanCapabilityGate({
    mode: activeMode?.id || state.activeMode || "poster",
    providerId: conceptProviderId,
    providerRoutes: {
      concept: {
        providerId: conceptProviderId,
        model: routeModelForSlot("concept", conceptProviderId),
      },
      image: {
        providerId: imageProviderId,
        model: routeModelForSlot("image", imageProviderId),
      },
    },
    regenerateSchemes: true,
    includeImageGeneration: true,
  });
  const blockers = [];
  if (!gate.ok) blockers.push(providerCapabilityGateUserMessage(gate));
  if (conceptProviderId !== imageProviderId) {
    blockers.push("手动实机测试当前要求方案生成和图像生成使用同一个 Provider；请切到全 Agnes、全 OpenAI 或全 Google 后再测。");
  }
  return blockers;
}

async function readEnvelope(response) {
  try {
    return await response.json();
  } catch {
    return {
      ok: false,
      error: {
        code: "bad_request",
        message: "Manual live test route returned an unreadable JSON response.",
        fieldErrors: {},
        details: { status: response.status },
      },
      meta: {
        traceId: createTraceId(),
        createdAt: nowIso(),
      },
    };
  }
}

async function postJson(path, payload, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Manual live test requires a fetch implementation.");
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

function blockedState(message, details = {}) {
  state.manualLiveTest = {
    ...state.manualLiveTest,
    phase: "blocked",
    status: "blocked",
    error: message,
    message,
    updatedAt: nowIso(),
    envelope: {
      ok: false,
      error: {
        code: "blocked",
        message,
        details,
      },
    },
  };
  return state.manualLiveTest.envelope;
}

function preparingState(message) {
  state.manualLiveTest = {
    ...state.manualLiveTest,
    phase: "running",
    status: "preparing",
    error: null,
    message,
    updatedAt: nowIso(),
    envelope: null,
  };
}

function getHardBlockers(activeMode) {
  const gate = getLiveGateViewModel(activeMode);
  const autoClearableGateBlockers = new Set(["missing_runtime_credential", "missing_transport"]);
  const blockers = [];
  const manualProviderId = getManualLiveProviderId();

  if (state.apiMode !== "http") blockers.push("Open the Next workbench in HTTP mode.");
  if (manualProviderId !== "openai" && manualProviderId !== "google" && manualProviderId !== "agnes") {
    blockers.push("Manual live test currently supports OpenAI-compatible, Google, and Agnes providers only.");
  }
  if (state.manualLiveTest?.phase === "running") blockers.push("Manual live test is already running.");
  blockers.push(...getManualLiveCapabilityBlockers(activeMode));

  for (const blocker of gate.blockers || []) {
    if (!autoClearableGateBlockers.has(blocker.code)) blockers.push(blocker.message);
  }

  return blockers;
}

async function ensurePreparedQueue(options = {}) {
  let jobId = getPreparedLiveQueueJobId();
  if (jobId) return jobId;

  preparingState("Preparing a local queue job for the manual live sample.");
  const submission = await submitGenerationDraft(options);
  jobId = getPreparedLiveQueueJobId();

  if (submission.status !== "service-ready" || !jobId) return "";
  return jobId;
}

async function ensureProviderPreflight(options = {}) {
  const providerId = getManualLiveProviderId();
  const credentialStatusStale = state.providerCredential?.providerId !== providerId;

  if (!state.liveGate.runtimeCredentialReady || credentialStatusStale) {
    preparingState("Refreshing provider API Key status.");
    await loadProviderCredentialStatusForWorkbench({ ...options, providerId });
  }

  if (!state.liveGate.runtimeCredentialReady) return;

  const connectionReady = Boolean(
    state.providerConnection?.providerId === providerId &&
    state.providerConnection?.ok,
  );

  if (!connectionReady || !state.liveGate.transportReady) {
    preparingState("Testing provider connection before the live sample.");
    await testProviderConnectionForWorkbench({ providerId }, options);
  }
}

function applyManualLiveEnvelope(envelope, jobId, traceId) {
  const result = envelope?.ok ? envelope.data?.result : null;
  const phase = !envelope?.ok
    ? "failed"
    : result?.status === "attempted" && result?.summary?.failed === 0
      ? "succeeded"
      : result?.status === "attempted"
        ? "failed"
        : result?.status === "blocked"
          ? "blocked"
          : "idle";

  state.manualLiveTest = {
    ...state.manualLiveTest,
    phase,
    status: result?.status || envelope?.error?.code || "error",
    error: envelope?.ok ? null : envelope?.error?.message || "Manual live test failed.",
    message: result?.message || envelope?.error?.message || "Manual live test finished.",
    jobId,
    traceId: result?.traceId || traceId,
    resultCount: result?.resultCount || 0,
    persistedFileCount: result?.persistedFileCount || 0,
    connectionStatus: envelope?.ok ? envelope.data?.connection?.status || null : null,
    updatedAt: nowIso(),
    envelope,
  };
}

export function createManualLiveTestPayload() {
  const activeMode = getActiveMode();
  const gate = getLiveGateViewModel(activeMode);
  const traceId = createTraceId();

  return {
    enabled: true,
    providerId: getManualLiveProviderId(),
    safety: {
      estimatedCost: gate.estimatedCost,
      maxAcceptedCost: gate.maxAcceptedCost,
      confirmations: {
        liveRun: Boolean(state.liveGate.confirmations.liveRun),
        providerCost: Boolean(state.liveGate.confirmations.providerCost),
        externalProvider: Boolean(state.liveGate.confirmations.externalProvider),
        resultStorage: Boolean(state.liveGate.confirmations.resultStorage),
      },
    },
    timeoutMs: 10000,
    traceId,
  };
}

export async function runManualLiveTestForWorkbench(options = {}) {
  const activeMode = getActiveMode();
  const hardBlockers = getHardBlockers(activeMode);

  if (hardBlockers.length > 0) {
    return blockedState(hardBlockers[0] || "Manual live test is not ready.", {
      blockers: hardBlockers,
      jobId: getPreparedLiveQueueJobId(),
      apiMode: state.apiMode,
      provider: state.provider,
    });
  }

  if (options.autoPrepare !== false) {
    await ensurePreparedQueue(options);
    await ensureProviderPreflight(options);
  }

  const viewModel = getManualLiveTestViewModel(activeMode);
  const jobId = getPreparedLiveQueueJobId();

  if (!jobId) {
    return blockedState("Create a queue job with the normal batch action first.", {
      blockers: ["Create a queue job with the normal batch action first."],
      jobId,
      apiMode: state.apiMode,
      provider: state.provider,
    });
  }

  if (!viewModel.ready) {
    return blockedState(viewModel.firstBlocker || "Manual live test is not ready.", {
      blockers: viewModel.blockers,
      jobId,
      apiMode: state.apiMode,
      provider: state.provider,
    });
  }

  const payload = createManualLiveTestPayload();
  state.manualLiveTest = {
    ...state.manualLiveTest,
    phase: "running",
    status: "running",
    error: null,
    message: "Manual live test route is running.",
    jobId,
    traceId: payload.traceId,
    updatedAt: nowIso(),
    envelope: null,
  };

  try {
    const envelope = await postJson(
      `/api/workspaces/${encodeSegment(state.workspaceId)}/queue-plans/${encodeSegment(jobId)}/live-test`,
      payload,
      options,
    );
    applyManualLiveEnvelope(envelope, jobId, payload.traceId);

    if (envelope.ok && envelope.data?.result?.attempted) {
      await loadWorkspaceSnapshotForWorkbench(options);
    }

    return envelope;
  } catch (error) {
    const envelope = {
      ok: false,
      error: {
        code: "internal",
        message: error instanceof Error ? error.message : "Manual live test failed.",
        fieldErrors: {},
        details: {},
      },
      meta: {
        traceId: payload.traceId,
        createdAt: nowIso(),
      },
    };
    applyManualLiveEnvelope(envelope, jobId, payload.traceId);
    return envelope;
  }
}
