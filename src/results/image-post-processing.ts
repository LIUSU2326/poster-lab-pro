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
