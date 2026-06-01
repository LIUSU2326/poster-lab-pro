import type { ProductionMode } from "../schema/zod";
import {
  PromptGuardrailRuleSchema,
  type PromptBuildTarget,
  type PromptGuardrailRule,
} from "./contracts";

function rule(params: {
  id: string;
  mode: ProductionMode;
  severity: PromptGuardrailRule["severity"];
  rule: string;
  negativeRule?: string;
  appliesTo?: PromptBuildTarget[];
}): PromptGuardrailRule {
  return PromptGuardrailRuleSchema.parse({
    appliesTo: ["brief", "image"],
    ...params,
  });
}

export const promptGuardrailsByMode: Record<ProductionMode, PromptGuardrailRule[]> = {
  poster: [
    rule({
      id: "poster-uploaded-assets-binding",
      mode: "poster",
      severity: "hard",
      rule: "When uploaded character, BOSS/key subject, scene, or logo assets are provided, treat them as binding visual references and visibly use them once according to their roles.",
      negativeRule: "Do not replace uploaded characters, BOSS assets, or logos with generic substitutes, and do not duplicate the same asset as multiple large/small copies.",
    }),
    rule({
      id: "poster-premium-key-art",
      mode: "poster",
      severity: "recommended",
      rule: "The poster should read as a premium game campaign key visual: coherent story moment, strong focal hierarchy, cinematic lighting, depth, polished color grading, and campaign-ready composition.",
      negativeRule: "Avoid flat collage, sticker-like pasted assets, floating isolated elements, cheap clip-art, low-fidelity wallpaper composition, and tabletop food surface used as the entire scene.",
    }),
    rule({
      id: "poster-integrated-typography",
      mode: "poster",
      severity: "hard",
      rule: "When slogan mode is active, make the slogan a visible campaign-copy treatment: exact custom game-campaign lettering integrated with the scene or logo style when possible; otherwise reserve a polished blank safe area for later copy.",
      negativeRule: "No silent omission of the copy area, plain system-font text, PPT-like headline overlay, broken generated spelling, or text pasted on top without lighting/shadow integration.",
    }),
    rule({
      id: "poster-logo-readable",
      mode: "poster",
      severity: "hard",
      rule: "If a game logo is provided, keep the uploaded logo design readable and separated from noisy background details. If exact lettering cannot be preserved, reserve a polished blank logo-safe area instead of inventing text.",
      negativeRule: "Do not bury a provided logo inside visual clutter, redraw it as a fake replacement, invent look-alike words, or substitute letters.",
    }),
    rule({
      id: "poster-platform-safe-area",
      mode: "poster",
      severity: "hard",
      rule: "Respect platform-safe areas for headline, subject, and callout text.",
      negativeRule: "Do not place important text at crop edges.",
    }),
    rule({
      id: "poster-no-protected-ip-copy",
      mode: "poster",
      severity: "hard",
      rule: "Do not copy protected third-party game characters, trademarks, or exact campaign artwork.",
      negativeRule: "No exact replication of copyrighted IP, screenshots, or logos.",
    }),
  ],
  collab: [
    rule({
      id: "collab-placeholder-only",
      mode: "collab",
      severity: "hard",
      rule: "During brief planning use only [Game Character] and [Collab Partner] placeholders for character identity.",
      negativeRule: "Do not invent face, hair, clothing, age, body shape, race, or other appearance details.",
    }),
    rule({
      id: "collab-no-merge",
      mode: "collab",
      severity: "hard",
      rule: "Keep [Game Character] and [Collab Partner] as two separate visible entities with clear interaction.",
      negativeRule: "Do NOT merge both entities into one hybrid character.",
    }),
    rule({
      id: "collab-brand-logic",
      mode: "collab",
      severity: "recommended",
      rule: "The collab should feel native to the game world while preserving both identities and keeping each logo/brand mark independent when present.",
      negativeRule: "Do not fuse two logos into one hybrid mark, flatten the collab into side-by-side pasted logos, or remove the interaction story between both sides.",
    }),
    rule({
      id: "collab-interaction-story",
      mode: "collab",
      severity: "recommended",
      rule: "Show a clear relationship between both sides through shared action, exchanged props, mirrored poses, shared lighting, or an in-world event moment.",
      negativeRule: "Do not place two isolated characters or logos in separate corners without interaction.",
    }),
  ],
  announcement: [
    rule({
      id: "announcement-readable-copy",
      mode: "announcement",
      severity: "hard",
      rule: "Announcement title and key copy must remain clearly readable with a deliberate text-safe area.",
      negativeRule: "Do not distort operational announcement copy into illegible decoration, fake letters, garbled text, or overly busy effects.",
    }),
    rule({
      id: "announcement-layout-mode",
      mode: "announcement",
      severity: "hard",
      rule: "Respect the selected layout mode: integrated scene typography or regular in-game announcement panel.",
    }),
    rule({
      id: "announcement-group-shot",
      mode: "announcement",
      severity: "recommended",
      rule: "When character references are present, arrange them as guides, presenters, or a group-shot around the announcement surface without stealing the headline hierarchy.",
      negativeRule: "Do not let characters cover the title/copy area or turn the announcement into a poster battle scene.",
    }),
    rule({
      id: "announcement-logo-copy-safety",
      mode: "announcement",
      severity: "hard",
      rule: "If a logo is present, keep it as a clean lockup or reserve a brand-safe area; do not generate fake replacement logo text.",
      negativeRule: "No fake logo words, malformed title lettering, or repeated watermark-like logos.",
    }),
  ],
  logo: [
    rule({
      id: "logo-wordmark-first",
      mode: "logo",
      severity: "hard",
      rule: "The game wordmark, mark, or badge is the primary subject and must dominate the composition with readable brand construction.",
      negativeRule: "Do not make scenery, characters, or props more important than the wordmark/mark system.",
    }),
    rule({
      id: "logo-pure-background",
      mode: "logo",
      severity: "hard",
      rule: "Use a pure solid-color background suitable for clean cutout and later compositing.",
      negativeRule: "No complex environment, gradient background, noisy lighting, or scene depth.",
    }),
    rule({
      id: "logo-reference-brand-continuity",
      mode: "logo",
      severity: "hard",
      rule: "If an uploaded logo exists, use it as brand continuity for shape, rhythm, color, and style; preserve exact spelling only when reliable, otherwise design a clean copy-safe mark or blank wordmark treatment without fake replacement text.",
      negativeRule: "Do not generate fake look-alike words, substitute letters, or repeat the uploaded logo as a pasted sticker.",
    }),
  ],
  icon: [
    rule({
      id: "icon-locked-square",
      mode: "icon",
      severity: "hard",
      rule: "Output must be a perfect 1:1 square icon with full-bleed composition and sharp square corners.",
      negativeRule: "No rounded frame, white border, padding, letterbox, or decorative container.",
    }),
    rule({
      id: "icon-no-text",
      mode: "icon",
      severity: "hard",
      rule: "The icon must contain absolutely no text, logo lettering, subtitles, captions, or UI copy.",
      negativeRule: "ABSOLUTELY NO TEXT.",
    }),
    rule({
      id: "icon-subject-fidelity",
      mode: "icon",
      severity: "hard",
      rule: "Stay faithful to uploaded subject references while redrawing/simplifying them into one strong high-contrast icon subject readable at 64px.",
      negativeRule: "Do not invent unrelated characters, replace the uploaded subject identity, paste the original asset as a sticker, or keep a cluttered poster-like scene.",
    }),
  ],
};

export function getPromptGuardrails(mode: ProductionMode, target: PromptBuildTarget = "image"): PromptGuardrailRule[] {
  return promptGuardrailsByMode[mode].filter((item) => item.appliesTo.includes(target));
}

export function lockedFieldsForPromptMode(mode: ProductionMode): string[] {
  if (mode === "collab") return ["characterPlaceholdersOnly", "preventCharacterMerge"];
  if (mode === "logo") return ["solidBackground", "wordmarkIsPrimarySubject"];
  if (mode === "icon") return ["aspectRatio", "noText", "fullBleedSquare"];
  if (mode === "announcement") return ["announcementTitle", "layoutMode"];
  return ["logoSafeArea", "platformSafeArea"];
}
