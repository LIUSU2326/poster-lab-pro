import { z } from "zod";
import {
  createGoogleLiveImageAdapter,
  createRuntimeProviderCredentialStore,
  getProviderManifest,
  type GenerationProviderAdapter,
  type GoogleImageTransport,
  type ProviderAdapterRegistry,
} from "../providers";
import type { LocalResultFileStore } from "../results/file-store";
import {
  WorkspaceSnapshotSummarySchema,
  type StorageRepository,
  type StoredResultAsset,
} from "../storage/contracts";
import { QueueSummarySchema } from "./contracts";
import {
  LiveExecutionGateDecisionSchema,
  LiveExecutionSafetyInputSchema,
  evaluateLiveExecutionGate,
} from "./live-execution-gate";
import {
  WorkspaceQueueWorkerResultSchema,
  createWorkspaceQueueWorker,
  summarizeWorkerWorkspace,
} from "./workspace-worker";

const GOOGLE_PROVIDER_ID = "google" as const;

export const GoogleLiveQueueRunInputSchema = z.object({
  enabled: z.boolean().default(false),
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
  apiKey: z.string().min(1).optional(),
  safety: LiveExecutionSafetyInputSchema.optional(),
  expiresInMs: z.number().int().min(1_000).max(86_400_000).default(600_000),
  traceId: z.string().min(1).default("trace-google-live-queue"),
});

export const GoogleLiveQueueRunResultSchema = z.object({
  status: z.enum(["skipped", "blocked", "attempted"]),
  providerId: z.literal(GOOGLE_PROVIDER_ID),
  attempted: z.boolean(),
  message: z.string().min(1),
  apiKeyMasked: z.string().max(120).optional(),
  gate: LiveExecutionGateDecisionSchema.optional(),
  summary: QueueSummarySchema.optional(),
  workspace: WorkspaceSnapshotSummarySchema.optional(),
  resultCount: z.number().int().min(0).optional(),
  persistedFileCount: z.number().int().min(0).optional(),
  traceId: z.string().min(1),
});

export type GoogleLiveQueueRunInput = z.input<typeof GoogleLiveQueueRunInputSchema>;
export type GoogleLiveQueueRunResult = z.infer<typeof GoogleLiveQueueRunResultSchema>;

export type GoogleLiveQueueRunOptions = {
  repository: StorageRepository;
  resultFileStore?: Pick<LocalResultFileStore, "storeDataUrl">;
  transport?: GoogleImageTransport;
  now?: () => string;
  adapterNow?: () => number;
};

function skippedResult(
  input: z.infer<typeof GoogleLiveQueueRunInputSchema>,
  gate: z.infer<typeof LiveExecutionGateDecisionSchema>,
): GoogleLiveQueueRunResult {
  return GoogleLiveQueueRunResultSchema.parse({
    status: "skipped",
    providerId: GOOGLE_PROVIDER_ID,
    attempted: false,
    message: "Google live queue execution skipped because explicit live opt-in was not provided.",
    gate,
    traceId: input.traceId,
  });
}

function blockedResult(
  input: z.infer<typeof GoogleLiveQueueRunInputSchema>,
  message: string,
  apiKeyMasked?: string,
  gate?: z.infer<typeof LiveExecutionGateDecisionSchema>,
): GoogleLiveQueueRunResult {
  return GoogleLiveQueueRunResultSchema.parse({
    status: "blocked",
    providerId: GOOGLE_PROVIDER_ID,
    attempted: false,
    message,
    ...(apiKeyMasked ? { apiKeyMasked } : {}),
    ...(gate ? { gate } : {}),
    traceId: input.traceId,
  });
}

function googleQueueRegistry(transport: GoogleImageTransport, now?: () => number): ProviderAdapterRegistry {
  const manifest = getProviderManifest(GOOGLE_PROVIDER_ID);
  const liveImageAdapter = createGoogleLiveImageAdapter({
    transport,
    ...(now ? { now } : {}),
  });
  const adapter: GenerationProviderAdapter = {
    manifest,
    validateConfig: liveImageAdapter.validateConfig,
    healthCheck: liveImageAdapter.healthCheck,
  };

  if (liveImageAdapter.generateBrief) adapter.generateBrief = liveImageAdapter.generateBrief.bind(liveImageAdapter);
  if (liveImageAdapter.generateImage) adapter.generateImage = liveImageAdapter.generateImage.bind(liveImageAdapter);

  return { [GOOGLE_PROVIDER_ID]: adapter };
}

function resultHasPersistedFile(result: StoredResultAsset): boolean {
  const file = result.metadata.resultFile;
  return Boolean(file && typeof file === "object" && "storageKey" in file);
}

export async function runGoogleLiveQueue(
  input: GoogleLiveQueueRunInput,
  options: GoogleLiveQueueRunOptions,
): Promise<GoogleLiveQueueRunResult> {
  const parsed = GoogleLiveQueueRunInputSchema.parse(input);
  const apiKey = parsed.apiKey?.trim();
  const safety = LiveExecutionSafetyInputSchema.parse(parsed.safety || {});
  const gate = evaluateLiveExecutionGate({
    enabled: parsed.enabled,
    providerId: GOOGLE_PROVIDER_ID,
    credentialReady: Boolean(apiKey),
    transportReady: Boolean(options.transport),
    resultStorageReady: Boolean(options.resultFileStore),
    estimatedCost: safety.estimatedCost,
    maxAcceptedCost: safety.maxAcceptedCost,
    confirmations: safety.confirmations,
  });

  if (gate.status === "skipped") return skippedResult(parsed, gate);
  if (gate.status === "blocked") return blockedResult(parsed, gate.message, undefined, gate);
  if (!apiKey || !options.transport || !options.resultFileStore) {
    return blockedResult(parsed, "Live queue safety gate passed but runtime prerequisites were unavailable.", undefined, gate);
  }

  const credentialStore = createRuntimeProviderCredentialStore();
  const session = credentialStore.createSession({
    providerId: GOOGLE_PROVIDER_ID,
    apiKey,
    expiresInMs: parsed.expiresInMs,
  });
  const worker = createWorkspaceQueueWorker({
    repository: options.repository,
    credentialResolver: credentialStore,
    credentialRefs: { [GOOGLE_PROVIDER_ID]: session.credentialRef },
    providerRegistry: googleQueueRegistry(options.transport, options.adapterNow),
    resultFileStore: options.resultFileStore,
    useMockCredentials: false,
    ...(options.now ? { now: options.now } : {}),
  });

  try {
    const result = WorkspaceQueueWorkerResultSchema.parse(
      await worker.run({
        workspaceId: parsed.workspaceId,
        jobId: parsed.jobId,
        archiveResults: true,
      }),
    );
    const jobResults = result.workspace.results.filter((item) => item.jobId === parsed.jobId);
    const persistedFileCount = jobResults.filter(resultHasPersistedFile).length;

    return GoogleLiveQueueRunResultSchema.parse({
      status: "attempted",
      providerId: GOOGLE_PROVIDER_ID,
      attempted: true,
      message: result.summary.failed
        ? "Google live queue execution attempted and completed with failed tasks."
        : "Google live queue execution completed.",
      apiKeyMasked: session.credentialRef.maskedValue,
      gate,
      summary: result.summary,
      workspace: summarizeWorkerWorkspace(result.workspace),
      resultCount: result.resultCount,
      persistedFileCount,
      traceId: parsed.traceId,
    });
  } catch (error) {
    return GoogleLiveQueueRunResultSchema.parse({
      status: "attempted",
      providerId: GOOGLE_PROVIDER_ID,
      attempted: true,
      message: error instanceof Error ? error.message : "Google live queue execution failed.",
      apiKeyMasked: session.credentialRef.maskedValue,
      gate,
      traceId: parsed.traceId,
    });
  }
}
