import sharp from "sharp";

export type ImageOutputProcessing =
  | {
      strategy: "native";
      sourceWidth: number;
      sourceHeight: number;
      targetWidth: number;
      targetHeight: number;
      tokenCost: 0;
    }
  | {
      strategy: "localResizeExact";
      sourceWidth: number;
      sourceHeight: number;
      targetWidth: number;
      targetHeight: number;
      fit: "fill";
      tokenCost: 0;
    }
  | {
      strategy: "skipped";
      reason: "missingDataUrl" | "missingTarget" | "aspectRatioMismatch" | "resizeFailed";
      sourceWidth: number | null;
      sourceHeight: number | null;
      targetWidth: number | null;
      targetHeight: number | null;
      tokenCost: 0;
    };

export type PreparedImageForStorage = {
  dataUrl: string | null;
  width: number;
  height: number;
  mimeType: string | null;
  processing: ImageOutputProcessing;
};

export type PosterAssetOverlayInputAsset = {
  id: string;
  role: string;
  label: string;
  previewUrl?: string | null;
  mimeType?: string | null;
};

export type AppliedPosterAssetOverlay = {
  assetId: string;
  role: string;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PosterAssetOverlayProcessing = {
  strategy: "uploadedAssetOverlay";
  attemptedAssetIds: string[];
  applied: AppliedPosterAssetOverlay[];
  sloganApplied?: boolean;
  tokenCost: 0;
};

export type PosterAssetOverlayResult = {
  dataUrl: string | null;
  overlays: AppliedPosterAssetOverlay[];
  processing: PosterAssetOverlayProcessing | null;
};

function decodeDataUrl(dataUrl: string): { mimeType: string; bytes: Buffer } | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match?.[1] || typeof match[2] !== "string") return null;
  return {
    mimeType: match[1],
    bytes: Buffer.from(match[2], "base64"),
  };
}

function ratioDelta(input: {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
}): number {
  return Math.abs(input.sourceWidth / input.sourceHeight - input.targetWidth / input.targetHeight);
}

export async function prepareImageForTargetSize(input: {
  dataUrl: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  targetWidth: number | null;
  targetHeight: number | null;
  maxRatioDelta?: number;
}): Promise<PreparedImageForStorage> {
  const sourceWidth = input.sourceWidth || input.targetWidth || 1024;
  const sourceHeight = input.sourceHeight || input.targetHeight || 1024;
  const base = {
    width: sourceWidth,
    height: sourceHeight,
    mimeType: null,
  };

  if (!input.dataUrl) {
    return {
      ...base,
      dataUrl: null,
      processing: {
        strategy: "skipped",
        reason: "missingDataUrl",
        sourceWidth: input.sourceWidth,
        sourceHeight: input.sourceHeight,
        targetWidth: input.targetWidth,
        targetHeight: input.targetHeight,
        tokenCost: 0,
      },
    };
  }

  const decoded = decodeDataUrl(input.dataUrl);
  if (!decoded) {
    return {
      ...base,
      dataUrl: input.dataUrl,
      processing: {
        strategy: "skipped",
        reason: "missingDataUrl",
        sourceWidth: input.sourceWidth,
        sourceHeight: input.sourceHeight,
        targetWidth: input.targetWidth,
        targetHeight: input.targetHeight,
        tokenCost: 0,
      },
    };
  }

  const targetWidth = input.targetWidth;
  const targetHeight = input.targetHeight;
  if (!targetWidth || !targetHeight) {
    return {
      dataUrl: input.dataUrl,
      width: sourceWidth,
      height: sourceHeight,
      mimeType: decoded.mimeType,
      processing: {
        strategy: "skipped",
        reason: "missingTarget",
        sourceWidth,
        sourceHeight,
        targetWidth,
        targetHeight,
        tokenCost: 0,
      },
    };
  }

  if (sourceWidth === targetWidth && sourceHeight === targetHeight) {
    return {
      dataUrl: input.dataUrl,
      width: sourceWidth,
      height: sourceHeight,
      mimeType: decoded.mimeType,
      processing: {
        strategy: "native",
        sourceWidth,
        sourceHeight,
        targetWidth,
        targetHeight,
        tokenCost: 0,
      },
    };
  }

  const maxRatioDelta = input.maxRatioDelta ?? 0.03;
  if (ratioDelta({ sourceWidth, sourceHeight, targetWidth, targetHeight }) > maxRatioDelta) {
    return {
      dataUrl: input.dataUrl,
      width: sourceWidth,
      height: sourceHeight,
      mimeType: decoded.mimeType,
      processing: {
        strategy: "skipped",
        reason: "aspectRatioMismatch",
        sourceWidth,
        sourceHeight,
        targetWidth,
        targetHeight,
        tokenCost: 0,
      },
    };
  }

  try {
    const resized = await sharp(decoded.bytes, { failOn: "none" })
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: "fill",
        kernel: "lanczos3",
      })
      .png()
      .toBuffer();

    return {
      dataUrl: `data:image/png;base64,${resized.toString("base64")}`,
      width: targetWidth,
      height: targetHeight,
      mimeType: "image/png",
      processing: {
        strategy: "localResizeExact",
        sourceWidth,
        sourceHeight,
        targetWidth,
        targetHeight,
        fit: "fill",
        tokenCost: 0,
      },
    };
  } catch {
    return {
      dataUrl: input.dataUrl,
      width: sourceWidth,
      height: sourceHeight,
      mimeType: decoded.mimeType,
      processing: {
        strategy: "skipped",
        reason: "resizeFailed",
        sourceWidth,
        sourceHeight,
        targetWidth,
        targetHeight,
        tokenCost: 0,
      },
    };
  }
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isLogoOverlayRole(role: string): boolean {
  return role === "gameLogo" || role === "brandLogo" || /\blogo\b|wordmark|brand/i.test(role);
}

function isThreatOverlayRole(role: string): boolean {
  return role === "prop" || role === "subjectReference" || /boss|antagonist|enemy|monster|creature|subject/i.test(role);
}

async function loadOverlayBytes(
  asset: PosterAssetOverlayInputAsset,
  fetchImpl: typeof fetch | undefined,
): Promise<Buffer | null> {
  const url = asset.previewUrl || "";
  if (!url) return null;

  const dataUrl = decodeDataUrl(url);
  if (dataUrl?.bytes.byteLength) return dataUrl.bytes;

  if (!fetchImpl) return null;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.byteLength > 0 ? bytes : null;
  } catch {
    return null;
  }
}

function targetOverlayWidth(input: {
  role: string;
  canvasWidth: number;
  characterCount: number;
}): number {
  if (isLogoOverlayRole(input.role)) return clampInteger(input.canvasWidth * 0.2, 96, input.canvasWidth * 0.28);
  if (isThreatOverlayRole(input.role)) return clampInteger(input.canvasWidth * 0.34, 150, input.canvasWidth * 0.43);
  const ratio = input.characterCount >= 3 ? 0.16 : input.characterCount === 2 ? 0.19 : 0.24;
  const maxCharacterWidth = input.characterCount > 1 ? input.canvasWidth * 0.23 : input.canvasWidth * 0.3;
  return clampInteger(input.canvasWidth * ratio, 80, maxCharacterWidth);
}

function maxOverlayHeight(input: { role: string; canvasHeight: number }): number {
  if (isLogoOverlayRole(input.role)) return clampInteger(input.canvasHeight * 0.18, 36, input.canvasHeight * 0.24);
  if (isThreatOverlayRole(input.role)) return clampInteger(input.canvasHeight * 0.58, 120, input.canvasHeight * 0.68);
  return clampInteger(input.canvasHeight * 0.46, 80, input.canvasHeight * 0.56);
}

async function resizeOverlay(input: {
  bytes: Buffer;
  width: number;
  maxHeight: number;
}): Promise<{ input: Buffer; width: number; height: number } | null> {
  try {
    const { data, info } = await sharp(input.bytes, { failOn: "none" })
      .resize({
        width: input.width,
        height: input.maxHeight,
        fit: "inside",
        withoutEnlargement: false,
      })
      .png()
      .toBuffer({ resolveWithObject: true });
    return {
      input: data,
      width: info.width,
      height: info.height,
    };
  } catch {
    return null;
  }
}

function dynamicPoseAngle(input: { role: string; index: number }): number {
  if (isLogoOverlayRole(input.role)) return 0;
  if (isThreatOverlayRole(input.role)) return 2;
  return input.index % 2 === 0 ? -7 : 6;
}

function dynamicPoseShear(input: { role: string; index: number }): number {
  if (isLogoOverlayRole(input.role)) return 0;
  if (isThreatOverlayRole(input.role)) return -0.04;
  return input.index % 2 === 0 ? 0.11 : -0.1;
}

function motionDirection(input: { role: string; index: number }): number {
  if (isThreatOverlayRole(input.role)) return -1;
  if (isLogoOverlayRole(input.role)) return 0;
  return input.index % 2 === 0 ? 1 : -1;
}

async function poseOverlay(input: {
  bytes: Buffer;
  role: string;
  index: number;
  width: number;
  height: number;
}): Promise<{ input: Buffer; width: number; height: number }> {
  const angle = dynamicPoseAngle({ role: input.role, index: input.index });
  const shear = dynamicPoseShear({ role: input.role, index: input.index });
  if (angle === 0 && shear === 0) return { input: input.bytes, width: input.width, height: input.height };

  try {
    const { data, info } = await sharp(input.bytes, { failOn: "none" })
      .affine([[1, shear], [0, 1]], {
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer({ resolveWithObject: true });
    return { input: data, width: info.width, height: info.height };
  } catch {
    return { input: input.bytes, width: input.width, height: input.height };
  }
}

function overlayPosition(input: {
  role: string;
  index: number;
  characterCount: number;
  canvasWidth: number;
  canvasHeight: number;
  overlayWidth: number;
  overlayHeight: number;
}): { left: number; top: number } {
  const marginX = input.canvasWidth * 0.055;
  const marginY = input.canvasHeight * 0.065;

  if (isLogoOverlayRole(input.role)) {
    return {
      left: clampInteger((input.canvasWidth - input.overlayWidth) / 2, 0, input.canvasWidth - input.overlayWidth),
      top: clampInteger(input.canvasHeight * 0.045, 0, input.canvasHeight - input.overlayHeight),
    };
  }

  if (isThreatOverlayRole(input.role)) {
    return {
      left: clampInteger(input.canvasWidth * 0.55, 0, input.canvasWidth - input.overlayWidth),
      top: clampInteger(input.canvasHeight * 0.3, 0, input.canvasHeight - input.overlayHeight - marginY),
    };
  }

  const anchorsByCount: Record<number, { x: number; y: number }[]> = {
    1: [{ x: 0.2, y: 0.55 }],
    2: [{ x: 0.18, y: 0.59 }, { x: 0.38, y: 0.56 }],
    3: [{ x: 0.12, y: 0.59 }, { x: 0.34, y: 0.56 }, { x: 0.62, y: 0.52 }],
  };
  const anchors = anchorsByCount[Math.max(1, Math.min(3, input.characterCount))] ?? [{ x: 0.12, y: 0.55 }];
  const anchor = anchors[input.index] || anchors[anchors.length - 1] || { x: 0.12, y: 0.55 };
  return {
    left: clampInteger(input.canvasWidth * anchor.x, 0, input.canvasWidth - input.overlayWidth),
    top: clampInteger(input.canvasHeight * anchor.y, 0, input.canvasHeight - input.overlayHeight - marginY),
  };
}

async function stylizeOverlay(input: {
  bytes: Buffer;
  role: string;
  width: number;
  height: number;
}): Promise<{ input: Buffer; width: number; height: number; leftPad: number; topPad: number } | null> {
  const logoRole = isLogoOverlayRole(input.role);
  const pad = clampInteger(Math.max(input.width, input.height) * (logoRole ? 0.06 : 0.1), 10, 58);
  const shadowDy = logoRole ? 7 : 15;
  const shadowBlur = logoRole ? 6 : 12;
  const floodOpacity = logoRole ? 0.34 : 0.42;
  const imageHref = `data:image/png;base64,${input.bytes.toString("base64")}`;
  const svg = `
    <svg width="${input.width + pad * 2}" height="${input.height + pad * 2}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="posterDropShadow" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="${shadowDy}" stdDeviation="${shadowBlur}" flood-color="#1c120c" flood-opacity="${floodOpacity}"/>
        </filter>
      </defs>
      <image href="${imageHref}" x="${pad}" y="${pad}" width="${input.width}" height="${input.height}" preserveAspectRatio="xMidYMid meet" filter="url(#posterDropShadow)"/>
    </svg>
  `;

  try {
    const composited = await sharp(Buffer.from(svg), { failOn: "none" }).png().toBuffer();
    return {
      input: composited,
      width: input.width + pad * 2,
      height: input.height + pad * 2,
      leftPad: pad,
      topPad: pad,
    };
  } catch {
    return null;
  }
}

function createMotionGhost(input: {
  bytes: Buffer;
  role: string;
  index: number;
  width: number;
  height: number;
}): { input: Buffer; width: number; height: number; leftPad: number; topPad: number } | null {
  if (isLogoOverlayRole(input.role)) return null;
  const threatRole = isThreatOverlayRole(input.role);
  const direction = motionDirection({ role: input.role, index: input.index });
  const width = clampInteger(input.width * 1.32, input.width + 20, input.width * 1.8);
  const height = clampInteger(input.height * 1.14, input.height + 12, input.height * 1.45);
  const imageHref = `data:image/png;base64,${input.bytes.toString("base64")}`;
  const mainX = direction > 0 ? width * 0.1 : width * 0.22;
  const ghostX1 = mainX - direction * width * 0.12;
  const ghostX2 = mainX - direction * width * 0.22;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="motionBlur"><feGaussianBlur stdDeviation="${Math.max(2.5, input.width * 0.012)}"/></filter>
        <filter id="softBlur"><feGaussianBlur stdDeviation="${Math.max(1.5, input.width * 0.006)}"/></filter>
      </defs>
      <image href="${imageHref}" x="${ghostX2}" y="${height * 0.06}" width="${input.width}" height="${input.height}" preserveAspectRatio="xMidYMid meet" opacity="${threatRole ? 0.14 : 0.1}" filter="url(#motionBlur)"/>
      <image href="${imageHref}" x="${ghostX1}" y="${height * 0.04}" width="${input.width}" height="${input.height}" preserveAspectRatio="xMidYMid meet" opacity="${threatRole ? 0.2 : 0.16}" filter="url(#softBlur)"/>
    </svg>
  `;
  return {
    input: Buffer.from(svg),
    width,
    height,
    leftPad: Math.round(mainX),
    topPad: Math.round(height * 0.04),
  };
}

function createGroundShadow(input: {
  width: number;
  height: number;
  canvasWidth: number;
}): Buffer {
  const shadowWidth = clampInteger(input.width * 0.92, 24, input.canvasWidth);
  const shadowHeight = clampInteger(Math.max(input.height * 0.13, 16), 10, 70);
  const svg = `
    <svg width="${shadowWidth}" height="${shadowHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="blur"><feGaussianBlur stdDeviation="${Math.max(3, shadowHeight * 0.18)}"/></filter>
      </defs>
      <ellipse cx="${shadowWidth / 2}" cy="${shadowHeight / 2}" rx="${shadowWidth * 0.42}" ry="${shadowHeight * 0.28}" fill="#1b120d" opacity="0.34" filter="url(#blur)"/>
    </svg>
  `;
  return Buffer.from(svg);
}

function createAssetBacklight(input: {
  role: string;
  width: number;
  height: number;
}): Buffer {
  const logoRole = isLogoOverlayRole(input.role);
  const threatRole = isThreatOverlayRole(input.role);
  const width = clampInteger(input.width * (logoRole ? 1.42 : 1.34), 32, input.width * 2.2);
  const height = clampInteger(input.height * (logoRole ? 1.34 : 1.22), 28, input.height * 2.1);
  const warmOpacity = threatRole ? 0.36 : logoRole ? 0.26 : 0.28;
  const coolOpacity = threatRole ? 0.24 : 0.16;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="warm" cx="50%" cy="48%" r="58%">
          <stop offset="0" stop-color="#fff0a6" stop-opacity="${warmOpacity}"/>
          <stop offset="0.48" stop-color="#ffb24d" stop-opacity="${warmOpacity * 0.55}"/>
          <stop offset="1" stop-color="#ffb24d" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="cool" cx="54%" cy="42%" r="62%">
          <stop offset="0" stop-color="#6fe9ff" stop-opacity="${coolOpacity}"/>
          <stop offset="1" stop-color="#6fe9ff" stop-opacity="0"/>
        </radialGradient>
        <filter id="blur"><feGaussianBlur stdDeviation="${Math.max(8, Math.min(width, height) * 0.05)}"/></filter>
      </defs>
      <ellipse cx="${width / 2}" cy="${height / 2}" rx="${width * 0.42}" ry="${height * 0.38}" fill="url(#warm)" filter="url(#blur)"/>
      <ellipse cx="${width * 0.58}" cy="${height * 0.38}" rx="${width * 0.28}" ry="${height * 0.26}" fill="url(#cool)" filter="url(#blur)"/>
    </svg>
  `;
  return Buffer.from(svg);
}

function createDirectionalRimLight(input: {
  role: string;
  index: number;
  width: number;
  height: number;
}): { input: Buffer; width: number; height: number; leftPad: number; topPad: number } | null {
  if (isLogoOverlayRole(input.role)) return null;
  const threatRole = isThreatOverlayRole(input.role);
  const direction = motionDirection({ role: input.role, index: input.index });
  const width = clampInteger(input.width * 1.18, input.width + 16, input.width * 1.5);
  const height = clampInteger(input.height * 1.16, input.height + 16, input.height * 1.5);
  const edgeX = direction > 0 ? width * 0.72 : width * 0.28;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="rim" cx="${direction > 0 ? "72%" : "28%"}" cy="42%" r="44%">
          <stop offset="0" stop-color="#fff7bd" stop-opacity="${threatRole ? 0.24 : 0.2}"/>
          <stop offset="0.45" stop-color="#7eefff" stop-opacity="${threatRole ? 0.18 : 0.14}"/>
          <stop offset="1" stop-color="#7eefff" stop-opacity="0"/>
        </radialGradient>
        <filter id="soft"><feGaussianBlur stdDeviation="${Math.max(5, input.width * 0.018)}"/></filter>
      </defs>
      <ellipse cx="${edgeX}" cy="${height * 0.46}" rx="${width * 0.22}" ry="${height * 0.4}" fill="url(#rim)" filter="url(#soft)"/>
      <path d="M${edgeX} ${height * 0.1} C${edgeX + direction * width * 0.12} ${height * 0.38},${edgeX + direction * width * 0.08} ${height * 0.68},${edgeX - direction * width * 0.04} ${height * 0.94}"
        fill="none" stroke="#fff6c7" stroke-width="${Math.max(4, input.width * 0.014)}" stroke-linecap="round" opacity="0.26" filter="url(#soft)"/>
    </svg>
  `;
  return {
    input: Buffer.from(svg),
    width,
    height,
    leftPad: Math.round((width - input.width) / 2),
    topPad: Math.round((height - input.height) / 2),
  };
}

function createAssetSceneGlaze(input: {
  bytes: Buffer;
  role: string;
  index: number;
  width: number;
  height: number;
}): Buffer | null {
  if (isLogoOverlayRole(input.role)) return null;
  const direction = motionDirection({ role: input.role, index: input.index });
  const threatRole = isThreatOverlayRole(input.role);
  const warmOpacity = threatRole ? 0.22 : 0.16;
  const coolOpacity = threatRole ? 0.14 : 0.1;
  const svg = `
    <svg width="${input.width}" height="${input.height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="warmWash" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff0a6" stop-opacity="${warmOpacity}"/>
          <stop offset="0.52" stop-color="#ff9f4c" stop-opacity="${warmOpacity * 0.42}"/>
          <stop offset="1" stop-color="#ff6a38" stop-opacity="0"/>
        </linearGradient>
        <radialGradient id="coolRim" cx="${direction > 0 ? "78%" : "22%"}" cy="34%" r="62%">
          <stop offset="0" stop-color="#9ff3ff" stop-opacity="${coolOpacity}"/>
          <stop offset="0.45" stop-color="#9ff3ff" stop-opacity="${coolOpacity * 0.45}"/>
          <stop offset="1" stop-color="#9ff3ff" stop-opacity="0"/>
        </radialGradient>
        <filter id="soft"><feGaussianBlur stdDeviation="${Math.max(1.4, input.width * 0.004)}"/></filter>
      </defs>
      <ellipse cx="${input.width * 0.5}" cy="${input.height * 0.46}" rx="${input.width * 0.46}" ry="${input.height * 0.44}" fill="url(#warmWash)" filter="url(#soft)"/>
      <ellipse cx="${input.width * (direction > 0 ? 0.72 : 0.28)}" cy="${input.height * 0.34}" rx="${input.width * 0.24}" ry="${input.height * 0.4}" fill="url(#coolRim)" filter="url(#soft)"/>
      <path d="M${input.width * (direction > 0 ? 0.18 : 0.82)} ${input.height * 0.18} C${input.width * 0.45} ${input.height * 0.38},${input.width * 0.58} ${input.height * 0.7},${input.width * (direction > 0 ? 0.88 : 0.12)} ${input.height * 0.84}"
        fill="none" stroke="#fff4b8" stroke-width="${Math.max(3, input.width * 0.01)}" stroke-linecap="round" opacity="${threatRole ? 0.18 : 0.12}" filter="url(#soft)"/>
    </svg>
  `;
  return Buffer.from(svg);
}

function createActionEffect(input: {
  role: string;
  index: number;
  width: number;
  height: number;
}): { input: Buffer; width: number; height: number; leftPad: number; topPad: number } | null {
  if (isLogoOverlayRole(input.role)) return null;

  if (isThreatOverlayRole(input.role)) {
    const width = clampInteger(input.width * 1.55, 64, input.width * 2);
    const height = clampInteger(input.height * 1.3, 64, input.height * 1.8);
    const rays = Array.from({ length: 14 }, (_, index) => {
      const angle = -55 + index * 8;
      const x1 = width * 0.45;
      const y1 = height * 0.53;
      const x2 = x1 + Math.cos((angle * Math.PI) / 180) * width * (0.34 + (index % 3) * 0.045);
      const y2 = y1 + Math.sin((angle * Math.PI) / 180) * height * (0.32 + (index % 2) * 0.05);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff0a2" stroke-width="${Math.max(4, width * 0.01)}" stroke-linecap="round" opacity="${0.2 + (index % 3) * 0.08}"/>`;
    }).join("");
    const splashes = Array.from({ length: 18 }, (_, index) => {
      const x = width * (0.22 + ((index * 37) % 62) / 100);
      const y = height * (0.18 + ((index * 23) % 62) / 100);
      const radius = Math.max(3, input.width * (0.012 + (index % 4) * 0.003));
      const color = index % 3 === 0 ? "#ff4a2f" : index % 3 === 1 ? "#ffe06d" : "#fff7c5";
      return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" opacity="${0.45 + (index % 3) * 0.08}"/>`;
    }).join("");
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="burst" cx="45%" cy="53%" r="52%">
            <stop offset="0" stop-color="#fff4a8" stop-opacity="0.46"/>
            <stop offset="0.46" stop-color="#ff9d42" stop-opacity="0.22"/>
            <stop offset="1" stop-color="#ff6b24" stop-opacity="0"/>
          </radialGradient>
          <filter id="soft"><feGaussianBlur stdDeviation="${Math.max(4, width * 0.018)}"/></filter>
        </defs>
        <ellipse cx="${width * 0.45}" cy="${height * 0.56}" rx="${width * 0.34}" ry="${height * 0.28}" fill="url(#burst)" filter="url(#soft)"/>
        ${rays}
        ${splashes}
        <path d="M${width * 0.16} ${height * 0.74} C${width * 0.36} ${height * 0.58},${width * 0.64} ${height * 0.62},${width * 0.88} ${height * 0.44}" fill="none" stroke="#fff3af" stroke-width="${Math.max(7, width * 0.022)}" stroke-linecap="round" opacity="0.34"/>
      </svg>
    `;
    return {
      input: Buffer.from(svg),
      width,
      height,
      leftPad: Math.round((width - input.width) * 0.34),
      topPad: Math.round((height - input.height) * 0.2),
    };
  }

  const width = clampInteger(input.width * 1.5, 48, input.width * 2);
  const height = clampInteger(input.height * 1.14, 36, input.height * 1.5);
  const flip = motionDirection({ role: input.role, index: input.index });
  const startX = flip > 0 ? width * 0.05 : width * 0.92;
  const endX = flip > 0 ? width * 0.9 : width * 0.12;
  const midX = flip > 0 ? width * 0.44 : width * 0.56;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="blur"><feGaussianBlur stdDeviation="${Math.max(2, width * 0.006)}"/></filter>
      </defs>
      <path d="M${startX} ${height * 0.62} C${midX} ${height * 0.22},${midX} ${height * 0.9},${endX} ${height * 0.45}"
        fill="none" stroke="#fff2a8" stroke-width="${Math.max(6, width * 0.022)}" stroke-linecap="round" opacity="0.38" filter="url(#blur)"/>
      <path d="M${startX} ${height * 0.7} C${midX} ${height * 0.34},${midX} ${height * 0.86},${endX} ${height * 0.58}"
        fill="none" stroke="#ff7545" stroke-width="${Math.max(3, width * 0.012)}" stroke-linecap="round" opacity="0.34"/>
      <line x1="${flip > 0 ? width * 0.06 : width * 0.92}" y1="${height * 0.38}" x2="${flip > 0 ? width * 0.32 : width * 0.66}" y2="${height * 0.28}" stroke="#fff7cf" stroke-width="${Math.max(3, width * 0.01)}" stroke-linecap="round" opacity="0.42"/>
      <line x1="${flip > 0 ? width * 0.04 : width * 0.94}" y1="${height * 0.52}" x2="${flip > 0 ? width * 0.3 : width * 0.68}" y2="${height * 0.48}" stroke="#fff7cf" stroke-width="${Math.max(2, width * 0.008)}" stroke-linecap="round" opacity="0.34"/>
      <circle cx="${endX}" cy="${height * 0.52}" r="${Math.max(3, width * 0.016)}" fill="#fff2a8" opacity="0.42"/>
      <path d="M${startX} ${height * 0.84} C${midX} ${height * 0.64},${midX} ${height * 0.48},${endX} ${height * 0.34}"
        fill="none" stroke="#7eeaff" stroke-width="${Math.max(2, width * 0.008)}" stroke-linecap="round" opacity="0.22"/>
    </svg>
  `;
  return {
    input: Buffer.from(svg),
    width,
    height,
    leftPad: input.index % 2 === 0 ? Math.round(input.width * 0.3) : Math.round(input.width * 0.18),
    topPad: Math.round(input.height * 0.08),
  };
}

function createForegroundAnchor(input: {
  role: string;
  width: number;
  height: number;
}): { input: Buffer; width: number; height: number; leftPad: number; topPad: number } | null {
  if (isLogoOverlayRole(input.role)) return null;
  const threatRole = isThreatOverlayRole(input.role);
  const width = clampInteger(input.width * (threatRole ? 1.06 : 0.96), 32, input.width * 1.35);
  const height = clampInteger(input.height * (threatRole ? 0.18 : 0.16), 18, input.height * 0.28);
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="soft"><feGaussianBlur stdDeviation="${Math.max(1.8, height * 0.12)}"/></filter>
        <linearGradient id="cheese" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff2a8" stop-opacity="0.8"/>
          <stop offset="1" stop-color="#ff9e3a" stop-opacity="0.62"/>
        </linearGradient>
      </defs>
      <ellipse cx="${width * 0.5}" cy="${height * 0.68}" rx="${width * 0.43}" ry="${height * 0.23}" fill="#26130c" opacity="0.26" filter="url(#soft)"/>
      <path d="M${width * 0.08} ${height * 0.52} C${width * 0.26} ${height * 0.26},${width * 0.42} ${height * 0.82},${width * 0.58} ${height * 0.48} C${width * 0.72} ${height * 0.18},${width * 0.86} ${height * 0.52},${width * 0.95} ${height * 0.36}"
        fill="none" stroke="url(#cheese)" stroke-width="${Math.max(5, height * 0.28)}" stroke-linecap="round" opacity="0.72"/>
      <circle cx="${width * 0.22}" cy="${height * 0.36}" r="${Math.max(2, height * 0.1)}" fill="#ff5b38" opacity="0.6"/>
      <circle cx="${width * 0.76}" cy="${height * 0.54}" r="${Math.max(2, height * 0.08)}" fill="#fff7c5" opacity="0.54"/>
    </svg>
  `;
  return {
    input: Buffer.from(svg),
    width,
    height,
    leftPad: Math.round((width - input.width) / 2),
    topPad: Math.round(height * -0.18),
  };
}

function createPosterFinishOverlay(input: {
  canvasWidth: number;
  canvasHeight: number;
}): Buffer {
  const { canvasWidth: width, canvasHeight: height } = input;
  const particleCount = 34;
  const particles = Array.from({ length: particleCount }, (_, index) => {
    const x = (index * 137) % width;
    const y = height * 0.18 + ((index * 83) % Math.round(height * 0.58));
    const radius = 1.2 + (index % 5) * 0.55;
    const opacity = 0.07 + (index % 4) * 0.025;
    return `<circle cx="${x}" cy="${y}" r="${radius}" fill="#fff4bf" opacity="${opacity}"/>`;
  }).join("");
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="centerWarm" cx="52%" cy="42%" r="66%">
          <stop offset="0" stop-color="#fff1a6" stop-opacity="0.12"/>
          <stop offset="0.44" stop-color="#ffb65a" stop-opacity="0.045"/>
          <stop offset="1" stop-color="#ffb65a" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="vignette" cx="50%" cy="46%" r="76%">
          <stop offset="0.58" stop-color="#000000" stop-opacity="0"/>
          <stop offset="1" stop-color="#1b1016" stop-opacity="0.24"/>
        </radialGradient>
        <linearGradient id="topLight" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
          <stop offset="0.28" stop-color="#ffffff" stop-opacity="0.04"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </linearGradient>
        <filter id="soft"><feGaussianBlur stdDeviation="${Math.max(10, width * 0.012)}"/></filter>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#centerWarm)"/>
      <polygon points="0,0 ${width * 0.55},0 ${width * 0.28},${height}" fill="url(#topLight)" filter="url(#soft)"/>
      <polygon points="${width * 0.52},0 ${width},0 ${width * 0.72},${height}" fill="url(#topLight)" opacity="0.55" filter="url(#soft)"/>
      ${particles}
      <rect width="${width}" height="${height}" fill="url(#vignette)"/>
    </svg>
  `;
  return Buffer.from(svg);
}

function createKvStageLightingOverlay(input: {
  canvasWidth: number;
  canvasHeight: number;
}): Buffer {
  const { canvasWidth: width, canvasHeight: height } = input;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bossPool" cx="62%" cy="54%" r="28%">
          <stop offset="0" stop-color="#fff0a6" stop-opacity="0.2"/>
          <stop offset="0.45" stop-color="#ff9b3d" stop-opacity="0.08"/>
          <stop offset="1" stop-color="#ff9b3d" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="leftHeroPool" cx="20%" cy="67%" r="24%">
          <stop offset="0" stop-color="#fff7c8" stop-opacity="0.18"/>
          <stop offset="1" stop-color="#fff7c8" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="rightHeroPool" cx="77%" cy="68%" r="22%">
          <stop offset="0" stop-color="#bfeeff" stop-opacity="0.14"/>
          <stop offset="1" stop-color="#bfeeff" stop-opacity="0"/>
        </radialGradient>
        <filter id="wideBlur"><feGaussianBlur stdDeviation="${Math.max(10, width * 0.014)}"/></filter>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bossPool)" filter="url(#wideBlur)"/>
      <rect width="${width}" height="${height}" fill="url(#leftHeroPool)" filter="url(#wideBlur)"/>
      <rect width="${width}" height="${height}" fill="url(#rightHeroPool)" filter="url(#wideBlur)"/>
      <path d="M${width * 0.12} ${height * 0.78} C${width * 0.32} ${height * 0.58},${width * 0.58} ${height * 0.72},${width * 0.88} ${height * 0.38}" fill="none" stroke="#fff4bc" stroke-width="${Math.max(8, width * 0.01)}" stroke-linecap="round" opacity="0.15" filter="url(#wideBlur)"/>
      <path d="M${width * 0.05} ${height * 0.62} C${width * 0.36} ${height * 0.46},${width * 0.54} ${height * 0.36},${width * 0.82} ${height * 0.22}" fill="none" stroke="#ff7040" stroke-width="${Math.max(5, width * 0.006)}" stroke-linecap="round" opacity="0.12" filter="url(#wideBlur)"/>
    </svg>
  `;
  return Buffer.from(svg);
}

function createForegroundDepthOverlay(input: {
  canvasWidth: number;
  canvasHeight: number;
}): Buffer {
  const { canvasWidth: width, canvasHeight: height } = input;
  const leaves = Array.from({ length: 16 }, (_, index) => {
    const x = (index * 149) % width;
    const y = height * (0.72 + ((index * 31) % 20) / 100);
    const rotate = (index * 37) % 90 - 45;
    const scale = 0.72 + (index % 5) * 0.12;
    return `<ellipse cx="${x}" cy="${y}" rx="${width * 0.01 * scale}" ry="${height * 0.006 * scale}" fill="#2d5c35" opacity="${0.12 + (index % 3) * 0.035}" transform="rotate(${rotate} ${x} ${y})"/>`;
  }).join("");
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bottomDepth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#000000" stop-opacity="0"/>
          <stop offset="0.72" stop-color="#25160f" stop-opacity="0.02"/>
          <stop offset="1" stop-color="#25160f" stop-opacity="0.16"/>
        </linearGradient>
        <filter id="soft"><feGaussianBlur stdDeviation="${Math.max(4, width * 0.006)}"/></filter>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bottomDepth)"/>
      <path d="M0 ${height * 0.83} C${width * 0.18} ${height * 0.74},${width * 0.38} ${height * 0.92},${width * 0.58} ${height * 0.8} C${width * 0.74} ${height * 0.7},${width * 0.88} ${height * 0.88},${width} ${height * 0.79} L${width} ${height} L0 ${height} Z"
        fill="#ffbf53" opacity="0.1" filter="url(#soft)"/>
      <path d="M${width * 0.04} ${height * 0.8} C${width * 0.24} ${height * 0.72},${width * 0.56} ${height * 0.93},${width * 0.95} ${height * 0.76}"
        fill="none" stroke="#fff0a8" stroke-width="${Math.max(6, width * 0.007)}" stroke-linecap="round" opacity="0.16" filter="url(#soft)"/>
      ${leaves}
    </svg>
  `;
  return Buffer.from(svg);
}

function createCinematicVfxBridgeOverlay(input: {
  canvasWidth: number;
  canvasHeight: number;
}): Buffer {
  const { canvasWidth: width, canvasHeight: height } = input;
  const embers = Array.from({ length: 42 }, (_, index) => {
    const x = width * 0.08 + ((index * 97) % Math.round(width * 0.84));
    const y = height * 0.25 + ((index * 71) % Math.round(height * 0.55));
    const radius = 1.2 + (index % 6) * 0.55;
    const color = index % 4 === 0 ? "#ff6842" : index % 4 === 1 ? "#fff1a8" : index % 4 === 2 ? "#b7f3ff" : "#ffbb5a";
    const opacity = 0.18 + (index % 5) * 0.035;
    return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" opacity="${opacity}"/>`;
  }).join("");
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="wideBlur"><feGaussianBlur stdDeviation="${Math.max(8, width * 0.01)}"/></filter>
        <filter id="softBlur"><feGaussianBlur stdDeviation="${Math.max(2, width * 0.004)}"/></filter>
        <linearGradient id="sauceSlash" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#ff4f30" stop-opacity="0"/>
          <stop offset="0.28" stop-color="#ff4f30" stop-opacity="0.42"/>
          <stop offset="0.62" stop-color="#ffe36f" stop-opacity="0.34"/>
          <stop offset="1" stop-color="#ffe36f" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="steam" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
          <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.22"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="M${width * 0.12} ${height * 0.72} C${width * 0.32} ${height * 0.5},${width * 0.55} ${height * 0.68},${width * 0.82} ${height * 0.34}"
        fill="none" stroke="url(#sauceSlash)" stroke-width="${Math.max(18, width * 0.018)}" stroke-linecap="round" opacity="0.42" filter="url(#softBlur)"/>
      <path d="M${width * 0.18} ${height * 0.81} C${width * 0.38} ${height * 0.7},${width * 0.61} ${height * 0.78},${width * 0.9} ${height * 0.56}"
        fill="none" stroke="#fff2aa" stroke-width="${Math.max(7, width * 0.007)}" stroke-linecap="round" opacity="0.24" filter="url(#softBlur)"/>
      <path d="M${width * 0.04} ${height * 0.94} C${width * 0.28} ${height * 0.76},${width * 0.48} ${height * 0.96},${width * 0.76} ${height * 0.78} C${width * 0.88} ${height * 0.7},${width * 0.94} ${height * 0.76},${width} ${height * 0.7}"
        fill="#2a150d" opacity="0.12" filter="url(#wideBlur)"/>
      <path d="M${width * 0.08} ${height * 0.28} C${width * 0.24} ${height * 0.06},${width * 0.58} ${height * 0.14},${width * 0.86} ${height * 0.02}"
        fill="none" stroke="url(#steam)" stroke-width="${Math.max(32, width * 0.025)}" stroke-linecap="round" opacity="0.34" filter="url(#wideBlur)"/>
      <path d="M${width * 0.54} ${height * 0.08} C${width * 0.5} ${height * 0.34},${width * 0.62} ${height * 0.54},${width * 0.48} ${height * 0.86}"
        fill="none" stroke="#ffffff" stroke-width="${Math.max(14, width * 0.011)}" stroke-linecap="round" opacity="0.1" filter="url(#wideBlur)"/>
      ${embers}
    </svg>
  `;
  return Buffer.from(svg);
}

function splitSloganLines(slogan: string): string[] {
  const normalized = slogan.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";
  const target = normalized.length > 34 ? 21 : 18;
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > target && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function createSloganBanner(input: {
  slogan: string;
  canvasWidth: number;
  canvasHeight: number;
}): { input: Buffer; left: number; top: number; width: number; height: number } | null {
  const lines = splitSloganLines(input.slogan);
  if (lines.length === 0) return null;

  const width = clampInteger(input.canvasWidth * 0.32, 320, input.canvasWidth * 0.42);
  const height = clampInteger(input.canvasHeight * (lines.length > 2 ? 0.16 : 0.13), 96, input.canvasHeight * 0.2);
  const left = clampInteger(input.canvasWidth - width - input.canvasWidth * 0.055, 0, input.canvasWidth - width);
  const top = clampInteger(input.canvasHeight - height - input.canvasHeight * 0.075, 0, input.canvasHeight - height);
  const fontSize = clampInteger(height / (lines.length + 1.2), 24, 54);
  const lineHeight = Math.round(fontSize * 1.05);
  const textTop = Math.round((height - lineHeight * lines.length) / 2 + fontSize * 0.78);
  const textSpans = lines.map((line, index) => `
    <text x="${width / 2}" y="${textTop + index * lineHeight}" text-anchor="middle"
      font-family="Arial Rounded MT Bold, Avenir Next Heavy, Helvetica, sans-serif"
      font-size="${fontSize}" font-weight="900" letter-spacing="0"
      fill="#ffe56d" stroke="#4f2614" stroke-width="${Math.max(4, fontSize * 0.12)}" paint-order="stroke fill">
      ${escapeSvgText(line)}
    </text>
  `).join("");
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="bannerShadow" x="-20%" y="-30%" width="140%" height="170%">
          <feDropShadow dx="0" dy="${Math.max(8, height * 0.08)}" stdDeviation="${Math.max(5, height * 0.06)}" flood-color="#1b120d" flood-opacity="0.38"/>
        </filter>
        <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff4c7"/>
          <stop offset="0.52" stop-color="#ffd980"/>
          <stop offset="1" stop-color="#e09c48"/>
        </linearGradient>
      </defs>
      <path d="M${width * 0.07} ${height * 0.18} C${width * 0.24} ${height * 0.04},${width * 0.76} ${height * 0.04},${width * 0.93} ${height * 0.18} L${width * 0.88} ${height * 0.86} C${width * 0.7} ${height * 0.96},${width * 0.3} ${height * 0.96},${width * 0.12} ${height * 0.86} Z"
        fill="url(#paper)" stroke="#6e3519" stroke-width="${Math.max(5, height * 0.045)}" filter="url(#bannerShadow)"/>
      ${textSpans}
    </svg>
  `;
  return { input: Buffer.from(svg), left, top, width, height };
}

export async function applyPosterAssetOverlays(input: {
  dataUrl: string | null;
  width: number;
  height: number;
  assets: PosterAssetOverlayInputAsset[];
  slogan?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<PosterAssetOverlayResult> {
  const attemptedAssetIds = input.assets.map((asset) => asset.id);
  const base = input.dataUrl ? decodeDataUrl(input.dataUrl) : null;
  if (!base || input.assets.length === 0) {
    return {
      dataUrl: input.dataUrl,
      overlays: [],
      processing: attemptedAssetIds.length > 0
        ? { strategy: "uploadedAssetOverlay", attemptedAssetIds, applied: [], sloganApplied: false, tokenCost: 0 }
        : null,
    };
  }

  const fetchImpl = input.fetchImpl || globalThis.fetch?.bind(globalThis);
  const characterCount = input.assets.filter((asset) => asset.role === "gameCharacter").length;
  const composites: sharp.OverlayOptions[] = [];
  const overlays: AppliedPosterAssetOverlay[] = [];
  let characterIndex = 0;

  composites.push({
    input: createKvStageLightingOverlay({
      canvasWidth: input.width,
      canvasHeight: input.height,
    }),
    left: 0,
    top: 0,
  });

  for (const asset of input.assets) {
    const bytes = await loadOverlayBytes(asset, fetchImpl);
    if (!bytes) continue;
    const rawResized = await resizeOverlay({
      bytes,
      width: targetOverlayWidth({
        role: asset.role,
        canvasWidth: input.width,
        characterCount,
      }),
      maxHeight: maxOverlayHeight({
        role: asset.role,
        canvasHeight: input.height,
      }),
    });
    const index = asset.role === "gameCharacter" ? characterIndex++ : 0;
    if (!rawResized) continue;
    const resized = await poseOverlay({
      bytes: rawResized.input,
      role: asset.role,
      index,
      width: rawResized.width,
      height: rawResized.height,
    });
    const position = overlayPosition({
      role: asset.role,
      index,
      characterCount,
      canvasWidth: input.width,
      canvasHeight: input.height,
      overlayWidth: resized.width,
      overlayHeight: resized.height,
    });
    const backlight = createAssetBacklight({
      role: asset.role,
      width: resized.width,
      height: resized.height,
    });
    composites.push({
      input: backlight,
      left: clampInteger(
        position.left + resized.width * 0.5 - (resized.width * (isLogoOverlayRole(asset.role) ? 1.42 : 1.34)) * 0.5,
        0,
        input.width,
      ),
      top: clampInteger(
        position.top + resized.height * 0.48 - (resized.height * (isLogoOverlayRole(asset.role) ? 1.34 : 1.22)) * 0.5,
        0,
        input.height,
      ),
    });
    const motionGhost = createMotionGhost({
      bytes: resized.input,
      role: asset.role,
      index,
      width: resized.width,
      height: resized.height,
    });
    if (motionGhost) {
      composites.push({
        input: motionGhost.input,
        left: clampInteger(position.left - motionGhost.leftPad, 0, Math.max(0, input.width - motionGhost.width)),
        top: clampInteger(position.top - motionGhost.topPad, 0, Math.max(0, input.height - motionGhost.height)),
      });
    }
    const actionEffect = createActionEffect({
      role: asset.role,
      index,
      width: resized.width,
      height: resized.height,
    });
    if (actionEffect) {
      composites.push({
        input: actionEffect.input,
        left: clampInteger(position.left - actionEffect.leftPad, 0, Math.max(0, input.width - actionEffect.width)),
        top: clampInteger(position.top - actionEffect.topPad, 0, Math.max(0, input.height - actionEffect.height)),
      });
    }
    if (!isLogoOverlayRole(asset.role)) {
      const groundShadow = createGroundShadow({
        width: resized.width,
        height: resized.height,
        canvasWidth: input.width,
      });
      composites.push({
        input: groundShadow,
        left: clampInteger(position.left + resized.width * 0.04, 0, input.width),
        top: clampInteger(position.top + resized.height * 0.86, 0, input.height),
      });
    }
    const rimLight = createDirectionalRimLight({
      role: asset.role,
      index,
      width: resized.width,
      height: resized.height,
    });
    if (rimLight) {
      composites.push({
        input: rimLight.input,
        left: clampInteger(position.left - rimLight.leftPad, 0, Math.max(0, input.width - rimLight.width)),
        top: clampInteger(position.top - rimLight.topPad, 0, Math.max(0, input.height - rimLight.height)),
      });
    }
    const styled = await stylizeOverlay({
      bytes: resized.input,
      role: asset.role,
      width: resized.width,
      height: resized.height,
    });
    const overlayInput = styled?.input || resized.input;
    const overlayLeft = styled ? position.left - styled.leftPad : position.left;
    const overlayTop = styled ? position.top - styled.topPad : position.top;
    const overlayWidth = styled?.width || resized.width;
    const overlayHeight = styled?.height || resized.height;
    composites.push({
      input: overlayInput,
      left: clampInteger(overlayLeft, 0, Math.max(0, input.width - overlayWidth)),
      top: clampInteger(overlayTop, 0, Math.max(0, input.height - overlayHeight)),
    });
    const sceneGlaze = createAssetSceneGlaze({
      bytes: resized.input,
      role: asset.role,
      index,
      width: resized.width,
      height: resized.height,
    });
    if (sceneGlaze) {
      composites.push({
        input: sceneGlaze,
        left: position.left,
        top: position.top,
      });
    }
    const foregroundAnchor = createForegroundAnchor({
      role: asset.role,
      width: resized.width,
      height: resized.height,
    });
    if (foregroundAnchor) {
      composites.push({
        input: foregroundAnchor.input,
        left: clampInteger(position.left - foregroundAnchor.leftPad, 0, Math.max(0, input.width - foregroundAnchor.width)),
        top: clampInteger(
          position.top + resized.height - foregroundAnchor.height + foregroundAnchor.topPad,
          0,
          Math.max(0, input.height - foregroundAnchor.height),
        ),
      });
    }
    overlays.push({
      assetId: asset.id,
      role: asset.role,
      label: asset.label,
      left: position.left,
      top: position.top,
      width: resized.width,
      height: resized.height,
    });
  }

  composites.push({
    input: createCinematicVfxBridgeOverlay({
      canvasWidth: input.width,
      canvasHeight: input.height,
    }),
    left: 0,
    top: 0,
  });

  const sloganBanner = input.slogan ? createSloganBanner({
    slogan: input.slogan,
    canvasWidth: input.width,
    canvasHeight: input.height,
  }) : null;
  if (sloganBanner) {
    composites.push({
      input: sloganBanner.input,
      left: sloganBanner.left,
      top: sloganBanner.top,
    });
  }
  composites.push({
    input: createForegroundDepthOverlay({
      canvasWidth: input.width,
      canvasHeight: input.height,
    }),
    left: 0,
    top: 0,
  });
  composites.push({
    input: createPosterFinishOverlay({
      canvasWidth: input.width,
      canvasHeight: input.height,
    }),
    left: 0,
    top: 0,
  });

  if (composites.length === 0) {
    return {
      dataUrl: input.dataUrl,
      overlays,
      processing: { strategy: "uploadedAssetOverlay", attemptedAssetIds, applied: overlays, sloganApplied: false, tokenCost: 0 },
    };
  }

  try {
    const safeComposites = composites.map((item) => ({
      ...item,
      left: clampInteger(Number(item.left) || 0, 0, input.width),
      top: clampInteger(Number(item.top) || 0, 0, input.height),
    }));
    const composited = await sharp(base.bytes, { failOn: "none" })
      .resize({
        width: input.width,
        height: input.height,
        fit: "fill",
        kernel: "lanczos3",
      })
      .composite(safeComposites)
      .modulate({ brightness: 1.015, saturation: 1.08 })
      .sharpen({ sigma: 0.55, m1: 0.7, m2: 1.2 })
      .png()
      .toBuffer();
    return {
      dataUrl: `data:image/png;base64,${composited.toString("base64")}`,
      overlays,
      processing: { strategy: "uploadedAssetOverlay", attemptedAssetIds, applied: overlays, sloganApplied: Boolean(sloganBanner), tokenCost: 0 },
    };
  } catch (error) {
    if (process.env.POSTER_LAB_DEBUG_OVERLAY === "1") {
      console.warn("Poster asset overlay compositing failed", error);
    }
    return {
      dataUrl: input.dataUrl,
      overlays: [],
      processing: { strategy: "uploadedAssetOverlay", attemptedAssetIds, applied: [], sloganApplied: false, tokenCost: 0 },
    };
  }
}
