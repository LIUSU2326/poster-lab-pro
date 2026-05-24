import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AssetBinaryUploadResultSchema,
  AssetUploadMimeTypeSchema,
  maxUploadBytes,
  type AssetBinaryUploadResult,
} from "./contracts";

export type LocalAssetBinaryUploadResult = AssetBinaryUploadResult;

export type LocalAssetBinaryUploadInput = {
  workspaceId: string;
  assetId: string;
  storageKey: string;
  mimeType: string;
  bytes: Uint8Array;
  origin: string;
};

function safePathSegment(value: string, label: string): string {
  const segment = String(value || "").trim();
  if (!segment || segment === "." || segment === ".." || !/^[a-zA-Z0-9._-]+$/.test(segment)) {
    throw new Error(`Unsafe ${label} path segment.`);
  }
  return segment;
}

function storageKeySegments(storageKey: string): string[] {
  const segments = String(storageKey || "").replace(/\\/g, "/").split("/");
  if (segments.length === 0) throw new Error("Storage key is empty.");
  return segments.map((segment) => safePathSegment(segment, "storage key"));
}

function assertInsideDirectory(root: string, target: string): void {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Resolved upload path escapes the workspace upload directory.");
  }
}

function publicUploadUrl(origin: string, workspaceId: string, storageSegments: string[]): string {
  const pathSegments = ["uploads", "workspaces", workspaceId, ...storageSegments].map((segment) => encodeURIComponent(segment));
  return new URL(`/${pathSegments.join("/")}`, origin).toString();
}

export async function writeLocalAssetBinary(input: LocalAssetBinaryUploadInput): Promise<LocalAssetBinaryUploadResult> {
  const mimeType = AssetUploadMimeTypeSchema.parse(input.mimeType);
  const byteSize = input.bytes.byteLength;
  if (byteSize < 1 || byteSize > maxUploadBytes) {
    throw new Error(`Asset binary size must be between 1 byte and ${maxUploadBytes} bytes.`);
  }

  const workspaceSegment = safePathSegment(input.workspaceId, "workspace");
  const storageSegments = storageKeySegments(input.storageKey);
  const uploadRoot = path.join(process.cwd(), "public", "uploads", "workspaces", workspaceSegment);
  const targetPath = path.join(uploadRoot, ...storageSegments);
  assertInsideDirectory(uploadRoot, targetPath);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, input.bytes);

  return AssetBinaryUploadResultSchema.parse({
    assetId: input.assetId,
    storageKey: input.storageKey,
    publicUrl: publicUploadUrl(input.origin, workspaceSegment, storageSegments),
    mimeType,
    byteSize,
  });
}
