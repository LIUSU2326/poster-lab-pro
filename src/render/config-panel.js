import { modeOrder, modeSpecs } from '../data/modes.js';
import {
  getAssetSlotsForMode,
  getDefaultAssetRoleForMode,
  getWorkspaceProject,
  getWorkspaceSnapshotSummary,
} from '../data/workspace-adapters.js';
import { getActiveGenerationFormValues } from '../generation-form-runtime.js';
import { state } from '../state.js';

const modeCopy = {
  poster: {
    label: "海报",
    short: "海报",
    description: "休闲解谜 RPG 上线批量方案，保持主视觉清晰、裁切安全、可用于商店与广告位。",
    cta: "生成海报批次",
    styles: [
      "精致休闲奇幻", "电影感奖励揭示", "角色反应组合", "商店头图裁切", "国潮厚涂", "低多边形",
      "像素复古", "欧美写实", "赛博霓虹", "水彩绘本", "厚涂奇幻", "黏土定格",
      "日系赛璐璐", "美式卡通", "暗黑哥特", "明亮童话", "蒸汽朋克", "魔幻写实",
      "科幻机甲", "童趣手绘", "纸艺拼贴", "复古海报", "漫画分镜", "硬表面3D",
      "柔光治愈", "荒野写实", "海岛度假", "森林冒险", "街机霓虹", "可爱三渲二",
      "油画质感", "剪纸舞台", "定格玩具", "广告大片", "轻奢产品", "手绘绘本",
    ],
    directionTitle: "上传画风参考",
    directionHelper: "上传画风、光影、材质或品牌参考，作为当前批次的视觉约束。",
    assets: ["角色", "LOGO", "场景", "BOSS"],
  },
  collab: {
    label: "联名",
    short: "联名",
    description: "品牌联名批量方案，保持原生游戏构图，并控制品牌露出比例。",
    cta: "生成联名方案",
    styles: ["原生联名", "品牌优先", "游戏优先", "活动主视觉", "高端大片", "双主角对峙", "街头潮流", "节日限定"],
    directionTitle: "品牌与游戏平衡",
    directionHelper: "游戏世界保持主导，品牌通过色彩、材质和道具自然融入。",
    assets: ["角色", "品牌 LOGO", "品牌素材", "场景"],
  },
  announcement: {
    label: "公告",
    short: "公告",
    description: "运营公告批量方案，强调文字层级和安全排版区域。",
    cta: "生成公告图",
    styles: ["维护公告", "版本更新", "限时活动", "社区赛事"],
    directionTitle: "先保证可读性",
    directionHelper: "为文案留出安静空间，避免文字后方出现过多噪声。",
    assets: ["角色", "LOGO", "面板", "背景"],
  },
  logo: {
    label: "标识",
    short: "标识",
    description: "字标和 标识 方向探索，强制检查纯色背景和小尺寸可读性。",
    cta: "生成标识方案",
    styles: ["奇幻字标", "科幻字标", "休闲吉祥物", "古代战斗"],
    directionTitle: "标识系统优先",
    directionHelper: "检查轮廓、对比度、小尺寸识别和纯色背景导出。",
    assets: ["字标", "情绪", "竞品", "使用场景"],
  },
  icon: {
    label: "图标",
    short: "图标",
    description: "应用图标与方形构图探索，默认无文字、主体满铺、直角输出。",
    cta: "生成图标方案",
    styles: ["英雄近景", "道具聚焦", "奖励图标", "生物图标"],
    directionTitle: "方形识别优先",
    directionHelper: "优先处理轮廓、视觉重心和小尺寸下的一眼识别。",
    assets: ["主体", "风格", "构图", "光照"],
  },
};

export function renderConfigPanel(activeMode) {
  if (state.leftCollapsed) {
    return `
      <aside class="config-panel collapsed" aria-label="生产配置已收起">
        <button class="left-collapse-button" type="button" data-action="toggle-left-panel" aria-label="展开左侧配置">
          <span>PL</span>
          <i>›</i>
        </button>
      </aside>
    `;
  }

  const project = getWorkspaceProject();
  const snapshotSummary = getWorkspaceSnapshotSummary();
  const copy = getModeCopy(activeMode.id);
  const defaultAssetRole = getDefaultAssetRoleForMode(activeMode.id);
  const assetSlots = [
    ...normalizeAssetSlots(activeMode.id, getAssetSlotsForMode(activeMode.id, activeMode.assets)),
    ...getCustomAssetSlots(activeMode.id, defaultAssetRole),
  ];
  const form = getActiveGenerationFormValues();
  const projectBrief = form.projectBrief;
  const direction = getDirectionPayload(activeMode.id);
  const outputSizes = getOutputSizes(activeMode.id, activeMode.outputSizes);
  const briefDescription = projectBrief.gameDescription || project.description || copy.description;

  return `
    <aside class="config-panel" aria-label="生产配置">
      <div class="brand-row">
        <span class="brand-mark">PL</span>
        <div>
          <strong>Poster Lab</strong>
          <small>游戏宣发创意台</small>
        </div>
        <button class="panel-collapse-button" type="button" data-action="toggle-left-panel" aria-label="收起左侧配置">收起</button>
      </div>

      <div class="mode-tabs" role="tablist" aria-label="生产模式">
        ${modeOrder.map((modeId) => {
          const mode = modeSpecs[modeId];
          const itemCopy = getModeCopy(mode.id);
          return `<button class="${mode.id === activeMode.id ? "active" : ""}" type="button" data-mode="${mode.id}" role="tab" aria-selected="${mode.id === activeMode.id}">${itemCopy.label}</button>`;
        }).join("")}
      </div>

      <div class="config-scroll">
        <section class="config-section">
          <div class="section-title">
            <span>01 项目</span>
            <button type="button" data-view="project-library">项目库</button>
          </div>
          <div
            data-react-brief-section
            data-brief-mode="${activeMode.id}"
            data-mode-short="${escapeAttribute(copy.short)}"
            data-revision="${snapshotSummary.revision}"
            data-asset-count="${snapshotSummary.assetCount}"
          ></div>
          <div data-brief-section-fallback>
            <button class="project-chip" type="button">
              <span>${escapeHtml(projectBrief.projectName || project.name || "Game launch")}</span>
              <small>${copy.short} / 版本 ${snapshotSummary.revision} / ${snapshotSummary.assetCount} 个素材</small>
            </button>
            <textarea aria-label="项目描述" data-form-field="projectBrief.gameDescription">${escapeHtml(briefDescription)}</textarea>
            ${renderModeBrief(activeMode, form)}
          </div>
        </section>

        <section class="config-section">
          <div class="section-title">
            <span>02 素材</span>
            <button type="button" data-assets-add-fallback data-action="simulate-asset-upload" data-asset-role="${defaultAssetRole}" data-asset-label="${copy.short}参考">上传</button>
          </div>
          <div
            data-react-assets-section
            data-assets-mode="${activeMode.id}"
            data-asset-slots="${escapeAttribute(JSON.stringify(assetSlots))}"
            data-default-asset-role="${escapeAttribute(defaultAssetRole)}"
            data-reference-role="${escapeAttribute("compositionReference")}"
            data-reference-label="${escapeAttribute("构图参考")}"
            data-reference-helper="${escapeAttribute(activeMode.id === "icon" ? "上传方形构图参考，用于轮循分配。" : "上传构图、版式或裁切参考。")}"
            data-asset-operation="${escapeAttribute(JSON.stringify(state.assetOperation || null))}"
          ></div>
          <div data-assets-section-fallback>
            <div class="asset-grid ${assetSlots.length > 4 ? "asset-grid-dense" : ""}">
              ${assetSlots.map((asset) => `
                <button class="asset-slot ${asset.tone}" type="button" data-action="simulate-asset-upload" data-asset-role="${asset.role || defaultAssetRole}" data-asset-label="${escapeAttribute(asset.label)}">
                  <i></i>
                  <strong>${escapeHtml(asset.label)}</strong>
                  <small>${escapeHtml(asset.state)}</small>
                </button>
              `).join("")}
            </div>
            <button class="upload-drop" type="button" data-action="simulate-asset-upload" data-asset-role="compositionReference" data-asset-label="构图参考">
              <span>构图参考</span>
              <small>${activeMode.id === "icon" ? "上传方形构图参考。" : "上传构图或裁切参考。"}</small>
            </button>
          </div>
        </section>

        <section class="config-section">
          <div class="section-title">
            <span>03 画风</span>
            <button type="button" data-action="rotate-direction-library" data-direction-mode="${activeMode.id}">换一组</button>
          </div>
          <div
            data-react-direction-section
            data-direction-mode="${activeMode.id}"
            data-styles="${escapeAttribute(JSON.stringify(direction.styles))}"
            data-direction-title="${escapeAttribute(direction.title)}"
            data-direction-helper="${escapeAttribute(direction.helper)}"
          ></div>
          <div data-direction-section-fallback>
            ${renderModeDirection(activeMode, form)}
          </div>
        </section>

        <section class="config-section">
          <div class="section-title">
            <span>04 输出</span>
            <button type="button" data-action="toggle-suite-manager">套装管理</button>
          </div>
          <div
            data-react-output-settings
            data-output-mode="${activeMode.id}"
            data-output-sizes="${escapeAttribute(JSON.stringify(outputSizes))}"
            data-size-note="${escapeAttribute(getOutputNote(activeMode.id, activeMode.sizeNote))}"
          ></div>
          <div data-output-settings-fallback>
            ${renderModeOutput(activeMode, form, outputSizes)}
          </div>
        </section>

        <section class="config-section">
          <div class="section-title">
            <span>05 模型</span>
            <button type="button" data-action="open-settings">配置</button>
          </div>
          <div class="engine-card engine-card-compact">
            <strong>自动路由模型</strong>
            <span>已启用</span>
          </div>
        </section>
      </div>

      <div class="config-action">
        <button class="primary-button wide" type="button" data-action="submit-generation">${copy.cta}</button>
      </div>
    </aside>
  `;
}

function getModeCopy(modeId) {
  return modeCopy[modeId] || modeCopy.poster;
}

function getDirectionPayload(modeId) {
  const copy = getModeCopy(modeId);
  return {
    styles: copy.styles,
    title: copy.directionTitle,
    helper: copy.directionHelper,
  };
}

function normalizeAssetSlots(modeId, slots) {
  const labels = getModeCopy(modeId).assets;
  return slots.map((slot, index) => ({
    ...slot,
    label: normalizeAssetLabel(labels[index] || slot.label || `Asset ${index + 1}`),
    state: slot.previewUrl ? "已就绪" : index < 2 ? "待上传" : "可选",
  }));
}

function normalizeAssetLabel(label) {
  return String(label || "").replace(/品牌\s*标识/g, "品牌 LOGO").replace(/游戏\s*标识/g, "游戏 LOGO").replace(/标识/g, "LOGO");
}

function getCustomAssetSlots(modeId, defaultRole) {
  const labels = Array.isArray(state.customAssetCategories?.[modeId]) ? state.customAssetCategories[modeId] : [];
  return labels.map((label) => ({
    role: defaultRole || "styleReference",
    label,
    state: "自定义",
    tone: "custom",
  }));
}

function getOutputNote(modeId, fallback) {
  return {
    poster: "批量输出会同时照顾竖版、商店主图和广告位裁切安全。",
    collab: "导出一个原生游戏方向，并保留品牌安全裁切。",
    announcement: "保持文字安全区，适配社区、商店和信息流。",
    logo: "审批前检查浅色、深色和纯色背景下的可读性。",
    icon: "图标模式锁定 1:1，并避免文字型输出。",
  }[modeId] || fallback || "输出设置会应用到当前批次。";
}

function getOutputSizes(modeId, fallback = []) {
  const sizes = {
    poster: ["16:9", "9:16", "1:1", "4:3", "1200x627", "自定义"],
    collab: ["16:9", "9:16", "1:1", "1200x627", "自定义"],
    announcement: ["16:9", "9:16", "1:1", "4:3", "1200x627", "自定义"],
    logo: ["方形", "横版", "浅色背景", "深色背景"],
    icon: ["1:1"],
  }[modeId];
  return sizes || fallback;
}

function escapeAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderAssetOperation() {
  const operation = state.assetOperation;
  if (!operation) return "";

  const status = operation.status === "ready" ? "ready" : operation.status === "error" ? "error" : "planning";
  const detail = operation.status === "ready"
      ? `${operation.transport || "静态"} / ${operation.assetCount ?? "本地"} 个素材`
    : operation.status === "error"
      ? operation.error || "素材路由失败"
      : `${operation.transport || "静态"} 路由待处理`;

  return `
    <div class="asset-route-status ${status}">
      <span>素材路由</span>
      <strong>${escapeHtml(operation.label || operation.role || "素材")}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}

function renderModeBrief(activeMode, form) {
  const modeForm = form.modeForm;
  const projectBrief = form.projectBrief;

  if (activeMode.id === "collab") {
    return `
      <div class="mode-context">
        <div class="mode-context-head">
          <strong>合作品牌</strong>
          <span>原生</span>
        </div>
        <input value="${escapeAttribute(modeForm.collabBrandName || "")}" aria-label="合作品牌名称" data-form-field="modeForm.collabBrandName" />
        <input value="高级、轻松、家庭友好或活动指定调性" aria-label="合作品牌调性" />
        <div class="segmented compact">
          ${["native", "brand", "game"].map((value) => `<button class="${modeForm.collabStyleInjection === value ? "active" : ""}" type="button" data-form-choice="modeForm.collabStyleInjection" data-choice-value="${value}">${value === "native" ? "原生" : value === "brand" ? "品牌" : "游戏"}</button>`).join("")}
        </div>
      </div>
    `;
  }

  if (activeMode.id === "announcement") {
    return `
      <div class="mode-context">
        <div class="mode-context-head">
          <strong>公告标题</strong>
          <span>必填</span>
        </div>
        <input value="${escapeAttribute(modeForm.announcementTitle || "")}" aria-label="公告标题" data-form-field="modeForm.announcementTitle" />
        <div class="segmented compact">
          <button class="${modeForm.layoutMode === "integratedTypography" ? "active" : ""}" type="button" data-form-choice="modeForm.layoutMode" data-choice-value="integratedTypography">融入场景</button>
          <button class="${modeForm.layoutMode === "regularPanel" ? "active" : ""}" type="button" data-form-choice="modeForm.layoutMode" data-choice-value="regularPanel">常规面板</button>
        </div>
      </div>
    `;
  }

  if (activeMode.id === "logo") {
    return `
      <div class="mode-context">
        <div class="mode-context-head">
          <strong>字标</strong>
          <span>标识</span>
        </div>
        <input value="${escapeAttribute(modeForm.wordmark || "")}" aria-label="标识 字标" data-form-field="modeForm.wordmark" />
        <div class="mode-field-grid">
          <button class="active" type="button">奇幻</button>
          <button type="button">科幻</button>
          <button type="button">休闲</button>
          <button type="button">战斗</button>
        </div>
      </div>
    `;
  }

  if (activeMode.id === "icon") {
    return `
      <div class="mode-context">
        <div class="mode-context-head">
          <strong>图标重点</strong>
          <span>标签</span>
        </div>
        <input value="${escapeAttribute(projectBrief.focusGuidance || "")}" aria-label="图标重点" data-form-field="projectBrief.focusGuidance" />
        <div class="guardrail-chips">
          <span>锁定 1:1</span>
          <span>无文字</span>
          <span>满铺</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="guidance-box">
      <div>
        <strong>侧重点引导</strong>
        <button type="button">开启</button>
      </div>
      <input value="${escapeAttribute(projectBrief.focusGuidance || "")}" aria-label="侧重点引导" data-form-field="projectBrief.focusGuidance" />
    </div>
  `;
}

function renderModeDirection(activeMode, form) {
  const modeForm = form.modeForm;
  const direction = getDirectionPayload(activeMode.id);

  if (activeMode.id === "announcement") {
    return `
      <div class="preset-groups">
        ${[
          ["运营", ["维护公告", "版本更新", "系统升级"]],
          ["活动", ["每日登录", "限时礼包", "充值返利"]],
          ["社区", ["决赛", "公会战", "直播活动"]],
          ["账号", ["封禁通知", "找回账号", "身份验证"]],
        ].map(([group, items]) => `
          <div>
            <strong>${group}</strong>
            <span>${items.map((item) => `<button type="button">${item}</button>`).join("")}</span>
          </div>
        `).join("")}
      </div>
      <div class="mode-lock-note">
        <strong>${direction.title}</strong>
        <small>${direction.helper}</small>
      </div>
    `;
  }

  const activeTags = Array.isArray(modeForm.styleTags) ? modeForm.styleTags : [];
  return `
    <input class="search-input" value="搜索 ${direction.styles.length}+ 个视觉方向..." aria-label="搜索视觉方向" readonly />
    <div class="chip-grid">
      ${direction.styles.map((chip, index) => `<button class="${activeTags.includes(chip) || (activeTags.length === 0 && index === 0) ? "active" : ""}" type="button" data-form-choice="modeForm.styleTags" data-choice-value="${escapeAttribute(chip)}" data-choice-multi="true">${escapeHtml(chip)}</button>`).join("")}
    </div>
    <div class="mode-lock-note">
      <strong>${direction.title}</strong>
      <small>${direction.helper}</small>
    </div>
  `;
}

function renderModeOutput(activeMode, form, outputSizes) {
  const outputSettings = form.outputSettings;

  return `
    <div class="size-grid ${activeMode.id === "icon" ? "single-size" : ""}">
      ${outputSizes.map((item) => `<button class="${outputSettings.aspectRatios.includes(item) ? "active" : ""}" type="button" data-form-choice="outputSettings.aspectRatios" data-choice-value="${escapeAttribute(item)}" ${activeMode.id === "icon" ? "" : 'data-choice-multi="true"'}>${escapeHtml(item)}</button>`).join("")}
    </div>
    ${activeMode.id === "logo" ? `
      <div class="mode-field-grid solid-bg-grid">
        <button class="active" type="button">白底</button>
        <button type="button">黑底</button>
        <button type="button">绿幕</button>
        <button type="button">自定义</button>
      </div>
    ` : ""}
    <div class="segmented">
      <button class="active" type="button">${activeMode.id === "icon" ? "锁定方形" : "统一方案"}</button>
      <button type="button">${activeMode.id === "icon" ? "不改尺寸" : "独立方案"}</button>
    </div>
    <p class="output-note">${getOutputNote(activeMode.id, activeMode.sizeNote)}</p>
  `;
}
