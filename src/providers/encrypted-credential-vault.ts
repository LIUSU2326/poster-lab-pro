import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
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
import { createProviderError, type ProviderResult } from "./contracts";

const CIPHER_ALGORITHM = "aes-256-gcm";
const VAULT_RECORD_VERSION = "provider-credential.v1";

export const EncryptedProviderCredentialRecordSchema = z.object({
  version: z.literal(VAULT_RECORD_VERSION),
  providerId: ProviderIdSchema,
  keyRef: z.string().min(1).max(160),
  source: z.literal("secretStore"),
  encryptedValue: z.string().min(1),
  iv: z.string().min(1),
  authTag: z.string().min(1),
  apiKeyMasked: z.string().min(1).max(120),
  configured: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ProviderCredentialVaultSaveRequestSchema = z.object({
  providerId: ProviderIdSchema,
  keyRef: z.string().min(1).max(160),
  apiKey: z.string().min(1).max(4096),
  updatedAt: z.string().datetime().optional(),
});

export const ProviderCredentialVaultStatusSchema = z.object({
  providerId: ProviderIdSchema,
  keyRef: z.string().min(1).max(160),
  source: z.literal("secretStore"),
  configured: z.boolean(),
  apiKeyMasked: z.string().max(120),
  updatedAt: z.string().datetime().nullable(),
  credentialRef: ProviderCredentialRefSchema.nullable(),
});

export type EncryptedProviderCredentialRecord = z.infer<typeof EncryptedProviderCredentialRecordSchema>;
export type ProviderCredentialVaultSaveRequest = z.infer<typeof ProviderCredentialVaultSaveRequestSchema>;
export type ProviderCredentialVaultStatus = z.infer<typeof ProviderCredentialVaultStatusSchema>;

export type ProviderCredentialVaultBackingStore = {
  getRecord(keyRef: string): Promise<EncryptedProviderCredentialRecord | null>;
  setRecord(record: EncryptedProviderCredentialRecord): Promise<void>;
  deleteRecord(keyRef: string): Promise<boolean>;
};

export type EncryptedProviderCredentialVault = CredentialResolver & {
  save(input: ProviderCredentialVaultSaveRequest): Promise<ProviderCredentialVaultStatus>;
  describe(input: { providerId: z.infer<typeof ProviderIdSchema>; keyRef: string }): Promise<ProviderCredentialVaultStatus>;
  revoke(input: { providerId: z.infer<typeof ProviderIdSchema>; keyRef: string }): Promise<boolean>;
};

export type EncryptedProviderCredentialVaultOptions = {
  masterKey: string | Uint8Array;
  store?: ProviderCredentialVaultBackingStore;
  randomBytesSource?: (size: number) => Uint8Array;
  now?: () => string;
};

export function createMemoryCredentialVaultBackingStore(
  seed: EncryptedProviderCredentialRecord[] = [],
): ProviderCredentialVaultBackingStore {
  const records = new Map<string, EncryptedProviderCredentialRecord>();
  for (const record of seed) {
    const parsed = EncryptedProviderCredentialRecordSchema.parse(record);
    records.set(parsed.keyRef, parsed);
  }

  return {
    async getRecord(keyRef) {
      const record = records.get(keyRef);
      return record ? EncryptedProviderCredentialRecordSchema.parse(record) : null;
    },

    async setRecord(record) {
      const parsed = EncryptedProviderCredentialRecordSchema.parse(record);
      records.set(parsed.keyRef, parsed);
    },

    async deleteRecord(keyRef) {
      return records.delete(keyRef);
    },
  };
}

function encryptionKey(masterKey: string | Uint8Array): Buffer {
  return createHash("sha256").update(masterKey).digest();
}

function toBuffer(value: Uint8Array): Buffer {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function encryptApiKey(input: {
  apiKey: string;
  providerId: z.infer<typeof ProviderIdSchema>;
  keyRef: string;
  masterKey: Buffer;
  randomBytesSource: (size: number) => Uint8Array;
}): Pick<EncryptedProviderCredentialRecord, "encryptedValue" | "iv" | "authTag"> {
  const iv = toBuffer(input.randomBytesSource(12));
  const cipher = createCipheriv(CIPHER_ALGORITHM, input.masterKey, iv);
  cipher.setAAD(Buffer.from(`${input.providerId}:${input.keyRef}`, "utf8"));
  const encrypted = Buffer.concat([cipher.update(input.apiKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

function decryptApiKey(input: {
  record: EncryptedProviderCredentialRecord;
  masterKey: Buffer;
}): string {
  const decipher = createDecipheriv(
    CIPHER_ALGORITHM,
    input.masterKey,
    Buffer.from(input.record.iv, "base64"),
  );
  decipher.setAAD(Buffer.from(`${input.record.providerId}:${input.record.keyRef}`, "utf8"));
  decipher.setAuthTag(Buffer.from(input.record.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(input.record.encryptedValue, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function statusFromRecord(record: EncryptedProviderCredentialRecord | null, input: {
  providerId: z.infer<typeof ProviderIdSchema>;
  keyRef: string;
}): ProviderCredentialVaultStatus {
  if (!record) {
    return ProviderCredentialVaultStatusSchema.parse({
      providerId: input.providerId,
      keyRef: input.keyRef,
      source: "secretStore",
      configured: false,
      apiKeyMasked: "",
      updatedAt: null,
      credentialRef: null,
    });
  }

  const credentialRef = createProviderCredentialRef({
    providerId: record.providerId,
    source: "secretStore",
    keyRef: record.keyRef,
    apiKeyPreview: record.apiKeyMasked,
    configured: record.configured,
    updatedAt: record.updatedAt,
  });

  return ProviderCredentialVaultStatusSchema.parse({
    providerId: record.providerId,
    keyRef: record.keyRef,
    source: "secretStore",
    configured: record.configured,
    apiKeyMasked: record.apiKeyMasked,
    updatedAt: record.updatedAt,
    credentialRef,
  });
}

function missingCredentialResult(ref: ProviderCredentialRef): ProviderResult<ProviderCredentialValue> {
  return {
    ok: false,
    error: createProviderError(ref.providerId, "auth_failed", `Credential ${ref.keyRef} is not available.`, {
      userMessage: "Provider credential is not configured or cannot be resolved.",
    }),
  };
}

export function createEncryptedProviderCredentialVault(
  options: EncryptedProviderCredentialVaultOptions,
): EncryptedProviderCredentialVault {
  const masterKey = encryptionKey(options.masterKey);
  const store = options.store || createMemoryCredentialVaultBackingStore();
  const randomBytesSource = options.randomBytesSource || randomBytes;
  const now = options.now || (() => new Date().toISOString());

  return {
    async save(input) {
      const parsed = ProviderCredentialVaultSaveRequestSchema.parse(input);
      const previous = await store.getRecord(parsed.keyRef);
      const timestamp = parsed.updatedAt || now();
      const encrypted = encryptApiKey({
        apiKey: parsed.apiKey,
        providerId: parsed.providerId,
        keyRef: parsed.keyRef,
        masterKey,
        randomBytesSource,
      });
      const credentialRef = createProviderCredentialRef({
        providerId: parsed.providerId,
        source: "secretStore",
        keyRef: parsed.keyRef,
        apiKeyPreview: parsed.apiKey,
        configured: true,
        updatedAt: timestamp,
      });
      const record = EncryptedProviderCredentialRecordSchema.parse({
        version: VAULT_RECORD_VERSION,
        providerId: parsed.providerId,
        keyRef: parsed.keyRef,
        source: "secretStore",
        ...encrypted,
        apiKeyMasked: credentialRef.maskedValue,
        configured: true,
        createdAt: previous?.createdAt || timestamp,
        updatedAt: timestamp,
      });

      await store.setRecord(record);
      return statusFromRecord(record, {
        providerId: parsed.providerId,
        keyRef: parsed.keyRef,
      });
    },

    async describe(input) {
      const parsed = z.object({
        providerId: ProviderIdSchema,
        keyRef: z.string().min(1).max(160),
      }).parse(input);
      const record = await store.getRecord(parsed.keyRef);
      if (record && record.providerId !== parsed.providerId) {
        return statusFromRecord(null, parsed);
      }
      return statusFromRecord(record, parsed);
    },

    async revoke(input) {
      const parsed = z.object({
        providerId: ProviderIdSchema,
        keyRef: z.string().min(1).max(160),
      }).parse(input);
      const record = await store.getRecord(parsed.keyRef);
      if (record && record.providerId !== parsed.providerId) return false;
      return store.deleteRecord(parsed.keyRef);
    },

    async resolveCredential(ref) {
      const parsedRef = ProviderCredentialRefSchema.parse(ref);
      if (parsedRef.source !== "secretStore") {
        return {
          ok: false,
          error: createProviderError(parsedRef.providerId, "invalid_request", "Encrypted vault can only resolve secretStore refs.", {
            userMessage: "Credential reference source is not supported by this vault.",
          }),
        };
      }

      const record = await store.getRecord(parsedRef.keyRef);
      if (!parsedRef.configured || !record || !record.configured) {
        return missingCredentialResult(parsedRef);
      }
      if (record.providerId !== parsedRef.providerId) {
        return {
          ok: false,
          error: createProviderError(parsedRef.providerId, "invalid_request", "Credential provider mismatch.", {
            userMessage: "Credential reference does not match this provider.",
          }),
        };
      }

      try {
        return {
          ok: true,
          value: ProviderCredentialValueSchema.parse({
            providerId: record.providerId,
            apiKey: decryptApiKey({ record, masterKey }),
            expiresAt: null,
          }),
        };
      } catch {
        return {
          ok: false,
          error: createProviderError(parsedRef.providerId, "auth_failed", "Credential could not be decrypted.", {
            userMessage: "Provider credential could not be decrypted.",
          }),
        };
      }
    },
  };
}
