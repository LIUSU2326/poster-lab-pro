"use client";

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { removeWorkbenchAssetsByRoleLabel, uploadWorkbenchAssetFile } from "../asset-library-client.js";
import { analyzeReferenceImageForWorkbench } from "../reference-analysis-client.js";
import { latestReferenceAnalysisSummary, summarizeReferenceAnalysisText } from "../reference-analysis-state.js";
import {
  isKnownUnsupportedProviderSlotModel,
  providerModelSlots,
  providerSupportsSlot,
} from "../provider-capabilities.js";
import { getRuntimeWorkspaceSnapshot, state } from "../state.js";
import type { ProductionMode } from "../schema/zod";
import type { WorkbenchRenderOptions } from "./mount-workbench-sections";
import {
  configScrollTopForElement,
  preserveWorkbenchConfigScrollTop,
  readPreservedWorkbenchConfigScrollTop,
} from "./workbench-scroll-preservation";

type AssetSlot = {
  role?: string;
  label: string;
  state: string;
  tone: string;
  sourceType?: string;
  previewUrl?: string | null;
  previewUrls?: string[];
  assetCount?: number;
};

type VisibleAssetSlot = AssetSlot & {
  custom?: boolean;
};

type AssetOperation = {
  status: "idle" | "planning" | "ready" | "error";
  role?: string;
  label?: string;
  transport?: string;
  assetCount?: number | null;
  error?: string | null;
};

type AssetsSectionProps = {
  mode: ProductionMode;
  slots: AssetSlot[];
  defaultAssetRole: string;
  referenceRole: string;
  referenceLabel: string;
  referenceHelper: string;
  initialOperation?: AssetOperation | null | undefined;
  onRequestRender?: ((options?: WorkbenchRenderOptions) => void) | undefined;
};

const acceptedImageTypes = ["image/png", "image/jpeg", "image/webp"];
const customSlotTone = "custom";
const referenceAnalysisProviderIds = new Set(["openai", "aigocode", "custom", "google", "claude", "qwen", "mimo"]);

function normalizeCategoryLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 24);
}

function roleForCategoryLabel(label: string, defaultRole: string): string {
  if (/logo|标识/i.test(label)) return "gameLogo";
  if (/场景|背景/i.test(label)) return "background";
  if (/boss|怪物|道具|武器|奖励/i.test(label)) return "prop";
  return defaultRole || "gameCharacter";
}

function assetSlotKey(slot: Pick<AssetSlot, "role" | "label">, defaultRole: string): string {
  return `${slot.role || defaultRole}:${slot.label}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });
}

function uploadFingerprint(target: { role: string; label: string }, file: File): string {
  return [
    target.role,
    target.label,
    file.name,
    file.type,
    file.size,
    file.lastModified,
  ].join("|");
}

function routeProviderForSlot(slot: string): string {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const routedProvider = state.providerSlotRoutes?.[slot]?.providerId || "";
  const currentProvider = state.provider || "";
  const configured = (providerId: string): boolean => {
    const provider = snapshot.providerConfigs?.[providerId];
    return Boolean(
      (state.providerCredential?.providerId === providerId && state.providerCredential?.configured) ||
      (state.providerConnection?.providerId === providerId && state.providerConnection?.ok) ||
      provider?.hasApiKey ||
      provider?.status === "success",
    );
  };
  if (
    (slot === "styleReference" || slot === "compositionReference")
    && currentProvider
    && !referenceAnalysisProviderIds.has(currentProvider)
    && configured(currentProvider)
    && (!routedProvider || !configured(routedProvider))
  ) {
    return currentProvider;
  }
  return routedProvider || currentProvider;
}

function analysisApiReady(providerId: string): boolean {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const provider = snapshot.providerConfigs?.[providerId];
  return Boolean(
    (state.providerCredential?.providerId === providerId && state.providerCredential?.configured) ||
    (state.providerConnection?.providerId === providerId && state.providerConnection?.ok) ||
    provider?.hasApiKey ||
    provider?.status === "success",
  );
}

function referenceAnalysisProviderReady(providerId: string): boolean {
  return referenceAnalysisProviderIds.has(providerId);
}

function referenceAnalysisModelForSlot(providerId: string, slot: string): string {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const route = (state.providerSlotRoutes?.[slot] || {}) as { providerId?: string; model?: string };
  const provider = (snapshot.providerConfigs?.[providerId] || {}) as { modelSlots?: Record<string, string>; defaultModel?: string };
  const modelSlots = providerModelSlots as Record<string, Record<string, string[]>>;
  const slotModels = modelSlots[providerId]?.[slot] || [];
  const configuredSlotModel = provider.modelSlots?.[slot] || "";
  const routeModel = providerId === route.providerId ? route.model || "" : "";
  const preferredModel = routeModel || configuredSlotModel || slotModels[0] || provider.defaultModel || "";
  if (!isKnownUnsupportedProviderSlotModel(providerId, slot, preferredModel)) return preferredModel;
  if (configuredSlotModel && slotModels.includes(configuredSlotModel)) return configuredSlotModel;
  return slotModels[0] || "";
}

function referenceAnalysisRouteReady(providerId: string, slot: string, model: string): boolean {
  if (!referenceAnalysisProviderReady(providerId) || !providerSupportsSlot(providerId, slot)) return false;
  return !isKnownUnsupportedProviderSlotModel(providerId, slot, model);
}

function valuesForKeyPrefix(values: Record<string, string> | undefined, key: string): string[] {
  return Object.entries(values || {})
    .filter(([itemKey]) => itemKey === key || itemKey.startsWith(`${key}:`))
    .map(([, value]) => value)
    .filter(Boolean);
}

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter(Boolean)));
}

function latestDataUrlForRole(role: string): string {
  return Object.entries(state.referenceUploadDataUrls || {})
    .filter(([key]) => key.startsWith(`${role}:`))
    .map(([, value]) => value)
    .filter(Boolean)
    .at(-1) || "";
}

function normalizeLocalPreviewUrl(value: string | null | undefined): string {
  const url = typeof value === "string" ? value : "";
  if (!url || /example\.com/i.test(url) || /^blob:/i.test(url)) return "";
  const localUpload = url.match(/^https?:\/\/(?:localhost|127\.0\.0\.1):\d+(\/uploads\/.+)$/i);
  return localUpload?.[1] || url;
}

function persistedPreviewsForRole(slots: AssetSlot[], role: string): string[] {
  return uniqueUrls(
    slots
      .filter((slot) => slot.role === role)
      .flatMap((slot) => [
        ...(Array.isArray(slot.previewUrls) ? slot.previewUrls : []),
        slot.previewUrl || "",
      ])
      .map(normalizeLocalPreviewUrl),
  );
}

function localPreviewsForRole(localPreviews: Record<string, string>, role: string): string[] {
  return uniqueUrls([
    ...Object.entries(state.referenceUploadDataUrls || {})
      .filter(([key]) => key.startsWith(`${role}:`))
      .map(([, value]) => value),
    ...Object.entries(localPreviews || {})
      .filter(([key]) => key.startsWith(`${role}:`))
      .map(([, value]) => value),
  ]);
}

function persistedPreviewsForAssetSlot(slot: AssetSlot): string[] {
  return uniqueUrls([
    ...(Array.isArray(slot.previewUrls) ? slot.previewUrls.map(normalizeLocalPreviewUrl) : []),
    normalizeLocalPreviewUrl(slot.previewUrl),
  ]);
}

function localPreviewsForAssetSlot(key: string, localPreviews: Record<string, string>): string[] {
  return uniqueUrls([
    ...valuesForKeyPrefix(state.referenceUploadDataUrls, key),
    ...valuesForKeyPrefix(localPreviews, key),
  ]);
}

function latestPreviewForRole(slots: AssetSlot[], localPreviews: Record<string, string>, role: string): string {
  const local = Object.entries(localPreviews)
    .filter(([key]) => key.startsWith(`${role}:`))
    .map(([, value]) => value)
    .filter(Boolean)
    .at(-1);
  if (local) return local;
  const dataUrl = latestDataUrlForRole(role);
  if (dataUrl) return dataUrl;
  const slot = [...slots].reverse().find((item) => item.role === role && (item.previewUrl || item.previewUrls?.length));
  const previewUrl = slot?.previewUrls?.filter(Boolean).at(-1) || slot?.previewUrl || "";
  return normalizeLocalPreviewUrl(previewUrl);
}

function previewsForRole(
  slots: AssetSlot[],
  localPreviews: Record<string, string>,
  role: string,
  options: { includeLocal?: boolean } = {},
): string[] {
  return uniqueUrls([
    ...persistedPreviewsForRole(slots, role),
    ...(options.includeLocal === false ? [] : localPreviewsForRole(localPreviews, role)),
  ]);
}

function previewsForAssetSlot(
  key: string,
  slot: AssetSlot,
  localPreviews: Record<string, string>,
  options: { includeLocal?: boolean } = {},
): string[] {
  return uniqueUrls([
    ...persistedPreviewsForAssetSlot(slot),
    ...(options.includeLocal === false ? [] : localPreviewsForAssetSlot(key, localPreviews)),
  ]);
}

function previewForAssetSlot(key: string, slot: AssetSlot, localPreviews: Record<string, string>): string {
  return previewsForAssetSlot(key, slot, localPreviews).at(-1) || "";
}

function isReferenceOnlySlot(slot: AssetSlot, referenceRole: string): boolean {
  return slot.role === referenceRole || slot.role === "compositionReference" || slot.role === "styleReference";
}

export function AssetsSection({
  mode,
  slots,
  defaultAssetRole,
  referenceRole,
  referenceLabel,
  referenceHelper,
  initialOperation,
  onRequestRender,
}: AssetsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pickerTargetRef = useRef<{ role: string; label: string; multiple: boolean } | null>(null);
  const activeUploadFingerprintsRef = useRef<Set<string>>(new Set());
  const preservedConfigScrollTopRef = useRef<number | null>(null);
  const [operation, setOperation] = useState<AssetOperation | null>(initialOperation || null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>(
    Array.isArray(state.customAssetCategories?.[mode]) ? state.customAssetCategories[mode] : [],
  );
  const [hiddenSlotKeys, setHiddenSlotKeys] = useState<string[]>(
    Array.isArray(state.hiddenAssetSlots?.[mode]) ? state.hiddenAssetSlots[mode] : [],
  );
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const [brokenPreviewUrls, setBrokenPreviewUrls] = useState<Record<string, true>>({});
  const [analysisMessage, setAnalysisMessage] = useState(() =>
    latestReferenceAnalysisSummary({ role: referenceRole, kinds: ["composition", "full"], maxLength: 120 }),
  );

  const isPending = operation?.status === "planning";
  const visibleSlots = useMemo<VisibleAssetSlot[]>(() => {
    const existing = new Set(slots.map((slot) => slot.label));
    const extraSlots = customCategories
      .filter((label) => !existing.has(label))
      .map((label) => ({
        role: roleForCategoryLabel(label, defaultAssetRole),
        label,
        state: "自定义",
        tone: customSlotTone,
        previewUrl: null,
        custom: true,
      }));

    return [...slots, ...extraSlots].filter(
      (slot) => !isReferenceOnlySlot(slot, referenceRole) && !hiddenSlotKeys.includes(assetSlotKey(slot, defaultAssetRole)),
    );
  }, [customCategories, defaultAssetRole, hiddenSlotKeys, referenceRole, slots]);
  const persistedReferencePreviewUrls = persistedPreviewsForRole(slots, referenceRole)
    .filter((url) => !brokenPreviewUrls[url]);
  const includeReferenceLocalPreviews = Boolean(
    pendingKey?.startsWith(`${referenceRole}:`) || persistedReferencePreviewUrls.length === 0,
  );
  const referencePreviewUrls = previewsForRole(slots, localPreviews, referenceRole, { includeLocal: includeReferenceLocalPreviews })
    .filter((url) => !brokenPreviewUrls[url]);
  const referencePreview = referencePreviewUrls.at(-1) || latestPreviewForRole(slots, localPreviews, referenceRole);
  const displayReferencePreview = referencePreview && !brokenPreviewUrls[referencePreview] ? referencePreview : "";
  const persistedReferenceCount = slots
    .filter((slot) => slot.role === referenceRole)
    .reduce((sum, slot) => sum + Math.max(0, Number(slot.assetCount || 0)), 0);
  const referencePreviewCount = Math.max(persistedReferenceCount, referencePreviewUrls.length, displayReferencePreview ? 1 : 0);
  const referenceProviderId = routeProviderForSlot(referenceRole);
  const referenceModel = referenceAnalysisModelForSlot(referenceProviderId, referenceRole);
  const providerCanAnalyzeReference = referenceAnalysisRouteReady(referenceProviderId, referenceRole, referenceModel);
  const referenceApiReady = analysisApiReady(referenceProviderId);
  const canExtractReference = Boolean(displayReferencePreview) && providerCanAnalyzeReference && referenceApiReady;
  const unsupportedReferenceProviderMessage = referenceProviderId === "agnes"
    ? "Agnes Image 2.1 Flash 支持图生图参考，但构图/画风文字分析需要视觉理解模型，请把识别路由切到 MiMo、Google、OpenAI、AIGoCode、Claude 或 Qwen。"
    : "当前供应商不支持参考图识别，请切换到 MiMo、Google、OpenAI、AIGoCode、Claude 或 Qwen。";
  const referenceDisabledReason = displayReferencePreview
    ? !providerCanAnalyzeReference
      ? unsupportedReferenceProviderMessage
      : !referenceApiReady
        ? "先在「模型与 API Key」里保存并测试可用的构图识别 API。"
        : ""
    : "";
  const referenceNote = analysisMessage;

  const rememberConfigScrollTop = (element: Element | null | undefined = fileInputRef.current) => {
    const configScrollTop = configScrollTopForElement(element);
    preservedConfigScrollTopRef.current = configScrollTop;
    if (configScrollTop !== null) preserveWorkbenchConfigScrollTop(configScrollTop);
  };

  const requestRenderWithPreservedScroll = () => {
    const configScrollTop = preservedConfigScrollTopRef.current
      ?? readPreservedWorkbenchConfigScrollTop()
      ?? configScrollTopForElement(fileInputRef.current);
    preservedConfigScrollTopRef.current = null;
    if (configScrollTop !== null) {
      onRequestRender?.({ configScrollTop });
      return;
    }
    onRequestRender?.();
  };

  const commitCustomCategories = (nextCategories: string[]) => {
    state.customAssetCategories = {
      ...(state.customAssetCategories || {}),
      [mode]: nextCategories,
    };
    setCustomCategories(nextCategories);
  };

  const commitHiddenSlots = (nextHiddenKeys: string[]) => {
    state.hiddenAssetSlots = {
      ...(state.hiddenAssetSlots || {}),
      [mode]: nextHiddenKeys,
    };
    setHiddenSlotKeys(nextHiddenKeys);
  };

  const openFilePicker = (role: string, label: string, multiple = false) => {
    rememberConfigScrollTop();
    pickerTargetRef.current = { role, label, multiple };
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    fileInputRef.current.multiple = multiple;
    fileInputRef.current.click();
  };

  const uploadMetadata = async (role: string, label: string, file?: File, previewUrl?: string) => {
    const key = `${role}:${label}`;
    setPendingKey(key);
    setOperation({
      status: "planning",
      role,
      label: file?.name || label,
      transport: "runtime",
    });

    try {
      const result = await uploadWorkbenchAssetFile({
        role,
        label,
        file,
        previewUrl,
      });
      setOperation({
        status: result.ok ? "ready" : "error",
        role,
        label: file?.name || label,
        transport: result.transport,
        assetCount: result.assetList?.ok ? result.assetList.data.assets.length : null,
        error: result.ok ? null : "上传失败",
      });
    } catch (error) {
      setOperation({
        status: "error",
        role,
        label: file?.name || label,
        transport: "runtime",
        error: error instanceof Error ? error.message : "上传失败",
      });
    } finally {
      setPendingKey(null);
      requestRenderWithPreservedScroll();
    }
  };

  const handleFilesForTarget = async (
    target: { role: string; label: string; multiple: boolean },
    files: File[],
  ) => {
    if (files.length === 0) return;
    const selectedFiles = target.multiple ? files : files.slice(0, 1);
    for (const [index, file] of selectedFiles.entries()) {
      const fingerprint = uploadFingerprint(target, file);
      if (activeUploadFingerprintsRef.current.has(fingerprint)) continue;
      activeUploadFingerprintsRef.current.add(fingerprint);
      if (!acceptedImageTypes.includes(file.type)) {
        setOperation({
          status: "error",
          role: target.role,
          label: file.name,
          transport: "local",
          error: "仅支持 PNG、JPG、WebP 图片。",
        });
        activeUploadFingerprintsRef.current.delete(fingerprint);
        continue;
      }
      if (file.size <= 0) {
        setOperation({
          status: "error",
          role: target.role,
          label: file.name,
          transport: "local",
          error: "选择的文件为空。",
        });
        activeUploadFingerprintsRef.current.delete(fingerprint);
        continue;
      }
      const label = target.label;
      const key = `${target.role}:${label}`;
      const previewKey = `${key}:${Date.now().toString(36)}-${index}-${file.name}`;
      let previewUrl = "";
      try {
        const dataUrl = await fileToDataUrl(file);
        previewUrl = dataUrl;
        state.referenceUploadDataUrls = {
          ...(state.referenceUploadDataUrls || {}),
          [previewKey]: dataUrl,
        };
      } catch {
        previewUrl = URL.createObjectURL(file);
      }
      setLocalPreviews((current) => ({ ...current, [previewKey]: previewUrl }));
      try {
        await uploadMetadata(target.role, label, file, previewUrl);
      } finally {
        activeUploadFingerprintsRef.current.delete(fingerprint);
      }
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const target = pickerTargetRef.current;
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    if (!target || files.length === 0) return;
    await handleFilesForTarget(target, files);
    input.value = "";
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = async (
    event: DragEvent<HTMLElement>,
    role: string,
    label: string,
    multiple = true,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    rememberConfigScrollTop(event.currentTarget);
    if (isPending) return;
    await handleFilesForTarget({ role, label, multiple }, Array.from(event.dataTransfer.files || []));
  };

  const addCategory = () => {
    const label = normalizeCategoryLabel(categoryDraft);
    if (!label) return;
    commitCustomCategories(Array.from(new Set([...customCategories, label])));
    setCategoryDraft("");
  };

  const deleteSlot = async (slot: VisibleAssetSlot) => {
    rememberConfigScrollTop();
    const role = slot.role || defaultAssetRole;
    const key = `${role}:${slot.label}`;
    const hasUpload = Boolean(previewForAssetSlot(key, slot, localPreviews));
    if (hasUpload) {
      setPendingKey(key);
      setOperation({
        status: "planning",
        role,
        label: slot.label,
        transport: state.apiMode,
      });
      try {
        const result = await removeWorkbenchAssetsByRoleLabel(role, slot.label);
        if (!result.ok) {
          throw new Error(result.save?.error?.message || "删除素材后保存工作区失败。");
        }
        setLocalPreviews((current) => Object.fromEntries(
          Object.entries(current).filter(([itemKey]) => itemKey !== key && !itemKey.startsWith(`${key}:`)),
        ));
        setOperation(null);
      } catch (error) {
        setOperation({
          status: "error",
          role,
          label: slot.label,
          transport: state.apiMode,
          error: error instanceof Error ? error.message : "删除素材失败。",
        });
      } finally {
        setPendingKey(null);
        requestRenderWithPreservedScroll();
      }
      return;
    }

    if (slot.custom || customCategories.includes(slot.label)) {
      commitCustomCategories(customCategories.filter((item) => item !== slot.label));
      return;
    }

    commitHiddenSlots(Array.from(new Set([...hiddenSlotKeys, assetSlotKey(slot, defaultAssetRole)])));
  };

  const restoreDefaults = () => {
    commitHiddenSlots([]);
  };

  const handleCategoryKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addCategory();
  };

  const runReferenceExtraction = async (kind: "composition" | "full") => {
    if (!displayReferencePreview) {
      setAnalysisMessage("请先上传一张构图参考图。");
      return;
    }
    if (!providerCanAnalyzeReference) {
      setAnalysisMessage(unsupportedReferenceProviderMessage);
      return;
    }
    const imageDataUrl = latestDataUrlForRole(referenceRole);
    if (!imageDataUrl) {
      setAnalysisMessage("请重新上传参考图后再识别。");
      return;
    }
    if (!analysisApiReady(referenceProviderId)) {
      setAnalysisMessage("先在「模型与 API Key」里保存并测试可用的构图识别 API。");
      return;
    }

    const label = kind === "composition" ? "仅识别构图" : "完整识别";
    setAnalysisMessage(`${label}中，请稍候...`);
    try {
      const result = await analyzeReferenceImageForWorkbench({
        kind,
        role: referenceRole,
        label: referenceLabel,
        providerId: referenceProviderId,
        model: referenceModel,
        imageDataUrl,
        key: `${referenceRole}:${kind}`,
      });
      if (!result.ok) {
        setAnalysisMessage(result.error?.message || `${label}失败，请检查 API 配置。`);
        return;
      }
      const text = String(result.data?.text || "").trim();
      const summary = summarizeReferenceAnalysisText(text, 120);
      setAnalysisMessage(summary || `${label}完成，但供应商没有返回文本。`);
    } catch (error) {
      setAnalysisMessage(error instanceof Error ? error.message : `${label}失败，请稍后重试。`);
    }
  };

  const deleteReferenceUpload = async () => {
    rememberConfigScrollTop();
    setOperation({
      status: "planning",
      role: referenceRole,
      label: referenceLabel,
      transport: state.apiMode,
    });
    try {
      const result = await removeWorkbenchAssetsByRoleLabel(referenceRole);
      if (!result.ok) {
        throw new Error(result.save?.error?.message || "删除参考图后保存工作区失败。");
      }
      setLocalPreviews((current) => Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith(`${referenceRole}:`)),
      ));
      setAnalysisMessage("");
      setOperation(null);
    } catch (error) {
      setOperation({
        status: "error",
        role: referenceRole,
        label: referenceLabel,
        transport: state.apiMode,
        error: error instanceof Error ? error.message : "删除参考图失败。",
      });
    } finally {
      requestRenderWithPreservedScroll();
    }
  };

  return (
    <div
      className="assets-section-react"
      data-rhf-assets-section
      data-react-assets-ready="true"
      data-asset-route-status={operation?.status || "idle"}
    >
      <input
        ref={fileInputRef}
        className="asset-file-input"
        type="file"
        accept={acceptedImageTypes.join(",")}
        multiple
        onChange={handleFileChange}
        data-asset-file-input
      />

      {categoryEditorOpen ? (
        <div className="asset-category-panel asset-category-panel-primary">
          <button className="asset-category-close mini-ghost-button" type="button" onClick={() => setCategoryEditorOpen(false)} aria-label="关闭新增素材类别">
            ×
          </button>
          <div className="inline-add-row">
            <input
              aria-label="新增素材类别"
              value={categoryDraft}
              placeholder="新增类别"
              onChange={(event) => setCategoryDraft(event.currentTarget.value)}
              onKeyDown={handleCategoryKeyDown}
            />
            <button className="mini-solid-button" type="button" disabled={!categoryDraft.trim()} onClick={addCategory}>
              添加
            </button>
          </div>
          {customCategories.length > 0 ? (
            <div className="tag-list" aria-label="自定义素材类别">
              {customCategories.map((label) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => commitCustomCategories(customCategories.filter((item) => item !== label))}
                  title="点击移除"
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <button className="asset-category-add-trigger asset-category-quick-add" type="button" onClick={() => setCategoryEditorOpen(true)} aria-label="新增素材类别" title="新增素材类别">
          +
        </button>
      )}

      <div className={`asset-grid ${visibleSlots.length > 4 ? "asset-grid-dense" : ""}`}>
        {visibleSlots.map((slot) => {
          const role = slot.role || defaultAssetRole;
          const key = `${role}:${slot.label}`;
          const persistedPreviewUrls = persistedPreviewsForAssetSlot(slot)
            .filter((url) => !brokenPreviewUrls[url]);
          const includeLocalPreviews = pendingKey === key || persistedPreviewUrls.length === 0;
          const previewUrls = previewsForAssetSlot(key, slot, localPreviews, { includeLocal: includeLocalPreviews })
            .filter((url) => !brokenPreviewUrls[url]);
          const displayPreviewUrl = previewUrls.at(-1) || "";
          const previewCount = Math.max(Number(slot.assetCount || 0), previewUrls.length);
          const stackUrls = previewUrls.slice(-3);
          const hasPreview = Boolean(displayPreviewUrl);
          const status = pendingKey === key ? "上传中" : displayPreviewUrl ? "已上传" : "待上传";

          return (
            <article className={`asset-slot-card ${slot.tone} ${hasPreview ? "has-preview" : "is-empty"}`} key={key}>
              <button
                className={`asset-slot-upload ${hasPreview ? "has-preview" : "is-empty"}`}
                type="button"
                onClick={() => openFilePicker(role, slot.label, true)}
                onDragOver={handleDragOver}
                onDrop={(event) => handleDrop(event, role, slot.label, true)}
                disabled={isPending}
                aria-busy={pendingKey === key}
                aria-label={`${slot.label}：${status}`}
              >
                <i className={displayPreviewUrl ? `asset-preview ${previewCount > 1 ? "asset-preview-stack" : ""}` : "asset-empty-thumb"}>
                  {displayPreviewUrl ? (
                    <>
                      <img
                        className="asset-preview-img asset-preview-main"
                        src={displayPreviewUrl}
                        alt=""
                        onError={() => setBrokenPreviewUrls((current) => ({ ...current, [displayPreviewUrl]: true }))}
                      />
                      {previewCount > 1 ? (
                        <span className="asset-stack-strip" aria-hidden="true">
                          {stackUrls.map((url) => (
                            <img
                              key={url}
                              src={url}
                              alt=""
                              onError={() => setBrokenPreviewUrls((current) => ({ ...current, [url]: true }))}
                            />
                          ))}
                        </span>
                      ) : null}
                      {previewCount > 1 ? <em className="asset-count-badge">{previewCount}</em> : null}
                    </>
                  ) : (
                    <span aria-hidden="true">+</span>
                  )}
                </i>
                <span className="asset-slot-meta">
                  <strong>{slot.label}</strong>
                  {hasPreview && previewCount > 1 ? <small>{previewCount} 个素材</small> : null}
                  {hasPreview ? <small>已上传</small> : null}
                </span>
              </button>
              <button
                className="asset-slot-delete"
                type="button"
                onClick={() => void deleteSlot(slot)}
                aria-label={`删除${slot.label}素材类别`}
                title="删除类别"
              >
                ×
              </button>
            </article>
          );
        })}
      </div>

      {hiddenSlotKeys.length > 0 ? (
        <button className="restore-slots-button" type="button" onClick={restoreDefaults}>
          恢复默认素材类别
        </button>
      ) : null}

      <div className={`reference-upload-card compact-reference-card ${displayReferencePreview ? "has-preview" : "is-empty"}`}>
        <button
          className="reference-upload-main"
          type="button"
          data-upload-drop="reference"
          onClick={() => openFilePicker(referenceRole, referenceLabel, true)}
          onDragOver={handleDragOver}
          onDrop={(event) => handleDrop(event, referenceRole, referenceLabel, true)}
          disabled={isPending}
          aria-busy={pendingKey?.startsWith(`${referenceRole}:`)}
        >
          <span className="reference-thumb" aria-hidden="true">
            {displayReferencePreview ? (
              <>
              <img
                className="reference-preview-image"
                src={displayReferencePreview}
                alt=""
                onError={() => setBrokenPreviewUrls((current) => ({ ...current, [displayReferencePreview]: true }))}
              />
              {referencePreviewCount > 1 ? <em className="asset-count-badge reference-count-badge">{referencePreviewCount}</em> : null}
              </>
            ) : (
              <span className="reference-plus">+</span>
            )}
          </span>
          <span className="reference-upload-meta">
            {displayReferencePreview ? <small>{referencePreviewCount > 1 ? `${referencePreviewCount} 个素材` : referenceLabel}</small> : null}
            {displayReferencePreview ? null : (
              <>
              <strong>{referenceLabel}</strong>
              {pendingKey?.startsWith(`${referenceRole}:`) ? <small>上传中</small> : null}
              </>
            )}
          </span>
        </button>
        {displayReferencePreview ? (
          <>
            <button className="reference-remove-button reference-corner-remove" type="button" onClick={() => void deleteReferenceUpload()} aria-label="删除构图参考图" title="删除参考图">
              ×
            </button>
            <div className="reference-analysis-tools">
              <button
                className="reference-analysis-button"
                type="button"
                onClick={() => runReferenceExtraction("composition")}
                disabled={!canExtractReference}
                title={referenceDisabledReason || undefined}
              >
                <svg className="reference-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3" />
                  <path d="M8 12h8M12 8v8" />
                </svg>
                <span>解析构图</span>
              </button>
              <button
                className="reference-analysis-button"
                type="button"
                onClick={() => runReferenceExtraction("full")}
                disabled={!canExtractReference}
                title={referenceDisabledReason || undefined}
              >
                <svg className="reference-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5z" />
                  <path d="M15 15h4M17 13v4" />
                </svg>
                <span>完整解析</span>
              </button>
            </div>
          </>
        ) : null}
        {referenceNote ? (
          <small className={canExtractReference ? "reference-ready-note" : "reference-muted-note"}>
            {referenceNote}
          </small>
        ) : null}
      </div>
    </div>
  );
}
