import { z } from "zod";
import { ProviderIdSchema } from "../schema/zod";
import {
  ProviderCredentialRefSchema,
  ProviderCredentialValueSchema,
  createProviderCredentialRef,
  type CredentialResolver,
  type ProviderCredentialRef,
  type ProviderCredentialValue,
} from "./credentials";
import {
  createProviderError,
  type ProviderResult,
} from "./contracts";

export const RuntimeProviderCredentialSessionRequestSchema = z.object({
  providerId: ProviderIdSchema,
  apiKey: z.string().min(1),
  expiresInMs: z.number().int().min(1_000).max(86_400_000).default(3_600_000),
});

export const RuntimeProviderCredentialSessionSchema = z.object({
  id: z.string().min(1),
  providerId: ProviderIdSchema,
  source: z.literal("runtime"),
  credentialRef: ProviderCredentialRefSchema,
  apiKeyMasked: z.string().min(1).max(120),
  configured: z.boolean(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const RuntimeProviderCredentialStatusSchema = z.object({
  id: z.string().min(1),
  providerId: ProviderIdSchema,
  source: z.literal("runtime"),
  configured: z.boolean(),
  apiKeyMasked: z.string().max(120),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  expired: z.boolean(),
});

export type RuntimeProviderCredentialSessionRequest = z.input<typeof RuntimeProviderCredentialSessionRequestSchema>;
export type RuntimeProviderCredentialSession = z.infer<typeof RuntimeProviderCredentialSessionSchema>;
export type RuntimeProviderCredentialStatus = z.infer<typeof RuntimeProviderCredentialStatusSchema>;

export type RuntimeProviderCredentialStore = CredentialResolver & {
  createSession(input: RuntimeProviderCredentialSessionRequest): RuntimeProviderCredentialSession;
  describe(refOrId: ProviderCredentialRef | string): RuntimeProviderCredentialStatus | null;
  revoke(refOrId: ProviderCredentialRef | string): boolean;
  clearExpired(): number;
};

export type RuntimeProviderCredentialStoreOptions = {
  now?: () => number;
  idFactory?: (providerId: z.infer<typeof ProviderIdSchema>) => string;
};

type RuntimeCredentialRecord = {
  session: RuntimeProviderCredentialSession;
  value: ProviderCredentialValue;
};

function defaultIdFactory(providerId: z.infer<typeof ProviderIdSchema>): string {
  return `runtime-${providerId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function recordId(refOrId: ProviderCredentialRef | string): string {
  if (typeof refOrId === "string") return refOrId;
  const ref = ProviderCredentialRefSchema.parse(refOrId);
  return ref.keyRef;
}

function isExpired(record: RuntimeCredentialRecord, nowMs: number): boolean {
  return Date.parse(record.session.expiresAt) <= nowMs;
}

function statusFromRecord(record: RuntimeCredentialRecord, nowMs: number): RuntimeProviderCredentialStatus {
  return RuntimeProviderCredentialStatusSchema.parse({
    id: record.session.id,
    providerId: record.session.providerId,
    source: "runtime",
    configured: record.session.configured,
    apiKeyMasked: record.session.apiKeyMasked,
    createdAt: record.session.createdAt,
    expiresAt: record.session.expiresAt,
    expired: isExpired(record, nowMs),
  });
}

export function createRuntimeProviderCredentialStore(
  options: RuntimeProviderCredentialStoreOptions = {},
): RuntimeProviderCredentialStore {
  const now = options.now || Date.now;
  const idFactory = options.idFactory || defaultIdFactory;
  const records = new Map<string, RuntimeCredentialRecord>();

  const store: RuntimeProviderCredentialStore = {
    createSession(input) {
      const parsed = RuntimeProviderCredentialSessionRequestSchema.parse(input);
      const createdAtMs = now();
      const expiresAtMs = createdAtMs + parsed.expiresInMs;
      const id = idFactory(parsed.providerId);
      const credentialRef = createProviderCredentialRef({
        providerId: parsed.providerId,
        source: "runtime",
        keyRef: id,
        apiKeyPreview: parsed.apiKey,
        configured: true,
        updatedAt: new Date(createdAtMs).toISOString(),
      });
      const session = RuntimeProviderCredentialSessionSchema.parse({
        id,
        providerId: parsed.providerId,
        source: "runtime",
        credentialRef,
        apiKeyMasked: credentialRef.maskedValue,
        configured: true,
        createdAt: new Date(createdAtMs).toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
      });

      records.set(id, {
        session,
        value: ProviderCredentialValueSchema.parse({
          providerId: parsed.providerId,
          apiKey: parsed.apiKey,
          expiresAt: session.expiresAt,
        }),
      });

      return session;
    },

    describe(refOrId) {
      const id = recordId(refOrId);
      const record = records.get(id);
      if (!record) return null;
      return statusFromRecord(record, now());
    },

    revoke(refOrId) {
      return records.delete(recordId(refOrId));
    },

    clearExpired() {
      const current = now();
      let count = 0;
      for (const [id, record] of records.entries()) {
        if (isExpired(record, current)) {
          records.delete(id);
          count += 1;
        }
      }
      return count;
    },

    async resolveCredential(ref): Promise<ProviderResult<ProviderCredentialValue>> {
      const parsedRef = ProviderCredentialRefSchema.parse(ref);
      if (parsedRef.source !== "runtime") {
        return {
          ok: false,
          error: createProviderError(parsedRef.providerId, "invalid_request", "Runtime credential store can only resolve runtime refs.", {
            userMessage: "Credential reference source is not supported by this runtime store.",
          }),
        };
      }

      const record = records.get(parsedRef.keyRef);
      if (!parsedRef.configured || !record) {
        return {
          ok: false,
          error: createProviderError(parsedRef.providerId, "auth_failed", `Runtime credential ${parsedRef.keyRef} is not available.`, {
            userMessage: "Runtime provider credential is not available.",
          }),
        };
      }

      if (record.session.providerId !== parsedRef.providerId) {
        return {
          ok: false,
          error: createProviderError(parsedRef.providerId, "invalid_request", "Runtime credential provider mismatch.", {
            userMessage: "Runtime credential does not match this provider.",
          }),
        };
      }

      if (isExpired(record, now())) {
        records.delete(parsedRef.keyRef);
        return {
          ok: false,
          error: createProviderError(parsedRef.providerId, "auth_failed", `Runtime credential ${parsedRef.keyRef} has expired.`, {
            userMessage: "Runtime provider credential has expired.",
          }),
        };
      }

      return {
        ok: true,
        value: ProviderCredentialValueSchema.parse(record.value),
      };
    },
  };

  return store;
}
