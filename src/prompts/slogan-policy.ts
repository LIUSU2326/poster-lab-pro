import { z } from "zod";
import { SloganLanguageSchema } from "../schema/zod";

type SloganLanguage = z.infer<typeof SloganLanguageSchema>;

export const IMAGE_RENDERABLE_SLOGAN_MAX_CHARS = 56;
export const IMAGE_RENDERABLE_SLOGAN_MAX_WORDS = 8;
export const IMAGE_RENDERABLE_CJK_SLOGAN_MAX_CHARS = 16;

export function imageRenderableSloganRule(language: SloganLanguage | string = "en-US"): string {
  const isCjk = language === "zh-CN" || language === "ja-JP" || language === "ko-KR";
  const lengthRule = isCjk
    ? "Auto slogan must be image-renderable: 6-16 visible CJK characters, one compact campaign phrase, no game title, no long sentence, no punctuation-heavy copy."
    : "Auto slogan must be image-renderable: 3-8 words, max 56 visible characters, one compact campaign phrase, no game title, no long sentence, no punctuation-heavy copy.";
  return `${lengthRule} The slogan must be scene-derived: use verbs, nouns, stakes, props, or materials from this specific scheme's action and set-piece, not a generic motivational line that could fit any poster. Avoid generic three-part lists such as "Harvest. Battle. Feast" unless those exact words are physically staged as the main visual idea; prefer a concrete phrase tied to the scheme's hero action, BOSS threat, signature prop, or environment material.`;
}

export function integratedSloganTreatmentRule(): string {
  return [
    "Slogan art direction: treat the slogan as a large secondary campaign object, not a small caption under the logo, but never let it become the main focal subject over the trailer-moment story beat.",
    "Target presence: the slogan should be big enough for thumbnail reading, roughly 10-16% of canvas height or 18-30% of canvas width, usually 1-2 lines, while preserving a larger readable protagonist performance area.",
    "Single-use typography: render the slogan/copy treatment exactly once. Do not add a second small subtitle, lower-left or lower-right plaque, caption, corner badge, watermark, duplicate translation, blank extra title plate, or repeated slogan block anywhere else in the poster.",
    "Copy hierarchy: keep logo and slogan as one compact supporting campaign zone whenever possible, not a stacked right-side text wall, separate bottom caption, or extra corner label; the character conflict must remain the primary read.",
    "Scene integration: anchor the lettering to the poster idea through an in-world material or effect such as oven-fire glow, sauce splash, cheese pull, smoke/steam plume, carved wooden menu board, battle banner, metal sign, glowing portal rim, impact burst, or foreground prop surface.",
    "Lighting integration: the slogan must receive the same perspective, shadows, rim light, bounce color, texture, haze, and partial VFX/particle overlap as the rest of the scene.",
    "Composition rule: do not stack the slogan as detached PPT-style text directly below the logo and do not let logo+slogan consume the central action space; connect it to the story beat, action path, or environmental set piece while preserving a readable logo-safe area.",
  ].join(" ");
}

export function normalizeImageRenderableSlogan(input: {
  slogan: string;
  language?: SloganLanguage | string;
  brandTerms?: string[];
  contextText?: string;
}): string {
  const language = input.language || "en-US";
  const brandTerms = (input.brandTerms || []).map(normalizeText).filter(Boolean);
  const maxChars = language === "zh-CN" || language === "ja-JP" || language === "ko-KR"
    ? IMAGE_RENDERABLE_CJK_SLOGAN_MAX_CHARS
    : IMAGE_RENDERABLE_SLOGAN_MAX_CHARS;

  const normalized = cleanSlogan(input.slogan);
  if (!normalized) return "";

  if (isGenericThreePartSlogan(normalized)) {
    const sceneFallback = deriveSceneSloganFallback(input.contextText || "", language);
    if (sceneFallback) return sceneFallback;
  }

  const brandTrimmed = stripBrandTerms(normalized, brandTerms);
  const candidateSource = brandTrimmed || normalized;
  const directCandidate = compactPunctuation(candidateSource);
  if (isRenderable(directCandidate, language, maxChars)) return directCandidate;

  const phrases = splitSloganPhrases(candidateSource)
    .map((phrase) => compactPunctuation(stripBrandTerms(phrase, brandTerms)))
    .filter(Boolean)
    .filter((phrase) => !isOnlyBrandTerm(phrase, brandTerms));

  const renderablePhrase = phrases.find((phrase) => isRenderable(phrase, language, maxChars));
  if (renderablePhrase) return renderablePhrase;

  const fallback = phrases[0] || directCandidate;
  return truncateRenderable(fallback, language, maxChars);
}

export function deriveSceneSloganFallback(contextText: string, language: SloganLanguage | string = "en-US"): string {
  const context = normalizeText(contextText);
  if (!context) return "";

  if (language === "zh-CN") {
    if (hasAny(context, ["厨刀", "菜刀", "刀", "披萨铲", "分割", "斜切"])) return "劈开荒野";
    if (hasAny(context, ["烤炉", "炉火", "火焰", "传送门", "portal", "oven"])) return "点燃狩猎";
    if (hasAny(context, ["boss", "首领", "怪物", "锤", "冲击"])) return "击退首领";
    if (hasAny(context, ["奶酪", "酱汁", "sauce", "cheese"])) return "酱浪开战";
    return "";
  }

  if (hasAny(context, ["chef knife", "knife", "blade", "pizza peel", "pizza cutter", "cleaver", "diagonal split", "split world", "厨刀", "菜刀", "披萨铲", "斜切", "分割"])) {
    return "Slice Through the Wild";
  }
  if (hasAny(context, ["oven", "fire", "flame", "portal", "烤炉", "炉火", "火焰", "传送门"])) {
    return "Fire Up the Hunt";
  }
  if (hasAny(context, ["boss", "antagonist", "monster", "hammer", "impact", "首领", "怪物", "锤", "冲击"])) {
    return "Serve the Boss Storm";
  }
  if (hasAny(context, ["sauce", "cheese", "mozzarella", "酱汁", "奶酪"])) {
    return "Sauce Up the Storm";
  }
  return "";
}

function cleanSlogan(value: string): string {
  return String(value || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

function normalizeText(value: string): string {
  return cleanSlogan(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBrandTerms(value: string, brandTerms: string[]): string {
  let output = value;
  for (const term of brandTerms) {
    if (!term) continue;
    const pattern = term
      .split(/\s+/)
      .map(escapeRegExp)
      .join("[\\s\\-_:,.!?]*");
    output = output.replace(new RegExp(pattern, "giu"), "");
  }
  return compactPunctuation(output);
}

function compactPunctuation(value: string): string {
  return cleanSlogan(value)
    .replace(/\s+([,，.!?。！？;；:：])/g, "$1")
    .replace(/([,，.!?。！？;；:：]){2,}/g, "$1")
    .replace(/^[,，.!?。！？;；:：\-\s]+|[,，.!?。！？;；:：\-\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSloganPhrases(value: string): string[] {
  return cleanSlogan(value)
    .split(/[.!?。！？;；:：|/]+|[,，]\s+/g)
    .map(compactPunctuation)
    .filter(Boolean);
}

function isOnlyBrandTerm(value: string, brandTerms: string[]): boolean {
  const normalized = normalizeText(value);
  return Boolean(normalized && brandTerms.some((term) => normalized === term));
}

function isRenderable(value: string, language: SloganLanguage | string, maxChars: number): boolean {
  if (!value || value.length > maxChars) return false;
  if (language === "zh-CN" || language === "ja-JP" || language === "ko-KR") {
    return visibleCharacters(value) <= maxChars;
  }
  return wordCount(value) <= IMAGE_RENDERABLE_SLOGAN_MAX_WORDS;
}

function isGenericThreePartSlogan(value: string): boolean {
  const parts = cleanSlogan(value)
    .split(/[.!?。！？;；]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return false;
  return parts.every((part) => /^\p{L}+$/u.test(part) || visibleCharacters(part) <= 4);
}

function hasAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(normalizeText(needle)));
}

function truncateRenderable(value: string, language: SloganLanguage | string, maxChars: number): string {
  const cleaned = compactPunctuation(value);
  if (!cleaned) return "";

  if (language === "zh-CN" || language === "ja-JP" || language === "ko-KR") {
    return Array.from(cleaned).slice(0, maxChars).join("").replace(/[,，.!?。！？;；:：\-\s]+$/g, "").trim();
  }

  const words = cleaned.split(/\s+/).slice(0, IMAGE_RENDERABLE_SLOGAN_MAX_WORDS);
  let output = words.join(" ");
  if (output.length > maxChars) {
    output = output.slice(0, maxChars).replace(/\s+\S*$/, "").trim();
  }
  return output.replace(/[,，.!?。！？;；:：\-\s]+$/g, "").trim();
}

function visibleCharacters(value: string): number {
  return Array.from(value.replace(/\s+/g, "")).length;
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
