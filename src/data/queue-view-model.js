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

function parseSchemeProgress(value) {
  const match = String(value || "0/0").match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return { completed: 0, total: 0 };
  return {
    completed: Number(match[1]),
    total: Number(match[2]),
  };
}

function formatActualCost(value, currency = "USD") {
  return typeof value === "number" ? `${currency} ${value.toFixed(2)}` : "真实成本未返回";
}

function formatDuration(ms) {
  if (ms <= 0) return "等待";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function createRow({ kind, label, detail, status, progress, actualCost, currency, elapsedMs, stage }) {
  return {
    kind,
    label,
    detail,
    status,
    state: statusLabels[status] || status,
    stage,
    stageLabel: stageLabels[stage] || stage,
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    cost: formatActualCost(actualCost, currency),
    time: formatDuration(elapsedMs),
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
      costLabel: "真实成本未返回",
      estimatedCost: "真实成本未返回",
      elapsed: "等待",
      failureAction: "无当前失败",
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
  const elapsedMs = storedSummary?.elapsedMs ?? plan.tasks.reduce((sum, task) => sum + (task.elapsedMs || 0), 0);

  const rows = plan.tasks.map((task) => createRow({
    kind: task.kind,
    label: formatTaskKind(task.kind),
    detail: task.input?.schemeId || task.jobId,
    status: task.status,
    progress: task.progress || (task.status === "succeeded" ? 100 : 0),
    actualCost: task.cost?.actualCost,
    currency: task.cost?.currency,
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
      costLabel: formatActualCost(actualCost),
      estimatedCost: formatActualCost(actualCost),
      elapsed: formatDuration(elapsedMs),
      failureAction: failed > 0 ? "查看失败任务" : "无当前失败",
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
