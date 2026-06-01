import { nextLocalApiService } from "../../../../../src/api/next-service";
import { jsonEnvelope, readJsonBody, routeWorkspaceId } from "../../../../../src/api/next-response";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const workspaceId = await routeWorkspaceId(context);
  const body = await readJsonBody<Partial<Parameters<typeof nextLocalApiService.createQueuePlan>[0]>>(request);
  const envelope = await nextLocalApiService.createQueuePlan({
    ...body,
    workspaceId,
  } as Parameters<typeof nextLocalApiService.createQueuePlan>[0]);
  return jsonEnvelope(envelope);
}
