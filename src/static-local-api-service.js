function nowIso() {
  return new Date().toISOString();
}

let traceIndex = 0;

function createTraceId() {
  traceIndex += 1;
  return `trace-static-service-${Date.now().toString(36)}-${traceIndex}`;
}

function createMeta(snapshot) {
  return {
    traceId: createTraceId(),
    workspaceId: snapshot?.metadata?.workspaceId,
    revision: snapshot?.metadata?.revision,
    createdAt: nowIso(),
  };
}

function success(data, snapshot) {
  return {
    ok: true,
    data,
    meta: createMeta(snapshot),
  };
}

function failure(code, message, { fieldErrors = {}, details = {}, snapshot = null } = {}) {
  return {
    ok: false,
    error: {
      code,
      message,
      fieldErrors,
      details,
    },
    meta: createMeta(snapshot),
  };
}

function summarizeWorkspaceSnapshot(snapshot) {
  return {
    workspaceId: snapshot.metadata.workspaceId,
    projectId: snapshot.project.id,
    projectName: snapshot.project.name,
    activeMode: snapshot.activeMode,
    revision: snapshot.metadata.revision,
    assetCount: snapshot.assets.length,
    schemeCount: snapshot.schemes.length,
    resultCount: snapshot.results.length,
    runningQueueCount: snapshot.queuePlans.filter((plan) => ["running", "queued"].includes(plan.job?.status)).length,
    updatedAt: snapshot.metadata.updatedAt,
  };
}

function findModeState(snapshot, mode) {
  return snapshot.modeStates.find((item) => item.mode === mode);
}

function findScheme(snapshot, schemeId, mode) {
  return snapshot.schemes.find((item) => item.id === schemeId) ||
    snapshot.schemes.find((item) => item.mode === mode);
}

function inferSize(aspectRatio) {
  const explicit = String(aspectRatio || "").match(/^(\d{3,5})x(\d{3,5})$/);
  if (explicit) return { width: Number(explicit[1]), height: Number(explicit[2]) };
  if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
  if (aspectRatio === "16:9") return { width: 1920, height: 1080 };
  if (aspectRatio === "4:3") return { width: 1600, height: 1200 };
  if (aspectRatio === "3:4") return { width: 1200, height: 1600 };
  return { width: 1024, height: 1024 };
}

function createPromptSections({ snapshot, modeState, scheme }) {
  return [
    {
      id: "project",
      title: "Project Context",
      source: "project",
      required: true,
      locked: false,
      priority: 100,
      content: [
        `Game: ${snapshot.project.name}`,
        `Description: ${snapshot.project.description}`,
        `Focus: ${modeState.projectBrief.focusGuidance || "none"}`,
      ].join("\n"),
    },
    {
      id: "mode",
      title: "Mode Configuration",
      source: "mode",
      required: true,
      locked: ["collab", "logo", "icon"].includes(modeState.mode),
      priority: 90,
      content: JSON.stringify(modeState.modeForm),
    },
    {
      id: "scheme",
      title: "Selected Scheme",
      source: "scheme",
      required: true,
      locked: false,
      priority: 85,
      content: scheme ? `${scheme.title}\n${scheme.brief}` : "No scheme selected.",
    },
  ];
}

function buildPromptPackage(payload) {
  const snapshot = payload.snapshot;
  const mode = payload.mode || snapshot.activeMode;
  const modeState = findModeState(snapshot, mode);
  if (!modeState) throw new Error(`Missing mode state for ${mode}.`);

  const scheme = findScheme(snapshot, payload.schemeId, mode);
  if (payload.target === "image" && !scheme) throw new Error("Image prompt packages require a scheme.");

  const aspectRatio = payload.aspectRatio || modeState.outputSettings.aspectRatios[0] || "1:1";
  const size = inferSize(aspectRatio);
  const platformPreset = payload.platformPreset || modeState.outputSettings.platformPresets[0] || "custom";
  const sections = createPromptSections({ snapshot, modeState, scheme });
  const guardrails = [
    { id: `${mode}-static-hard-rule`, severity: "hard", rule: `Follow ${mode} production guardrails.` },
  ];
  const finalPrompt = [
    sections.map((section) => `## ${section.title}\n${section.content}`).join("\n\n"),
    "## Mode Guardrails",
    guardrails.map((item) => item.rule).join("\n"),
  ].join("\n\n");

  return {
    id: `prompt-${payload.target || "image"}-${mode}-${scheme?.id || "workspace"}`,
    target: payload.target || "image",
    projectId: snapshot.project.id,
    mode,
    schemeId: scheme?.id || null,
    sections,
    assets: snapshot.assets.map((asset) => ({
      assetId: asset.id,
      role: asset.role,
      label: asset.label,
      binding: asset.role === "gameLogo" ? "logoLock" : "subjectReference",
      required: ["gameCharacter", "gameLogo", "subjectReference"].includes(asset.role),
      placeholder: null,
    })),
    platform: {
      platformPreset,
      aspectRatio,
      width: payload.width || modeState.outputSettings.customSize?.width || size.width,
      height: payload.height || modeState.outputSettings.customSize?.height || size.height,
      safeArea: "Keep logo, headline, and main subject clear after platform cropping.",
      copyLengthHint: "Campaign slogan should stay punchy and legible.",
    },
    slogans: scheme?.slogans || {},
    guardrails,
    negativePrompt: "",
    finalPrompt,
    validation: {
      ok: true,
      errors: [],
      warnings: snapshot.assets.length ? [] : ["No reference assets are attached."],
      lockedFields: scheme?.lockedFields || [],
    },
  };
}

function resolveModel(snapshot, providerId, slot) {
  const config = snapshot.providerConfigs?.[providerId];
  return config?.modelSlots?.[slot] || config?.defaultModel || (slot === "image" ? "gpt-image-2" : "gpt-5.2");
}

function mapProviderRequestPayload(payload) {
  const kind = payload.kind || (payload.promptPackage.target === "brief" ? "briefGeneration" : "imageGeneration");
  const model = payload.model || resolveModel(payload.snapshot, payload.providerId, kind === "imageGeneration" ? "image" : "concept");
  const base = {
    kind,
    providerId: payload.providerId,
    model,
    promptPackageId: payload.promptPackage.id,
  };

  if (kind === "briefGeneration") {
    return {
      ...base,
      request: {
        context: {
          projectId: payload.promptPackage.projectId,
          mode: payload.promptPackage.mode,
          providerId: payload.providerId,
          traceId: payload.traceId,
        },
        projectName: payload.snapshot.project.name,
        gameDescription: payload.snapshot.project.description,
        assets: payload.promptPackage.assets,
        guardrails: payload.promptPackage.guardrails,
        languageTargets: ["zh-CN", "en-US"],
        schemeCount: findModeState(payload.snapshot, payload.promptPackage.mode)?.outputSettings.schemeCount || 1,
      },
    };
  }

  if (!payload.promptPackage.schemeId) throw new Error("Image generation requests require a scheme id.");
  return {
    ...base,
    request: {
      context: {
        projectId: payload.promptPackage.projectId,
        mode: payload.promptPackage.mode,
        providerId: payload.providerId,
        traceId: payload.traceId,
      },
      schemeId: payload.promptPackage.schemeId,
      prompt: payload.promptPackage.finalPrompt,
      assets: payload.promptPackage.assets,
      platformPreset: payload.promptPackage.platform.platformPreset,
      aspectRatio: payload.promptPackage.platform.aspectRatio,
      width: payload.promptPackage.platform.width,
      height: payload.promptPackage.platform.height,
      model,
      count: payload.count || 1,
    },
  };
}

function estimateTaskCost(kind, count = 1) {
  if (kind === "briefGeneration") return 0.02;
  if (kind === "imageGeneration") return 0.05 * Math.max(1, count);
  if (kind === "imageEdit") return 0.04 * Math.max(1, count);
  if (kind === "upscale") return 0.02 * Math.max(1, count);
  if (kind === "backgroundRemoval") return 0.02 * Math.max(1, count);
  return 0;
}

function createQueueTask({
  id,
  jobId,
  kind,
  mode,
  providerId,
  schemeId = null,
  dependsOn = [],
  count = 1,
  platformPreset = null,
  aspectRatio = null,
  width = null,
  height = null,
}) {
  const providerCapability = ["briefGeneration", "imageGeneration", "imageEdit", "upscale", "backgroundRemoval"].includes(kind)
    ? kind
    : null;
  return {
    id,
    jobId,
    parentTaskId: null,
    dependsOn,
    kind,
    status: dependsOn.length ? "blocked" : "queued",
    stage: dependsOn.length ? "waitingDependency" : "planning",
    providerId: providerCapability ? providerId : undefined,
    providerCapability: providerCapability || undefined,
    mode,
    attempts: 0,
    maxAttempts: 2,
    progress: 0,
    input: {
      ...(schemeId ? { schemeId } : {}),
      ...(platformPreset ? { platformPreset } : {}),
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      count,
    },
    output: { providerResultIds: [], metadata: {} },
    error: null,
    cost: { estimatedCost: providerCapability ? estimateTaskCost(kind, count) : 0, actualCost: null, currency: "USD" },
    elapsedMs: 0,
  };
}

function summarizeQueue(queuePlan) {
  const total = queuePlan.tasks.length;
  const completed = queuePlan.tasks.filter((task) => task.status === "succeeded").length;
  const failed = queuePlan.tasks.filter((task) => task.status === "failed").length;
  const running = queuePlan.tasks.filter((task) => task.status === "running").length;
  const queued = queuePlan.tasks.filter((task) => task.status === "queued" || task.status === "blocked").length;
  const cancelled = queuePlan.tasks.filter((task) => task.status === "cancelled").length;
  return {
    jobId: queuePlan.job.id,
    total,
    queued,
    running,
    completed,
    failed,
    cancelled,
    progress: total === 0 ? 0 : Math.round((completed / total) * 100),
    estimatedCost: queuePlan.tasks.reduce((sum, task) => sum + task.cost.estimatedCost, 0),
    actualCost: null,
    elapsedMs: 0,
  };
}

function createQueuePlanPayload(payload) {
  const createdAt = nowIso();
  const jobId = `job-${payload.mode}-${payload.projectId}`;
  const tasks = [];
  const events = [{
    id: `event-${jobId}-jobCreated-job`,
    jobId,
    type: "jobCreated",
    message: `Created ${payload.mode} static queue.`,
    createdAt,
  }];
  const job = {
    id: jobId,
    projectId: payload.projectId,
    mode: payload.mode,
    providerId: payload.providerId || "openai",
    status: "queued",
    title: `${payload.mode} batch production`,
    retryPolicy: { maxAttempts: 2, backoffMs: 1000, retryableErrorCodes: ["provider_unavailable", "rate_limited", "unknown"] },
    createdAt,
    updatedAt: createdAt,
  };
  const modeState = payload.snapshot?.modeStates?.find((item) => item.mode === payload.mode);
  const fallbackRatios = modeState?.outputSettings?.aspectRatios || ["1:1"];
  const fallbackPresets = modeState?.outputSettings?.platformPresets || ["custom"];
  const aspectRatios = payload.aspectRatios?.length ? payload.aspectRatios : fallbackRatios;
  const platformPresets = payload.platformPresets?.length ? payload.platformPresets : fallbackPresets;
  const customSize = payload.customSize || modeState?.outputSettings?.customSize || null;

  const briefTask = createQueueTask({
    id: `${jobId}-brief`,
    jobId,
    kind: "briefGeneration",
    mode: payload.mode,
    providerId: job.providerId,
  });
  tasks.push(briefTask);

  payload.schemeIds.forEach((schemeId, index) => {
    const rawRatio = aspectRatios[index % aspectRatios.length] || "1:1";
    const size = customSize || inferSize(rawRatio);
    const aspectRatio = customSize ? `${customSize.width}x${customSize.height}` : rawRatio;
    const platformPreset = platformPresets[index % platformPresets.length] || "custom";
    const imageTask = createQueueTask({
      id: `${jobId}-image-${index + 1}`,
      jobId,
      kind: "imageGeneration",
      mode: payload.mode,
      providerId: job.providerId,
      schemeId,
      dependsOn: [briefTask.id],
      count: payload.imagesPerScheme || 1,
      platformPreset,
      aspectRatio,
      width: size.width,
      height: size.height,
    });
    tasks.push(imageTask);

    [
      ["imageEdit", payload.includeImageEdit],
      ["upscale", payload.includeUpscale],
      ["backgroundRemoval", payload.includeBackgroundRemoval],
    ].forEach(([kind, enabled]) => {
      if (!enabled) return;
      tasks.push(createQueueTask({
        id: `${jobId}-${kind}-${index + 1}`,
        jobId,
        kind,
        mode: payload.mode,
        providerId: job.providerId,
        schemeId,
        dependsOn: [imageTask.id],
        platformPreset,
        aspectRatio,
        width: size.width,
        height: size.height,
      }));
    });
  });

  tasks.push(createQueueTask({
    id: `${jobId}-archive`,
    jobId,
    kind: "archiveSync",
    mode: payload.mode,
    providerId: job.providerId,
    dependsOn: tasks.map((task) => task.id),
  }));

  return { job, tasks, events };
}

export function createStaticLocalApiService() {
  return {
    async saveWorkspaceSnapshot(request) {
      try {
        if (!request?.snapshot?.metadata?.workspaceId) {
          return failure("validation_error", "Workspace snapshot is required.", {
            fieldErrors: { snapshot: ["Missing workspace snapshot."] },
          });
        }
        return success({ summary: summarizeWorkspaceSnapshot(request.snapshot) }, request.snapshot);
      } catch (error) {
        return failure("internal", error.message || "Failed to save workspace snapshot.", { snapshot: request?.snapshot });
      }
    },

    async createPromptPackage(request) {
      try {
        if (!request?.snapshot) {
          return failure("validation_error", "Prompt package request requires a snapshot.", {
            fieldErrors: { snapshot: ["Missing workspace snapshot."] },
          });
        }
        const promptPackage = buildPromptPackage(request);
        return success({ promptPackage }, request.snapshot);
      } catch (error) {
        return failure("validation_error", error.message || "Failed to create prompt package.", { snapshot: request?.snapshot });
      }
    },

    async mapProviderRequest(request) {
      try {
        if (!request?.promptPackage || !request?.snapshot || !request?.providerId) {
          return failure("validation_error", "Provider request mapping requires prompt package, snapshot, and provider id.", {
            fieldErrors: { request: ["Missing provider mapping input."] },
            snapshot: request?.snapshot,
          });
        }
        const mappedRequest = mapProviderRequestPayload(request);
        return success({ mappedRequest }, request.snapshot);
      } catch (error) {
        return failure("validation_error", error.message || "Failed to map provider request.", { snapshot: request?.snapshot });
      }
    },

    async createQueuePlan(request) {
      try {
        const fieldErrors = {};
        if (!request?.projectId) fieldErrors.projectId = ["Project id is required."];
        if (!request?.mode) fieldErrors.mode = ["Mode is required."];
        if (!Array.isArray(request?.schemeIds) || request.schemeIds.length === 0) {
          fieldErrors.schemeIds = ["At least one scheme id is required."];
        }
        if (Object.keys(fieldErrors).length > 0) {
          return failure("validation_error", "Queue plan request validation failed.", { fieldErrors });
        }
        const queuePlan = createQueuePlanPayload(request);
        return success({ queuePlan, summary: summarizeQueue(queuePlan) });
      } catch (error) {
        return failure("internal", error.message || "Failed to create queue plan.");
      }
    },
  };
}

export async function runStaticGenerationServiceFlow(submission) {
  const service = createStaticLocalApiService();
  const snapshot = submission.promptPackageCreate.payload.snapshot;
  const savedSnapshot = await service.saveWorkspaceSnapshot({ snapshot });
  const promptPackageCreate = savedSnapshot.ok
    ? await service.createPromptPackage(submission.promptPackageCreate.payload)
    : savedSnapshot;
  const providerRequestMap = promptPackageCreate.ok
    ? await service.mapProviderRequest({
      promptPackage: promptPackageCreate.data.promptPackage,
      snapshot,
      providerId: submission.providerId,
      kind: "imageGeneration",
      count: submission.queuePlanCreate.payload.imagesPerScheme,
      traceId: submission.traceId,
    })
    : promptPackageCreate;
  const queuePlanCreate = providerRequestMap.ok
    ? await service.createQueuePlan(submission.queuePlanCreate.payload)
    : providerRequestMap;

  return {
    ok: savedSnapshot.ok && promptPackageCreate.ok && providerRequestMap.ok && queuePlanCreate.ok,
    savedSnapshot,
    promptPackageCreate,
    providerRequestMap,
    queuePlanCreate,
  };
}
