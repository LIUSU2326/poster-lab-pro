"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState, type KeyboardEvent } from "react";
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
      ? "A hybrid cooking management and wilderness hunting game where chef teams gather rare ingredients for VIP guests."
      : parsed.gameDescription,
    focusGuidance: parsed.focusGuidance && looksLikeMojibake(parsed.focusGuidance)
      ? "Emphasize the chef squad, monster ingredients, restaurant operation, and adventure tone."
      : parsed.focusGuidance,
  };
}

function looksLikeMojibake(value: string | undefined): boolean {
  if (!value) return false;
  return /[锟絔鏉╅弰閻ㄦ稉閸氬缁涙禒瑜版い閹绘笟闂刔]/.test(value);
}

function splitGuidance(value: string | undefined): string[] {
  return String(value || "")
    .split(/[;；、\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function joinGuidance(items: string[]): string {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).join("\n");
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
  const [focusDraft, setFocusDraft] = useState("");

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

  const focusItems = splitGuidance(currentValues.focusGuidance);
  const showFocusEditor = currentValues.focusGuidanceEnabled || focusItems.length > 0;

  const setFocusItems = async (items: string[]) => {
    await update("focusGuidance", joinGuidance(items));
  };

  const addFocusDraft = async () => {
    const nextItem = focusDraft.trim();
    if (!nextItem) return;
    await setFocusItems([...focusItems, nextItem]);
    setFocusDraft("");
  };

  const handleFocusKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void addFocusDraft();
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

      <div className={`guidance-box ${currentValues.focusGuidanceEnabled ? "is-enabled" : "is-disabled"} ${showFocusEditor ? "" : "is-compact"}`}>
        <div>
          <strong>侧重点引导</strong>
          <button type="button" onClick={() => void toggleFocus()}>
            {currentValues.focusGuidanceEnabled ? "关闭" : "开启"}
          </button>
        </div>
        {showFocusEditor ? (
          <>
            <div className="inline-add-row">
              <input
                aria-label="添加侧重点"
                value={focusDraft}
                disabled={!currentValues.focusGuidanceEnabled}
                placeholder="输入侧重点，按回车添加"
                onChange={(event) => setFocusDraft(event.currentTarget.value)}
                onKeyDown={handleFocusKeyDown}
              />
              <button
                className="mini-solid-button"
                type="button"
                disabled={!currentValues.focusGuidanceEnabled || !focusDraft.trim()}
                onClick={() => void addFocusDraft()}
              >
                添加
              </button>
            </div>
            {focusItems.length > 0 ? (
              <div className="tag-list guidance-tag-list" aria-label="已添加侧重点">
                {focusItems.map((item) => (
                  <button
                    type="button"
                    key={item}
                    disabled={!currentValues.focusGuidanceEnabled}
                    onClick={() => void setFocusItems(focusItems.filter((focus) => focus !== item))}
                    title="点击移除"
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : (
              <small>添加后会写入方案生成提示词。</small>
            )}
          </>
        ) : (
          <small>未启用</small>
        )}
        {errors.focusGuidance?.message ? <small className="form-error">{errors.focusGuidance.message}</small> : null}
      </div>
    </div>
  );
}
