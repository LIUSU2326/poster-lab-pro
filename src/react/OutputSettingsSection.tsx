"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { replaceGenerationFormField } from "../generation-form-runtime.js";
import { saveLocalOutputPreferences } from "../local-draft-store.js";
import { state } from "../state.js";
import { saveWorkspaceSnapshotForWorkbench } from "../workspace-data-service.js";
import { OutputSettingsFormSchema, type OutputSettingsForm, type ProductionMode } from "../schema/zod";

type PlatformPreset = OutputSettingsForm["platformPresets"][number];

type DeliverySuite = {
  id: string;
  preset: PlatformPreset;
  label: string;
  sizes: string[];
  custom?: boolean;
};

type CustomSuiteState = {
  id: string;
  label: string;
  sizes: string[];
};

type OutputSettingsSectionProps = {
  mode: ProductionMode;
  initialValues: OutputSettingsForm;
  outputSizes: string[];
  sizeNote: string;
};

const deliverySuitesByMode: Record<ProductionMode, DeliverySuite[]> = {
  poster: [
    { id: "tiktok", preset: "tiktok", label: "TikTok 竖版", sizes: ["9:16", "1080x1920"] },
    { id: "metaAds", preset: "metaAds", label: "Meta 广告", sizes: ["1:1", "4:3", "9:16", "1200x627"] },
    { id: "googlePlay", preset: "googlePlay", label: "Google Play", sizes: ["16:9", "1:1", "1024x500"] },
    { id: "appStore", preset: "appStore", label: "App Store", sizes: ["1:1", "4:3", "9:16"] },
  ],
  collab: [
    { id: "metaAds", preset: "metaAds", label: "Meta 广告", sizes: ["1:1", "4:3", "9:16", "1200x627"] },
    { id: "tiktok", preset: "tiktok", label: "TikTok 竖版", sizes: ["9:16", "1080x1920"] },
    { id: "googlePlay", preset: "googlePlay", label: "Google Play", sizes: ["16:9", "1:1"] },
  ],
  announcement: [
    { id: "tapTap", preset: "tapTap", label: "TapTap", sizes: ["16:9", "1:1"] },
    { id: "googlePlay", preset: "googlePlay", label: "Google Play", sizes: ["16:9", "1:1", "1024x500"] },
  ],
  logo: [{ id: "custom", preset: "custom", label: "标识套装", sizes: ["1:1", "4:3"], custom: true }],
  icon: [
    { id: "appStore", preset: "appStore", label: "App Store", sizes: ["1:1"] },
    { id: "googlePlay", preset: "googlePlay", label: "Google Play", sizes: ["1:1"] },
  ],
};

function normalizeInitialValues(mode: ProductionMode, values: OutputSettingsForm): OutputSettingsForm {
  const parsed = OutputSettingsFormSchema.parse({
    ...values,
    mode,
    aspectRatios: mode === "icon" ? ["1:1"] : values.aspectRatios,
  });
  const singleDefaultModes = new Set<ProductionMode>(["poster", "collab", "announcement"]);
  const oldSuitePresetIds = new Set<PlatformPreset>(["tiktok", "metaAds", "tapTap", "googlePlay", "appStore"]);
  const carriesOldSuitePreset = parsed.platformPresets.some((preset) => oldSuitePresetIds.has(preset));
  const carriesCustomSuiteState = parsed.platformPresets.includes("custom") && parsed.aspectRatios.length > 1 && !parsed.customSize;
  if (singleDefaultModes.has(mode) && (carriesOldSuitePreset || (carriesCustomSuiteState && parsed.selectionMode !== "suite"))) {
    return {
      ...parsed,
      platformPresets: ["custom"],
      aspectRatios: ["16:9"],
      customSize: null,
      selectionMode: "single",
    };
  }
  return parsed;
}

function selectionModeForValues(values: OutputSettingsForm): "suite" | "single" | "custom-size" {
  if (values.selectionMode === "suite" && !values.customSize) return "suite";
  if (values.selectionMode === "custom-size") return "custom-size";
  if (values.customSize) return "custom-size";
  const suitePresetIds = new Set<PlatformPreset>(["tiktok", "metaAds", "tapTap", "googlePlay", "appStore"]);
  return values.platformPresets.some((preset) => suitePresetIds.has(preset)) || values.aspectRatios.length > 1
    ? "suite"
    : "single";
}

function uniqueSizes(sizes: string[]): string[] {
  return Array.from(new Set(sizes.map((size) => size.trim()).filter(Boolean)));
}

function customSuiteSizes(): string[] {
  const sizes = Array.isArray(state.outputCustomSuiteSizes) ? state.outputCustomSuiteSizes : [];
  return sizes.length > 0 ? sizes : [];
}

function normalizeCustomSuites(): CustomSuiteState[] {
  const savedSuites = Array.isArray(state.outputCustomSuites) ? state.outputCustomSuites : [];
  const suites = savedSuites
    .map((suite, index) => ({
      id: typeof suite?.id === "string" && suite.id.trim() ? suite.id : `custom-${index + 1}`,
      label: typeof suite?.label === "string" && suite.label.trim() ? suite.label.trim() : `自定义套装 ${index + 1}`,
      sizes: uniqueSizes(Array.isArray(suite?.sizes) ? suite.sizes : []),
    }))
    .filter((suite) => suite.id && suite.label);
  if (suites.length > 0) return suites;

  const legacySizes = customSuiteSizes();
  return legacySizes.length > 0 || state.outputCustomSuiteEnabled
    ? [{ id: "custom-1", label: "自定义套装 1", sizes: legacySizes }]
    : [];
}

function createCustomSuiteState(index: number): CustomSuiteState {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: `自定义套装 ${index}`,
    sizes: [],
  };
}

function toDeliverySuite(suite: CustomSuiteState): DeliverySuite {
  return {
    id: suite.id,
    preset: "custom",
    label: suite.label,
    sizes: suite.sizes,
    custom: true,
  };
}

function numericDimension(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded >= 256 && rounded <= 8192 ? rounded : null;
}

function isCustomSizeLabel(value: string): boolean {
  return value === "自定义" || value.toLowerCase() === "custom" || value.includes("自定义") || value.includes("鑷");
}

function normalizeOutputSizeLabel(value: string): string {
  return isCustomSizeLabel(value) ? "自定义" : value;
}

function splitExplicitSize(size: string): { width: string; height: string } {
  const match = size.match(/^(\d{3,5})x(\d{3,5})$/i);
  return {
    width: match?.[1] || "1080",
    height: match?.[2] || "1920",
  };
}

export function OutputSettingsSection({ mode, initialValues, outputSizes, sizeNote }: OutputSettingsSectionProps) {
  const defaults = useMemo(() => normalizeInitialValues(mode, initialValues), [mode, initialValues]);
  const initialSelectionMode = useMemo(() => selectionModeForValues(defaults), [defaults]);
  const committedDefaultsRef = useRef("");
  const form = useForm<OutputSettingsForm>({
    resolver: zodResolver(OutputSettingsFormSchema) as Resolver<OutputSettingsForm>,
    defaultValues: defaults,
    mode: "onChange",
  });
  const values = useWatch({ control: form.control }) as OutputSettingsForm;
  const errors = form.formState.errors;
  const [suiteManagerOpen, setSuiteManagerOpen] = useState(Boolean(state.outputSuiteManagerOpen));
  const [customWidth, setCustomWidth] = useState(String(defaults.customSize?.width || 1080));
  const [customHeight, setCustomHeight] = useState(String(defaults.customSize?.height || 1920));
  const [suiteWidth, setSuiteWidth] = useState("1080");
  const [suiteHeight, setSuiteHeight] = useState("1920");
  const initialCustomSuites = useMemo(() => normalizeCustomSuites(), []);
  const [customSuites, setCustomSuites] = useState<CustomSuiteState[]>(initialCustomSuites);
  const [activeCustomSuiteId, setActiveCustomSuiteId] = useState(
    state.outputActiveCustomSuiteId || initialCustomSuites[0]?.id || "",
  );
  const [sizeDrafts, setSizeDrafts] = useState<Record<string, { width: string; height: string }>>({});
  const [selectionMode, setSelectionMode] = useState(initialSelectionMode);
  const [planStrategy, setPlanStrategy] = useState<"unified" | "independent">(
    state.outputPlanStrategy === "independent" ? "independent" : "unified",
  );

  useEffect(() => {
    const fingerprint = JSON.stringify(defaults);
    if (committedDefaultsRef.current === fingerprint) return;
    committedDefaultsRef.current = fingerprint;
    state.outputSelectionMode = initialSelectionMode;
    setSelectionMode(initialSelectionMode);
    replaceGenerationFormField("outputSettings", defaults);
  }, [defaults, initialSelectionMode]);

  const commit = async (nextValues: OutputSettingsForm) => {
    const parsed = OutputSettingsFormSchema.safeParse(nextValues);
    if (!parsed.success) return;
    replaceGenerationFormField("outputSettings", parsed.data);
    saveLocalOutputPreferences(state);
    if (state.apiMode === "http") {
      void saveWorkspaceSnapshotForWorkbench().catch((error) => {
        console.warn("Failed to persist output settings.", error);
      });
    }
  };

  const update = async <TKey extends keyof OutputSettingsForm>(key: TKey, value: OutputSettingsForm[TKey]) => {
    const nextValues = {
      ...form.getValues(),
      [key]: value,
    } as OutputSettingsForm;
    form.setValue(key, value as never, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    await commit(nextValues);
  };

  const updateMany = async (patch: Partial<OutputSettingsForm>) => {
    const nextValues = {
      ...form.getValues(),
      ...patch,
    } as OutputSettingsForm;
    Object.entries(patch).forEach(([key, value]) => {
      form.setValue(key as keyof OutputSettingsForm, value as never, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    });
    await commit(nextValues);
  };

  const currentValues = {
    ...defaults,
    ...values,
  };
  const suiteEligible = mode !== "logo" && mode !== "icon";
  const suites = suiteEligible ? customSuites.map(toDeliverySuite) : [];
  const suiteMode = suiteEligible && selectionMode === "suite";
  const customSizeMode = selectionMode === "custom-size";
  const visibleOutputSizes = outputSizes.map(normalizeOutputSizeLabel);
  const schemeCountLimit = suiteMode ? 5 : 20;
  const schemeCountValue = Math.max(1, Math.min(schemeCountLimit, Math.round(Number(currentValues.schemeCount || 1))));
  const suiteSizeCount = suiteMode ? Math.max(1, currentValues.aspectRatios.length) : 1;
  const imagesPerSchemeValue = Math.max(1, Math.round(Number(currentValues.imagesPerScheme || 1)));
  const plannedOutputCount = schemeCountValue * suiteSizeCount * imagesPerSchemeValue;

  useEffect(() => {
    if (suiteMode && Number(currentValues.schemeCount || 1) > 5) {
      void update("schemeCount", 5);
    }
  }, [suiteMode, currentValues.schemeCount]);

  const selectSuite = async (suite: DeliverySuite) => {
    const sizes = uniqueSizes(suite.sizes);
    if (suite.custom) {
      state.outputActiveCustomSuiteId = suite.id;
      setActiveCustomSuiteId(suite.id);
    }
    state.outputSelectionMode = "suite";
    setSelectionMode("suite");
    await updateMany({
      platformPresets: [suite.preset],
      aspectRatios: sizes.length > 0 ? sizes : [mode === "icon" ? "1:1" : "16:9"],
      customSize: null,
      selectionMode: "suite",
      planStrategy,
      schemeCount: Math.min(5, Math.max(1, Math.round(Number(form.getValues().schemeCount || defaults.schemeCount || 1)))),
    });
  };

  const selectSingleSize = async (ratio: string) => {
    if (isCustomSizeLabel(ratio)) {
      state.outputSelectionMode = "custom-size";
      setSelectionMode("custom-size");
      return;
    }

    state.outputSelectionMode = "single";
    setSelectionMode("single");
    await updateMany({
      platformPresets: ["custom"],
      aspectRatios: [ratio],
      customSize: null,
      selectionMode: "single",
      planStrategy,
    });
  };

  const applyCustomSize = async () => {
    const width = numericDimension(customWidth);
    const height = numericDimension(customHeight);
    if (!width || !height) return;

    state.outputSelectionMode = "custom-size";
    setSelectionMode("custom-size");
    await updateMany({
      platformPresets: ["custom"],
      aspectRatios: [`${width}x${height}`],
      customSize: { width, height },
      selectionMode: "custom-size",
      planStrategy,
    });
  };

  const persistCustomSuites = (nextSuites: CustomSuiteState[], activeId = activeCustomSuiteId) => {
    const safeSuites = nextSuites.map((suite) => ({
      ...suite,
      sizes: uniqueSizes(suite.sizes),
    }));
    const fallbackActiveId = activeId || safeSuites[0]?.id || "";
    const activeSuite = safeSuites.find((suite) => suite.id === fallbackActiveId) || safeSuites[0];
    state.outputCustomSuites = safeSuites;
    state.outputCustomSuiteEnabled = safeSuites.length > 0;
    state.outputActiveCustomSuiteId = activeSuite?.id || "";
    state.outputCustomSuiteSizes = activeSuite?.sizes || [];
    setCustomSuites(safeSuites);
    setActiveCustomSuiteId(activeSuite?.id || "");
    return activeSuite || null;
  };

  const applyCustomSuiteSizes = async (sizes: string[]) => {
    const nextSizes = sizes.length > 0 ? sizes : [mode === "icon" ? "1:1" : "16:9"];
    state.outputSelectionMode = "suite";
    setSelectionMode("suite");
    await updateMany({
      platformPresets: ["custom"],
      aspectRatios: nextSizes,
      customSize: null,
      selectionMode: "suite",
      planStrategy,
      schemeCount: Math.min(5, Math.max(1, Math.round(Number(form.getValues().schemeCount || defaults.schemeCount || 1)))),
    });
  };

  const addCustomSuiteSize = async (suiteId = activeCustomSuiteId) => {
    const width = numericDimension(suiteWidth);
    const height = numericDimension(suiteHeight);
    if (!width || !height) return;
    let nextSuites = customSuites;
    let targetId = suiteId || customSuites[0]?.id || "";
    if (!targetId) {
      const created = createCustomSuiteState(1);
      nextSuites = [created];
      targetId = created.id;
    }
    nextSuites = nextSuites.map((suite) => (
      suite.id === targetId
        ? { ...suite, sizes: uniqueSizes([...suite.sizes, `${width}x${height}`]) }
        : suite
    ));
    const activeSuite = persistCustomSuites(nextSuites, targetId);
    await applyCustomSuiteSizes(activeSuite?.sizes || []);
  };

  const updateCustomSuiteSize = async (suiteId: string, oldSize: string) => {
    const draftKey = `${suiteId}:${oldSize}`;
    const draft = sizeDrafts[draftKey] || splitExplicitSize(oldSize);
    const width = numericDimension(draft.width);
    const height = numericDimension(draft.height);
    if (!width || !height) return;
    const nextSize = `${width}x${height}`;
    const nextSuites = customSuites.map((suite) => (
      suite.id === suiteId
        ? { ...suite, sizes: uniqueSizes(suite.sizes.map((size) => (size === oldSize ? nextSize : size))) }
        : suite
    ));
    const activeSuite = persistCustomSuites(nextSuites, suiteId);
    await applyCustomSuiteSizes(activeSuite?.sizes || []);
    setSizeDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[draftKey];
      return nextDrafts;
    });
  };

  const removeCustomSuiteSize = async (suiteId: string, size: string) => {
    const nextSuites = customSuites.map((suite) => (
      suite.id === suiteId
        ? { ...suite, sizes: suite.sizes.filter((item) => item !== size) }
        : suite
    ));
    const activeSuite = persistCustomSuites(nextSuites, suiteId);
    await applyCustomSuiteSizes(activeSuite?.sizes || []);
  };

  const createCustomSuite = async () => {
    const created = createCustomSuiteState(customSuites.length + 1);
    const nextSuites = [...customSuites, created];
    persistCustomSuites(nextSuites, created.id);
    setSuiteManagerOpen(true);
    state.outputSuiteManagerOpen = true;
    await applyCustomSuiteSizes(created.sizes);
  };

  const deleteCustomSuite = async (suiteId = activeCustomSuiteId) => {
    const nextSuites = customSuites.filter((suite) => suite.id !== suiteId);
    const nextActive = nextSuites[0] || null;
    persistCustomSuites(nextSuites, nextActive?.id || "");
    if (nextActive) {
      await applyCustomSuiteSizes(nextActive.sizes);
      return;
    }
    state.outputSelectionMode = "single";
    setSelectionMode("single");
    await updateMany({
      platformPresets: ["custom"],
      aspectRatios: [mode === "icon" ? "1:1" : "16:9"],
      customSize: null,
      selectionMode: "single",
      planStrategy,
    });
  };

  const setStrategy = async (strategy: "unified" | "independent") => {
    state.outputPlanStrategy = strategy;
    setPlanStrategy(strategy);
    await update("planStrategy", strategy);
  };

  const closeSuiteManager = () => {
    state.outputSuiteManagerOpen = false;
    setSuiteManagerOpen(false);
  };

  const suiteManagerDialog = suiteManagerOpen && typeof document !== "undefined"
    ? createPortal(
      <>
        <div className="suite-manager-backdrop" aria-hidden="true" onClick={closeSuiteManager} />
        <div className="suite-manager-modal" role="dialog" aria-modal="true" aria-label="套装管理">
          <div className="suite-manager-modal-head">
            <strong>套装管理</strong>
            <button className="mini-ghost-button" type="button" onClick={closeSuiteManager}>
              关闭
            </button>
          </div>
          <SuiteManager
            suites={suites}
            activeSuiteId={activeCustomSuiteId}
            suiteWidth={suiteWidth}
            suiteHeight={suiteHeight}
            sizeDrafts={sizeDrafts}
            onSuiteWidth={setSuiteWidth}
            onSuiteHeight={setSuiteHeight}
            onAddCustomSize={addCustomSuiteSize}
            onRemoveCustomSize={removeCustomSuiteSize}
            onUpdateCustomSize={updateCustomSuiteSize}
            onDraftSize={(suiteId, size, patch) => setSizeDrafts((current) => ({
              ...current,
              [`${suiteId}:${size}`]: { ...splitExplicitSize(size), ...(current[`${suiteId}:${size}`] || {}), ...patch },
            }))}
            onSelectSuite={(suite) => void selectSuite(suite)}
            onCreateCustomSuite={() => void createCustomSuite()}
            onDeleteCustomSuite={(suiteId) => void deleteCustomSuite(suiteId)}
          />
        </div>
      </>,
      document.body,
    )
    : null;

  return (
    <div className="output-settings-rhf" data-rhf-output-settings>
      {suites.length > 0 ? (
        <>
          <div className="field-caption-row">
            <span className="field-caption">投放套装</span>
            <button
              className="mini-ghost-button"
              type="button"
              onClick={() => {
                const next = !suiteManagerOpen;
                state.outputSuiteManagerOpen = next;
                setSuiteManagerOpen(next);
              }}
            >
              {suiteManagerOpen ? "收起管理" : "套装管理"}
            </button>
          </div>
          <div className="platform-grid" aria-label="投放套装">
            {suites.map((suite) => {
              const active = suiteMode && (suite.custom
                ? activeCustomSuiteId === suite.id
                : currentValues.platformPresets.includes(suite.preset));
              return (
                <button
                  className={active ? "active" : ""}
                  type="button"
                  key={`${suite.id}:${suite.label}`}
                  onClick={() => void selectSuite(suite)}
                  aria-pressed={active}
                >
                  {suite.label}
                </button>
              );
            })}
          </div>

          {suiteMode ? (
            <div className="segmented suite-strategy-row" aria-label="方案策略">
              <button
                className={planStrategy === "unified" ? "active" : ""}
                type="button"
                onClick={() => void setStrategy("unified")}
              >
                统一方案
              </button>
              <button
                className={planStrategy === "independent" ? "active" : ""}
                type="button"
                onClick={() => void setStrategy("independent")}
              >
                独立方案
              </button>
            </div>
          ) : (
            <div className="single-output-note" role="status">
              单一尺寸输出中，方案策略不参与本次生成。
            </div>
          )}

          {suiteManagerDialog}
        </>
      ) : suiteEligible ? (
        <button className="suite-add-trigger" type="button" onClick={() => void createCustomSuite()}>
          <span aria-hidden="true">+</span>
          <strong>添加投放套装</strong>
        </button>
      ) : null}

      <span className="field-caption">尺寸选择</span>
      <div className={`size-grid ${mode === "icon" ? "single-size" : ""}`} aria-label="图片比例与尺寸">
        {visibleOutputSizes.map((item) => {
          const active = customSizeMode && isCustomSizeLabel(item)
            ? true
            : !suiteMode && currentValues.aspectRatios.includes(item);
          return (
            <button
              className={active ? "active" : ""}
              type="button"
              key={item}
              onClick={() => void selectSingleSize(item)}
              aria-pressed={active}
            >
              {item}
            </button>
          );
        })}
      </div>

      {customSizeMode ? (
        <div className="custom-size-panel">
          <strong>自定义尺寸</strong>
          <div className="custom-size-row">
            <input
              aria-label="自定义宽度"
              inputMode="numeric"
              value={customWidth}
              onChange={(event) => setCustomWidth(event.currentTarget.value)}
            />
            <span>×</span>
            <input
              aria-label="自定义高度"
              inputMode="numeric"
              value={customHeight}
              onChange={(event) => setCustomHeight(event.currentTarget.value)}
            />
            <button className="mini-solid-button" type="button" onClick={() => void applyCustomSize()}>
              应用
            </button>
          </div>
          <small>输出图片会以这里填写的宽高为准。</small>
        </div>
      ) : null}

      <div className="number-row">
        <span>每个方案出图</span>
        <div>
          {[1, 2, 3, 4].map((count) => (
            <button
              className={currentValues.imagesPerScheme === count ? "active" : ""}
              type="button"
              key={count}
              onClick={() => void update("imagesPerScheme", count)}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      <div className="number-row scheme-count-row">
        <span>{suiteMode ? "套装数量" : "方案数量"}</span>
        <strong>{schemeCountValue}</strong>
      </div>

      <input
        className="scheme-count-slider"
        type="range"
        min={1}
        max={schemeCountLimit}
        value={schemeCountValue}
        onChange={(event) => void update("schemeCount", Math.min(schemeCountLimit, Number(event.currentTarget.value)))}
        aria-label={suiteMode ? "套装数量" : "方案数量"}
      />

      {suiteMode ? (
        <p className="output-note">
          {planStrategy === "unified" ? "统一方案" : "独立方案"}：{schemeCountValue} 套 × {suiteSizeCount} 个尺寸 × 每方案 {imagesPerSchemeValue} 张，预计 {plannedOutputCount} 张图。
        </p>
      ) : null}

      {errors.aspectRatios ? <p className="form-error">{errors.aspectRatios.message}</p> : null}
      {errors.platformPresets ? <p className="form-error">{errors.platformPresets.message}</p> : null}
      <p className="output-note">{sizeNote}</p>
    </div>
  );
}

function SuiteManager({
  suites,
  activeSuiteId,
  suiteWidth,
  suiteHeight,
  sizeDrafts,
  onSuiteWidth,
  onSuiteHeight,
  onAddCustomSize,
  onRemoveCustomSize,
  onUpdateCustomSize,
  onDraftSize,
  onSelectSuite,
  onCreateCustomSuite,
  onDeleteCustomSuite,
}: {
  suites: DeliverySuite[];
  activeSuiteId: string;
  suiteWidth: string;
  suiteHeight: string;
  sizeDrafts: Record<string, { width: string; height: string }>;
  onSuiteWidth: (value: string) => void;
  onSuiteHeight: (value: string) => void;
  onAddCustomSize: (suiteId: string) => void;
  onRemoveCustomSize: (suiteId: string, size: string) => void;
  onUpdateCustomSize: (suiteId: string, size: string) => void;
  onDraftSize: (suiteId: string, size: string, patch: Partial<{ width: string; height: string }>) => void;
  onSelectSuite: (suite: DeliverySuite) => void;
  onCreateCustomSuite: () => void;
  onDeleteCustomSuite: (suiteId: string) => void;
}) {
  return (
    <div className="suite-manager-panel">
      <div className="suite-manager-head">
        <strong>套装管理</strong>
      </div>
      <div className="suite-manager-toolbar">
        <button className="mini-ghost-button" type="button" onClick={onCreateCustomSuite}>
          + 新增套装
        </button>
      </div>
      <div className="suite-list">
        {suites.map((suite) => (
          <article className={`suite-card ${activeSuiteId === suite.id ? "active-entry" : ""}`} key={`${suite.id}:${suite.label}`}>
            <button type="button" onClick={() => onSelectSuite(suite)}>
              <strong>{suite.label}</strong>
              <small>{suite.sizes.join(" / ") || "待添加尺寸"}</small>
            </button>
            {suite.custom ? (
              <div className="suite-size-editor">
                <button className="danger-text-button suite-delete-button" type="button" onClick={() => onDeleteCustomSuite(suite.id)}>
                  删除套装
                </button>
                {suite.sizes.length === 0 ? <small className="suite-empty-note">还没有尺寸</small> : null}
                {suite.sizes.map((size) => {
                  const draft = sizeDrafts[`${suite.id}:${size}`] || splitExplicitSize(size);
                  return (
                    <div className="suite-size-row" key={size}>
                      <input aria-label={`${size} 宽度`} inputMode="numeric" value={draft.width} onChange={(event) => onDraftSize(suite.id, size, { width: event.currentTarget.value })} />
                      <span>×</span>
                      <input aria-label={`${size} 高度`} inputMode="numeric" value={draft.height} onChange={(event) => onDraftSize(suite.id, size, { height: event.currentTarget.value })} />
                      <button type="button" onClick={() => onUpdateCustomSize(suite.id, size)}>保存</button>
                      <button type="button" onClick={() => onRemoveCustomSize(suite.id, size)}>删除</button>
                    </div>
                  );
                })}
                <div className="custom-size-row suite-inline-add-row">
                  <input aria-label={`${suite.label} 宽度`} inputMode="numeric" value={suiteWidth} onChange={(event) => onSuiteWidth(event.currentTarget.value)} />
                  <span>×</span>
                  <input aria-label={`${suite.label} 高度`} inputMode="numeric" value={suiteHeight} onChange={(event) => onSuiteHeight(event.currentTarget.value)} />
                  <button className="mini-solid-button" type="button" onClick={() => onAddCustomSize(suite.id)}>
                    添加
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
