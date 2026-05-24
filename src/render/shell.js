import { state } from '../state.js';
import { renderConfigPanel } from './config-panel.js';
import { renderTopbar } from './topbar.js';
import { renderCenterBoard } from './center-board.js';
import { renderTaskChrome } from './task-chrome.js';
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
        ${renderTaskChrome(activeMode)}
      </main>
      ${state.settingsOpen ? renderSettingsSheet() : ""}
    </div>
  `;
}
