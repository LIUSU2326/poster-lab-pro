import { createHttpGenerationService } from './http-generation-service.js';
import { loadWorkspaceSnapshotForWorkbench } from './workspace-data-service.js';
import {
  getModeResults,
  getRuntimeWorkspaceSnapshot,
  state,
  updateResultOperation,
} from './state.js';
import { resolveResultOperationRoute, resultOperationRouting } from './provider-capabilities.js';
import { modeSpecs } from './data/modes.js';
import { getLiveGateViewModel } from './data/live-gate-view-model.js';

function findResult(resultId) {
  return getModeResults().find((result) => result.id === resultId) || null;
}

function selectLatestDerivedResult(sourceResultId, taskKind) {
  const derived = getModeResults().find((result) =>
    result.metadata?.sourceResultId === sourceResultId
      && result.metadata?.queueTaskKind === taskKind,
  );
  if (!derived) return null;

  state.selectedResult = derived.id;
  state.selectedResultUserSet = true;
  return derived;
}

function formatElapsed(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatCost(value) {
  return typeof value === "number" ? `$${value.toFixed(2)}` : "真实成本未返回";
}

function createLiveExecutionPayload(activeMode) {
  const gate = getLiveGateViewModel(activeMode);
  return {
    gate,
    liveExecution: {
      enabled: gate.allowed,
      estimatedCost: gate.estimatedCost,
      maxAcceptedCost: gate.maxAcceptedCost,
      confirmations: {
        liveRun: Boolean(state.liveGate.confirmations.liveRun),
        providerCost: Boolean(state.liveGate.confirmations.providerCost),
        externalProvider: Boolean(state.liveGate.confirmations.externalProvider),
        resultStorage: Boolean(state.liveGate.confirmations.resultStorage),
      },
    },
  };
}

export async function runResultOperationForWorkbench(operation, options = {}) {
  const config = resultOperationRouting[operation?.action];
  const sourceResult = findResult(operation?.resultId);
  if (!operation?.id || !config || !sourceResult) return null;

  const startedAt = Date.now();
  const service = createHttpGenerationService(options);
  const workspaceId = state.workspaceId;
  const snapshot = getRuntimeWorkspaceSnapshot();
  const route = resolveResultOperationRoute(operation.action, state.provider);
  const activeMode = modeSpecs[sourceResult.mode] || modeSpecs[state.activeMode] || modeSpecs.poster;
  const liveExecutionPayload = createLiveExecutionPayload(activeMode);

  if (!route.supported) {
    updateResultOperation(operation.id, {
      status: "failed",
      progress: 100,
      message: route.title,
    });
    return null;
  }

  if (state.apiMode === "http" && !liveExecutionPayload.gate.allowed) {
    updateResultOperation(operation.id, {
      status: "failed",
      progress: 100,
      message: liveExecutionPayload.gate.blockers?.[0]?.message || "请先开启并通过实机安全闸，再调用真实模型服务。",
    });
    state.taskOpen = true;
    return null;
  }

  try {
    updateResultOperation(operation.id, {
      status: "running",
      progress: 36,
      message: `Creating ${route.taskKind} queue task via ${route.providerLabel}${route.native ? "" : " fallback"}.`,
      providerId: route.providerId,
      routedFromProviderId: state.provider,
      nativeProviderRoute: route.native,
    });

    const queuePlanCreate = await service.createQueuePlan(workspaceId, {
      projectId: snapshot.project.id,
      mode: sourceResult.mode,
      providerId: route.providerId,
      schemeIds: [sourceResult.schemeId],
      imagesPerScheme: 1,
      sourceResultId: sourceResult.id,
      ...route.flags,
    });

    if (!queuePlanCreate.ok) {
      throw new Error(queuePlanCreate.error?.message || "Failed to create result operation queue plan.");
    }

    updateResultOperation(operation.id, {
      status: "running",
      progress: 62,
      jobId: queuePlanCreate.data.queuePlan.job.id,
      message: `${route.taskKind} task created. Running local queue worker.`,
    });

    const queueRun = await service.runQueuePlan(workspaceId, queuePlanCreate.data.queuePlan.job.id, {
      archiveResults: true,
      liveExecution: liveExecutionPayload.liveExecution,
    });

    if (!queueRun.ok) {
      throw new Error(queueRun.error?.message || "Failed to run result operation queue.");
    }

    await loadWorkspaceSnapshotForWorkbench({ workspaceId, fetchImpl: options.fetchImpl });
    const derived = selectLatestDerivedResult(sourceResult.id, route.taskKind);
    const failed = queueRun.data.summary.failed > 0;

    updateResultOperation(operation.id, {
      status: failed ? "failed" : "done",
      progress: 100,
      cost: formatCost(queueRun.data.summary.actualCost),
      elapsed: formatElapsed(queueRun.data.summary.elapsedMs || Date.now() - startedAt),
      resultId: derived?.id || operation.resultId,
      outputResultId: derived?.id || null,
      message: failed
        ? `${route.taskKind} queue finished with failed tasks.`
        : `${route.taskKind} result created via ${route.providerLabel} and added to Results.`,
    });

    state.view = "results";
    state.taskOpen = true;
    state.resultViewerOpen = true;
    return queueRun;
  } catch (error) {
    updateResultOperation(operation.id, {
      status: "failed",
      progress: 100,
      elapsed: formatElapsed(Date.now() - startedAt),
      message: error instanceof Error ? error.message : "Result operation failed.",
    });
    return null;
  }
}
