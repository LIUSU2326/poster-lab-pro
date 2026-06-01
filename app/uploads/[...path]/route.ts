import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { localAssetUploadBaseDir } from "../../../src/assets/local-binary-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safePathSegments(segments: string[] | undefined): string[] {
  return (segments || []).map((segment) => {
    const value = String(segment || "").trim();
    if (!value || value === "." || value === ".." || /[\\/]/.test(value)) {
      throw new Error("Unsafe upload path.");
    }
    return value;
  });
}

function assertInsideDirectory(root: string, target: string): void {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Upload path escapes the configured root.");
  }
}

function mimeTypeForFile(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".png") return "image/png";
  return "application/octet-stream";
}

function uploadRoots(): string[] {
  const roots = [
    localAssetUploadBaseDir(),
    path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "uploads"),
  ].map((root) => path.resolve(/*turbopackIgnore: true*/ root));
  return Array.from(new Set(roots));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ path?: string[] }> | { path?: string[] } },
): Promise<Response> {
  try {
    const params = await context.params;
    const segments = safePathSegments(params.path);
    if (segments.length === 0) return new Response("Not found", { status: 404 });

    for (const root of uploadRoots()) {
      const targetPath = path.join(/*turbopackIgnore: true*/ root, ...segments);
      assertInsideDirectory(root, targetPath);
      const stats = await stat(targetPath).catch(() => null);
      if (!stats?.isFile()) continue;

      const bytes = await readFile(targetPath);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": mimeTypeForFile(targetPath),
        },
      });
    }

    return new Response("Not found", { status: 404 });
  } catch {
    return new Response("Bad request", { status: 400 });
  }
}
