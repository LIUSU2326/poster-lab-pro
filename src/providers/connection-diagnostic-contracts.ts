import { z } from "zod";
import { ProviderIdSchema } from "../schema/zod";
import { ProviderErrorCodeSchema } from "./contracts";

export const ProviderConnectionStatusSchema = z.enum([
  "not_configured",
  "ready",
  "degraded",
  "unavailable",
  "auth_failed",
]);

export const ProviderConnectionTestRequestSchema = z.object({
  workspaceId: z.string().min(1),
  providerId: ProviderIdSchema,
  verifyModels: z.boolean().default(true),
  timeoutMs: z.number().int().min(1000).max(30000).default(10000),
});

export const ProviderConnectionTestResultSchema = z.object({
  providerId: ProviderIdSchema,
  ok: z.boolean(),
  status: ProviderConnectionStatusSchema,
  attemptedNetwork: z.boolean(),
  checkedAt: z.string().datetime(),
  elapsedMs: z.number().int().min(0),
  message: z.string().min(1),
  userMessage: z.string().min(1),
  errorCode: ProviderErrorCodeSchema.optional(),
  retryable: z.boolean().default(false),
  modelCount: z.number().int().min(0).optional(),
  defaultModel: z.string().min(1).optional(),
  defaultModelAvailable: z.boolean().optional(),
  sampledModels: z.array(z.string().min(1)).default([]),
});

export type ProviderConnectionStatus = z.infer<typeof ProviderConnectionStatusSchema>;
export type ProviderConnectionTestRequest = z.input<typeof ProviderConnectionTestRequestSchema>;
export type ProviderConnectionTestResult = z.infer<typeof ProviderConnectionTestResultSchema>;
