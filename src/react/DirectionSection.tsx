"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { replaceGenerationFormField } from "../generation-form-runtime.js";
import { ModeFormSchema, type ModeForm, type ProductionMode } from "../schema/zod";

type DirectionSectionProps = {
  mode: ProductionMode;
  initialValues: ModeForm;
  styles: string[];
  directionTitle: string;
  directionHelper: string;
};

function normalizeInitialValues(values: ModeForm): ModeForm {
  return ModeFormSchema.parse(values);
}

export function DirectionSection({ mode, initialValues, styles, directionTitle, directionHelper }: DirectionSectionProps) {
  const defaults = useMemo(() => normalizeInitialValues(initialValues), [initialValues]);
  const form = useForm<ModeForm>({
    resolver: zodResolver(ModeFormSchema) as Resolver<ModeForm>,
    defaultValues: defaults,
    mode: "onChange",
  });
  const values = useWatch({ control: form.control }) as ModeForm;
  const currentValues = {
    ...defaults,
    ...values,
  } as ModeForm;

  const commit = async (nextValues: ModeForm) => {
    const parsed = ModeFormSchema.safeParse(nextValues);
    if (!parsed.success) return;
    replaceGenerationFormField("modeForm", parsed.data);
  };

  if (mode === "announcement" && currentValues.mode === "announcement") {
    const presets = ["Maintenance", "Version update", "Limited gift"];

    return (
      <div className="direction-section-rhf" data-rhf-direction-section>
        <div className="preset-groups">
          <div>
            <strong>Notice type</strong>
            <span>
              {presets.map((preset) => (
                <button
                  className={currentValues.copyPreset === preset ? "active" : ""}
                  type="button"
                  key={preset}
                  onClick={() => {
                    const nextValues = { ...currentValues, copyPreset: preset };
                    form.setValue("copyPreset", preset, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                    void commit(nextValues);
                  }}
                >
                  {preset}
                </button>
              ))}
            </span>
          </div>
          <div>
            <strong>Layout</strong>
            <span>
              <button
                className={currentValues.layoutMode === "integratedTypography" ? "active" : ""}
                type="button"
                onClick={() => {
                  const nextValues = { ...currentValues, layoutMode: "integratedTypography" as const };
                  form.setValue("layoutMode", "integratedTypography", { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                  void commit(nextValues);
                }}
              >
                Integrated type
              </button>
              <button
                className={currentValues.layoutMode === "regularPanel" ? "active" : ""}
                type="button"
                onClick={() => {
                  const nextValues = { ...currentValues, layoutMode: "regularPanel" as const };
                  form.setValue("layoutMode", "regularPanel", { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                  void commit(nextValues);
                }}
              >
                Panel notice
              </button>
            </span>
          </div>
        </div>
        <div className="mode-lock-note">
          <strong>{directionTitle}</strong>
          <small>{directionHelper}</small>
        </div>
      </div>
    );
  }

  if (mode === "collab" && currentValues.mode === "collab") {
    return (
      <div className="direction-section-rhf" data-rhf-direction-section>
        <div className="segmented">
          {(["native", "brand", "game"] as const).map((value) => (
            <button
              className={currentValues.collabStyleInjection === value ? "active" : ""}
              type="button"
              key={value}
              onClick={() => {
                const nextValues = { ...currentValues, collabStyleInjection: value };
                form.setValue("collabStyleInjection", value, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                void commit(nextValues);
              }}
            >
              {value === "native" ? "Native" : value === "brand" ? "Brand" : "Game"}
            </button>
          ))}
        </div>
        <div className="mode-lock-note">
          <strong>{directionTitle}</strong>
          <small>{directionHelper}</small>
        </div>
      </div>
    );
  }

  if (mode === "icon" && currentValues.mode === "icon") {
    return (
      <div className="direction-section-rhf" data-rhf-direction-section>
        <div className="guardrail-chips">
          <span>1:1 locked</span>
          <span>No text</span>
          <span>Full bleed</span>
        </div>
        <label className="direction-toggle">
          <input
            type="checkbox"
            checked={currentValues.compositionReferenceRotation}
            onChange={(event) => {
              const nextValues = { ...currentValues, compositionReferenceRotation: event.currentTarget.checked };
              form.setValue("compositionReferenceRotation", event.currentTarget.checked, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
              void commit(nextValues);
            }}
          />
          <span>Rotate composition references</span>
        </label>
        <div className="mode-lock-note">
          <strong>{directionTitle}</strong>
          <small>{directionHelper}</small>
        </div>
      </div>
    );
  }

  if (mode === "poster" && currentValues.mode === "poster") {
    const activeTags = currentValues.styleTags;
    return (
      <div className="direction-section-rhf" data-rhf-direction-section>
        <input className="search-input" value={`Search ${styles.length}+ directions...`} aria-label="Search visual direction" readOnly />
        <div className="chip-grid">
          {styles.map((chip, index) => (
            <button
              className={activeTags.includes(chip) || (activeTags.length === 0 && index === 0) ? "active" : ""}
              type="button"
              key={chip}
              onClick={() => {
                const nextTags = activeTags.includes(chip) ? activeTags.filter((item) => item !== chip) : [...activeTags, chip];
                const nextValues = { ...currentValues, styleTags: nextTags.length > 0 ? nextTags : [chip] };
                form.setValue("styleTags", nextValues.styleTags, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                void commit(nextValues);
              }}
            >
              {chip}
            </button>
          ))}
        </div>
        <div className="mode-lock-note">
          <strong>{directionTitle}</strong>
          <small>{directionHelper}</small>
        </div>
      </div>
    );
  }

  return (
    <div className="direction-section-rhf" data-rhf-direction-section>
      <div className="mode-lock-note">
        <strong>{directionTitle}</strong>
        <small>{directionHelper}</small>
      </div>
    </div>
  );
}
