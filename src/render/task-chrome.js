import { getLiveGateViewModel, getManualLiveTestViewModel } from '../data/live-gate-view-model.js';
import { createQueueViewModel } from '../data/queue-view-model.js';

export function renderTaskChrome(activeMode) {
  const queue = createQueueViewModel(activeMode);
  const liveGate = getLiveGateViewModel(activeMode);
  const manual = getManualLiveTestViewModel(activeMode);
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
