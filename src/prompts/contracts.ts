import { z } from "zod";
import {
  AssetRoleSchema,
  PlatformPresetSchema,
  ProductionModeSchema,
  SloganLanguageSchema,
} from "../schema/zod";

export const PromptBuildTargetSchema = z.enum(["brief", "image", "postProcess"]);
export const PromptSectionSourceSchema = z.enum([
  "project",
  "brand",
  "character",
  "asset",
  "scheme",
  "slogan",
  "platform",
  "guardrail",
  "mode",
]);
export const PromptAssetBindingTypeSchema = z.enum([
  "identityLock",
  "logoLock",
  "styleReference",
  "compositionReference",
  "subjectReference",
  "brandReference",
  "backgroundReference",
]);
export const PromptRuleSeveritySchema = z.enum(["hard", "recommended", "context"]);

export const PromptSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(80),
  content: z.string().min(1).max(4000),
  source: PromptSectionSourceSchema,
  required: z.boolean().default(true),
  locked: z.boolean().default(false),
  priority: z.number().int().min(0).max(100).default(50),
});

export const PromptAssetBindingSchema = z.object({
  assetId: z.string().min(1),
  role: AssetRoleSchema,
  label: z.string().min(1).max(120),
  binding: PromptAssetBindingTypeSchema,
  required: z.boolean().default(false),
  placeholder: z.string().min(1).max(80).nullable().default(null),
  url: z.string().url().nullable().default(null),
  mimeType: z.string().min(1).nullable().default(null),
  storageKey: z.string().min(1).nullable().default(null),
  providerReady: z.boolean().default(false),
});

export const PromptPlatformConstraintSchema = z.object({
  platformPreset: PlatformPresetSchema,
  aspectRatio: z.string().min(1),
  width: z.number().int().min(1).nullable().default(null),
  height: z.number().int().min(1).nullable().default(null),
  safeArea: z.string().max(240).default("Keep key subject, logo, and headline inside platform-safe composition zones."),
  copyLengthHint: z.string().max(160).default("Keep poster copy concise and legible."),
});

export const PromptGuardrailRuleSchema = z.object({
  id: z.string().min(1),
  mode: ProductionModeSchema,
  severity: PromptRuleSeveritySchema,
  rule: z.string().min(1).max(800),
  negativeRule: z.string().max(800).optional(),
  appliesTo: z.array(PromptBuildTargetSchema).min(1).default(["brief", "image"]),
});

export const PromptValidationSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.string().min(1)).default([]),
  warnings: z.array(z.string().min(1)).default([]),
  lockedFields: z.array(z.string().min(1)).default([]),
});

export const PromptPackageSchema = z.object({
  id: z.string().min(1),
  target: PromptBuildTargetSchema,
  projectId: z.string().min(1),
  mode: ProductionModeSchema,
  schemeId: z.string().min(1).nullable().default(null),
  sections: z.array(PromptSectionSchema).min(1),
  assets: z.array(PromptAssetBindingSchema).default([]),
  platform: PromptPlatformConstraintSchema,
  slogans: z.partialRecord(SloganLanguageSchema, z.string().min(1)).default({}),
  guardrails: z.array(PromptGuardrailRuleSchema).min(1),
  negativePrompt: z.string().max(4000).default(""),
  finalPrompt: z.string().min(1).max(12000),
  validation: PromptValidationSchema,
});

export type PromptBuildTarget = z.infer<typeof PromptBuildTargetSchema>;
export type PromptSectionSource = z.infer<typeof PromptSectionSourceSchema>;
export type PromptAssetBindingType = z.infer<typeof PromptAssetBindingTypeSchema>;
export type PromptRuleSeverity = z.infer<typeof PromptRuleSeveritySchema>;
export type PromptSection = z.infer<typeof PromptSectionSchema>;
export type PromptAssetBinding = z.infer<typeof PromptAssetBindingSchema>;
export type PromptPlatformConstraint = z.infer<typeof PromptPlatformConstraintSchema>;
export type PromptGuardrailRule = z.infer<typeof PromptGuardrailRuleSchema>;
export type PromptValidation = z.infer<typeof PromptValidationSchema>;
export type PromptPackage = z.infer<typeof PromptPackageSchema>;
