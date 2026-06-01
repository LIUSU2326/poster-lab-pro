import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const ResultStoredFileMetadataSchema = z.object({
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  byteSize: z.number().int().min(0),
  checksum: z.string().min(1),
  publicUrl: z.string().url().optional(),
  storedAt: z.string().datetime(),
});

export const ResultFileStoreDataUrlInputSchema = z.object({
  workspaceId: z.string().min(1),
  resultId: z.string().min(1),
  fileName: z.string().min(1).max(220),
  dataUrl: z.string().startsWith("data:"),
});

export const ResultStoredFileReadSchema = z.object({
  storageKey: z.string().min(1),
  bytes: z.instanceof(Uint8Array),
});

export type ResultStoredFileMetadata = z.infer<typeof ResultStoredFileMetadataSchema>;
export type ResultFileStoreDataUrlInput = z.input<typeof ResultFileStoreDataUrlInputSchema>;
export type ResultStoredFileRead = z.infer<typeof ResultStoredFileReadSchema>;

export type LocalResultFileStoreOptions = {
  rootDir: string;
  publicBaseUrl?: string;
  now?: () => string;
};

export type LocalResultFileStore = {
  storeDataUrl(input: ResultFileStoreDataUrlInput): Promise<ResultStoredFileMetadata>;
  readStoredFile(storageKey: string): Promise<ResultStoredFileRead>;
  resolvePath(storageKey: string): string;
};

type DecodedDataUrl = {
  mimeType: string;
  bytes: Uint8Array;
};

function sanitizePathPart(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^\.+/g, "")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "item"
  );
}

function extensionFromMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  return "bin";
}

function fileNameWithExtension(fileName: string, mimeType: string): string {
  const sanitized = sanitizePathPart(fileName);
  const expected = extensionFromMime(mimeType);
  const currentExtension = path.extname(sanitized).replace(".", "");
  if (currentExtension) return sanitized;
  return `${sanitized}.${expected}`;
}

function decodeDataUrl(dataUrl: string): DecodedDataUrl {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match?.[1] || typeof match[2] !== "string") {
    throw new Error("Result file store only supports base64 data URLs.");
  }

  return {
    mimeType: match[1],
    bytes: Buffer.from(match[2], "base64"),
  };
}

function checksum(bytes: Uint8Array): string {
  return `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
}

function assertSafePath(rootDir: string, storageKey: string): string {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, ...storageKey.split("/"));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Result file storage key escaped the configured root directory.");
  }
  return target;
}

function publicUrlFor(baseUrl: string | undefined, storageKey: string): string | undefined {
  if (!baseUrl) return undefined;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(storageKey, normalizedBase).toString();
}

function storageKeyFor(input: {
  workspaceId: string;
  resultId: string;
  fileName: string;
  mimeType: string;
}): string {
  return [
    "workspaces",
    sanitizePathPart(input.workspaceId),
    "results",
    sanitizePathPart(input.resultId),
    fileNameWithExtension(input.fileName, input.mimeType),
  ].join("/");
}

export function createLocalResultFileStore(options: LocalResultFileStoreOptions): LocalResultFileStore {
  const rootDir = path.resolve(options.rootDir);
  const now = options.now || (() => new Date().toISOString());

  return {
    async storeDataUrl(input) {
      const parsed = ResultFileStoreDataUrlInputSchema.parse(input);
      const decoded = decodeDataUrl(parsed.dataUrl);
      const storageKey = storageKeyFor({
        workspaceId: parsed.workspaceId,
        resultId: parsed.resultId,
        fileName: parsed.fileName,
        mimeType: decoded.mimeType,
      });
      const targetPath = assertSafePath(rootDir, storageKey);

      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, decoded.bytes);

      const metadataInput: Record<string, unknown> = {
        storageKey,
        mimeType: decoded.mimeType,
        byteSize: decoded.bytes.byteLength,
        checksum: checksum(decoded.bytes),
        storedAt: now(),
      };
      const publicUrl = publicUrlFor(options.publicBaseUrl, storageKey);
      if (publicUrl) metadataInput.publicUrl = publicUrl;

      return ResultStoredFileMetadataSchema.parse(metadataInput);
    },

    async readStoredFile(storageKey) {
      const targetPath = assertSafePath(rootDir, storageKey);
      const bytes = await readFile(targetPath);
      return ResultStoredFileReadSchema.parse({
        storageKey,
        bytes,
      });
    },

    resolvePath(storageKey) {
      return assertSafePath(rootDir, storageKey);
    },
  };
}
