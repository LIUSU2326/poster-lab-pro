import { z } from "zod";
import {
  QueuePlanSchema,
  QueueTaskKindSchema,
  QueueTaskStageSchema,
  QueueTaskStatusSchema,
  summarizeQueue,
  type QueuePlan,
  type QueueTask,
} from "./contracts";
import { ProviderErrorCodeSchema } from "../providers/contracts";

export const QueueFeedbackFailureSchema = z.object({
  taskId: z.string().min(1),
  kind: QueueTaskKindSchema,
  code: ProviderErrorCodeSchema,
  retryable: z.boolean(),
  attempts: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  userMessage: z.string().min(1),
});

export const QueueFeedbackTaskSchema = z.object({
  taskId: z.string().min(1),
  kind: QueueTaskKindSchema,
  status: QueueTaskStatusSchema,
  stage: QueueTaskStageSchema,
  progress: z.number().min(0).max(100),
  costLabel: z.string().min(1),
  elapsedLabel: z.string().min(1),
});

export const QueueFeedbackSnapshotSchema = z.object({
  jobId: z.string().min(1),
  jobStatus: z.string().min(1),
  currentStage: z.string().min(1),
  progressLabel: z.string().min(1),
  costLabel: z.string().min(1),
  elapsedLabel: z.string().min(1),
  total: z.number().int().min(0),
  completed: z.number().int().min(0),
  failed: z.number().int().min(0),
  retryableFailureCount: z.number().int().min(0),
  failures: z.array(QueueFeedbackFailureSchema).default([]),
  tasks: z.array(QueueFeedbackTaskSchema).default([]),
});

export type QueueFeedbackFailure = z.infer<typeof QueueFeedbackFailureSchema>;
export type QueueFeedbackTask = z.infer<typeof QueueFeedbackTaskSchema>;
export type QueueFeedbackSnapshot = z.infer<typeof QueueFeedbackSnapshotSchema>;

const stageLabels: Record<z.infer<typeof QueueTaskStageSchema>, string> = {
  planning: "Planning",
  waitingDependency: "Waiting for dependency",
  waitingProvider: "Waiting for provider",
  providerCall: "Provider call",
  validating: "Validating",
  postProcessing: "Post-processing",
  persisting: "Persisting",
  done: "Done",
};

export function formatQueueCost(input: { estimatedCost: number; actualCost: number | null; currency?: string }): string {
  const value = typeof input.actualCost === "number" ? input.actualCost : input.estimatedCost;
  const currency = input.currency || "USD";
  return `${currency} ${value.toFixed(2)}`;
}

export function formatElapsedMs(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  return `${seconds}s`;
}

export function queueStageLabel(stage: z.infer<typeof QueueTaskStageSchema>): string {
  return stageLabels[stage];
}

function currentStage(plan: QueuePlan): string {
  const running = plan.tasks.find((task) => task.status === "running");
  if (running) return queueStageLabel(running.stage);

  const failed = plan.tasks.find((task) => task.status === "failed");
  if (failed?.error) return `Failed: ${failed.error.code}`;

  if (plan.job.status === "completed") return "Completed";
  if (plan.job.status === "queued") return "Queued";
  if (plan.job.status === "cancelled") return "Cancelled";
  if (plan.job.status === "failed") return "Failed";
  if (plan.job.status === "partial") return "Partially completed";
  return "Preparing";
}

function taskCostLabel(task: QueueTask): string {
  return formatQueueCost({
    estimatedCost: task.cost.estimatedCost,
    actualCost: task.cost.actualCost,
    currency: task.cost.currency,
  });
}

function failureFromTask(task: QueueTask): QueueFeedbackFailure | null {
  if (!task.error) return null;
  return QueueFeedbackFailureSchema.parse({
    taskId: task.id,
    kind: task.kind,
    code: task.error.code,
    retryable: task.error.retryable,
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
    userMessage: task.error.userMessage,
  });
}

export function createQueueFeedbackSnapshot(plan: QueuePlan): QueueFeedbackSnapshot {
  const parsed = QueuePlanSchema.parse(plan);
  const summary = summarizeQueue(parsed);
  const failures = parsed.tasks
    .map((task) => failureFromTask(task))
    .filter((failure): failure is QueueFeedbackFailure => Boolean(failure));

  return QueueFeedbackSnapshotSchema.parse({
    jobId: parsed.job.id,
    jobStatus: parsed.job.status,
    currentStage: currentStage(parsed),
    progressLabel: `${summary.completed}/${summary.total} · ${summary.progress}%`,
    costLabel: formatQueueCost({
      estimatedCost: summary.estimatedCost,
      actualCost: summary.actualCost,
      currency: parsed.tasks[0]?.cost.currency || "USD",
    }),
    elapsedLabel: formatElapsedMs(summary.elapsedMs),
    total: summary.total,
    completed: summary.completed,
    failed: summary.failed,
    retryableFailureCount: failures.filter((failure) => failure.retryable).length,
    failures,
    tasks: parsed.tasks.map((task) =>
      QueueFeedbackTaskSchema.parse({
        taskId: task.id,
        kind: task.kind,
        status: task.status,
        stage: task.stage,
        progress: task.progress,
        costLabel: taskCostLabel(task),
        elapsedLabel: formatElapsedMs(task.elapsedMs),
      }),
    ),
  });
}
