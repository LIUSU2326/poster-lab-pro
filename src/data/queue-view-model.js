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
  waitingDependency: "等待依赖",
  waitingProvider: "等待模型",
  providerCall: "模型调用",
  validating: "校验结果",
  postProcessing: "后处理",
  persisting: "保存结果",
  done: "完成",
  complete: "完成",
};

const errorCodeLabels = {
  missing_config: "配置缺失",
  unsupported_capability: "能力不支持",
  invalid_request: "请求无效",
  provider_unavailable: "模型暂不可用",
  rate_limited: "触发限流",
  auth_failed: "鉴权失败",
  quota_exceeded: "额度不足",
  unknown: "未知错误",
};

function formatCost({ estimatedCost, actualCost, currency = "USD" }) {
  if (typeof actualCost === "number") return `实际 ${currency} ${actualCost.toFixed(2)}`;
  if (typeof estimatedCost === "number") return `预计 ${currency} ${estimatedCost.toFixed(2)}`;
  return "费用待定";
}

function formatDuration(ms) {
  if (ms <= 0) return "等待";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function normalizeProgress(value) {
  return Math.max(0, Math.min(100, Math.round(value || 0)));
}

function createRow({ taskId, kind, label, detail, status, progress, estimatedCost, actualCost, currency, elapsedMs, stage, error, attempts, maxAttempts }) {
  const safeProgress = normalizeProgress(progress);
  return {
    taskId,
    kind,
    label,
    detail,
    status,
    state: statusLabels[status] || status,
    stage,
    stageLabel: stageLabels[stage] || stage,
    progress: safeProgress,
    progressLabel: `${safeProgress}%`,
    cost: formatCost({ estimatedCost, actualCost, currency }),
    time: formatDuration(elapsedMs),
    failure: failureFromTask({
      id: taskId,
      kind,
      status,
      attempts,
      maxAttempts,
      error,
    }),
  };
}

export function createQueueViewModel(activeMode) {
  const runtimeQueue = createRuntimeQueueViewModel(activeMode);
  if (runtimeQueue) return runtimeQueue;

  return {
    rows: [],
    summary: {
      completed: 0,
      total: 0,
      failed: 0,
      running: 0,
      queued: 0,
      progress: 0,
      currentStage: "暂无任务",
      progressLabel: "0/0 · 0%",
      costLabel: "费用待定",
      estimatedCost: "费用待定",
      elapsed: "等待",
      failureAction: "无当前失败",
      failureMessage: "",
      failureCode: "",
      failureCount: 0,
      retryableFailureCount: 0,
      failures: [],
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
  const actualCost = typeof storedSummary?.actualCost === "number"
    ? storedSummary.actualCost
    : null;
  const estimatedCost = typeof storedSummary?.estimatedCost === "number"
    ? storedSummary.estimatedCost
    : plan.tasks.reduce((sum, task) => sum + (task.cost?.estimatedCost || 0), 0);
  const currency = plan.tasks.find((task) => task.cost?.currency)?.cost?.currency || "USD";
  const elapsedMs = storedSummary?.elapsedMs ?? plan.tasks.reduce((sum, task) => sum + (task.elapsedMs || 0), 0);

  const rows = plan.tasks.map((task) => createRow({
    taskId: task.id,
    kind: task.kind,
    label: formatTaskKind(task.kind),
    detail: task.input?.schemeId || task.input?.sourceResultId || task.jobId,
    status: task.status,
    progress: task.progress || (task.status === "succeeded" ? 100 : 0),
    estimatedCost: task.cost?.estimatedCost,
    actualCost: task.cost?.actualCost,
    currency: task.cost?.currency,
    elapsedMs: task.elapsedMs || 0,
    stage: task.stage,
    error: task.error,
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
  }));

  const failures = plan.tasks
    .map((task) => failureFromTask(task))
    .filter(Boolean);
  const activeRow = rows.find((row) => row.status === "running") ||
    rows.find((row) => row.status === "failed") ||
    rows.find((row) => row.status === "queued" || row.status === "blocked") ||
    rows[rows.length - 1];
  const firstFailure = failures[0] || null;

  return {
    rows,
    summary: {
      completed,
      total,
      failed,
      running,
      queued,
      progress,
      currentStage: formatCurrentStage(activeRow, plan.job),
      progressLabel: `${completed}/${total} · ${normalizeProgress(progress)}%`,
      costLabel: formatCost({ estimatedCost, actualCost, currency }),
      estimatedCost: formatCost({ estimatedCost, actualCost: null, currency }),
      elapsed: formatDuration(elapsedMs),
      failureAction: failed > 0 ? "重试失败图片或检查模型配置" : "无当前失败",
      failureMessage: firstFailure?.userMessage || "",
      failureCode: firstFailure?.codeLabel || "",
      failureCount: failures.length,
      retryableFailureCount: failures.filter((failure) => failure.retryable).length,
      failures,
    },
  };
}

function formatCurrentStage(activeRow, job) {
  if (!activeRow) return job?.title || "暂无任务";
  if (activeRow.status === "failed") return `${activeRow.label}失败`;
  if (activeRow.status === "running") return activeRow.stageLabel || activeRow.label;
  if (activeRow.status === "queued" || activeRow.status === "blocked") return `等待${activeRow.label}`;
  return activeRow.stageLabel || activeRow.label || job?.title || "任务队列";
}

function failureFromTask(task) {
  if (!task?.error) return null;
  const code = task.error.code || "unknown";
  return {
    taskId: task.id,
    kind: task.kind,
    code,
    codeLabel: errorCodeLabels[code] || code,
    retryable: Boolean(task.error.retryable),
    attempts: Number(task.attempts || 0),
    maxAttempts: Number(task.maxAttempts || 0),
    userMessage: task.error.userMessage || task.error.message || "任务失败，请检查模型配置或稍后重试。",
  };
}

function formatTaskKind(kind) {
  const labels = {
    briefGeneration: "方案生成",
    imageGeneration: "图片渲染",
    imageEdit: "图片编辑",
    upscale: "高清放大",
    backgroundRemoval: "背景移除",
    archiveSync: "结果入库",
    export: "导出",
  };
  return labels[kind] || String(kind || "Task")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
