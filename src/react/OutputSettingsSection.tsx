"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { replaceGenerationFormField } from "../generation-form-runtime.js";
import { OutputSettingsFormSchema, type OutputSettingsForm, type ProductionMode } from "../schema/zod";

type PlatformPreset = OutputSettingsForm["platformPresets"][number];

const platformPresetsByMode: Record<ProductionMode, PlatformPreset[]> = {
  poster: [],
  collab: [],
  announcement: ["tapTap", "googlePlay"],
  logo: ["custom"],
  icon: ["appStore", "googlePlay"],
};

const platformLabels: Partial<Record<PlatformPreset, string>> = {
  steam: "Steam",
  appStore: "App Store",
  googlePlay: "Google Play",
  tapTap: "TapTap",
  custom: "Custom",
};

type OutputSettingsSectionProps = {
  mode: ProductionMode;
  initialValues: OutputSettingsForm;
  outputSizes: string[];
  sizeNote: string;
};

function normalizeInitialValues(mode: ProductionMode, values: OutputSettingsForm): OutputSettingsForm {
  return OutputSettingsFormSchema.parse({
    ...values,
    mode,
    aspectRatios: mode === "icon" ? ["1:1"] : values.aspectRatios,
  });
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

  const togglePlatform = async (preset: PlatformPreset) => {
    const current = form.getValues("platformPresets");
    const next = current.includes(preset) ? current.filter((item) => item !== preset) : [...current, preset];
    await update("platformPresets", next.length > 0 ? next : [preset]);
  };

  const toggleRatio = async (ratio: string) => {
    if (mode === "icon") {
      await update("aspectRatios", ["1:1"]);
      return;
    }
    const current = form.getValues("aspectRatios");
    const next = current.includes(ratio) ? current.filter((item) => item !== ratio) : [...current, ratio];
    await update("aspectRatios", next.length > 0 ? next : [ratio]);
  };

  const currentValues = {
    ...defaults,
    ...values,
  };
  const platformOptions = platformPresetsByMode[mode] || ["custom"];

  return (
    <div className="output-settings-rhf" data-rhf-output-settings>
      {platformOptions.length > 0 ? (
        <div className="platform-grid" aria-label="Platform presets">
          {platformOptions.map((preset) => (
            <button
              className={currentValues.platformPresets.includes(preset) ? "active" : ""}
              type="button"
              key={preset}
              onClick={() => void togglePlatform(preset)}
            >
              {platformLabels[preset] || preset}
            </button>
          ))}
        </div>
      ) : null}

      <div className={`size-grid ${mode === "icon" ? "single-size" : ""}`} aria-label="Image ratios and sizes">
        {outputSizes.map((item) => (
          <button
            className={currentValues.aspectRatios.includes(item) ? "active" : ""}
            type="button"
            key={item}
            onClick={() => void toggleRatio(item)}
            aria-pressed={currentValues.aspectRatios.includes(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {mode === "logo" ? (
        <div className="mode-field-grid solid-bg-grid" aria-label="Logo background">
          <button className="active" type="button">White</button>
          <button type="button">Black</button>
          <button type="button">Green</button>
          <button type="button">Custom</button>
        </div>
      ) : null}

      <div className="segmented" aria-label="Crop strategy">
        <button className="active" type="button">{mode === "icon" ? "Locked square" : "Unified system"}</button>
        <button type="button" disabled={mode === "icon"}>{mode === "icon" ? "No resize" : "Per-output crop"}</button>
      </div>

      <div className="number-row">
        <span>Images per scheme</span>
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

      <label className="slider-row">
        <span>Scheme count <b>{currentValues.schemeCount}</b></span>
        <input
          type="range"
          min={1}
          max={20}
          value={currentValues.schemeCount}
          onChange={(event) => void update("schemeCount", Number(event.currentTarget.value))}
        />
      </label>

      {errors.aspectRatios?.message ? <p className="form-error">{errors.aspectRatios.message}</p> : null}
      {errors.platformPresets?.message ? <p className="form-error">{errors.platformPresets.message}</p> : null}
      <p className="output-note">{sizeNote}</p>
    </div>
  );
}
