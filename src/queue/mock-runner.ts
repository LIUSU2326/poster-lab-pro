import { createProviderConfigDefaults } from "../schema/zod-defaults";
import type { ProviderId } from "../schema/zod";
import { createBriefPromptPackage, createImagePromptPackage } from "../prompts/builder";
import { createMockProviderAdapter } from "../providers/mock-adapter";
import { getProviderManifest } from "../providers/manifests";
import {
  BackgroundRemovalRequestSchema,
  BriefGenerationRequestSchema,
  ImageGenerationRequestSchema,
  ImageEditRequestSchema,
  UpscaleRequestSchema,
  createProviderError,
  modeGuardrails,
  type GenerationProviderAdapter,
  ProviderModelSlotSchema,
  type ProviderError,
} from "../providers/contracts";
import {
  ProviderMappedRequestSchema,
  mapPromptPackageToProviderRequest,
  type ProviderMappedRequest,
} from "../providers/request-mapper";
import {
  executeMappedProviderRequest,
  executeMappedProviderRequestWithCredentials,
  type ProviderAdapterRegistry,
} from "../providers/executor";
import type { CredentialResolver, ProviderCredentialRef } from "../providers/credentials";
import type { StoredProviderConfig } from "../storage/contracts";
import {
  QueueEventSchema,
  QueuePlanSchema,
  QueueTaskSchema,
  summarizeQueue,
  type QueueEvent,
  type QueuePlan,
  type QueueTask,
  type QueueTaskKind,
  type QueueSummary,
} from "./contracts";
import type { WorkspaceSnapshot } from "../storage/contracts";

function nowIso() {
  return new Date().toISOString();
}

function taskSucceeded(task: QueueTask, providerResultIds: string[] = [], metadata: Record<string, unknown> = {}): QueueTask {
  return QueueTaskSchema.parse({
    ...task,
    status: "succeeded",
    stage: "done",
    progress: 100,
    attempts: task.attempts + 1,
    output: {
      providerResultIds,
      status: "ready",
      metadata,
    },
    cost: {
      ...task.cost,
      actualCost: task.cost.estimatedCost,
    },
    elapsedMs: task.elapsedMs + 250,
  });
}

function taskStarted(task: QueueTask): QueueTask {
  return QueueTaskSchema.parse({
    ...task,
    status: "running",
    stage: task.providerCapability ? "providerCall" : "persisting",
    progress: 50,
  });
}

function event(
  jobId: string,
  type: "jobStarted" | "taskStarted" | "taskSucceeded" | "taskFailed" | "jobCompleted",
  message: string,
  taskId?: string,
) {
  return QueueEventSchema.parse({
    id: `event-${jobId}-${type}-${taskId || Date.now()}`,
    jobId,
    taskId,
    type,
    message,
    createdAt: nowIso(),
  });
}

function canRun(task: QueueTask, tasks: QueueTask[]) {
  return task.dependsOn.every((dependencyId) => tasks.find((candidate) => candidate.id === dependencyId)?.status === "succeeded");
}

function providerRequestKind(kind: QueueTaskKind) {
  return kind === "imageGeneration" || kind === "imageEdit" || kind === "upscale" || kind === "backgroundRemoval";
}

export type MockQueueRunResult = {
  plan: QueuePlan;
  summary: QueueSummary;
};

export type MockQueueRunOptions = {
  adapter?: GenerationProviderAdapter;
  registry?: ProviderAdapterRegistry;
  storedConfig?: StoredProviderConfig | null;
  credentialRef?: ProviderCredentialRef;
  credentialResolver?: CredentialResolver;
  snapshot?: WorkspaceSnapshot;
};

function isAdapter(value: GenerationProviderAdapter | MockQueueRunOptions | undefined): value is GenerationProviderAdapter {
  return Boolean(value && "manifest" in value && "validateConfig" in value);
}

function normalizeOptions(input?: GenerationProviderAdapter | MockQueueRunOptions): MockQueueRunOptions {
  return isAdapter(input) ? { adapter: input } : input || {};
}

function taskFailed(task: QueueTask, error: ProviderError): QueueTask {
  return QueueTaskSchema.parse({
    ...task,
    status: "failed",
    stage: "done",
    progress: 100,
    attempts: task.attempts + 1,
    output: {
      providerResultIds: [],
      status: "failed",
      metadata: {
        providerExecution: "credential-aware",
      },
    },
    error,
    cost: {
      ...task.cost,
      actualCost: 0,
    },
    elapsedMs: task.elapsedMs + 250,
  });
}

function taskExecutionMetadata(useCredentialBoundary: boolean) {
  return {
    providerExecution: useCredentialBoundary ? "credential-aware" : "direct-adapter",
  };
}

function mappedPromptPackageId(jobId: string, taskId: string) {
  return `queue-${jobId}-${taskId}`;
}

function providerIdForTask(initialPlan: QueuePlan, task: QueueTask): ProviderId {
  return task.providerId || initialPlan.job.providerId;
}

function storedConfigForTask(providerId: ProviderId, options: MockQueueRunOptions): StoredProviderConfig | null {
  const snapshotConfig = options.snapshot?.providerConfigs?.[providerId];
  if (snapshotConfig) return snapshotConfig;
  if (options.storedConfig?.providerId === providerId) return options.storedConfig;
  return null;
}

function createBriefMappedRequest(initialPlan: QueuePlan, task: QueueTask, model: string): ProviderMappedRequest {
  const providerId = providerIdForTask(initialPlan, task);
  const request = BriefGenerationRequestSchema.parse({
    context: {
      projectId: initialPlan.job.projectId,
      mode: initialPlan.job.mode,
      providerId,
      jobId: initialPlan.job.id,
    },
    projectName: initialPlan.job.title,
    gameDescription: `Queue brief context for ${initialPlan.job.mode}.`,
    assets: [],
    guardrails: modeGuardrails(initialPlan.job.mode),
    languageTargets: ["zh-CN", "en-US"],
    schemeCount: 1,
  });

  return ProviderMappedRequestSchema.parse({
    kind: "briefGeneration",
    providerId,
    model,
    promptPackageId: mappedPromptPackageId(initialPlan.job.id, task.id),
    request,
  });
}

function createImageMappedRequest(initialPlan: QueuePlan, task: QueueTask, model: string): ProviderMappedRequest {
  const providerId = providerIdForTask(initialPlan, task);
  const request = ImageGenerationRequestSchema.parse({
    context: {
      projectId: initialPlan.job.projectId,
      mode: initialPlan.job.mode,
      providerId,
      jobId: initialPlan.job.id,
    },
    schemeId: task.input.schemeId || "mock-scheme",
    prompt: task.input.prompt || modeGuardrails(initialPlan.job.mode).rules.join(" "),
    platformPreset: task.input.platformPreset || "custom",
    aspectRatio: task.input.aspectRatio || "1:1",
    width: task.input.width || 1024,
    height: task.input.height || 1024,
    model,
    count: task.input.count || 1,
  });

  return ProviderMappedRequestSchema.parse({
    kind: "imageGeneration",
    providerId,
    model,
    promptPackageId: mappedPromptPackageId(initialPlan.job.id, task.id),
    request,
  });
}

function createImageEditMappedRequest(initialPlan: QueuePlan, task: QueueTask, model: string): ProviderMappedRequest {
  const providerId = providerIdForTask(initialPlan, task);
  const base = createImageMappedRequest(initialPlan, task, model);
  return ProviderMappedRequestSchema.parse({
    kind: "imageEdit",
    providerId,
    model,
    promptPackageId: mappedPromptPackageId(initialPlan.job.id, task.id),
    request: ImageEditRequestSchema.parse({
      ...base.request,
      sourceResultId: task.input.sourceResultId || "mock-result",
      editInstruction: "Mock edit",
    }),
  });
}

function createUpscaleMappedRequest(initialPlan: QueuePlan, task: QueueTask, model: string): ProviderMappedRequest {
  const providerId = providerIdForTask(initialPlan, task);
  return ProviderMappedRequestSchema.parse({
    kind: "upscale",
    providerId,
    model,
    promptPackageId: mappedPromptPackageId(initialPlan.job.id, task.id),
    request: UpscaleRequestSchema.parse({
      context: {
        projectId: initialPlan.job.projectId,
        mode: initialPlan.job.mode,
        providerId,
        jobId: initialPlan.job.id,
      },
      sourceResultId: task.input.sourceResultId || "mock-result",
      model,
      scale: 2,
    }),
  });
}

function createBackgroundRemovalMappedRequest(initialPlan: QueuePlan, task: QueueTask, model: string): ProviderMappedRequest {
  const providerId = providerIdForTask(initialPlan, task);
  return ProviderMappedRequestSchema.parse({
    kind: "backgroundRemoval",
    providerId,
    model,
    promptPackageId: mappedPromptPackageId(initialPlan.job.id, task.id),
    request: BackgroundRemovalRequestSchema.parse({
      context: {
        projectId: initialPlan.job.projectId,
        mode: initialPlan.job.mode,
        providerId,
        jobId: initialPlan.job.id,
      },
      sourceResultId: task.input.sourceResultId || "mock-result",
      model,
      outputBackground: "transparent",
    }),
  });
}

function createMappedRequestForTask(initialPlan: QueuePlan, task: QueueTask, model: string): ProviderMappedRequest | null {
  if (task.kind === "briefGeneration") return createBriefMappedRequest(initialPlan, task, model);
  if (task.kind === "imageGeneration") return createImageMappedRequest(initialPlan, task, model);
  if (task.kind === "imageEdit") return createImageEditMappedRequest(initialPlan, task, model);
  if (task.kind === "upscale") return createUpscaleMappedRequest(initialPlan, task, model);
  if (task.kind === "backgroundRemoval") return createBackgroundRemovalMappedRequest(initialPlan, task, model);
  return null;
}

function createSnapshotMappedRequestForTask(
  initialPlan: QueuePlan,
  task: QueueTask,
  model: string,
  snapshot: WorkspaceSnapshot,
): ProviderMappedRequest | null {
  const providerId = providerIdForTask(initialPlan, task);
  if (task.kind === "briefGeneration") {
    const promptPackage = createBriefPromptPackage({
      snapshot,
      mode: initialPlan.job.mode,
    });
    return mapPromptPackageToProviderRequest({
      promptPackage,
      snapshot,
      providerId,
      kind: "briefGeneration",
      model,
      jobId: initialPlan.job.id,
    });
  }

  if (task.kind === "imageGeneration") {
    const promptPackage = createImagePromptPackage({
      snapshot,
      mode: initialPlan.job.mode,
      schemeId: task.input.schemeId,
      ...(task.input.platformPreset ? { platformPreset: task.input.platformPreset } : {}),
      ...(task.input.aspectRatio ? { aspectRatio: task.input.aspectRatio } : {}),
      ...(task.input.width ? { width: task.input.width } : {}),
      ...(task.input.height ? { height: task.input.height } : {}),
    });
    return mapPromptPackageToProviderRequest({
      promptPackage,
      snapshot,
      providerId,
      kind: "imageGeneration",
      model,
      count: task.input.count || 1,
      jobId: initialPlan.job.id,
    });
  }

  return createMappedRequestForTask(initialPlan, task, model);
}

async function executeProviderTask(
  initialPlan: QueuePlan,
  task: QueueTask,
  options: MockQueueRunOptions,
): Promise<{ ok: true; providerResultIds: string[]; metadata: Record<string, unknown> } | { ok: false; error: ProviderError }> {
  const providerId = providerIdForTask(initialPlan, task);
  const storedConfig = storedConfigForTask(providerId, options);
  const config = createProviderConfigDefaults(providerId);
  const model = resolveTaskModel(task, config, storedConfig);
  const mappedRequest = options.snapshot
    ? createSnapshotMappedRequestForTask(initialPlan, task, model, options.snapshot)
    : createMappedRequestForTask(initialPlan, task, model);
  if (!mappedRequest) return { ok: true, providerResultIds: [], metadata: {} };

  const manifest = getProviderManifest(providerId);
  const adapter = options.adapter || createMockProviderAdapter(manifest);
  const registry = options.registry || ({ [providerId]: adapter } as ProviderAdapterRegistry);
  const useCredentialBoundary = Boolean(storedConfig);
  const credentialRef = options.credentialRef?.providerId === providerId ? options.credentialRef : undefined;
  const response = storedConfig
    ? await executeMappedProviderRequestWithCredentials(
        {
          mappedRequest,
          storedConfig,
          ...(credentialRef ? { credentialRef } : {}),
        },
        options.credentialResolver,
        registry,
      )
    : await executeMappedProviderRequest(
        {
          mappedRequest,
          config,
        },
        registry,
      );

  if (!response.ok) return { ok: false, error: response.error };
  const providerAssets = "assets" in response.value ? response.value.assets : [];
  const providerResultIds = providerAssets.map((asset) => asset.id);
  return {
    ok: true,
    providerResultIds,
    metadata: {
      ...taskExecutionMetadata(useCredentialBoundary),
      requestedOutput: {
        width: task.input.width || null,
        height: task.input.height || null,
        aspectRatio: task.input.aspectRatio || null,
        platformPreset: task.input.platformPreset || null,
      },
      providerAssets,
    },
  };
}

function resolveTaskModel(
  task: QueueTask,
  config: ReturnType<typeof createProviderConfigDefaults>,
  storedConfig: StoredProviderConfig | null,
): string {
  const candidate = task.input.model?.trim();
  if (candidate) {
    const slot = ProviderModelSlotSchema.safeParse(candidate);
    if (!slot.success) return candidate;
    const storedSlot = storedConfig?.modelSlots[slot.data]?.trim();
    const configSlot = config.modelSlots[slot.data]?.trim();
    return storedSlot || configSlot || storedConfig?.defaultModel || config.defaultModel || candidate;
  }

  return storedConfig?.defaultModel || config.defaultModel || "mock-model";
}

export async function runMockQueuePlan(
  initialPlan: QueuePlan,
  optionsOrAdapter?: GenerationProviderAdapter | MockQueueRunOptions,
): Promise<MockQueueRunResult> {
  const options = normalizeOptions(optionsOrAdapter);
  let tasks = initialPlan.tasks;
  const events: QueueEvent[] = [...initialPlan.events, event(initialPlan.job.id, "jobStarted", "Started mock queue run.")];

  for (const originalTask of tasks) {
    const latestTask = tasks.find((task) => task.id === originalTask.id) || originalTask;
    if (!canRun(latestTask, tasks)) continue;

    const started = taskStarted({ ...latestTask, status: "queued" });
    tasks = tasks.map((task) => (task.id === started.id ? started : task));
    events.push(event(initialPlan.job.id, "taskStarted", `Started ${started.kind}.`, started.id));

    let providerResultIds: string[] = [];
    let providerMetadata: Record<string, unknown> = {};
    if (providerRequestKind(started.kind)) {
      const execution = await executeProviderTask(initialPlan, started, options);
      if (!execution.ok) {
        const failed = taskFailed(started, execution.error);
        tasks = tasks.map((task) => (task.id === failed.id ? failed : task));
        events.push(event(initialPlan.job.id, "taskFailed", `Failed ${failed.kind}: ${execution.error.code}.`, failed.id));
        continue;
      }
      providerResultIds = execution.providerResultIds;
      providerMetadata = execution.metadata;
    }

    const completed = taskSucceeded(started, providerResultIds, providerMetadata);
    tasks = tasks.map((task) => (task.id === completed.id ? completed : task));
    events.push(event(initialPlan.job.id, "taskSucceeded", `Completed ${completed.kind}.`, completed.id));
  }

  const status = tasks.every((task) => task.status === "succeeded")
    ? "completed"
    : tasks.some((task) => task.status === "failed")
      ? "failed"
      : "partial";
  const plan = QueuePlanSchema.parse({
    job: {
      ...initialPlan.job,
      status,
      updatedAt: nowIso(),
    },
    tasks,
    events: [...events, event(initialPlan.job.id, "jobCompleted", `Mock queue ${status}.`)],
  });

  return {
    plan,
    summary: summarizeQueue(plan),
  };
}
