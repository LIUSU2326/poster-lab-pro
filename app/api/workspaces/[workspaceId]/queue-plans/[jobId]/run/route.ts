import { nextLocalApiService } from "../../../../../../../src/api/next-service";
import { jsonEnvelope, readJsonBody, routeWorkspaceId } from "../../../../../../../src/api/next-response";
import { clearQueueCancellation } from "../../../../../../../src/api/queue-cancellation";
import type { QueuePlanRunApiRequest } from "../../../../../../../src/api/contracts";

type RouteContext = {
  params: Promise<{ workspaceId: string; jobId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const workspaceId = await routeWorkspaceId(context);
  const params = await context.params;
  const body = await readJsonBody<Partial<QueuePlanRunApiRequest>>(request);
  const jobId = params.jobId;
  try {
    const envelope = await nextLocalApiService.runQueuePlan({
      ...body,
      workspaceId,
      jobId,
    } as QueuePlanRunApiRequest);

    return jsonEnvelope(envelope);
  } finally {
    clearQueueCancellation(jobId);
  }
}
