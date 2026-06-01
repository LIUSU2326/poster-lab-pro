import { nextProviderDiagnosticService } from "../../../../../../../src/api/next-service";
import { jsonEnvelope, readJsonBody, routeWorkspaceId } from "../../../../../../../src/api/next-response";
import type { ProviderConnectionTestApiRequest } from "../../../../../../../src/api/contracts";

type RouteContext = {
  params: Promise<{ workspaceId: string; providerId: string }>;
};

async function routeParams(context: RouteContext) {
  const workspaceId = await routeWorkspaceId(context);
  const params = await context.params;
  return {
    workspaceId,
    providerId: params.providerId,
  };
}

export async function POST(request: Request, context: RouteContext) {
  const params = await routeParams(context);
  const body = await readJsonBody<Partial<ProviderConnectionTestApiRequest>>(request);
  const envelope = await nextProviderDiagnosticService.testProviderConnection({
    ...body,
    ...params,
  } as ProviderConnectionTestApiRequest);
  return jsonEnvelope(envelope);
}
