import { getModelSlots, getProviderRows } from '../data/workspace-adapters.js';
import { state } from '../state.js';

function selectedCredentialState(providerId) {
  return state.providerCredential.providerId === providerId ? state.providerCredential : null;
}

function selectedConnectionState(providerId) {
  return state.providerConnection.providerId === providerId ? state.providerConnection : null;
}

function statusCopy(provider, credential) {
  const busy = credential && ["loading", "saving", "revoking"].includes(credential.status);
  const configured = credential ? credential.configured : provider.status !== "idle";

  if (busy) return "处理中";
  if (configured) return "凭证已保存";
  return "尚未保存";
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

export function renderProviderPanel() {
  const providers = getProviderRows();
  const modelSlots = getModelSlots();
  const selectedProvider = providers.find((provider) => provider.id === state.provider) || providers[0];
  const credential = selectedCredentialState(selectedProvider.id);
  const connection = selectedConnectionState(selectedProvider.id);
  const configured = credential ? credential.configured : selectedProvider.status !== "idle";
  const maskedKey = credential?.masked || selectedProvider.key || "sk-live ... 8R2Q";
  const connectionTone = connection?.status === "ready" ? "success" : configured ? "warning" : "neutral";
  const primarySlots = modelSlots.slice(0, 2);

  return `
    <aside class="provider-panel" aria-label="模型与 API Key 快速配置">
      <header>
        <span>MODEL &amp; API KEY</span>
        <h2>模型配置</h2>
        <p>右侧作为 API Key 示例面板，不恢复旧 rail。</p>
      </header>

      <div class="provider-pill-tabs" role="tablist" aria-label="Provider">
        ${providers.slice(0, 3).map((provider) => `
          <button class="${provider.id === selectedProvider.id ? "active" : ""}" type="button" data-provider="${escapeHtml(provider.id)}" role="tab" aria-selected="${provider.id === selectedProvider.id}">
            ${escapeHtml(provider.shortName || provider.name)}
          </button>
        `).join("")}
      </div>

      <section class="provider-panel-section">
        <span>CREDENTIAL</span>
        <button class="provider-key-field" type="button" data-action="open-settings" title="打开完整 API Key 设置">
          <strong>${escapeHtml(maskedKey)}</strong>
        </button>
      </section>

      <button class="provider-state-card ${connectionTone}" type="button" data-action="open-settings">
        <i></i>
        <div>
          <strong>${escapeHtml(connectionCopy(connection))}</strong>
          <small>${escapeHtml(statusCopy(selectedProvider, credential))}</small>
        </div>
      </button>

      <section class="provider-panel-section">
        <span>MODEL SLOTS</span>
        <div class="provider-slot-list">
          ${primarySlots.map((slot, index) => `
            <button class="provider-slot-card" type="button" data-action="open-settings">
              <i class="${index === 0 ? "lilac" : "coral"}"></i>
              <div>
                <strong>${escapeHtml(slot.name)}</strong>
                <small>${escapeHtml(slot.value)}</small>
              </div>
            </button>
          `).join("")}
        </div>
      </section>

      <div class="provider-panel-actions">
        <button type="button" data-action="test-provider-connection" data-provider-id="${escapeHtml(selectedProvider.id)}" ${configured ? "" : "disabled"}>测试</button>
        <button class="primary" type="button" data-action="open-settings">保存</button>
      </div>
    </aside>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
