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
  includeImageGeneration: z.boolean().default(true),
  includeImageEdit: z.boolean().default(false),
  includeUpscale: z.boolean().default(false),
	  includeBackgroundRemoval: z.boolean().default(false),
	  sourceResultId: z.string().min(1).optional(),
	  editInstruction: z.string().min(1).max(2000).optional(),
	  regenerateSchemes: z.boolean().default(true),
	  batchId: z.string().min(1).max(80).optional(),
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

function outputTargetsForPlan(parsed: QueuePlannerResolvedInput): Array<{
  schemeId: string;
  schemeIndex: number;
  outputIndex: number;
  aspectRatio: string;
  platformPreset: z.infer<typeof PlatformPresetSchema>;
}> {
  const output = createOutputSettingsDefaults(parsed.mode);
  const aspectRatios = parsed.aspectRatios?.length ? parsed.aspectRatios : output.aspectRatios;
  const platformPresets = parsed.platformPresets?.length ? parsed.platformPresets : output.platformPresets;
  const singleSchemeSuite = parsed.schemeIds.length === 1 && aspectRatios.length > 1;

  if (singleSchemeSuite) {
    const schemeId = parsed.schemeIds[0];
    if (!schemeId) return [];
    return aspectRatios.map((aspectRatio, outputIndex) => ({
      schemeId,
      schemeIndex: 0,
      outputIndex,
      aspectRatio,
      platformPreset: platformPresets[outputIndex % platformPresets.length] || "custom",
    }));
  }

  return parsed.schemeIds.map((schemeId, schemeIndex) => ({
    schemeId,
    schemeIndex,
    outputIndex: schemeIndex,
    aspectRatio: aspectRatios[schemeIndex % aspectRatios.length] || "1:1",
    platformPreset: platformPresets[schemeIndex % platformPresets.length] || "custom",
  }));
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
	  editInstruction?: string;
	  schemeIds?: string[];
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
	      schemeIds: params.schemeIds,
	      sourceResultId: params.sourceResultId,
	      ...(params.editInstruction ? { editInstruction: params.editInstruction } : {}),
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
  const postProcessFlags: [QueueTaskKind, boolean][] = [
    ["imageEdit", parsed.includeImageEdit],
    ["upscale", parsed.includeUpscale],
    ["backgroundRemoval", parsed.includeBackgroundRemoval],
  ];
  const operationOnly = Boolean(parsed.sourceResultId && postProcessFlags.some(([, enabled]) => enabled));
  const operationSuffix = operationOnly
    ? `-op-${parsed.sourceResultId?.replace(/[^a-zA-Z0-9_-]+/g, "-")}-${Date.now().toString(36)}`
    : "";
  const batchSuffix = operationOnly
    ? operationSuffix
    : `-${(parsed.batchId || Date.now().toString(36)).replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
  const jobId = `job-${parsed.mode}-${parsed.projectId}${batchSuffix}`;
  const createdAt = nowIso();
  const tasks: QueueTask[] = [];
  const events = [createEvent(jobId, "jobCreated", `Created ${parsed.mode} batch queue.`)];
  const outputTargets = outputTargetsForPlan(parsed);

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

  const briefTask = operationOnly || !parsed.regenerateSchemes
    ? null
    : createTask({
        id: `${jobId}-brief`,
        jobId,
        mode: parsed.mode,
        providerId: conceptRoute.providerId,
        kind: "briefGeneration",
        model: conceptRoute.model || "concept",
        schemeIds: parsed.schemeIds,
      });
  if (briefTask) {
    tasks.push(briefTask);
    events.push(createEvent(jobId, "taskQueued", "Queued brief generation.", briefTask.id));
  }

  outputTargets.forEach(({ schemeId, schemeIndex, outputIndex, aspectRatio, platformPreset }) => {
    const target = inferDimensions(aspectRatio, parsed.customSize);
    const imageTask = operationOnly || !parsed.includeImageGeneration
      ? null
      : createTask({
          id: `${jobId}-image-${outputIndex + 1}`,
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
        id: `${jobId}-${kind}-${outputIndex + 1}`,
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
	        ...(kind === "imageEdit" && parsed.editInstruction ? { editInstruction: parsed.editInstruction } : {}),
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
