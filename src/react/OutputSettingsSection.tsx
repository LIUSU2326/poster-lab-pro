"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { replaceGenerationFormField } from "../generation-form-runtime.js";
import { state } from "../state.js";
import { OutputSettingsFormSchema, type OutputSettingsForm, type ProductionMode } from "../schema/zod";

type PlatformPreset = OutputSettingsForm["platformPresets"][number];

type DeliverySuite = {
  id: PlatformPreset;
  label: string;
  sizes: string[];
  custom?: boolean;
};

type OutputSettingsSectionProps = {
  mode: ProductionMode;
  initialValues: OutputSettingsForm;
  outputSizes: string[];
  sizeNote: string;
};

const deliverySuitesByMode: Record<ProductionMode, DeliverySuite[]> = {
  poster: [
    { id: "tiktok", label: "TikTok 竖版", sizes: ["9:16", "1080x1920"] },
    { id: "metaAds", label: "Meta 广告", sizes: ["1:1", "4:3", "9:16", "1200x627"] },
    { id: "googlePlay", label: "Google Play", sizes: ["16:9", "1:1", "1024x500"] },
    { id: "appStore", label: "App Store", sizes: ["1:1", "4:3", "9:16"] },
  ],
  collab: [
    { id: "metaAds", label: "Meta 广告", sizes: ["1:1", "4:3", "9:16", "1200x627"] },
    { id: "tiktok", label: "TikTok 竖版", sizes: ["9:16", "1080x1920"] },
    { id: "googlePlay", label: "Google Play", sizes: ["16:9", "1:1"] },
  ],
  announcement: [
    { id: "tapTap", label: "TapTap", sizes: ["16:9", "1:1"] },
    { id: "googlePlay", label: "Google Play", sizes: ["16:9", "1:1", "1024x500"] },
  ],
  logo: [{ id: "custom", label: "标识套装", sizes: ["1:1", "4:3"], custom: true }],
  icon: [
    { id: "appStore", label: "App Store", sizes: ["1:1"] },
    { id: "googlePlay", label: "Google Play", sizes: ["1:1"] },
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
  if (singleDefaultModes.has(mode) && (carriesOldSuitePreset || carriesCustomSuiteState)) {
    return {
      ...parsed,
      platformPresets: ["custom"],
      aspectRatios: ["16:9"],
      customSize: null,
    };
  }
  return parsed;
}

function selectionModeForValues(values: OutputSettingsForm): "suite" | "single" | "custom-size" {
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
  return sizes.length > 0 ? sizes : ["1080x1920", "1200x627"];
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
  const [customSuite, setCustomSuite] = useState(customSuiteSizes());
  const [customSuiteEnabled, setCustomSuiteEnabled] = useState(state.outputCustomSuiteEnabled !== false);
  const [sizeDrafts, setSizeDrafts] = useState<Record<string, { width: string; height: string }>>({});
  const [selectionMode, setSelectionMode] = useState(initialSelectionMode);
  const [planStrategy, setPlanStrategy] = useState(state.outputPlanStrategy || "unified");

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
  const customDeliverySuite: DeliverySuite = { id: "custom", label: "自定义套装", sizes: customSuite, custom: true };
  const suites = [
    ...(deliverySuitesByMode[mode] || deliverySuitesByMode.poster),
    ...(mode !== "logo" && customSuiteEnabled ? [customDeliverySuite] : []),
  ];
  const suiteMode = selectionMode === "suite";
  const customSizeMode = selectionMode === "custom-size";
  const visibleOutputSizes = outputSizes.map(normalizeOutputSizeLabel);

  const selectSuite = async (suite: DeliverySuite) => {
    const sizes = uniqueSizes(suite.sizes.length > 0 ? suite.sizes : customSuite);
    state.outputSelectionMode = "suite";
    setSelectionMode("suite");
    await updateMany({
      platformPresets: [suite.id],
      aspectRatios: sizes.length > 0 ? sizes : ["1:1"],
      customSize: null,
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
    });
  };

  const addCustomSuiteSize = () => {
    const width = numericDimension(suiteWidth);
    const height = numericDimension(suiteHeight);
    if (!width || !height) return;
    const next = uniqueSizes([...customSuite, `${width}x${height}`]);
    state.outputCustomSuiteEnabled = true;
    state.outputCustomSuiteSizes = next;
    setCustomSuiteEnabled(true);
    setCustomSuite(next);
  };

  const updateCustomSuiteSize = (oldSize: string) => {
    const draft = sizeDrafts[oldSize] || splitExplicitSize(oldSize);
    const width = numericDimension(draft.width);
    const height = numericDimension(draft.height);
    if (!width || !height) return;
    const nextSize = `${width}x${height}`;
    const next = uniqueSizes(customSuite.map((size) => (size === oldSize ? nextSize : size)));
    state.outputCustomSuiteSizes = next;
    setCustomSuite(next);
    setSizeDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[oldSize];
      return nextDrafts;
    });
  };

  const removeCustomSuiteSize = (size: string) => {
    const next = customSuite.filter((item) => item !== size);
    state.outputCustomSuiteSizes = next;
    setCustomSuite(next);
  };

  const createCustomSuite = () => {
    const next = customSuite.length > 0 ? customSuite : ["1080x1920", "1200x627"];
    state.outputCustomSuiteEnabled = true;
    state.outputCustomSuiteSizes = next;
    setCustomSuiteEnabled(true);
    setCustomSuite(next);
    setSuiteManagerOpen(true);
    state.outputSuiteManagerOpen = true;
  };

  const deleteCustomSuite = async () => {
    state.outputCustomSuiteEnabled = false;
    state.outputCustomSuiteSizes = [];
    setCustomSuiteEnabled(false);
    setCustomSuite([]);
    const fallbackSuite = (deliverySuitesByMode[mode] || deliverySuitesByMode.poster)[0];
    if (currentValues.platformPresets.includes("custom") && fallbackSuite) {
      await selectSuite(fallbackSuite);
    }
  };

  const setStrategy = (strategy: "unified" | "independent") => {
    state.outputPlanStrategy = strategy;
    setPlanStrategy(strategy);
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
            customSuiteEnabled={customSuiteEnabled}
            customSuite={customSuite}
            suiteWidth={suiteWidth}
            suiteHeight={suiteHeight}
            sizeDrafts={sizeDrafts}
            onSuiteWidth={setSuiteWidth}
            onSuiteHeight={setSuiteHeight}
            onAddCustomSize={addCustomSuiteSize}
            onRemoveCustomSize={removeCustomSuiteSize}
            onUpdateCustomSize={updateCustomSuiteSize}
            onDraftSize={(size, patch) => setSizeDrafts((current) => ({
              ...current,
              [size]: { ...splitExplicitSize(size), ...(current[size] || {}), ...patch },
            }))}
            onSelectSuite={(suite) => void selectSuite(suite)}
            onCreateCustomSuite={createCustomSuite}
            onDeleteCustomSuite={() => void deleteCustomSuite()}
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
              const active = suiteMode && currentValues.platformPresets.includes(suite.id);
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
                onClick={() => setStrategy("unified")}
              >
                {mode === "icon" ? "锁定方形" : "统一方案"}
              </button>
              <button
                className={planStrategy === "independent" ? "active" : ""}
                type="button"
                disabled={mode === "icon"}
                onClick={() => setStrategy("independent")}
              >
                {mode === "icon" ? "不改尺寸" : "独立方案"}
              </button>
            </div>
          ) : (
            <div className="single-output-note" role="status">
              单一尺寸输出中，方案策略不参与本次生成。
            </div>
          )}

          {suiteManagerDialog}
        </>
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

      {mode === "logo" ? (
        <div className="mode-field-grid solid-bg-grid" aria-label="标识背景">
          <button className="active" type="button">白底</button>
          <button type="button">黑底</button>
          <button type="button">绿幕</button>
          <button type="button">自定义</button>
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
        <span>方案数量</span>
        <strong>{currentValues.schemeCount}</strong>
      </div>

      <input
        className="scheme-count-slider"
        type="range"
        min={1}
        max={20}
        value={currentValues.schemeCount}
        onChange={(event) => void update("schemeCount", Number(event.currentTarget.value))}
        aria-label="方案数量"
      />

      {errors.aspectRatios ? <p className="form-error">{errors.aspectRatios.message}</p> : null}
      {errors.platformPresets ? <p className="form-error">{errors.platformPresets.message}</p> : null}
      <p className="output-note">{sizeNote}</p>
    </div>
  );
}

function SuiteManager({
  suites,
  customSuiteEnabled,
  customSuite,
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
  customSuiteEnabled: boolean;
  customSuite: string[];
  suiteWidth: string;
  suiteHeight: string;
  sizeDrafts: Record<string, { width: string; height: string }>;
  onSuiteWidth: (value: string) => void;
  onSuiteHeight: (value: string) => void;
  onAddCustomSize: () => void;
  onRemoveCustomSize: (size: string) => void;
  onUpdateCustomSize: (size: string) => void;
  onDraftSize: (size: string, patch: Partial<{ width: string; height: string }>) => void;
  onSelectSuite: (suite: DeliverySuite) => void;
  onCreateCustomSuite: () => void;
  onDeleteCustomSuite: () => void;
}) {
  return (
    <div className="suite-manager-panel">
      <div className="suite-manager-head">
        <strong>套装管理</strong>
        <small>查看、选择并编辑自定义套装尺寸</small>
      </div>
      <div className="suite-manager-toolbar">
        <button className="mini-ghost-button" type="button" onClick={onCreateCustomSuite}>
          新增自定义套装
        </button>
        <button className="danger-text-button" type="button" onClick={onDeleteCustomSuite} disabled={!customSuiteEnabled}>
          删除自定义套装
        </button>
      </div>
      <div className="suite-list">
        {suites.map((suite) => (
          <article className="suite-card" key={`${suite.id}:${suite.label}`}>
            <button type="button" onClick={() => onSelectSuite(suite)}>
              <strong>{suite.label}</strong>
              <small>{suite.sizes.join(" / ") || "待添加尺寸"}</small>
            </button>
            {suite.custom ? (
              <div className="suite-size-editor">
                {customSuite.length === 0 ? <small>这个自定义套装还没有尺寸。</small> : null}
                {customSuite.map((size) => {
                  const draft = sizeDrafts[size] || splitExplicitSize(size);
                  return (
                    <div className="suite-size-row" key={size}>
                      <input aria-label={`${size} 宽度`} inputMode="numeric" value={draft.width} onChange={(event) => onDraftSize(size, { width: event.currentTarget.value })} />
                      <span>×</span>
                      <input aria-label={`${size} 高度`} inputMode="numeric" value={draft.height} onChange={(event) => onDraftSize(size, { height: event.currentTarget.value })} />
                      <button type="button" onClick={() => onUpdateCustomSize(size)}>保存</button>
                      <button type="button" onClick={() => onRemoveCustomSize(size)}>删除</button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </article>
        ))}
      </div>
      <div className="custom-size-panel">
        <strong>添加套装尺寸</strong>
        <div className="custom-size-row">
          <input aria-label="套装宽度" inputMode="numeric" value={suiteWidth} onChange={(event) => onSuiteWidth(event.currentTarget.value)} />
          <span>×</span>
          <input aria-label="套装高度" inputMode="numeric" value={suiteHeight} onChange={(event) => onSuiteHeight(event.currentTarget.value)} />
          <button className="mini-solid-button" type="button" onClick={onAddCustomSize}>
            添加
          </button>
        </div>
      </div>
    </div>
  );
}
