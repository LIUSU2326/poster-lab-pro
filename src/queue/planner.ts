import { z } from "zod";
import { modeGuardrails } from "../providers/contracts";
import { createOutputSettingsDefaults } from "../schema/zod-defaults";
import { PlatformPresetSchema, ProductionModeSchema, ProviderIdSchema } from "../schema/zod";
import {
  QueueEventSchema,
  QueueJobSchema,
  QueuePlanSchema,
  QueueTaskSchema,
  providerCapabilityForTask,
  type QueuePlan,
  type QueueTask,
  type QueueTaskKind,
} from "./contracts";

const ProviderRouteSchema = z.object({
  providerId: ProviderIdSchema,
  model: z.string().min(1).optional(),
});

const QueuePlannerInputSchema = z.object({
  projectId: z.string().min(1),
  mode: ProductionModeSchema,
  providerId: ProviderIdSchema.default("openai"),
  providerRoutes: z.record(z.string().min(1), ProviderRouteSchema).default({}),
  schemeIds: z.array(z.string().min(1)).min(1),
  platformPresets: z.array(PlatformPresetSchema).min(1).optional(),
  aspectRatios: z.array(z.string().min(1)).min(1).optional(),
  customSize: z
    .object({
      width: z.number().int().min(256).max(8192),
      height: z.number().int().min(256).max(8192),
    })
    .nullable()
    .optional(),
  imagesPerScheme: z.number().int().min(1).max(8).default(1),
  includeImageEdit: z.boolean().default(false),
  includeUpscale: z.boolean().default(false),
  includeBackgroundRemoval: z.boolean().default(false),
  sourceResultId: z.string().min(1).optional(),
});

type QueuePlannerResolvedInput = z.infer<typeof QueuePlannerInputSchema>;
export type QueuePlannerInput = z.input<typeof QueuePlannerInputSchema>;

function nowIso() {
  return new Date().toISOString();
}

function createEvent(jobId: string, type: "jobCreated" | "taskQueued", message: string, taskId?: string) {
  return QueueEventSchema.parse({
    id: `event-${jobId}-${type}-${taskId || "job"}`,
    jobId,
    taskId,
    type,
    message,
    createdAt: nowIso(),
  });
}

function inferDimensions(aspectRatio: string, customSize?: { width: number; height: number } | null): {
  aspectRatio: string;
  width: number;
  height: number;
} {
  if (customSize) {
    return {
      aspectRatio: `${customSize.width}x${customSize.height}`,
      width: customSize.width,
      height: customSize.height,
    };
  }

  const explicit = aspectRatio.match(/^(\d{3,5})x(\d{3,5})$/);
  if (explicit) {
    return {
      aspectRatio,
      width: Number(explicit[1]),
      height: Number(explicit[2]),
    };
  }

  if (aspectRatio === "9:16") return { aspectRatio, width: 1080, height: 1920 };
  if (aspectRatio === "16:9") return { aspectRatio, width: 1920, height: 1080 };
  if (aspectRatio === "4:3") return { aspectRatio, width: 1600, height: 1200 };
  if (aspectRatio === "3:4") return { aspectRatio, width: 1200, height: 1600 };
  if (aspectRatio === "1200x627") return { aspectRatio, width: 1200, height: 627 };
  return { aspectRatio: aspectRatio || "1:1", width: 1024, height: 1024 };
}

function estimateTaskCost(kind: QueueTaskKind, count = 1): number {
  if (kind === "briefGeneration") return 0.02;
  if (kind === "imageGeneration") return 0.05 * Math.max(1, count);
  if (kind === "imageEdit") return 0.04 * Math.max(1, count);
  if (kind === "upscale") return 0.02 * Math.max(1, count);
  if (kind === "backgroundRemoval") return 0.02 * Math.max(1, count);
  return 0;
}

function routeForSlot(parsed: QueuePlannerResolvedInput, slot: string): { providerId: QueuePlannerResolvedInput["providerId"]; model?: string } {
  const route = parsed.providerRoutes[slot];
  return {
    providerId: route?.providerId || parsed.providerId,
    ...(route?.model ? { model: route.model } : {}),
  };
}

function createTask(params: {
  id: string;
  jobId: string;
  mode: QueuePlannerResolvedInput["mode"];
  providerId: QueuePlannerResolvedInput["providerId"];
  kind: QueueTaskKind;
  dependsOn?: string[];
  schemeId?: string;
  platformPreset?: z.infer<typeof PlatformPresetSchema>;
  width?: number;
  height?: number;
  aspectRatio?: string;
  count?: number;
  model?: string;
  sourceResultId?: string;
}): QueueTask {
  const providerCapability = providerCapabilityForTask(params.kind);
  return QueueTaskSchema.parse({
    id: params.id,
    jobId: params.jobId,
    dependsOn: params.dependsOn || [],
    kind: params.kind,
    status: params.dependsOn?.length ? "blocked" : "queued",
    stage: params.dependsOn?.length ? "waitingDependency" : "planning",
    providerId: providerCapability ? params.providerId : undefined,
    providerCapability: providerCapability || undefined,
    mode: params.mode,
    input: {
      schemeId: params.schemeId,
      sourceResultId: params.sourceResultId,
      platformPreset: params.platformPreset,
      width: params.width,
      height: params.height,
      aspectRatio: params.aspectRatio,
      count: params.count,
      model: params.model,
      prompt: params.schemeId ? `${params.mode} prompt for ${params.schemeId}` : undefined,
    },
    cost: {
      estimatedCost: providerCapability ? estimateTaskCost(params.kind, params.count) : 0,
      currency: "USD",
    },
  });
}

export function createBatchQueuePlan(input: QueuePlannerInput): QueuePlan {
  const parsed = QueuePlannerInputSchema.parse(input);
  const conceptRoute = routeForSlot(parsed, "concept");
  const imageRoute = routeForSlot(parsed, "image");
  const output = createOutputSettingsDefaults(parsed.mode);
  const postProcessFlags: [QueueTaskKind, boolean][] = [
    ["imageEdit", parsed.includeImageEdit],
    ["upscale", parsed.includeUpscale],
    ["backgroundRemoval", parsed.includeBackgroundRemoval],
  ];
  const operationOnly = Boolean(parsed.sourceResultId && postProcessFlags.some(([, enabled]) => enabled));
  const operationSuffix = operationOnly
    ? `-op-${parsed.sourceResultId?.replace(/[^a-zA-Z0-9_-]+/g, "-")}-${Date.now().toString(36)}`
    : "";
  const jobId = `job-${parsed.mode}-${parsed.projectId}${operationSuffix}`;
  const createdAt = nowIso();
  const tasks: QueueTask[] = [];
  const events = [createEvent(jobId, "jobCreated", `Created ${parsed.mode} batch queue.`)];
  const aspectRatios = parsed.aspectRatios?.length ? parsed.aspectRatios : output.aspectRatios;
  const platformPresets = parsed.platformPresets?.length ? parsed.platformPresets : output.platformPresets;

  const job = QueueJobSchema.parse({
    id: jobId,
    projectId: parsed.projectId,
    mode: parsed.mode,
    providerId: conceptRoute.providerId,
    status: "queued",
    title: `${parsed.mode} batch production`,
    createdAt,
    updatedAt: createdAt,
  });

  const briefTask = operationOnly
    ? null
    : createTask({
        id: `${jobId}-brief`,
        jobId,
        mode: parsed.mode,
        providerId: conceptRoute.providerId,
        kind: "briefGeneration",
        model: conceptRoute.model || "concept",
      });
  if (briefTask) {
    tasks.push(briefTask);
    events.push(createEvent(jobId, "taskQueued", "Queued brief generation.", briefTask.id));
  }

  parsed.schemeIds.forEach((schemeId, schemeIndex) => {
    const ratio = aspectRatios[schemeIndex % aspectRatios.length] || "1:1";
    const target = inferDimensions(ratio, parsed.customSize);
    const platformPreset = platformPresets[schemeIndex % platformPresets.length] || "custom";
    const imageTask = operationOnly
      ? null
      : createTask({
          id: `${jobId}-image-${schemeIndex + 1}`,
          jobId,
          mode: parsed.mode,
          providerId: imageRoute.providerId,
          kind: "imageGeneration",
          dependsOn: briefTask ? [briefTask.id] : [],
          schemeId,
          platformPreset,
          width: target.width,
          height: target.height,
          aspectRatio: target.aspectRatio,
          count: parsed.imagesPerScheme,
          model: imageRoute.model || "image",
        });
    if (imageTask) {
      tasks.push(imageTask);
      events.push(createEvent(jobId, "taskQueued", `Queued image generation for ${schemeId}.`, imageTask.id));
    }

    postProcessFlags.forEach(([kind, enabled]) => {
      if (!enabled) return;
      const postProcessRoute = routeForSlot(parsed, kind);
      const task = createTask({
        id: `${jobId}-${kind}-${schemeIndex + 1}`,
        jobId,
        mode: parsed.mode,
        providerId: postProcessRoute.providerId,
        kind,
        dependsOn: imageTask ? [imageTask.id] : [],
        schemeId,
        platformPreset,
        width: target.width,
        height: target.height,
        aspectRatio: target.aspectRatio,
        count: 1,
        sourceResultId: parsed.sourceResultId || `result-${schemeId}`,
        model: postProcessRoute.model || kind,
      });
      tasks.push(task);
      events.push(createEvent(jobId, "taskQueued", `Queued ${kind} for ${schemeId}.`, task.id));
    });
  });

  const archiveTask = createTask({
    id: `${jobId}-archive`,
    jobId,
    mode: parsed.mode,
    providerId: parsed.providerId,
    kind: "archiveSync",
    dependsOn: tasks.filter((task) => task.kind !== "archiveSync").map((task) => task.id),
  });
  tasks.push(archiveTask);
  events.push(createEvent(jobId, "taskQueued", "Queued archive sync.", archiveTask.id));

  modeGuardrails(parsed.mode);

  return QueuePlanSchema.parse({ job, tasks, events });
}
