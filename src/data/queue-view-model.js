import { getRuntimeWorkspaceSnapshot } from '../state.js';

const statusLabels = {
  queued: "排队中",
  blocked: "受阻",
  running: "运行中",
  succeeded: "完成",
  failed: "失败",
  cancelled: "已取消",
};

const stageLabels = {
  planning: "方案规划",
  providerCall: "模型调用",
  postProcessing: "后处理",
  persisting: "保存结果",
  complete: "完成",
};

const modeCostRate = {
  poster: 0.24,
  collab: 0.28,
  announcement: 0.2,
  logo: 0.18,
  icon: 0.16,
};

function parseSchemeProgress(value) {
  const match = String(value || "0/0").match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return { completed: 0, total: 0 };
  return {
    completed: Number(match[1]),
    total: Number(match[2]),
  };
}

function formatCurrency(value) {
  return `$${value.toFixed(2)}`;
}

function formatDuration(ms) {
  if (ms <= 0) return "等待";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function createRow({ kind, label, detail, status, progress, estimatedCost, elapsedMs, stage }) {
  return {
    kind,
    label,
    detail,
    status,
    state: statusLabels[status] || status,
    stage,
    stageLabel: stageLabels[stage] || stage,
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    cost: formatCurrency(estimatedCost),
    time: formatDuration(elapsedMs),
  };
}

export function createQueueViewModel(activeMode) {
  const runtimeQueue = createRuntimeQueueViewModel(activeMode);
  if (runtimeQueue) return runtimeQueue;

  const schemes = activeMode.schemes || [];
  const schemeProgress = schemes.map((scheme) => parseSchemeProgress(scheme.progress));
  const completedImages = schemeProgress.reduce((sum, item) => sum + item.completed, 0);
  const totalImages = schemeProgress.reduce((sum, item) => sum + item.total, 0);
  const failedImages = schemes.filter((scheme) => scheme.status === "failed").length;
  const runningImages = schemes.filter((scheme) => scheme.status === "loading").length;
  const queuedImages = schemes.filter((scheme) => scheme.status === "empty" || scheme.status === "pending").length;
  const imageProgress = totalImages === 0 ? 0 : (completedImages / totalImages) * 100;
  const allImagesDone = totalImages > 0 && completedImages >= totalImages && failedImages === 0;
  const imageStatus = allImagesDone ? "succeeded" : runningImages > 0 || completedImages > 0 ? "running" : "queued";
  const costRate = modeCostRate[activeMode.id] || 0.22;
  const imageCost = Math.max(totalImages * costRate, costRate);

  const rows = [
    createRow({
      kind: "briefGeneration",
      label: "方案规划",
      detail: `${schemes.length} 个创意方向`,
      status: schemes.length > 0 ? "succeeded" : "queued",
      progress: schemes.length > 0 ? 100 : 0,
      estimatedCost: 0.42,
      elapsedMs: schemes.length > 0 ? 18000 : 0,
      stage: schemes.length > 0 ? "complete" : "planning",
    }),
    createRow({
      kind: "imageGeneration",
      label: "批量渲染",
      detail: `${completedImages} / ${totalImages} 张图片`,
      status: imageStatus,
      progress: imageProgress,
      estimatedCost: imageCost,
      elapsedMs: completedImages > 0 ? 161000 : 0,
      stage: imageStatus === "succeeded" ? "complete" : "providerCall",
    }),
    createRow({
      kind: "modeGuardrail",
      label: "模式约束",
      detail: `${getModeShort(activeMode.id)} 规则`,
      status: failedImages > 0 ? "failed" : completedImages > 0 ? "running" : "blocked",
      progress: failedImages > 0 ? 82 : Math.max(0, Math.min(64, imageProgress)),
      estimatedCost: 0.12,
      elapsedMs: completedImages > 0 ? 31000 : 0,
      stage: "postProcessing",
    }),
    createRow({
      kind: "archiveSync",
      label: "归档同步",
      detail: "保存到项目素材库",
      status: allImagesDone ? "succeeded" : queuedImages > 0 || runningImages > 0 ? "blocked" : "queued",
      progress: allImagesDone ? 100 : 0,
      estimatedCost: 0,
      elapsedMs: allImagesDone ? 9000 : 0,
      stage: allImagesDone ? "complete" : "persisting",
    }),
  ];

  const activeRow = rows.find((row) => row.status === "running") ||
    rows.find((row) => row.status === "failed") ||
    rows.find((row) => row.status === "queued") ||
    rows[rows.length - 1];
  const estimatedCost = rows.reduce((sum, row) => sum + Number(row.cost.replace("$", "")), 0);
  const elapsedMs = (schemes.length > 0 ? 18000 : 0) + (completedImages > 0 ? 192000 : 0) + (allImagesDone ? 9000 : 0);

  return {
    rows,
    summary: {
      completed: completedImages,
      total: totalImages,
      failed: failedImages,
      running: runningImages,
      queued: queuedImages,
      progress: Math.round(imageProgress),
      currentStage: activeRow?.label || "等待",
      estimatedCost: formatCurrency(estimatedCost),
      elapsed: formatDuration(elapsedMs),
      failureAction: failedImages > 0 ? "重试失败项" : "无失败",
    },
  };
}

function createRuntimeQueueViewModel(activeMode) {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const plans = (snapshot.queuePlans || []).filter((plan) => plan.job?.mode === activeMode.id);
  const plan = plans[plans.length - 1];
  if (!plan) return null;

  const storedSummary = (snapshot.queueSummaries || []).find((summary) => summary.jobId === plan.job.id);
  const total = plan.tasks.length;
  const completed = plan.tasks.filter((task) => task.status === "succeeded").length;
  const failed = plan.tasks.filter((task) => task.status === "failed").length;
  const running = plan.tasks.filter((task) => task.status === "running").length;
  const queued = plan.tasks.filter((task) => task.status === "queued" || task.status === "blocked").length;
  const progress = storedSummary?.progress ?? (total === 0 ? 0 : Math.round((completed / total) * 100));
  const estimatedCost = storedSummary?.estimatedCost ?? plan.tasks.reduce((sum, task) => sum + (task.cost?.estimatedCost || 0), 0);
  const elapsedMs = storedSummary?.elapsedMs ?? plan.tasks.reduce((sum, task) => sum + (task.elapsedMs || 0), 0);

  const rows = plan.tasks.map((task) => createRow({
    kind: task.kind,
    label: formatTaskKind(task.kind),
    detail: task.input?.schemeId || task.jobId,
    status: task.status,
    progress: task.progress || (task.status === "succeeded" ? 100 : 0),
    estimatedCost: task.cost?.estimatedCost || 0,
    elapsedMs: task.elapsedMs || 0,
    stage: task.stage,
  }));

  const activeRow = rows.find((row) => row.status === "running") ||
    rows.find((row) => row.status === "failed") ||
    rows.find((row) => row.status === "queued" || row.status === "blocked") ||
    rows[rows.length - 1];

  return {
    rows,
    summary: {
      completed,
      total,
      failed,
      running,
      queued,
      progress,
      currentStage: activeRow?.label || plan.job.title,
      estimatedCost: formatCurrency(estimatedCost),
      elapsed: formatDuration(elapsedMs),
      failureAction: failed > 0 ? "重试失败项" : "无失败",
    },
  };
}

function getModeShort(modeId) {
  return {
    poster: "海报",
    collab: "联名",
    announcement: "公告",
    logo: "标识",
    icon: "图标",
  }[modeId] || "批量";
}

function formatTaskKind(kind) {
  return String(kind || "Task")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
