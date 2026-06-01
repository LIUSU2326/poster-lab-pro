import { z } from "zod";
import { ProviderConfigFormSchema, ProviderIdSchema, type ProviderConfigForm } from "../schema/zod";
import { StoredProviderConfigSchema, type StoredProviderConfig } from "../storage/contracts";
import { maskApiKey } from "../storage/redaction";
import {
  ProviderErrorSchema,
  createProviderError,
  type ProviderError,
  type ProviderResult,
} from "./contracts";

export const ProviderCredentialSourceSchema = z.enum(["env", "secretStore", "runtime"]);

export const ProviderCredentialRefSchema = z.object({
  providerId: ProviderIdSchema,
  source: ProviderCredentialSourceSchema,
  keyRef: z.string().min(1).max(160),
  configured: z.boolean().default(false),
  maskedValue: z.string().max(120).default(""),
  updatedAt: z.string().datetime(),
});

export const ProviderCredentialValueSchema = z.object({
  providerId: ProviderIdSchema,
  apiKey: z.string().min(1),
  expiresAt: z.string().datetime().nullable().default(null),
});

export const ProviderCredentialFailureSchema = z.object({
  providerId: ProviderIdSchema,
  error: ProviderErrorSchema,
});

export type ProviderCredentialSource = z.infer<typeof ProviderCredentialSourceSchema>;
export type ProviderCredentialRef = z.infer<typeof ProviderCredentialRefSchema>;
export type ProviderCredentialValue = z.infer<typeof ProviderCredentialValueSchema>;
export type ProviderCredentialFailure = z.infer<typeof ProviderCredentialFailureSchema>;

export type CredentialResolver = {
  resolveCredential(ref: ProviderCredentialRef): Promise<ProviderResult<ProviderCredentialValue>>;
};

export function createProviderCredentialRef(input: {
  providerId: ProviderCredentialRef["providerId"];
  source: ProviderCredentialSource;
  keyRef: string;
  apiKeyPreview?: string;
  configured?: boolean;
  updatedAt?: string;
}): ProviderCredentialRef {
  return ProviderCredentialRefSchema.parse({
    providerId: input.providerId,
    source: input.source,
    keyRef: input.keyRef,
    configured: input.configured ?? Boolean(input.apiKeyPreview),
    maskedValue: input.apiKeyPreview ? maskApiKey(input.apiKeyPreview) : "",
    updatedAt: input.updatedAt || new Date().toISOString(),
  });
}

function credentialKey(ref: ProviderCredentialRef): string {
  return `${ref.providerId}:${ref.source}:${ref.keyRef}`;
}

export function createMemoryCredentialResolver(seed: ProviderCredentialValue[] = []): CredentialResolver {
  const values = new Map<string, ProviderCredentialValue>();
  for (const value of seed) {
    const parsed = ProviderCredentialValueSchema.parse(value);
    values.set(`${parsed.providerId}:runtime:${parsed.providerId}`, parsed);
    values.set(`${parsed.providerId}:secretStore:${parsed.providerId}`, parsed);
  }

  return {
    async resolveCredential(ref) {
      const parsedRef = ProviderCredentialRefSchema.parse(ref);
      const value = values.get(credentialKey(parsedRef));

      if (!parsedRef.configured || !value) {
        return {
          ok: false,
          error: createProviderError(parsedRef.providerId, "auth_failed", `Credential ${parsedRef.keyRef} is not available.`, {
            userMessage: "Provider credential is not configured or cannot be resolved.",
          }),
        };
      }

      return {
        ok: true,
        value: ProviderCredentialValueSchema.parse(value),
      };
    },
  };
}

export async function resolveProviderRuntimeConfig(input: {
  storedConfig: StoredProviderConfig;
  credentialRef?: ProviderCredentialRef;
  resolver?: CredentialResolver;
}): Promise<ProviderResult<ProviderConfigForm>> {
  const storedConfig = StoredProviderConfigSchema.parse(input.storedConfig);
  const baseConfig = ProviderConfigFormSchema.parse({
    providerId: storedConfig.providerId,
    enabled: storedConfig.enabled,
    apiKey: "",
    baseUrl: storedConfig.baseUrl,
    defaultModel: storedConfig.defaultModel,
    modelSlots: storedConfig.modelSlots,
  });

  if (!input.credentialRef) {
    return {
      ok: true,
      value: baseConfig,
    };
  }

  const credentialRef = ProviderCredentialRefSchema.parse(input.credentialRef);
  if (credentialRef.providerId !== storedConfig.providerId) {
    return {
      ok: false,
      error: createProviderError(storedConfig.providerId, "invalid_request", "Credential reference provider mismatch.", {
        userMessage: "Provider credential reference does not match this provider.",
      }),
    };
  }

  if (!input.resolver) {
    return {
      ok: false,
      error: createProviderError(storedConfig.providerId, "missing_config", "No credential resolver was provided.", {
        userMessage: "Provider credential resolver is not available.",
      }),
    };
  }

  const resolved = await input.resolver.resolveCredential(credentialRef);
  if (!resolved.ok) {
    return {
      ok: false,
      error: ProviderErrorSchema.parse(resolved.error),
    };
  }

  return {
    ok: true,
    value: ProviderConfigFormSchema.parse({
      ...baseConfig,
      enabled: true,
      apiKey: resolved.value.apiKey,
    }),
  };
}
