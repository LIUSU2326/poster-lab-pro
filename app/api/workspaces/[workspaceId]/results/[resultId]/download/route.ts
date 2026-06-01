import { nextLocalApiService, nextResultFileStore } from "../../../../../../../src/api/next-service";
import { jsonEnvelope } from "../../../../../../../src/api/next-response";
import type { ResultDownloadDescriptor } from "../../../../../../../src/results";

function localDownloadUrl(request: Request, input: { workspaceId: string; resultId: string }): string {
  const url = new URL(request.url);
  url.pathname = `/api/workspaces/${encodeURIComponent(input.workspaceId)}/results/${encodeURIComponent(input.resultId)}/download`;
  url.search = "file=1";
  return url.toString();
}

function withLocalFileUrl(
  request: Request,
  descriptor: ResultDownloadDescriptor,
): ResultDownloadDescriptor {
  if (descriptor.source !== "localFile" || !descriptor.storageKey) return descriptor;
  return {
    ...descriptor,
    url: localDownloadUrl(request, {
      workspaceId: descriptor.workspaceId,
      resultId: descriptor.resultId,
    }),
  };
}

function safeDispositionFileName(fileName: string): string {
  return (
    fileName
      .replace(/[\r\n"]/g, "_")
      .replace(/[^\x20-\x7E]+/g, "-")
      .trim() || "result.bin"
  );
}

function fileFailure(input: {
  status: number;
  code: string;
  message: string;
  meta: unknown;
}): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code: input.code,
        message: input.message,
        fieldErrors: {},
        details: {},
      },
      meta: input.meta,
    },
    { status: input.status },
  );
}

export async function GET(request: Request, context: { params: Promise<{ workspaceId: string; resultId: string }> }) {
  const params = await context.params;
  const envelope = await nextLocalApiService.describeResultDownload({
    workspaceId: params.workspaceId,
    resultId: params.resultId,
  });

  if (!envelope.ok) return jsonEnvelope(envelope);

  const descriptor = withLocalFileUrl(request, envelope.data.descriptor);
  const searchParams = new URL(request.url).searchParams;
  const wantsFile = searchParams.get("file") === "1";
  const wantsInline = searchParams.get("inline") === "1";
  if (!wantsFile) {
    return jsonEnvelope({
      ...envelope,
      data: {
        descriptor,
      },
    });
  }

  if (descriptor.source !== "localFile" || !descriptor.storageKey) {
    return fileFailure({
      status: 404,
      code: "not_found",
      message: "Only persisted local result files can be downloaded through this route.",
      meta: envelope.meta,
    });
  }

  try {
    const file = await nextResultFileStore.readStoredFile(descriptor.storageKey);
    return new Response(file.bytes, {
      headers: {
        "content-type": descriptor.mimeType,
        "content-length": String(file.bytes.byteLength),
        "content-disposition": `${wantsInline ? "inline" : "attachment"}; filename="${safeDispositionFileName(descriptor.fileName)}"`,
        "x-result-storage-key": descriptor.storageKey,
        ...(descriptor.checksum ? { "x-result-checksum": descriptor.checksum } : {}),
      },
    });
  } catch {
    return fileFailure({
      status: 404,
      code: "not_found",
      message: "The persisted result file could not be found in local result storage.",
      meta: envelope.meta,
    });
  }
}
