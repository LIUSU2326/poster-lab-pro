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

function statusCopy(selectedProvider, credential) {
  const busy = credential && ["loading", "saving", "revoking"].includes(credential.status);
  const configured = credential ? credential.configured : selectedProvider.status !== "idle";

  if (busy) return "处理中";
  if (configured) return "已保存到凭证库";
  return "未保存";
}

function connectionCopy(connection) {
  if (!connection || connection.phase === "idle") return "尚未测试";
  if (connection.phase === "testing") return "测试中";
  if (connection.status === "ready") return "连接可用";
  if (connection.status === "auth_failed") return "认证失败";
  if (connection.status === "not_configured") return "未配置";
  if (connection.status === "degraded") return "需要检查";
  return "不可用";
}

function modelAvailabilityCopy(connection) {
  if (!connection || connection.defaultModelAvailable === null) return "未检查模型";
  if (connection.defaultModelAvailable) return "默认模型可用";
  return "默认模型未在返回列表中";
}

export function renderSettingsSheet() {
  const providers = getProviderRows();
  const modelSlots = getModelSlots();
  const selectedProvider = providers.find((provider) => provider.id === state.provider) || providers[0];
  const credential = selectedCredentialState(selectedProvider.id);
  const connection = selectedConnectionState(selectedProvider.id);
  const credentialBusy = Boolean(credential && ["loading", "saving", "revoking"].includes(credential.status));
  const connectionBusy = connection?.phase === "testing";
  const configured = credential ? credential.configured : selectedProvider.status !== "idle";
  const maskedKey = credential?.masked || selectedProvider.key || "";
  const updatedAt = credential?.updatedAt ? new Date(credential.updatedAt).toLocaleString() : "未记录";
  const checkedAt = connection?.checkedAt ? new Date(connection.checkedAt).toLocaleString() : "未测试";
  const connectionClass = connection?.status || "not_configured";
  const canTest = configured && !credentialBusy && !connectionBusy;

  return `
    <div class="settings-layer" role="dialog" aria-modal="true" aria-label="模型与 API Key">
      <div class="settings-backdrop" data-action="close-settings"></div>
      <section class="settings-sheet" style="--settings-sheet-width: ${state.settingsWidth}px;">
        <div class="settings-resize-edge" data-settings-resize aria-hidden="true"></div>
        <header>
          <div>
            <span>模型服务设置</span>
            <h2>模型与 API Key</h2>
            <p>API Key 会进入本地加密凭证库；项目快照只保存脱敏状态。连接测试只探测 provider 可用性，不触发真实生图。</p>
          </div>
          <button type="button" data-action="close-settings">关闭</button>
        </header>

        <div class="settings-body">
          <aside class="provider-list">
            ${providers.map((provider) => `
              <button class="${provider.id === selectedProvider.id ? "active" : ""}" type="button" data-provider="${provider.id}">
                <strong>${escapeHtml(provider.name)}</strong>
                <span class="provider-status ${provider.status}">${escapeHtml(provider.state)}</span>
              </button>
            `).join("")}
          </aside>

          <section class="provider-detail">
            <div class="provider-head">
              <div>
                <span class="provider-status ${selectedProvider.status}">${escapeHtml(selectedProvider.state)}</span>
                <h3>${escapeHtml(selectedProvider.name)}</h3>
              </div>
              <label class="switch">
                <input type="checkbox" ${selectedProvider.status !== "idle" ? "checked" : ""} disabled />
                <span></span>
              </label>
            </div>

            <label class="field">
              <span>API Key</span>
              <input
                type="password"
                value=""
                placeholder="${escapeHtml(maskedKey || "sk-...")}"
                aria-label="API Key"
                data-provider-api-key="${escapeHtml(selectedProvider.id)}"
                autocomplete="off"
              />
              <small>输入新 Key 后点击保存。界面不会回填明文，只显示脱敏凭证状态。</small>
            </label>

            <div class="credential-status ${credential?.status || selectedProvider.status}" aria-live="polite">
              <div>
                <strong>${statusCopy(selectedProvider, credential)}</strong>
                <span>${configured ? escapeHtml(maskedKey) : "当前模型服务没有可解析凭证"}</span>
              </div>
              <small>更新：<span class="mono">${escapeHtml(updatedAt)}</span></small>
              ${credential?.error ? `<p>${escapeHtml(credential.error)}</p>` : ""}
            </div>

            <div class="connection-test-status ${connectionClass} ${connectionBusy ? "testing" : ""}" aria-live="polite">
              <div>
                <strong>${connectionCopy(connection)}</strong>
                <span>${escapeHtml(connection?.message || "保存 API Key 后可测试 provider 连接状态。")}</span>
              </div>
              <small>
                检查：<span class="mono">${escapeHtml(checkedAt)}</span>
                ${connection?.elapsedMs ? ` · <span class="mono">${connection.elapsedMs}ms</span>` : ""}
              </small>
              <small>
                ${modelAvailabilityCopy(connection)}
                ${connection?.modelCount !== null && typeof connection?.modelCount === "number" ? ` · <span class="mono">${connection.modelCount}</span> 个模型` : ""}
              </small>
              ${connection?.sampledModels?.length ? `
                <div class="connection-models">
                  ${connection.sampledModels.map((model) => `<span class="mono">${escapeHtml(model)}</span>`).join("")}
                </div>
              ` : ""}
              ${connection?.error ? `<p>${escapeHtml(connection.error)}</p>` : ""}
            </div>

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

            <section class="model-routing">
              <div class="section-title">
                <span>任务模型路由</span>
                <button type="button">继承项目默认</button>
              </div>
              <p>按任务场景指定模型。后续 provider adapter 会读取这些 slot，不把业务绑定到单一模型。</p>
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

            <div class="capability-row">
              ${selectedProvider.caps.map((cap) => `<span>${escapeHtml(cap)}</span>`).join("")}
            </div>

            <div class="connection-note ${selectedProvider.status}">
              <strong>配置说明</strong>
              <p>${escapeHtml(selectedProvider.note)}</p>
            </div>

            <div class="settings-actions">
              <button class="solid-button ${credentialBusy ? "loading" : ""}" type="button" data-action="save-provider-key" data-provider-id="${escapeHtml(selectedProvider.id)}" ${credentialBusy ? "disabled" : ""}>保存 API Key</button>
              <button class="${connectionBusy ? "loading" : ""}" type="button" data-action="test-provider-connection" data-provider-id="${escapeHtml(selectedProvider.id)}" ${canTest ? "" : "disabled"}>测试连接</button>
              <button type="button" data-action="refresh-provider-key" data-provider-id="${escapeHtml(selectedProvider.id)}" ${credentialBusy ? "disabled" : ""}>刷新状态</button>
              <button type="button" data-action="revoke-provider-key" data-provider-id="${escapeHtml(selectedProvider.id)}" ${credentialBusy || !configured ? "disabled" : ""}>撤销</button>
            </div>
          </section>
        </div>
      </section>
    </div>
  `;
}
