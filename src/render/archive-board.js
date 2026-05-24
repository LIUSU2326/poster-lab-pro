import { getArchiveRows } from '../data/workspace-adapters.js';
import { state } from '../state.js';

export function renderArchiveBoard() {
  const archiveRows = getArchiveRows();
  const selectedIds = new Set(state.archiveSelection || []);
  const selectedCount = archiveRows.filter((row) => selectedIds.has(row.id)).length;

  return `
    <section class="center-board archive-board" aria-label="归档资源">
      <div class="archive-shell">
        <header class="archive-header">
          <div>
            <span>ARCHIVE</span>
            <h1>归档资源</h1>
            <p>管理已保存的方案、生成结果和可复用素材记录。</p>
          </div>
          <div class="archive-summary">
            <strong>${selectedCount}</strong>
            <span>已选择</span>
          </div>
        </header>
        <div class="archive-selection-bar" aria-label="归档选择操作">
          <div>
            <button type="button" data-archive-bulk="all">选择全部</button>
            <button type="button" data-archive-bulk="today">选择今天</button>
            <button type="button" data-archive-bulk="last-hour">近 1 小时</button>
            <button type="button" data-archive-bulk="clear">取消选择</button>
          </div>
          <button class="archive-export-button" type="button" data-action="export-archive-selection" ${selectedCount > 0 ? "" : "disabled"}>导出选择的图片</button>
        </div>
        ${state.archiveExportMessage ? `<div class="archive-export-note" aria-live="polite">${escapeHtml(state.archiveExportMessage)}</div>` : ""}
        <div class="archive-table">
          <div class="archive-row head">
            <span>选择</span><span>资源</span><span>关联项目</span><span>模型 / 画风</span><span>生成时间</span><span>状态</span><span>操作</span>
          </div>
          ${archiveRows.map((row) => `
            <div class="archive-row ${selectedIds.has(row.id) ? "selected" : ""}">
              <label class="archive-select-cell" aria-label="选择 ${escapeHtml(row.title)}">
                <input type="checkbox" data-archive-select="${escapeHtml(row.id)}" ${selectedIds.has(row.id) ? "checked" : ""} />
                <span></span>
              </label>
              <div class="archive-title">
                <span class="mini-thumb ${row.tone}">
                  ${row.previewUrl ? `<img src="${escapeHtml(row.previewUrl)}" alt="" width="44" height="44" loading="lazy">` : ""}
                  <i>${row.type}</i>
                </span>
                <div>
                  <strong>${escapeHtml(row.title)}</strong>
                  <small>${row.width && row.height ? `${row.width}x${row.height}` : "图片资源"}</small>
                </div>
              </div>
              <span>${escapeHtml(row.project)}</span>
              <span>${escapeHtml(row.model)}</span>
              <span>${escapeHtml(formatArchiveTime(row.createdAt))}</span>
              <span class="status-chip ${row.status}">${escapeHtml(row.state)}</span>
              <div class="row-actions">
                <button type="button">查看</button>
                ${row.downloadUrl ? `<a href="${escapeHtml(row.downloadUrl)}" download data-archive-download="${escapeHtml(row.id)}">下载</a>` : `<button type="button" disabled>下载</button>`}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function formatArchiveTime(value) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "未记录";
  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
