import { nextRepository } from "../../../../../../../src/api/next-service";
import { jsonEnvelope, routeWorkspaceId } from "../../../../../../../src/api/next-response";
import { requestQueueCancellation } from "../../../../../../../src/api/queue-cancellation";
import { QueueEventSchema, QueuePlanSchema, QueueTaskSchema, summarizeQueue, type QueueTask } from "../../../../../../../src/queue/contracts";
import { WorkspaceSnapshotSchema, summarizeWorkspaceSnapshot } from "../../../../../../../src/storage";

type RouteContext = {
  params: Promise<{ workspaceId: string; jobId: string }>;
};

const terminalTaskStatuses = new Set(["succeeded", "failed", "cancelled", "skipped"]);

function cancelTask(task: QueueTask): QueueTask {
  if (terminalTaskStatuses.has(String(task.status || ""))) return task;
  return QueueTaskSchema.parse({
    ...task,
    status: "cancelled",
    stage: "done",
    progress: typeof task.progress === "number" ? task.progress : 0,
    error: null,
  });
}

function cancellationEvent(jobId: string, updatedAt: string) {
  return QueueEventSchema.parse({
    id: `event-${jobId}-jobCancelled-${Date.now()}`,
    jobId,
    type: "jobCancelled",
    message: "Cancelled by user.",
    createdAt: updatedAt,
  });
}

export async function POST(_request: Request, context: RouteContext) {
  const workspaceId = await routeWorkspaceId(context);
  const params = await context.params;
  const jobId = params.jobId;
  requestQueueCancellation(jobId);

  const loaded = await nextRepository.loadSnapshot(workspaceId);
  if (!loaded.ok) {
    return jsonEnvelope({
      ok: false,
      error: {
        code: "not_found",
        message: loaded.message || `Workspace snapshot ${workspaceId} was not found.`,
        fieldErrors: {},
      },
      meta: {
        traceId: `trace-queue-cancel-${Date.now()}`,
        workspaceId,
        createdAt: new Date().toISOString(),
      },
    } as const);
  }

  const updatedAt = new Date().toISOString();
  const currentPlan = loaded.snapshot.queuePlans.find((plan) => plan.job.id === jobId);
  if (!currentPlan) {
    return jsonEnvelope({
      ok: false,
      error: {
        code: "not_found",
        message: `Queue plan ${jobId} was not found.`,
        fieldErrors: {},
      },
      meta: {
        traceId: `trace-queue-cancel-${Date.now()}`,
        workspaceId,
        createdAt: updatedAt,
      },
    } as const);
  }

  const cancelledPlan = QueuePlanSchema.parse({
    ...currentPlan,
    job: {
      ...currentPlan.job,
      status: "cancelled",
      updatedAt,
    },
    tasks: currentPlan.tasks.map(cancelTask),
    events: [
      ...currentPlan.events,
      cancellationEvent(jobId, updatedAt),
    ],
  });
  const summary = summarizeQueue(cancelledPlan);
  const snapshot = WorkspaceSnapshotSchema.parse({
    ...loaded.snapshot,
    queuePlans: loaded.snapshot.queuePlans.map((plan) => (plan.job.id === jobId ? cancelledPlan : plan)),
    queueSummaries: [
      ...loaded.snapshot.queueSummaries.filter((candidate) => candidate.jobId !== summary.jobId),
      summary,
    ],
    metadata: {
      ...loaded.snapshot.metadata,
      revision: loaded.snapshot.metadata.revision + 1,
      updatedAt,
    },
  });

  await nextRepository.saveSnapshot(snapshot);

  return jsonEnvelope({
    ok: true,
    data: {
      snapshot,
      summary: summarizeWorkspaceSnapshot(snapshot),
      queueSummary: summary,
    },
    meta: {
      traceId: `trace-queue-cancel-${Date.now()}`,
      workspaceId,
      revision: snapshot.metadata.revision,
      createdAt: updatedAt,
    },
  } as const);
}
