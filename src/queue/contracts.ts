import { z } from "zod";
import {
  PlatformPresetSchema,
  ProductionModeSchema,
  ProviderIdSchema,
  ResultStatusSchema,
} from "../schema/zod";
import { ProviderCapabilitySchema, ProviderErrorSchema } from "../providers/contracts";

export const QueueJobStatusSchema = z.enum([
  "draft",
  "queued",
  "running",
  "partial",
  "failed",
  "completed",
  "cancelled",
]);

export const QueueTaskKindSchema = z.enum([
  "briefGeneration",
  "imageGeneration",
  "imageEdit",
  "upscale",
  "backgroundRemoval",
  "archiveSync",
  "export",
]);

export const QueueTaskStatusSchema = z.enum([
  "queued",
  "blocked",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
]);

export const QueueTaskStageSchema = z.enum([
  "planning",
  "waitingDependency",
  "waitingProvider",
  "providerCall",
  "validating",
  "postProcessing",
  "persisting",
  "done",
]);

export const QueueEventTypeSchema = z.enum([
  "jobCreated",
  "jobStarted",
  "taskQueued",
  "taskStarted",
  "taskSucceeded",
  "taskFailed",
  "taskRetryScheduled",
  "jobCompleted",
  "jobCancelled",
]);

export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(5).default(2),
  backoffMs: z.number().int().min(0).default(1000),
  retryableErrorCodes: z.array(z.string().min(1)).default(["provider_unavailable", "rate_limited", "unknown"]),
});

export const QueueCostSchema = z.object({
  estimatedCost: z.number().min(0).default(0),
  actualCost: z.number().min(0).nullable().default(null),
  currency: z.string().min(1).default("USD"),
});

export const QueueTaskInputSchema = z.object({
  schemeId: z.string().min(1).optional(),
  schemeIds: z.array(z.string().min(1)).optional(),
  sourceResultId: z.string().min(1).optional(),
  platformPreset: PlatformPresetSchema.optional(),
  aspectRatio: z.string().min(1).optional(),
	  width: z.number().int().min(1).optional(),
	  height: z.number().int().min(1).optional(),
	  prompt: z.string().min(1).optional(),
	  editInstruction: z.string().min(1).max(2000).optional(),
	  model: z.string().min(1).optional(),
	  count: z.number().int().min(1).max(8).optional(),
	});

export const QueueTaskOutputSchema = z.object({
  providerResultIds: z.array(z.string().min(1)).default([]),
  status: ResultStatusSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const QueueTaskSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  parentTaskId: z.string().min(1).nullable().default(null),
  dependsOn: z.array(z.string().min(1)).default([]),
  kind: QueueTaskKindSchema,
  status: QueueTaskStatusSchema.default("queued"),
  stage: QueueTaskStageSchema.default("planning"),
  providerId: ProviderIdSchema.optional(),
  providerCapability: ProviderCapabilitySchema.optional(),
  mode: ProductionModeSchema,
  attempts: z.number().int().min(0).default(0),
  maxAttempts: z.number().int().min(1).max(5).default(2),
  progress: z.number().min(0).max(100).default(0),
  input: QueueTaskInputSchema.default({}),
  output: QueueTaskOutputSchema.default({ providerResultIds: [], metadata: {} }),
  error: ProviderErrorSchema.nullable().default(null),
  cost: QueueCostSchema.default({ estimatedCost: 0, actualCost: null, currency: "USD" }),
  elapsedMs: z.number().int().min(0).default(0),
});

export const QueueJobSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  mode: ProductionModeSchema,
  providerId: ProviderIdSchema,
  status: QueueJobStatusSchema.default("draft"),
  title: z.string().min(1),
  retryPolicy: RetryPolicySchema.default({ maxAttempts: 2, backoffMs: 1000, retryableErrorCodes: ["provider_unavailable", "rate_limited", "unknown"] }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const QueueEventSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  taskId: z.string().min(1).optional(),
  type: QueueEventTypeSchema,
  message: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const QueuePlanSchema = z.object({
  job: QueueJobSchema,
  tasks: z.array(QueueTaskSchema).min(1),
  events: z.array(QueueEventSchema).min(1),
});

export const QueueSummarySchema = z.object({
  jobId: z.string().min(1),
  total: z.number().int().min(0),
  queued: z.number().int().min(0),
  running: z.number().int().min(0),
  completed: z.number().int().min(0),
  failed: z.number().int().min(0),
  cancelled: z.number().int().min(0),
  progress: z.number().min(0).max(100),
  estimatedCost: z.number().min(0),
  actualCost: z.number().min(0).nullable(),
  elapsedMs: z.number().int().min(0),
});

export type QueueJobStatus = z.infer<typeof QueueJobStatusSchema>;
export type QueueTaskKind = z.infer<typeof QueueTaskKindSchema>;
export type QueueTaskStatus = z.infer<typeof QueueTaskStatusSchema>;
export type QueueTaskStage = z.infer<typeof QueueTaskStageSchema>;
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;
export type QueueJob = z.infer<typeof QueueJobSchema>;
export type QueueTask = z.infer<typeof QueueTaskSchema>;
export type QueueEvent = z.infer<typeof QueueEventSchema>;
export type QueuePlan = z.infer<typeof QueuePlanSchema>;
export type QueueSummary = z.infer<typeof QueueSummarySchema>;

export function providerCapabilityForTask(kind: QueueTaskKind): z.infer<typeof ProviderCapabilitySchema> | null {
  const map: Record<QueueTaskKind, z.infer<typeof ProviderCapabilitySchema> | null> = {
    briefGeneration: "briefGeneration",
    imageGeneration: "imageGeneration",
    imageEdit: "imageEdit",
    upscale: "upscale",
    backgroundRemoval: "backgroundRemoval",
    archiveSync: null,
    export: null,
  };

  return map[kind];
}

export function summarizeQueue(plan: QueuePlan): QueueSummary {
  const total = plan.tasks.length;
  const completed = plan.tasks.filter((task) => task.status === "succeeded").length;
  const failed = plan.tasks.filter((task) => task.status === "failed").length;
  const running = plan.tasks.filter((task) => task.status === "running").length;
  const queued = plan.tasks.filter((task) => task.status === "queued" || task.status === "blocked").length;
  const cancelled = plan.tasks.filter((task) => task.status === "cancelled").length;
  const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
  const estimatedCost = plan.tasks.reduce((sum, task) => sum + task.cost.estimatedCost, 0);
  const actualCosts = plan.tasks.map((task) => task.cost.actualCost).filter((cost): cost is number => typeof cost === "number");

  return QueueSummarySchema.parse({
    jobId: plan.job.id,
    total,
    queued,
    running,
    completed,
    failed,
    cancelled,
    progress,
    estimatedCost,
    actualCost: actualCosts.length > 0 ? actualCosts.reduce((sum, cost) => sum + cost, 0) : null,
    elapsedMs: plan.tasks.reduce((sum, task) => sum + task.elapsedMs, 0),
  });
}
