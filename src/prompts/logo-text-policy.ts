export type LogoTextStrategy = "exactShortWordmark" | "copySafeBlankWordmark";

export type LogoTextPolicy = {
  wordmark: string;
  strategy: LogoTextStrategy;
  reason: string;
  complexityScore: number;
};

function normalizeWordmark(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

export function logoWordmarkTextRisk(wordmark: string | null | undefined): LogoTextPolicy {
  const normalized = normalizeWordmark(wordmark);
  const lettersAndNumbers = normalized.replace(/[^A-Za-z0-9]/g, "");
  const wordCount = normalized ? normalized.split(/\s+/).length : 0;
  const hasNonLatin = /[^\x00-\x7F]/.test(normalized);
  const hasHeavyPunctuation = /[^A-Za-z0-9\s&'’.-]/.test(normalized);
  const complexityScore =
    normalized.length +
    Math.max(0, wordCount - 2) * 8 +
    (hasNonLatin ? 12 : 0) +
    (hasHeavyPunctuation ? 10 : 0);
  const simpleShortWordmark =
    normalized.length > 0 &&
    normalized.length <= 14 &&
    wordCount <= 2 &&
    lettersAndNumbers.length >= Math.min(3, normalized.length) &&
    !hasNonLatin &&
    !hasHeavyPunctuation;

  return {
    wordmark: normalized,
    strategy: simpleShortWordmark ? "exactShortWordmark" : "copySafeBlankWordmark",
    reason: simpleShortWordmark
      ? "short simple Latin wordmark, reasonable to ask the image model for exact spelling with review"
      : "complex or higher-risk lettering, safer to reserve a polished blank wordmark plate for later vector/text refinement",
    complexityScore,
  };
}

export function logoTextPolicyBlock(input: {
  wordmark: string | null | undefined;
  hasUploadedLogoReference?: boolean;
}): string {
  const policy = logoWordmarkTextRisk(input.wordmark);
  const configuredWordmark = policy.wordmark || "not configured";
  const exactRule = policy.strategy === "exactShortWordmark"
    ? "Primary attempt: render the exact configured wordmark only if each letter can remain clean and readable."
    : "Primary attempt: do not force generated readable lettering; create a clean blank wordmark plate, emblem, badge, or mark system ready for later vector/text refinement.";
  const uploadedLogoRule = input.hasUploadedLogoReference
    ? "Uploaded logo reference: use it for brand rhythm, color, silhouette, material style, and letter spacing cues; do not paste it back as a sticker and do not invent replacement letters."
    : "No uploaded logo reference: design the mark/plate from the project and brand context without pretending a precise existing wordmark was supplied.";

  return [
    "Logo Text Strategy:",
    `Configured wordmark target: "${configuredWordmark}".`,
    `Strategy: ${policy.strategy}.`,
    `Reason: ${policy.reason}.`,
    exactRule,
    uploadedLogoRule,
    "Fallback rule: if exact spelling is uncertain, reserve a polished blank wordmark plate or clean emblem with brand colors/materials; never generate pseudo-letters, look-alike words, malformed text, extra slogans, or poster copy.",
    "Refinement path: treat final exact lettering as a later vector/text refinement step when the image model cannot guarantee spelling.",
  ].join("\n");
}
