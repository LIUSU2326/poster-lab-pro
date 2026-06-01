import { getLiveGateViewModel, getManualLiveTestViewModel } from '../data/live-gate-view-model.js';
import { createQueueViewModel } from '../data/queue-view-model.js';

export function renderTaskChrome(activeMode) {
  const queue = createQueueViewModel(activeMode);
  const liveGate = getLiveGateViewModel(activeMode);
  const manual = getManualLiveTestViewModel(activeMode);
  const imageFailureCount = queue.rows.filter((row) => row.kind === "imageGeneration" && row.status === "failed").length;
  const queueTone = queue.summary.failed > 0
    ? "warning"
    : queue.summary.running > 0
      ? "success"
      : "";
  const queueLabel = queue.summary.total > 0
    ? `${queue.summary.completed}/${queue.summary.total}`
    : "无任务";

  return `
    <aside class="task-chrome compact-only" aria-label="任务与实机安全">
      <button class="task-slim queue-slim ${queueTone}" type="button" aria-label="队列进度">
        <span>QUEUE</span>
        <b>${escapeHtml(queueLabel)}</b>
      </button>
      ${renderQueueContext(queue, queueTone, imageFailureCount)}
      <button class="task-slim live-gate-slim ${liveGate.tone}" type="button" data-action="open-settings">
        <span>安全开关</span>
        <b>${escapeHtml(liveGate.stateLabel)}</b>
      </button>
      <button class="task-slim manual-live-slim ${manual.tone}" type="button" data-action="run-manual-live-test" ${manual.disabled ? "disabled" : ""}>
        <span>MANUAL LIVE TEST</span>
        <b>${escapeHtml(manual.status)}</b>
      </button>
      <div class="live-gate-context ${liveGate.tone}">
        <span>${escapeHtml(liveGate.providerName)}</span>
        <strong>${escapeHtml(liveGate.blockerCount ? `${liveGate.blockerCount} 项受阻` : liveGate.stateLabel)}</strong>
      </div>
      <div class="manual-live-context ${manual.tone}">
        <span>RESULT FILES</span>
        <strong>${escapeHtml(`${manual.persistedFileCount}/${manual.resultCount}`)}</strong>
      </div>
    </aside>
  `;
}

function renderQueueContext(queue, tone, imageFailureCount) {
  const rows = queue.rows.length > 0 ? queue.rows : [];
  const visibleRows = prioritizeRows(rows).slice(0, 3);
  const retryLabel = imageFailureCount > 0
    ? `<button class="retry-failed-button queue-retry" type="button" data-action="retry-failed-images">重试失败图片 ${escapeHtml(imageFailureCount)}</button>`
    : "";
  const failure = queue.summary.failureMessage
    ? `
        <p class="queue-failure">
          <span>${escapeHtml(queue.summary.failureCode || "失败")}</span>
          ${escapeHtml(queue.summary.failureMessage)}
        </p>
      `
    : "";

  return `
    <div class="queue-context ${tone}">
      <div class="queue-context-head">
        <div>
          <span>当前队列</span>
          <strong>${escapeHtml(queue.summary.currentStage)}</strong>
        </div>
        <b>${escapeHtml(queue.summary.progressLabel || "0/0 · 0%")}</b>
      </div>
      <div class="queue-context-meta">
        <small>${escapeHtml(queue.summary.costLabel)}</small>
        <small>${escapeHtml(queue.summary.elapsed)}</small>
        <small>${escapeHtml(queue.summary.failed > 0 ? `${queue.summary.failed} 项失败` : `${queue.summary.queued} 项等待`)}</small>
      </div>
      ${failure}
      ${visibleRows.length > 0 ? `
        <div class="queue-mini-list">
          ${visibleRows.map(renderQueueMiniRow).join("")}
        </div>
      ` : `<p class="queue-empty">暂无任务，生成时会显示阶段、费用和失败原因。</p>`}
      ${retryLabel ? `<div class="queue-context-actions">${retryLabel}</div>` : ""}
    </div>
  `;
}

function prioritizeRows(rows) {
  const rank = {
    running: 0,
    failed: 1,
    queued: 2,
    blocked: 3,
    succeeded: 4,
    cancelled: 5,
    skipped: 6,
  };
  return [...rows].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));
}

function renderQueueMiniRow(row) {
  return `
    <div class="queue-row-mini ${escapeHtml(row.status)}">
      <span>${escapeHtml(row.label)}</span>
      <strong>${escapeHtml(row.state)}</strong>
      <small>${escapeHtml(row.stageLabel)} · ${escapeHtml(row.cost)}</small>
      <i class="queue-mini-progress" aria-hidden="true"><em style="width: ${escapeHtml(row.progress)}%"></em></i>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
