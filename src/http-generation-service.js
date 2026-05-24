function encodeSegment(value) {
  return encodeURIComponent(String(value));
}

async function readEnvelope(response) {
  try {
    return await response.json();
  } catch {
    return {
      ok: false,
      error: {
        code: "bad_request",
        message: "Route returned an unreadable JSON response.",
        fieldErrors: {},
        details: { status: response.status },
      },
      meta: {
        traceId: `trace-http-client-${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
      },
    };
  }
}

async function postJson(path, payload, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("HTTP generation service requires a fetch implementation.");
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

async function getJson(path, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("HTTP generation service requires a fetch implementation.");
  }

  const response = await fetchImpl(path, {
    method: "GET",
    headers: {
      accept: "application/json",
    },
  });

  return readEnvelope(response);
}

export function createHttpGenerationService(options = {}) {
  const basePath = options.basePath || "";

  return {
    async saveWorkspaceSnapshot(workspaceId, payload) {
      return postJson(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}/snapshot`, payload, options);
    },

    async createPromptPackage(workspaceId, payload) {
      return postJson(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}/prompts`, payload, options);
    },

    async mapProviderRequest(workspaceId, payload) {
      return postJson(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}/provider-requests`, payload, options);
    },

    async createQueuePlan(workspaceId, payload) {
      return postJson(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}/queue-plans`, payload, options);
    },

    async runQueuePlan(workspaceId, jobId, payload = {}) {
      return postJson(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}/queue-plans/${encodeSegment(jobId)}/run`, payload, options);
    },

    async loadWorkspaceSnapshot(workspaceId) {
      return getJson(`${basePath}/api/workspaces/${encodeSegment(workspaceId)}`, options);
    },
  };
}

export async function runHttpGenerationServiceFlow(submission, options = {}) {
  const snapshot = submission.promptPackageCreate.payload.snapshot;
  const workspaceId = snapshot.metadata.workspaceId;
  const service = createHttpGenerationService(options);

  const savedSnapshot = await service.saveWorkspaceSnapshot(workspaceId, { snapshot });
  const promptPackageCreate = savedSnapshot.ok
    ? await service.createPromptPackage(workspaceId, submission.promptPackageCreate.payload)
    : savedSnapshot;
  const providerRequestMap = promptPackageCreate.ok
    ? await service.mapProviderRequest(workspaceId, {
      promptPackage: promptPackageCreate.data.promptPackage,
      snapshot,
      providerId: submission.providerId,
      kind: "imageGeneration",
      count: submission.queuePlanCreate.payload.imagesPerScheme,
      traceId: submission.traceId,
    })
    : promptPackageCreate;
  const queuePlanCreate = providerRequestMap.ok
    ? await service.createQueuePlan(workspaceId, submission.queuePlanCreate.payload)
    : providerRequestMap;
  const queueRun = queuePlanCreate.ok
    ? await service.runQueuePlan(workspaceId, queuePlanCreate.data.queuePlan.job.id, { archiveResults: true })
    : queuePlanCreate;
  const workspaceReload = queueRun.ok
    ? await service.loadWorkspaceSnapshot(workspaceId)
    : queueRun;

  return {
    ok: savedSnapshot.ok && promptPackageCreate.ok && providerRequestMap.ok && queuePlanCreate.ok && queueRun.ok && workspaceReload.ok,
    transport: "http",
    savedSnapshot,
    promptPackageCreate,
    providerRequestMap,
    queuePlanCreate,
    queueRun,
    workspaceReload,
  };
}
