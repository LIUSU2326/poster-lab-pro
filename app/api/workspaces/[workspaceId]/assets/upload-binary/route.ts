import { z } from "zod";
import { jsonEnvelope, routeWorkspaceId } from "../../../../../../src/api/next-response";
import { AssetUploadMimeTypeSchema } from "../../../../../../src/assets/contracts";
import { writeLocalAssetBinary } from "../../../../../../src/assets/local-binary-store";
import type { ApiFailureEnvelope } from "../../../../../../src/api/contracts";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

function traceId(): string {
  return `trace-asset-binary-${Date.now().toString(36)}`;
}

function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value === "object" && "arrayBuffer" in value && "type" in value && "name" in value);
}

function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  return error.issues.reduce<Record<string, string[]>>((fields, issue) => {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
    fields[key] = [...(fields[key] || []), issue.message];
    return fields;
  }, {});
}

function failureEnvelope(workspaceId: string, error: unknown): ApiFailureEnvelope {
  const isValidation = error instanceof z.ZodError;
  const message = isValidation
    ? "Asset binary upload did not match the local upload contract."
    : error instanceof Error
      ? error.message
      : "Asset binary upload failed.";

  return {
    ok: false,
    error: {
      code: isValidation ? "validation_error" : "bad_request",
      message,
      fieldErrors: isValidation ? fieldErrorsFromZod(error) : {},
      details: {},
    },
    meta: {
      traceId: traceId(),
      workspaceId,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function POST(request: Request, context: RouteContext) {
  const workspaceId = await routeWorkspaceId(context);

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!isFileLike(file)) {
      throw new Error("Multipart field `file` is required.");
    }

    const assetId = formString(form, "assetId");
    const storageKey = formString(form, "storageKey");
    if (!assetId) throw new Error("Multipart field `assetId` is required.");
    if (!storageKey) throw new Error("Multipart field `storageKey` is required.");

    const mimeType = AssetUploadMimeTypeSchema.parse(file.type);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const origin = new URL(request.url).origin;
    const result = await writeLocalAssetBinary({
      workspaceId,
      assetId,
      storageKey,
      mimeType,
      bytes,
      origin,
    });

    return jsonEnvelope({
      ok: true,
      data: result,
      meta: {
        traceId: traceId(),
        workspaceId,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return jsonEnvelope(failureEnvelope(workspaceId, error));
  }
}
