import { state } from '../state.js';
import { getModelSlots, getProviderRows } from '../data/workspace-adapters.js';

const providerModelCatalog = {
  openai: {
    default: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1", "gpt-5", "gpt-image-2", "gpt-image-1.5", "gpt-image-1"],
    plan: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1", "gpt-5"],
    image: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "chatgpt-image-latest"],
    vision: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1"],
  },
  aigocode: {
    default: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1", "gpt-image-2", "gpt-image-1.5"],
    plan: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1"],
    image: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "dall-e-3"],
    vision: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1"],
  },
  google: {
    default: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
    plan: ["gemini-2.5-flash", "gemini-2.5-pro"],
    image: ["gemini-3-pro-image-preview", "gemini-2.5-flash-image", "imagen-4.0-generate-001", "imagen-4.0-ultra-generate-001"],
    vision: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-pro-image-preview"],
  },
  deepseek: {
    default: ["deepseek-v4-flash", "deepseek-v4-pro"],
    plan: ["deepseek-v4-flash", "deepseek-v4-pro"],
    image: [],
    vision: [],
  },
  claude: {
    default: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-haiku-4-5-20251001", "claude-opus-4-6"],
    plan: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-haiku-4-5-20251001", "claude-opus-4-6"],
    image: [],
    vision: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-haiku-4-5-20251001"],
  },
  qwen: {
    default: ["qwen3.7-max", "qwen3.6-max-preview", "qwen3.6-plus", "qwen3.6-flash", "qwen-image-2.0-pro", "wan2.7-image-pro"],
    plan: ["qwen3.7-max", "qwen3.6-max-preview", "qwen3.6-plus", "qwen3.6-flash"],
    image: ["wan2.7-image-pro", "wan2.7-image", "qwen-image-2.0-pro", "qwen-image-2.0", "z-image-turbo"],
    vision: ["qwen3.6-plus", "qwen3.5-flash", "qwen3.5-plus"],
  },
};

function selectedCredentialState(providerId) {
  return state.providerCredential.providerId === providerId ? state.providerCredential : null;
}

function selectedConnectionState(providerId) {
  return state.providerConnection.providerId === providerId ? state.providerConnection : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getProviderPlanKey(providerId) {
  return `${providerId}:${state.providerRoutePlan || "standard"}`;
}

function getProviderOverrides(providerId) {
  return {
    ...(state.providerModelOverrides?.[providerId] || {}),
    ...(state.providerModelOverrides?.[getProviderPlanKey(providerId)] || {}),
  };
}

function uniqueOptions(options) {
  return Array.from(new Set(options.filter(Boolean)));
}

function getProviderDefaultModel(provider) {
  return getProviderOverrides(provider.id).defaultModel || provider.model;
}

function getProviderCustomModels(providerId) {
  return Array.isArray(state.providerCustomModels?.[providerId])
    ? state.providerCustomModels[providerId]
    : [];
}

function getSlotKind(slot) {
  const text = `${slot.name} ${slot.flow}`.toLowerCase();
  if (text.includes("image") || text.includes("图像") || text.includes("圖片") || text.includes("鍥惧儚")) return "image";
  if (text.includes("vision") || text.includes("参考") || text.includes("參考") || text.includes("鍙傝")) return "vision";
  return "plan";
}

function getModelOptions(providerId, kind) {
  const catalog = providerModelCatalog[providerId] || providerModelCatalog.openai;
  const kindOptions = Array.isArray(catalog[kind]) ? catalog[kind] : catalog.default;
  return uniqueOptions([
    ...getProviderCustomModels(providerId),
    ...(kindOptions || []),
  ]);
}

function getModelSelection(providerId, kind, currentValue) {
  const options = getModelOptions(providerId, kind);
  const value = options.includes(currentValue) ? currentValue : options[0] || "";
  return {
    value,
    options,
    unsupported: options.length === 0,
  };
}

function getSlotRoute(slotKey, selectedProvider, providers, kind, fallbackModel) {
  const savedRoute = state.providerSlotRoutes?.[slotKey] || {};
  const savedProvider = providers.find((candidate) => candidate.id === savedRoute.providerId);
  const supportsKind = (provider) => provider && getModelOptions(provider.id, kind).length > 0;
  const configuredProvider = providers.find((candidate) => candidate.status !== "idle" && supportsKind(candidate));
  const firstSupportedProvider = providers.find((candidate) => supportsKind(candidate));
  const provider = savedProvider
    || (supportsKind(selectedProvider) ? selectedProvider : null)
    || configuredProvider
    || firstSupportedProvider
    || selectedProvider
    || providers[0];
  const selection = getModelSelection(provider.id, kind, savedRoute.model || fallbackModel);
  if (selection.value && (savedRoute.providerId !== provider.id || savedRoute.model !== selection.value)) {
    state.providerSlotRoutes = {
      ...(state.providerSlotRoutes || {}),
      [slotKey]: {
        providerId: provider.id,
        model: selection.value,
      },
    };
  }
  return {
    provider,
    model: selection.value,
    selection,
  };
}

function providerSourceLabel(provider) {
  const id = provider?.id || "";
  if (id === "openai") return "OpenAI 官方";
  if (id === "aigocode") return "AIGoCode 中转";
  if (id === "google") return "Google AI Studio";
  if (id === "deepseek") return "DeepSeek 官方";
  if (id === "claude") return "Claude 官方";
  if (id === "qwen") return "Qwen 官方";
  return provider?.name || "当前供应商";
}

function providerEndpointKind(provider) {
  const id = provider?.id || "";
  if (id === "openai") return "官方 API";
  if (id === "aigocode") return "OpenAI 兼容中转";
  if (id === "google") return "Gemini API";
  if (id === "deepseek") return "OpenAI 兼容 API";
  if (id === "claude") return "Anthropic API";
  if (id === "qwen") return "OpenAI 兼容 API";
  return "自定义 API";
}

function formatModelOptionLabel(provider, model) {
  return `${providerSourceLabel(provider)} · ${model}`;
}

function getRoutePlans() {
  const plans = Array.isArray(state.providerRoutePlans) && state.providerRoutePlans.length > 0
    ? state.providerRoutePlans
    : [{ id: "standard", name: "标准方案" }];
  if (!plans.some((plan) => plan.id === state.providerRoutePlan)) {
    state.providerRoutePlan = plans[0].id;
  }
  return plans;
}

function providerStateLabel(provider, credential) {
  const configured = Boolean(credential?.configured) || provider.status !== "idle";
  if (credential && ["loading", "saving", "revoking"].includes(credential.status)) return "处理中";
  if (configured) return "已配置";
  if (provider.status === "warning") return "待检查";
  if (provider.status === "error") return "异常";
  return "未启用";
}

function connectionCopy(connection) {
  if (!connection || connection.phase === "idle") return "尚未测试";
  if (connection.phase === "testing") return "测试中";
  if (connection.status === "ready") return "连接可用";
  if (connection.status === "auth_failed") return "认证失败";
  if (connection.status === "not_configured") return "未配置";
  if (connection.status === "degraded") return "需要检查";
  return "尚未测试";
}

function connectionDetail(connection, provider) {
  if (!connection || connection.phase === "idle") return "保存 API Key 后可测试模型供应商连接。";
  if (connection.message) return connection.message;
  if (connection.status === "ready") return `${providerSourceLabel(provider)} 可用，模型列表可正常读取。`;
  return "连接测试完成，请检查返回状态。";
}

function modelAvailability(connection, provider) {
  if (!connection || connection.phase === "idle") return "";
  if (typeof connection.modelCount === "number") return `${providerSourceLabel(provider)} 返回 ${connection.modelCount} 个模型`;
  return "";
}

function renderRoutePlanTestStatus() {
  const test = state.providerRoutePlanTest || {};
  const currentPlan = test.planId === state.providerRoutePlan ? test : null;
  const results = Array.isArray(currentPlan?.results) ? currentPlan.results : [];
  if (!currentPlan || currentPlan.phase === "idle") {
    return `<p class="route-plan-test-hint">测试会逐项检查当前方案里的方案生成、图像生成、画风参考分析和构图参考分析模型。</p>`;
  }

  return `
    <div class="route-plan-test-status ${escapeHtml(currentPlan.phase)}" aria-live="polite">
      ${results.map((result) => `
        <div class="${result.ok ? "ok" : result.status === "testing" || result.status === "pending" ? "pending" : "failed"}">
          <strong>${escapeHtml(result.label || result.slot)}</strong>
          <span>${escapeHtml(result.providerId)} · ${escapeHtml(result.model)}</span>
          <small>${escapeHtml(result.ok ? "通过" : result.message || "未通过")}</small>
        </div>
      `).join("")}
      ${currentPlan.error ? `<p>${escapeHtml(currentPlan.error)}</p>` : ""}
    </div>
  `;
}

function credentialFeedback(credential, configured) {
  if (credential?.status === "saving") {
    return {
      tone: "testing",
      title: "正在保存 API Key",
      detail: "保存完成后会自动解锁连接测试。",
    };
  }
  if (credential?.status === "loading") {
    return {
      tone: "testing",
      title: "正在读取保存状态",
      detail: "正在检查这个供应商是否已经保存过 Key。",
    };
  }
  if (credential?.status === "revoking") {
    return {
      tone: "testing",
      title: "正在删除 API Key",
      detail: "删除后这个供应商会回到未启用状态。",
    };
  }
  if (credential?.status === "error") {
    return {
      tone: "error",
      title: "保存失败",
      detail: credential.error || "请检查本地 API 服务是否可用，然后重新保存。",
    };
  }
  if (configured) {
    return {
      tone: "success",
      title: "API Key 已保存",
      detail: "现在可以测试连接，或直接在生成任务里使用这个供应商。",
    };
  }
  return {
    tone: "idle",
    title: "等待保存",
    detail: "填入 API Key 后点击保存，或直接点击测试连接自动保存并测试。",
  };
}

function renderProviderStatus(provider, credential) {
  const label = providerStateLabel(provider, credential);
  const status = credential?.configured || provider.status !== "idle" ? "success" : provider.status;
  return `<span class="provider-status ${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

export function renderSettingsSheet() {
  const providers = getProviderRows();
  const modelSlots = getModelSlots();
  const selectedProvider = providers.find((provider) => provider.id === state.provider) || providers[0];
  const credential = selectedCredentialState(selectedProvider.id);
  const connection = selectedConnectionState(selectedProvider.id);
  const credentialBusy = Boolean(credential && ["loading", "saving", "revoking"].includes(credential.status));
  const connectionBusy = connection?.phase === "testing";
  const configured = Boolean(credential?.configured) || selectedProvider.status !== "idle";
  const maskedKey = credential?.masked || selectedProvider.key || "";
  const connectionClass = connection?.status || "not_configured";
  const canTest = !credentialBusy && !connectionBusy;
  const credentialInfo = credentialFeedback(credential, configured);
  const providerOverrides = getProviderOverrides(selectedProvider.id);
  const selectedDefaultModel = getProviderDefaultModel(selectedProvider);
  const defaultModelSelection = getModelSelection(selectedProvider.id, "default", selectedDefaultModel);
  const customModels = getProviderCustomModels(selectedProvider.id);
  const routePlans = getRoutePlans();
  const activeRoutePlan = routePlans.find((plan) => plan.id === state.providerRoutePlan) || routePlans[0];
  const providerSource = providerSourceLabel(selectedProvider);
  const providerEndpoint = providerEndpointKind(selectedProvider);
  const providerBaseUrl = selectedProvider.url || "Base URL 未设置";
  const connectionModelsCopy = modelAvailability(connection, selectedProvider);

  return `
    <div class="settings-layer" role="dialog" aria-modal="true" aria-label="模型与 API Key">
      <div class="settings-backdrop" data-action="close-settings"></div>
      <section class="settings-sheet provider-config-sheet" style="--settings-sheet-width: ${state.settingsWidth}px; --settings-sheet-height: ${state.settingsHeight}px;">
        <div class="settings-resize-edge" data-settings-resize aria-hidden="true"></div>
        <div class="settings-resize-corner" data-settings-resize-corner aria-hidden="true"></div>
        <header>
          <h2>模型与 API Key</h2>
          <button type="button" data-action="close-settings">关闭</button>
        </header>

        <div class="settings-body">
          <aside class="provider-list">
            ${providers.map((provider) => {
              const rowCredential = selectedCredentialState(provider.id);
              const providerModel = getModelSelection(provider.id, "default", getProviderDefaultModel(provider)).value || getProviderDefaultModel(provider);
              return `
                <button class="${provider.id === selectedProvider.id ? "active" : ""}" type="button" data-provider="${provider.id}">
                  <strong>${escapeHtml(provider.name)} ${renderProviderStatus(provider, rowCredential)}</strong>
                  <small>${escapeHtml(providerSourceLabel(provider))} · ${escapeHtml(providerModel)}</small>
                </button>
              `;
            }).join("")}
          </aside>

          <section class="provider-detail provider-config-detail">
            <div class="provider-config-head">
              <div>
                <span>当前供应商</span>
                <h3>${escapeHtml(selectedProvider.name)} ${renderProviderStatus(selectedProvider, credential)}</h3>
                <div class="provider-source-summary" aria-label="当前模型执行通道">
                  <b>${escapeHtml(providerSource)}</b>
                  <strong>${escapeHtml(providerEndpoint)}</strong>
                  <small title="${escapeHtml(providerBaseUrl)}">${escapeHtml(providerBaseUrl)}</small>
                </div>
              </div>
            </div>

            <section class="provider-config-card provider-credential-card">
              <div class="provider-card-title">
                <strong>API Key</strong>
              </div>
              <div class="provider-key-field">
                <input
                  type="password"
                  value=""
                  placeholder="${escapeHtml(maskedKey || "sk-...")}"
                  aria-label="API Key"
                  data-provider-api-key="${escapeHtml(selectedProvider.id)}"
                  autocomplete="off"
                />
                <button
                  class="key-reveal-button"
                  type="button"
                  data-key-reveal="${escapeHtml(selectedProvider.id)}"
                  aria-label="按住显示 API Key"
                  title="按住显示 API Key"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path>
                    <circle cx="12" cy="12" r="2.8"></circle>
                  </svg>
                </button>
              </div>
              <div class="provider-credential-feedback credential-status ${escapeHtml(credentialInfo.tone)}" aria-live="polite">
                <div>
                  <strong>${escapeHtml(credentialInfo.title)}</strong>
                  <small>本地加密凭证库 · ${escapeHtml(credentialInfo.detail)}</small>
                </div>
                <div class="provider-credential-actions">
                  <button
                    type="button"
                    data-action="refresh-provider-key"
                    data-provider-id="${escapeHtml(selectedProvider.id)}"
                    ${credentialBusy ? "disabled" : ""}
                  >刷新状态</button>
                  <button
                    class="danger-text-button credential-delete-button"
                    type="button"
                    data-action="revoke-provider-key"
                    data-provider-id="${escapeHtml(selectedProvider.id)}"
                    ${credentialBusy || !configured ? "disabled" : ""}
                  >${credential?.status === "revoking" ? "删除中..." : "删除已保存 Key"}</button>
                </div>
              </div>
            </section>

            <section class="provider-config-card">
              <div class="provider-card-title">
                <strong>供应商路由</strong>
                <small>模型 ID 会通过当前供应商执行</small>
              </div>
              <div class="provider-field-grid">
                <label class="field">
                  <span>Base URL</span>
                  <input
                    value="${escapeHtml(selectedProvider.url)}"
                    aria-label="Base URL"
                    data-provider-base-url="${escapeHtml(selectedProvider.id)}"
                  />
                </label>

                <label class="field">
                  <span class="field-label-row">默认模型 <b>${escapeHtml(providerSource)}</b></span>
                  <select
                    aria-label="默认模型"
                    data-provider-default-model="${escapeHtml(selectedProvider.id)}"
                    ${defaultModelSelection.unsupported ? "disabled" : ""}
                  >
                    ${defaultModelSelection.unsupported
                      ? `<option value="">当前供应商暂无可用模型</option>`
                      : defaultModelSelection.options
                        .map((option) => `<option value="${escapeHtml(option)}" ${option === defaultModelSelection.value ? "selected" : ""}>${escapeHtml(formatModelOptionLabel(selectedProvider, option))}</option>`)
                        .join("")}
                  </select>
                </label>
              </div>
              <div class="custom-model-manager">
                <label class="custom-model-input">
                  <span>自定义模型</span>
                  <div>
                    <input
                      value=""
                      placeholder="模型 ID"
                      aria-label="自定义模型 ID"
                      data-provider-custom-model-input="${escapeHtml(selectedProvider.id)}"
                    />
                    <button type="button" data-action="add-provider-custom-model" data-provider-id="${escapeHtml(selectedProvider.id)}">添加</button>
                  </div>
                </label>
                ${customModels.length > 0 ? `
                  <div class="custom-model-list" aria-label="已添加的自定义模型">
                    ${customModels.map((model) => `
                      <button type="button" data-action="delete-provider-custom-model" data-provider-id="${escapeHtml(selectedProvider.id)}" data-provider-model-id="${escapeHtml(model)}">
                        <span>${escapeHtml(model)}</span>
                        <b aria-hidden="true">×</b>
                      </button>
                    `).join("")}
                  </div>
                ` : ""}
              </div>
            </section>

            <section class="provider-state-card connection-test-status ${escapeHtml(connectionClass)} ${connectionBusy ? "testing" : ""}" aria-live="polite">
              <div>
                <strong>${escapeHtml(connectionCopy(connection))}</strong>
                <small>${escapeHtml(connectionDetail(connection, selectedProvider))}</small>
              </div>
              ${connectionModelsCopy ? `<span>${escapeHtml(connectionModelsCopy)}</span>` : ""}
              ${connection?.sampledModels?.length ? `
                <div class="connection-models">
                  ${connection.sampledModels.slice(0, 5).map((model) => `<span class="mono">${escapeHtml(model)}</span>`).join("")}
                </div>
              ` : ""}
              ${connection?.error ? `<p>${escapeHtml(connection.error)}</p>` : ""}
            </section>

            <section class="provider-config-card model-routing">
              <div class="provider-card-title">
                <strong>配置方案</strong>
                <small>${escapeHtml(providerSource)} · ${escapeHtml(providerEndpoint)}</small>
              </div>
              <p class="provider-route-note">每个任务槽都可以单独选择供应商和模型，方案生成和图像生成不再绑定到同一个 API。</p>
              <div class="route-plan-manager" aria-label="配置方案管理">
                <div class="route-plan-topline">
                  <div class="route-plan-tabs">
                    ${routePlans.map((plan) => `
                      <button class="${plan.id === state.providerRoutePlan ? "active" : ""}" type="button" data-provider-route-plan="${escapeHtml(plan.id)}">
                        ${escapeHtml(plan.name)}
                      </button>
                    `).join("")}
                  </div>
                  <div class="route-plan-actions">
                    <button class="route-plan-test-button ${state.providerRoutePlanTest?.phase === "testing" ? "loading" : ""}" type="button" data-action="test-provider-route-plan" ${state.providerRoutePlanTest?.phase === "testing" ? "disabled" : ""}>
                      ${state.providerRoutePlanTest?.phase === "testing" ? "测试中..." : "测试当前方案"}
                    </button>
                    <button class="route-plan-icon-button" type="button" data-action="add-provider-route-plan" aria-label="新增配置方案" title="新增配置方案">
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M12 5v14M5 12h14"></path>
                      </svg>
                    </button>
                    <button class="route-plan-icon-button danger" type="button" data-action="delete-provider-route-plan" aria-label="删除当前方案" title="删除当前方案" ${routePlans.length <= 1 ? "disabled" : ""}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"></path>
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="route-plan-name route-plan-rename">
                  <span>方案名称</span>
                  <input value="${escapeHtml(activeRoutePlan?.name || "")}" data-provider-route-name-draft="${escapeHtml(activeRoutePlan?.id || "")}" aria-label="编辑配置方案名称" />
                  <button type="button" data-action="rename-provider-route-plan" data-provider-route-name-target="${escapeHtml(activeRoutePlan?.id || "")}">保存</button>
                </div>
                ${renderRoutePlanTestStatus()}
              </div>
              <div class="model-slot-grid">
                ${modelSlots.map((slot) => {
                  const slotKey = slot.id || slot.name;
                  const currentValue = providerOverrides[slotKey] || providerOverrides[slot.name] || slot.value;
                  const slotKind = getSlotKind(slot);
                  const slotRoute = getSlotRoute(slotKey, selectedProvider, providers, slotKind, currentValue);
                  const routeProvider = slotRoute.provider;
                  const selection = slotRoute.selection;
                  return `
                  <label class="model-slot">
                    <div class="model-slot-head">
                      <span>${escapeHtml(slot.name)}</span>
                      <b>${escapeHtml(providerSourceLabel(routeProvider))}</b>
                    </div>
                    <small>${escapeHtml(slot.flow)}</small>
                    <select class="slot-provider-select" aria-label="${escapeHtml(slot.name)}供应商" data-provider-slot-provider="${escapeHtml(slotKey)}">
                      ${providers.map((provider) => `<option value="${escapeHtml(provider.id)}" ${provider.id === routeProvider.id ? "selected" : ""}>${escapeHtml(providerSourceLabel(provider))}</option>`).join("")}
                    </select>
                    <select aria-label="${escapeHtml(slot.name)}模型" data-provider-model-slot="${escapeHtml(slotKey)}" data-provider-id="${escapeHtml(routeProvider.id)}" ${selection.unsupported ? "disabled" : ""}>
                      ${selection.unsupported
                        ? `<option value="">当前供应商不支持此任务</option>`
                        : selection.options.map((option) => `<option value="${escapeHtml(option)}" ${option === selection.value ? "selected" : ""}>${escapeHtml(formatModelOptionLabel(routeProvider, option))}</option>`).join("")}
                    </select>
                  </label>
                `;
                }).join("")}
              </div>
            </section>

            <div class="settings-actions provider-config-actions">
              <button class="solid-button ${credentialBusy ? "loading" : ""}" type="button" data-action="save-provider-key" data-provider-id="${escapeHtml(selectedProvider.id)}" ${credentialBusy ? "disabled" : ""}>${credential?.status === "saving" ? "保存中..." : "保存 API Key"}</button>
              <button class="${connectionBusy ? "loading" : ""}" type="button" data-action="test-provider-connection" data-provider-id="${escapeHtml(selectedProvider.id)}" ${canTest ? "" : "disabled"}>${connectionBusy ? "测试中..." : configured ? "测试连接" : "保存并测试"}</button>
            </div>
          </section>
        </div>
      </section>
    </div>
  `;
}
