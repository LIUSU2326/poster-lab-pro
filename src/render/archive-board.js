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
          <div class="archive-selection-actions">
            ${state.archiveExportMessage ? `<span class="archive-export-note" aria-live="polite">${escapeHtml(state.archiveExportMessage)}</span>` : ""}
            <button class="archive-export-button" type="button" data-action="export-archive-selection" ${selectedCount > 0 ? "" : "disabled"}>导出选择的图片</button>
          </div>
        </div>
        ${archiveRows.length === 0 ? `
          <div class="archive-empty" role="status">
            <strong>暂无归档图片</strong>
            <small>生成并保存图片后，可在这里批量选择并导出。</small>
          </div>
        ` : `<div class="archive-grid">
          ${archiveRows.map((row) => renderArchiveCard(row, selectedIds.has(row.id))).join("")}
        </div>`}
      </div>
    </section>
  `;
}

function renderArchiveCard(row, selected) {
  const sizeLabel = row.width && row.height ? `${row.width}x${row.height}` : "图片资源";
  const orientation = archiveOrientation(row);

  return `
    <article class="archive-card ${selected ? "selected" : ""}">
      <label class="archive-card-select archive-select-cell" aria-label="选择 ${escapeHtml(row.title)}">
        <input type="checkbox" data-archive-select="${escapeHtml(row.id)}" ${selected ? "checked" : ""} />
        <span></span>
      </label>
      <button
        class="archive-card-preview ${escapeHtml(orientation)} ${row.previewUrl ? "" : "empty"}"
        type="button"
        data-action="open-result-viewer"
        data-result-id="${escapeHtml(row.resultId)}"
        aria-label="查看 ${escapeHtml(row.title)} 大图"
      >
        ${row.previewUrl
          ? `<img src="${escapeHtml(row.previewUrl)}" alt="${escapeHtml(row.title)}" width="${escapeHtml(row.width || 320)}" height="${escapeHtml(row.height || 320)}" loading="lazy">`
          : `<span>暂无预览</span>`}
        <i>${escapeHtml(row.type)}</i>
      </button>
      <div class="archive-card-body">
        <strong>${escapeHtml(row.title)}</strong>
        <small>${escapeHtml(sizeLabel)} · ${escapeHtml(row.model)}</small>
        <small>${escapeHtml(row.project)} · ${escapeHtml(formatArchiveTime(row.createdAt))}</small>
      </div>
      <div class="archive-card-footer">
        <span class="status-chip ${row.status}">${escapeHtml(row.state)}</span>
        <div class="row-actions">
          <button type="button" data-action="open-result-viewer" data-result-id="${escapeHtml(row.resultId)}">查看</button>
          ${row.downloadUrl ? `<a href="${escapeHtml(row.downloadUrl)}" download data-archive-download="${escapeHtml(row.id)}">下载</a>` : `<button type="button" disabled>下载</button>`}
        </div>
      </div>
    </article>
  `;
}

function archiveOrientation(row) {
  const width = Number(row.width || 0);
  const height = Number(row.height || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "is-square";
  if (height > width * 1.2) return "is-portrait";
  if (width > height * 1.2) return "is-landscape";
  return "is-square";
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
