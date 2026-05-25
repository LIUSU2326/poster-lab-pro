import { state } from '../state.js';
import { getModelSlots, getProviderRows } from '../data/workspace-adapters.js';

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

  return `
    <div class="settings-layer" role="dialog" aria-modal="true" aria-label="模型与 API Key">
      <div class="settings-backdrop" data-action="close-settings"></div>
      <section class="settings-sheet provider-config-sheet" style="--settings-sheet-width: ${state.settingsWidth}px;">
        <div class="settings-resize-edge" data-settings-resize aria-hidden="true"></div>
        <header>
          <h2>模型与 API Key</h2>
          <button type="button" data-action="close-settings">关闭</button>
        </header>

        <div class="settings-body">
          <aside class="provider-list">
            ${providers.map((provider) => {
              const rowCredential = selectedCredentialState(provider.id);
              return `
                <button class="${provider.id === selectedProvider.id ? "active" : ""}" type="button" data-provider="${provider.id}">
                  <strong>${escapeHtml(provider.name)} ${renderProviderStatus(provider, rowCredential)}</strong>
                  <small>${escapeHtml(provider.model)}</small>
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
                  <input
                    value="${escapeHtml(selectedProvider.model)}"
                    aria-label="默认模型"
                    data-provider-default-model="${escapeHtml(selectedProvider.id)}"
                  />
                </label>
              </div>
            </section>

            <section class="provider-state-card ${escapeHtml(connectionClass)} ${connectionBusy ? "testing" : ""}" aria-live="polite">
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
              <div class="model-slot-grid">
                ${modelSlots.map((slot) => `
                  <label class="model-slot">
                    <span>${escapeHtml(slot.name)}</span>
                    <small>${escapeHtml(slot.flow)}</small>
                    <select aria-label="${escapeHtml(slot.name)}模型">
                      ${slot.options.map((option) => `<option ${option === slot.value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
                    </select>
                  </label>
                `).join("")}
              </div>
            </section>

            <div class="capability-row provider-capabilities">
              ${selectedProvider.caps.map((cap) => `<span>${escapeHtml(cap)}</span>`).join("")}
            </div>

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
