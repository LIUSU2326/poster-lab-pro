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
import type { ProviderId } from "../schema/zod";
import {
  AIGOCODE_DEFAULT_BASE_URL,
  AIGOCODE_DEFAULT_IMAGE_MODEL,
  normalizeAigocodeBaseUrl,
  normalizeAigocodeImageModel,
} from "../providers/aigocode-compat";

const OPENAI_PROVIDER_ID = "openai" as const;
const AIGOCODE_PROVIDER_ID = "aigocode" as const;
const AGNES_PROVIDER_ID = "agnes" as const;
const OPENAI_COMPATIBLE_LIVE_PROVIDER_IDS = [OPENAI_PROVIDER_ID, AIGOCODE_PROVIDER_ID, AGNES_PROVIDER_ID] as const;
type OpenAICompatibleLiveProviderId = Extract<ProviderId, typeof OPENAI_COMPATIBLE_LIVE_PROVIDER_IDS[number]>;

export const OpenAILiveQueueRunInputSchema = z.object({
  enabled: z.boolean().default(false),
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
  providerId: z.enum(OPENAI_COMPATIBLE_LIVE_PROVIDER_IDS).default(OPENAI_PROVIDER_ID),
  apiKey: z.string().min(1).optional(),
  safety: LiveExecutionSafetyInputSchema.optional(),
  expiresInMs: z.number().int().min(1_000).max(86_400_000).default(600_000),
  traceId: z.string().min(1).default("trace-openai-live-queue"),
});

export const OpenAILiveQueueRunResultSchema = z.object({
  status: z.enum(["skipped", "blocked", "attempted"]),
  providerId: z.enum(OPENAI_COMPATIBLE_LIVE_PROVIDER_IDS),
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
  const displayName = getProviderManifest(input.providerId).displayName;
  return OpenAILiveQueueRunResultSchema.parse({
    status: "skipped",
    providerId: input.providerId,
    attempted: false,
    message: `${displayName} live queue execution skipped because explicit live opt-in was not provided.`,
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
    providerId: input.providerId,
    attempted: false,
    message,
    ...(apiKeyMasked ? { apiKeyMasked } : {}),
    ...(gate ? { gate } : {}),
    traceId: input.traceId,
  });
}

function openAIQueueRegistry(
  providerId: OpenAICompatibleLiveProviderId,
  transport: OpenAIImageTransport,
  now?: () => number,
): ProviderAdapterRegistry {
  const manifest = getProviderManifest(providerId);
  const mockAdapter = createMockProviderAdapter(manifest);
  const liveImageAdapter = createOpenAILiveImageAdapter({
    providerId,
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
  if (liveImageAdapter.editImage) adapter.editImage = liveImageAdapter.editImage.bind(liveImageAdapter);

  return { [providerId]: adapter };
}

function resultHasPersistedFile(result: StoredResultAsset): boolean {
  const file = result.metadata.resultFile;
  return Boolean(file && typeof file === "object" && "storageKey" in file);
}

async function prepareOpenAILiveProviderConfig(input: {
  providerId: OpenAICompatibleLiveProviderId;
  repository: StorageRepository;
  workspaceId: string;
  apiKeyMasked: string;
  updatedAt: string;
}): Promise<void> {
  const loaded = await input.repository.loadSnapshot(input.workspaceId);
  if (!loaded.ok) return;

  const current = loaded.snapshot.providerConfigs[input.providerId];
  const manifest = getProviderManifest(input.providerId);
  const imageModel = input.providerId === AGNES_PROVIDER_ID
    ? current?.modelSlots?.image || current?.defaultModel || manifest.modelSlots.image?.[0] || "agnes-image-2.1-flash"
    : input.providerId === OPENAI_PROVIDER_ID
    ? "gpt-image-1"
    : normalizeAigocodeImageModel(current?.modelSlots?.image || current?.defaultModel || manifest.modelSlots.image?.[0] || AIGOCODE_DEFAULT_IMAGE_MODEL);
  const defaultBaseUrl = input.providerId === AGNES_PROVIDER_ID
    ? "https://apihub.agnes-ai.com/v1"
    : input.providerId === AIGOCODE_PROVIDER_ID
      ? AIGOCODE_DEFAULT_BASE_URL
      : "";
  const nextSnapshot = {
    ...loaded.snapshot,
    providerConfigs: {
      ...loaded.snapshot.providerConfigs,
      [input.providerId]: {
        providerId: input.providerId,
        enabled: true,
        status: "success" as const,
        hasApiKey: true,
        apiKeyMasked: input.apiKeyMasked,
        baseUrl: input.providerId === AIGOCODE_PROVIDER_ID
          ? normalizeAigocodeBaseUrl(current?.baseUrl || defaultBaseUrl)
          : current?.baseUrl || defaultBaseUrl,
        defaultModel: imageModel,
        modelSlots: {
          ...(current?.modelSlots || {}),
          image: imageModel,
        },
        updatedAt: input.updatedAt,
      },
    },
    metadata: {
      ...loaded.snapshot.metadata,
      revision: loaded.snapshot.metadata.revision + 1,
      updatedAt: input.updatedAt,
    },
  };

  await input.repository.saveSnapshot(nextSnapshot);
}

export async function runOpenAILiveQueue(
  input: OpenAILiveQueueRunInput,
  options: OpenAILiveQueueRunOptions,
): Promise<OpenAILiveQueueRunResult> {
  const parsed = OpenAILiveQueueRunInputSchema.parse(input);
  const providerId = parsed.providerId;
  const displayName = getProviderManifest(providerId).displayName;
  const apiKey = parsed.apiKey?.trim();
  const safety = LiveExecutionSafetyInputSchema.parse(parsed.safety || {});
  const gate = evaluateLiveExecutionGate({
    enabled: parsed.enabled,
    providerId,
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
    providerId,
    apiKey,
    expiresInMs: parsed.expiresInMs,
  });
  await prepareOpenAILiveProviderConfig({
    providerId,
    repository: options.repository,
    workspaceId: parsed.workspaceId,
    apiKeyMasked: session.credentialRef.maskedValue,
    updatedAt: options.now ? options.now() : new Date().toISOString(),
  });
  const worker = createWorkspaceQueueWorker({
    repository: options.repository,
    credentialResolver: credentialStore,
    credentialRefs: { [providerId]: session.credentialRef },
    providerRegistry: openAIQueueRegistry(providerId, options.transport, options.adapterNow),
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
      providerId,
      attempted: true,
      message: result.summary.failed
        ? `${displayName} live queue execution attempted and completed with failed tasks.`
        : `${displayName} live queue execution completed.`,
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
      providerId,
      attempted: true,
      message: error instanceof Error ? error.message : `${displayName} live queue execution failed.`,
      apiKeyMasked: session.credentialRef.maskedValue,
      gate,
      traceId: parsed.traceId,
    });
  }
}
