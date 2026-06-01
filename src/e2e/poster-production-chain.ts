import { z } from "zod";
import { ProviderIdSchema } from "../schema/zod";
import { createLocalApiService } from "../api/service";
import { createMemoryDraftRepository, createMockWorkspaceSnapshot } from "../storage";

export const PosterProductionChainInputSchema = z.object({
  providerId: ProviderIdSchema.default("openai"),
  schemeId: z.string().min(1).optional(),
});

export const PosterProductionChainSummarySchema = z.object({
  ok: z.boolean(),
  mode: z.literal("poster"),
  providerId: ProviderIdSchema,
  workspaceId: z.string().min(1),
  promptPackageId: z.string().min(1),
  mappedKind: z.literal("imageGeneration"),
  queueJobId: z.string().min(1),
  resultId: z.string().min(1),
  resultCount: z.number().int().min(1),
  downloadAvailable: z.boolean(),
  downloadSource: z.enum(["assetUrl", "thumbnailUrl", "inlineDataUrl", "unavailable"]),
});

export type PosterProductionChainInput = z.input<typeof PosterProductionChainInputSchema>;
export type PosterProductionChainSummary = z.infer<typeof PosterProductionChainSummarySchema>;

function assertOk<TEnvelope extends { ok: true } | { ok: false; error: { message: string } }>(
  envelope: TEnvelope,
  label: string,
): Extract<TEnvelope, { ok: true }> {
  if (envelope.ok) return envelope as Extract<TEnvelope, { ok: true }>;
  const error = envelope.error;
  throw new Error(`${label} failed: ${error.message}`);
}

function withProviderReadyMockAssets(snapshot: ReturnType<typeof createMockWorkspaceSnapshot>) {
  return {
    ...snapshot,
    assets: snapshot.assets.map((asset) => ({
      ...asset,
      metadata: { ...asset.metadata, mockAsset: true },
      previewUrl: `https://cdn.poster-lab.test/e2e/${asset.id}.png`,
    })),
  };
}

export async function runPosterProductionChain(
  input: PosterProductionChainInput = {},
): Promise<PosterProductionChainSummary> {
  const parsed = PosterProductionChainInputSchema.parse(input);
  const snapshot = withProviderReadyMockAssets(createMockWorkspaceSnapshot());
  const repository = createMemoryDraftRepository([snapshot]);
  const service = createLocalApiService({ repository });
  const workspaceId = snapshot.metadata.workspaceId;
  const schemeId = parsed.schemeId || snapshot.schemes.find((scheme) => scheme.mode === "poster")?.id;
  if (!schemeId) throw new Error("Poster production chain requires a poster scheme.");

  const loaded = assertOk(await service.loadWorkspaceSnapshot({ workspaceId }), "workspace load");
  const promptPackage = assertOk(
    await service.createPromptPackage({
      snapshot: loaded.data.snapshot,
      target: "image",
      mode: "poster",
      schemeId,
    }),
    "prompt package",
  ).data.promptPackage;

  if (!promptPackage.validation.ok) {
    throw new Error(`Poster image prompt is not provider-ready: ${promptPackage.validation.errors.join(" ")}`);
  }

  const mappedRequest = assertOk(
    await service.mapProviderRequest({
      promptPackage,
      snapshot: loaded.data.snapshot,
      providerId: parsed.providerId,
      kind: "imageGeneration",
    }),
    "provider request mapping",
  ).data.mappedRequest;

  if (mappedRequest.kind !== "imageGeneration") {
    throw new Error(`Poster chain expected imageGeneration mapping but received ${mappedRequest.kind}.`);
  }

  const queuePlan = assertOk(
    await service.createQueuePlan({
      workspaceId,
      projectId: loaded.data.snapshot.project.id,
      mode: "poster",
      providerId: parsed.providerId,
      schemeIds: [schemeId],
      platformPresets: ["custom"],
      imagesPerScheme: 1,
      includeImageEdit: false,
      includeUpscale: false,
      includeBackgroundRemoval: false,
    }),
    "queue plan",
  ).data.queuePlan;

  const runResult = assertOk(
    await service.runQueuePlan({
      workspaceId,
      jobId: queuePlan.job.id,
      archiveResults: true,
    }),
    "queue run",
  ).data;
  const generatedResult = runResult.workspace.results.find((result) => result.jobId === queuePlan.job.id);
  if (!generatedResult) throw new Error("Poster queue run did not create a stored result.");

  const descriptor = assertOk(
    await service.describeResultDownload({
      workspaceId,
      resultId: generatedResult.id,
    }),
    "result download descriptor",
  ).data.descriptor;

  return PosterProductionChainSummarySchema.parse({
    ok: true,
    mode: "poster",
    providerId: parsed.providerId,
    workspaceId,
    promptPackageId: promptPackage.id,
    mappedKind: mappedRequest.kind,
    queueJobId: queuePlan.job.id,
    resultId: generatedResult.id,
    resultCount: runResult.workspace.results.filter((result) => result.jobId === queuePlan.job.id).length,
    downloadAvailable: descriptor.available,
    downloadSource: descriptor.source,
  });
}
