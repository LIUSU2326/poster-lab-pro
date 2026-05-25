import { state } from '../state.js';
import { getModelSlots, getProviderRows } from '../data/workspace-adapters.js';

const providerModelCatalog = {
  openai: {
    default: ["gpt-5.2", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-image-2", "gpt-image-1.5", "gpt-image-1"],
    plan: ["gpt-5.2", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-4.1", "gpt-4.1-mini"],
    image: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "chatgpt-image-latest"],
    vision: ["gpt-5.2", "gpt-5.1", "gpt-5", "gpt-4.1"],
  },
  aigocode: {
    default: ["gpt-5.2", "gpt-5.1", "gpt-5-mini", "gpt-4.1-mini", "gpt-4.1", "gpt-image-2"],
    plan: ["gpt-5.2", "gpt-5.1", "gpt-5-mini", "gpt-4.1-mini", "gpt-4.1"],
    image: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "dall-e-3"],
    vision: ["gpt-5.2", "gpt-5.1", "gpt-5-mini", "gpt-4.1-mini", "gpt-4.1"],
  },
  google: {
    default: ["gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-3-pro-image-preview", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-image"],
    plan: ["gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-2.5-pro", "gemini-2.5-flash"],
    image: ["gemini-3-pro-image-preview", "gemini-2.5-flash-image", "imagen-4.0-generate-001", "imagen-4.0-ultra-generate-001"],
    vision: ["gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-2.5-pro", "gemini-2.5-flash"],
  },
  deepseek: {
    default: ["deepseek-v4-flash", "deepseek-v4-pro"],
    plan: ["deepseek-v4-flash", "deepseek-v4-pro"],
    image: ["gpt-image-2", "gemini-3-pro-image-preview", "wan2.7-image-pro", "qwen-image-2.0-pro"],
    vision: ["gpt-5.2", "gemini-3-pro-preview", "qwen3.6-plus"],
  },
  claude: {
    default: ["claude-opus-4-1-20250805", "claude-sonnet-4-20250514", "claude-3-7-sonnet-20250219", "claude-3-5-haiku-20241022"],
    plan: ["claude-opus-4-1-20250805", "claude-sonnet-4-20250514", "claude-3-7-sonnet-20250219", "claude-3-5-haiku-20241022"],
    image: ["gpt-image-2", "gemini-3-pro-image-preview", "wan2.7-image-pro", "qwen-image-2.0-pro"],
    vision: ["claude-opus-4-1-20250805", "claude-sonnet-4-20250514", "claude-3-7-sonnet-20250219"],
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

function getSlotKind(slot) {
  const text = `${slot.name} ${slot.flow}`.toLowerCase();
  if (text.includes("image") || text.includes("图像") || text.includes("圖片") || text.includes("鍥惧儚")) return "image";
  if (text.includes("vision") || text.includes("参考") || text.includes("參考") || text.includes("鍙傝")) return "vision";
  return "plan";
}

function getModelOptions(providerId, kind, currentValue) {
  const catalog = providerModelCatalog[providerId] || providerModelCatalog.openai;
  return uniqueOptions([currentValue, ...(catalog[kind] || catalog.default), ...(catalog.default || [])]);
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

function connectionDetail(connection) {
  if (!connection || connection.phase === "idle") return "保存 API Key 后可测试模型供应商连接。";
  if (connection.message) return connection.message;
  if (connection.status === "ready") return "Provider 可用，模型列表可正常读取。";
  return "连接测试完成，请检查返回状态。";
}

function modelAvailability(connection) {
  if (!connection || connection.phase === "idle") return "";
  if (typeof connection.modelCount === "number") return `${connection.modelCount} 个模型`;
  return "";
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
  const canTest = configured && !credentialBusy && !connectionBusy;
  const providerOverrides = getProviderOverrides(selectedProvider.id);
  const selectedDefaultModel = getProviderDefaultModel(selectedProvider);
  const routePlans = getRoutePlans();
  const activeRoutePlan = routePlans.find((plan) => plan.id === state.providerRoutePlan) || routePlans[0];

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
              const providerModel = getProviderDefaultModel(provider);
              return `
                <button class="${provider.id === selectedProvider.id ? "active" : ""}" type="button" data-provider="${provider.id}">
                  <strong>${escapeHtml(provider.name)} ${renderProviderStatus(provider, rowCredential)}</strong>
                  <small>${escapeHtml(providerModel)}</small>
                </button>
              `;
            }).join("")}
          </aside>

          <section class="provider-detail provider-config-detail">
            <div class="provider-config-head">
              <div>
                <span>当前供应商</span>
                <h3>${escapeHtml(selectedProvider.name)} ${renderProviderStatus(selectedProvider, credential)}</h3>
              </div>
              <label class="switch">
                <input type="checkbox" ${configured ? "checked" : ""} disabled />
                <span></span>
              </label>
            </div>

            <section class="provider-config-card provider-credential-card">
              <div class="provider-card-title">
                <strong>API Key</strong>
                <small>按住眼睛临时显示输入内容</small>
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
            </section>

            <section class="provider-config-card">
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
                  <span>默认模型</span>
                  <select
                    aria-label="默认模型"
                    data-provider-default-model="${escapeHtml(selectedProvider.id)}"
                  >
                    ${getModelOptions(selectedProvider.id, "default", selectedDefaultModel)
                      .map((option) => `<option value="${escapeHtml(option)}" ${option === selectedDefaultModel ? "selected" : ""}>${escapeHtml(option)}</option>`)
                      .join("")}
                  </select>
                </label>
              </div>
            </section>

            <section class="provider-state-card connection-test-status ${escapeHtml(connectionClass)} ${connectionBusy ? "testing" : ""}" aria-live="polite">
              <div>
                <strong>${escapeHtml(connectionCopy(connection))}</strong>
                <small>${escapeHtml(connectionDetail(connection))}</small>
              </div>
              ${modelAvailability(connection) ? `<span>${escapeHtml(modelAvailability(connection))}</span>` : ""}
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
                <small>按任务选择不同模型</small>
              </div>
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
                <label class="route-plan-name">
                  <span>方案名称</span>
                  <input value="${escapeHtml(activeRoutePlan?.name || "")}" data-provider-route-name="${escapeHtml(activeRoutePlan?.id || "")}" aria-label="编辑配置方案名称" />
                </label>
              </div>
              <div class="model-slot-grid">
                ${modelSlots.map((slot) => {
                  const slotKey = slot.name;
                  const currentValue = providerOverrides[slotKey] || slot.value;
                  const slotKind = getSlotKind(slot);
                  const options = getModelOptions(selectedProvider.id, slotKind, currentValue);
                  return `
                  <label class="model-slot">
                    <span>${escapeHtml(slot.name)}</span>
                    <small>${escapeHtml(slot.flow)}</small>
                    <select aria-label="${escapeHtml(slot.name)}模型" data-provider-model-slot="${escapeHtml(slotKey)}" data-provider-id="${escapeHtml(selectedProvider.id)}">
                      ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === currentValue ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
                    </select>
                  </label>
                `;
                }).join("")}
              </div>
            </section>

            <div class="settings-actions provider-config-actions">
              <button class="solid-button ${credentialBusy ? "loading" : ""}" type="button" data-action="save-provider-key" data-provider-id="${escapeHtml(selectedProvider.id)}" ${credentialBusy ? "disabled" : ""}>保存 API Key</button>
              <button class="${connectionBusy ? "loading" : ""}" type="button" data-action="test-provider-connection" data-provider-id="${escapeHtml(selectedProvider.id)}" ${canTest ? "" : "disabled"}>测试连接</button>
              <button type="button" data-action="revoke-provider-key" data-provider-id="${escapeHtml(selectedProvider.id)}" ${credentialBusy ? "disabled" : ""}>撤销</button>
            </div>
          </section>
        </div>
      </section>
    </div>
  `;
}
