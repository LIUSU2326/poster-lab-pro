"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { uploadWorkbenchAssetFile } from "../asset-library-client.js";
import { replaceGenerationFormField } from "../generation-form-runtime.js";
import { state } from "../state.js";
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

  const commitPosterTags = async (nextTags: string[]) => {
    if (currentValues.mode !== "poster") return;
    const safeTags = nextTags.length > 0 ? nextTags : [recommendedStyles[0] || styleLibrary[0] || "精致休闲奇幻"];
    const nextValues = { ...currentValues, styleTags: safeTags } as ModeForm;
    form.setValue("styleTags", safeTags, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    await commit(nextValues);
  };

  const toggleStyle = async (chip: string) => {
    if (currentValues.mode !== "poster") return;
    const nextTags = activeTags.includes(chip) ? activeTags.filter((item) => item !== chip) : [...activeTags, chip];
    await commitPosterTags(nextTags);
  };

  const handleStyleReferenceChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!acceptedImageTypes.includes(file.type)) {
      setStyleUploadStatus("仅支持 PNG、JPG、WebP 图片。");
      return;
    }

    setStyleUploadStatus("画风参考上传中");
    const result = await uploadWorkbenchAssetFile({
      role: "styleReference",
      label: "画风参考",
      file,
      previewUrl: URL.createObjectURL(file),
    });
    setStyleUploadStatus(result.ok ? "画风参考已加入项目素材库" : "画风参考上传失败");
  };

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
        <StyleReferenceUpload
          title={directionTitle}
          helper={directionHelper}
          status={styleUploadStatus}
          inputRef={styleInputRef}
          onChange={handleStyleReferenceChange}
        />
      </div>
    );
  }

  if (mode === "collab" && currentValues.mode === "collab") {
    return (
      <div className="direction-section-rhf" data-rhf-direction-section>
        <div className="segmented">
          <button
            className={currentValues.collabStyleInjection === "native" ? "active" : ""}
            type="button"
            onClick={() => {
              const nextValues = { ...currentValues, collabStyleInjection: "native" as const };
              form.setValue("collabStyleInjection", "native", { shouldDirty: true, shouldTouch: true, shouldValidate: true });
              void commit(nextValues);
            }}
          >
            原生融合
          </button>
          <button
            className={currentValues.collabStyleInjection === "brand" ? "active" : ""}
            type="button"
            onClick={() => {
              const nextValues = { ...currentValues, collabStyleInjection: "brand" as const };
              form.setValue("collabStyleInjection", "brand", { shouldDirty: true, shouldTouch: true, shouldValidate: true });
              void commit(nextValues);
            }}
          >
            品牌优先
          </button>
          <button
            className={currentValues.collabStyleInjection === "game" ? "active" : ""}
            type="button"
            onClick={() => {
              const nextValues = { ...currentValues, collabStyleInjection: "game" as const };
              form.setValue("collabStyleInjection", "game", { shouldDirty: true, shouldTouch: true, shouldValidate: true });
              void commit(nextValues);
            }}
          >
            游戏优先
          </button>
        </div>
        <StyleReferenceUpload
          title={directionTitle}
          helper={directionHelper}
          status={styleUploadStatus}
          inputRef={styleInputRef}
          onChange={handleStyleReferenceChange}
        />
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
        <StyleReferenceUpload
          title={directionTitle}
          helper={directionHelper}
          status={styleUploadStatus}
          inputRef={styleInputRef}
          onChange={handleStyleReferenceChange}
        />
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

        {showLibrary ? (
          <div className="style-library-panel">
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
        ) : null}

        <StyleReferenceUpload
          title={directionTitle}
          helper={directionHelper}
          status={styleUploadStatus}
          inputRef={styleInputRef}
          onChange={handleStyleReferenceChange}
        />
      </div>
    );
  }

  return (
    <div className="direction-section-rhf" data-rhf-direction-section>
      <StyleReferenceUpload
        title={directionTitle}
        helper={directionHelper}
        status={styleUploadStatus}
        inputRef={styleInputRef}
        onChange={handleStyleReferenceChange}
      />
    </div>
  );
}

function StyleReferenceUpload({
  title,
  helper,
  status,
  inputRef,
  onChange,
}: {
  title: string;
  helper: string;
  status: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="style-reference-upload">
      <div>
        <strong>{title || "上传画风参考"}</strong>
        <small>{status || helper}</small>
      </div>
      <button className="mini-solid-button" type="button" onClick={() => inputRef.current?.click()}>
        上传
      </button>
      <input ref={inputRef} className="asset-file-input" type="file" accept={acceptedImageTypes.join(",")} onChange={onChange} />
    </div>
  );
}
