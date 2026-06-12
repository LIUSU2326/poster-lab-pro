import { nextLocalApiService } from "../../../src/api/next-service";
import { jsonEnvelope, readJsonBody } from "../../../src/api/next-response";

export async function GET() {
  const envelope = await nextLocalApiService.listWorkspaceSnapshots();
  return jsonEnvelope(envelope);
}

export async function POST(request: Request) {
  const body = await readJsonBody<Parameters<typeof nextLocalApiService.createWorkspaceSnapshot>[0]>(request);
  const envelope = await nextLocalApiService.createWorkspaceSnapshot(body || {});
  return jsonEnvelope(envelope);
}
