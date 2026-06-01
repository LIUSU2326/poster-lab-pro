import { z } from "zod";
import { AssetRoleSchema, ProductionModeSchema } from "../schema/zod";
import {
  StoredAssetRecordSchema,
  StoredAssetUsageSchema,
  WorkspaceSnapshotSummarySchema,
} from "../storage/contracts";

export const maxUploadBytes = 25 * 1024 * 1024;

export const AssetUploadMimeTypeSchema = z.enum(["image/png", "image/jpeg", "image/webp"]);

export const AssetUploadFileNameSchema = z
  .string()
  .min(1)
  .max(180)
  .superRefine((value, ctx) => {
    if (/[\\/:*?"<>|]/.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "File name contains unsafe path or shell characters.",
      });
    }
    if (!/\.(png|jpe?g|webp)$/i.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "File name extension must match png, jpg, jpeg, or webp.",
      });
    }
  });

export const AssetSlotDefinitionSchema = z.object({
  id: z.string().min(1),
  mode: ProductionModeSchema,
  role: AssetRoleSchema,
  label: z.string().min(1).max(80),
  required: z.boolean(),
  usage: z.array(StoredAssetUsageSchema).min(1),
  description: z.string().min(1).max(240),
});

export const AssetUploadPlanRequestSchema = z.object({
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  role: AssetRoleSchema,
  label: z.string().min(1).max(80),
  fileName: AssetUploadFileNameSchema,
  mimeType: AssetUploadMimeTypeSchema,
  byteSize: z.number().int().min(1).max(maxUploadBytes),
  checksum: z.string().min(1).max(160).optional(),
  usage: z.array(StoredAssetUsageSchema).min(1).default(["input"]),
  clientAssetId: z.string().min(1).max(120).optional(),
});

export const AssetUploadPlanSchema = z.object({
  uploadId: z.string().min(1),
  assetId: z.string().min(1),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  role: AssetRoleSchema,
  method: z.literal("PUT"),
  uploadUrl: z.string().min(1),
  storageKey: z.string().min(1),
  maxBytes: z.number().int().min(1),
  acceptedMimeTypes: z.array(AssetUploadMimeTypeSchema).min(1),
  expiresAt: z.string().datetime(),
});

export const AssetUploadPlanResultSchema = z.object({
  uploadPlan: AssetUploadPlanSchema,
  assetDraft: StoredAssetRecordSchema,
});

export const AssetBinaryUploadResultSchema = z.object({
  assetId: z.string().min(1),
  storageKey: z.string().min(1),
  publicUrl: z.string().url(),
  mimeType: AssetUploadMimeTypeSchema,
  byteSize: z.number().int().min(1).max(maxUploadBytes),
});

export const AssetCommitRequestSchema = z.object({
  workspaceId: z.string().min(1),
  asset: StoredAssetRecordSchema,
  replaceExisting: z.boolean().default(false),
});

export const AssetCommitResultSchema = z.object({
  asset: StoredAssetRecordSchema,
  summary: WorkspaceSnapshotSummarySchema,
});

export const AssetListRequestSchema = z.object({
  workspaceId: z.string().min(1),
  role: AssetRoleSchema.optional(),
  usage: StoredAssetUsageSchema.optional(),
});

export const AssetListResultSchema = z.object({
  assets: z.array(StoredAssetRecordSchema),
});

export type AssetUploadMimeType = z.infer<typeof AssetUploadMimeTypeSchema>;
export type AssetSlotDefinition = z.infer<typeof AssetSlotDefinitionSchema>;
export type AssetUploadPlanRequest = z.infer<typeof AssetUploadPlanRequestSchema>;
export type AssetUploadPlan = z.infer<typeof AssetUploadPlanSchema>;
export type AssetUploadPlanResult = z.infer<typeof AssetUploadPlanResultSchema>;
export type AssetBinaryUploadResult = z.infer<typeof AssetBinaryUploadResultSchema>;
export type AssetCommitRequest = z.infer<typeof AssetCommitRequestSchema>;
export type AssetCommitResult = z.infer<typeof AssetCommitResultSchema>;
export type AssetListRequest = z.infer<typeof AssetListRequestSchema>;
export type AssetListResult = z.infer<typeof AssetListResultSchema>;
