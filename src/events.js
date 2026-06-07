import { state, ensureSelectedResult, ensureSelectedScheme, queueResultOperation, getRuntimeWorkspaceSnapshot } from './state.js';
import { cancelActiveGenerationDraft, submitGenerationDraft } from './form-binding.js';
import { runResultOperationForWorkbench } from './result-operation-client.js';
import { deleteResultForWorkbench } from './result-management-client.js';
import { simulateWorkbenchAssetUpload } from './asset-library-client.js';
import { clearGeneratedSchemesForWorkbench, deleteGeneratedSchemeForWorkbench, resetGeneratedSchemeForWorkbench } from './scheme-management-client.js';
import { clearWorkbenchForWorkbench } from './workbench-reset-client.js';
import { getArchiveRows } from './data/workspace-adapters.js';
import { modeSpecs } from './data/modes.js';
import { getActiveGenerationFormValues, setGenerationFormChoice, updateGenerationFormField } from './generation-form-runtime.js';
import {
  activateProviderCredentialForWorkbench,
  loadProviderCredentialStatusForWorkbench,
  revokeProviderCredentialForWorkbench,
  saveProviderCredentialForWorkbench,
  testProviderConnectionForWorkbench,
  testProviderModelConnectionForWorkbench,
} from './provider-credential-client.js';
import { renderSettingsSheet } from './render/settings-sheet.js';
import { saveLocalProviderPreferences } from './local-draft-store.js';

const LEFT_PANEL_MIN = 280;
const LEFT_PANEL_MAX = 520;
const LEFT_PANEL_COLLAPSE_AT = 236;
let globalKeyboardBound = false;

function persistProviderPreferences() {
  saveLocalProviderPreferences(state);
}

export function bindEvents(render) {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeMode = button.dataset.mode;
      state.view = "schemes";
      state.selectedScheme = "";
      state.resultViewerOpen = false;
      state.resultFilter = "all";
      ensureSelectedScheme();
      render();
    });
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextView = button.dataset.view;
      state.view = nextView === "archive" || nextView === "schemes"
        ? nextView
        : nextView === "project-library"
          ? state.view === "project-library" ? "schemes" : "project-library"
          : "schemes";
      render();
    });
  });

  document.querySelectorAll("[data-result-filter]").forEach((button) => {
    button.addEventListener("click", (event) => {
      state.resultFilter = button.dataset.resultFilter || "all";
      event.preventDefault();
      event.stopPropagation();
      render();
    });
  });

  document.querySelectorAll(".scheme-card[data-scheme-id]").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedScheme = card.dataset.schemeId;
      render();
    });
    card.addEventListener("keydown", (event) => {
      if (event.target?.closest?.("a, button, [data-action]")) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.selectedScheme = card.dataset.schemeId;
        render();
      }
    });
  });

  document.querySelectorAll(".result-card[data-result-id]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target?.closest?.("a, button, [data-action]")) return;
      state.selectedResult = card.dataset.resultId;
      state.selectedResultUserSet = true;
      state.resultViewerOpen = true;
      render();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.selectedResult = card.dataset.resultId;
        state.selectedResultUserSet = true;
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

  document.querySelectorAll("[data-scheme-variant]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const schemeId = button.dataset.schemeId;
      const variant = Number(button.dataset.schemeVariant);
      if (!schemeId || !Number.isFinite(variant)) return;
      state.selectedScheme = schemeId;
      state.selectedSchemeVariants = {
        ...(state.selectedSchemeVariants || {}),
        [schemeId]: Math.max(0, variant - 1),
      };
      event.preventDefault();
      event.stopPropagation();
      render();
    });
  });

  bindActionControls(render);
  bindKeyRevealControls();

  bindProviderControls(render);
  bindProviderModelControls(render);
  bindArchiveControls(render);

  bindGenerationFormControls(render);
  bindResizeDividers(render);
  bindSettingsResize();
  bindProviderKeyForms();
  bindGlobalKeyboardShortcuts(render);
}

function bindActionControls(render, root = document) {
  root.querySelectorAll("[data-action]").forEach((control) => {
    control.addEventListener("click", (event) => handleActionControl(control, event, render));
    if (!["BUTTON", "A", "INPUT", "TEXTAREA", "SELECT"].includes(control.tagName)) {
      control.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        handleActionControl(control, event, render);
      });
    }
  });
}

function bindProviderKeyForms(root = document) {
  root.querySelectorAll("[data-provider-key-form]").forEach((form) => {
    form.addEventListener("submit", (event) => event.preventDefault());
  });
}

function bindGlobalKeyboardShortcuts(render) {
  if (globalKeyboardBound) return;
  globalKeyboardBound = true;
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (state.settingsOpen) {
      state.settingsOpen = false;
      event.preventDefault();
      render();
      return;
    }
    if (state.resultViewerOpen) {
      state.resultViewerOpen = false;
      event.preventDefault();
      render();
      return;
    }
    if (state.generationChoiceOpen) {
      state.generationChoiceOpen = false;
      event.preventDefault();
      render();
    }
  });
}

async function handleActionControl(control, event, render) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const action = control.dataset.action;
  if (action === "toggle-theme") state.theme = state.theme === "light" ? "dark" : "light";
  if (action === "toggle-copy") state.copyVisible = !state.copyVisible;
  if (action === "toggle-task-panel") {
    state.taskOpen = !state.taskOpen;
    render();
    return;
  }
  if (action === "clear-workbench") {
    const confirmed = globalThis.confirm?.("清空当前工作台的项目内容、素材、方案、结果和队列？API Key 与模型配置会保留。") ?? true;
    if (!confirmed) return;
    const envelope = await clearWorkbenchForWorkbench();
    if (!envelope.ok) {
      state.submission = createLocalServiceError("clear_workbench_failed", envelope.error?.message || "清空工作台失败。");
      state.taskOpen = false;
    }
    render();
    return;
  }
  if (action === "toggle-task") {
    state.settingsOpen = true;
    state.taskOpen = false;
    render();
    await loadProviderCredentialStatusForWorkbench({ providerId: state.provider });
    return;
  }
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
      refreshSettingsLayer(render);
      return;
    } else {
      const providerSettings = readProviderSettingsFromSheet(providerId);
      const label = readProviderKeyLabel(providerId);
      const keyRef = currentProviderCredentialKeyRef(providerId);
      state.providerCredential = {
        ...state.providerCredential,
        status: "saving",
        providerId,
        error: null,
      };
      refreshSettingsLayer(render);
      await saveProviderCredentialForWorkbench({ providerId, apiKey, keyRef, label, ...providerSettings });
      refreshSettingsLayer(render);
      return;
    }
  }
  if (action === "save-provider-key-profile") {
    const providerId = control.dataset.providerId || state.provider;
    const input = document.querySelector(`[data-provider-api-key="${providerId}"]`);
    const apiKey = input?.value?.trim() || "";
    if (!apiKey) {
      state.providerCredential = {
        ...state.providerCredential,
        status: "error",
        providerId,
        error: "请输入新的 API Key 后再添加 Key 槽位。",
      };
      refreshSettingsLayer(render);
      return;
    }

    const providerSettings = readProviderSettingsFromSheet(providerId);
    const label = readProviderKeyLabel(providerId, `Key ${Date.now().toString(36).slice(-4)}`);
    const keyRef = createProviderCredentialKeyRef(providerId);
    state.providerCredential = {
      ...state.providerCredential,
      status: "saving",
      providerId,
      error: null,
    };
    refreshSettingsLayer(render);
    await saveProviderCredentialForWorkbench({ providerId, apiKey, keyRef, label, ...providerSettings });
    state.providerConnection = getIdleProviderConnection(providerId);
    refreshSettingsLayer(render);
    return;
  }
  if (action === "activate-provider-key") {
    const providerId = control.dataset.providerId || state.provider;
    const keyRef = control.dataset.keyRef || "";
    if (!keyRef) return;
    await activateProviderCredentialForWorkbench({ providerId, keyRef });
    if (state.provider === providerId) {
      state.providerConnection = getIdleProviderConnection(providerId);
    }
    refreshSettingsLayer(render);
    return;
  }
  if (action === "test-provider-connection") {
    const providerId = control.dataset.providerId || state.provider;
    const input = document.querySelector(`[data-provider-api-key="${providerId}"]`);
    const apiKey = input?.value?.trim() || "";
    const credentialReady = state.providerCredential.providerId === providerId && state.providerCredential.configured;

    if (!credentialReady) {
      if (!apiKey) {
        state.providerCredential = {
          ...state.providerCredential,
          status: "error",
          providerId,
          error: "请先输入 API Key；如果已经保存过，请重新打开此供应商状态。",
        };
        refreshSettingsLayer(render);
        return;
      }

      const providerSettings = readProviderSettingsFromSheet(providerId);
      const label = readProviderKeyLabel(providerId);
      const keyRef = currentProviderCredentialKeyRef(providerId);
      state.providerCredential = {
        ...state.providerCredential,
        status: "saving",
        providerId,
        error: null,
      };
      refreshSettingsLayer(render);
      const saveEnvelope = await saveProviderCredentialForWorkbench({ providerId, apiKey, keyRef, label, ...providerSettings });
      if (!saveEnvelope.ok) {
        refreshSettingsLayer(render);
        return;
      }
    }

    state.providerConnection = {
      ...state.providerConnection,
      phase: "testing",
      status: "degraded",
      providerId,
      error: null,
      message: "正在测试供应商连接...",
    };
    refreshSettingsLayer(render);
    await testProviderConnectionForWorkbench({ providerId, keyRef: currentProviderCredentialKeyRef(providerId) });
    refreshSettingsLayer(render);
    return;
  }
  if (action === "revoke-provider-key") {
    const providerId = control.dataset.providerId || state.provider;
    state.providerCredential = {
      ...state.providerCredential,
      status: "revoking",
      providerId,
      error: null,
    };
    refreshSettingsLayer(render);
    await revokeProviderCredentialForWorkbench({
      providerId,
      keyRef: control.dataset.keyRef || currentProviderCredentialKeyRef(providerId),
    });
    if (state.provider === providerId) {
      state.providerConnection = getIdleProviderConnection(providerId);
    }
    refreshSettingsLayer(render);
    return;
  }
  if (action === "generate-schemes") {
    const schemeCountOverride = getCurrentSchemeCountOverride();
    const clearEnvelope = await clearGeneratedSchemesForWorkbench({ modeId: state.activeMode });
    if (!clearEnvelope.ok) {
      state.submission = createLocalServiceError("generate_schemes_clear_failed", clearEnvelope.error?.message || "清空旧方案失败。");
      state.taskOpen = true;
      state.settingsOpen = false;
      render();
      return;
    }
    const submissionPromise = submitGenerationDraft({
      schemeStrategy: "regenerate",
      ...(schemeCountOverride ? { schemeCountOverride } : {}),
      renderImages: false,
    });
    state.view = "schemes";
    state.taskOpen = false;
    render();
    finishSubmission(await submissionPromise);
    render();
    return;
  }
  if (action === "cancel-generation") {
    const cancelPromise = cancelActiveGenerationDraft();
    state.taskOpen = false;
    render();
    await cancelPromise;
    state.taskOpen = false;
    render();
    return;
  }
  if (action === "refresh-scheme") {
    const schemeId = control.dataset.schemeRefreshId || "";
    if (!schemeId) return;
    state.selectedScheme = schemeId;
    state.selectedSchemeVariants = {
      ...(state.selectedSchemeVariants || {}),
      [schemeId]: 0,
    };
    const resetEnvelope = await resetGeneratedSchemeForWorkbench({ schemeId });
    if (!resetEnvelope.ok) {
      state.submission = createLocalServiceError("refresh_scheme_failed", resetEnvelope.error?.message || "刷新这个方案失败。");
      state.taskOpen = true;
      state.settingsOpen = false;
      render();
      return;
    }
    const submissionPromise = submitGenerationDraft({
      schemeStrategy: "continue",
      schemeIds: [schemeId],
      schemeCountOverride: 1,
      renderImages: false,
    });
    state.view = "schemes";
    state.taskOpen = false;
    render();
    finishSubmission(await submissionPromise);
    render();
    return;
  }
  if (action === "regenerate-result") {
    const resultId = control.dataset.resultId || state.selectedResult || "";
    const result = findRuntimeResult(resultId);
    if (!result?.schemeId) return;

    state.selectedResult = result.id;
    state.selectedResultUserSet = true;
    state.selectedScheme = result.schemeId;
    state.resultViewerOpen = false;

    const submissionPromise = submitGenerationDraft({
      schemeStrategy: "continue",
      schemeIds: [result.schemeId],
      sourceResultId: result.id,
      schemeCountOverride: 1,
      outputOverrides: outputOverridesForResult(result),
      renderImages: true,
    });
    state.view = "schemes";
    state.taskOpen = false;
    render();
    finishSubmission(await submissionPromise);
    selectNewestResultForScheme(result.schemeId, result.id);
    state.view = "schemes";
    state.resultViewerOpen = Boolean(state.selectedResult);
    render();
    return;
  }
  if (action === "submit-generation") {
    let generationOptions = {};
    if (control.dataset.schemeId) {
      state.selectedScheme = control.dataset.schemeId;
      state.selectedSchemeVariants = {
        ...(state.selectedSchemeVariants || {}),
        [control.dataset.schemeId]: state.selectedSchemeVariants?.[control.dataset.schemeId] || 0,
      };
      const snapshot = getRuntimeWorkspaceSnapshot();
      const selectedScheme = snapshot.schemes?.find((scheme) => scheme.id === control.dataset.schemeId);
      const failedBeforeBrief = selectedScheme?.status === "failed"
        && !selectedScheme.promptBlocks?.some((block) => ["中文提示词", "English Prompt"].includes(block.title));
      generationOptions = failedBeforeBrief
        ? {
            schemeStrategy: "regenerate",
            renderImages: false,
          }
        : {
            schemeStrategy: "continue",
            schemeIds: [control.dataset.schemeId],
            renderImages: true,
          };
    } else {
      if (state.activeMode === "poster" && !hasExistingPosterProduction()) {
        generationOptions = {
          schemeStrategy: "regenerate",
          renderImages: true,
        };
      } else if (state.activeMode === "poster") {
        generationOptions = {
          schemeStrategy: "continue",
          renderImages: true,
        };
      } else {
        generationOptions = {
          schemeStrategy: "continue",
          renderImages: true,
        };
      }
    }
    const submissionPromise = submitGenerationDraft(generationOptions);
    state.view = "schemes";
    state.taskOpen = false;
    render();
    finishSubmission(await submissionPromise);
    render();
    return;
  }
  if (action === "retry-failed-images") {
    const failedSchemeIds = getFailedImageSchemeIds();
    if (failedSchemeIds.length === 0) return;
    const submissionPromise = submitGenerationDraft({
      schemeStrategy: "continue",
      schemeIds: failedSchemeIds,
      retryFailedOnly: true,
    });
    state.view = "schemes";
    state.taskOpen = false;
    render();
    finishSubmission(await submissionPromise);
    render();
    return;
  }
  if (action === "confirm-generation-choice") {
    const strategy = control.dataset.generationStrategy === "regenerate" ? "regenerate" : "continue";
    state.generationChoiceOpen = false;
    const submissionPromise = submitGenerationDraft({
      schemeStrategy: strategy,
      renderImages: strategy === "continue",
    });
    state.view = "schemes";
    state.taskOpen = false;
    render();
    finishSubmission(await submissionPromise);
    render();
    return;
  }
  if (action === "cancel-generation-choice") {
    state.generationChoiceOpen = false;
    render();
    return;
  }
  if (action === "test-provider-route-plan") {
    await testCurrentProviderRoutePlan(render);
    return;
  }
  if (action === "apply-agnes-core-route") {
    applyAgnesCoreRoute();
    persistProviderPreferences();
    renderPreservingSettings(render);
    return;
  }
  if (action === "simulate-asset-upload") {
    const assetPromise = simulateWorkbenchAssetUpload({
      role: control.dataset.assetRole,
      label: control.dataset.assetLabel,
    });
    render();
    await assetPromise;
  }
  if (action === "rotate-direction-library") {
    const modeId = control.dataset.directionMode || state.activeMode;
    const current = state.directionLibraryOffset?.[modeId] || 0;
    if (modeSpecs[modeId]) {
      state.activeMode = modeId;
      state.view = "schemes";
    }
    state.directionLibraryOffset = {
      ...(state.directionLibraryOffset || {}),
      [modeId]: current + 1,
    };
  }
  if (action === "toggle-suite-manager") {
    state.outputSuiteManagerOpen = !state.outputSuiteManagerOpen;
  }
  if (action === "add-provider-route-plan") {
    const plans = Array.isArray(state.providerRoutePlans) ? [...state.providerRoutePlans] : [];
    const nextIndex = plans.length + 1;
    const plan = {
      id: `custom-${Date.now().toString(36)}`,
      name: `方案 ${nextIndex}`,
    };
    state.providerRoutePlans = [...plans, plan];
    state.providerRoutePlan = plan.id;
    state.providerRoutingOpen = true;
    persistProviderPreferences();
    renderPreservingSettings(render);
    return;
  }
  if (action === "rename-provider-route-plan") {
    const planId = control.dataset.providerRouteNameTarget || state.providerRoutePlan;
    const input = control.closest(".route-plan-manager")?.querySelector("[data-provider-route-name-draft]");
    const nextName = input?.value?.trim();
    if (planId && nextName) {
      state.providerRoutePlans = (state.providerRoutePlans || []).map((plan) =>
        plan.id === planId ? { ...plan, name: nextName.slice(0, 24) } : plan,
      );
      state.providerRoutingOpen = true;
      persistProviderPreferences();
      renderPreservingSettings(render);
      return;
    }
  }
  if (action === "delete-provider-route-plan") {
    const plans = Array.isArray(state.providerRoutePlans) ? [...state.providerRoutePlans] : [];
    if (plans.length > 1) {
      state.providerRoutePlans = plans.filter((plan) => plan.id !== state.providerRoutePlan);
      state.providerRoutePlan = state.providerRoutePlans[0]?.id || "standard";
      state.providerRoutingOpen = true;
      persistProviderPreferences();
      renderPreservingSettings(render);
      return;
    }
  }
  if (action === "add-provider-custom-model") {
    const providerId = control.dataset.providerId || state.provider;
    const input = document.querySelector(`[data-provider-custom-model-input="${providerId}"]`);
    const modelId = input?.value?.trim();
    if (!modelId) return;
    const current = Array.isArray(state.providerCustomModels?.[providerId])
      ? state.providerCustomModels[providerId]
      : [];
    const nextModels = Array.from(new Set([...current, modelId])).slice(0, 40);
    const overrideKey = getProviderModelOverrideKey(providerId);
    state.providerCustomModels = {
      ...(state.providerCustomModels || {}),
      [providerId]: nextModels,
    };
    state.providerModelOverrides = {
      ...(state.providerModelOverrides || {}),
      [overrideKey]: {
        ...(state.providerModelOverrides?.[overrideKey] || {}),
        defaultModel: modelId,
      },
    };
    persistProviderPreferences();
    renderPreservingSettings(render);
    return;
  }
  if (action === "delete-provider-custom-model") {
    const providerId = control.dataset.providerId || state.provider;
    const modelId = control.dataset.providerModelId || "";
    const current = Array.isArray(state.providerCustomModels?.[providerId])
      ? state.providerCustomModels[providerId]
      : [];
    state.providerCustomModels = {
      ...(state.providerCustomModels || {}),
      [providerId]: current.filter((model) => model !== modelId),
    };
    state.providerModelOverrides = removeProviderModelOverrideValue(providerId, modelId);
    persistProviderPreferences();
    renderPreservingSettings(render);
    return;
  }
  if (action === "project-library-save-current") {
    saveCurrentProjectToLibrary();
  }
  if (action === "project-library-import") {
    importProjectLibraryEntry(control.dataset.projectEntryId || "");
  }
  if (action === "project-library-delete-entry") {
    deleteProjectLibraryEntry(control.dataset.projectEntryId || "");
  }
  if (action === "delete-scheme") {
    const schemeId = control.dataset.schemeDeleteId || "";
    if (!schemeId) return;
    if (state.schemeDeleteConfirmId !== schemeId) {
      state.schemeDeleteConfirmId = schemeId;
      state.resultDeleteConfirmId = "";
      render();
      return;
    }
    const deleteEnvelope = await deleteGeneratedSchemeForWorkbench({ schemeId });
    if (!deleteEnvelope.ok) {
      state.submission = createLocalServiceError("delete_scheme_failed", deleteEnvelope.error?.message || "删除方案失败。");
      state.taskOpen = false;
    }
    state.schemeDeleteConfirmId = "";
    render();
    return;
  }
  if (action === "open-result-viewer") {
    if (control.dataset.resultId) {
      state.selectedResult = control.dataset.resultId;
      state.selectedResultUserSet = true;
    }
    state.resultViewerOpen = true;
  }
  if (action === "goto-result-scheme") {
    const schemeId = control.dataset.schemeId || "";
    if (!schemeId) return;
    state.selectedScheme = schemeId;
    state.view = "schemes";
    state.resultViewerOpen = false;
    render();
    return;
  }
  if (action === "close-result-viewer") state.resultViewerOpen = false;
  if (action === "delete-result") {
    const resultId = control.dataset.resultId || state.selectedResult || "";
    if (!resultId) return;
    if (state.resultDeleteConfirmId !== resultId) {
      state.resultDeleteConfirmId = resultId;
      state.schemeDeleteConfirmId = "";
      render();
      return;
    }
    const deleteEnvelope = await deleteResultForWorkbench({ resultId });
    if (!deleteEnvelope.ok) {
      state.submission = createLocalServiceError("delete_result_failed", deleteEnvelope.error?.message || "删除结果失败。");
      state.taskOpen = false;
    }
    state.resultDeleteConfirmId = "";
    state.resultViewerOpen = false;
    render();
    return;
  }
  if (action === "toggle-left-panel") {
    state.leftCollapsed = !state.leftCollapsed;
    if (!state.leftCollapsed) state.leftWidth = clamp(state.leftWidth || 320, LEFT_PANEL_MIN, LEFT_PANEL_MAX);
  }
  event.stopPropagation();
  render();
}

function hasExistingPosterProduction() {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const hasGeneratedScheme = (snapshot.schemes || []).some((scheme) =>
    scheme.mode === "poster"
      && scheme.status !== "pending"
      && !String(scheme.id || "").startsWith("poster-"),
  );
  const hasPosterResult = (snapshot.results || []).some((result) => result.mode === "poster");
  return hasGeneratedScheme || hasPosterResult;
}

function findRuntimeResult(resultId) {
  const snapshot = getRuntimeWorkspaceSnapshot();
  return (snapshot.results || []).find((result) => result.id === resultId) || null;
}

function outputOverridesForResult(result) {
  const width = Math.round(Number(result.width || 0));
  const height = Math.round(Number(result.height || 0));
  const hasValidSize = width >= 256 && width <= 8192 && height >= 256 && height <= 8192;
  return {
    platformPresets: [result.platformPreset || "custom"],
    aspectRatios: hasValidSize ? [`${width}x${height}`] : ["16:9"],
    ...(hasValidSize ? { customSize: { width, height } } : {}),
    imagesPerScheme: 1,
  };
}

function selectNewestResultForScheme(schemeId, previousResultId = "") {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const candidates = (snapshot.results || [])
    .filter((result) => result.schemeId === schemeId && result.id !== previousResultId)
    .sort((left, right) => {
      const rightTime = Date.parse(right.updatedAt || right.createdAt || "");
      const leftTime = Date.parse(left.updatedAt || left.createdAt || "");
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    });
  if (!candidates[0]) return;
  state.selectedResult = candidates[0].id;
  state.selectedResultUserSet = true;
}

function finishSubmission(submission) {
  if (submission?.status === "service-error" || submission?.status === "invalid") {
    state.taskOpen = true;
    state.settingsOpen = false;
  }
}

function getCurrentSchemeCountOverride() {
  const value = Number(getActiveGenerationFormValues()?.outputSettings?.schemeCount);
  if (!Number.isFinite(value)) return null;
  return Math.max(1, Math.min(20, Math.round(value)));
}

function createLocalServiceError(reason, message) {
  return {
    status: "service-error",
    mode: state.activeMode,
    transport: state.workspaceLoadStatus || "local",
    serviceFlow: {
      ok: false,
      reason,
      error: {
        message,
      },
    },
  };
}

function getFailedImageSchemeIds() {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const plans = (snapshot.queuePlans || []).filter((plan) => plan.job?.mode === state.activeMode);
  const plan = plans[plans.length - 1];
  if (!plan) return [];
  return Array.from(new Set((plan.tasks || [])
    .filter((task) => task.kind === "imageGeneration" && task.status === "failed" && task.input?.schemeId)
    .map((task) => task.input.schemeId)));
}

function getSlotLabel(slotKey) {
  return {
    concept: "方案生成",
    image: "图像生成",
    styleReference: "画风参考分析",
    compositionReference: "构图参考分析",
  }[slotKey] || slotKey;
}

function readCurrentProviderRoutePlanSlots(root = document) {
  return Array.from(root.querySelectorAll("[data-provider-model-slot]"))
    .map((modelControl) => {
      const slot = modelControl.dataset.providerModelSlot || "";
      const providerControl = root.querySelector(`[data-provider-slot-provider="${escapeSelectorValue(slot)}"]`);
      const providerId = providerControl?.value || modelControl.dataset.providerId || state.provider;
      const model = modelControl.value || "";
      return {
        slot,
        label: getSlotLabel(slot),
        providerId,
        model,
      };
    })
    .filter((item) => item.slot && item.providerId && item.model);
}

function applyAgnesCoreRoute() {
  state.provider = "agnes";
  state.providerRoutePlan = ensureProviderRoutePlan("mimo-agnes", "MiMo + Agnes 测试");
  state.providerSlotRoutes = {
    ...(state.providerSlotRoutes || {}),
    concept: {
      providerId: "mimo",
      model: "mimo-v2.5-pro",
    },
    image: {
      providerId: "agnes",
      model: "agnes-image-2.1-flash",
    },
    styleReference: {
      providerId: "mimo",
      model: "mimo-v2-omni",
    },
    compositionReference: {
      providerId: "mimo",
      model: "mimo-v2-omni",
    },
  };
}

function ensureProviderRoutePlan(planId, name) {
  const plans = Array.isArray(state.providerRoutePlans) ? [...state.providerRoutePlans] : [];
  if (!plans.some((plan) => plan.id === planId)) {
    state.providerRoutePlans = [...plans, { id: planId, name }];
  }
  return planId;
}

function resolveReferenceAnalysisRoute(slot) {
  const current = state.providerSlotRoutes?.[slot] || {};
  if (current.providerId && current.providerId !== "agnes") return current;
  const providerId = findConfiguredReferenceAnalysisProvider();
  if (!providerId) return { providerId: "agnes" };
  return {
    providerId,
    model: defaultReferenceAnalysisModel(providerId, slot),
  };
}

function findConfiguredReferenceAnalysisProvider() {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const configured = (providerId) => {
    const config = snapshot.providerConfigs?.[providerId];
    return Boolean(config?.hasApiKey || config?.status === "success")
      || (state.providerCredential.providerId === providerId && state.providerCredential.configured)
      || (state.providerConnection.providerId === providerId && state.providerConnection.ok);
  };
  return ["mimo", "google", "openai", "aigocode", "claude", "qwen"].find(configured) || "";
}

function defaultReferenceAnalysisModel(providerId, slot) {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const config = snapshot.providerConfigs?.[providerId] || {};
  if (config.modelSlots?.[slot]) return config.modelSlots[slot];
  if (providerId === "google") return "gemini-2.5-flash";
  if (providerId === "claude") return "claude-sonnet-4-6";
  if (providerId === "qwen") return "qwen3.6-plus";
  if (providerId === "mimo") return "mimo-v2-omni";
  return "gpt-5.5";
}

function escapeSelectorValue(value) {
  return String(value || "").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function applyRoutePlanTestPatch(patch) {
  state.providerRoutePlanTest = {
    ...(state.providerRoutePlanTest || {}),
    planId: state.providerRoutePlan,
    ...patch,
  };
}

async function testCurrentProviderRoutePlan(render) {
  const slots = readCurrentProviderRoutePlanSlots(document.querySelector(".settings-layer") || document);
  const startedAt = new Date().toISOString();
  applyRoutePlanTestPatch({
    phase: "testing",
    updatedAt: startedAt,
    error: null,
    results: slots.map((slot) => ({
      ...slot,
      status: "testing",
      ok: false,
      message: "测试中",
    })),
  });
  refreshSettingsLayer(render);

  const results = [];
  for (const slot of slots) {
    const envelope = await testProviderModelConnectionForWorkbench({
      providerId: slot.providerId,
      model: slot.model,
      strictModel: false,
      verifyModels: true,
      timeoutMs: 12000,
    });
    const result = envelope.ok ? envelope.data?.result : null;
    results.push({
      ...slot,
      status: result?.status || "unavailable",
      ok: Boolean(envelope.ok && result?.ok),
      message: result?.userMessage || envelope.error?.message || "测试失败",
      sampledModels: result?.sampledModels || [],
    });
    applyRoutePlanTestPatch({
      phase: "testing",
      updatedAt: new Date().toISOString(),
      results: [
        ...results,
        ...slots.slice(results.length).map((pending) => ({
          ...pending,
          status: "pending",
          ok: false,
          message: "等待测试",
        })),
      ],
    });
    refreshSettingsLayer(render);
  }

  const allOk = results.length > 0 && results.every((item) => item.ok);
  applyRoutePlanTestPatch({
    phase: allOk ? "success" : "error",
    updatedAt: new Date().toISOString(),
    results,
    error: allOk ? null : "当前配置方案中有模型未通过连通测试。",
  });
  refreshSettingsLayer(render);
}

function bindProviderControls(render, root = document) {
  root.querySelectorAll("[data-provider]").forEach((button) => {
    button.addEventListener("click", () => handleProviderControl(button, render));
  });
  bindProviderReorderControls(render, root);
}

function bindProviderReorderControls(render, root = document) {
  root.querySelectorAll("[data-provider-order-item]").forEach((button) => {
    button.addEventListener("dragstart", (event) => {
      const providerId = button.dataset.providerOrderItem;
      if (!providerId) return;
      event.dataTransfer?.setData("text/plain", providerId);
      event.dataTransfer?.setData("application/x-poster-provider", providerId);
      event.dataTransfer.effectAllowed = "move";
      button.classList.add("dragging");
    });
    button.addEventListener("dragend", () => {
      button.classList.remove("dragging");
      root.querySelectorAll("[data-provider-order-item].drag-over").forEach((item) => item.classList.remove("drag-over"));
    });
    button.addEventListener("dragover", (event) => {
      const types = Array.from(event.dataTransfer?.types || []);
      if (!types.includes("application/x-poster-provider")) return;
      event.preventDefault();
      button.classList.add("drag-over");
      event.dataTransfer.dropEffect = "move";
    });
    button.addEventListener("dragleave", () => {
      button.classList.remove("drag-over");
    });
    button.addEventListener("drop", (event) => {
      const fromProvider = event.dataTransfer?.getData("application/x-poster-provider")
        || event.dataTransfer?.getData("text/plain");
      const toProvider = button.dataset.providerOrderItem;
      if (!fromProvider || !toProvider || fromProvider === toProvider) return;
      event.preventDefault();
      const currentOrder = Array.from(root.querySelectorAll("[data-provider-order-item]"))
        .map((item) => item.dataset.providerOrderItem)
        .filter(Boolean);
      const nextOrder = currentOrder.filter((providerId) => providerId !== fromProvider);
      const targetIndex = nextOrder.indexOf(toProvider);
      nextOrder.splice(targetIndex < 0 ? nextOrder.length : targetIndex, 0, fromProvider);
      state.providerOrder = nextOrder;
      persistProviderPreferences();
      refreshSettingsLayer(render);
    });
  });
}

function getCurrentProjectLibraryDraft() {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const modeState = Array.isArray(snapshot.modeStates)
    ? snapshot.modeStates.find((item) => item.mode === state.activeMode)
    : null;
  return {
    id: state.projectLibraryActiveEntryId || `project-${Date.now().toString(36)}`,
    name: snapshot.project?.name || modeState?.projectBrief?.projectName || "未命名项目",
    description: modeState?.projectBrief?.gameDescription || snapshot.project?.description || "",
    updatedAt: new Date().toISOString(),
  };
}

function saveCurrentProjectToLibrary() {
  const draft = getCurrentProjectLibraryDraft();
  const entries = Array.isArray(state.projectLibraryEntries) ? [...state.projectLibraryEntries] : [];
  const existingIndex = entries.findIndex((entry) => entry.id === draft.id);
  if (existingIndex >= 0) entries[existingIndex] = draft;
  else entries.unshift(draft);

  state.projectLibraryEntries = entries.slice(0, 24);
  state.projectLibraryActiveEntryId = draft.id;
  state.projectLibraryMessage = "当前项目名称和描述已保存。";
}

function importProjectLibraryEntry(entryId) {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const entry = (state.projectLibraryEntries || []).find((item) => item.id === entryId)
    || (entryId === "current-project" || entryId === snapshot.project?.id
      ? {
          id: entryId || "current-project",
          name: snapshot.project?.name || "未命名项目",
          description: snapshot.project?.description || "",
          updatedAt: snapshot.metadata?.updatedAt || "",
        }
      : null);
  if (!entry) {
    state.projectLibraryMessage = "未找到这个项目记录。";
    return;
  }

  updateGenerationFormField("projectBrief.projectName", entry.name || "未命名项目");
  updateGenerationFormField("projectBrief.gameDescription", entry.description || "");
  state.projectLibraryActiveEntryId = entry.id;
  state.projectLibraryMessage = "已导入项目名称和描述。";
  state.view = "schemes";
}

function deleteProjectLibraryEntry(entryId) {
  const entries = Array.isArray(state.projectLibraryEntries) ? state.projectLibraryEntries : [];
  state.projectLibraryEntries = entries.filter((entry) => entry.id !== entryId);
  if (state.projectLibraryActiveEntryId === entryId) state.projectLibraryActiveEntryId = "";
  state.projectLibraryMessage = "已删除项目记录，当前表单不会被清空。";
}

function readProviderSettingsFromSheet(providerId) {
  const baseUrl = document.querySelector(`[data-provider-base-url="${providerId}"]`)?.value?.trim() || "";
  const defaultModel = document.querySelector(`[data-provider-default-model="${providerId}"]`)?.value?.trim() || "";
  const modelSlots = Object.fromEntries(
    Array.from(document.querySelectorAll(`[data-provider-model-slot][data-provider-id="${providerId}"]`))
      .map((control) => [control.dataset.providerModelSlot, control.value?.trim()])
      .filter(([slot, value]) => slot && value),
  );

  return {
    baseUrl,
    defaultModel,
    modelSlots,
  };
}

function readProviderKeyLabel(providerId, fallback = "默认 Key") {
  return document.querySelector(`[data-provider-key-label="${providerId}"]`)?.value?.trim().slice(0, 80) || fallback;
}

function currentProviderCredentialKeyRef(providerId) {
  return state.workspaceSnapshot?.providerConfigs?.[providerId]?.credentialKeyRef
    || `${state.workspaceId}:${providerId}:default`;
}

function createProviderCredentialKeyRef(providerId) {
  return `${state.workspaceId}:${providerId}:${Date.now().toString(36)}`;
}

function bindProviderModelControls(render, root = document) {
  root.querySelectorAll(".model-routing-disclosure").forEach((details) => {
    details.addEventListener("toggle", () => {
      state.providerRoutingOpen = Boolean(details.open);
      persistProviderPreferences();
    });
  });

  root.querySelectorAll("[data-provider-slot-provider]").forEach((control) => {
    control.addEventListener("change", () => {
      const slot = control.dataset.providerSlotProvider;
      if (!slot) return;
      state.providerRoutingOpen = true;
      state.providerSlotRoutes = {
        ...(state.providerSlotRoutes || {}),
        [slot]: {
          providerId: control.value,
        },
      };
      persistProviderPreferences();
      renderPreservingSettings(render);
    });
  });

  root.querySelectorAll("[data-provider-default-model]").forEach((control) => {
    control.addEventListener("change", () => {
      const providerId = control.dataset.providerDefaultModel;
      if (!providerId) return;
      const overrideKey = getProviderModelOverrideKey(providerId);
      state.providerModelOverrides = {
        ...(state.providerModelOverrides || {}),
        [overrideKey]: {
          ...(state.providerModelOverrides?.[overrideKey] || {}),
          defaultModel: control.value,
        },
      };
      persistProviderPreferences();
      renderPreservingSettings(render);
    });
  });

  root.querySelectorAll("[data-provider-model-slot]").forEach((control) => {
    control.addEventListener("change", () => {
      const providerId = control.dataset.providerId || state.provider;
      const slot = control.dataset.providerModelSlot;
      if (!slot) return;
      state.providerRoutingOpen = true;
      state.providerSlotRoutes = {
        ...(state.providerSlotRoutes || {}),
        [slot]: {
          providerId,
          model: control.value,
        },
      };
      const overrideKey = getProviderModelOverrideKey(providerId);
      state.providerModelOverrides = {
        ...(state.providerModelOverrides || {}),
        [overrideKey]: {
          ...(state.providerModelOverrides?.[overrideKey] || {}),
          [slot]: control.value,
        },
      };
      persistProviderPreferences();
      renderPreservingSettings(render);
    });
  });

  root.querySelectorAll("[data-provider-route-plan]").forEach((button) => {
    button.addEventListener("click", () => {
      const planId = button.dataset.providerRoutePlan;
      if (!planId) return;
      state.providerRoutingOpen = true;
      state.providerRoutePlan = planId;
      persistProviderPreferences();
      renderPreservingSettings(render);
    });
  });

  root.querySelectorAll("[data-provider-route-name]").forEach((control) => {
    control.addEventListener("change", () => {
      const planId = control.dataset.providerRouteName;
      const nextName = control.value.trim();
      if (!planId || !nextName) return;
      state.providerRoutePlans = (state.providerRoutePlans || []).map((plan) =>
        plan.id === planId ? { ...plan, name: nextName.slice(0, 24) } : plan,
      );
      state.providerRoutingOpen = true;
      persistProviderPreferences();
      renderPreservingSettings(render);
    });
  });

  root.querySelectorAll("[data-provider-custom-model-input]").forEach((control) => {
    control.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const providerId = control.dataset.providerCustomModelInput;
      root.querySelector(`[data-action="add-provider-custom-model"][data-provider-id="${providerId}"]`)?.click();
    });
  });
}

function getProviderModelOverrideKey(providerId) {
  return `${providerId}:${state.providerRoutePlan || "standard"}`;
}

function removeProviderModelOverrideValue(providerId, modelId) {
  const overrides = { ...(state.providerModelOverrides || {}) };
  for (const [key, value] of Object.entries(overrides)) {
    if (key !== providerId && !key.startsWith(`${providerId}:`)) continue;
    const nextValue = { ...value };
    for (const [slot, model] of Object.entries(nextValue)) {
      if (model === modelId) delete nextValue[slot];
    }
    overrides[key] = nextValue;
  }
  return overrides;
}

function renderPreservingSettings(render) {
  const detailScrollTop = document.querySelector(".provider-detail")?.scrollTop || 0;
  render();
  const nextDetail = document.querySelector(".provider-detail");
  if (nextDetail) nextDetail.scrollTop = detailScrollTop;
}

async function handleProviderControl(button, render) {
  const providerId = button.dataset.provider;
  if (!providerId) return;
  if (state.provider === providerId && state.settingsOpen) return;

  state.provider = providerId;
  persistProviderPreferences();
  if (!state.settingsOpen) {
    render();
    return;
  }

  state.providerConnection = getIdleProviderConnection(providerId);
  renderPreservingSettings(render);

  await loadProviderCredentialStatusForWorkbench({ providerId });
  if (state.provider === providerId && state.settingsOpen) {
    state.providerConnection = getIdleProviderConnection(providerId);
    renderPreservingSettings(render);
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
  const modelRoutingDisclosure = current.querySelector(".model-routing-disclosure");
  if (modelRoutingDisclosure) {
    state.providerRoutingOpen = Boolean(modelRoutingDisclosure.open);
  }
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderSettingsSheet().trim();
  const nextLayer = wrapper.firstElementChild;
  const currentSheet = current.querySelector(".settings-sheet");
  const currentBody = current.querySelector(".settings-body");
  const currentProviderList = current.querySelector(".provider-list");
  const currentProviderDetail = current.querySelector(".provider-detail");
  const nextSheet = nextLayer?.querySelector?.(".settings-sheet");
  const nextBody = nextLayer?.querySelector?.(".settings-body");
  const nextProviderList = nextLayer?.querySelector?.(".provider-list");
  const nextProviderDetail = nextLayer?.querySelector?.(".provider-detail");

  if (currentSheet && nextSheet) {
    currentSheet.setAttribute("style", nextSheet.getAttribute("style") || "");
  }

  if (currentProviderList && nextProviderList && currentProviderDetail && nextProviderDetail) {
    currentProviderList.replaceWith(nextProviderList);
    currentProviderDetail.replaceWith(nextProviderDetail);
  } else if (currentBody && nextBody) {
    currentBody.replaceWith(nextBody);
  } else if (nextLayer) {
    current.replaceWith(nextLayer);
  }

  const activeLayer = document.querySelector(".settings-layer");
  const nextDetail = activeLayer?.querySelector(".provider-detail");
  if (nextDetail) nextDetail.scrollTop = detailScrollTop;

  if (activeLayer) {
    const rebindRoot = activeLayer.querySelector(".settings-body") || activeLayer;
    bindActionControls(render, rebindRoot);
    bindKeyRevealControls(rebindRoot);
    bindProviderKeyForms(rebindRoot);
    bindProviderControls(render, rebindRoot);
    bindProviderModelControls(render, rebindRoot);
  }
}

function bindKeyRevealControls(root = document) {
  root.querySelectorAll("[data-key-reveal]").forEach((button) => {
    const providerId = button.dataset.keyReveal;
    const input = root.querySelector(`[data-provider-api-key="${providerId}"]`) || document.querySelector(`[data-provider-api-key="${providerId}"]`);
    if (!input) return;

    const reveal = (event) => {
      input.type = "text";
      event.preventDefault();
    };
    const hide = () => {
      input.type = "password";
    };

    button.addEventListener("pointerdown", reveal);
    button.addEventListener("pointerup", hide);
    button.addEventListener("pointerleave", hide);
    button.addEventListener("pointercancel", hide);
    button.addEventListener("blur", hide);
    button.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") reveal(event);
    });
    button.addEventListener("keyup", hide);
  });
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

  root.querySelectorAll("[data-settings-resize-corner]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      const sheet = document.querySelector(".settings-sheet");
      if (!sheet) return;

      const rect = sheet.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = state.settingsWidth || rect.width;
      const startHeight = state.settingsHeight || rect.height;
      document.body.classList.add("is-resizing");

      const onPointerMove = (moveEvent) => {
        const widthDelta = startX - moveEvent.clientX;
        const heightDelta = moveEvent.clientY - startY;
        state.settingsWidth = clamp(startWidth + widthDelta, 760, Math.max(760, window.innerWidth - 32));
        state.settingsHeight = clamp(startHeight + heightDelta, 560, Math.max(560, window.innerHeight - 32));
        sheet.style.setProperty("--settings-sheet-width", `${state.settingsWidth}px`);
        sheet.style.setProperty("--settings-sheet-height", `${state.settingsHeight}px`);
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
