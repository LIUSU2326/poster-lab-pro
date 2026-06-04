import { modeOrder, modeSpecs } from '../data/modes.js';
import {
  getAssetSlotsForMode,
  getDefaultAssetRoleForMode,
  getProviderRows,
  getWorkspaceProject,
  getWorkspaceSnapshotSummary,
} from '../data/workspace-adapters.js';
import { getBatchSchemeGenerationStatus } from '../data/generation-activity.js';
import { getLiveGateViewModel } from '../data/live-gate-view-model.js';
import { getActiveGenerationFormValues } from '../generation-form-runtime.js';
import { state } from '../state.js';
import {
  evaluateQueuePlanCapabilityGate,
  evaluateProviderRouteCapabilityGate,
  providerCapabilityGateUserMessage,
} from '../provider-capabilities.js';

const modeCopy = {
  poster: {
    label: "海报",
    short: "海报",
    description: "休闲解谜 RPG 上线批量方案，保持主视觉清晰、裁切安全、可用于商店与广告位。",
    cta: "生成方案批次",
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
    label: "Logo",
    short: "Logo",
    description: "品牌 Logo 与 3D 字标方向探索，强调字标/标识主体、纯色背景、可抠图和品牌可读性。",
    cta: "生成 Logo 方案集",
    styles: ["3D 潮流粘土", "史诗暗金 RPG", "赛博霓虹", "欧美扁平矢量", "国风水墨", "电竞猛兽图腾", "至尊钻金", "街头涂鸦"],
    directionTitle: "画风参考",
    directionHelper: "上传品牌、材质、字体或竞品风格参考；Logo 字标和背景色由模式配置控制。",
    assets: ["旧 Logo/字标", "素材主体", "道具/装饰"],
  },
  icon: {
    label: "Icon",
    short: "Icon",
    description: "App Icon 与方形构图探索，默认无文字、单一强主体、64px 可读、无白边；圆角或直角都可接受。",
    cta: "生成 Icon 方案集",
    styles: ["3D 潮流粘土", "二次元幻彩", "欧美扁平矢量", "复古街机像素", "卡牌华丽魔框", "Q 版爆炸", "道具互动", "高饱和休闲"],
    directionTitle: "画风参考",
    directionHelper: "上传图标质感、渲染、材质或色彩参考；侧重点在项目区用标签控制。",
    assets: ["素材主体", "道具/奖励", "Logo 视觉参考", "构图参考", "画风参考"],
  },
};

export function renderConfigPanel(activeMode) {
  const batchStatus = getBatchSchemeGenerationStatus(activeMode);
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
  const assetSlots = normalizeAssetSlots(activeMode.id, getAssetSlotsForMode(activeMode.id, activeMode.assets));
  const form = getActiveGenerationFormValues();
  const projectBrief = form.projectBrief;
  const direction = getDirectionPayload(activeMode.id);
  const outputSizes = getOutputSizes(activeMode.id, activeMode.outputSizes);
  const briefDescription = projectBrief.gameDescription || project.description || copy.description;
  const liveGate = getLiveGateViewModel(activeMode);
  const generationCapabilityGate = getGenerationCapabilityGate(activeMode.id);
  const capabilityBlocked = !generationCapabilityGate.ok;
  const liveBlocked = state.apiMode === "http" && !liveGate.allowed;
  const generationDisabled = batchStatus.active || liveBlocked || capabilityBlocked;
  const generationTitle = capabilityBlocked
    ? providerCapabilityGateUserMessage(generationCapabilityGate)
    : liveBlocked
      ? "先确认真实生成保护，再调用外部模型服务"
      : "";

  return `
    <aside class="config-panel" aria-label="生产配置">
      <div class="brand-row">
        <span class="brand-mark">PL</span>
        <div>
          <strong>Poster Lab</strong>
          <small>模型、Key 与真实生成状态在顶部统一查看</small>
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
      <button class="manual-live-test" type="button" data-action="run-manual-live-test" title="手动真实生成验证">
        <span>手动验证</span>
        <small>MANUAL CHECK</small>
      </button>

      <div class="config-scroll">
        <section class="config-section">
          <div class="section-title">
            <span>01 项目</span>
            <button type="button" data-view="project-library">${state.view === "project-library" ? "收起" : "项目库"}</button>
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
            </button>
            <textarea aria-label="项目描述" data-form-field="projectBrief.gameDescription">${escapeHtml(briefDescription)}</textarea>
            ${renderModeBrief(activeMode, form)}
          </div>
          ${renderSloganSettings(form, activeMode.id)}
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
          ${renderAssetOperation()}
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
          ${renderModelRoutingSummary()}
        </section>
      </div>

      <div class="config-action">
        <button
          class="primary-button wide ${batchStatus.active ? "loading has-progress" : ""}"
          type="button"
          data-action="generate-schemes"
          title="${escapeAttribute(generationTitle)}"
          ${generationDisabled ? "disabled" : ""}
        >
          ${batchStatus.active ? `<span class="button-spinner" aria-hidden="true"></span><span>方案生成中</span><strong>${batchStatus.completed}/${batchStatus.total}</strong>` : copy.cta}
        </button>
        ${capabilityBlocked ? `<p class="config-action-note">${escapeHtml(providerCapabilityGateUserMessage(generationCapabilityGate))}</p>` : ""}
        ${liveBlocked ? `<p class="config-action-note">先在顶部确认真实生成保护，再调用外部模型服务。</p>` : ""}
        ${batchStatus.active ? `
          <div class="batch-progress" role="status" aria-live="polite">
            <div>
              <span>生成方案批次</span>
              <strong>${batchStatus.completed}/${batchStatus.total}</strong>
            </div>
            <i style="--progress: ${batchStatus.progress}%"></i>
          </div>
        ` : ""}
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
    label: normalizeAssetSlotLabel(slot, labels[index] || `Asset ${index + 1}`),
    state: slot.previewUrl ? "已就绪" : index < 2 ? "待上传" : "可选",
  }));
}

function normalizeAssetSlotLabel(slot, fallbackLabel) {
  const fallback = normalizeAssetLabel(fallbackLabel);
  if (fallback) return fallback;
  const label = normalizeAssetLabel(slot?.label || fallbackLabel);
  if (/背景|场景/i.test(label)) return "场景";
  if (/logo|标识/i.test(label)) return "LOGO";
  if (/角色|character/i.test(label)) return "角色";
  if (!slot?.sourceType) return normalizeAssetLabel(fallbackLabel);
  return label;
}

function normalizeAssetLabel(label) {
  return String(label || "").replace(/品牌\s*标识/g, "品牌 LOGO").replace(/游戏\s*标识/g, "游戏 LOGO").replace(/标识/g, "LOGO");
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

function renderModelRoutingSummary() {
  const providers = getProviderRows();
  const providerNameById = Object.fromEntries(providers.map((provider) => [provider.id, provider.name || provider.id]));
  const currentPlan = state.providerRoutePlans.find((plan) => plan.id === state.providerRoutePlan) || state.providerRoutePlans[0];
  const slotLabels = {
    concept: "方案",
    image: "图像",
    styleReference: "画风",
    compositionReference: "构图",
  };
  const effectiveRoutes = Object.fromEntries(Object.keys(slotLabels).map((slot) => [slot, resolveEffectiveRouteProvider(slot)]));
  const routeModels = Object.fromEntries(Object.keys(slotLabels).map((slot) => [
    slot,
    resolveEffectiveRouteModel(slot, effectiveRoutes[slot]),
  ]));
  const capabilityGate = evaluateProviderRouteCapabilityGate({
    mode: state.activeMode || "poster",
    routes: Object.fromEntries(Object.keys(slotLabels).map((slot) => [slot, {
      providerId: effectiveRoutes[slot],
      model: routeModels[slot],
    }])),
    requiredSlots: Object.keys(slotLabels),
  });
  const routeItems = Object.entries(slotLabels).map(([slot, label]) => {
    const providerId = effectiveRoutes[slot];
    const issue = capabilityGate.errors.find((item) => item.slot === slot);
    const warning = capabilityGate.warnings.find((item) => item.slot === slot);
    const tone = issue ? "bad" : warning ? "warn" : "ok";
    return `<span class="${tone}">${escapeHtml(label)} · ${escapeHtml(providerNameById[providerId] || providerId)}</span>`;
  }).join("");
  const agnesConfigured = Boolean((state.workspaceSnapshot || {}).providerConfigs?.agnes?.hasApiKey);
  const allAgnesCore = effectiveRoutes.concept === "agnes" && effectiveRoutes.image === "agnes";
  const planTone = !capabilityGate.ok ? "blocked" : allAgnesCore ? "agnes" : agnesConfigured ? "mixed" : "standard";
  const planNote = allAgnesCore
    ? "核心生成已走 Agnes"
    : agnesConfigured
      ? "当前不是全 Agnes 路由"
      : "按已配置供应商自动路由";
  const agnesKvQualityRisk = allAgnesCore && ["poster", "collab"].includes(state.activeMode || "poster");
  const capabilityNote = capabilityGate.ok
    ? capabilityGate.warnings.length > 0
      ? providerCapabilityGateUserMessage(capabilityGate)
      : agnesKvQualityRisk
        ? "核心能力可用；Agnes 多素材 KV/联名质量仍需人工验收"
        : "当前模型能力满足核心流程"
    : providerCapabilityGateUserMessage(capabilityGate);

  return `
    <div class="engine-card engine-card-compact model-plan-card ${escapeAttribute(planTone)}">
      <div>
        <strong>当前配置方案</strong>
        <small>${escapeHtml(currentPlan?.name || "标准方案")}</small>
      </div>
      <span>${escapeHtml(state.providerRoutePlan === "image-first" ? "图像优先" : "已选择")}</span>
      <div class="model-plan-routes">
        ${routeItems}
      </div>
      <small class="model-plan-note">${escapeHtml(planNote)}</small>
      <small class="model-capability-note">${escapeHtml(capabilityNote)}</small>
    </div>
  `;
}

function resolveEffectiveRouteProvider(slot) {
  const route = state.providerSlotRoutes?.[slot] || {};
  const snapshot = state.workspaceSnapshot || {};
  const candidateIds = {
    concept: ["google", "agnes", "deepseek", "openai", "aigocode", "claude", "qwen"],
    image: ["agnes", "openai", "aigocode", "google", "qwen"],
    styleReference: ["openai", "aigocode", "google", "claude", "qwen"],
    compositionReference: ["openai", "aigocode", "google", "claude", "qwen"],
  }[slot] || [state.provider || "openai"];
  const configured = (providerId) => {
    const config = snapshot.providerConfigs?.[providerId];
    return Boolean(config?.hasApiKey || config?.status === "success");
  };
  const savedProvider = candidateIds.includes(route.providerId) ? route.providerId : "";
  if (savedProvider && configured(savedProvider)) return savedProvider;
  if (
    ["styleReference", "compositionReference"].includes(slot)
    && state.provider
    && !candidateIds.includes(state.provider)
    && configured(state.provider)
    && !candidateIds.some((providerId) => configured(providerId))
  ) {
    return state.provider;
  }
  return candidateIds.find((providerId) => configured(providerId))
    || (candidateIds.includes(state.provider) ? state.provider : "")
    || savedProvider
    || candidateIds[0]
    || "openai";
}

function resolveEffectiveRouteModel(slot, providerId) {
  const route = state.providerSlotRoutes?.[slot] || {};
  const providerConfig = (state.workspaceSnapshot || {}).providerConfigs?.[providerId] || {};
  return route.model || providerConfig.modelSlots?.[slot] || providerConfig.defaultModel || "";
}

function getGenerationCapabilityGate(modeId) {
  const conceptProviderId = resolveEffectiveRouteProvider("concept");
  const imageProviderId = resolveEffectiveRouteProvider("image");
  return evaluateQueuePlanCapabilityGate({
    mode: modeId || "poster",
    providerId: conceptProviderId,
    providerRoutes: {
      concept: {
        providerId: conceptProviderId,
        model: resolveEffectiveRouteModel("concept", conceptProviderId),
      },
      image: {
        providerId: imageProviderId,
        model: resolveEffectiveRouteModel("image", imageProviderId),
      },
    },
    regenerateSchemes: true,
    includeImageGeneration: true,
  });
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
          <strong>Logo 字标</strong>
          <span>品牌</span>
        </div>
        <input value="${escapeAttribute(modeForm.wordmark || "")}" aria-label="Logo 字标" data-form-field="modeForm.wordmark" />
        <div class="mode-field-grid solid-bg-grid">
          ${[
            ["#ffffff", "白底"],
            ["#111827", "黑底"],
            ["#16a34a", "绿幕"],
            ["#0f172a", "深蓝"],
          ].map(([value, label]) => `<button class="${modeForm.backgroundColor === value ? "active" : ""}" type="button" data-form-choice="modeForm.backgroundColor" data-choice-value="${value}">${label}</button>`).join("")}
        </div>
        <div class="guardrail-chips">
          <span>字标主体</span>
          <span>纯色背景</span>
          <span>可抠图</span>
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
          <span>单一强主体</span>
          <span>64px 可读</span>
          <span>无白边</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="guidance-box ${projectBrief.focusGuidance ? "" : "is-compact"}">
      <div>
        <strong>侧重点引导</strong>
        <button type="button">开启</button>
      </div>
      ${projectBrief.focusGuidance
        ? `<input value="${escapeAttribute(projectBrief.focusGuidance || "")}" aria-label="侧重点引导" data-form-field="projectBrief.focusGuidance" />`
        : "<small>未启用</small>"}
    </div>
  `;
}

function renderSloganSettings(form, modeId) {
  const settings = form.sloganSettings || {};
  const mode = settings.mode || "auto";
  const globalSlogan = settings.globalSlogan || "";
  const languages = Array.isArray(settings.languages) && settings.languages.length > 0 ? settings.languages : ["en-US"];
  if (modeId === "icon") {
    return renderLockedTextStrategy({
      title: "文字策略",
      label: "图标模式",
      detail: "图标模式固定无文字。上传的角色、道具或 LOGO 只作为视觉身份参考，不会把宣传词写入图标。",
      chips: ["无宣传词", "无字标", "64px 可读"],
    });
  }
  if (modeId === "logo") {
    return renderLockedTextStrategy({
      title: "文字策略",
      label: "标识模式",
      detail: "标识模式只使用下方字标字段和上传 LOGO 参考，不使用海报宣传词，避免生成额外口号或乱码。",
      chips: ["字标优先", "不生成口号", "纯色背景"],
    });
  }
  const options = [
    ["auto", "自动"],
    ["global", "全局"],
    ["off", "关闭"],
  ];
  const languageOptions = [
    ["en-US", "英文"],
    ["zh-CN", "中文"],
    ["ja-JP", "日文"],
    ["ko-KR", "韩文"],
  ];

  return `
    <div class="slogan-settings-card">
      <div class="slogan-settings-head">
        <strong>宣传词</strong>
        <div class="segmented-mini" role="group" aria-label="宣传词模式">
          ${options.map(([value, label]) => `
            <button
              class="${mode === value ? "active" : ""}"
              type="button"
              data-form-choice="sloganSettings.mode"
              data-choice-value="${value}"
            >${label}</button>
          `).join("")}
        </div>
      </div>
      ${mode === "global" ? `
        <label class="slogan-global-field">
          <span>全局宣传词</span>
          <input
            value="${escapeAttribute(globalSlogan)}"
            aria-label="全局宣传词"
            data-form-field="sloganSettings.globalSlogan"
            placeholder="例如：狩猎巨型食材，端上荒野盛宴"
          />
        </label>
      ` : `
        <small>${mode === "off" ? "生成提示词时不写入宣传词。" : "由模型根据当前方案生成宣传词。"}</small>
      `}
      <div class="language-chip-row" aria-label="海报语言">
        ${languageOptions.map(([value, label]) => `
          <button
            class="${languages.includes(value) ? "active" : ""}"
            type="button"
            data-form-choice="sloganSettings.languages"
            data-choice-value="${value}"
          >${label}</button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderLockedTextStrategy({ title, label, detail, chips }) {
  return `
    <div class="slogan-settings-card locked-text-strategy" data-slogan-locked="${escapeAttribute(label)}">
      <div class="slogan-settings-head">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(label)}</span>
      </div>
      <small>${escapeHtml(detail)}</small>
      <div class="guardrail-chips">
        ${chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("")}
      </div>
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
      ${direction.styles.map((chip) => `<button class="${activeTags.includes(chip) ? "active" : ""}" type="button" data-form-choice="modeForm.styleTags" data-choice-value="${escapeAttribute(chip)}" data-choice-multi="true">${escapeHtml(chip)}</button>`).join("")}
    </div>
    <div class="mode-lock-note">
      <strong>${direction.title}</strong>
      <small>${direction.helper}</small>
    </div>
  `;
}

function renderModeOutput(activeMode, form, outputSizes) {
  const outputSettings = normalizeRenderedOutputSettings(activeMode.id, form.outputSettings);
  const suitePresetIds = new Set(["tiktok", "metaAds", "tapTap", "googlePlay", "appStore"]);
  const suiteMode = outputSettings.platformPresets?.some((preset) => suitePresetIds.has(preset))
    || outputSettings.aspectRatios.length > 1;

  return `
    <div class="size-grid ${activeMode.id === "icon" ? "single-size" : ""}">
      ${outputSizes.map((item) => `<button class="${outputSettings.aspectRatios.includes(item) ? "active" : ""}" type="button" data-form-choice="outputSettings.aspectRatios" data-choice-value="${escapeAttribute(item)}" ${activeMode.id === "icon" ? "" : 'data-choice-multi="true"'}>${escapeHtml(item)}</button>`).join("")}
    </div>
    ${suiteMode ? `<div class="segmented">
      <button class="active" type="button">${activeMode.id === "icon" ? "锁定方形" : "统一方案"}</button>
      <button type="button">${activeMode.id === "icon" ? "不改尺寸" : "独立方案"}</button>
    </div>` : ""}
    <p class="output-note">${getOutputNote(activeMode.id, activeMode.sizeNote)}</p>
  `;
}

function normalizeRenderedOutputSettings(modeId, values = {}) {
  const aspectRatios = Array.isArray(values.aspectRatios) ? values.aspectRatios : [];
  const platformPresets = Array.isArray(values.platformPresets) ? values.platformPresets : [];
  const oldSuitePresetIds = new Set(["tiktok", "metaAds", "tapTap", "googlePlay", "appStore"]);
  const carriesOldSuitePreset = platformPresets.some((preset) => oldSuitePresetIds.has(preset));
  const carriesCustomSuiteState = platformPresets.includes("custom") && aspectRatios.length > 1 && !values.customSize;
  if (["poster", "collab", "announcement"].includes(modeId) && (carriesOldSuitePreset || carriesCustomSuiteState)) {
    return {
      ...values,
      platformPresets: ["custom"],
      aspectRatios: ["16:9"],
      customSize: null,
    };
  }
  return {
    ...values,
    platformPresets,
    aspectRatios: modeId === "icon" ? ["1:1"] : (aspectRatios.length > 0 ? aspectRatios : ["16:9"]),
  };
}
