import { z } from "zod";
import { ProviderConnectionTestResultSchema } from "../providers/connection-diagnostic-contracts";
import { runProviderConnectionDiagnostic, type ProviderConnectionTransport } from "../providers/connection-diagnostics";
import type { EncryptedProviderCredentialVault } from "../providers/encrypted-credential-vault";
import type { StorageRepository, StoredProviderConfig } from "../storage";
import { ProviderIdSchema } from "../schema/zod";
import {
  ApiFailureEnvelopeSchema,
  ProviderConnectionTestApiRequestSchema,
  ProviderConnectionTestApiResponseSchema,
  type ApiErrorCode,
  type ApiFailureEnvelope,
  type ProviderConnectionTestApiRequest,
  type ProviderConnectionTestApiResponse,
} from "./contracts";
import { createApiMeta } from "./service";
import { providerCredentialKeyRef } from "./provider-credential-refs";

export type ProviderDiagnosticServiceOptions = {
  repository: StorageRepository;
  credentialVault: EncryptedProviderCredentialVault;
  transport?: ProviderConnectionTransport;
};

export type ProviderDiagnosticService = {
  testProviderConnection(request: ProviderConnectionTestApiRequest): Promise<ProviderConnectionTestApiResponse>;
};

function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  return error.issues.reduce<Record<string, string[]>>((fields, issue) => {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
    fields[key] = [...(fields[key] || []), issue.message];
    return fields;
  }, {});
}

function failure(input: {
  code: ApiErrorCode;
  message: string;
  workspaceId?: string;
  fieldErrors?: Record<string, string[]>;
  details?: Record<string, unknown>;
}): ApiFailureEnvelope {
  return ApiFailureEnvelopeSchema.parse({
    ok: false,
    error: {
      code: input.code,
      message: input.message,
      fieldErrors: input.fieldErrors || {},
      details: input.details || {},
    },
    meta: createApiMeta({
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    }),
  });
}

function failureFromError(error: unknown, workspaceId?: string): ApiFailureEnvelope {
  if (error instanceof z.ZodError) {
    return failure({
      code: "validation_error",
      message: "Provider connection test validation failed.",
      fieldErrors: fieldErrorsFromZod(error),
      ...(workspaceId ? { workspaceId } : {}),
    });
  }

  return failure({
    code: "internal",
    message: error instanceof Error ? error.message : "Unexpected provider connection test error.",
    ...(workspaceId ? { workspaceId } : {}),
  });
}

function providerStatusFromConnection(status: z.infer<typeof ProviderConnectionTestResultSchema>["status"]) {
  if (status === "ready") return "success" as const;
  if (status === "auth_failed") return "error" as const;
  if (status === "not_configured") return "idle" as const;
  return "warning" as const;
}

async function mirrorProviderDiagnostic(input: {
  repository: StorageRepository;
  workspaceId: string;
  config: StoredProviderConfig;
  result: z.infer<typeof ProviderConnectionTestResultSchema>;
}): Promise<{ updated: boolean; revision?: number }> {
  const loaded = await input.repository.loadSnapshot(input.workspaceId);
  if (!loaded.ok) return { updated: false };

  const updatedAt = new Date().toISOString();
  const nextConfig = {
    ...input.config,
    enabled: input.result.ok ? true : input.config.enabled,
    status: providerStatusFromConnection(input.result.status),
    updatedAt,
  };

  const nextSnapshot = {
    ...loaded.snapshot,
    providerConfigs: {
      ...loaded.snapshot.providerConfigs,
      [input.config.providerId]: nextConfig,
    },
    metadata: {
      ...loaded.snapshot.metadata,
      revision: loaded.snapshot.metadata.revision + 1,
      updatedAt,
    },
  };

  await input.repository.saveSnapshot(nextSnapshot);
  return {
    updated: true,
    revision: nextSnapshot.metadata.revision,
  };
}

export function createProviderDiagnosticService(options: ProviderDiagnosticServiceOptions): ProviderDiagnosticService {
  return {
    async testProviderConnection(request) {
      const workspaceId = typeof request?.workspaceId === "string" ? request.workspaceId : undefined;

      try {
        const parsed = ProviderConnectionTestApiRequestSchema.parse(request);
        const providerId = ProviderIdSchema.parse(parsed.providerId);
        const loaded = await options.repository.loadSnapshot(parsed.workspaceId);
        if (!loaded.ok) {
          return ProviderConnectionTestApiResponseSchema.parse(
            failure({
              code: loaded.code === "not_found" ? "not_found" : "internal",
              workspaceId: parsed.workspaceId,
              message: loaded.message,
              details: { storageCode: loaded.code },
            }),
          );
        }

        const storedConfig = loaded.snapshot.providerConfigs[providerId] || null;
        const credentialStatus = await options.credentialVault.describe({
          providerId,
          keyRef: providerCredentialKeyRef({
            workspaceId: parsed.workspaceId,
            providerId,
          }),
        });
        const diagnostic = await runProviderConnectionDiagnostic({
          request: parsed,
          storedConfig,
          credentialRef: credentialStatus.credentialRef,
          resolver: options.credentialVault,
          transport: options.transport,
        });
        const mirror = storedConfig
          ? await mirrorProviderDiagnostic({
              repository: options.repository,
              workspaceId: parsed.workspaceId,
              config: storedConfig,
              result: diagnostic,
            })
          : { updated: false };

        return ProviderConnectionTestApiResponseSchema.parse({
          ok: true,
          data: {
            result: diagnostic,
            providerConfigUpdated: mirror.updated,
          },
          meta: createApiMeta({
            workspaceId: parsed.workspaceId,
            ...(mirror.revision ? { revision: mirror.revision } : {}),
          }),
        });
      } catch (error) {
        return ProviderConnectionTestApiResponseSchema.parse(failureFromError(error, workspaceId));
      }
    },
  };
}
