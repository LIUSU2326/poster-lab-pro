import { NextResponse } from "next/server";
import type { ApiFailureEnvelope } from "./contracts";

export function statusForEnvelope(envelope: { ok: true } | ApiFailureEnvelope): number {
  if (envelope.ok) return 200;

  const map: Record<ApiFailureEnvelope["error"]["code"], number> = {
    bad_request: 400,
    validation_error: 400,
    not_found: 404,
    unsupported_provider: 422,
    unauthorized: 401,
    conflict: 409,
    internal: 500,
  };

  return map[envelope.error.code] || 500;
}

export function jsonEnvelope<TEnvelope extends { ok: boolean }>(envelope: TEnvelope): NextResponse<TEnvelope> {
  return NextResponse.json(envelope, { status: statusForEnvelope(envelope as { ok: true } | ApiFailureEnvelope) });
}

export async function readJsonBody<TBody = unknown>(request: Request): Promise<TBody> {
  try {
    return await request.json() as TBody;
  } catch {
    return {} as TBody;
  }
}

export async function routeWorkspaceId(context: { params: Promise<{ workspaceId: string }> }): Promise<string> {
  const params = await context.params;
  return params.workspaceId;
}
