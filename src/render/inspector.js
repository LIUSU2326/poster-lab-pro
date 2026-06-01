import { getLiveGateViewModel } from '../data/live-gate-view-model.js';

export function renderLiveGateInspector(activeMode) {
  const gate = getLiveGateViewModel(activeMode);
  const blockers = gate.blockers.length > 0
    ? gate.blockers.map((blocker) => `<li><strong>${escapeHtml(blocker.label)}</strong><span>${escapeHtml(blocker.message)}</span></li>`).join("")
    : `<li class="live-gate-ok">所有实机安全要求已满足。</li>`;

  return `
    <section class="inspector-section live-gate-inspector ${gate.tone}" aria-label="实机安全闸">
      <div class="section-title">
        <span>Live Gate</span>
        <strong>实机安全闸</strong>
      </div>
      <ul class="live-gate-blockers compact">${blockers}</ul>
    </section>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
