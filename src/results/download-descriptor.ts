import { z } from "zod";
import {
  StoredResultAssetSchema,
  WorkspaceSnapshotSchema,
  type StoredResultAsset,
  type WorkspaceSnapshot,
} from "../storage/contracts";
import { ResultStoredFileMetadataSchema } from "./file-store";

export const ResultDownloadSourceSchema = z.enum(["assetUrl", "localFile", "thumbnailUrl", "inlineDataUrl", "unavailable"]);

export const ResultDownloadDescriptorSchema = z.object({
  workspaceId: z.string().min(1),
  resultId: z.string().min(1),
  available: z.boolean(),
  source: ResultDownloadSourceSchema,
  fileName: z.string().min(1).max(220),
  mimeType: z.string().min(1),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  url: z.string().url().optional(),
  storageKey: z.string().min(1).optional(),
  checksum: z.string().min(1).optional(),
  byteSize: z.number().int().min(0).optional(),
  dataUrl: z.string().startsWith("data:").optional(),
  message: z.string().min(1),
});

const ProviderResultAssetMetadataSchema = z.object({
  id: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
  url: z.string().url().optional(),
  dataUrl: z.string().startsWith("data:").optional(),
  seed: z.string().optional(),
});

export type ResultDownloadSource = z.infer<typeof ResultDownloadSourceSchema>;
export type ResultDownloadDescriptor = z.infer<typeof ResultDownloadDescriptorSchema>;

function sanitizeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "result";
}

function extensionFromMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  return "bin";
}

function providerAssetFromMetadata(result: StoredResultAsset): z.infer<typeof ProviderResultAssetMetadataSchema> | null {
  const candidate = result.metadata.providerAsset;
  if (!candidate || typeof candidate !== "object") return null;
  const parsed = ProviderResultAssetMetadataSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function resultFileFromMetadata(result: StoredResultAsset): z.infer<typeof ResultStoredFileMetadataSchema> | null {
  const candidate = result.metadata.resultFile;
  if (!candidate || typeof candidate !== "object") return null;
  const parsed = ResultStoredFileMetadataSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function resultDownloadFileName(input: {
  projectName: string;
  result: StoredResultAsset;
  mimeType: string;
}): string {
  const project = sanitizeFilePart(input.projectName);
  const mode = sanitizeFilePart(input.result.mode);
  const scheme = sanitizeFilePart(input.result.schemeId);
  const dimensions = `${input.result.width}x${input.result.height}`;
  const id = sanitizeFilePart(input.result.id);
  return `${project}-${mode}-${scheme}-${dimensions}-${id}.${extensionFromMime(input.mimeType)}`;
}

export function createResultDownloadDescriptor(input: {
  snapshot: WorkspaceSnapshot;
  resultId: string;
}): ResultDownloadDescriptor | null {
  const snapshot = WorkspaceSnapshotSchema.parse(input.snapshot);
  const result = snapshot.results.find((candidate) => candidate.id === input.resultId);
  if (!result) return null;

  const parsedResult = StoredResultAssetSchema.parse(result);
  const providerAsset = providerAssetFromMetadata(parsedResult);
  const resultFile = resultFileFromMetadata(parsedResult);
  const mimeType = resultFile?.mimeType || providerAsset?.mimeType || "image/png";
  const base = {
    workspaceId: snapshot.metadata.workspaceId,
    resultId: parsedResult.id,
    fileName: resultDownloadFileName({
      projectName: snapshot.project.name,
      result: parsedResult,
      mimeType,
    }),
    mimeType,
    width: providerAsset?.width || parsedResult.width,
    height: providerAsset?.height || parsedResult.height,
  };

  if (parsedResult.assetUrl) {
    return ResultDownloadDescriptorSchema.parse({
      ...base,
      available: true,
      source: "assetUrl",
      url: parsedResult.assetUrl,
      message: "Result is available from its stored asset URL.",
    });
  }

  if (resultFile) {
    return ResultDownloadDescriptorSchema.parse({
      ...base,
      available: true,
      source: "localFile",
      storageKey: resultFile.storageKey,
      checksum: resultFile.checksum,
      byteSize: resultFile.byteSize,
      ...(resultFile.publicUrl ? { url: resultFile.publicUrl } : {}),
      message: "Result is available from persisted local file storage.",
    });
  }

  if (providerAsset?.url) {
    return ResultDownloadDescriptorSchema.parse({
      ...base,
      available: true,
      source: "assetUrl",
      url: providerAsset.url,
      message: "Result is available from provider asset metadata.",
    });
  }

  if (providerAsset?.dataUrl) {
    return ResultDownloadDescriptorSchema.parse({
      ...base,
      available: true,
      source: "inlineDataUrl",
      dataUrl: providerAsset.dataUrl,
      message: "Result is available as inline mock provider data.",
    });
  }

  if (parsedResult.thumbnailUrl) {
    return ResultDownloadDescriptorSchema.parse({
      ...base,
      available: true,
      source: "thumbnailUrl",
      url: parsedResult.thumbnailUrl,
      message: "Only a thumbnail URL is available for this result.",
    });
  }

  return ResultDownloadDescriptorSchema.parse({
    ...base,
    available: false,
    source: "unavailable",
    message: "No downloadable asset URL or inline result data is available yet.",
  });
}
