"use client";

import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { uploadWorkbenchAssetFile } from "../asset-library-client.js";
import { state } from "../state.js";
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
const customSlotTones = ["violet", "teal", "orange", "blue"];

function normalizeCategoryLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 24);
}

function assetSlotKey(slot: Pick<AssetSlot, "role" | "label">, defaultRole: string): string {
  return `${slot.role || defaultRole}:${slot.label}`;
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

  const isPending = operation?.status === "planning";
  const visibleSlots = useMemo<VisibleAssetSlot[]>(() => {
    const existing = new Set(slots.map((slot) => slot.label));
    const extraSlots = customCategories
      .filter((label) => !existing.has(label))
      .map((label, index) => ({
        role: defaultAssetRole,
        label,
        state: "自定义",
        tone: customSlotTones[index % customSlotTones.length] || "violet",
        previewUrl: null,
        custom: true,
      }));

    return [...slots, ...extraSlots].filter((slot) => !hiddenSlotKeys.includes(assetSlotKey(slot, defaultAssetRole)));
  }, [customCategories, defaultAssetRole, hiddenSlotKeys, slots]);

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
        error: result.ok ? null : "素材路由失败",
      });
    } catch (error) {
      setOperation({
        status: "error",
        role,
        label: file?.name || label,
        transport: "runtime",
        error: error instanceof Error ? error.message : "素材路由失败",
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

  return (
    <div className="assets-section-react" data-rhf-assets-section>
      <input ref={fileInputRef} className="asset-file-input" type="file" accept={acceptedImageTypes.join(",")} onChange={handleFileChange} />

      <div className={`asset-grid ${visibleSlots.length > 4 ? "asset-grid-dense" : ""}`}>
        {visibleSlots.map((slot) => {
          const role = slot.role || defaultAssetRole;
          const key = `${role}:${slot.label}`;
          const status = pendingKey === key ? "上传中" : slot.previewUrl ? "已就绪" : "待上传";

          return (
            <article className={`asset-slot-card ${slot.tone}`} key={key}>
              <button
                className="asset-slot-upload"
                type="button"
                onClick={() => openFilePicker(role, slot.label)}
                disabled={isPending}
                aria-busy={pendingKey === key}
              >
                <i
                  className={slot.previewUrl ? "asset-preview" : undefined}
                  style={slot.previewUrl ? { backgroundImage: `url(${slot.previewUrl})` } : undefined}
                />
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

      <button
        className="upload-drop"
        type="button"
        onClick={() => openFilePicker(referenceRole, referenceLabel, true)}
        disabled={isPending}
        aria-busy={pendingKey === `${referenceRole}:${referenceLabel}`}
      >
        <span>{referenceLabel}</span>
        <small>{pendingKey === `${referenceRole}:${referenceLabel}` ? "上传中" : referenceHelper}</small>
      </button>

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

      {operation ? <AssetOperationStatus operation={operation} /> : null}
    </div>
  );
}

function AssetOperationStatus({ operation }: { operation: AssetOperation }) {
  const status = operation.status === "ready" ? "ready" : operation.status === "error" ? "error" : "planning";
  const detail =
    operation.status === "ready"
      ? `${operation.transport || "静态"} / ${operation.assetCount ?? "本地"} 个素材`
      : operation.status === "error"
        ? operation.error || "素材路由失败"
        : `${operation.transport || "静态"} 路由处理中`;

  return (
    <div className={`asset-route-status ${status}`}>
      <span>素材路由</span>
      <strong>{operation.label || operation.role || "素材"}</strong>
      <small>{detail}</small>
    </div>
  );
}
