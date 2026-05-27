import { getWorkspaceProject, getWorkspaceSnapshotSummary } from '../data/workspace-adapters.js';
import { state } from '../state.js';

export function renderTopbar(activeMode) {
  const project = getWorkspaceProject();
  const summary = getWorkspaceSnapshotSummary();
  const modeLabel = getModeLabel(activeMode.id);

  return `
    <header class="topbar" data-workspace-revision="${escapeHtml(summary.revision)}" data-workspace-assets="${escapeHtml(summary.assetCount)}">
      <div class="project-pill">
        <span></span>
        <div>
          <small>宣发画布</small>
          <strong>${escapeHtml(project.name || "游戏项目")}</strong>
        </div>
      </div>
      <div class="view-switch top-view-switch" aria-label="主视图">
        <button class="${state.view === "schemes" ? "active" : ""}" type="button" data-view="schemes">方案</button>
        <button class="${state.view === "archive" ? "active" : ""}" type="button" data-view="archive">归档</button>
      </div>
      <nav class="top-actions" aria-label="全局操作">
        ${state.view === "archive" ? "" : `<button type="button" data-action="toggle-copy">${state.copyVisible ? "收起文案" : "展示文案"}</button>`}
        <button type="button" data-action="open-settings">模型与 API Key</button>
        <button class="theme-switch ${state.theme}" type="button" data-action="toggle-theme" aria-label="切换亮色或暗色">
          <span class="${state.theme === "light" ? "active" : ""}">亮色</span>
          <span class="${state.theme === "dark" ? "active" : ""}">暗色</span>
        </button>
        <button type="button" data-view="archive">导出</button>
        <button class="primary-button generate-primary" type="button" data-action="submit-generation">
          <svg class="top-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M8 5v14l11-7-11-7Z"></path>
          </svg>
          <span>生成${modeLabel}</span>
        </button>
      </nav>
    </header>
  `;
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
