"use client";

import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { removeWorkbenchAssetsByRoleLabel, uploadWorkbenchAssetFile } from "../asset-library-client.js";
import { analyzeReferenceImageForWorkbench } from "../reference-analysis-client.js";
import { getRuntimeWorkspaceSnapshot, state } from "../state.js";
import type { ProductionMode } from "../schema/zod";

type AssetSlot = {
  role?: string;
  label: string;
  state: string;
  tone: string;
  sourceType?: string;
  previewUrl?: string | null;
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
  onRequestRender?: (() => void) | undefined;
};

const acceptedImageTypes = ["image/png", "image/jpeg", "image/webp"];
const customSlotTone = "custom";
const referenceAnalysisProviderIds = new Set(["openai", "aigocode", "google", "claude", "qwen"]);

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

function routeProviderForSlot(slot: string): string {
  return state.providerSlotRoutes?.[slot]?.providerId || state.provider;
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

function dataUrlForKey(key: string): string {
  return state.referenceUploadDataUrls?.[key] || "";
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

function latestPreviewForRole(slots: AssetSlot[], localPreviews: Record<string, string>, role: string): string {
  const local = Object.entries(localPreviews)
    .filter(([key]) => key.startsWith(`${role}:`))
    .map(([, value]) => value)
    .filter(Boolean)
    .at(-1);
  if (local) return local;
  const dataUrl = latestDataUrlForRole(role);
  if (dataUrl) return dataUrl;
  const previewUrl = [...slots].reverse().find((slot) => slot.role === role && slot.previewUrl)?.previewUrl || "";
  return normalizeLocalPreviewUrl(previewUrl);
}

function previewForAssetSlot(key: string, slot: AssetSlot, localPreviews: Record<string, string>): string {
  return localPreviews[key] || dataUrlForKey(key) || normalizeLocalPreviewUrl(slot.previewUrl);
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
  const [operation, setOperation] = useState<AssetOperation | null>(initialOperation || null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [customCategories, setCustomCategories] = useState<string[]>(
    Array.isArray(state.customAssetCategories?.[mode]) ? state.customAssetCategories[mode] : [],
  );
  const [hiddenSlotKeys, setHiddenSlotKeys] = useState<string[]>(
    Array.isArray(state.hiddenAssetSlots?.[mode]) ? state.hiddenAssetSlots[mode] : [],
  );
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const [brokenPreviewUrls, setBrokenPreviewUrls] = useState<Record<string, true>>({});
  const [analysisMessage, setAnalysisMessage] = useState("");

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
  const referencePreview = latestPreviewForRole(slots, localPreviews, referenceRole);
  const displayReferencePreview = referencePreview && !brokenPreviewUrls[referencePreview] ? referencePreview : "";
  const referenceProviderId = routeProviderForSlot(referenceRole);
  const providerCanAnalyzeReference = referenceAnalysisProviderReady(referenceProviderId);
  const referenceApiReady = analysisApiReady(referenceProviderId);
  const canExtractReference = Boolean(displayReferencePreview) && providerCanAnalyzeReference && referenceApiReady;
  const referenceDisabledReason = displayReferencePreview
    ? !providerCanAnalyzeReference
      ? "当前供应商不支持图片识别，请切换到 OpenAI、AIGoCode、Google、Claude 或 Qwen。"
      : !referenceApiReady
        ? "先在「模型与 API Key」里保存并测试可用的构图识别 API。"
        : ""
    : "";
  const referenceNote = analysisMessage || referenceDisabledReason;

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
      onRequestRender?.();
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const target = pickerTargetRef.current;
    const files = Array.from(event.currentTarget.files || []);
    if (!target || files.length === 0) return;

    const selectedFiles = target.multiple ? files : files.slice(0, 1);
    for (const [index, file] of selectedFiles.entries()) {
      if (!acceptedImageTypes.includes(file.type)) {
        setOperation({
          status: "error",
          role: target.role,
          label: file.name,
          transport: "local",
          error: "仅支持 PNG、JPG、WebP 图片。",
        });
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
        continue;
      }
      const label = target.multiple && selectedFiles.length > 1 ? `${target.label} ${index + 1}` : target.label;
      const key = `${target.role}:${label}`;
      let previewUrl = "";
      try {
        const dataUrl = await fileToDataUrl(file);
        previewUrl = dataUrl;
        state.referenceUploadDataUrls = {
          ...(state.referenceUploadDataUrls || {}),
          [key]: dataUrl,
        };
      } catch {
        previewUrl = URL.createObjectURL(file);
      }
      setLocalPreviews((current) => ({ ...current, [key]: previewUrl }));
      await uploadMetadata(target.role, label, file, previewUrl);
    }
  };

  const addCategory = () => {
    const label = normalizeCategoryLabel(categoryDraft);
    if (!label) return;
    commitCustomCategories(Array.from(new Set([...customCategories, label])));
    setCategoryDraft("");
  };

  const deleteSlot = (slot: VisibleAssetSlot) => {
    const role = slot.role || defaultAssetRole;
    const key = `${role}:${slot.label}`;
    const hasUpload = Boolean(previewForAssetSlot(key, slot, localPreviews));
    if (hasUpload) {
      removeWorkbenchAssetsByRoleLabel(role, slot.label);
      setLocalPreviews((current) => Object.fromEntries(
        Object.entries(current).filter(([itemKey]) => itemKey !== key),
      ));
      onRequestRender?.();
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
    if (!referenceAnalysisProviderReady(referenceProviderId)) {
      setAnalysisMessage("当前供应商不支持图片识别，请切换到 OpenAI、AIGoCode、Google、Claude 或 Qwen。");
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
        imageDataUrl,
        key: `${referenceRole}:${kind}`,
      });
      if (!result.ok) {
        setAnalysisMessage(result.error?.message || `${label}失败，请检查 API 配置。`);
        return;
      }
      const text = String(result.data?.text || "").trim();
      const summary = text.length > 120 ? `${text.slice(0, 120)}...` : text;
      setAnalysisMessage(summary || `${label}完成，但供应商没有返回文本。`);
    } catch (error) {
      setAnalysisMessage(error instanceof Error ? error.message : `${label}失败，请稍后重试。`);
    }
  };

  const deleteReferenceUpload = () => {
    removeWorkbenchAssetsByRoleLabel(referenceRole);
    setLocalPreviews((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => !key.startsWith(`${referenceRole}:`)),
    ));
    setAnalysisMessage("");
    setOperation(null);
    onRequestRender?.();
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
        onChange={handleFileChange}
        data-asset-file-input
      />

      <div className={`asset-grid ${visibleSlots.length > 4 ? "asset-grid-dense" : ""}`}>
        {visibleSlots.map((slot) => {
          const role = slot.role || defaultAssetRole;
          const key = `${role}:${slot.label}`;
          const previewUrl = previewForAssetSlot(key, slot, localPreviews);
          const displayPreviewUrl = previewUrl && !brokenPreviewUrls[previewUrl] ? previewUrl : "";
          const status = pendingKey === key ? "上传中" : displayPreviewUrl ? "已上传" : "待上传";

          return (
            <article className={`asset-slot-card ${slot.tone}`} key={key}>
              <button
                className="asset-slot-upload"
                type="button"
                onClick={() => openFilePicker(role, slot.label)}
                disabled={isPending}
                aria-busy={pendingKey === key}
                aria-label={`${slot.label}，${status}`}
              >
                <i className={displayPreviewUrl ? "asset-preview" : undefined}>
                  {displayPreviewUrl ? (
                    <img
                      className="asset-preview-img"
                      src={displayPreviewUrl}
                      alt=""
                      onError={() => setBrokenPreviewUrls((current) => ({ ...current, [displayPreviewUrl]: true }))}
                    />
                  ) : null}
                </i>
                <strong>{slot.label}</strong>
              </button>
              <button
                className="asset-slot-delete"
                type="button"
                onClick={() => deleteSlot(slot)}
                aria-label={`删除${slot.label}素材类别`}
                title="删除类别"
              >
                删除
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

      <div className={`reference-upload-card ${displayReferencePreview ? "has-preview" : ""}`}>
        <button
          className="reference-upload-main"
          type="button"
          data-upload-drop="reference"
          onClick={() => openFilePicker(referenceRole, referenceLabel, true)}
          disabled={isPending}
          aria-busy={pendingKey?.startsWith(`${referenceRole}:`)}
        >
          <span className="reference-thumb" aria-hidden="true">
            {displayReferencePreview ? (
              <img
                className="reference-preview-image"
                src={displayReferencePreview}
                alt=""
                onError={() => setBrokenPreviewUrls((current) => ({ ...current, [displayReferencePreview]: true }))}
              />
            ) : null}
          </span>
          {displayReferencePreview ? null : (
            <span>
              <strong>{referenceLabel}</strong>
              <small>{pendingKey?.startsWith(`${referenceRole}:`) ? "上传中" : "上传图片后选择识别方式"}</small>
            </span>
          )}
        </button>
        {displayReferencePreview ? (
          <>
            <div className="reference-analysis-tools">
              <button
                type="button"
                onClick={() => runReferenceExtraction("composition")}
                disabled={!canExtractReference}
                title={referenceDisabledReason || undefined}
              >
                仅识别构图
              </button>
              <button
                type="button"
                onClick={() => runReferenceExtraction("full")}
                disabled={!canExtractReference}
                title={referenceDisabledReason || undefined}
              >
                完整识别
              </button>
            </div>
            <button className="reference-remove-button" type="button" onClick={deleteReferenceUpload}>
              删除参考图
            </button>
          </>
        ) : null}
        {referenceNote ? (
          <small className={canExtractReference ? "reference-ready-note" : "reference-muted-note"}>
            {referenceNote}
          </small>
        ) : null}
      </div>

      <div className="asset-category-panel">
        <strong>新增素材类别</strong>
        <div className="inline-add-row">
          <input
            aria-label="新增素材类别"
            value={categoryDraft}
            placeholder="例如武器、道具、怪物"
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
        ) : (
          <small>新增后会出现在上方素材卡片，可直接点击上传。</small>
        )}
      </div>
    </div>
  );
}
