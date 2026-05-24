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
      id: "poster-logo-readable",
      mode: "poster",
      severity: "hard",
      rule: "Keep the game logo readable and separated from noisy background details.",
      negativeRule: "Do not bury the logo inside visual clutter.",
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
      rule: "The collab should feel native to the game world while preserving both IP identities.",
    }),
  ],
  announcement: [
    rule({
      id: "announcement-readable-copy",
      mode: "announcement",
      severity: "hard",
      rule: "Announcement title and key copy must remain clearly readable.",
      negativeRule: "Do not distort operational announcement copy into illegible decoration.",
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
      rule: "When multiple character references are present, arrange them as a group-shot around the announcement surface.",
    }),
  ],
  logo: [
    rule({
      id: "logo-wordmark-first",
      mode: "logo",
      severity: "hard",
      rule: "The 3D game wordmark is the primary subject and must dominate the composition.",
      negativeRule: "Do not make scenery, characters, or props more important than the wordmark.",
    }),
    rule({
      id: "logo-pure-background",
      mode: "logo",
      severity: "hard",
      rule: "Use a pure solid-color background suitable for clean cutout and later compositing.",
      negativeRule: "No complex environment, gradient background, noisy lighting, or scene depth.",
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
      rule: "Stay faithful to uploaded subject references and emphasize the user-selected visual focus.",
      negativeRule: "Do not invent unrelated characters or replace the uploaded subject identity.",
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
