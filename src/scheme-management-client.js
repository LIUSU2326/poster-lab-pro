import { modeSpecs } from './data/modes.js';
import { getRuntimeWorkspaceSnapshot, setRuntimeWorkspaceSnapshot, state, ensureSelectedScheme, ensureSelectedResult } from './state.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function encodeSegment(value) {
  return encodeURIComponent(String(value));
}

async function postJson(path, payload, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Workspace snapshot persistence requires fetch.");
  }

  const response = await fetchImpl(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  try {
    return await response.json();
  } catch {
    return {
      ok: false,
      error: {
        code: "bad_response",
        message: "Workspace save route returned an unreadable response.",
      },
    };
  }
}

function touchSnapshot(snapshot) {
  const updatedAt = nowIso();
  return {
    ...snapshot,
    metadata: {
      ...snapshot.metadata,
      revision: Number(snapshot.metadata?.revision || 0) + 1,
      updatedAt,
    },
  };
}

function associatedResultIds(snapshot, schemeIds) {
  const schemeSet = new Set(schemeIds);
  return new Set((snapshot.results || [])
    .filter((result) => schemeSet.has(result.schemeId))
    .map((result) => result.id));
}

function refreshQueueSummary(plan) {
  const total = plan.tasks.length;
  const completed = plan.tasks.filter((task) => task.status === "succeeded").length;
  const failed = plan.tasks.filter((task) => task.status === "failed").length;
  const running = plan.tasks.filter((task) => task.status === "running").length;
  const queued = plan.tasks.filter((task) => task.status === "queued" || task.status === "blocked").length;
  const cancelled = plan.tasks.filter((task) => task.status === "cancelled").length;
  return {
    jobId: plan.job.id,
    total,
    queued,
    running,
    completed,
    failed,
    cancelled,
    progress: total === 0 ? 0 : Math.round((completed / total) * 100),
    estimatedCost: plan.tasks.reduce((sum, task) => sum + (task.cost?.estimatedCost || 0), 0),
    actualCost: null,
    elapsedMs: plan.tasks.reduce((sum, task) => sum + (task.elapsedMs || 0), 0),
  };
}

function removeSchemeOutputReferences(snapshot, schemeIds) {
  const schemeSet = new Set(schemeIds);
  const resultIds = associatedResultIds(snapshot, schemeIds);
  const queuePlans = (snapshot.queuePlans || []).map((plan) => {
    const tasks = (plan.tasks || []).filter((task) => {
      const schemeId = task.input?.schemeId;
      if (schemeId && schemeSet.has(schemeId)) return false;
      if (Array.isArray(task.input?.schemeIds)) {
        const remainingIds = task.input.schemeIds.filter((id) => !schemeSet.has(id));
        return remainingIds.length > 0;
      }
      return true;
    }).map((task) => {
      if (!Array.isArray(task.input?.schemeIds)) return task;
      return {
        ...task,
        input: {
          ...task.input,
          schemeIds: task.input.schemeIds.filter((id) => !schemeSet.has(id)),
        },
      };
    });
    return {
      ...plan,
      tasks,
    };
  }).filter((plan) => plan.tasks.length > 0);
  const queueSummaries = queuePlans.map(refreshQueueSummary);

  return {
    ...snapshot,
    results: (snapshot.results || []).filter((result) => !schemeSet.has(result.schemeId)),
    archiveRows: (snapshot.archiveRows || []).filter((row) => !resultIds.has(row.resultAssetId)),
    queuePlans,
    queueSummaries,
  };
}

function removeSchemeReferences(snapshot, schemeIds) {
  const schemeSet = new Set(schemeIds);
  const nextSnapshot = removeSchemeOutputReferences(snapshot, schemeIds);

  return {
    ...nextSnapshot,
    schemes: (nextSnapshot.schemes || []).filter((scheme) => !schemeSet.has(scheme.id)),
    modeStates: (snapshot.modeStates || []).map((modeState) => ({
      ...modeState,
      selectedSchemeIds: Array.isArray(modeState.selectedSchemeIds)
        ? modeState.selectedSchemeIds.filter((id) => !schemeSet.has(id))
        : [],
    })),
  };
}

function generatedSchemeIdsForMode(snapshot, modeId) {
  const fixtureIds = new Set((modeSpecs[modeId]?.schemes || []).map((scheme) => scheme.id));
  return (snapshot.schemes || [])
    .filter((scheme) => scheme.mode === modeId)
    .filter((scheme) => String(scheme.id || "").startsWith("generated-") || !fixtureIds.has(scheme.id))
    .map((scheme) => scheme.id);
}

function applySnapshot(nextSnapshot, source) {
  setRuntimeWorkspaceSnapshot(nextSnapshot, source);
  ensureSelectedScheme();
  ensureSelectedResult();
}

async function persistSnapshot(nextSnapshot, options = {}) {
  if (state.workspaceLoadStatus !== "http" && state.apiMode !== "http") {
    applySnapshot(nextSnapshot, "static");
    return { ok: true, transport: "static" };
  }

  const workspaceId = nextSnapshot.metadata.workspaceId;
  const envelope = await postJson(`/api/workspaces/${encodeSegment(workspaceId)}/snapshot`, { snapshot: nextSnapshot }, options);
  if (envelope.ok) {
    applySnapshot(nextSnapshot, "http");
  }
  return {
    ...envelope,
    transport: "http",
  };
}

export async function deleteGeneratedSchemeForWorkbench(input = {}, options = {}) {
  const schemeId = input.schemeId || "";
  if (!schemeId) {
    return {
      ok: false,
      error: { message: "缺少要删除的方案 ID。" },
    };
  }

  const snapshot = clone(getRuntimeWorkspaceSnapshot());
  const nextSnapshot = touchSnapshot(removeSchemeReferences(snapshot, [schemeId]));
  return persistSnapshot(nextSnapshot, options);
}

export async function resetGeneratedSchemeForWorkbench(input = {}, options = {}) {
  const schemeId = input.schemeId || "";
  if (!schemeId) {
    return {
      ok: false,
      error: { message: "缺少要刷新的方案 ID。" },
    };
  }

  const snapshot = clone(getRuntimeWorkspaceSnapshot());
  const existingScheme = (snapshot.schemes || []).find((scheme) => scheme.id === schemeId);
  if (!existingScheme) {
    return {
      ok: false,
      error: { message: "找不到要刷新的方案。" },
    };
  }

  const updatedAt = nowIso();
  const outputClearedSnapshot = removeSchemeOutputReferences(snapshot, [schemeId]);
  const nextSnapshot = touchSnapshot({
    ...outputClearedSnapshot,
    schemes: (outputClearedSnapshot.schemes || []).map((scheme) => {
      if (scheme.id !== schemeId) return scheme;
      return {
        ...scheme,
        title: "待生成海报方案",
        brief: "等待 AI 根据项目描述、素材、宣传词和侧重点随机生成新的海报方案。",
        slogans: {},
        promptBlocks: [],
        lockedFields: [],
        status: "pending",
        updatedAt,
      };
    }),
    modeStates: (outputClearedSnapshot.modeStates || []).map((modeState) => (
      modeState.mode === existingScheme.mode
        ? {
            ...modeState,
            selectedSchemeIds: [schemeId],
            updatedAt,
          }
        : modeState
    )),
  });
  return persistSnapshot(nextSnapshot, options);
}

export async function clearGeneratedSchemesForWorkbench(input = {}, options = {}) {
  const modeId = input.modeId || state.activeMode;
  const snapshot = clone(getRuntimeWorkspaceSnapshot());
  const schemeIds = generatedSchemeIdsForMode(snapshot, modeId);
  if (schemeIds.length === 0) {
    return { ok: true, cleared: 0, transport: state.workspaceLoadStatus };
  }

  const nextSnapshot = touchSnapshot(removeSchemeReferences(snapshot, schemeIds));
  const envelope = await persistSnapshot(nextSnapshot, options);
  return {
    ...envelope,
    cleared: schemeIds.length,
  };
}
