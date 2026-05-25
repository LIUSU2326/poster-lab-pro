"use client";

import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { uploadWorkbenchAssetFile } from "../asset-library-client.js";
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

function normalizeCategoryLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 24);
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

function analysisApiReady(): boolean {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const provider = snapshot.providerConfigs?.[state.provider];
  return Boolean(
    state.providerCredential?.configured ||
    state.providerConnection?.ok ||
    provider?.hasApiKey ||
    provider?.status === "success",
  );
}

function latestPreviewForRole(slots: AssetSlot[], localPreviews: Record<string, string>, role: string): string {
  const local = Object.entries(localPreviews)
    .filter(([key]) => key.startsWith(`${role}:`))
    .map(([, value]) => value)
    .filter(Boolean)
    .at(-1);
  if (local) return local;
  return [...slots].reverse().find((slot) => slot.role === role && slot.previewUrl)?.previewUrl || "";
}

function latestDataUrlForRole(role: string): string {
  return Object.entries(state.referenceUploadDataUrls || {})
    .filter(([key]) => key.startsWith(`${role}:`))
    .map(([, value]) => value)
    .filter(Boolean)
    .at(-1) || "";
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
  const [analysisMessage, setAnalysisMessage] = useState("");

  const isPending = operation?.status === "planning";
  const visibleSlots = useMemo<VisibleAssetSlot[]>(() => {
    const existing = new Set(slots.map((slot) => slot.label));
    const extraSlots = customCategories
      .filter((label) => !existing.has(label))
      .map((label) => ({
        role: defaultAssetRole,
        label,
        state: "自定义",
        tone: customSlotTone,
        previewUrl: null,
        custom: true,
      }));

    return [...slots, ...extraSlots].filter((slot) => !hiddenSlotKeys.includes(assetSlotKey(slot, defaultAssetRole)));
  }, [customCategories, defaultAssetRole, hiddenSlotKeys, slots]);
  const referencePreview = latestPreviewForRole(slots, localPreviews, referenceRole);
  const canExtractReference = Boolean(referencePreview) && analysisApiReady();

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
      const previewUrl = URL.createObjectURL(file);
      const key = `${target.role}:${label}`;
      setLocalPreviews((current) => ({ ...current, [key]: previewUrl }));
      try {
        const dataUrl = await fileToDataUrl(file);
        state.referenceUploadDataUrls = {
          ...(state.referenceUploadDataUrls || {}),
          [key]: dataUrl,
        };
      } catch {
        // Preview still works when FileReader fails; extraction can ask the user to re-upload later.
      }
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
    if (!referencePreview) {
      setAnalysisMessage("请先上传一张构图参考图。");
      return;
    }
    const imageDataUrl = latestDataUrlForRole(referenceRole);
    if (!imageDataUrl) {
      setAnalysisMessage("请重新上传参考图后再识别。");
      return;
    }
    if (!analysisApiReady()) {
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

  return (
    <div className="assets-section-react" data-rhf-assets-section>
      <input ref={fileInputRef} className="asset-file-input" type="file" accept={acceptedImageTypes.join(",")} onChange={handleFileChange} />

      <div className={`asset-grid ${visibleSlots.length > 4 ? "asset-grid-dense" : ""}`}>
        {visibleSlots.map((slot) => {
          const role = slot.role || defaultAssetRole;
          const key = `${role}:${slot.label}`;
          const previewUrl = localPreviews[key] || slot.previewUrl || "";
          const status = pendingKey === key ? "上传中" : previewUrl ? "已就绪" : "待上传";

          return (
            <article className={`asset-slot-card ${slot.tone}`} key={key}>
              <button
                className="asset-slot-upload"
                type="button"
                onClick={() => openFilePicker(role, slot.label)}
                disabled={isPending}
                aria-busy={pendingKey === key}
              >
                <i className={previewUrl ? "asset-preview" : undefined}>
                  {previewUrl ? <img className="asset-preview-img" src={previewUrl} alt="" /> : null}
                </i>
                <strong>{slot.label}</strong>
                <small>{status}</small>
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

      <div className={`reference-upload-card ${referencePreview ? "has-preview" : ""}`}>
        <button
          className="reference-upload-main"
          type="button"
          onClick={() => openFilePicker(referenceRole, referenceLabel, true)}
          disabled={isPending}
          aria-busy={pendingKey?.startsWith(`${referenceRole}:`)}
        >
          <span className="reference-thumb" aria-hidden="true">
            {referencePreview ? <img className="reference-preview-image" src={referencePreview} alt="" /> : null}
          </span>
          {referencePreview ? null : (
            <span>
              <strong>{referenceLabel}</strong>
              <small>{pendingKey?.startsWith(`${referenceRole}:`) ? "上传中" : referenceHelper}</small>
            </span>
          )}
        </button>
        <div className="reference-analysis-tools">
          <button type="button" onClick={() => runReferenceExtraction("composition")} disabled={!referencePreview}>
            仅识别构图
          </button>
          <button type="button" onClick={() => runReferenceExtraction("full")} disabled={!referencePreview}>
            完整识别
          </button>
        </div>
        {analysisMessage ? (
          <small className={canExtractReference ? "reference-ready-note" : "reference-muted-note"}>
            {analysisMessage}
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
