import { nextLocalApiService } from "../../../../src/api/next-service";
import { jsonEnvelope, routeWorkspaceId } from "../../../../src/api/next-response";

export async function GET(_request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const workspaceId = await routeWorkspaceId(context);
  const envelope = await nextLocalApiService.loadWorkspaceSnapshot({ workspaceId });
  return jsonEnvelope(envelope);
}
