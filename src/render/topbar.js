import { getWorkspaceProject, getWorkspaceSnapshotSummary } from '../data/workspace-adapters.js';
import { getLiveGateViewModel } from '../data/live-gate-view-model.js';
import { getImageGenerationStatus } from '../data/generation-activity.js';
import { state } from '../state.js';

export function renderTopbar(activeMode) {
  const project = getWorkspaceProject();
  const summary = getWorkspaceSnapshotSummary();
  const modeLabel = getModeLabel(activeMode.id);
  const liveGate = getLiveGateViewModel(activeMode);
  const failedImageCount = getFailedImageTaskCount(activeMode.id);
  const canRenderImages = activeMode.id === "poster" || hasRenderableSchemes(activeMode.id);
  const imageGeneration = getImageGenerationStatus(activeMode);
  const generatingImages = imageGeneration.active;

  return `
    <header class="topbar" data-workspace-revision="${escapeHtml(summary.revision)}" data-workspace-assets="${escapeHtml(summary.assetCount)}">
      <div class="topbar-project">
        <i aria-hidden="true"></i>
        <div>
          <small>${modeLabel}工作台</small>
          <strong>${escapeHtml(project.name || "未命名项目")}</strong>
        </div>
      </div>
      <div class="view-switch top-view-switch" aria-label="主视图">
        <button class="${state.view === "schemes" ? "active" : ""}" type="button" data-view="schemes">方案</button>
        <button class="${state.view === "archive" ? "active" : ""}" type="button" data-view="archive">归档</button>
      </div>
      <nav class="top-actions" aria-label="全局操作">
        ${state.view === "archive" ? "" : `<button type="button" data-action="toggle-copy">${state.copyVisible ? "收起文案" : "展开文案"}</button>`}
        <button type="button" data-action="open-settings">模型与 Key</button>
        <button class="live-gate-chip ${liveGate.tone}" type="button" data-action="toggle-task" aria-label="实机安全">
          <i aria-hidden="true"></i>
          <span>实机安全</span>
          <strong>${escapeHtml(liveGate.stateLabel)}</strong>
        </button>
        <button class="theme-switch ${state.theme}" type="button" data-action="toggle-theme" aria-label="切换亮色或暗色">
          <span class="${state.theme === "light" ? "active" : ""}">亮色</span>
          <span class="${state.theme === "dark" ? "active" : ""}">暗色</span>
        </button>
        <button type="button" data-view="archive">导出</button>
        ${failedImageCount > 0 ? `<button class="retry-failed-button" type="button" data-action="retry-failed-images">重试失败 ${failedImageCount}</button>` : ""}
        <button class="primary-button generate-primary ${generatingImages ? "loading" : ""}" type="button" data-action="submit-generation" ${canRenderImages && !generatingImages ? "" : "disabled"}>
          ${generatingImages ? `
            <span class="button-spinner" aria-hidden="true"></span>
            <span>生成中</span>
          ` : `
            <svg class="top-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M8 5v14l11-7-11-7Z"></path>
            </svg>
            <span>生成${modeLabel}</span>
          `}
        </button>
      </nav>
    </header>
  `;
}

function hasRenderableSchemes(modeId) {
  const snapshot = state.workspaceSnapshot || {};
  return (snapshot.schemes || []).some((scheme) =>
    scheme.mode === modeId
      && scheme.status !== "pending"
      && !String(scheme.id || "").startsWith(`${modeId}-`)
      && !String(scheme.id || "").startsWith(`scheme-${modeId}-`),
  );
}

function getFailedImageTaskCount(modeId) {
  const snapshot = state.workspaceSnapshot || {};
  const plans = (snapshot.queuePlans || []).filter((plan) => plan.job?.mode === modeId);
  const plan = plans[plans.length - 1];
  if (!plan) return 0;
  return (plan.tasks || []).filter((task) => task.kind === "imageGeneration" && task.status === "failed").length;
}

function getModeLabel(modeId) {
  return {
    poster: "海报",
    collab: "联名",
    announcement: "公告",
    logo: "标识",
    icon: "图标",
  }[modeId] || "批次";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
