"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { uploadWorkbenchAssetFile } from "../asset-library-client.js";
import { replaceGenerationFormField } from "../generation-form-runtime.js";
import { analyzeReferenceImageForWorkbench } from "../reference-analysis-client.js";
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

function normalizeInitialValues(values: ModeForm): ModeForm {
  return ModeFormSchema.parse(values);
}

function rotateStrings(items: string[], offset: number): string[] {
  if (items.length === 0) return [];
  return items.map((_, index) => items[(index + offset) % items.length]).filter((item): item is string => Boolean(item));
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });
}

function analysisApiReady(): boolean {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const provider = snapshot.providerConfigs?.[state.provider];
  return Boolean(
    state.providerCredential?.configured ||
    state.providerConnection?.ok ||
    provider?.hasApiKey ||
    provider?.status === "success",
  );
}

function latestStylePreview(): string {
  const snapshot = getRuntimeWorkspaceSnapshot();
  return [...(snapshot.assets || [])].reverse().find((asset) => asset.role === "styleReference" && asset.previewUrl)?.previewUrl || "";
}

function latestStyleDataUrl(): string {
  return Object.entries(state.referenceUploadDataUrls || {})
    .filter(([key]) => key.startsWith("styleReference:"))
    .map(([, value]) => value)
    .filter(Boolean)
    .at(-1) || "";
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
  const [styleAnalysisMessage, setStyleAnalysisMessage] = useState("");
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
  const activeTags = currentValues.mode === "poster" ? currentValues.styleTags : [];
  const canExtractStyle = Boolean(stylePreview) && analysisApiReady();

  const commitPosterTags = async (nextTags: string[]) => {
    if (currentValues.mode !== "poster") return;
    const safeTags = nextTags.length > 0 ? nextTags : [recommendedStyles[0] || styleLibrary[0] || "精致休闲奇幻"];
    const nextValues = { ...currentValues, styleTags: safeTags } as ModeForm;
    form.setValue("styleTags", safeTags, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    await commit(nextValues);
  };

  const toggleStyle = async (chip: string) => {
    if (currentValues.mode !== "poster") return;
    await commitPosterTags([chip]);
    setShowLibrary(false);
  };

  const handleStyleReferenceChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!acceptedImageTypes.includes(file.type)) {
      setStyleUploadStatus("仅支持 PNG、JPG、WebP 图片。");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setStylePreview(previewUrl);
    setStyleAnalysisMessage("");
    setStyleUploadStatus("画风参考上传中");
    try {
      const dataUrl = await fileToDataUrl(file);
      state.referenceUploadDataUrls = {
        ...(state.referenceUploadDataUrls || {}),
        "styleReference:画风参考": dataUrl,
      };
    } catch {
      // Keep the local preview even if extracting needs another upload later.
    }

    const result = await uploadWorkbenchAssetFile({
      role: "styleReference",
      label: "画风参考",
      file,
      previewUrl,
    });
    setStyleUploadStatus(result.ok ? "画风参考已加入项目素材库" : "画风参考上传失败");
  };

  const extractStyle = async () => {
    if (!stylePreview) {
      setStyleAnalysisMessage("请先上传一张画风参考图。");
      return;
    }
    const imageDataUrl = latestStyleDataUrl();
    if (!imageDataUrl) {
      setStyleAnalysisMessage("请重新上传画风参考图后再提取。");
      return;
    }
    if (!analysisApiReady()) {
      setStyleAnalysisMessage("先在「模型与 API Key」里保存并测试可用的画风识别 API。");
      return;
    }
    setStyleAnalysisMessage("画风提取中，请稍候...");
    try {
      const result = await analyzeReferenceImageForWorkbench({
        kind: "style",
        role: "styleReference",
        label: "画风参考",
        imageDataUrl,
        key: "styleReference:style",
      });
      if (!result.ok) {
        setStyleAnalysisMessage(result.error?.message || "画风提取失败，请检查 API 配置。");
        return;
      }
      const text = String(result.data?.text || "").trim();
      const summary = text.length > 120 ? `${text.slice(0, 120)}...` : text;
      setStyleAnalysisMessage(summary || "画风提取完成，但供应商没有返回文本。");
    } catch (error) {
      setStyleAnalysisMessage(error instanceof Error ? error.message : "画风提取失败，请稍后重试。");
    }
  };

  const upload = (
    <StyleReferenceUpload
      title={directionTitle}
      helper={directionHelper}
      status={styleUploadStatus}
      previewUrl={stylePreview}
      analysisMessage={styleAnalysisMessage}
      canExtract={canExtractStyle}
      inputRef={styleInputRef}
      onChange={handleStyleReferenceChange}
      onExtract={extractStyle}
    />
  );
  const styleLibraryDialog = showLibrary && typeof document !== "undefined"
    ? createPortal(
      <>
        <div className="style-library-backdrop" aria-hidden="true" onClick={() => setShowLibrary(false)} />
        <div className="style-library-panel" role="dialog" aria-modal="true" aria-label="画风库">
          <div className="style-library-dialog-head">
            <strong>画风库</strong>
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
            {filteredStyles.map((chip) => (
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
        </div>
      </>,
      document.body,
    )
    : null;

  if (mode === "announcement" && currentValues.mode === "announcement") {
    const presets = ["维护公告", "版本更新", "限时礼包"];

    return (
      <div className="direction-section-rhf" data-rhf-direction-section>
        <div className="preset-groups">
          <div>
            <strong>公告类型</strong>
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
            <strong>排版方式</strong>
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
                融入场景
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
                常规面板
              </button>
            </span>
          </div>
        </div>
        {upload}
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
        <div className="guardrail-chips">
          <span>锁定 1:1</span>
          <span>无文字</span>
          <span>满铺直角</span>
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

  if (mode === "poster" && currentValues.mode === "poster") {
    return (
      <div className="direction-section-rhf" data-rhf-direction-section>
        <button className="library-head library-toggle" type="button" onClick={() => setShowLibrary(!showLibrary)}>
          <strong>画风库</strong>
          <small>{showLibrary ? "收起" : `${styleLibrary.length} 款可选`}</small>
        </button>

        <div className="style-recommendation-head">
          <strong>随机推荐</strong>
          <small>6 个画风</small>
        </div>
        <div className="chip-grid style-recommendation-grid">
          {recommendedStyles.map((chip, index) => (
            <button
              className={activeTags.includes(chip) || (activeTags.length === 0 && index === 0) ? "active" : ""}
              type="button"
              key={chip}
              onClick={() => void toggleStyle(chip)}
            >
              {chip}
            </button>
          ))}
        </div>

        {styleLibraryDialog}

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
}) {
  return (
    <div className={`style-reference-upload ${previewUrl ? "has-preview" : ""}`}>
      <button className="style-reference-main" type="button" onClick={() => inputRef.current?.click()}>
        <span className="style-reference-preview" aria-hidden="true">
          {previewUrl ? <img className="style-preview-image" src={previewUrl} alt="" /> : null}
        </span>
        {previewUrl ? null : (
          <span>
            <strong>{title || "上传画风参考"}</strong>
            <small>{status || helper}</small>
          </span>
        )}
      </button>
      <button className="mini-solid-button" type="button" onClick={onExtract} disabled={!previewUrl}>
        提取画风
      </button>
      {analysisMessage ? (
        <small className={canExtract ? "reference-ready-note" : "reference-muted-note"}>
          {analysisMessage}
        </small>
      ) : null}
      <input ref={inputRef} className="asset-file-input" type="file" accept={acceptedImageTypes.join(",")} onChange={onChange} />
    </div>
  );
}
