import { createQueueViewModel } from './queue-view-model.js';
import { getProviderRows } from './workspace-adapters.js';
import { state } from '../state.js';

const blockerCopy = {
  not_enabled: {
    label: "实机预检未开启",
    message: "开启后才允许调用真实模型服务。",
  },
  missing_live_confirmation: {
    label: "确认实机运行",
    message: "确认本次会调用真实模型服务。",
  },
  missing_cost_confirmation: {
    label: "确认模型费用",
    message: "确认可能产生第三方模型费用。",
  },
  missing_external_provider_confirmation: {
    label: "确认外部服务",
    message: "确认会访问外部模型服务。",
  },
  missing_result_storage_confirmation: {
    label: "确认结果保存",
    message: "确认生成文件可以保存到本地结果库。",
  },
  cost_limit_exceeded: {
    label: "费用上限",
    message: "预计费用高于当前接受上限。",
  },
  missing_runtime_credential: {
    label: "运行凭证",
    message: "请先保存可用于运行的 API Key。",
  },
  missing_transport: {
    label: "网络通道",
    message: "当前桌面端需要可用的 HTTP 通道。",
  },
  missing_result_storage: {
    label: "结果库",
    message: "结果文件存储必须可用。",
  },
};

const confirmationRows = [
  { key: "confirmations.liveRun", label: "允许实机运行", blocker: "missing_live_confirmation" },
  { key: "confirmations.providerCost", label: "确认费用", blocker: "missing_cost_confirmation" },
  { key: "confirmations.externalProvider", label: "允许外部服务", blocker: "missing_external_provider_confirmation" },
  { key: "confirmations.resultStorage", label: "保存结果", blocker: "missing_result_storage_confirmation" },
];

const prerequisiteRows = [
  { key: "runtimeCredentialReady", label: "API Key 可用", blocker: "missing_runtime_credential" },
  { key: "transportReady", label: "网络可用", blocker: "missing_transport" },
  { key: "resultStorageReady", label: "结果库", blocker: "missing_result_storage" },
];

const missingQueueJobMessage = "请先用普通批量按钮准备一个队列任务。";

function parseCurrency(value) {
  const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value) {
  return typeof value === "number" && value > 0 ? `$${value.toFixed(2)}` : "真实成本未返回";
}

function getNestedValue(key) {
  return key.split(".").reduce((current, part) => current?.[part], state.liveGate);
}

function createBlocker(code, field) {
  const copy = blockerCopy[code] || { label: code, message: "Resolve this live execution requirement." };
  return { code, field, ...copy };
}

function getProviderName() {
  return getProviderRows().find((provider) => provider.id === state.provider)?.name || state.provider || "模型服务";
}

function latestWorkspaceQueueJobId() {
  const queuePlans = state.workspaceSnapshot?.queuePlans;
  if (!Array.isArray(queuePlans) || queuePlans.length === 0) return "";
  return queuePlans[queuePlans.length - 1]?.job?.id || "";
}

export function getPreparedLiveQueueJobId() {
  return (
    state.submission?.serviceFlow?.queuePlanCreate?.data?.queuePlan?.job?.id ||
    latestWorkspaceQueueJobId() ||
    ""
  );
}

export function getLiveGateViewModel(activeMode) {
  const queue = createQueueViewModel(activeMode);
  const costLabel = queue.summary.costLabel || queue.summary.estimatedCost || "";
  const costKnown = /[0-9]/.test(String(costLabel));
  const estimatedCost = costKnown ? parseCurrency(costLabel) : 0;
  const liveGate = state.liveGate || {};
  const maxAcceptedCost = Number.isFinite(Number(liveGate.maxAcceptedCost))
    ? Number(liveGate.maxAcceptedCost)
    : 0;

  const blockers = [];

  if (!liveGate.enabled) {
    blockers.push(createBlocker("not_enabled", "enabled"));
  } else {
    for (const row of confirmationRows) {
      if (!getNestedValue(row.key)) blockers.push(createBlocker(row.blocker, row.key));
    }
    if (costKnown && getNestedValue("confirmations.providerCost") && estimatedCost > maxAcceptedCost) {
      blockers.push(createBlocker("cost_limit_exceeded", "maxAcceptedCost"));
    }
    for (const row of prerequisiteRows) {
      if (!getNestedValue(row.key)) blockers.push(createBlocker(row.blocker, row.key));
    }
  }

  const status = !liveGate.enabled ? "skipped" : blockers.length > 0 ? "blocked" : "allowed";
  const tone = status === "allowed" ? "success" : status === "blocked" ? "warning" : "neutral";
  const stateLabel = status === "allowed" ? "可测试" : status === "blocked" ? "受阻" : "关闭";

  return {
    status,
    tone,
    stateLabel,
    providerName: getProviderName(),
    estimatedCost,
    estimatedCostLabel: costKnown ? formatCurrency(estimatedCost) : "真实成本未返回",
    maxAcceptedCost,
    maxAcceptedCostLabel: formatCurrency(maxAcceptedCost),
    blockerCount: blockers.length,
    blockers,
    confirmations: confirmationRows.map((row) => ({
      key: row.key,
      label: row.label,
      checked: Boolean(getNestedValue(row.key)),
    })),
    prerequisites: prerequisiteRows.map((row) => ({
      key: row.key,
      label: row.label,
      checked: Boolean(getNestedValue(row.key)),
    })),
    helper: status === "allowed"
      ? "安全闸已满足，可以手动执行一次实机测试；主生成按钮仍保持安全流程。"
      : status === "blocked"
        ? `还有 ${blockers.length} 项要求未满足，暂不能执行实机测试。`
        : "真实模型调用默认关闭，只在明确测试时开启。",
    allowed: status === "allowed",
  };
}

export function getManualLiveTestViewModel(activeMode) {
  const gate = getLiveGateViewModel(activeMode);
  const jobId = getPreparedLiveQueueJobId();
  const connectionReady = Boolean(
    state.providerConnection?.providerId === state.provider &&
    state.providerConnection?.ok,
  );
  const credentialReady = Boolean(state.liveGate?.runtimeCredentialReady);
  const httpReady = state.apiMode === "http";
  const providerReady = state.provider === "openai" || state.provider === "google";
  const queueCanBePrepared = httpReady && providerReady;
  const idle = state.manualLiveTest?.phase !== "running";
  const blockers = [];

  if (!httpReady) blockers.push("请在 HTTP 工作台模式下运行桌面端。");
  if (!providerReady) blockers.push("手动实机测试目前仅支持 OpenAI 兼容服务和 Google。");
  if (!jobId && !queueCanBePrepared) blockers.push(missingQueueJobMessage);
  if (!credentialReady) blockers.push("请先保存 模型服务 API Key。");
  if (!connectionReady) blockers.push("请先完成一次成功的连接测试。");
  if (!gate.allowed) blockers.push("请先通过实机安全闸。");
  if (!idle) blockers.push("手动实机测试正在运行。");

  const ready = blockers.length === 0;
  const phase = state.manualLiveTest?.phase || "idle";
  const rawStatus = state.manualLiveTest?.status || "not_started";
  const status = {
    not_started: "未开始",
    running: "运行中",
    succeeded: "成功",
    failed: "失败",
    blocked: "受阻",
  }[rawStatus] || rawStatus;

  return {
    ready,
    disabled: !ready,
    blockers,
    firstBlocker: blockers[0] || "",
    jobId,
    needsQueuePreparation: !jobId,
    phase,
    status,
    message: state.manualLiveTest?.message || "尚未执行手动实机测试。",
    resultCount: state.manualLiveTest?.resultCount || 0,
    persistedFileCount: state.manualLiveTest?.persistedFileCount || 0,
    traceId: state.manualLiveTest?.traceId || "",
    connectionStatus: state.manualLiveTest?.connectionStatus || "",
    label: phase === "running"
      ? "实机测试运行中"
      : ready
        ? jobId
          ? "运行实机测试"
          : "准备并运行实机测试"
        : "实机测试受阻",
    tone: phase === "succeeded"
      ? "success"
      : phase === "failed" || phase === "blocked"
        ? "warning"
        : ready
          ? "success"
          : "neutral",
  };
}
