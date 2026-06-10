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
    error: null,
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
    error: null,
  });
}

function taskCancelled(task: QueueTask): QueueTask {
  return QueueTaskSchema.parse({
    ...task,
    status: "cancelled",
    stage: "done",
    progress: task.status === "running" ? task.progress : 0,
    error: null,
  });
}

function event(
  jobId: string,
  type: "jobStarted" | "taskStarted" | "taskSucceeded" | "taskFailed" | "jobCompleted" | "jobCancelled",
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
  return kind === "briefGeneration"
    || kind === "imageGeneration"
    || kind === "imageEdit"
    || kind === "upscale"
    || kind === "backgroundRemoval";
}

export type MockQueueRunResult = {
  plan: QueuePlan;
  summary: QueueSummary;
  workspace?: WorkspaceSnapshot;
};

export type MockQueueRunOptions = {
  adapter?: GenerationProviderAdapter;
  registry?: ProviderAdapterRegistry;
  storedConfig?: StoredProviderConfig | null;
  credentialRef?: ProviderCredentialRef;
  credentialRefs?: Partial<Record<ProviderId, ProviderCredentialRef>>;
  credentialResolver?: CredentialResolver;
  snapshot?: WorkspaceSnapshot;
  isCancellationRequested?: (jobId: string) => boolean;
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
  const schemeCount = Array.isArray(task.input.schemeIds) && task.input.schemeIds.length > 0
    ? task.input.schemeIds.length
    : 1;
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
    languageTargets: ["en-US"],
    schemeCount,
  });

  return ProviderMappedRequestSchema.parse({
    kind: "briefGeneration",
    providerId,
    model,
    promptPackageId: mappedPromptPackageId(initialPlan.job.id, task.id),
    request,
  });
}

function snapshotWithBriefTaskSchemeSelection(
  snapshot: WorkspaceSnapshot,
  mode: QueuePlan["job"]["mode"],
  task: QueueTask,
): WorkspaceSnapshot {
  const schemeIds = Array.isArray(task.input.schemeIds)
    ? task.input.schemeIds.map((id) => String(id)).filter(Boolean)
    : [];
  if (schemeIds.length === 0) return snapshot;

  const next = cloneWorkspaceSnapshot(snapshot);
  const modeIndex = next.modeStates.findIndex((item) => item.mode === mode);
  if (modeIndex < 0) return next;

  const modeState = next.modeStates[modeIndex]!;
  next.modeStates[modeIndex] = {
    ...modeState,
    selectedSchemeIds: schemeIds,
    outputSettings: {
      ...modeState.outputSettings,
      schemeCount: schemeIds.length,
    },
  };
  return next;
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
	      editInstruction: task.input.editInstruction || "Mock edit",
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
    const queueSnapshot = snapshotWithBriefTaskSchemeSelection(snapshot, initialPlan.job.mode, task);
    const promptPackage = createBriefPromptPackage({
      snapshot: queueSnapshot,
      mode: initialPlan.job.mode,
    });
    return mapPromptPackageToProviderRequest({
      promptPackage,
      snapshot: queueSnapshot,
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

  if (task.kind === "imageEdit") {
    const promptPackage = createImagePromptPackage({
      snapshot,
      mode: initialPlan.job.mode,
      schemeId: task.input.schemeId,
      ...(task.input.platformPreset ? { platformPreset: task.input.platformPreset } : {}),
      ...(task.input.aspectRatio ? { aspectRatio: task.input.aspectRatio } : {}),
      ...(task.input.width ? { width: task.input.width } : {}),
      ...(task.input.height ? { height: task.input.height } : {}),
    });
    const imageMapped = mapPromptPackageToProviderRequest({
      promptPackage,
      snapshot,
      providerId,
      kind: "imageGeneration",
      model,
      count: 1,
      jobId: initialPlan.job.id,
    });
    if (imageMapped.kind !== "imageGeneration") return null;
    return ProviderMappedRequestSchema.parse({
      kind: "imageEdit",
      providerId,
      model,
      promptPackageId: mappedPromptPackageId(initialPlan.job.id, task.id),
      request: ImageEditRequestSchema.parse({
	        ...imageMapped.request,
	        sourceResultId: task.input.sourceResultId || "mock-result",
	        editInstruction: task.input.editInstruction || "Create a useful alternate version of the selected result. Keep the same scheme and asset identity, but vary camera energy, effects, finish, and minor composition details.",
	      }),
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
  const credentialRef = options.credentialRefs?.[providerId]
    || (options.credentialRef?.providerId === providerId ? options.credentialRef : undefined);
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
  if ("schemes" in response.value) {
    return {
      ok: true,
      providerResultIds: response.value.schemes.map((_, index) => `brief-scheme-${index + 1}`),
      metadata: {
        ...taskExecutionMetadata(useCredentialBoundary),
        providerModel: response.value.model,
        briefSchemes: response.value.schemes,
        ...(response.value.usage ? { providerUsage: response.value.usage } : {}),
      },
    };
  }

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

function cloneWorkspaceSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as WorkspaceSnapshot;
}

function imageSchemeIds(plan: QueuePlan): string[] {
  const imageTaskIds = Array.from(new Set(
    plan.tasks
      .filter((task) => task.kind === "imageGeneration" && typeof task.input.schemeId === "string")
      .map((task) => String(task.input.schemeId)),
  ));
  if (imageTaskIds.length > 0) return imageTaskIds;
  const briefTask = plan.tasks.find((task) => task.kind === "briefGeneration");
  return Array.isArray(briefTask?.input.schemeIds)
    ? briefTask.input.schemeIds.map((id) => String(id)).filter(Boolean)
    : [];
}

function promptBlock(title: string, text: unknown) {
  const value = typeof text === "string" ? trimAtBoundary(text.trim(), 1200) : "";
  return value ? { title, text: value } : null;
}

function stringValue(value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return trimAtBoundary(text || fallback, maxLength);
}

function trimAtBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength).trimEnd();
  const boundary = Math.max(
    clipped.lastIndexOf("\n\n"),
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("。"),
    clipped.lastIndexOf("; "),
    clipped.lastIndexOf("；"),
    clipped.lastIndexOf(" "),
  );
  return (boundary > maxLength * 0.72 ? clipped.slice(0, boundary + 1) : clipped).trimEnd();
}

function sloganValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, 120);
  return text || undefined;
}

function schemeSlogans(source: Record<string, unknown>, current: WorkspaceSnapshot["schemes"][number] | null) {
  const raw = source.slogans && typeof source.slogans === "object" ? source.slogans as Record<string, unknown> : {};
  const slogans = Object.fromEntries(
    ["zh-CN", "en-US", "ja-JP", "ko-KR"]
      .map((language) => [language, sloganValue(raw[language])] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  );
  return Object.keys(slogans).length > 0 ? slogans : current?.slogans || {};
}

function applyBriefSchemesToSnapshot(
  snapshot: WorkspaceSnapshot | undefined,
  plan: QueuePlan,
  task: QueueTask,
): WorkspaceSnapshot | undefined {
  if (!snapshot || task.kind !== "briefGeneration") return snapshot;

  const briefSchemes = task.output.metadata.briefSchemes;
  if (!Array.isArray(briefSchemes) || briefSchemes.length === 0) return snapshot;

  const next = cloneWorkspaceSnapshot(snapshot);
  const targetSchemeIds = imageSchemeIds(plan);
  const now = nowIso();

  briefSchemes.forEach((briefScheme, index) => {
    if (!briefScheme || typeof briefScheme !== "object") return;

    const source = briefScheme as Record<string, unknown>;
    const schemeId = targetSchemeIds[index] || targetSchemeIds[0] || `scheme-${plan.job.mode}-${index + 1}`;
    const currentIndex = next.schemes.findIndex((scheme) => scheme.id === schemeId);
    const current = currentIndex >= 0 ? next.schemes[currentIndex] ?? null : null;
    const promptBlocks = [
      promptBlock("视觉方向", source.brief),
      promptBlock("中文提示词", source.promptZh || source.prompt),
      promptBlock("English Prompt", source.promptEn || source.prompt),
    ].filter((item): item is { title: string; text: string } => Boolean(item));

    const updatedScheme = {
      ...(current || {
        id: schemeId,
        projectId: next.project.id,
        mode: plan.job.mode,
        code: `${plan.job.mode.slice(0, 2).toUpperCase()}-${String(index + 1).padStart(2, "0")}`,
        lockedFields: [],
        outputPresets: [],
      }),
      title: stringValue(source.title, current?.title || "海报生成方案", 120),
      brief: stringValue(source.brief, current?.brief || "AI 生成的海报设计方案。", 1200),
      slogans: schemeSlogans(source, current),
      promptBlocks,
      status: "ready",
    };

    if (currentIndex >= 0) next.schemes[currentIndex] = updatedScheme as WorkspaceSnapshot["schemes"][number];
    else next.schemes.push(updatedScheme as WorkspaceSnapshot["schemes"][number]);
  });

  next.metadata = {
    ...next.metadata,
    updatedAt: now,
  };
  return next;
}

function applyBriefFailureToSnapshot(
  snapshot: WorkspaceSnapshot | undefined,
  plan: QueuePlan,
  task: QueueTask,
): WorkspaceSnapshot | undefined {
  if (!snapshot || task.kind !== "briefGeneration" || !task.error) return snapshot;

  const next = cloneWorkspaceSnapshot(snapshot);
  const targetSchemeIds = imageSchemeIds(plan);
  const message = stringValue(task.error.userMessage || task.error.message, "方案生成失败。", 900);
  const detail = task.error.message && task.error.message !== task.error.userMessage
    ? stringValue(task.error.message, "", 900)
    : "";
  const now = nowIso();

  targetSchemeIds.forEach((schemeId, index) => {
    const currentIndex = next.schemes.findIndex((scheme) => scheme.id === schemeId);
    if (currentIndex < 0) return;
    const current = next.schemes[currentIndex];
    if (!current) return;

    next.schemes[currentIndex] = {
      ...current,
      title: current.title.startsWith("待生成") ? `方案生成失败 ${index + 1}` : current.title,
      brief: message,
      promptBlocks: [
        { title: "失败原因", text: message },
        ...(detail ? [{ title: "Provider 原始信息", text: detail }] : []),
        { title: "下一步", text: "请重新点击生成方案批次。系统会在 Google 方案模型高负载时自动尝试备用模型。" },
      ],
      status: "failed",
    };
  });

  next.metadata = {
    ...next.metadata,
    updatedAt: now,
  };
  return next;
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
  let workingSnapshot = options.snapshot ? cloneWorkspaceSnapshot(options.snapshot) : undefined;
  const events: QueueEvent[] = [...initialPlan.events, event(initialPlan.job.id, "jobStarted", "Started mock queue run.")];
  let cancelled = Boolean(options.isCancellationRequested?.(initialPlan.job.id));

  function cancelOpenTasks(currentTaskId = "") {
    tasks = tasks.map((task) => {
      if (["succeeded", "failed", "cancelled", "skipped"].includes(task.status)) return task;
      if (currentTaskId && task.id !== currentTaskId && task.status === "running") return task;
      return taskCancelled(task);
    });
  }

  for (const originalTask of tasks) {
    if (cancelled || options.isCancellationRequested?.(initialPlan.job.id)) {
      cancelled = true;
      cancelOpenTasks();
      events.push(event(initialPlan.job.id, "jobCancelled", "Cancelled queue run before starting the next task."));
      break;
    }

    const latestTask = tasks.find((task) => task.id === originalTask.id) || originalTask;
    if (!canRun(latestTask, tasks)) continue;

    const started = taskStarted({ ...latestTask, status: "queued" });
    tasks = tasks.map((task) => (task.id === started.id ? started : task));
    events.push(event(initialPlan.job.id, "taskStarted", `Started ${started.kind}.`, started.id));

    let providerResultIds: string[] = [];
    let providerMetadata: Record<string, unknown> = {};
    if (providerRequestKind(started.kind)) {
      const execution = await executeProviderTask(initialPlan, started, {
        ...options,
        ...(workingSnapshot ? { snapshot: workingSnapshot } : {}),
      });
      if (options.isCancellationRequested?.(initialPlan.job.id)) {
        cancelled = true;
        tasks = tasks.map((task) => (task.id === started.id ? taskCancelled(started) : task));
        cancelOpenTasks(started.id);
        events.push(event(initialPlan.job.id, "jobCancelled", "Cancelled queue run after provider response.", started.id));
        break;
      }
      if (!execution.ok) {
        const failed = taskFailed(started, execution.error);
        tasks = tasks.map((task) => (task.id === failed.id ? failed : task));
        workingSnapshot = applyBriefFailureToSnapshot(workingSnapshot, initialPlan, failed);
        events.push(event(initialPlan.job.id, "taskFailed", `Failed ${failed.kind}: ${execution.error.code}.`, failed.id));
        continue;
      }
      providerResultIds = execution.providerResultIds;
      providerMetadata = execution.metadata;
    }

    if (options.isCancellationRequested?.(initialPlan.job.id)) {
      cancelled = true;
      tasks = tasks.map((task) => (task.id === started.id ? taskCancelled(started) : task));
      cancelOpenTasks(started.id);
      events.push(event(initialPlan.job.id, "jobCancelled", "Cancelled queue run before persisting task output.", started.id));
      break;
    }

    const completed = taskSucceeded(started, providerResultIds, providerMetadata);
    tasks = tasks.map((task) => (task.id === completed.id ? completed : task));
    workingSnapshot = applyBriefSchemesToSnapshot(workingSnapshot, initialPlan, completed);
    events.push(event(initialPlan.job.id, "taskSucceeded", `Completed ${completed.kind}.`, completed.id));
  }

  const status = cancelled || tasks.some((task) => task.status === "cancelled")
    ? "cancelled"
    : tasks.every((task) => task.status === "succeeded")
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
    events: [
      ...events,
      event(
        initialPlan.job.id,
        status === "cancelled" ? "jobCancelled" : "jobCompleted",
        status === "cancelled" ? "Queue run cancelled." : `Mock queue ${status}.`,
      ),
    ],
  });

  return {
    plan,
    summary: summarizeQueue(plan),
    ...(workingSnapshot ? { workspace: workingSnapshot } : {}),
  };
}
