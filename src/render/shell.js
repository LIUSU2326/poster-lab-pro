import { state } from '../state.js';
import { renderConfigPanel } from './config-panel.js';
import { renderTopbar } from './topbar.js';
import { renderCenterBoard } from './center-board.js';
import { renderSettingsSheet } from './settings-sheet.js';

export function renderShell(activeMode, selected) {
  const leftPanelWidth = state.leftCollapsed ? 50 : state.leftWidth;
  return `
    <div
      class="prototype-shell mode-${activeMode.id} ${state.leftCollapsed ? "left-collapsed" : ""}"
      style="--left-panel-width: ${leftPanelWidth}px; --accent: ${activeMode.accent}; --accent-hover: ${activeMode.accentHover}; --accent-soft: ${activeMode.accentSoft}; --accent-line: ${activeMode.accentLine}; --accent-2: ${activeMode.accent2};"
    >
      ${renderConfigPanel(activeMode)}
      <div class="resize-divider left" data-resize="left" role="separator" aria-orientation="vertical" aria-label="调整左侧配置区宽度"></div>
      <main class="main-shell">
        ${renderTopbar(activeMode)}
        <section class="production-layout no-inspector figma-workbench-layout">
          ${renderCenterBoard(activeMode, selected)}
        </section>
      </main>
      ${state.settingsOpen ? renderSettingsSheet() : ""}
      ${state.generationChoiceOpen ? renderGenerationChoiceDialog(activeMode) : ""}
    </div>
  `;
}

function renderGenerationChoiceDialog(activeMode) {
  const modeLabel = {
    poster: "海报",
    collab: "联名",
    announcement: "公告",
    logo: "Logo",
    icon: "Icon",
  }[activeMode?.id] || "方案";

  return `
    <div class="generation-choice-backdrop" role="presentation" data-action="cancel-generation-choice"></div>
    <section class="generation-choice-dialog" role="dialog" aria-modal="true" aria-label="选择生成方式">
      <button class="generation-choice-close" type="button" data-action="cancel-generation-choice" aria-label="关闭">×</button>
      <span class="generation-choice-kicker">生成方式</span>
      <h2>已有${modeLabel}方案</h2>
      <p>选择继续使用当前方案出图，或随机生成一组新的创意方案。旧方案和旧图片都会保留。</p>
      <div class="generation-choice-actions">
        <button class="generation-choice-card primary" type="button" data-action="confirm-generation-choice" data-generation-strategy="continue">
          <strong>基于当前方案继续出图</strong>
          <small>不刷新现有方案，适合继续补图或重试。</small>
        </button>
        <button class="generation-choice-card" type="button" data-action="confirm-generation-choice" data-generation-strategy="regenerate">
          <strong>重新生成新方案</strong>
          <small>新增一批方案，不覆盖旧内容。</small>
        </button>
      </div>
    </section>
  `;
}
