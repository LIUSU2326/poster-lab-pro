"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { replaceGenerationFormField } from "../generation-form-runtime.js";
import { ProjectBriefFormSchema, type ProductionMode, type ProjectBriefForm } from "../schema/zod";

type BriefSectionProps = {
  mode: ProductionMode;
  modeShort: string;
  revision: number;
  assetCount: number;
  initialValues: ProjectBriefForm;
};

function normalizeInitialValues(values: ProjectBriefForm): ProjectBriefForm {
  const parsed = ProjectBriefFormSchema.parse(values);
  return {
    ...parsed,
    gameDescription: looksLikeMojibake(parsed.gameDescription)
      ? "A cozy puzzle RPG launch batch focused on readable campaign art, store-ready crops, and consistent reward moments."
      : parsed.gameDescription,
    focusGuidance: parsed.focusGuidance && looksLikeMojibake(parsed.focusGuidance)
      ? "Keep variants close to food rewards, creature encounters, chef-team reactions, and restaurant-management moments."
      : parsed.focusGuidance,
  };
}

function looksLikeMojibake(value: string | undefined): boolean {
  if (!value) return false;
  return /[�]|[杩鏄鐨涓鍚妗绛浠褰椤鎻渚闄]/.test(value);
}

export function BriefSection({ modeShort, revision, assetCount, initialValues }: BriefSectionProps) {
  const defaults = useMemo(() => normalizeInitialValues(initialValues), [initialValues]);
  const form = useForm<ProjectBriefForm>({
    resolver: zodResolver(ProjectBriefFormSchema) as Resolver<ProjectBriefForm>,
    defaultValues: defaults,
    mode: "onChange",
  });
  const values = useWatch({ control: form.control }) as ProjectBriefForm;
  const errors = form.formState.errors;
  const currentValues = {
    ...defaults,
    ...values,
  };

  const commit = async (nextValues: ProjectBriefForm) => {
    const parsed = ProjectBriefFormSchema.safeParse(nextValues);
    if (!parsed.success) return;
    replaceGenerationFormField("projectBrief", parsed.data);
  };

  const update = async <TKey extends keyof ProjectBriefForm>(key: TKey, value: ProjectBriefForm[TKey]) => {
    const nextValues = {
      ...form.getValues(),
      [key]: value,
    } as ProjectBriefForm;
    form.setValue(key, value as never, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    await commit(nextValues);
  };

  const toggleFocus = async () => {
    await update("focusGuidanceEnabled", !currentValues.focusGuidanceEnabled);
  };

  return (
    <div className="brief-section-rhf" data-rhf-brief-section>
      <label className="brief-field">
        <span>项目名称</span>
        <input
          aria-label="项目名称"
          value={currentValues.projectName}
          onChange={(event) => void update("projectName", event.currentTarget.value)}
        />
        {errors.projectName?.message ? <small className="form-error">{errors.projectName.message}</small> : null}
      </label>

      <div className="brief-meta-line">
        <span>{modeShort}</span>
        <small>版本 {revision} / {assetCount} 个素材</small>
      </div>

      <label className="brief-field">
        <span>项目描述</span>
        <textarea
          aria-label="项目描述"
          value={currentValues.gameDescription}
          onChange={(event) => void update("gameDescription", event.currentTarget.value)}
        />
        {errors.gameDescription?.message ? <small className="form-error">{errors.gameDescription.message}</small> : null}
      </label>

      <div className={`guidance-box ${currentValues.focusGuidanceEnabled ? "is-enabled" : "is-disabled"}`}>
        <div>
          <strong>侧重点引导</strong>
          <button type="button" onClick={() => void toggleFocus()}>
            {currentValues.focusGuidanceEnabled ? "开启" : "关闭"}
          </button>
        </div>
        <input
          aria-label="侧重点引导"
          value={currentValues.focusGuidance || ""}
          disabled={!currentValues.focusGuidanceEnabled}
          onChange={(event) => void update("focusGuidance", event.currentTarget.value)}
        />
        {errors.focusGuidance?.message ? <small className="form-error">{errors.focusGuidance.message}</small> : null}
      </div>
    </div>
  );
}
