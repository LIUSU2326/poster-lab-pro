"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { replaceGenerationFormField } from "../generation-form-runtime.js";
import { state } from "../state.js";
import { OutputSettingsFormSchema, type OutputSettingsForm, type ProductionMode } from "../schema/zod";

type PlatformPreset = OutputSettingsForm["platformPresets"][number];

type DeliverySuite = {
  id: PlatformPreset;
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
    { id: "tiktok", label: "TikTok 竖版", sizes: ["9:16", "1080x1920"] },
    { id: "metaAds", label: "Meta 广告", sizes: ["1:1", "4:3", "9:16", "1200x627"] },
    { id: "googlePlay", label: "Google Play", sizes: ["16:9", "1:1", "1024x500"] },
    { id: "appStore", label: "App Store", sizes: ["1:1", "4:3", "9:16"] },
    { id: "custom", label: "自定义套装", sizes: [] },
  ],
  collab: [
    { id: "metaAds", label: "Meta 广告", sizes: ["1:1", "4:3", "9:16", "1200x627"] },
    { id: "tiktok", label: "TikTok 竖版", sizes: ["9:16", "1080x1920"] },
    { id: "googlePlay", label: "Google Play", sizes: ["16:9", "1:1"] },
    { id: "custom", label: "自定义套装", sizes: [] },
  ],
  announcement: [
    { id: "tapTap", label: "TapTap", sizes: ["16:9", "1:1"] },
    { id: "googlePlay", label: "Google Play", sizes: ["16:9", "1:1", "1024x500"] },
    { id: "custom", label: "自定义套装", sizes: [] },
  ],
  logo: [{ id: "custom", label: "自定义套装", sizes: ["1:1", "4:3"] }],
  icon: [
    { id: "appStore", label: "App Store", sizes: ["1:1"] },
    { id: "googlePlay", label: "Google Play", sizes: ["1:1"] },
  ],
};

function normalizeInitialValues(mode: ProductionMode, values: OutputSettingsForm): OutputSettingsForm {
  return OutputSettingsFormSchema.parse({
    ...values,
    mode,
    aspectRatios: mode === "icon" ? ["1:1"] : values.aspectRatios,
  });
}

function uniqueSizes(sizes: string[]): string[] {
  return Array.from(new Set(sizes.filter(Boolean)));
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

export function OutputSettingsSection({ mode, initialValues, outputSizes, sizeNote }: OutputSettingsSectionProps) {
  const defaults = useMemo(() => normalizeInitialValues(mode, initialValues), [mode, initialValues]);
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
  const [planStrategy, setPlanStrategy] = useState(state.outputPlanStrategy || "unified");

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

  const suites = (deliverySuitesByMode[mode] || deliverySuitesByMode.poster).map((suite) =>
    suite.id === "custom" ? { ...suite, sizes: customSuite } : suite,
  );
  const currentValues = {
    ...defaults,
    ...values,
  };
  const outputSelectionMode = state.outputSelectionMode || "suite";
  const suiteMode = outputSelectionMode === "suite";
  const customSizeMode = outputSelectionMode === "custom-size";

  const selectSuite = async (suite: DeliverySuite) => {
    const sizes = uniqueSizes(suite.sizes.length > 0 ? suite.sizes : customSuite);
    state.outputSelectionMode = "suite";
    await updateMany({
      platformPresets: [suite.id],
      aspectRatios: sizes.length > 0 ? sizes : ["1:1"],
      customSize: null,
    });
  };

  const selectSingleSize = async (ratio: string) => {
    if (ratio === "自定义") {
      state.outputSelectionMode = "custom-size";
      return;
    }

    state.outputSelectionMode = "single";
    await updateMany({
      platformPresets: ["custom"],
      aspectRatios: [ratio],
      customSize: null,
    });
  };

  const enableSingleSizeMode = async () => {
    const firstSize = visibleOutputSizes.find((item) => item !== "自定义") || "1:1";
    state.outputSelectionMode = "single";
    await updateMany({
      platformPresets: ["custom"],
      aspectRatios: [firstSize],
      customSize: null,
    });
  };

  const applyCustomSize = async () => {
    const width = numericDimension(customWidth);
    const height = numericDimension(customHeight);
    if (!width || !height) return;

    state.outputSelectionMode = "custom-size";
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
    state.outputCustomSuiteSizes = next;
    setCustomSuite(next);
  };

  const removeCustomSuiteSize = (size: string) => {
    const next = customSuite.filter((item) => item !== size);
    state.outputCustomSuiteSizes = next.length > 0 ? next : ["1080x1920"];
    setCustomSuite(state.outputCustomSuiteSizes);
  };

  const setStrategy = (strategy: "unified" | "independent") => {
    state.outputPlanStrategy = strategy;
    setPlanStrategy(strategy);
  };

  const visibleOutputSizes = outputSizes.map((item) => (item === "多尺寸套装" ? "自定义" : item));

  return (
    <div className="output-settings-rhf" data-rhf-output-settings>
      {suites.length > 0 ? (
        <>
          <span className="field-caption">投放套装</span>
          <div className="platform-grid" aria-label="投放套装">
            {suites.map((suite) => {
              const active = suiteMode && currentValues.platformPresets.includes(suite.id);
              return (
                <button
                  className={active ? "active" : ""}
                  type="button"
                  key={suite.id}
                  onClick={() => void selectSuite(suite)}
                  aria-pressed={active}
                >
                  {suite.label}
                </button>
              );
            })}
          </div>
          {suiteManagerOpen ? (
            <SuiteManager
              suites={suites}
              customSuite={customSuite}
              suiteWidth={suiteWidth}
              suiteHeight={suiteHeight}
              onSuiteWidth={setSuiteWidth}
              onSuiteHeight={setSuiteHeight}
              onAddCustomSize={addCustomSuiteSize}
              onRemoveCustomSize={removeCustomSuiteSize}
              onSelectSuite={(suite) => void selectSuite(suite)}
            />
          ) : null}
        </>
      ) : null}

      <span className="field-caption">尺寸选择</span>
      <div className={`size-grid ${mode === "icon" ? "single-size" : ""}`} aria-label="图片比例与尺寸">
        {visibleOutputSizes.map((item) => {
          const active = customSizeMode && item === "自定义"
            ? true
            : !suiteMode && currentValues.aspectRatios.includes(item);
          return (
            <button
              className={active ? "active" : ""}
              type="button"
              key={item}
              onClick={() => void selectSingleSize(item)}
              aria-pressed={active}
              disabled={suiteMode && mode !== "icon"}
              title={suiteMode && mode !== "icon" ? "已选择投放套装，单一尺寸暂不可选" : undefined}
            >
              {item}
            </button>
          );
        })}
      </div>

      {suiteMode && mode !== "icon" ? (
        <button className="switch-size-mode" type="button" onClick={() => void enableSingleSizeMode()}>
          改用单一尺寸
        </button>
      ) : null}

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

      <div className="segmented" aria-label="方案策略">
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
  customSuite,
  suiteWidth,
  suiteHeight,
  onSuiteWidth,
  onSuiteHeight,
  onAddCustomSize,
  onRemoveCustomSize,
  onSelectSuite,
}: {
  suites: DeliverySuite[];
  customSuite: string[];
  suiteWidth: string;
  suiteHeight: string;
  onSuiteWidth: (value: string) => void;
  onSuiteHeight: (value: string) => void;
  onAddCustomSize: () => void;
  onRemoveCustomSize: (size: string) => void;
  onSelectSuite: (suite: DeliverySuite) => void;
}) {
  return (
    <div className="suite-manager-panel">
      <div className="suite-manager-head">
        <strong>套装管理</strong>
        <small>查看每个套装包含的尺寸</small>
      </div>
      <div className="suite-list">
        {suites.map((suite) => (
          <article className="suite-card" key={suite.id}>
            <button type="button" onClick={() => onSelectSuite(suite)}>
              <strong>{suite.label}</strong>
              <small>{suite.sizes.join(" / ") || "待添加尺寸"}</small>
            </button>
            {suite.id === "custom" ? (
              <div className="custom-suite-tags">
                {customSuite.map((size) => (
                  <button type="button" key={size} onClick={() => onRemoveCustomSize(size)} title="删除这个尺寸">
                    {size}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
      <div className="custom-size-panel">
        <strong>自定义套装尺寸</strong>
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
