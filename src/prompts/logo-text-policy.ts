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
  const isPlaceholderWordmark = /^(untitled logo|project logo|new logo|logo placeholder)$/i.test(normalized);
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
    !isPlaceholderWordmark &&
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
  const usesUploadedLogoRedraw = Boolean(
    input.hasUploadedLogoReference && policy.strategy === "copySafeBlankWordmark",
  );
  const configuredWordmark = policy.strategy === "exactShortWordmark"
    ? `"${policy.wordmark || "not configured"}"`
    : usesUploadedLogoRedraw
      ? `"${policy.wordmark || "uploaded logo reference"}" with uploaded-logo visual identity as the primary source`
      : "redacted for copy-safe blank wordmark plate; exact text is reserved for later vector/text refinement";
  const exactRule = policy.strategy === "exactShortWordmark"
    ? "Primary attempt: render the exact configured wordmark only if each letter can remain clean and readable."
    : usesUploadedLogoRedraw
      ? "Primary attempt: redraw and elevate the uploaded logo reference as the brand mark source. Preserve its recognizable silhouette, color rhythm, emblem/plate structure, material language, spacing, and pizza/title motif while avoiding malformed replacement letters."
      : "Primary attempt: do not force generated readable lettering; create a clean blank wordmark plate, emblem, badge, or mark system ready for later vector/text refinement.";
  const uploadedLogoRule = input.hasUploadedLogoReference
    ? usesUploadedLogoRedraw
      ? "Uploaded logo reference: treat the uploaded logo as the primary brand continuity source. Do not replace it with a generic empty plaque; do not paste it unchanged as a sticker; redraw it into a cleaner production logo asset."
      : "Uploaded logo reference: use it for brand rhythm, color, silhouette, material style, and spacing cues only; do not copy uploaded readable letters back as generated text, do not paste it as a sticker, and do not invent replacement letters."
    : "No uploaded logo reference: design the mark/plate from the project and brand context without pretending a precise existing wordmark was supplied.";
  const strategyLabel = usesUploadedLogoRedraw ? "uploadedLogoReferenceRedraw" : policy.strategy;
  const reasonText = usesUploadedLogoRedraw
    ? "higher-risk lettering; uploaded logo reference should drive the logo redesign while exact text can be refined later"
    : policy.reason;
  const lockRule = usesUploadedLogoRedraw
    ? "Uploaded-logo redraw lock: final output must still read as a logo/mark asset derived from the uploaded brand reference, not a blank plaque, poster scene, character scene, or unrelated fantasy UI frame. If lettering cannot stay exact, simplify it into non-letter brand shapes while preserving the original logo's recognizable layout, colors, pizza/title silhouette, and material rhythm."
    : policy.strategy === "copySafeBlankWordmark"
      ? "Copy-safe blank lock: do not render readable letters, partial project-title words, uploaded-logo letters, pseudo-letters, subtitles, slogans, or decorative fake typography. The wordmark area must remain visually blank for later exact text work."
      : "Exact short wordmark lock: if any letter cannot stay clean, fall back to a blank wordmark plate instead of malformed text.";
  const fallbackRule = usesUploadedLogoRedraw
    ? "Fallback rule: if exact spelling is uncertain, keep the uploaded logo's non-text identity cues as a clean emblem/title-lockup system; never replace it with an unrelated empty nameplate or fake text."
    : "Fallback rule: if exact spelling is uncertain, reserve a polished blank wordmark plate or clean emblem with brand colors/materials; never generate pseudo-letters, look-alike words, malformed text, extra slogans, or poster copy.";

  return [
    "Logo Text Strategy:",
    `Configured wordmark target: ${configuredWordmark}.`,
    `Strategy: ${strategyLabel}.`,
    `Reason: ${reasonText}.`,
    exactRule,
    uploadedLogoRule,
    lockRule,
    fallbackRule,
    "Refinement path: treat final exact lettering as a later vector/text refinement step when the image model cannot guarantee spelling.",
  ].join("\n");
}
