import { getRuntimeWorkspaceSnapshot, state } from '../state.js';

function activeSubmissionForMode(activeMode) {
  const submission = state.submission || null;
  if (!submission || submission.status !== "submitting") return null;
  if (submission.mode !== activeMode.id) return null;
  return submission;
}

function submissionSchemeIds(submission) {
  const ids = submission?.queuePlanCreate?.payload?.schemeIds;
  return Array.isArray(ids) ? ids.filter(Boolean) : [];
}

function completedSchemeCount(schemeIds) {
  if (!schemeIds.length) return 0;
  const snapshot = getRuntimeWorkspaceSnapshot();
  return schemeIds.filter((schemeId) => {
    const scheme = snapshot.schemes?.find((item) => item.id === schemeId);
    return scheme && !["pending", "rendering", "loading"].includes(scheme.status);
  }).length;
}

export function getBatchSchemeGenerationStatus(activeMode) {
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
  const total = Math.max(1, schemeIds.length || 1);
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

export function getImageGenerationStatus(activeMode, schemeId = "") {
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
  return {
    active: true,
    total: Math.max(1, schemeIds.length * imagesPerScheme),
    schemeIds,
  };
}
