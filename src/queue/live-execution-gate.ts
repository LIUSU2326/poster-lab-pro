import { z } from "zod";
import { ProviderIdSchema } from "../schema/zod";

export const LiveExecutionConfirmationSchema = z.object({
  liveRun: z.boolean().default(false),
  providerCost: z.boolean().default(false),
  externalProvider: z.boolean().default(false),
  resultStorage: z.boolean().default(false),
});

export const LiveExecutionSafetyInputSchema = z.object({
  estimatedCost: z.number().min(0).default(0),
  maxAcceptedCost: z.number().min(0).default(0),
  confirmations: LiveExecutionConfirmationSchema.default({
    liveRun: false,
    providerCost: false,
    externalProvider: false,
    resultStorage: false,
  }),
});

export const LiveExecutionGateInputSchema = LiveExecutionSafetyInputSchema.extend({
  enabled: z.boolean().default(false),
  providerId: ProviderIdSchema,
  credentialReady: z.boolean().default(false),
  transportReady: z.boolean().default(false),
  resultStorageReady: z.boolean().default(false),
});

export const LiveExecutionGateStatusSchema = z.enum(["skipped", "blocked", "allowed"]);

export const LiveExecutionGateBlockerCodeSchema = z.enum([
  "not_enabled",
  "missing_live_confirmation",
  "missing_cost_confirmation",
  "missing_external_provider_confirmation",
  "missing_result_storage_confirmation",
  "cost_limit_exceeded",
  "missing_runtime_credential",
  "missing_transport",
  "missing_result_storage",
]);

export const LiveExecutionGateBlockerSchema = z.object({
  code: LiveExecutionGateBlockerCodeSchema,
  message: z.string().min(1),
  field: z.string().min(1).optional(),
});

export const LiveExecutionGateDecisionSchema = z.object({
  status: LiveExecutionGateStatusSchema,
  allowed: z.boolean(),
  providerId: ProviderIdSchema,
  estimatedCost: z.number().min(0),
  maxAcceptedCost: z.number().min(0),
  blockers: z.array(LiveExecutionGateBlockerSchema).default([]),
  message: z.string().min(1),
});

export type LiveExecutionConfirmation = z.infer<typeof LiveExecutionConfirmationSchema>;
export type LiveExecutionSafetyInput = z.input<typeof LiveExecutionSafetyInputSchema>;
export type LiveExecutionGateInput = z.input<typeof LiveExecutionGateInputSchema>;
export type LiveExecutionGateBlocker = z.infer<typeof LiveExecutionGateBlockerSchema>;
export type LiveExecutionGateDecision = z.infer<typeof LiveExecutionGateDecisionSchema>;

function blocker(
  code: z.infer<typeof LiveExecutionGateBlockerCodeSchema>,
  message: string,
  field?: string,
): LiveExecutionGateBlocker {
  return LiveExecutionGateBlockerSchema.parse({
    code,
    message,
    ...(field ? { field } : {}),
  });
}

export function evaluateLiveExecutionGate(input: LiveExecutionGateInput): LiveExecutionGateDecision {
  const parsed = LiveExecutionGateInputSchema.parse(input);

  if (!parsed.enabled) {
    return LiveExecutionGateDecisionSchema.parse({
      status: "skipped",
      allowed: false,
      providerId: parsed.providerId,
      estimatedCost: parsed.estimatedCost,
      maxAcceptedCost: parsed.maxAcceptedCost,
      blockers: [
        blocker("not_enabled", "Live execution is disabled until the user explicitly starts a live run.", "enabled"),
      ],
      message: "Live execution is disabled.",
    });
  }

  const blockers: LiveExecutionGateBlocker[] = [];
  if (!parsed.confirmations.liveRun) {
    blockers.push(blocker("missing_live_confirmation", "Confirm this is a live provider run before continuing.", "confirmations.liveRun"));
  }
  if (!parsed.confirmations.providerCost) {
    blockers.push(blocker("missing_cost_confirmation", "Confirm provider usage may consume paid credits.", "confirmations.providerCost"));
  }
  if (!parsed.confirmations.externalProvider) {
    blockers.push(
      blocker(
        "missing_external_provider_confirmation",
        "Confirm prompts and provider-ready assets may be sent to the selected external provider.",
        "confirmations.externalProvider",
      ),
    );
  }
  if (!parsed.confirmations.resultStorage) {
    blockers.push(
      blocker("missing_result_storage_confirmation", "Confirm generated result files can be stored locally.", "confirmations.resultStorage"),
    );
  }
  if (parsed.confirmations.providerCost && parsed.estimatedCost > parsed.maxAcceptedCost) {
    blockers.push(
      blocker(
        "cost_limit_exceeded",
        `Estimated cost ${parsed.estimatedCost.toFixed(2)} exceeds the accepted cap ${parsed.maxAcceptedCost.toFixed(2)}.`,
        "maxAcceptedCost",
      ),
    );
  }
  if (!parsed.credentialReady) {
    blockers.push(blocker("missing_runtime_credential", "Connect a runtime API key before live execution.", "credentialReady"));
  }
  if (!parsed.transportReady) {
    blockers.push(blocker("missing_transport", "Live provider transport is not connected for this environment.", "transportReady"));
  }
  if (!parsed.resultStorageReady) {
    blockers.push(blocker("missing_result_storage", "Result file storage must be ready before live execution.", "resultStorageReady"));
  }

  if (blockers.length > 0) {
    return LiveExecutionGateDecisionSchema.parse({
      status: "blocked",
      allowed: false,
      providerId: parsed.providerId,
      estimatedCost: parsed.estimatedCost,
      maxAcceptedCost: parsed.maxAcceptedCost,
      blockers,
      message: `Live execution is blocked by ${blockers.length} safety requirement${blockers.length === 1 ? "" : "s"}.`,
    });
  }

  return LiveExecutionGateDecisionSchema.parse({
    status: "allowed",
    allowed: true,
    providerId: parsed.providerId,
    estimatedCost: parsed.estimatedCost,
    maxAcceptedCost: parsed.maxAcceptedCost,
    blockers: [],
    message: "Live execution is allowed for this run.",
  });
}
