"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { uploadWorkbenchAssetFile } from "../asset-library-client.js";
import type { ProductionMode } from "../schema/zod";

type AssetSlot = {
  role?: string;
  label: string;
  state: string;
  tone: string;
  previewUrl?: string | null;
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
  const isPending = operation?.status === "planning";

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
        error: result.ok ? null : "asset route failed",
      });
    } catch (error) {
      setOperation({
        status: "error",
        role,
        label: file?.name || label,
        transport: "runtime",
        error: error instanceof Error ? error.message : "asset route failed",
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
          error: "Only PNG, JPG, and WebP images are accepted.",
        });
        continue;
      }
      if (file.size <= 0) {
        setOperation({
          status: "error",
          role: target.role,
          label: file.name,
          transport: "local",
          error: "Selected file is empty.",
        });
        continue;
      }
      const label = target.multiple && selectedFiles.length > 1 ? `${target.label} ${index + 1}` : target.label;
      const previewUrl = URL.createObjectURL(file);
      await uploadMetadata(target.role, label, file, previewUrl);
    }
  };

  return (
    <div className="assets-section-react" data-react-assets-ready data-assets-mode={mode}>
      <input
        ref={fileInputRef}
        className="asset-file-input"
        data-asset-file-input
        type="file"
        accept={acceptedImageTypes.join(",")}
        onChange={handleFileChange}
      />
      <div className={`asset-grid ${slots.length > 4 ? "asset-grid-dense" : ""}`}>
        {slots.map((slot) => {
          const role = slot.role || defaultAssetRole;
          const key = `${role}:${slot.label}`;
          return (
            <button
              className={`asset-slot ${slot.tone}`}
              type="button"
              key={`${role}-${slot.label}`}
              onClick={() => openFilePicker(role, slot.label)}
              disabled={isPending}
              aria-busy={pendingKey === key}
            >
              <i
                className={slot.previewUrl ? "asset-preview" : undefined}
                style={slot.previewUrl ? { backgroundImage: `url(${slot.previewUrl})` } : undefined}
              />
              <strong>{slot.label}</strong>
              <small>{pendingKey === key ? "planning" : slot.state}</small>
            </button>
          );
        })}
      </div>
      <button
        className="upload-drop"
        type="button"
        onClick={() => openFilePicker(referenceRole, referenceLabel, true)}
        disabled={isPending}
        aria-busy={pendingKey === `${referenceRole}:${referenceLabel}`}
      >
        <span>{referenceLabel}</span>
        <small>{pendingKey === `${referenceRole}:${referenceLabel}` ? "route pending" : referenceHelper}</small>
      </button>
      {operation ? <AssetOperationStatus operation={operation} /> : null}
    </div>
  );
}

function AssetOperationStatus({ operation }: { operation: AssetOperation }) {
  const status = operation.status === "ready" ? "ready" : operation.status === "error" ? "error" : "planning";
  const detail =
    operation.status === "ready"
      ? `${operation.transport || "static"} / ${operation.assetCount ?? "local"} assets`
      : operation.status === "error"
        ? operation.error || "asset route failed"
        : `${operation.transport || "static"} route pending`;

  return (
    <div className={`asset-route-status ${status}`}>
      <span>Asset route</span>
      <strong>{operation.label || operation.role || "asset"}</strong>
      <small>{detail}</small>
    </div>
  );
}
