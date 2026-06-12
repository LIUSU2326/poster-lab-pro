import { nextLocalApiService } from "../../../../src/api/next-service";
import { jsonEnvelope, readJsonBody, routeWorkspaceId } from "../../../../src/api/next-response";

export async function GET(_request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const workspaceId = await routeWorkspaceId(context);
  const envelope = await nextLocalApiService.loadWorkspaceSnapshot({ workspaceId });
  return jsonEnvelope(envelope);
}

export async function PATCH(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const workspaceId = await routeWorkspaceId(context);
  const body = await readJsonBody<Omit<Parameters<typeof nextLocalApiService.renameWorkspaceSnapshot>[0], "workspaceId">>(request);
  const envelope = await nextLocalApiService.renameWorkspaceSnapshot({
    workspaceId,
    name: body?.name || "",
  });
  return jsonEnvelope(envelope);
}

export async function DELETE(_request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const workspaceId = await routeWorkspaceId(context);
  const envelope = await nextLocalApiService.deleteWorkspaceSnapshot({ workspaceId });
  return jsonEnvelope(envelope);
}
