import { getWorkspaceProject, getWorkspaceSnapshotSummary } from '../data/workspace-adapters.js';
import { getActiveGenerationCancelStatus, getImageGenerationStatus } from '../data/generation-activity.js';
import { state } from '../state.js';

export function renderTopbar(activeMode) {
  const project = getWorkspaceProject();
  const summary = getWorkspaceSnapshotSummary();
  const modeLabel = getModeLabel(activeMode.id);
  const failedImageCount = getFailedImageTaskCount(activeMode.id);
  const selectedScheme = getSelectedRenderableScheme(activeMode.id);
  const hasSchemes = hasRenderableSchemes(activeMode.id);
  const canRenderImages = activeMode.id === "poster" || hasSchemes;
  const imageGeneration = getImageGenerationStatus(activeMode);
  const generatingImages = imageGeneration.active;
  const selectedSchemeGeneration = selectedScheme ? getImageGenerationStatus(activeMode, selectedScheme.id) : { active: false };
  const generationCancel = getActiveGenerationCancelStatus(activeMode);
  const imageProgressLabel = generatingImages && imageGeneration.total
    ? `${imageGeneration.completed || 0}/${imageGeneration.total}`
    : "";
  const selectedSchemeRenderDisabled = !selectedScheme || selectedSchemeGeneration.active;
  const primaryActionLabel = hasSchemes ? `批量${modeLabel}出图` : "生成方案并出图";
  const primaryActionTitle = hasSchemes
    ? `基于现有${modeLabel}方案批量出图`
    : "先生成方案，再自动进入出图";

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
        ${state.view === "schemes" ? `
          <button
            type="button"
            data-action="toggle-copy"
            aria-pressed="${state.copyVisible ? "true" : "false"}"
            title="${state.copyVisible ? "隐藏方案卡片里的详细文案" : "显示方案卡片里的详细文案"}"
          >文案</button>
        ` : ""}
        <button type="button" data-action="open-settings">模型与 Key</button>
        <button class="theme-switch ${state.theme}" type="button" data-action="toggle-theme" aria-label="切换亮色或暗色">
          <span class="${state.theme === "light" ? "active" : ""}">亮色</span>
          <span class="${state.theme === "dark" ? "active" : ""}">暗色</span>
        </button>
        ${failedImageCount > 0 ? `<button class="retry-failed-button" type="button" data-action="retry-failed-images">重试失败 ${failedImageCount}</button>` : ""}
        ${generationCancel.active ? `
          <button
            class="cancel-generation-button"
            type="button"
            data-action="cancel-generation"
            title="停止当前批量任务，正在调用中的单个请求会在返回后停止后续任务"
          >停止</button>
        ` : ""}
        ${selectedScheme ? `
          <button
            class="selected-render-button"
            type="button"
            data-action="submit-generation"
            data-scheme-id="${escapeHtml(selectedScheme.id)}"
            title="只基于当前选中的方案出图"
            ${selectedSchemeRenderDisabled ? "disabled" : ""}
          >只出当前方案</button>
        ` : ""}
        <button
          class="primary-button generate-primary ${generatingImages ? "loading" : ""}"
          type="button"
          data-action="submit-generation"
          title="${escapeHtml(primaryActionTitle)}"
          ${canRenderImages && !generatingImages ? "" : "disabled"}
        >
          ${generatingImages ? `
            <span class="button-spinner" aria-hidden="true"></span>
            <span>生成中</span>
            ${imageProgressLabel ? `<strong>${imageProgressLabel}</strong>` : ""}
          ` : `
            <svg class="top-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M8 5v14l11-7-11-7Z"></path>
            </svg>
            <span>${escapeHtml(primaryActionLabel)}</span>
          `}
        </button>
      </nav>
    </header>
  `;
}

function hasRenderableSchemes(modeId) {
  const snapshot = state.workspaceSnapshot || {};
  return (snapshot.schemes || []).some((scheme) =>
    isRenderableScheme(modeId, scheme),
  );
}

function getSelectedRenderableScheme(modeId) {
  const snapshot = state.workspaceSnapshot || {};
  const selected = (snapshot.schemes || []).find((scheme) => scheme.id === state.selectedScheme);
  return selected && isRenderableScheme(modeId, selected) ? selected : null;
}

function isRenderableScheme(modeId, scheme) {
  return scheme?.mode === modeId
    && scheme.status !== "pending"
    && !String(scheme.id || "").startsWith(`${modeId}-`)
    && !String(scheme.id || "").startsWith(`scheme-${modeId}-`);
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
