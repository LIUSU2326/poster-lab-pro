"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { removeWorkbenchAssetsByRoleLabel, uploadWorkbenchAssetFile } from "../asset-library-client.js";
import { replaceGenerationFormField } from "../generation-form-runtime.js";
import { analyzeReferenceImageForWorkbench } from "../reference-analysis-client.js";
import { latestReferenceAnalysisSummary, summarizeReferenceAnalysisText } from "../reference-analysis-state.js";
import {
  isKnownUnsupportedProviderSlotModel,
  providerModelSlots,
  providerSupportsSlot,
} from "../provider-capabilities.js";
import { getRuntimeWorkspaceSnapshot, state } from "../state.js";
import { ModeFormSchema, type ModeForm, type ProductionMode } from "../schema/zod";

type DirectionSectionProps = {
  mode: ProductionMode;
  initialValues: ModeForm;
  styles: string[];
  directionTitle: string;
  directionHelper: string;
};

const acceptedImageTypes = ["image/png", "image/jpeg", "image/webp"];

const posterStyleLibrary = [
  "3D 潮流粘土",
  "二次元幻彩",
  "史诗暗金 RPG",
  "赛博霓虹",
  "欧美扁平矢量",
  "国风水墨",
  "复古街机像素",
  "仙侠流光云海",
  "吉卜力手绘",
  "现代商务极简",
  "电竞猛兽图腾",
  "至尊钻金",
  "街头涂鸦",
  "蒸汽机械",
  "精致休闲奇幻",
  "电影感奖励揭示",
  "角色反应组合",
  "商店头图裁切",
  "国潮厚涂",
  "低多边形",
  "像素复古",
  "欧美写实",
  "赛博霓虹",
  "水彩绘本",
  "厚涂奇幻",
  "黏土定格",
  "日系赛璐璐",
  "美式卡通",
  "暗黑哥特",
  "明亮童话",
  "蒸汽朋克",
  "魔幻写实",
  "科幻机甲",
  "童趣手绘",
  "纸艺拼贴",
  "复古海报",
  "漫画分镜",
  "硬表面3D",
  "柔光治愈",
  "荒野写实",
  "海岛度假",
  "森林冒险",
  "街机霓虹",
  "可爱三渲二",
  "油画质感",
  "剪纸舞台",
  "定格玩具",
  "广告大片",
  "轻奢产品",
  "手绘绘本",
];
const logoBackgroundOptions = [
  { label: "白底", value: "#ffffff" },
  { label: "黑底", value: "#111827" },
  { label: "绿幕", value: "#16a34a" },
  { label: "深蓝", value: "#0f172a" },
  { label: "暖橙", value: "#fb923c" },
  { label: "透明后期", value: "#f8fafc" },
];
const styleAnalysisProviderIds = new Set(["openai", "aigocode", "google", "claude", "qwen", "mimo"]);

function normalizeInitialValues(values: ModeForm): ModeForm {
  const parsed = ModeFormSchema.parse(values);
  if (!supportsStyleTags(parsed)) return parsed;
  return {
    ...parsed,
    styleTags: uniqueStrings(parsed.styleTags).slice(0, 1),
  } as ModeForm;
}

function rotateStrings(items: string[], offset: number): string[] {
  if (items.length === 0) return [];
  return items.map((_, index) => items[(index + offset) % items.length]).filter((item): item is string => Boolean(item));
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function supportsStyleTags(values: ModeForm): values is Extract<ModeForm, { mode: "poster" | "logo" | "icon" }> {
  return values.mode === "poster" || values.mode === "logo" || values.mode === "icon";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });
}

function routeProviderForSlot(slot: string): string {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const routedProvider = state.providerSlotRoutes?.[slot]?.providerId || "";
  const currentProvider = state.provider || "";
  const configured = (providerId: string): boolean => {
    const provider = snapshot.providerConfigs?.[providerId];
    return Boolean(
      (state.providerCredential?.providerId === providerId && state.providerCredential?.configured) ||
      (state.providerConnection?.providerId === providerId && state.providerConnection?.ok) ||
      provider?.hasApiKey ||
      provider?.status === "success",
    );
  };
  if (
    slot === "styleReference"
    && currentProvider
    && !styleAnalysisProviderIds.has(currentProvider)
    && configured(currentProvider)
    && (!routedProvider || !configured(routedProvider))
  ) {
    return currentProvider;
  }
  return routedProvider || currentProvider;
}

function analysisApiReady(providerId: string): boolean {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const provider = snapshot.providerConfigs?.[providerId];
  return Boolean(
    (state.providerCredential?.providerId === providerId && state.providerCredential?.configured) ||
    (state.providerConnection?.providerId === providerId && state.providerConnection?.ok) ||
    provider?.hasApiKey ||
    provider?.status === "success",
  );
}

function styleAnalysisProviderReady(providerId: string): boolean {
  return styleAnalysisProviderIds.has(providerId);
}

function styleAnalysisModelForSlot(providerId: string, slot: string): string {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const route = (state.providerSlotRoutes?.[slot] || {}) as { providerId?: string; model?: string };
  const provider = (snapshot.providerConfigs?.[providerId] || {}) as { modelSlots?: Record<string, string>; defaultModel?: string };
  const modelSlots = providerModelSlots as Record<string, Record<string, string[]>>;
  const slotModels = modelSlots[providerId]?.[slot] || [];
  const configuredSlotModel = provider.modelSlots?.[slot] || "";
  const routeModel = providerId === route.providerId ? route.model || "" : "";
  const preferredModel = routeModel || configuredSlotModel || slotModels[0] || provider.defaultModel || "";
  if (!isKnownUnsupportedProviderSlotModel(providerId, slot, preferredModel)) return preferredModel;
  if (configuredSlotModel && slotModels.includes(configuredSlotModel)) return configuredSlotModel;
  return slotModels[0] || "";
}

function styleAnalysisRouteReady(providerId: string, slot: string, model: string): boolean {
  if (!styleAnalysisProviderReady(providerId) || !providerSupportsSlot(providerId, slot)) return false;
  return !isKnownUnsupportedProviderSlotModel(providerId, slot, model);
}

function latestStylePreview(): string {
  const localDataUrl = Object.entries(state.referenceUploadDataUrls || {})
    .filter(([key]) => key.startsWith("styleReference:"))
    .map(([, value]) => value)
    .filter(Boolean)
    .at(-1);
  if (localDataUrl) return localDataUrl;

  const snapshot = getRuntimeWorkspaceSnapshot();
  const previewUrl = [...(snapshot.assets || [])].reverse().find((asset) => asset.role === "styleReference" && asset.previewUrl)?.previewUrl || "";
  return normalizeLocalPreviewUrl(previewUrl);
}

function latestStyleDataUrl(): string {
  return Object.entries(state.referenceUploadDataUrls || {})
    .filter(([key]) => key.startsWith("styleReference:"))
    .map(([, value]) => value)
    .filter(Boolean)
    .at(-1) || "";
}

function normalizeLocalPreviewUrl(value: string | null | undefined): string {
  const url = typeof value === "string" ? value : "";
  if (!url || /example\.com/i.test(url) || /^blob:/i.test(url)) return "";
  const localUpload = url.match(/^https?:\/\/(?:localhost|127\.0\.0\.1):\d+(\/uploads\/.+)$/i);
  return localUpload?.[1] || url;
}

function stylePreviewClass(style: string, index: number): string {
  const rules: Array<[RegExp, string]> = [
    [/像素|街机/i, "preview-pixel"],
    [/水彩|绘本|手绘/i, "preview-watercolor"],
    [/国潮|厚涂|油画/i, "preview-painterly"],
    [/电影|大片|写实|荒野/i, "preview-cinematic"],
    [/低多边形|几何/i, "preview-polygon"],
    [/赛博|霓虹|科幻|机甲/i, "preview-neon"],
    [/黏土|定格|玩具/i, "preview-clay"],
    [/剪纸|纸艺/i, "preview-paper"],
    [/漫画|赛璐璐|卡通/i, "preview-comic"],
    [/商店|裁切|广告|产品/i, "preview-layout"],
    [/奇幻|魔幻|哥特/i, "preview-fantasy"],
  ];
  const match = rules.find(([pattern]) => pattern.test(style));
  if (match) return match[1];
  const seed = Array.from(style).reduce((total, char) => total + char.charCodeAt(0), index);
  return `tone-${seed % 8}`;
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
  const styleInputRef = useRef<HTMLInputElement | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [search, setSearch] = useState("");
  const [styleUploadStatus, setStyleUploadStatus] = useState("");
  const [stylePreview, setStylePreview] = useState(latestStylePreview());
  const [stylePreviewBroken, setStylePreviewBroken] = useState(false);
  const [styleAnalysisMessage, setStyleAnalysisMessage] = useState(() =>
    latestReferenceAnalysisSummary({ role: "styleReference", kinds: ["style"], maxLength: 120 }),
  );
  const customStyles = Array.isArray(state.customStyleTags?.[mode]) ? state.customStyleTags[mode] : [];

  const commit = async (nextValues: ModeForm) => {
    const parsed = ModeFormSchema.safeParse(nextValues);
    if (!parsed.success) return;
    replaceGenerationFormField("modeForm", parsed.data);
  };

  const styleLibrary = useMemo(
    () => uniqueStrings([...styles, ...posterStyleLibrary, ...customStyles]),
    [customStyles, styles],
  );
  const recommendedStyles = rotateStrings(styleLibrary, state.directionLibraryOffset?.[mode] || 0).slice(0, 6);
  const filteredStyles = styleLibrary.filter((style) => style.toLowerCase().includes(search.trim().toLowerCase()));
  const activeTags = supportsStyleTags(currentValues) ? uniqueStrings(currentValues.styleTags).slice(0, 1) : [];
  const styleProviderId = routeProviderForSlot("styleReference");
  const styleModel = styleAnalysisModelForSlot(styleProviderId, "styleReference");
  const displayStylePreview = stylePreview && !stylePreviewBroken ? stylePreview : "";
  const styleRouteReady = styleAnalysisRouteReady(styleProviderId, "styleReference", styleModel);
  const canExtractStyle = Boolean(displayStylePreview) && analysisApiReady(styleProviderId) && styleRouteReady;
  const unsupportedStyleProviderMessage = styleProviderId === "agnes"
    ? "Agnes Image 2.1 Flash 支持图生图参考，但画风文字分析需要视觉理解模型，请把画风识别路由切到 MiMo、Google、OpenAI、AIGoCode、Claude 或 Qwen。"
    : "当前供应商不支持画风识别，请切换到 MiMo、Google、OpenAI、AIGoCode、Claude 或 Qwen。";
  const styleDisabledReason = displayStylePreview
    ? !styleRouteReady
      ? unsupportedStyleProviderMessage
      : !analysisApiReady(styleProviderId)
        ? "先配置可用的识别 API"
        : ""
    : "";
  const styleNote = styleAnalysisMessage || styleDisabledReason;

  const commitStyleTags = async (nextTags: string[]) => {
    if (!supportsStyleTags(currentValues)) return;
    const safeTags = uniqueStrings(nextTags).slice(0, 1);
    const nextValues = { ...currentValues, styleTags: safeTags } as ModeForm;
    form.setValue("styleTags" as never, safeTags as never, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    await commit(nextValues);
  };

  const toggleStyle = async (chip: string) => {
    if (!supportsStyleTags(currentValues)) return;
    const nextTags = activeTags.includes(chip) ? [] : [chip];
    await commitStyleTags(nextTags);
  };

  const handleStyleReferenceFile = async (file?: File) => {
    if (!file) return;
    if (!acceptedImageTypes.includes(file.type)) {
      setStyleUploadStatus("仅支持 PNG、JPG、WebP 图片。");
      return;
    }

    let previewUrl = "";
    setStyleAnalysisMessage("");
    setStyleUploadStatus("画风参考上传中");
    try {
      const dataUrl = await fileToDataUrl(file);
      previewUrl = dataUrl;
      state.referenceUploadDataUrls = {
        ...(state.referenceUploadDataUrls || {}),
        "styleReference:画风参考": dataUrl,
      };
    } catch {
      previewUrl = URL.createObjectURL(file);
    }
    setStylePreviewBroken(false);
    setStylePreview(previewUrl);

    const result = await uploadWorkbenchAssetFile({
      role: "styleReference",
      label: "画风参考",
      file,
      previewUrl,
    });
    setStyleUploadStatus(result.ok ? "画风参考已加入项目素材库" : "画风参考上传失败");
  };

  const handleStyleReferenceChange = async (event: ChangeEvent<HTMLInputElement>) => {
    await handleStyleReferenceFile(event.currentTarget.files?.[0]);
    event.currentTarget.value = "";
  };

  const handleStyleReferenceDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleStyleReferenceDrop = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    await handleStyleReferenceFile(Array.from(event.dataTransfer.files || [])[0]);
  };

  const extractStyle = async () => {
    if (!displayStylePreview) {
      setStyleAnalysisMessage("请先上传一张画风参考图。");
      return;
    }
    if (!styleRouteReady) {
      setStyleAnalysisMessage(unsupportedStyleProviderMessage);
      return;
    }
    const imageDataUrl = latestStyleDataUrl();
    if (!imageDataUrl) {
      setStyleAnalysisMessage("请重新上传画风参考图后再提取。");
      return;
    }
    if (!analysisApiReady(styleProviderId)) {
      setStyleAnalysisMessage("先在「模型与 API Key」里保存并测试可用的画风识别 API。");
      return;
    }
    setStyleAnalysisMessage("画风提取中，请稍候...");
    try {
      const result = await analyzeReferenceImageForWorkbench({
        kind: "style",
        role: "styleReference",
        providerId: styleProviderId,
        model: styleModel,
        label: "画风参考",
        imageDataUrl,
        key: "styleReference:style",
      });
      if (!result.ok) {
        setStyleAnalysisMessage(result.error?.message || "画风提取失败，请检查 API 配置。");
        return;
      }
      const text = String(result.data?.text || "").trim();
      const summary = summarizeReferenceAnalysisText(text, 120);
      setStyleAnalysisMessage(summary || "画风提取完成，但供应商没有返回文本。");
    } catch (error) {
      setStyleAnalysisMessage(error instanceof Error ? error.message : "画风提取失败，请稍后重试。");
    }
  };

  const deleteStyleReference = async () => {
    setStyleUploadStatus("删除中...");
    try {
      const result = await removeWorkbenchAssetsByRoleLabel("styleReference");
      if (!result.ok) {
        throw new Error(result.save?.error?.message || "删除画风参考后保存工作区失败。");
      }
      setStylePreview("");
      setStylePreviewBroken(false);
      setStyleUploadStatus("");
      setStyleAnalysisMessage("");
    } catch (error) {
      setStyleUploadStatus("删除失败");
      setStyleAnalysisMessage(error instanceof Error ? error.message : "删除画风参考失败。");
    }
  };

  const upload = (
    <StyleReferenceUpload
      title={directionTitle}
      helper={directionHelper}
      status={styleUploadStatus}
      previewUrl={displayStylePreview}
      analysisMessage={styleNote}
      canExtract={canExtractStyle}
      inputRef={styleInputRef}
      onChange={handleStyleReferenceChange}
      onExtract={extractStyle}
      onRemove={deleteStyleReference}
      onPreviewError={() => setStylePreviewBroken(true)}
      onDragOver={handleStyleReferenceDragOver}
      onDrop={handleStyleReferenceDrop}
    />
  );
  const styleLibraryDialog = showLibrary && typeof document !== "undefined"
    ? createPortal(
      <>
        <div className="style-library-backdrop" aria-hidden="true" onClick={() => setShowLibrary(false)} />
        <div className="style-library-panel" role="dialog" aria-modal="true" aria-label="画风库">
          <div className="style-library-dialog-head">
            <div>
              <strong>画风库</strong>
              <small>{activeTags[0] ? `已选 ${activeTags[0]}` : `${filteredStyles.length} 款可选`}</small>
            </div>
            <button type="button" onClick={() => setShowLibrary(false)}>关闭</button>
          </div>
          <input
            className="search-input"
            aria-label="搜索画风"
            value={search}
            placeholder="搜索画风，例如国潮、厚涂、像素"
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          <div className="chip-grid style-library-grid" aria-label="画风库">
            {filteredStyles.map((chip, index) => (
              <button
                className={`style-library-option ${activeTags.includes(chip) ? "active" : ""}`}
                type="button"
                key={chip}
                onClick={() => void toggleStyle(chip)}
              >
                <span className={`style-library-swatch ${stylePreviewClass(chip, index)}`} aria-hidden="true">
                  <i />
                </span>
                <strong>{chip}</strong>
              </button>
            ))}
          </div>
        </div>
      </>,
      document.body,
    )
    : null;
  const stylePicker = (title: string, recommendationLabel = "随机推荐") => (
    <>
      <button className="library-head library-toggle" type="button" onClick={() => setShowLibrary(!showLibrary)}>
        <strong>{title}</strong>
        <small>{showLibrary ? "收起" : `${styleLibrary.length} 款可选`}</small>
      </button>

      <div className="style-recommendation-head">
        <strong>{recommendationLabel}</strong>
        <small>6 个画风</small>
      </div>
      <div className="chip-grid style-recommendation-grid">
        {recommendedStyles.map((chip) => (
          <button
            className={activeTags.includes(chip) ? "active" : ""}
            type="button"
            key={chip}
            onClick={() => void toggleStyle(chip)}
          >
            {chip}
          </button>
        ))}
      </div>

      {activeTags.length > 0 ? (
      <div className="selected-style-strip" aria-live="polite">
        <strong>已选画风</strong>
        {activeTags.length > 0 ? (
          <span>
            {activeTags.map((chip) => (
              <button type="button" key={chip} onClick={() => void toggleStyle(chip)}>
                {chip}
              </button>
            ))}
          </span>
        ) : (
          <small>未选择</small>
        )}
      </div>
      ) : null}

      {styleLibraryDialog}
    </>
  );

  if (mode === "announcement" && currentValues.mode === "announcement") {
    const presetGroups = [
      { title: "运营通知", items: ["维护公告", "版本更新", "系统升级"] },
      { title: "活动运营", items: ["限时礼包", "累计签到", "赛事报名"] },
      { title: "账号服务", items: ["账号找回", "封禁说明", "身份验证"] },
    ];
    const updateAnnouncementTitle = (announcementTitle: string) => {
      const nextValues = { ...currentValues, announcementTitle };
      form.setValue("announcementTitle", announcementTitle, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      void commit(nextValues);
    };
    const updateCopyPreset = (copyPreset: string) => {
      const nextValues = { ...currentValues, copyPreset };
      form.setValue("copyPreset", copyPreset, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      void commit(nextValues);
    };
    const updateLayoutMode = (layoutMode: "integratedTypography" | "regularPanel") => {
      const nextValues = { ...currentValues, layoutMode };
      form.setValue("layoutMode", layoutMode, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      void commit(nextValues);
    };
    const updateGroupShot = (groupShotWhenMultiCharacter: boolean) => {
      const nextValues = { ...currentValues, groupShotWhenMultiCharacter };
      form.setValue("groupShotWhenMultiCharacter", groupShotWhenMultiCharacter, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      void commit(nextValues);
    };

    return (
      <div className="direction-section-rhf announcement-direction-section" data-rhf-direction-section>
        <label className="mode-text-field announcement-title-field">
          <span>公告标题</span>
          <input
            aria-label="公告标题"
            value={currentValues.announcementTitle}
            placeholder="例如：停机维护、版本更新、限时礼包"
            onChange={(event) => updateAnnouncementTitle(event.currentTarget.value)}
          />
        </label>
        <div className="preset-groups announcement-preset-groups">
          {presetGroups.map((group) => (
            <div key={group.title}>
              <strong>{group.title}</strong>
              <span>
                {group.items.map((preset) => (
                  <button
                    className={currentValues.copyPreset === preset ? "active" : ""}
                    type="button"
                    key={preset}
                    onClick={() => updateCopyPreset(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </span>
            </div>
          ))}
          <div className="announcement-layout-group">
            <strong>排版方式</strong>
            <span>
              <button
                className={currentValues.layoutMode === "integratedTypography" ? "active" : ""}
                type="button"
                onClick={() => updateLayoutMode("integratedTypography")}
              >
                融入场景
              </button>
              <button
                className={currentValues.layoutMode === "regularPanel" ? "active" : ""}
                type="button"
                onClick={() => updateLayoutMode("regularPanel")}
              >
                常规面板
              </button>
            </span>
          </div>
        </div>
        <label className="direction-toggle announcement-toggle">
          <input
            type="checkbox"
            checked={currentValues.groupShotWhenMultiCharacter}
            onChange={(event) => updateGroupShot(event.currentTarget.checked)}
          />
          <span>多角色时作为公告陪衬，不遮挡文案区</span>
        </label>
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
              {value === "native" ? "原生融合" : value === "brand" ? "品牌优先" : "游戏优先"}
            </button>
          ))}
        </div>
        {upload}
      </div>
    );
  }

  if (mode === "icon" && currentValues.mode === "icon") {
    return (
      <div className="direction-section-rhf" data-rhf-direction-section>
        {stylePicker("画风预置", "推荐图标风格")}
        <div className="guardrail-chips">
          <span>锁定 1:1</span>
          <span>无文字</span>
          <span>单一强主体</span>
          <span>64px 可读</span>
          <span>无白边</span>
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
          <span>轮循构图参考</span>
        </label>
        {upload}
      </div>
    );
  }

  if (mode === "logo" && currentValues.mode === "logo") {
    const updateWordmark = (wordmark: string) => {
      const nextValues = { ...currentValues, wordmark };
      form.setValue("wordmark", wordmark, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      void commit(nextValues);
    };
    const updateBackgroundColor = (backgroundColor: string) => {
      const nextValues = { ...currentValues, backgroundColor };
      form.setValue("backgroundColor", backgroundColor, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      void commit(nextValues);
    };

    return (
      <div className="direction-section-rhf" data-rhf-direction-section>
        <div className="mode-design-card logo-design-card">
          <label className="mode-text-field">
            <span>Logo 字标</span>
            <input
              aria-label="Logo 字标"
              value={currentValues.wordmark}
              placeholder="例如 Pizza Kitchen Adventures"
              onChange={(event) => updateWordmark(event.currentTarget.value)}
            />
          </label>
          <div className="logo-background-picker" aria-label="Logo 纯色背景">
            <strong>纯色背景</strong>
            <div className="logo-background-grid">
              {logoBackgroundOptions.map((option) => (
                <button
                  className={currentValues.backgroundColor === option.value ? "active" : ""}
                  type="button"
                  key={option.value}
                  onClick={() => updateBackgroundColor(option.value)}
                >
                  <i style={{ background: option.value }} aria-hidden="true" />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="guardrail-chips">
            <span>字标/标识主体</span>
            <span>纯色背景</span>
            <span>可抠图</span>
            <span>不做海报场景</span>
          </div>
        </div>
        {stylePicker("Logo 风格库", "推荐品牌风格")}
        {upload}
      </div>
    );
  }

  if (mode === "poster" && currentValues.mode === "poster") {
    return (
      <div className="direction-section-rhf" data-rhf-direction-section>
        {stylePicker("画风库")}
        {upload}
      </div>
    );
  }

  return (
    <div className="direction-section-rhf" data-rhf-direction-section>
      {upload}
    </div>
  );
}

function StyleReferenceUpload({
  title,
  helper,
  status,
  previewUrl,
  analysisMessage,
  canExtract,
  inputRef,
  onChange,
  onExtract,
  onRemove,
  onPreviewError,
  onDragOver,
  onDrop,
}: {
  title: string;
  helper: string;
  status: string;
  previewUrl: string;
  analysisMessage: string;
  canExtract: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onExtract: () => void;
  onRemove: () => void | Promise<void>;
  onPreviewError: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}) {
  return (
    <div className={`style-reference-upload compact-reference-card ${previewUrl ? "has-preview" : "is-empty"}`}>
      <button
        className="style-reference-main"
        type="button"
        aria-label={previewUrl ? "画风参考已上传，点击更换图片" : title || "上传画风参考"}
        title={previewUrl ? "点击更换画风参考" : title || "上传画风参考"}
        onClick={() => inputRef.current?.click()}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <span className="style-reference-preview" aria-hidden="true">
          {previewUrl ? <img className="style-preview-image" src={previewUrl} alt="" onError={onPreviewError} /> : <span className="reference-plus">+</span>}
        </span>
        {previewUrl ? null : (
          <span className="reference-upload-meta">
            <strong>{title || "画风参考"}</strong>
            {status ? <small>{status}</small> : null}
          </span>
        )}
      </button>
      {previewUrl ? (
        <>
          <button className="reference-remove-button reference-corner-remove" type="button" onClick={() => void onRemove()} aria-label="删除画风参考图" title="删除参考图">
            ×
          </button>
          <div className="style-reference-actions reference-analysis-tools">
            <button className="reference-analysis-button" type="button" onClick={onExtract} disabled={!canExtract} title={!canExtract && analysisMessage ? analysisMessage : undefined}>
              <svg className="reference-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 19c4-1 5-4 6-8 1-4 4-6 8-6-1 4-3 7-6 9-3 2-5 3-8 5Z" />
                <path d="M9 14c2 0 4 1 6 3" />
              </svg>
              <span>解析画风</span>
            </button>
          </div>
        </>
      ) : null}
      {previewUrl && analysisMessage ? (
        <small className={canExtract ? "reference-ready-note" : "reference-muted-note"}>
          {analysisMessage}
        </small>
      ) : null}
      <input ref={inputRef} className="asset-file-input" type="file" accept={acceptedImageTypes.join(",")} onChange={onChange} />
    </div>
  );
}
