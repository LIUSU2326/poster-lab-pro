"use client";

import { createRoot, type Root } from "react-dom/client";
import { getActiveGenerationFormValues } from "../generation-form-runtime.js";
import { AssetsSection } from "./AssetsSection";
import { BriefSection } from "./BriefSection";
import { DirectionSection } from "./DirectionSection";
import { OutputSettingsSection } from "./OutputSettingsSection";
import type { ProductionMode } from "../schema/zod";

export type MountedWorkbenchSections = {
  unmount: () => void;
};

export type WorkbenchRenderOptions = {
  configScrollTop?: number;
};

export type WorkbenchSectionMountOptions = {
  onRequestRender?: (options?: WorkbenchRenderOptions) => void;
};

export function mountWorkbenchSections(host: HTMLElement, options: WorkbenchSectionMountOptions = {}): MountedWorkbenchSections {
  const roots: Root[] = [];

  host.querySelectorAll<HTMLElement>("[data-react-brief-section]").forEach((target) => {
    const mode = target.dataset.briefMode as ProductionMode;
    const modeShort = target.dataset.modeShort || mode;
    const revision = Number(target.dataset.revision || 0);
    const assetCount = Number(target.dataset.assetCount || 0);
    const formValues = getActiveGenerationFormValues(mode);
    const section = target.closest(".config-section");
    section?.classList.add("has-react-brief");

    const root = createRoot(target);
    root.render(
      <BriefSection
        mode={mode}
        modeShort={modeShort}
        revision={revision}
        assetCount={assetCount}
        initialValues={formValues.projectBrief}
        onRequestRender={options.onRequestRender}
      />,
    );
    roots.push(root);
  });

  host.querySelectorAll<HTMLElement>("[data-react-assets-section]").forEach((target) => {
    const mode = target.dataset.assetsMode as ProductionMode;
    const slots = parseJsonArrayOfObjects(target.dataset.assetSlots);
    const defaultAssetRole = target.dataset.defaultAssetRole || "styleReference";
    const referenceRole = target.dataset.referenceRole || "styleReference";
    const referenceLabel = target.dataset.referenceLabel || "Style Reference";
    const referenceHelper = target.dataset.referenceHelper || "";
    const initialOperation = parseJsonObject(target.dataset.assetOperation);
    const section = target.closest(".config-section");
    section?.classList.add("has-react-assets");

    const root = createRoot(target);
    root.render(
      <AssetsSection
        mode={mode}
        slots={slots}
        defaultAssetRole={defaultAssetRole}
        referenceRole={referenceRole}
        referenceLabel={referenceLabel}
        referenceHelper={referenceHelper}
        initialOperation={initialOperation}
        onRequestRender={options.onRequestRender}
      />,
    );
    roots.push(root);
  });

  host.querySelectorAll<HTMLElement>("[data-react-output-settings]").forEach((target) => {
    const mode = target.dataset.outputMode as ProductionMode;
    const outputSizes = parseJsonArray(target.dataset.outputSizes);
    const sizeNote = target.dataset.sizeNote || "";
    const formValues = getActiveGenerationFormValues(mode);
    const section = target.closest(".config-section");
    section?.classList.add("has-react-output");

    const root = createRoot(target);
    root.render(
      <OutputSettingsSection
        mode={mode}
        initialValues={formValues.outputSettings}
        outputSizes={outputSizes}
        sizeNote={sizeNote}
      />,
    );
    roots.push(root);
  });

  host.querySelectorAll<HTMLElement>("[data-react-direction-section]").forEach((target) => {
    const mode = target.dataset.directionMode as ProductionMode;
    const styles = parseJsonArray(target.dataset.styles);
    const directionTitle = target.dataset.directionTitle || "";
    const directionHelper = target.dataset.directionHelper || "";
    const formValues = getActiveGenerationFormValues(mode);
    const section = target.closest(".config-section");
    section?.classList.add("has-react-direction");

    const root = createRoot(target);
    root.render(
      <DirectionSection
        mode={mode}
        initialValues={formValues.modeForm}
        styles={styles}
        directionTitle={directionTitle}
        directionHelper={directionHelper}
      />,
    );
    roots.push(root);
  });

  return {
    unmount() {
      for (const root of roots) root.unmount();
    },
  };
}

function parseJsonArray(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonArrayOfObjects(value: string | undefined): Array<{ role?: string; label: string; state: string; tone: string; sourceType?: string; previewUrl?: string | null; previewUrls?: string[]; assetCount?: number }> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        role: item && typeof item.role === "string" ? item.role : undefined,
        label: item && typeof item.label === "string" ? item.label : "Asset",
        state: item && typeof item.state === "string" ? item.state : "input",
        tone: item && typeof item.tone === "string" ? item.tone : "blue",
        sourceType: item && typeof item.sourceType === "string" ? item.sourceType : undefined,
        previewUrl: item && typeof item.previewUrl === "string" ? item.previewUrl : null,
        previewUrls: item && Array.isArray(item.previewUrls) ? item.previewUrls.map(String).filter(Boolean) : [],
        assetCount: item && Number.isFinite(Number(item.assetCount)) ? Number(item.assetCount) : 0,
      }));
  } catch {
    return [];
  }
}

function parseJsonObject(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
