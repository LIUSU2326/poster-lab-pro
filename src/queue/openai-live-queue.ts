import { z } from "zod";
import {
  createMockProviderAdapter,
  createOpenAILiveImageAdapter,
  createRuntimeProviderCredentialStore,
  getProviderManifest,
  type GenerationProviderAdapter,
  type OpenAIImageTransport,
  type ProviderAdapterRegistry,
} from "../providers";
import type { LocalResultFileStore } from "../results/file-store";
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
import {
  WorkspaceSnapshotSummarySchema,
  type StorageRepository,
  type StoredResultAsset,
} from "../storage/contracts";

const OPENAI_PROVIDER_ID = "openai" as const;

export const OpenAILiveQueueRunInputSchema = z.object({
  enabled: z.boolean().default(false),
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
  apiKey: z.string().min(1).optional(),
  safety: LiveExecutionSafetyInputSchema.optional(),
  expiresInMs: z.number().int().min(1_000).max(86_400_000).default(600_000),
  traceId: z.string().min(1).default("trace-openai-live-queue"),
});

export const OpenAILiveQueueRunResultSchema = z.object({
  status: z.enum(["skipped", "blocked", "attempted"]),
  providerId: z.literal(OPENAI_PROVIDER_ID),
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

export type OpenAILiveQueueRunInput = z.input<typeof OpenAILiveQueueRunInputSchema>;
export type OpenAILiveQueueRunResult = z.infer<typeof OpenAILiveQueueRunResultSchema>;

export type OpenAILiveQueueRunOptions = {
  repository: StorageRepository;
  resultFileStore?: Pick<LocalResultFileStore, "storeDataUrl">;
  transport?: OpenAIImageTransport;
  now?: () => string;
  adapterNow?: () => number;
};

function skippedResult(
  input: z.infer<typeof OpenAILiveQueueRunInputSchema>,
  gate: z.infer<typeof LiveExecutionGateDecisionSchema>,
): OpenAILiveQueueRunResult {
  return OpenAILiveQueueRunResultSchema.parse({
    status: "skipped",
    providerId: OPENAI_PROVIDER_ID,
    attempted: false,
    message: "OpenAI live queue execution skipped because explicit live opt-in was not provided.",
    gate,
    traceId: input.traceId,
  });
}

function blockedResult(
  input: z.infer<typeof OpenAILiveQueueRunInputSchema>,
  message: string,
  apiKeyMasked?: string,
  gate?: z.infer<typeof LiveExecutionGateDecisionSchema>,
): OpenAILiveQueueRunResult {
  return OpenAILiveQueueRunResultSchema.parse({
    status: "blocked",
    providerId: OPENAI_PROVIDER_ID,
    attempted: false,
    message,
    ...(apiKeyMasked ? { apiKeyMasked } : {}),
    ...(gate ? { gate } : {}),
    traceId: input.traceId,
  });
}

function openAIQueueRegistry(transport: OpenAIImageTransport, now?: () => number): ProviderAdapterRegistry {
  const manifest = getProviderManifest(OPENAI_PROVIDER_ID);
  const mockAdapter = createMockProviderAdapter(manifest);
  const liveImageAdapter = createOpenAILiveImageAdapter({
    transport,
    ...(now ? { now } : {}),
  });
  const adapter: GenerationProviderAdapter = {
    manifest,
    validateConfig: liveImageAdapter.validateConfig,
    healthCheck: liveImageAdapter.healthCheck,
  };

  if (mockAdapter.generateBrief) adapter.generateBrief = mockAdapter.generateBrief.bind(mockAdapter);
  if (liveImageAdapter.generateImage) adapter.generateImage = liveImageAdapter.generateImage.bind(liveImageAdapter);

  return { [OPENAI_PROVIDER_ID]: adapter };
}

function resultHasPersistedFile(result: StoredResultAsset): boolean {
  const file = result.metadata.resultFile;
  return Boolean(file && typeof file === "object" && "storageKey" in file);
}

export async function runOpenAILiveQueue(
  input: OpenAILiveQueueRunInput,
  options: OpenAILiveQueueRunOptions,
): Promise<OpenAILiveQueueRunResult> {
  const parsed = OpenAILiveQueueRunInputSchema.parse(input);
  const apiKey = parsed.apiKey?.trim();
  const safety = LiveExecutionSafetyInputSchema.parse(parsed.safety || {});
  const gate = evaluateLiveExecutionGate({
    enabled: parsed.enabled,
    providerId: OPENAI_PROVIDER_ID,
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
    providerId: OPENAI_PROVIDER_ID,
    apiKey,
    expiresInMs: parsed.expiresInMs,
  });
  const worker = createWorkspaceQueueWorker({
    repository: options.repository,
    credentialResolver: credentialStore,
    credentialRefs: { [OPENAI_PROVIDER_ID]: session.credentialRef },
    providerRegistry: openAIQueueRegistry(options.transport, options.adapterNow),
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

    return OpenAILiveQueueRunResultSchema.parse({
      status: "attempted",
      providerId: OPENAI_PROVIDER_ID,
      attempted: true,
      message: result.summary.failed
        ? "OpenAI live queue execution attempted and completed with failed tasks."
        : "OpenAI live queue execution completed.",
      apiKeyMasked: session.credentialRef.maskedValue,
      gate,
      summary: result.summary,
      workspace: summarizeWorkerWorkspace(result.workspace),
      resultCount: result.resultCount,
      persistedFileCount,
      traceId: parsed.traceId,
    });
  } catch (error) {
    return OpenAILiveQueueRunResultSchema.parse({
      status: "attempted",
      providerId: OPENAI_PROVIDER_ID,
      attempted: true,
      message: error instanceof Error ? error.message : "OpenAI live queue execution failed.",
      apiKeyMasked: session.credentialRef.maskedValue,
      gate,
      traceId: parsed.traceId,
    });
  }
}
