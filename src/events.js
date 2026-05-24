import { state, ensureSelectedResult, ensureSelectedScheme, queueResultOperation } from './state.js';
import { submitGenerationDraft } from './form-binding.js';
import { runManualLiveTestForWorkbench } from './manual-live-test-client.js';
import { runResultOperationForWorkbench } from './result-operation-client.js';
import { simulateWorkbenchAssetUpload } from './asset-library-client.js';
import { getArchiveRows } from './data/workspace-adapters.js';
import { setGenerationFormChoice, updateGenerationFormField } from './generation-form-runtime.js';
import {
  loadProviderCredentialStatusForWorkbench,
  revokeProviderCredentialForWorkbench,
  saveProviderCredentialForWorkbench,
  testProviderConnectionForWorkbench,
} from './provider-credential-client.js';
import { renderSettingsSheet } from './render/settings-sheet.js';

const LEFT_PANEL_MIN = 280;
const LEFT_PANEL_MAX = 520;
const LEFT_PANEL_COLLAPSE_AT = 236;

export function bindEvents(render) {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeMode = button.dataset.mode;
      state.view = "schemes";
      state.selectedScheme = "";
      state.resultViewerOpen = false;
      ensureSelectedScheme();
      render();
    });
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextView = button.dataset.view;
      state.view = nextView === "archive" ? "archive" : "schemes";
      render();
    });
  });

  document.querySelectorAll("[data-scheme-id]").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedScheme = card.dataset.schemeId;
      render();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.selectedScheme = card.dataset.schemeId;
        render();
      }
    });
  });

  document.querySelectorAll(".result-card[data-result-id]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target?.closest?.("a")) return;
      state.selectedResult = card.dataset.resultId;
      state.selectedResultUserSet = true;
      state.view = "schemes";
      state.resultViewerOpen = true;
      render();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.selectedResult = card.dataset.resultId;
        state.selectedResultUserSet = true;
        state.view = "schemes";
        state.resultViewerOpen = true;
        render();
      }
    });
  });

  document.querySelectorAll("[data-result-action]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const operation = queueResultOperation(button.dataset.resultAction, button.dataset.resultId || state.selectedResult);
      event.preventDefault();
      event.stopPropagation();
      render();
      if (operation) {
        await runResultOperationForWorkbench(operation);
        render();
      }
    });
  });

  bindActionControls(render);

  bindProviderControls(render);
  bindArchiveControls(render);

  bindLiveGateControls(render);
  bindGenerationFormControls(render);
  bindResizeDividers(render);
  bindSettingsResize();
}

function bindActionControls(render, root = document) {
  root.querySelectorAll("[data-action]").forEach((control) => {
    control.addEventListener("click", (event) => handleActionControl(control, event, render));
  });
}

async function handleActionControl(control, event, render) {
  const action = control.dataset.action;
  if (action === "toggle-theme") state.theme = state.theme === "light" ? "dark" : "light";
  if (action === "toggle-copy") state.copyVisible = !state.copyVisible;
  if (action === "export-archive-selection") exportArchiveSelection();
  if (action === "open-settings") {
    state.settingsOpen = true;
    render();
    await loadProviderCredentialStatusForWorkbench({ providerId: state.provider });
  }
  if (action === "close-settings") state.settingsOpen = false;
  if (action === "refresh-provider-key") {
    await loadProviderCredentialStatusForWorkbench({
      providerId: control.dataset.providerId || state.provider,
    });
  }
  if (action === "save-provider-key") {
    const providerId = control.dataset.providerId || state.provider;
    const input = document.querySelector(`[data-provider-api-key="${providerId}"]`);
    const apiKey = input?.value?.trim() || "";
    if (!apiKey) {
      state.providerCredential = {
        ...state.providerCredential,
        status: "error",
        providerId,
        error: "请输入 API Key 后再保存。",
      };
    } else {
      render();
      await saveProviderCredentialForWorkbench({ providerId, apiKey });
    }
  }
  if (action === "test-provider-connection") {
    render();
    await testProviderConnectionForWorkbench({
      providerId: control.dataset.providerId || state.provider,
    });
  }
  if (action === "revoke-provider-key") {
    render();
    await revokeProviderCredentialForWorkbench({
      providerId: control.dataset.providerId || state.provider,
    });
  }
  if (action === "submit-generation") {
    const submissionPromise = submitGenerationDraft();
    state.view = "schemes";
    state.taskOpen = true;
    render();
    await submissionPromise;
  }
  if (action === "run-manual-live-test") {
    const liveTestPromise = runManualLiveTestForWorkbench();
    state.taskOpen = true;
    render();
    await liveTestPromise;
    state.view = "schemes";
    state.selectedResultUserSet = false;
    ensureSelectedResult();
  }
  if (action === "simulate-asset-upload") {
    const assetPromise = simulateWorkbenchAssetUpload({
      role: control.dataset.assetRole,
      label: control.dataset.assetLabel,
    });
    render();
    await assetPromise;
  }
  if (action === "toggle-task") state.taskOpen = !state.taskOpen;
  if (action === "open-result-viewer") {
    if (control.dataset.resultId) {
      state.selectedResult = control.dataset.resultId;
      state.selectedResultUserSet = true;
    }
    state.resultViewerOpen = true;
  }
  if (action === "close-result-viewer") state.resultViewerOpen = false;
  if (action === "toggle-left-panel") {
    state.leftCollapsed = !state.leftCollapsed;
    if (!state.leftCollapsed) state.leftWidth = clamp(state.leftWidth || 320, LEFT_PANEL_MIN, LEFT_PANEL_MAX);
  }
  event.stopPropagation();
  render();
}

function bindProviderControls(render, root = document) {
  root.querySelectorAll("[data-provider]").forEach((button) => {
    button.addEventListener("click", () => handleProviderControl(button, render));
  });
}

async function handleProviderControl(button, render) {
  const providerId = button.dataset.provider;
  if (!providerId) return;

  state.provider = providerId;
  if (!state.settingsOpen) {
    render();
    return;
  }

  state.providerCredential = {
    status: "loading",
    providerId,
    masked: "",
    configured: false,
    updatedAt: null,
    error: null,
  };
  state.providerConnection = getIdleProviderConnection(providerId);
  refreshSettingsLayer(render);

  await loadProviderCredentialStatusForWorkbench({ providerId });
  if (state.provider === providerId && state.settingsOpen) {
    state.providerConnection = getIdleProviderConnection(providerId);
    refreshSettingsLayer(render);
  }
}

function getIdleProviderConnection(providerId) {
  return {
    ...state.providerConnection,
    phase: "idle",
    status: "not_configured",
    providerId,
    ok: false,
    error: null,
    message: "Not tested yet.",
  };
}

function refreshSettingsLayer(render) {
  const current = document.querySelector(".settings-layer");
  if (!current) {
    render();
    return;
  }

  const detailScrollTop = current.querySelector(".provider-detail")?.scrollTop || 0;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderSettingsSheet().trim();
  current.replaceWith(wrapper.firstElementChild);

  const nextLayer = document.querySelector(".settings-layer");
  const nextDetail = nextLayer?.querySelector(".provider-detail");
  if (nextDetail) nextDetail.scrollTop = detailScrollTop;

  if (nextLayer) {
    bindActionControls(render, nextLayer);
    bindProviderControls(render, nextLayer);
    bindSettingsResize(nextLayer);
  }
}

function bindArchiveControls(render) {
  document.querySelectorAll("[data-archive-select]").forEach((control) => {
    control.addEventListener("change", () => {
      const rowId = control.dataset.archiveSelect;
      const selected = new Set(state.archiveSelection || []);
      if (control.checked) selected.add(rowId);
      else selected.delete(rowId);
      state.archiveSelection = Array.from(selected);
      state.archiveExportMessage = "";
      render();
    });
  });

  document.querySelectorAll("[data-archive-bulk]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.archiveBulk;
      const rows = getArchiveRows();
      const now = new Date();
      if (mode === "all") {
        state.archiveSelection = rows.map((row) => row.id);
      }
      if (mode === "today") {
        state.archiveSelection = rows
          .filter((row) => isSameLocalDay(new Date(row.createdAt || ""), now))
          .map((row) => row.id);
      }
      if (mode === "last-hour") {
        state.archiveSelection = rows
          .filter((row) => isWithinLastHour(new Date(row.createdAt || ""), now))
          .map((row) => row.id);
      }
      if (mode === "clear") {
        state.archiveSelection = [];
      }
      state.archiveExportMessage = "";
      render();
    });
  });
}

function exportArchiveSelection() {
  const selectedIds = new Set(state.archiveSelection || []);
  const selectedRows = getArchiveRows().filter((row) => selectedIds.has(row.id) && row.downloadUrl);

  if (selectedRows.length === 0) {
    state.archiveExportMessage = "当前没有可导出的已选图片。";
    return;
  }

  selectedRows.forEach((row, index) => {
    window.setTimeout(() => {
      const link = document.createElement("a");
      link.href = row.downloadUrl;
      link.download = `${safeDownloadName(row.title || row.id)}.${getDownloadExtension(row.downloadUrl)}`;
      link.style.display = "none";
      document.body.append(link);
      link.click();
      link.remove();
    }, index * 120);
  });
  state.archiveExportMessage = `已开始导出 ${selectedRows.length} 张图片。`;
}

function isSameLocalDay(date, now) {
  if (!Number.isFinite(date.getTime())) return false;
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function isWithinLastHour(date, now) {
  if (!Number.isFinite(date.getTime())) return false;
  const delta = now.getTime() - date.getTime();
  return delta >= 0 && delta <= 60 * 60 * 1000;
}

function safeDownloadName(value) {
  return String(value || "archive-image")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function getDownloadExtension(url) {
  const cleanUrl = String(url || "").split("?")[0].toLowerCase();
  if (cleanUrl.endsWith(".jpg") || cleanUrl.endsWith(".jpeg")) return "jpg";
  if (cleanUrl.endsWith(".webp")) return "webp";
  if (cleanUrl.endsWith(".svg")) return "svg";
  return "png";
}

function bindLiveGateControls(render) {
  document.querySelectorAll("[data-live-toggle]").forEach((control) => {
    control.addEventListener("change", () => {
      setLiveGateValue(control.dataset.liveToggle, Boolean(control.checked));
      render();
    });
  });

  document.querySelectorAll("[data-live-cost-cap]").forEach((control) => {
    control.addEventListener("change", () => {
      const value = Number(control.value);
      state.liveGate.maxAcceptedCost = Number.isFinite(value) ? Math.max(0, value) : 0;
      render();
    });
  });
}

function setLiveGateValue(path, value) {
  if (!path) return;
  const parts = path.split(".");
  let cursor = state.liveGate;
  for (const part of parts.slice(0, -1)) {
    cursor[part] = cursor[part] || {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
}

function bindGenerationFormControls(render) {
  document.querySelectorAll("[data-form-field]").forEach((control) => {
    const field = control.dataset.formField;
    const commit = () => {
      const value = control.type === "checkbox" ? control.checked : control.value;
      updateGenerationFormField(field, value);
    };

    control.addEventListener("input", commit);
    control.addEventListener("change", () => {
      commit();
      render();
    });
  });

  document.querySelectorAll("[data-form-choice]").forEach((control) => {
    control.addEventListener("click", (event) => {
      setGenerationFormChoice(control.dataset.formChoice, control.dataset.choiceValue, {
        multi: control.dataset.choiceMulti === "true",
      });
      event.preventDefault();
      event.stopPropagation();
      render();
    });
  });
}

function bindResizeDividers(render) {
  document.querySelectorAll("[data-resize]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      const side = handle.dataset.resize;
      const shell = document.querySelector(".prototype-shell");
      if (!shell) return;

      const startX = event.clientX;
      const startValue = state.leftWidth;
      let didToggleCollapse = false;
      document.body.classList.add("is-resizing");

      const onPointerMove = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        if (side === "left") {
          const nextWidth = startValue + delta;
          if (nextWidth < LEFT_PANEL_COLLAPSE_AT) {
            if (!state.leftCollapsed) {
              state.leftCollapsed = true;
              didToggleCollapse = true;
              render();
            }
            return;
          }
          if (state.leftCollapsed) {
            state.leftCollapsed = false;
            didToggleCollapse = true;
            render();
          }
          state.leftWidth = clamp(nextWidth, LEFT_PANEL_MIN, LEFT_PANEL_MAX);
          document.querySelector(".prototype-shell")?.style.setProperty("--left-panel-width", `${state.leftWidth}px`);
        }
      };

      const onPointerUp = () => {
        document.body.classList.remove("is-resizing");
        window.removeEventListener("pointermove", onPointerMove);
        if (didToggleCollapse) render();
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
      event.preventDefault();
    });
  });
}

function bindSettingsResize(root = document) {
  root.querySelectorAll("[data-settings-resize]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      const sheet = document.querySelector(".settings-sheet");
      if (!sheet) return;

      const startX = event.clientX;
      const startWidth = state.settingsWidth || sheet.getBoundingClientRect().width;
      document.body.classList.add("is-resizing");

      const onPointerMove = (moveEvent) => {
        const delta = startX - moveEvent.clientX;
        state.settingsWidth = clamp(startWidth + delta, 760, Math.max(760, window.innerWidth - 32));
        sheet.style.setProperty("--settings-sheet-width", `${state.settingsWidth}px`);
      };

      const onPointerUp = () => {
        document.body.classList.remove("is-resizing");
        window.removeEventListener("pointermove", onPointerMove);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
      event.preventDefault();
    });
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
