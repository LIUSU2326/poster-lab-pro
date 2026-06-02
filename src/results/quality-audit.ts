import sharp from "sharp";
import type { ProductionMode } from "../schema/zod";
import { logoWordmarkTextRisk } from "../prompts/logo-text-policy";
import { announcementCopySafetyPolicy, collabBrandSafetyPolicy } from "../prompts/mode-safety-policy";

export type ResultQualityFindingSeverity = "info" | "review" | "warning";

export type ResultQualityFinding = {
  code: string;
  severity: ResultQualityFindingSeverity;
  message: string;
  recommendation: string;
};

export type ResultQualityAudit = {
  version: "result-quality-audit.v1";
  mode: ProductionMode;
  summary: "pass" | "review" | "warning";
  findings: ResultQualityFinding[];
  metrics: Record<string, number | string | boolean>;
  tokenCost: 0;
};

function decodeDataUrl(dataUrl: string | null | undefined): { mimeType: string; bytes: Buffer } | null {
  if (!dataUrl) return null;
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match?.[1] || typeof match[2] !== "string") return null;
  return {
    mimeType: match[1],
    bytes: Buffer.from(match[2], "base64"),
  };
}

function ratioDelta(width: number, height: number, targetWidth: number, targetHeight: number): number {
  return Math.abs(width / height - targetWidth / targetHeight);
}

function finding(input: ResultQualityFinding): ResultQualityFinding {
  return input;
}

function auditSummary(findings: ResultQualityFinding[]): ResultQualityAudit["summary"] {
  if (findings.some((item) => item.severity === "warning")) return "warning";
  if (findings.some((item) => item.severity === "review")) return "review";
  return "pass";
}

async function iconCanvasMetrics(dataUrl: string | null | undefined): Promise<Record<string, number | string | boolean>> {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return { iconCanvasAudit: "missing-data-url" };

  try {
    const { data, info } = await sharp(decoded.bytes, { failOn: "none" })
      .resize({ width: 32, height: 32, fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixel = (x: number, y: number) => {
      const offset = (y * info.width + x) * info.channels;
      const r = data[offset] ?? 0;
      const g = data[offset + 1] ?? 0;
      const b = data[offset + 2] ?? 0;
      const alpha = data[offset + 3] ?? 255;
      return {
        luminance: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255,
        alpha: alpha / 255,
      };
    };

	    const samples: { luminance: number; alpha: number }[] = [];
	    const sampleBox = (left: number, top: number, size: number) => {
	      for (let y = top; y < top + size; y += 1) {
	        for (let x = left; x < left + size; x += 1) samples.push(pixel(x, y));
	      }
	    };
	    sampleBox(0, 0, 6);
	    sampleBox(26, 0, 6);
	    sampleBox(0, 26, 6);
	    sampleBox(26, 26, 6);
	    const outerCornerSamples: { luminance: number; alpha: number }[] = [];
	    const sampleOuterCornerBox = (left: number, top: number, size: number) => {
	      for (let y = top; y < top + size; y += 1) {
	        for (let x = left; x < left + size; x += 1) outerCornerSamples.push(pixel(x, y));
	      }
	    };
	    sampleOuterCornerBox(0, 0, 3);
	    sampleOuterCornerBox(29, 0, 3);
	    sampleOuterCornerBox(0, 29, 3);
	    sampleOuterCornerBox(29, 29, 3);

	    const centerSamples: { luminance: number; alpha: number }[] = [];
	    for (let y = 12; y < 20; y += 1) {
	      for (let x = 12; x < 20; x += 1) centerSamples.push(pixel(x, y));
	    }
	    const edgeSamples: { luminance: number; alpha: number }[] = [];
	    for (let x = 9; x < 23; x += 1) {
	      for (const y of [0, 1, 2, 3]) edgeSamples.push(pixel(x, y), pixel(x, 31 - y));
	    }
	    for (let y = 9; y < 23; y += 1) {
	      for (const x of [0, 1, 2, 3]) edgeSamples.push(pixel(x, y), pixel(31 - x, y));
	    }

	    const average = (items: { luminance: number; alpha: number }[], key: "luminance" | "alpha") =>
	      items.reduce((sum, item) => sum + item[key], 0) / Math.max(1, items.length);
	    const cornerAlpha = average(samples, "alpha");
	    const centerAlpha = average(centerSamples, "alpha");
	    const cornerLuminance = average(samples, "luminance");
	    const outerCornerLuminance = average(outerCornerSamples, "luminance");
	    const outerCornerAlpha = average(outerCornerSamples, "alpha");
	    const centerLuminance = average(centerSamples, "luminance");
	    const edgeLuminance = average(edgeSamples, "luminance");
	    const edgeAlpha = average(edgeSamples, "alpha");
	    const lightCornerDarkEdgeRisk = outerCornerLuminance > 0.62 &&
	      edgeLuminance < 0.32 &&
	      outerCornerLuminance - edgeLuminance > 0.33 &&
	      centerAlpha > 0.94 &&
	      edgeAlpha > 0.94 &&
	      outerCornerAlpha > 0.94;

	    return {
	      iconCornerAlpha: Number(cornerAlpha.toFixed(4)),
	      iconOuterCornerAlpha: Number(outerCornerAlpha.toFixed(4)),
	      iconCenterAlpha: Number(centerAlpha.toFixed(4)),
	      iconCornerLuminance: Number(cornerLuminance.toFixed(4)),
	      iconOuterCornerLuminance: Number(outerCornerLuminance.toFixed(4)),
	      iconCenterLuminance: Number(centerLuminance.toFixed(4)),
	      iconEdgeLuminance: Number(edgeLuminance.toFixed(4)),
	      iconEdgeAlpha: Number(edgeAlpha.toFixed(4)),
	      iconTransparentCornerRisk: cornerAlpha < 0.86 && centerAlpha > 0.94,
	      iconDarkCornerContainerRisk: cornerLuminance < 0.1 && centerLuminance - cornerLuminance > 0.22,
	      iconLightCornerDarkEdgeContainerRisk: lightCornerDarkEdgeRisk,
	    };
  } catch {
    return { iconCanvasAudit: "failed" };
  }
}

async function posterCanvasMetrics(dataUrl: string | null | undefined): Promise<Record<string, number | string | boolean>> {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return { posterCanvasAudit: "missing-data-url" };

  try {
    const { data, info } = await sharp(decoded.bytes, { failOn: "none" })
      .resize({ width: 48, height: 48, fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const luminanceAt = (x: number, y: number) => {
      const offset = (y * info.width + x) * info.channels;
      const r = data[offset] ?? 0;
      const g = data[offset + 1] ?? 0;
      const b = data[offset + 2] ?? 0;
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const values: number[] = [];
    const borderValues: number[] = [];
    const centerValues: number[] = [];
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const value = luminanceAt(x, y);
        values.push(value);
        if (x < 3 || y < 3 || x >= info.width - 3 || y >= info.height - 3) borderValues.push(value);
        if (x >= 16 && x < 32 && y >= 16 && y < 32) centerValues.push(value);
      }
    }
    const average = (items: number[]) => items.reduce((sum, value) => sum + value, 0) / Math.max(1, items.length);
    const mean = average(values);
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length);
    const stdDev = Math.sqrt(variance);
    const borderMean = average(borderValues);
    const centerMean = average(centerValues);
    return {
      posterLuminanceMean: Number(mean.toFixed(4)),
      posterLuminanceStdDev: Number(stdDev.toFixed(4)),
      posterBorderLuminance: Number(borderMean.toFixed(4)),
      posterCenterLuminance: Number(centerMean.toFixed(4)),
      posterLowThumbnailContrastRisk: stdDev < 0.055,
      posterLetterboxFrameRisk: borderMean < 0.08 && centerMean - borderMean > 0.18,
    };
  } catch {
    return { posterCanvasAudit: "failed" };
  }
}

export async function auditResultQuality(input: {
  mode: ProductionMode;
  dataUrl?: string | null;
  width: number;
  height: number;
  targetWidth?: number | null;
  targetHeight?: number | null;
  assetRoles?: string[];
  overlayApplied?: boolean;
  textTargets?: string[];
}): Promise<ResultQualityAudit> {
  const findings: ResultQualityFinding[] = [];
  const metrics: ResultQualityAudit["metrics"] = {
    width: input.width,
    height: input.height,
  };

  if (input.targetWidth && input.targetHeight) {
    const delta = ratioDelta(input.width, input.height, input.targetWidth, input.targetHeight);
    metrics.targetWidth = input.targetWidth;
    metrics.targetHeight = input.targetHeight;
    metrics.aspectRatioDelta = Number(delta.toFixed(5));
    if (delta > 0.015) {
      findings.push(finding({
        code: "target-aspect-ratio-review",
        severity: "review",
        message: "Generated result aspect ratio differs from the requested target.",
        recommendation: "Review crop safety before using this result in platform deliverables.",
      }));
    }
  }

  if (input.overlayApplied) {
    findings.push(finding({
      code: "local-overlay-fallback-applied",
      severity: "review",
      message: "Local asset overlay fallback was applied to this result.",
      recommendation: "Review for sticker-like edges, lighting mismatch, contact shadows, and occlusion.",
    }));
  }

  if (input.mode === "icon") {
    Object.assign(metrics, await iconCanvasMetrics(input.dataUrl));
	    if (
	      metrics.iconTransparentCornerRisk ||
	      metrics.iconDarkCornerContainerRisk ||
	      metrics.iconLightCornerDarkEdgeContainerRisk
	    ) {
      findings.push(finding({
        code: "icon-rounded-mask-risk",
        severity: "review",
        message: "Icon corners look like a rounded app-icon mask or dark container.",
        recommendation: "Prefer full-canvas square artwork with subject/background extending naturally to all four corners.",
      }));
    }
  }

  if (input.mode === "poster") {
    const assetRoles = input.assetRoles || [];
    const hasLogoReference = assetRoles.some((role) => role === "gameLogo" || role === "brandLogo");
    const hasIntegratedReference = assetRoles.some((role) =>
      ["gameCharacter", "collabCharacter", "prop", "subjectReference", "gameLogo", "brandLogo"].includes(role),
    );
    const hasCopyTarget = (input.textTargets || []).some((target) => target.trim().length > 0);
    Object.assign(metrics, await posterCanvasMetrics(input.dataUrl));
    metrics.posterHasLogoReference = hasLogoReference;
    metrics.posterHasCopyTarget = hasCopyTarget;
    metrics.posterHasIntegratedReference = hasIntegratedReference;
    if (metrics.posterLowThumbnailContrastRisk) {
      findings.push(finding({
        code: "poster-low-thumbnail-contrast-risk",
        severity: "review",
        message: "Poster thumbnail contrast looks low.",
        recommendation: "Review one-second readability; rerun with stronger focal contrast, rim light, foreground/midground separation, and clearer value grouping.",
      }));
    }
    if (metrics.posterLetterboxFrameRisk) {
      findings.push(finding({
        code: "poster-letterbox-frame-risk",
        severity: "review",
        message: "Poster may contain dark border, letterbox, or frame-like edges.",
        recommendation: "Rerun with full-bleed artwork and no black bars, borders, frames, or presentation margins.",
      }));
    }
    if (hasIntegratedReference) {
      findings.push(finding({
        code: "poster-reference-integration-review",
        severity: "info",
        message: "Poster uses uploaded visual references and should be reviewed for natural integrated redraw.",
        recommendation: "Check identity, action pose, contact shadows, occlusion, rim light, environmental color, and VFX overlap; rerun if any uploaded asset looks like a sticker.",
      }));
    }
    if (hasLogoReference) {
      findings.push(finding({
        code: "poster-logo-safe-treatment-review",
        severity: "info",
        message: "Poster includes a logo/brand reference and needs one safe logo treatment.",
        recommendation: "Verify there is exactly one readable logo treatment or a polished blank logo-safe plate, with no duplicate/fake logo text.",
      }));
    }
    if (hasCopyTarget) {
      findings.push(finding({
        code: "poster-slogan-copy-area-review",
        severity: "info",
        message: "Poster has a campaign copy target and needs visible integrated copy treatment or a blank copy-safe plate.",
        recommendation: "Review that slogan placement is large enough, scene-related, and not PPT-like; rerun if copy is omitted, garbled, or floating as flat overlay text.",
      }));
    }
  }

  if (input.mode === "logo") {
    const primaryWordmark = input.textTargets?.find((target) => target.trim().length > 0) || "";
    const logoTextPolicy = logoWordmarkTextRisk(primaryWordmark);
    metrics.logoTextTarget = logoTextPolicy.wordmark || "not-configured";
    metrics.logoTextStrategy = logoTextPolicy.strategy;
    metrics.logoTextComplexityScore = logoTextPolicy.complexityScore;
    findings.push(finding({
      code: "logo-text-accuracy-review",
      severity: "review",
      message: "Logo/wordmark spelling is model-dependent and needs visual review.",
      recommendation: "Verify lettering against the uploaded logo or reserve a blank wordmark plate for later vector/text refinement.",
    }));
    if (logoTextPolicy.strategy === "copySafeBlankWordmark") {
      findings.push(finding({
        code: "logo-copy-safe-wordmark-fallback",
        severity: "review",
        message: "The configured wordmark is high-risk for direct image-model spelling.",
        recommendation: "Prefer a polished blank wordmark plate, emblem, or mark system now, then add exact lettering in a later vector/text refinement step.",
      }));
    }
  }

  if (input.mode === "announcement") {
    const announcementTitle = input.textTargets?.find((target) => target.trim().length > 0) || "";
    const announcementPolicy = announcementCopySafetyPolicy(announcementTitle);
    metrics.announcementCopyTarget = announcementPolicy.title || "not-configured";
    metrics.announcementCopyStrategy = announcementPolicy.strategy;
    metrics.announcementCopyComplexityScore = announcementPolicy.complexityScore;
    findings.push(finding({
      code: "announcement-copy-safe-review",
      severity: "info",
      message: "Announcement output should preserve a calm editable copy-safe area.",
      recommendation: "Review that generated operational text is absent or clean, and that a later editable title/body layer can be placed safely.",
    }));
    if (announcementPolicy.strategy === "blankCopySafePanel") {
      findings.push(finding({
        code: "announcement-copy-safe-panel-fallback",
        severity: "review",
        message: "The announcement title is high-risk for direct image-model text rendering.",
        recommendation: "Prefer polished blank title/body fields and add exact operational copy as editable text later.",
      }));
    }
  }

  if (input.mode === "collab") {
    const collabPolicy = collabBrandSafetyPolicy({
      collabBrandName: input.textTargets?.find((target) => target.trim().length > 0) || "",
      hasPartnerBrandLogo: (input.assetRoles || []).includes("brandLogo"),
    });
    metrics.collabPartnerBrandTarget = collabPolicy.partnerName || "not-configured";
    metrics.collabPartnerBrandStrategy = collabPolicy.strategy;
    if (collabPolicy.strategy === "blankPartnerBrandPlate") {
      findings.push(finding({
        code: "collab-missing-partner-brand-logo",
        severity: "review",
        message: "No partner brandLogo was uploaded for this Collab result.",
        recommendation: "Review that the image uses a blank partner brand plate or neutral emblem instead of readable fake partner wordmarks.",
      }));
      findings.push(finding({
        code: "collab-blank-partner-brand-plate",
        severity: "review",
        message: "Collab should reserve blank partner branding instead of inventing partner text.",
        recommendation: "Use an uploaded partner brandLogo for readable partner branding, or keep the partner lockup as a polished blank plate/emblem.",
      }));
    }
  }

  return {
    version: "result-quality-audit.v1",
    mode: input.mode,
    summary: auditSummary(findings),
    findings,
    metrics,
    tokenCost: 0,
  };
}
