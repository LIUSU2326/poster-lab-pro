export type AnnouncementCopyStrategy = "exactShortTitleWithCopySafePanel" | "blankCopySafePanel";
export type CollabBrandStrategy = "uploadedPartnerBrandLockup" | "blankPartnerBrandPlate";

function normalizeText(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

export function announcementCopySafetyPolicy(title: string | null | undefined): {
  title: string;
  strategy: AnnouncementCopyStrategy;
  complexityScore: number;
  reason: string;
} {
  const normalized = normalizeText(title);
  const wordCount = normalized ? normalized.split(/\s+/).length : 0;
  const hasNonLatin = /[^\x00-\x7F]/.test(normalized);
  const complexityScore = normalized.length + Math.max(0, wordCount - 4) * 6 + (hasNonLatin ? 8 : 0);
  const shortTitle = normalized.length > 0 && normalized.length <= 24 && wordCount <= 4;
  return {
    title: normalized,
    strategy: shortTitle ? "exactShortTitleWithCopySafePanel" : "blankCopySafePanel",
    complexityScore,
    reason: shortTitle
      ? "short announcement title, safe to request exact title lettering while preserving editable copy-safe panel space"
      : "long or higher-risk announcement text, safer to reserve blank editable title/body fields for later layout",
  };
}

export function announcementCopySafetyBlock(title: string | null | undefined): string {
  const policy = announcementCopySafetyPolicy(title);
  return [
    "Announcement Copy Safety Strategy:",
    `Configured title target: "${policy.title || "not configured"}".`,
    `Strategy: ${policy.strategy}.`,
    `Reason: ${policy.reason}.`,
    "Always reserve a calm editable copy-safe panel, title field, and body-copy region with clear margins and quiet background.",
    "If exact title spelling is uncertain, leave polished blank title/body fields instead of generating garbled letters, fake operational text, or decorative pseudo-copy.",
    "Characters, logos, effects, particles, and UI ornaments must frame the copy-safe area without covering it.",
  ].join("\n");
}

export function collabBrandSafetyPolicy(input: {
  collabBrandName?: string | null;
  hasPartnerBrandLogo?: boolean;
}): {
  partnerName: string;
  strategy: CollabBrandStrategy;
  reason: string;
} {
  const partnerName = normalizeText(input.collabBrandName);
  const hasPartnerBrandLogo = input.hasPartnerBrandLogo === true;
  return {
    partnerName,
    strategy: hasPartnerBrandLogo ? "uploadedPartnerBrandLockup" : "blankPartnerBrandPlate",
    reason: hasPartnerBrandLogo
      ? "uploaded partner brandLogo is available, so it may be used as the partner lockup reference"
      : "no uploaded partner brandLogo is available, so readable partner wording must be reserved as a blank plate or neutral emblem",
  };
}

export function collabBrandSafetyBlock(input: {
  collabBrandName?: string | null;
  hasPartnerBrandLogo?: boolean;
}): string {
  const policy = collabBrandSafetyPolicy(input);
  return [
    "Collab Brand Safety Strategy:",
    `Partner brand name target: "${policy.partnerName || "not configured"}".`,
    `Strategy: ${policy.strategy}.`,
    `Reason: ${policy.reason}.`,
    policy.strategy === "uploadedPartnerBrandLockup"
      ? "Use the uploaded partner brandLogo as the only readable partner brand reference; keep it separate from the game logo and integrate both through shared scene lighting/materials. If either logo spelling cannot stay exact, switch that side to a polished blank non-letter plate instead of pseudo-text."
      : "Reserve polished blank partner/game brand plates, neutral emblems, or copy-safe lockup areas; do not generate readable partner names, fake sponsor logos, fake wordmarks, distorted uploaded-logo words, pseudo-letters, or hybrid brand text.",
    "Both sides must stay separate but unified: game identity, partner identity, logos/brand plates, and characters should relate through interaction, shared light, and scene story, not through merged traits.",
  ].join("\n");
}
