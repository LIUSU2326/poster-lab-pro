import { z } from "zod";

export const ProductionModeSchema = z.enum(["poster", "collab", "announcement", "logo", "icon"]);
export const ThemeSchema = z.enum(["light", "dark"]);
export const WorkbenchViewSchema = z.enum(["schemes", "text", "archive", "results", "compare", "export"]);
export const ProviderIdSchema = z.enum(["openai", "aigocode", "google", "deepseek", "claude", "qwen"]);
export const ProviderStatusSchema = z.enum(["idle", "testing", "success", "warning", "error"]);
export const AssetRoleSchema = z.enum([
  "gameCharacter",
  "collabCharacter",
  "gameLogo",
  "brandLogo",
  "background",
  "prop",
  "uiScreenshot",
  "styleReference",
  "compositionReference",
  "subjectReference",
]);
export const SloganModeSchema = z.enum(["off", "auto", "global"]);
export const SloganLanguageSchema = z.enum(["zh-CN", "en-US", "ja-JP", "ko-KR"]);
export const ReferenceStrengthSchema = z.enum(["weak", "composition", "highFidelityComposition"]);
export const PlatformPresetSchema = z.enum([
  "steam",
  "appStore",
  "googlePlay",
  "tapTap",
  "tiktok",
  "metaAds",
  "custom",
]);
export const JobStatusSchema = z.enum(["draft", "queued", "running", "partial", "failed", "completed", "cancelled"]);
export const ResultStatusSchema = z.enum(["pending", "rendering", "failed", "ready", "archived"]);

export const PromptBlockSchema = z.object({
  title: z.string().min(1).max(80),
  text: z.string().min(1).max(1200),
});

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(2000),
  genre: z.string().max(80).optional(),
  coreSellingPoints: z.array(z.string().min(1).max(120)).max(8).default([]),
  targetAudience: z.string().max(240).optional(),
  brandKitId: z.string().min(1).nullable().optional(),
  defaultMode: ProductionModeSchema.default("poster"),
});

export const AssetSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  role: AssetRoleSchema,
  label: z.string().min(1).max(60),
  sourceType: z.enum(["uploaded", "generated", "external", "placeholder"]).default("placeholder"),
  previewUrl: z.string().url().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const BrandKitSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  logos: z.array(z.string().min(1)).default([]),
  primaryColors: z.array(z.string().min(1)).default([]),
  typographyStyle: z.string().max(240).optional(),
  fixedBrandTerms: z.array(z.string().min(1)).default([]),
  bannedElements: z.array(z.string().min(1)).default([]),
});

export const CharacterProfileSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1).max(80),
  referenceAssetIds: z.array(z.string().min(1)).min(1),
  lockAppearance: z.boolean().default(true),
  consistencyStrength: z.number().min(0).max(1).default(0.75),
});

export const SchemeBriefSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  mode: ProductionModeSchema,
  code: z.string().min(1).max(24),
  title: z.string().min(1).max(120),
  brief: z.string().min(1).max(1200),
  slogans: z.partialRecord(SloganLanguageSchema, z.string().min(1).max(120)).default({}),
  promptBlocks: z.array(PromptBlockSchema).default([]),
  lockedFields: z.array(z.string().min(1)).default([]),
  outputPresets: z.array(PlatformPresetSchema).default([]),
  status: ResultStatusSchema.default("pending"),
});

export const GenerationJobSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  mode: ProductionModeSchema,
  schemeIds: z.array(z.string().min(1)).min(1),
  status: JobStatusSchema.default("draft"),
  totalCount: z.number().int().min(1),
  completedCount: z.number().int().min(0).default(0),
  failedCount: z.number().int().min(0).default(0),
  providerId: ProviderIdSchema,
  estimatedCost: z.number().min(0).nullable().optional(),
});

export const ResultAssetSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  schemeId: z.string().min(1),
  jobId: z.string().min(1),
  mode: ProductionModeSchema,
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  platformPreset: PlatformPresetSchema,
  language: SloganLanguageSchema.nullable().optional(),
  model: z.string().min(1),
  status: ResultStatusSchema.default("pending"),
});

export const ProjectBriefFormSchema = z.object({
  projectName: z.string().min(1).max(80),
  gameDescription: z.string().min(1).max(2000),
  focusGuidanceEnabled: z.boolean().default(true),
  focusGuidance: z.string().max(500).optional(),
});

export const OutputSettingsFormSchema = z
  .object({
    mode: ProductionModeSchema,
    platformPresets: z.array(PlatformPresetSchema).min(1),
    aspectRatios: z.array(z.string().min(1)).min(1),
    customSize: z
      .object({
        width: z.number().int().min(256).max(8192),
        height: z.number().int().min(256).max(8192),
      })
      .nullable()
      .optional(),
    schemeCount: z.number().int().min(1).max(20).default(4),
    imagesPerScheme: z.number().int().min(1).max(8).default(1),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "icon" && value.aspectRatios.some((ratio) => ratio !== "1:1")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["aspectRatios"],
        message: "Icon mode only supports 1:1.",
      });
    }
  });

export const SloganSettingsFormSchema = z
  .object({
    mode: SloganModeSchema.default("auto"),
    globalSlogan: z.string().max(80).optional(),
    languages: z.array(SloganLanguageSchema).min(1).default(["en-US"]).transform((languages) => [languages[0] || "en-US"]),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "global" && !value.globalSlogan?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["globalSlogan"],
        message: "Global slogan mode requires a slogan.",
      });
    }
  });

export const ProviderConfigFormSchema = z.object({
  providerId: ProviderIdSchema,
  enabled: z.boolean().default(false),
  apiKey: z.string().max(4096).optional(),
  baseUrl: z.string().url().or(z.literal("")).optional(),
  defaultModel: z.string().max(120).optional(),
  modelSlots: z.record(z.string().min(1), z.string().min(1)).default({}),
});

export const PosterModeFormSchema = z.object({
  mode: z.literal("poster"),
  styleTags: z.array(z.string().min(1)).default([]),
  compositionReferenceStrength: ReferenceStrengthSchema.default("composition"),
});

export const CollabModeFormSchema = z.object({
  mode: z.literal("collab"),
  collabBrandName: z.string().min(1).max(80),
  collabStyleInjection: z.enum(["native", "brand", "game"]).default("native"),
  characterPlaceholdersOnly: z.literal(true),
  preventCharacterMerge: z.literal(true),
});

export const AnnouncementModeFormSchema = z.object({
  mode: z.literal("announcement"),
  announcementTitle: z.string().min(1).max(80),
  copyPreset: z.string().max(80).nullable().optional(),
  layoutMode: z.enum(["integratedTypography", "regularPanel"]).default("integratedTypography"),
  groupShotWhenMultiCharacter: z.boolean().default(true),
});

export const LogoModeFormSchema = z.object({
  mode: z.literal("logo"),
  wordmark: z.string().min(1).max(80),
  solidBackground: z.literal(true),
  backgroundColor: z.string().min(1).max(40).default("#ffffff"),
  wordmarkIsPrimarySubject: z.literal(true),
});

export const IconModeFormSchema = z.object({
  mode: z.literal("icon"),
  aspectRatio: z.literal("1:1"),
  noText: z.literal(true),
  fullBleedSquare: z.literal(true),
  compositionReferenceRotation: z.boolean().default(true),
});

export const ModeFormSchema = z.discriminatedUnion("mode", [
  PosterModeFormSchema,
  CollabModeFormSchema,
  AnnouncementModeFormSchema,
  LogoModeFormSchema,
  IconModeFormSchema,
]);

export type ProductionMode = z.infer<typeof ProductionModeSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type ProviderId = z.infer<typeof ProviderIdSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type BrandKit = z.infer<typeof BrandKitSchema>;
export type CharacterProfile = z.infer<typeof CharacterProfileSchema>;
export type SchemeBrief = z.infer<typeof SchemeBriefSchema>;
export type GenerationJob = z.infer<typeof GenerationJobSchema>;
export type ResultAsset = z.infer<typeof ResultAssetSchema>;
export type ProjectBriefForm = z.infer<typeof ProjectBriefFormSchema>;
export type OutputSettingsForm = z.infer<typeof OutputSettingsFormSchema>;
export type SloganSettingsForm = z.infer<typeof SloganSettingsFormSchema>;
export type ProviderConfigForm = z.infer<typeof ProviderConfigFormSchema>;
export type ModeForm = z.infer<typeof ModeFormSchema>;
