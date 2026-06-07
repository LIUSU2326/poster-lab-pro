import { nextLocalApiService } from "../../../../../../src/api/next-service";
import { jsonEnvelope, readJsonBody, routeWorkspaceId } from "../../../../../../src/api/next-response";
import type {
  ProviderCredentialActivateApiRequest,
  ProviderCredentialDeleteApiRequest,
  ProviderCredentialSaveApiRequest,
  ProviderCredentialStatusApiRequest,
} from "../../../../../../src/api/contracts";

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

export async function GET(_request: Request, context: RouteContext) {
  const params = await routeParams(context);
  const envelope = await nextLocalApiService.getProviderCredentialStatus(params as ProviderCredentialStatusApiRequest);
  return jsonEnvelope(envelope);
}

export async function POST(request: Request, context: RouteContext) {
  const params = await routeParams(context);
  const body = await readJsonBody<Partial<ProviderCredentialSaveApiRequest>>(request);
  const envelope = await nextLocalApiService.saveProviderCredential({
    ...body,
    ...params,
  } as ProviderCredentialSaveApiRequest);
  return jsonEnvelope(envelope);
}

export async function PUT(request: Request, context: RouteContext) {
  const params = await routeParams(context);
  const body = await readJsonBody<Partial<ProviderCredentialActivateApiRequest>>(request);
  const envelope = await nextLocalApiService.activateProviderCredential({
    ...body,
    ...params,
  } as ProviderCredentialActivateApiRequest);
  return jsonEnvelope(envelope);
}

export async function DELETE(request: Request, context: RouteContext) {
  const params = await routeParams(context);
  const body = await readJsonBody<Partial<ProviderCredentialDeleteApiRequest>>(request);
  const envelope = await nextLocalApiService.deleteProviderCredential({
    ...body,
    ...params,
  } as ProviderCredentialDeleteApiRequest);
  return jsonEnvelope(envelope);
}
