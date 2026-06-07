import { getRuntimeWorkspaceSnapshot, state } from '../state.js';

const activeQueueStatuses = new Set(["queued", "running", "blocked"]);
const terminalJobStatuses = new Set(["completed", "failed", "cancelled", "partial"]);
const generationTaskKinds = new Set(["briefGeneration", "conceptGeneration", "imageGeneration"]);

function activeSubmissionForMode(activeMode) {
  const submission = state.submission || null;
  if (!submission || submission.status !== "submitting") return null;
  if (submission.mode !== activeMode.id) return null;
  if (isTerminalQueueSubmission(activeMode, submission)) return null;
  return submission;
}

function isTerminalQueueSubmission(activeMode, submission) {
  const plan = latestQueuePlanForSubmission(activeMode, submission);
  if (!plan) return false;
  if (terminalJobStatuses.has(plan.job?.status)) return true;
  const generationTasks = (plan.tasks || []).filter((task) => generationTaskKinds.has(task.kind));
  if (generationTasks.length === 0) return false;
  return !generationTasks.some((task) => activeQueueStatuses.has(task.status));
}

function activeQueuePlansForMode(activeMode) {
  const modeId = activeMode?.id || state.activeMode;
  const snapshot = getRuntimeWorkspaceSnapshot();
  return (Array.isArray(snapshot.queuePlans) ? snapshot.queuePlans : []).filter((plan) => {
    if (plan.job?.mode !== modeId) return false;
    if (terminalJobStatuses.has(plan.job?.status)) return false;
    const generationTasks = (plan.tasks || []).filter((task) => generationTaskKinds.has(task.kind));
    return generationTasks.some((task) => activeQueueStatuses.has(task.status));
  });
}

function latestQueuePlanForSubmission(activeMode, submission) {
  const modeId = activeMode?.id || state.activeMode;
  const snapshot = getRuntimeWorkspaceSnapshot();
  const createdAt = Date.parse(submission.createdAt || "");
  const minCreatedAt = Number.isFinite(createdAt) ? createdAt - 15000 : 0;
  const plans = Array.isArray(snapshot.queuePlans)
    ? snapshot.queuePlans.filter((plan) => {
        if (plan.job?.mode !== modeId) return false;
        if (!Number.isFinite(createdAt)) return true;
        const jobCreatedAt = Date.parse(plan.job?.createdAt || plan.job?.updatedAt || "");
        return Number.isFinite(jobCreatedAt) && jobCreatedAt >= minCreatedAt;
      })
    : [];
  return plans[plans.length - 1] || null;
}

function planSchemeIds(plan, kind = "") {
  const ids = [];
  for (const task of plan?.tasks || []) {
    if (kind && task.kind !== kind) continue;
    if (task.input?.schemeId) ids.push(task.input.schemeId);
    if (Array.isArray(task.input?.schemeIds)) ids.push(...task.input.schemeIds);
  }
  return Array.from(new Set(ids.filter(Boolean)));
}

function submissionSchemeIds(submission) {
  const ids = submission?.queuePlanCreate?.payload?.schemeIds;
  return Array.isArray(ids) ? ids.filter(Boolean) : [];
}

function submissionModeState(submission, activeMode) {
  const modeId = activeMode?.id || submission?.mode || state.activeMode;
  const modeStates = submission?.promptPackageCreate?.payload?.snapshot?.modeStates;
  return Array.isArray(modeStates)
    ? modeStates.find((item) => item.mode === modeId) || null
    : null;
}

function requestedSchemeCount(submission, activeMode, schemeIds = []) {
  const queuePayload = submission?.queuePlanCreate?.payload || {};
  const modeState = submissionModeState(submission, activeMode);
  const candidates = [
    modeState?.outputSettings?.schemeCount,
    queuePayload.schemeCount,
    schemeIds.length,
  ];
  const count = candidates
    .map((value) => Number(value))
    .find((value) => Number.isFinite(value) && value > 0);
  return Math.max(1, Math.min(20, Math.round(count || 1)));
}

function completedSchemeCount(schemeIds) {
  if (!schemeIds.length) return 0;
  const snapshot = getRuntimeWorkspaceSnapshot();
  return schemeIds.filter((schemeId) => {
    const scheme = snapshot.schemes?.find((item) => item.id === schemeId);
    return scheme && !["pending", "rendering", "loading"].includes(scheme.status);
  }).length;
}

function completedImageCount(schemeIds) {
  if (!schemeIds.length) return 0;
  const snapshot = getRuntimeWorkspaceSnapshot();
  const ids = new Set(schemeIds);
  return (snapshot.results || []).filter((result) => (
    ids.has(result.schemeId)
      && !["failed", "cancelled"].includes(result.status || "")
      && Boolean(result.assetUrl || result.thumbnailUrl || result.metadata?.resultFile || result.metadata?.mockPreviewUrl)
  )).length;
}

export function getBatchSchemeGenerationStatus(activeMode) {
  const activeBriefPlan = activeQueuePlansForMode(activeMode)
    .find((plan) => (plan.tasks || []).some((task) => task.kind === "briefGeneration" && activeQueueStatuses.has(task.status)));
  if (activeBriefPlan) {
    const schemeIds = planSchemeIds(activeBriefPlan, "briefGeneration");
    const total = Math.max(1, schemeIds.length);
    const completed = Math.min(total, completedSchemeCount(schemeIds));
    return {
      active: true,
      completed,
      total,
      progress: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
  }

  const submission = activeSubmissionForMode(activeMode);
  const promptTarget = submission?.promptPackageCreate?.payload?.target;
  const queuePayload = submission?.queuePlanCreate?.payload || {};
  const isBatchBrief = Boolean(
    submission
      && promptTarget === "brief"
      && queuePayload.regenerateSchemes !== false
      && queuePayload.includeImageGeneration === false,
  );
  if (!isBatchBrief) return { active: false, completed: 0, total: 0, progress: 0 };

  const schemeIds = submissionSchemeIds(submission);
  const total = requestedSchemeCount(submission, activeMode, schemeIds);
  const completed = Math.min(total, completedSchemeCount(schemeIds));
  const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
  return {
    active: true,
    completed,
    total,
    progress,
  };
}

export function getSchemeGenerationStatus(activeMode, schemeId = "") {
  const batch = getBatchSchemeGenerationStatus(activeMode);
  const submission = activeSubmissionForMode(activeMode);
  const schemeIds = submissionSchemeIds(submission);
  if (!batch.active || !schemeId || !schemeIds.includes(schemeId)) {
    return { active: false };
  }
  return {
    active: true,
    completed: batch.completed,
    total: batch.total,
    progress: batch.progress,
  };
}

export function getActiveGenerationCancelStatus(activeMode) {
  const submission = activeSubmissionForMode(activeMode);
  if (!submission) {
    const plan = activeQueuePlansForMode(activeMode).at(-1);
    if (!plan) return { active: false, jobId: "", kind: "" };
    const hasImages = (plan.tasks || []).some((task) => task.kind === "imageGeneration" && activeQueueStatuses.has(task.status));
    return {
      active: true,
      kind: hasImages ? "images" : "schemes",
      jobId: plan.job?.id || "",
    };
  }
  const queuePayload = submission.queuePlanCreate?.payload || {};
  const kind = queuePayload.includeImageGeneration === false ? "schemes" : "images";
  return {
    active: true,
    kind,
    jobId: submission.queuePlanJobId
      || submission.serviceFlow?.queuePlanCreate?.data?.queuePlan?.job?.id
      || "",
  };
}

export function getImageGenerationStatus(activeMode, schemeId = "") {
  const activeImagePlans = activeQueuePlansForMode(activeMode)
    .filter((plan) => (plan.tasks || []).some((task) => task.kind === "imageGeneration" && activeQueueStatuses.has(task.status)));
  if (activeImagePlans.length > 0) {
    const imageTasks = activeImagePlans.flatMap((plan) =>
      (plan.tasks || []).filter((task) => task.kind === "imageGeneration" && activeQueueStatuses.has(task.status)),
    );
    const schemeIds = Array.from(new Set(imageTasks.map((task) => task.input?.schemeId).filter(Boolean)));
    if (schemeId && !schemeIds.includes(schemeId)) {
      return { active: false, total: 0, schemeIds };
    }
    const focusedTasks = schemeId ? imageTasks.filter((task) => task.input?.schemeId === schemeId) : imageTasks;
    const total = Math.max(1, focusedTasks.reduce((sum, task) => sum + Math.max(1, Number(task.input?.count || 1)), 0));
    const focusedSchemeIds = schemeId ? [schemeId] : schemeIds;
    return {
      active: true,
      completed: Math.min(total, completedImageCount(focusedSchemeIds)),
      total,
      schemeIds,
    };
  }

  const submission = activeSubmissionForMode(activeMode);
  const queuePayload = submission?.queuePlanCreate?.payload || {};
  if (!submission || queuePayload.includeImageGeneration === false) {
    return { active: false, total: 0, schemeIds: [] };
  }

  const schemeIds = submissionSchemeIds(submission);
  if (schemeId && !schemeIds.includes(schemeId)) {
    return { active: false, total: 0, schemeIds };
  }

  const imagesPerScheme = Math.max(1, Number(queuePayload.imagesPerScheme || 1));
  const focusedSchemeIds = schemeId ? [schemeId] : schemeIds;
  const total = Math.max(1, focusedSchemeIds.length * imagesPerScheme);
  return {
    active: true,
    completed: Math.min(total, completedImageCount(focusedSchemeIds)),
    total,
    schemeIds,
  };
}

export function getImageFailureStatus(activeMode, schemeId = "") {
  if (!schemeId) return { failed: false };
  const modeId = activeMode?.id || state.activeMode;
  const snapshot = getRuntimeWorkspaceSnapshot();
  const plans = Array.isArray(snapshot.queuePlans)
    ? snapshot.queuePlans.filter((plan) => plan.job?.mode === modeId)
    : [];
  for (let planIndex = plans.length - 1; planIndex >= 0; planIndex -= 1) {
    const plan = plans[planIndex];
    const imageTask = (plan.tasks || []).find((task) => (
      task.kind === "imageGeneration"
        && task.input?.schemeId === schemeId
    ));
    if (!imageTask) continue;
    if (imageTask.status !== "failed") return { failed: false };
    const error = imageTask.error || imageTask.output?.error || {};
    return {
      failed: true,
      message: error.userMessage || error.message || "图片生成暂时失败，请稍后重试。",
      code: error.code || "",
      jobId: plan.job?.id || "",
      taskId: imageTask.id || "",
    };
  }
  return { failed: false };
}
