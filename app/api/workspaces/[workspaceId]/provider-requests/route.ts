import { nextLocalApiService } from "../../../../../src/api/next-service";
import { jsonEnvelope, readJsonBody } from "../../../../../src/api/next-response";

export async function POST(request: Request) {
  const body = await readJsonBody<Parameters<typeof nextLocalApiService.mapProviderRequest>[0]>(request);
  const envelope = await nextLocalApiService.mapProviderRequest(body);
  return jsonEnvelope(envelope);
}
