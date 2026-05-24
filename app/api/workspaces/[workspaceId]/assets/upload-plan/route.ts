import { nextLocalApiService } from "../../../../../../src/api/next-service";
import { jsonEnvelope, readJsonBody, routeWorkspaceId } from "../../../../../../src/api/next-response";
import type { AssetUploadPlanApiRequest } from "../../../../../../src/api/contracts";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const workspaceId = await routeWorkspaceId(context);
  const body = await readJsonBody<Partial<AssetUploadPlanApiRequest>>(request);
  const payload = {
    ...body,
    workspaceId,
  } as AssetUploadPlanApiRequest;

  return jsonEnvelope(await nextLocalApiService.createAssetUploadPlan(payload));
}
