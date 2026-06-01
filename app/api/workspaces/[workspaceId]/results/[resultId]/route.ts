import { nextLocalApiService } from "../../../../../../src/api/next-service";
import { jsonEnvelope } from "../../../../../../src/api/next-response";

export async function DELETE(_request: Request, context: { params: Promise<{ workspaceId: string; resultId: string }> }) {
  const params = await context.params;
  const envelope = await nextLocalApiService.deleteResult({
    workspaceId: params.workspaceId,
    resultId: params.resultId,
  });
  return jsonEnvelope(envelope);
}
