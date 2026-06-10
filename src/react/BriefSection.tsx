"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { replaceGenerationFormField } from "../generation-form-runtime.js";
import { getRuntimeWorkspaceSnapshot, state } from "../state.js";
import { ProjectBriefFormSchema, type ProductionMode, type ProjectBriefForm } from "../schema/zod";
import type { WorkbenchRenderOptions } from "./mount-workbench-sections";

type BriefSectionProps = {
  mode: ProductionMode;
  modeShort: string;
  revision: number;
  assetCount: number;
  initialValues: ProjectBriefForm;
  onRequestRender?: ((options?: WorkbenchRenderOptions) => void) | undefined;
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
  return /[閿熺禂閺夆晠寮伴柣銊︾▔闁告艾顩肩紒娑欑鐟滅増銇勯柟缁樼瑹闂傚垟]/.test(value);
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

export function BriefSection({ initialValues, onRequestRender }: BriefSectionProps) {
  const defaults = useMemo(() => normalizeInitialValues(initialValues), [initialValues]);
  const saveFeedbackTimerRef = useRef<number | null>(null);
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
  const [saveFeedbackVisible, setSaveFeedbackVisible] = useState(false);

  useEffect(() => () => {
    if (saveFeedbackTimerRef.current !== null) window.clearTimeout(saveFeedbackTimerRef.current);
  }, []);

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

  const saveProjectToLibrary = () => {
    const snapshot = getRuntimeWorkspaceSnapshot();
    const name = String(currentValues.projectName || snapshot.project?.name || "").trim() || "\u672a\u547d\u540d\u9879\u76ee";
    const description = String(currentValues.gameDescription || snapshot.project?.description || "").trim();
    const draft = {
      id: state.projectLibraryActiveEntryId || `project-${Date.now().toString(36)}`,
      name,
      description,
      updatedAt: new Date().toISOString(),
    };
    const entries = Array.isArray(state.projectLibraryEntries) ? [...state.projectLibraryEntries] : [];
    const existingIndex = entries.findIndex((entry) => entry.id === draft.id);
    if (existingIndex >= 0) entries[existingIndex] = draft;
    else entries.unshift(draft);

    state.projectLibraryEntries = entries.slice(0, 24);
    state.projectLibraryActiveEntryId = draft.id;
    state.projectLibraryMessage = "\u5f53\u524d\u9879\u76ee\u540d\u79f0\u548c\u63cf\u8ff0\u5df2\u4fdd\u5b58\u3002";
    setSaveFeedbackVisible(true);
    if (saveFeedbackTimerRef.current !== null) window.clearTimeout(saveFeedbackTimerRef.current);
    saveFeedbackTimerRef.current = window.setTimeout(() => setSaveFeedbackVisible(false), 1200);
    if (state.view === "project-library") onRequestRender?.();
  };

  const handleProjectSave = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    saveProjectToLibrary();
  };

  return (
    <div className="brief-section-rhf" data-rhf-brief-section>
      <label className="brief-field project-name-field">
        <span className="brief-field-title-row">
          <span>项目名称</span>
          <span className="project-save-control">
          <button
            className={`project-name-add ${saveFeedbackVisible ? "is-saved" : ""}`}
            type="button"
            data-action="project-library-save-current"
            onClick={handleProjectSave}
            aria-label="保存当前项目到项目库"
            title="保存到项目库"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h9.2L19 7.3v11.2a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5v-13Z"></path>
              <path d="M8 4v6h8V4"></path>
              <path d="M8 16h8"></path>
            </svg>
          </button>
          {saveFeedbackVisible ? <small className="project-save-feedback" role="status">{"\u5df2\u4fdd\u5b58"}</small> : null}
          </span>
        </span>
        <input
          aria-label="项目名称"
          value={currentValues.projectName}
          onChange={(event) => void update("projectName", event.currentTarget.value)}
        />
        {errors.projectName?.message ? <small className="form-error">{errors.projectName.message}</small> : null}
      </label>

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
                placeholder="输入重点，按回车添加"
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
              <small>未添加</small>
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
