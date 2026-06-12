import { nextLocalApiService } from "../../../../../src/api/next-service";
import { jsonEnvelope, readJsonBody, routeWorkspaceId } from "../../../../../src/api/next-response";

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const workspaceId = await routeWorkspaceId(context);
  const body = await readJsonBody<Omit<Parameters<typeof nextLocalApiService.duplicateWorkspaceSnapshot>[0], "workspaceId">>(request);
  const envelope = await nextLocalApiService.duplicateWorkspaceSnapshot({
    workspaceId,
    name: body?.name,
  });
  return jsonEnvelope(envelope);
}
