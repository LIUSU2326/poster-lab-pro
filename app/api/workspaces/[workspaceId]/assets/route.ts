import { nextLocalApiService } from "../../../../../src/api/next-service";
import { jsonEnvelope, readJsonBody, routeWorkspaceId } from "../../../../../src/api/next-response";
import type { AssetCommitApiRequest, AssetListApiRequest } from "../../../../../src/api/contracts";
import type { StoredAssetUsage } from "../../../../../src/storage/contracts";
import type { Asset } from "../../../../../src/schema/zod";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const workspaceId = await routeWorkspaceId(context);
  const url = new URL(request.url);
  const role = url.searchParams.get("role");
  const usage = url.searchParams.get("usage");
  const payload: AssetListApiRequest = {
    workspaceId,
    ...(role ? { role: role as Asset["role"] } : {}),
    ...(usage ? { usage: usage as StoredAssetUsage } : {}),
  };

  return jsonEnvelope(await nextLocalApiService.listWorkspaceAssets(payload));
}

export async function POST(request: Request, context: RouteContext) {
  const workspaceId = await routeWorkspaceId(context);
  const body = await readJsonBody<Partial<AssetCommitApiRequest>>(request);
  const payload = {
    ...body,
    workspaceId,
  } as AssetCommitApiRequest;

  return jsonEnvelope(await nextLocalApiService.commitAssetRecord(payload));
}
