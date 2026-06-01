import { z } from "zod";
import { createBriefPromptPackage, createImagePromptPackage } from "../prompts/builder";
import { mapPromptPackageToProviderRequest } from "../providers/request-mapper";
import {
  createMockProviderRegistry,
  executeMappedProviderRequest,
  normalizeProviderExecutionResult,
  providerConfigFromStoredConfig,
} from "../providers/executor";
import { ProviderBriefResponseSchema, ProviderImageResponseSchema } from "../providers/contracts";
import { ProviderIdSchema, ProductionModeSchema } from "../schema/zod";
import { createMockWorkspaceSnapshot } from "../storage/mock-snapshot";
import { createBatchQueuePlan } from "../queue/planner";
import { QueueSummarySchema, summarizeQueue } from "../queue/contracts";

export const MockE2ELoopInputSchema = z.object({
  mode: ProductionModeSchema.default("poster"),
  providerId: ProviderIdSchema.default("openai"),
  schemeId: z.string().min(1).optional(),
});

export const MockE2ELoopSummarySchema = z.object({
  ok: z.boolean(),
  mode: ProductionModeSchema,
  providerId: ProviderIdSchema,
  schemeId: z.string().min(1),
  briefPromptPackageId: z.string().min(1),
  imagePromptPackageId: z.string().min(1),
  mappedBriefKind: z.literal("briefGeneration"),
  mappedImageKind: z.literal("imageGeneration"),
  briefSchemeCount: z.number().int().min(1),
  imageAssetCount: z.number().int().min(1),
  queue: QueueSummarySchema,
});

export type MockE2ELoopInput = z.input<typeof MockE2ELoopInputSchema>;
export type MockE2ELoopSummary = z.infer<typeof MockE2ELoopSummarySchema>;

export async function runMockE2ELoop(input: MockE2ELoopInput = {}): Promise<MockE2ELoopSummary> {
  const parsed = MockE2ELoopInputSchema.parse(input);
  const snapshot = createMockWorkspaceSnapshot();
  const schemeId = parsed.schemeId || snapshot.schemes.find((item) => item.mode === parsed.mode)?.id;
  if (!schemeId) throw new Error(`Missing scheme for mock E2E mode ${parsed.mode}.`);

  const providerConfig = snapshot.providerConfigs[parsed.providerId];
  if (!providerConfig) throw new Error(`Missing provider config for ${parsed.providerId}.`);

  const adapterConfig = providerConfigFromStoredConfig(providerConfig);
  const registry = createMockProviderRegistry();
  const briefPrompt = createBriefPromptPackage({
    snapshot,
    mode: parsed.mode,
  });
  const imagePrompt = createImagePromptPackage({
    snapshot,
    mode: parsed.mode,
    schemeId,
  });

  const mappedBrief = mapPromptPackageToProviderRequest({
    promptPackage: briefPrompt,
    snapshot,
    providerId: parsed.providerId,
    kind: "briefGeneration",
    traceId: "trace-e2e-brief",
  });
  const mappedImage = mapPromptPackageToProviderRequest({
    promptPackage: imagePrompt,
    snapshot,
    providerId: parsed.providerId,
    kind: "imageGeneration",
    traceId: "trace-e2e-image",
  });

  const briefResult = normalizeProviderExecutionResult(
    await executeMappedProviderRequest({ mappedRequest: mappedBrief, config: adapterConfig }, registry),
  );
  const imageResult = normalizeProviderExecutionResult(
    await executeMappedProviderRequest({ mappedRequest: mappedImage, config: adapterConfig }, registry),
  );

  if (!briefResult.ok) throw new Error(`Mock brief execution failed: ${briefResult.error.userMessage}`);
  if (!imageResult.ok) throw new Error(`Mock image execution failed: ${imageResult.error.userMessage}`);
  const briefValue = ProviderBriefResponseSchema.parse(briefResult.value);
  const imageValue = ProviderImageResponseSchema.parse(imageResult.value);

  const queuePlan = createBatchQueuePlan({
    projectId: snapshot.project.id,
    mode: parsed.mode,
    providerId: parsed.providerId,
    schemeIds: [schemeId],
    imagesPerScheme: 1,
    includeImageEdit: false,
    includeUpscale: true,
    includeBackgroundRemoval: true,
  });
  const queue = summarizeQueue(queuePlan);

  return MockE2ELoopSummarySchema.parse({
    ok: true,
    mode: parsed.mode,
    providerId: parsed.providerId,
    schemeId,
    briefPromptPackageId: briefPrompt.id,
    imagePromptPackageId: imagePrompt.id,
    mappedBriefKind: mappedBrief.kind,
    mappedImageKind: mappedImage.kind,
    briefSchemeCount: briefValue.schemes.length,
    imageAssetCount: imageValue.assets.length,
    queue,
  });
}
