import { nextManualLiveGenerationService } from "../../../../../../../src/api/next-service";
import { jsonEnvelope, readJsonBody, routeWorkspaceId } from "../../../../../../../src/api/next-response";
import type { QueuePlanManualLiveTestApiRequest } from "../../../../../../../src/api/contracts";

type RouteContext = {
  params: Promise<{ workspaceId: string; jobId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const workspaceId = await routeWorkspaceId(context);
  const params = await context.params;
  const body = await readJsonBody<Partial<QueuePlanManualLiveTestApiRequest>>(request);
  const envelope = await nextManualLiveGenerationService.runManualLiveGenerationTest({
    ...body,
    workspaceId,
    jobId: params.jobId,
  } as QueuePlanManualLiveTestApiRequest);

  return jsonEnvelope(envelope);
}
