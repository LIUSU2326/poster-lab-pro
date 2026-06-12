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
      ${renderProjectSwitcher(project, modeLabel)}
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

function renderProjectSwitcher(project, modeLabel) {
  const projectName = project.name || "未命名项目";
  return `
    <div class="topbar-project-wrap">
      <button
        class="topbar-project"
        type="button"
        data-action="toggle-project-switcher"
        aria-haspopup="dialog"
        aria-expanded="${state.projectSwitcherOpen ? "true" : "false"}"
        title="切换项目"
      >
        <i aria-hidden="true"></i>
        <div>
          <small>${escapeHtml(modeLabel)}工作台</small>
          <strong>${escapeHtml(projectName)}</strong>
        </div>
        <span class="project-switcher-caret" aria-hidden="true">⌄</span>
      </button>
      ${state.projectSwitcherOpen ? renderProjectSwitcherPanel() : ""}
    </div>
  `;
}

function renderProjectSwitcherPanel() {
  const summaries = normalizedWorkspaceSummaries();
  const busy = state.workspaceOperation || null;
  return `
    <section class="project-switcher-panel" role="dialog" aria-label="项目切换">
      <div class="project-switcher-head">
        <strong>项目</strong>
        <button type="button" data-action="create-workspace" ${busy ? "disabled" : ""}>新建</button>
      </div>
      <div class="project-switcher-list">
        ${summaries.map((workspace) => renderProjectSwitcherRow(workspace, busy)).join("")}
      </div>
      ${state.workspaceMessage ? `<p class="project-switcher-message">${escapeHtml(state.workspaceMessage)}</p>` : ""}
    </section>
  `;
}

function normalizedWorkspaceSummaries() {
  const summaries = Array.isArray(state.workspaceSummaries) ? state.workspaceSummaries : [];
  if (summaries.length > 0) return summaries;
  const snapshot = state.workspaceSnapshot || {};
  return [{
    workspaceId: state.workspaceId,
    projectId: snapshot.project?.id || "project",
    projectName: snapshot.project?.name || "未命名项目",
    updatedAt: snapshot.metadata?.updatedAt || "",
    resultCount: Array.isArray(snapshot.results) ? snapshot.results.length : 0,
    runningQueueCount: Array.isArray(snapshot.queuePlans)
      ? snapshot.queuePlans.filter((plan) => plan.job?.status === "running" || plan.job?.status === "queued").length
      : 0,
  }];
}

function renderProjectSwitcherRow(workspace, busy) {
  const active = workspace.workspaceId === state.workspaceId;
  const confirming = state.workspaceDeleteConfirmId === workspace.workspaceId;
  const editing = state.workspaceRenameId === workspace.workspaceId;
  const disabled = Boolean(busy);
  const busyThis = busy?.workspaceId === workspace.workspaceId;
  return `
    <div class="project-switcher-row ${active ? "active" : ""} ${confirming ? "confirming" : ""} ${editing ? "editing" : ""}" data-project-row="${escapeAttribute(workspace.workspaceId)}">
      ${editing ? renderWorkspaceRenameRow(workspace, disabled) : renderWorkspaceSwitchRow(workspace, { active, busyThis, disabled })}
    </div>
  `;
}

function renderWorkspaceSwitchRow(workspace, flags) {
  return `
    <button
      class="project-switcher-main"
      type="button"
      data-action="switch-workspace"
      data-workspace-id="${escapeAttribute(workspace.workspaceId)}"
      ${flags.active || flags.disabled ? "disabled" : ""}
    >
      <span>
        <strong>${escapeHtml(workspace.projectName || "未命名项目")}</strong>
        <small>${escapeHtml(formatWorkspaceDate(workspace.updatedAt))} · ${Number(workspace.resultCount || 0)} 结果</small>
      </span>
      ${workspace.runningQueueCount > 0 ? `<b>运行中</b>` : ""}
      ${flags.busyThis ? `<em>处理中</em>` : ""}
    </button>
    <div class="project-switcher-actions">
      <button type="button" data-action="rename-workspace" data-workspace-id="${escapeAttribute(workspace.workspaceId)}" title="重命名" ${flags.disabled ? "disabled" : ""}>改</button>
      <button type="button" data-action="duplicate-workspace" data-workspace-id="${escapeAttribute(workspace.workspaceId)}" title="复制" ${flags.disabled ? "disabled" : ""}>复</button>
      <button
        class="${state.workspaceDeleteConfirmId === workspace.workspaceId ? "danger" : ""}"
        type="button"
        data-action="${state.workspaceDeleteConfirmId === workspace.workspaceId ? "confirm-delete-workspace" : "request-delete-workspace"}"
        data-workspace-id="${escapeAttribute(workspace.workspaceId)}"
        title="${state.workspaceDeleteConfirmId === workspace.workspaceId ? "确认删除" : "删除"}"
        ${flags.disabled ? "disabled" : ""}
      >${state.workspaceDeleteConfirmId === workspace.workspaceId ? "确认" : "删"}</button>
    </div>
  `;
}

function renderWorkspaceRenameRow(workspace, disabled) {
  return `
    <input
      class="project-switcher-rename-input"
      type="text"
      data-workspace-rename-input
      value="${escapeAttribute(workspace.projectName || "未命名项目")}"
      maxlength="80"
      aria-label="项目名称"
      ${disabled ? "disabled" : ""}
    />
    <div class="project-switcher-actions">
      <button type="button" data-action="save-rename-workspace" data-workspace-id="${escapeAttribute(workspace.workspaceId)}" ${disabled ? "disabled" : ""}>保存</button>
      <button type="button" data-action="cancel-rename-workspace" ${disabled ? "disabled" : ""}>取消</button>
    </div>
  `;
}

function formatWorkspaceDate(value) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "刚刚";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
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

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
