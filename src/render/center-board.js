import {
  state,
  isResultOperationActive,
  getModeResults,
  getModeSchemes,
  getResultDownloadUrl,
  getSchemeById,
} from '../state.js';
import { renderArchiveBoard } from './archive-board.js';
import { resolveResultOperationRoute } from '../provider-capabilities.js';
import { getLiveGateViewModel } from '../data/live-gate-view-model.js';
import { getImageGenerationStatus, getSchemeGenerationStatus } from '../data/generation-activity.js';
import { getWorkspaceProject, getWorkspaceSnapshotSummary } from '../data/workspace-adapters.js';
import { modeSpecs } from '../data/modes.js';

export function renderCenterBoard(activeMode, selected) {
  if (state.view === "archive") return renderArchiveBoard();
  if (state.view === "results") return renderResultBoard(activeMode);
  if (state.view === "project-library") return renderProjectLibraryBoard(activeMode);

  const schemes = getModeSchemes();
  const resultsByScheme = groupResultsByScheme(getModeResults());
  const visibleSchemes = getVisibleBoardSchemes(activeMode, schemes, resultsByScheme);
  return `
    <section class="center-board scheme-plan-board" aria-label="生产画板">
      <div class="figma-board-block">
        <div class="scheme-plan-list ${state.copyVisible ? "copy-visible" : "copy-hidden"}">
          ${visibleSchemes.length === 0 ? renderSchemeBoardEmpty(activeMode) : visibleSchemes.map((scheme) => renderSchemeCard(
            activeMode,
            scheme,
            selected?.id === scheme.id,
            resultsByScheme.get(scheme.id) || [],
          )).join("")}
        </div>
      </div>
    </section>
    ${state.resultViewerOpen ? renderResultViewer() : ""}
  `;
}

function getVisibleBoardSchemes(activeMode, schemes, resultsByScheme) {
  const fixtureIds = new Set((activeMode?.schemes || []).map((scheme) => scheme.id));
  return schemes.filter((scheme) => {
    const results = resultsByScheme.get(scheme.id) || [];
    const hasRealResult = results.some((result) => isRealGeneratedResult(result));
    if (fixtureIds.has(scheme.id) || isSeedWorkspaceScheme(activeMode, scheme)) return hasRealResult;
    return true;
  });
}

function isSeedWorkspaceScheme(activeMode, scheme) {
  const modeId = activeMode?.id || "";
  return scheme?.id === `scheme-${modeId}-01`
    || (String(scheme?.id || "").startsWith(`scheme-${modeId}-`) && String(scheme?.brief || "").includes("archive testing"));
}

function isRealGeneratedResult(result) {
  if (!result) return false;
  if (result.metadata?.mockPreviewUrl || result.metadata?.source === "mock-provider") return false;
  return Boolean(result.metadata?.resultFile || result.thumbnailUrl || result.assetUrl);
}

function renderSchemeBoardEmpty(activeMode) {
  const modeLabel = getModeLabel(activeMode.id);
  const modelReady = requiredModelRoutesReady();
  const liveGate = getLiveGateViewModel(activeMode);
  const liveBlocked = state.apiMode === "http" && !liveGate.allowed;
  return `
    <div class="scheme-plan-empty" role="status">
      <span>${escapeHtml(getModeAbbrev(activeMode.id))}</span>
      <strong>还没有可展示的${escapeHtml(modeLabel)}方案</strong>
      <small>${escapeHtml(modelReady
        ? liveBlocked
          ? "左侧配置已就绪，但真实模型调用需要先通过实机安全闸。"
          : "左侧配置已经就绪。先生成一组方案，再选择具体方案出图。"
        : "先检查模型与 Key，再生成方案批次。已有上传素材会作为视觉参考进入方案与生图链路。"
      )}</small>
      <div class="scheme-plan-empty-actions">
        <button
          class="primary-button"
          type="button"
          data-action="generate-schemes"
          title="${escapeAttribute(liveBlocked ? "先开启并通过实机安全闸，再调用真实模型服务" : "")}"
          ${liveBlocked ? "disabled" : ""}
        >生成方案批次</button>
        ${liveBlocked
          ? `<button type="button" data-action="open-settings">打开实机安全闸</button>`
          : modelReady
            ? ""
            : `<button type="button" data-action="open-settings">检查模型与 Key</button>`}
      </div>
    </div>
  `;
}

function requiredModelRoutesReady() {
  const snapshot = state.workspaceSnapshot || {};
  const requiredSlots = ["concept", "image"];
  return requiredSlots.every((slot) => {
    const route = state.providerSlotRoutes?.[slot] || {};
    const providerId = route.providerId || state.provider;
    const provider = snapshot.providerConfigs?.[providerId];
    const credentialReady = state.providerCredential?.providerId === providerId && state.providerCredential?.configured;
    const connectionReady = state.providerConnection?.providerId === providerId && state.providerConnection?.ok;
    const hasConfig = Boolean(provider?.hasApiKey || provider?.status === "success" || credentialReady || connectionReady);
    const hasModel = Boolean(route.model || provider?.modelSlots?.[slot] || provider?.defaultModel);
    return hasConfig && hasModel;
  });
}

function renderProjectLibraryBoard(activeMode) {
  const project = getWorkspaceProject();
  const entries = getProjectLibraryEntries(project);
  const activeEntryId = state.projectLibraryActiveEntryId || "";

  return `
    <section class="center-board project-library-board" aria-label="项目库">
      <div class="project-library-hero">
        <div>
          <span>PROJECT LIBRARY</span>
          <h1>项目库</h1>
          <p>只保存游戏名称和游戏描述。导入后会快速填入左侧项目表单，不会改动素材、方案或归档结果。</p>
        </div>
        <div class="project-library-top-actions">
          <button class="primary" type="button" data-action="project-library-save-current">保存当前项目</button>
          <button type="button" data-view="schemes">收起项目库</button>
        </div>
      </div>
      ${state.projectLibraryMessage ? `<p class="project-library-message">${escapeHtml(state.projectLibraryMessage)}</p>` : ""}

      <div class="project-library-grid">
        <article class="project-library-card current">
          <span>当前表单</span>
          <strong>${escapeHtml(project.name || "未命名项目")}</strong>
          <p>${escapeHtml(project.description || "暂无项目描述。")}</p>
          <div class="project-library-actions">
            <button type="button" data-action="project-library-save-current">保存到项目库</button>
          </div>
        </article>
        ${entries.map((entry) => `
          <article class="project-library-card ${entry.id === activeEntryId ? "active-entry" : ""}">
            <span>${entry.id === activeEntryId ? "当前记录" : "已保存项目"}</span>
            <strong>${escapeHtml(entry.name || "未命名项目")}</strong>
            <p>${escapeHtml(entry.description || "暂无项目描述。")}</p>
            <small>${escapeHtml(formatProjectEntryDate(entry.updatedAt))}</small>
            <div class="project-library-actions">
              <button type="button" data-action="project-library-import" data-project-entry-id="${escapeAttribute(entry.id)}">导入到表单</button>
              <button class="danger" type="button" data-action="project-library-delete-entry" data-project-entry-id="${escapeAttribute(entry.id)}">删除</button>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function getProjectLibraryEntries(project) {
  const savedEntries = Array.isArray(state.projectLibraryEntries) ? state.projectLibraryEntries : [];
  if (savedEntries.length > 0) return savedEntries;

  return [{
    id: project.id || "current-project",
    name: project.name || "未命名项目",
    description: project.description || "",
    updatedAt: state.workspaceSnapshot?.metadata?.updatedAt || "",
  }];
}

function formatProjectEntryDate(value) {
  if (!value) return "未记录更新时间";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "未记录更新时间";
  return `更新 ${date.toLocaleString()}`;
}

function renderResultBoard(activeMode) {
  const results = getModeResults();
  const activeFilter = normalizeResultFilter(state.resultFilter);
  const filteredResults = results.filter((result) => resultMatchesFilter(result, activeFilter));
  const readyCount = results.filter((result) => result.status === "ready").length;
  const storedCount = results.filter((result) => getResultPreviewUrl(result)).length;
  const failedCount = results.filter((result) => result.status === "failed").length;
  const failedImageCount = getFailedImageTaskCount(activeMode.id);

  return `
    <section class="center-board result-board" aria-label="结果画板">
      <div class="result-toolbar">
        <div>
          <span class="result-kicker">输出素材</span>
          <strong>${results.length} 项结果</strong>
          <small>${readyCount} 项可用 / ${storedCount} 个本地文件 / ${failedCount} 项失败。点击图片查看大图与编辑操作。</small>
        </div>
        <div class="result-toolbar-actions">
          ${renderResultFilters(activeFilter, {
            all: results.length,
            ready: readyCount,
            stored: storedCount,
            failed: failedCount,
          })}
          ${failedImageCount > 0 ? `
            <button class="retry-failed-button" type="button" data-action="retry-failed-images">重试全部失败图片 ${failedImageCount}</button>
          ` : ""}
        </div>
      </div>
      ${results.length === 0 ? renderResultEmpty(activeMode) : filteredResults.length === 0 ? renderResultFilteredEmpty(activeFilter) : `
        <div class="result-grid">
          ${filteredResults.map((result) => renderResultCard(result)).join("")}
        </div>
      `}
    </section>
    ${state.resultViewerOpen ? renderResultViewer() : ""}
  `;
}

function renderResultFilters(activeFilter, counts) {
  const filters = [
    { id: "all", label: "全部", count: counts.all },
    { id: "ready", label: "可用", count: counts.ready },
    { id: "stored", label: "本地文件", count: counts.stored },
    { id: "failed", label: "失败", count: counts.failed },
  ];
  return `
    <div class="result-filter-tabs" role="tablist" aria-label="结果筛选">
      ${filters.map((filter) => `
        <button
          class="${filter.id === activeFilter ? "active" : ""}"
          type="button"
          data-result-filter="${escapeAttribute(filter.id)}"
          aria-selected="${filter.id === activeFilter ? "true" : "false"}"
        >${escapeHtml(filter.label)} ${escapeHtml(filter.count)}</button>
      `).join("")}
    </div>
  `;
}

function normalizeResultFilter(value) {
  return ["all", "ready", "stored", "failed"].includes(value) ? value : "all";
}

function resultMatchesFilter(result, filter) {
  if (filter === "ready") return result.status === "ready";
  if (filter === "stored") return Boolean(getResultPreviewUrl(result));
  if (filter === "failed") return result.status === "failed";
  return true;
}

function getFailedImageTaskCount(modeId) {
  const snapshot = state.workspaceSnapshot || {};
  const plans = (snapshot.queuePlans || []).filter((plan) => plan.job?.mode === modeId);
  const plan = plans[plans.length - 1];
  if (!plan) return 0;
  return (plan.tasks || []).filter((task) => task.kind === "imageGeneration" && task.status === "failed").length;
}

function getProjectLibraryFallbackAssets() {
  return [
    { role: "gameCharacter", label: "角色", previewUrl: "" },
    { role: "gameLogo", label: "LOGO", previewUrl: "" },
    { role: "background", label: "场景", previewUrl: "" },
    { role: "prop", label: "BOSS", previewUrl: "" },
  ];
}

function renderResultEmpty(activeMode) {
  const modeLabel = getModeLabel(activeMode.id);
  const hasSchemes = getModeSchemes().some((scheme) => !isSeedWorkspaceScheme(activeMode, scheme));
  const liveGate = getLiveGateViewModel(activeMode);
  const liveBlocked = state.apiMode === "http" && !liveGate.allowed;
  const helper = hasSchemes
    ? liveBlocked
      ? "已有方案可用于出图。先通过实机安全闸，再调用真实模型服务生成图片。"
      : "已有方案可用于出图。继续生成后，这里会显示图片、尺寸、模型输出和下载操作。"
    : liveBlocked
      ? `还没有${modeLabel}方案。先通过实机安全闸，再生成方案与图片。`
      : `还没有${modeLabel}方案。可以直接生成${modeLabel}，系统会先出方案再进入图片渲染。`;
  return `
    <div class="result-empty">
      <span>${getModeAbbrev(activeMode.id)}</span>
      <strong>还没有生成素材</strong>
      <small>${escapeHtml(helper)}</small>
      <div class="result-empty-actions">
        <button
          class="primary-button"
          type="button"
          data-action="submit-generation"
          title="${escapeAttribute(liveBlocked ? "先开启并通过实机安全闸，再调用真实模型服务" : "")}"
          ${liveBlocked ? "disabled" : ""}
        >生成${escapeHtml(modeLabel)}</button>
        ${liveBlocked ? `<button type="button" data-action="open-settings">打开实机安全闸</button>` : ""}
        <button type="button" data-view="schemes">${hasSchemes ? "查看已有方案" : "回到方案"}</button>
      </div>
    </div>
  `;
}

function renderResultFilteredEmpty(activeFilter) {
  const label = {
    ready: "可用结果",
    stored: "本地文件",
    failed: "失败结果",
  }[activeFilter] || "结果";
  return `
    <div class="result-empty">
      <span>FILTER</span>
      <strong>当前没有${escapeHtml(label)}</strong>
      <small>切回全部结果，或继续生成/重试后这里会自动更新。</small>
      <button class="primary-button" type="button" data-result-filter="all">查看全部结果</button>
    </div>
  `;
}

function renderResultCard(result) {
  const scheme = getSchemeById(result.schemeId);
  const display = scheme ? getSchemeDisplay({ id: result.mode }, scheme) : null;
  const selected = state.selectedResult === result.id;
  const confirmingDelete = state.resultDeleteConfirmId === result.id;
  const src = getResultPreviewUrl(result);
  const downloadUrl = getResultDownloadUrlForViewer(result);
  const ratio = result.width && result.height ? simplifyRatio(result.width, result.height) : "";

  return `
    <article class="result-card compact-result ${selected ? "selected" : ""}" data-result-id="${result.id}" tabindex="0">
      <div class="result-preview ${src ? "" : "placeholder"}">
        ${src ? `<img src="${src}" alt="${escapeHtml(display?.title || scheme?.title || result.id)}" width="640" height="360" loading="lazy">` : `<span>等待预览</span>`}
        <div class="result-preview-actions">
          ${renderPreviewIconButton(result.id, "view")}
          ${renderPreviewIconButton(result.id, "edit")}
        </div>
      </div>
      <div class="result-card-body">
        <header>
          <div>
            <span>${escapeHtml(display?.code || scheme?.code || result.schemeId)}</span>
            <h2>${escapeHtml(display?.title || scheme?.title || "生成素材")}</h2>
          </div>
          <strong class="result-status ${escapeAttribute(result.status || "")}">${escapeHtml(formatResultStatus(result.status))}</strong>
        </header>
        <div class="result-meta">
          <span>${escapeHtml(formatResultSize(result))}</span>
          ${ratio ? `<span>${escapeHtml(ratio)}</span>` : ""}
          ${result.model ? `<span>${escapeHtml(result.model)}</span>` : ""}
          <span>${escapeHtml(formatResultDate(result.updatedAt || result.createdAt))}</span>
        </div>
        ${renderResultQualityPill(result)}
        <div class="result-quick-actions">
          <button type="button" data-action="open-result-viewer" data-result-id="${escapeHtml(result.id)}">查看</button>
          <button type="button" data-action="goto-result-scheme" data-scheme-id="${escapeHtml(result.schemeId)}">回到方案</button>
          <button type="button" data-action="regenerate-result" data-result-id="${escapeHtml(result.id)}">重生成片</button>
          <button class="danger ${confirmingDelete ? "confirming" : ""}" type="button" data-action="delete-result" data-result-id="${escapeHtml(result.id)}">${confirmingDelete ? "确认删除" : "删除"}</button>
          ${downloadUrl ? `<a href="${downloadUrl}" download>下载</a>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderPreviewIconButton(resultId, type) {
  const isEdit = type === "edit";
  return `
    <button
      class="preview-icon-action"
      type="button"
      data-action="open-result-viewer"
      data-result-id="${escapeHtml(resultId)}"
      aria-label="${isEdit ? "编辑图片" : "查看大图"}"
      title="${isEdit ? "编辑图片" : "查看大图"}"
    >
      ${isEdit ? renderPenIcon() : renderEyeIcon()}
    </button>
  `;
}

function renderEyeIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `;
}

function renderPenIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20Z"></path>
      <path d="M13.5 6 18 10.5"></path>
    </svg>
  `;
}

function renderResultViewer() {
  const results = getModeResults();
  const result = results.find((item) => item.id === state.selectedResult) || results[0];
  if (!result) return "";

  const scheme = getSchemeById(result.schemeId);
  const display = scheme ? getSchemeDisplay({ id: result.mode }, scheme) : null;
  const previewUrl = getResultPreviewUrl(result);
  const downloadUrl = getResultDownloadUrlForViewer(result);
  const finalSize = `${result.width}x${result.height}`;
  const ratio = result.width && result.height ? simplifyRatio(result.width, result.height) : "自定义";
  const confirmingDelete = state.resultDeleteConfirmId === result.id;

  return `
    <div class="result-viewer" role="dialog" aria-modal="true" aria-label="图片大图查看">
      <button class="result-viewer-close" type="button" data-action="close-result-viewer" aria-label="关闭">×</button>
      <div class="result-viewer-stage">
        ${previewUrl
          ? `<img src="${previewUrl}" alt="${escapeHtml(display?.title || scheme?.title || result.id)}" width="1280" height="720">`
          : `<div class="result-viewer-placeholder">本地预览暂不可用</div>`}
      </div>
      ${renderResultQualityPanel(result)}
      <div class="result-viewer-dock">
        <div class="result-viewer-count">
          <span>${escapeHtml(display?.code || scheme?.code || "RESULT")}</span>
          <strong>${escapeHtml(display?.title || scheme?.title || "生成图片")}</strong>
        </div>
        <div class="result-viewer-specs">
          <span class="mono">${escapeHtml(finalSize)}</span>
          <span class="mono">${escapeHtml(ratio)}</span>
        </div>
        ${renderResultActionButton(result, "variant", "生成变体")}
        ${renderResultActionButton(result, "upscale", "高清放大")}
        ${renderResultActionButton(result, "removeBg", "移除背景")}
        <button type="button" data-action="goto-result-scheme" data-scheme-id="${escapeHtml(result.schemeId)}">回到方案</button>
        <button type="button" data-action="regenerate-result" data-result-id="${escapeHtml(result.id)}">重生成片</button>
        <button class="danger ${confirmingDelete ? "confirming" : ""}" type="button" data-action="delete-result" data-result-id="${escapeHtml(result.id)}">${confirmingDelete ? "确认删除" : "删除结果"}</button>
        ${downloadUrl ? `<a href="${downloadUrl}" download>下载结果</a>` : `<button type="button" disabled>下载结果</button>`}
      </div>
    </div>
  `;
}

function getResultQualityAudit(result) {
  const audit = result?.metadata?.qualityAudit;
  if (!audit || typeof audit !== "object" || audit.version !== "result-quality-audit.v1") return null;
  const findings = Array.isArray(audit.findings) ? audit.findings : [];
  const summary = ["pass", "review", "warning"].includes(audit.summary) ? audit.summary : "review";
  return { ...audit, summary, findings };
}

function resultQualityTone(summary) {
  if (summary === "warning") return "warning";
  if (summary === "review") return "review";
  return "pass";
}

function resultQualityLabel(audit) {
  if (!audit) return "";
  const count = audit.findings.length;
  if (audit.summary === "pass") return "质检通过";
  if (audit.summary === "warning") return `需处理 ${count}`;
  return `需复核 ${count}`;
}

function renderResultQualityPill(result) {
  const audit = getResultQualityAudit(result);
  if (!audit) return "";
  return `
    <div class="result-quality-pill ${resultQualityTone(audit.summary)}" title="${escapeAttribute(resultQualityLabel(audit))}">
      <span>质检</span>
      <strong>${escapeHtml(resultQualityLabel(audit))}</strong>
    </div>
  `;
}

function renderResultQualityPanel(result) {
  const audit = getResultQualityAudit(result);
  if (!audit || audit.findings.length === 0) return "";
  const findings = audit.findings.slice(0, 3);
  return `
    <div class="result-quality-panel ${resultQualityTone(audit.summary)}" aria-label="结果质检提示">
      <div>
        <span>Result Quality Audit</span>
        <strong>${escapeHtml(resultQualityLabel(audit))}</strong>
      </div>
      <ul>
        ${findings.map((item) => `
          <li>
            <strong>${escapeHtml(qualityFindingLabel(item.code))}</strong>
            <span>${escapeHtml(item.recommendation || item.message || item.code)}</span>
          </li>
        `).join("")}
      </ul>
    </div>
  `;
}

function qualityFindingLabel(code) {
  return {
    "icon-rounded-mask-risk": "图标容器",
    "icon-edge-text-mark-risk": "图标边缘标记",
    "logo-text-accuracy-review": "Logo 字形",
    "announcement-copy-safe-review": "文案安全区",
    "collab-missing-partner-brand-logo": "联名标识",
    "target-aspect-ratio-review": "尺寸比例",
    "local-overlay-fallback-applied": "本地兜底",
  }[code] || "质检提示";
}

function getResultPreviewUrl(result) {
  const mockPreviewUrl = typeof result?.metadata?.mockPreviewUrl === "string" ? result.metadata.mockPreviewUrl : "";
  if (mockPreviewUrl) return mockPreviewUrl;
  if (result?.metadata?.source === "mock-provider") return "/mock-results/pizza-poster-preview.svg";
  if (result?.metadata?.resultFile?.storageKey) return getResultDownloadUrl(result, { inline: true });
  if (typeof result?.thumbnailUrl === "string" && result.thumbnailUrl) return result.thumbnailUrl;
  if (typeof result?.assetUrl === "string" && result.assetUrl) return result.assetUrl;
  return "";
}

function getResultDownloadUrlForViewer(result) {
  const mockPreviewUrl = typeof result?.metadata?.mockPreviewUrl === "string" ? result.metadata.mockPreviewUrl : "";
  if (mockPreviewUrl) return mockPreviewUrl;
  if (result?.metadata?.source === "mock-provider") return "/mock-results/pizza-poster-preview.svg";
  if (result?.metadata?.resultFile?.storageKey) return getResultDownloadUrl(result);
  if (typeof result?.assetUrl === "string" && result.assetUrl) return result.assetUrl;
  if (typeof result?.thumbnailUrl === "string" && result.thumbnailUrl) return result.thumbnailUrl;
  return "";
}

function renderResultActionButton(result, action, label) {
  const active = isResultOperationActive(action, result.id);
  const route = resolveResultOperationRoute(action, state.provider);
  const activeMode = modeSpecs[result.mode] || modeSpecs[state.activeMode] || { id: result.mode || state.activeMode };
  const liveGate = getLiveGateViewModel(activeMode);
  const liveBlocked = state.apiMode === "http" && !liveGate.allowed;
  const disabledTitle = liveBlocked
    ? liveGate.blockers?.[0]?.message || "请先开启并通过实机安全闸，再调用真实模型服务。"
    : route.title;
  return `
    <button
      class="${active ? "is-active" : ""} ${liveBlocked ? "is-live-blocked" : ""} ${route.supported ? "is-native-route" : "is-unsupported-route"}"
      type="button"
      data-result-action="${action}"
      data-result-id="${result.id}"
      data-route-provider="${escapeHtml(route.providerId)}"
      title="${escapeHtml(disabledTitle)}"
      aria-label="${escapeHtml(disabledTitle)}"
      ${route.supported && !liveBlocked ? "" : "disabled"}
    >${active ? "已入队" : label}</button>
  `;
}

function renderSchemeCard(activeMode, scheme, selected, schemeResults = []) {
  const display = getSchemeDisplay(activeMode, scheme);
  const confirmingDelete = state.schemeDeleteConfirmId === scheme.id;
  const schemeGeneration = getSchemeGenerationStatus(activeMode, scheme.id);
  const imageGeneration = getImageGenerationStatus(activeMode, scheme.id);
  const liveGate = getLiveGateViewModel(activeMode);
  const liveBlocked = state.apiMode === "http" && !liveGate.allowed;
  const liveBlockedTitle = liveBlocked
    ? liveGate.blockers?.[0]?.message || "先开启并通过实机安全闸，再调用真实模型服务"
    : "";
  const rendering = scheme.status === "loading" || imageGeneration.active;
  const refreshing = schemeGeneration.active;
  const refreshDisabled = refreshing || rendering || liveBlocked || state.submission?.status === "submitting";
  const renderDisabled = rendering || liveBlocked;
  const hasPlanMedia = scheme.status === "failed" || schemeResults.some((result) => getResultPreviewUrl(result));
  const actionLabel = rendering
    ? "生成中"
    : scheme.status === "failed"
      ? "重试"
      : activeMode.id === "logo"
        ? "生成标识"
        : activeMode.id === "icon"
          ? "生成图标"
          : "渲染图片";

  return `
    <article class="scheme-card plan-card ${selected ? "selected" : ""} ${state.copyVisible ? "copy-visible" : "copy-hidden"} ${hasPlanMedia ? "with-plan-media" : "without-plan-media"}" data-scheme-id="${scheme.id}" tabindex="0">
      <header>
        <div>
          <h2>${escapeHtml(display.title)}</h2>
        </div>
        <button
          class="scheme-refresh-button ${refreshing ? "loading" : ""}"
          type="button"
          data-action="refresh-scheme"
          data-scheme-refresh-id="${escapeHtml(scheme.id)}"
          aria-label="刷新这个方案"
          title="${escapeAttribute(liveBlockedTitle || "刷新这个方案")}"
          ${refreshDisabled ? "disabled" : ""}
        >${refreshing ? `<span class="button-spinner" aria-hidden="true"></span>` : "&#8635;"}</button>
      </header>

      <div class="plan-brief-strip">
        <strong>${escapeHtml(display.primary)}</strong>
        <small>${escapeHtml(display.secondary)}</small>
      </div>
      ${state.copyVisible ? renderTextBlocks(display) : ""}

      ${renderPlanImageArea(activeMode, scheme, display, schemeResults)}

      <footer>
        ${renderSchemeVersionPager(scheme, schemeResults)}
        <div class="scheme-card-actions">
          <button
            class="scheme-delete-button ${confirmingDelete ? "confirming" : ""}"
            type="button"
            data-action="delete-scheme"
            data-scheme-delete-id="${escapeHtml(scheme.id)}"
            aria-label="删除方案"
            title="删除方案"
          >${confirmingDelete ? "确认删除" : "删除"}</button>
          <button
            class="render-button ${rendering ? "loading" : ""} ${liveBlocked ? "is-live-blocked" : ""}"
            type="button"
            data-action="submit-generation"
            data-scheme-id="${escapeHtml(scheme.id)}"
            title="${escapeAttribute(liveBlockedTitle)}"
            ${renderDisabled ? "disabled" : ""}
          >
            ${rendering ? `<span class="button-spinner" aria-hidden="true"></span><span>${actionLabel}</span>` : actionLabel}
          </button>
        </div>
      </footer>
    </article>
  `;
}

function renderPlanImageArea(activeMode, scheme, display, schemeResults) {
  const variantIndex = getSelectedSchemeVariantIndex(scheme.id);
  const primaryResult = schemeResults[variantIndex] || schemeResults.find((result) => getResultPreviewUrl(result)) || schemeResults[0];
  const previewUrl = primaryResult ? getResultPreviewUrl(primaryResult) : "";

  if (previewUrl && primaryResult) {
    return `
      <div
        class="plan-image-frame has-image clickable"
        data-action="open-result-viewer"
        data-result-id="${escapeHtml(primaryResult.id)}"
        role="button"
        tabindex="0"
        aria-label="查看大图"
      >
        <img src="${previewUrl}" alt="${escapeHtml(display.title)}" width="640" height="360" loading="lazy">
        <span class="plan-image-size">${escapeHtml(formatResultSize(primaryResult))}</span>
        <div class="result-preview-actions plan-preview-actions">
          ${renderPreviewIconButton(primaryResult.id, "view")}
          ${renderPreviewIconButton(primaryResult.id, "edit")}
        </div>
      </div>
    `;
  }

  if (scheme.status === "failed") {
    return `
      <div class="plan-image-frame plan-image-state failed">
        <strong>方案生成失败</strong>
        <small>${escapeHtml(display.brief || "Provider 暂时不可用，请重试生成方案。")}</small>
      </div>
    `;
  }

  return "";
}

function renderSchemeVersionPager(scheme, schemeResults) {
  const total = Math.max(4, parseProgressTotal(scheme.progress), schemeResults.length);
  const readyCount = Math.max(schemeResults.length, parseProgressDone(scheme.progress));
  const activeIndex = Math.min(getSelectedSchemeVariantIndex(scheme.id), Math.min(total, 6) - 1);
  const buttons = Array.from({ length: Math.min(total, 6) }, (_, index) => {
    const number = index + 1;
    const active = index === activeIndex;
    const filled = number <= readyCount;
    return `<button class="${active ? "active" : ""} ${filled ? "filled" : ""}" type="button" data-scheme-id="${escapeHtml(scheme.id)}" data-scheme-variant="${number}" aria-label="方案变体 ${number}">${number}</button>`;
  });

  return `<div class="version-pager">${buttons.join("")}</div>`;
}

function getSelectedSchemeVariantIndex(schemeId) {
  const rawValue = state.selectedSchemeVariants?.[schemeId];
  return Number.isFinite(rawValue) ? Math.max(0, Math.floor(rawValue)) : 0;
}

function groupResultsByScheme(results) {
  const grouped = new Map();
  for (const result of results) {
    const key = result.schemeId || "";
    if (!key) continue;
    const current = grouped.get(key) || [];
    current.push(result);
    grouped.set(key, current);
  }
  return grouped;
}

function parseProgressTotal(progress) {
  const match = String(progress || "").match(/\/\s*(\d+)/);
  return match ? Number(match[1]) || 0 : 0;
}

function parseProgressDone(progress) {
  const match = String(progress || "").match(/^\s*(\d+)/);
  return match ? Number(match[1]) || 0 : 0;
}

function getSchemeStatusText(scheme) {
  return {
    ready: "已生成",
    loading: "生成中",
    rendering: "生成中",
    pending: "待生成",
    empty: "待确认",
    failed: "失败",
    archived: "已归档",
  }[scheme.status] || "待处理";
}

function renderVisualBlocks(activeMode, scheme, display) {
  if (scheme.status === "empty") {
    return `<div class="preview-empty"><span></span><strong>等待生成</strong><small>请先确认方案字段</small></div>`;
  }

  if (scheme.status === "failed") {
    return `<div class="preview-failed"><strong>渲染失败</strong><p>参考分析超时，可单独重试此方案。</p></div>`;
  }

  if (activeMode.id === "logo") {
    return `
      <div class="slogan-box">
        <strong>${escapeHtml(display.primary)}</strong>
        <small>${escapeHtml(display.secondary)}</small>
      </div>
      <div class="logo-mark-preview ${scheme.tone}">
        <b>Pizza Kitchen</b>
        <span>纯色背景</span>
      </div>
    `;
  }

  if (activeMode.id === "icon") {
    return `
      <div class="slogan-box">
        <strong>${escapeHtml(display.primary)}</strong>
        <small>${escapeHtml(display.secondary)}</small>
      </div>
      <div class="icon-mark-preview ${scheme.tone}">
        <i></i>
        <b>1:1</b>
        <span>无文字</span>
      </div>
    `;
  }

  return `
    <div class="slogan-box">
      <strong>${escapeHtml(display.primary)}</strong>
      <small>${escapeHtml(display.secondary)}</small>
    </div>
    <div class="preview-stack ${scheme.status === "loading" ? "is-loading" : ""}">
      <div class="poster-thumb ${scheme.tone}">
        <b>${escapeHtml(display.brand)}</b>
        <em>${escapeHtml(display.visualHero)}</em>
        <i></i>
        <span>1080x1920</span>
      </div>
      <div class="poster-wide ${scheme.tone}">
        <b>${scheme.code}</b>
        <span>1920x1080</span>
      </div>
      <div class="poster-banner ${scheme.tone}">
        <b>活动</b>
        <span>1200x627</span>
      </div>
    </div>
  `;
}

function renderTextBlocks(display) {
  return `
    <div class="scheme-copy-details">
      ${renderSchemeCopyField("视觉方向", display.brief)}
      ${renderSchemeCopyField("生图提示词", display.promptZh || display.promptEn || display.prompt)}
    </div>
  `;
}

function renderSchemeCopyField(label, value) {
  const text = String(value || "").trim() || "待生成";
  return `
    <div class="scheme-copy-field">
      <span>${escapeHtml(label)}</span>
      <p>${escapeHtml(text)}</p>
    </div>
  `;
}

function renderDecisionTiles(activeMode, existingCount) {
  const modeId = activeMode.id || "poster";
  const copyList = schemeDisplayCopy[modeId] || schemeDisplayCopy.poster;
  const tiles = copyList.slice(existingCount, 4);
  if (tiles.length === 0) return "";

  return tiles.map((tile, index) => `
    <article class="scheme-card decision-tile" tabindex="0">
      <header>
        <div>
          <span>队列 ${String(existingCount + index + 1).padStart(2, "0")}</span>
          <h2>${escapeHtml(tile.title)}</h2>
        </div>
      </header>
      <div class="slogan-box">
        <strong>${escapeHtml(tile.primary)}</strong>
        <small>${escapeHtml(tile.secondary)}</small>
      </div>
      <div class="decision-tile-preview ${index % 2 === 0 ? "warm" : "cool"}">
        <i></i>
        <span>${escapeHtml(tile.visualHero)}</span>
      </div>
      <footer>
        <small>计划中</small>
        <button class="render-button" type="button">创建</button>
      </footer>
    </article>
  `).join("");
}

const schemeDisplayCopy = {
  poster: [
    {
      title: "奖励揭晓海报",
      primary: "奖励时刻",
      secondary: "商店主图 / 多尺寸适配",
      brief: "以奖励揭晓为核心，角色姿态稳定，重点奖励明确，边缘保留裁切安全区。",
      prompt: "生成精致休闲奇幻风游戏海报，突出温暖奖励光效、清晰主体比例和可裁切构图。",
      locked: ["角色", "标识", "姿态"],
      brand: "Poster Lab",
      visualHero: "奖励",
    },
    {
      title: "试玩广告帧",
      primary: "试玩画面",
      secondary: "9:16 / 4 个变体",
      brief: "接近真实玩法截图的构图，保持角色姿态和奖励逻辑在变体中一致。",
      prompt: "生成可试玩广告画面，交互目标清楚，角色轮廓稳定，优先适配移动端裁切。",
      locked: ["姿态", "奖励", "裁切"],
      brand: "游戏 UI",
      visualHero: "试玩",
    },
    {
      title: "横幅组合",
      primary: "横幅套图",
      secondary: "16:9 / 3 种裁切",
      brief: "面向商店与买量位的横向视觉，保持统一美术方向。",
      prompt: "生成横幅套图，保留安静留白、明确奖励阅读点和 标识 安全区。",
      locked: ["标识", "版式", "色彩"],
      brand: "活动",
      visualHero: "上线",
    },
    {
      title: "暗色预览",
      primary: "暗色检查",
      secondary: "主题预览",
      brief: "用暗色工作台检查同一套视觉决策的对比和层级。",
      prompt: "生成暗色预览版本，保持相同主体、克制对比和更高图片优先级。",
      locked: ["主题", "对比", "主体"],
      brand: "检查",
      visualHero: "复核",
    },
  ],
  collab: [
    {
      title: "原生联动",
      primary: "品牌进入世界观",
      secondary: "游戏优先构图",
      brief: "合作品牌通过道具和配色自然出现，游戏世界仍是主导。",
      prompt: "生成原生联动活动画面，控制品牌露出比例，保持角色姿态一致。",
      locked: ["角色", "品牌", "世界观"],
      brand: "联动",
      visualHero: "原生",
    },
    {
      title: "品牌优先画面",
      primary: "品牌时刻",
      secondary: "买量裁切",
      brief: "增强品牌识别，但不改变或合并游戏角色身份。",
      prompt: "生成品牌优先的联动画面，产品线索清晰，角色分离安全，裁切区干净。",
      locked: ["品牌", "姿态", "裁切"],
      brand: "品牌",
      visualHero: "上新",
    },
    {
      title: "活动主视觉",
      primary: "活动揭晓",
      secondary: "公告可用",
      brief: "活动上线主视觉，平衡合作品牌标识和游戏调性。",
      prompt: "生成活动主视觉，层级清晰，保留合作 标识 区，使用休闲奇幻光影。",
      locked: ["标识", "活动", "版式"],
      brand: "活动",
      visualHero: "开启",
    },
  ],
  announcement: [
    {
      title: "维护公告",
      primary: "服务通知",
      secondary: "高可读面板",
      brief: "运营公告面板，优先保证文字安全区，减少无关装饰。",
      prompt: "生成清晰游戏公告面板，标题区可读，背景安静，角色仅作为辅助视觉。",
      locked: ["文字", "面板", "标识"],
      brand: "公告",
      visualHero: "更新",
    },
    {
      title: "版本更新",
      primary: "新版本",
      secondary: "商店 / 社区可用",
      brief: "版本公告需要清晰标题和稳定视觉锚点。",
      prompt: "生成版本更新图，层级明确，面板间距干净，视觉焦点稳定。",
      locked: ["标题", "面板", "裁切"],
      brand: "补丁",
      visualHero: "V2",
    },
  ],
  logo: [
    {
      title: "奇幻字标",
      primary: "字标主体",
      secondary: "纯色背景检查",
      brief: "小尺寸下仍要清晰，轮廓锐利，便于导出和抠图。",
      prompt: "生成奇幻游戏字标，轮廓清楚，字距稳定，纯色背景下可读。",
      locked: ["字标", "纯色背景", "对比"],
      brand: "标识",
      visualHero: "字标",
    },
  ],
  icon: [
    {
      title: "主图标",
      primary: "方形识别",
      secondary: "1:1 / 无文字",
      brief: "满铺方形图标，主体轮廓一眼可识别。",
      prompt: "生成方形应用图标，不含文字，主体重心强，画面满铺，小尺寸清晰。",
      locked: ["1:1", "无文字", "主体"],
      brand: "图标",
      visualHero: "1:1",
    },
  ],
};

function getSchemeDisplay(activeMode, scheme) {
  if (state.workspaceLoadStatus !== "static") {
    const title = localizeSchemeTitle(scheme.title);
    const primary = localizeSchemeTitle(scheme.zh || scheme.title || "");
    const secondary = localizeSchemeSubtitle(scheme.en || scheme.platform || "");
    const brief = localizeSchemeBrief(scheme.brief || "");
    const prompt = localizeSchemePrompt(scheme.prompt || "");
    const promptZh = localizeSchemePrompt(scheme.promptZh || "");
    const promptEn = localizeSchemePrompt(scheme.promptEn || "");
    return {
      code: scheme.code || "ART",
      title: title || "生成素材",
      primary: primary || "宣发素材",
      secondary: secondary || "生产可用",
      brief: brief || "暂无方案说明。",
      prompt: prompt || "暂无提示词。",
      promptZh: promptZh || prompt || "暂无中文提示词。",
      promptEn: promptEn || prompt || "No English prompt yet.",
      locked: Array.isArray(scheme.locked) ? scheme.locked : [],
      brand: activeMode?.id === "announcement" ? "公告" : "活动",
      visualHero: activeMode?.id === "collab" ? "联动" : activeMode?.id === "announcement" ? "更新" : "奖励",
    };
  }

  const modeId = activeMode?.id || "poster";
  const copyList = schemeDisplayCopy[modeId] || schemeDisplayCopy.poster;
  const codeIndex = Math.max(0, (Number(String(scheme.code || "").match(/\d+/)?.[0]) || 1) - 1);
  const copy = copyList[codeIndex % copyList.length] || copyList[0];
  return {
    code: scheme.code || `ART-${codeIndex + 1}`,
    ...copy,
    promptZh: copy.prompt,
    promptEn: copy.prompt,
  };
}

function localizeSchemeTitle(value) {
  const text = String(value || "").trim();
  const normalized = text.toLowerCase();
  if (normalized === "poster production direction") return "海报生产方向";
  if (normalized === "from brief to batch output") return "从创意到批量出图";
  if (normalized === "poster campaign result") return "海报生成结果";
  return text;
}

function localizeSchemeSubtitle(value) {
  const text = String(value || "").trim();
  if (/^from brief to batch output$/i.test(text)) return "从创意到批量出图";
  return text;
}

function localizeSchemeBrief(value) {
  const text = String(value || "").trim();
  if (/stored poster creative brief/i.test(text)) {
    return "用于项目恢复和归档测试的海报创意简报。";
  }
  return text;
}

function localizeSchemePrompt(value) {
  const text = String(value || "").trim();
  if (/Storage:\s*This prompt block is stored as project context/i.test(text)) {
    return "该提示词块作为项目上下文保存，不会由界面重新生成。";
  }
  return text.replace(/^Storage:\s*/i, "存档提示词：");
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

function getModeAbbrev(modeId) {
  return {
    poster: "P",
    collab: "C",
    announcement: "N",
    logo: "L",
    icon: "I",
  }[modeId] || "A";
}

function formatResultStatus(status) {
  return {
    ready: "可用",
    pending: "排队",
    running: "生成中",
    rendering: "生成中",
    failed: "失败",
    archived: "已归档",
  }[status] || status || "未知";
}

function formatResultDate(value) {
  if (!value) return "未知时间";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "未知时间";
  return date.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatResultSize(result) {
  if (!result?.width || !result?.height) return "待定尺寸";
  return `${result.width}x${result.height}`;
}

function simplifyRatio(width, height) {
  const left = Number(width);
  const right = Number(height);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) return "";
  const divisor = gcd(Math.round(left), Math.round(right));
  return `${Math.round(left / divisor)}:${Math.round(right / divisor)}`;
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

function getModeName(modeId) {
  return {
    poster: "海报",
    collab: "联名",
    announcement: "公告",
    logo: "LOGO",
    icon: "图标",
  }[modeId] || modeId || "模式";
}

function getAssetRoleName(role) {
  return {
    gameCharacter: "角色",
    collabCharacter: "联名角色",
    gameLogo: "LOGO",
    brandLogo: "品牌 LOGO",
    background: "场景",
    prop: "道具",
    uiScreenshot: "界面截图",
    styleReference: "画风参考",
    compositionReference: "构图参考",
    subjectReference: "主体参考",
  }[role] || role || "素材";
}

function normalizeProjectAssetLabel(label) {
  return String(label || "").replace(/品牌\s*标识/g, "品牌 LOGO").replace(/游戏\s*标识/g, "游戏 LOGO").replace(/标识/g, "LOGO");
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
