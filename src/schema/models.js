export const schemaVersion = "2026-05-20-static-contract-v1";

export const enums = {
  productionMode: ["poster", "collab", "announcement", "logo", "icon"],
  theme: ["light", "dark"],
  workbenchView: ["schemes", "text", "archive", "results", "compare", "export"],
  providerId: ["openai", "aigocode", "google", "deepseek", "claude", "qwen", "agnes", "mimo"],
  providerStatus: ["idle", "testing", "success", "warning", "error"],
  assetRole: [
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
  ],
  sloganMode: ["off", "auto", "global"],
  sloganLanguage: [
    "en-US",
    "zh-CN",
    "zh-TW",
    "ja-JP",
    "ko-KR",
    "fr-FR",
    "de-DE",
    "es-ES",
    "pt-BR",
    "id-ID",
    "th-TH",
    "vi-VN",
  ],
  referenceStrength: ["weak", "composition", "highFidelityComposition"],
  platformPreset: [
    "steam",
    "appStore",
    "googlePlay",
    "tapTap",
    "tiktok",
    "metaAds",
    "custom",
  ],
  jobStatus: ["draft", "queued", "running", "partial", "failed", "completed", "cancelled"],
  resultStatus: ["pending", "rendering", "failed", "ready", "archived"],
};

export const primitiveFields = {
  id: { type: "string", required: true, note: "Stable entity id." },
  title: { type: "string", min: 1, max: 120 },
  description: { type: "string", min: 1, max: 2000 },
  createdAt: { type: "isoDateTime" },
  updatedAt: { type: "isoDateTime" },
};

export const entitySchemas = {
  Project: {
    id: primitiveFields.id,
    name: { type: "string", required: true, min: 1, max: 80 },
    description: { ...primitiveFields.description, required: true },
    genre: { type: "string", max: 80 },
    coreSellingPoints: { type: "string[]", maxItems: 8 },
    targetAudience: { type: "string", max: 240 },
    brandKitId: { type: "string", nullable: true },
    defaultMode: { enum: enums.productionMode, default: "poster" },
  },

  Asset: {
    id: primitiveFields.id,
    projectId: { type: "string", required: true },
    role: { enum: enums.assetRole, required: true },
    label: { type: "string", required: true, max: 60 },
    sourceType: { enum: ["uploaded", "generated", "external", "placeholder"], default: "placeholder" },
    previewUrl: { type: "string", nullable: true },
    metadata: { type: "object", default: {} },
  },

  BrandKit: {
    id: primitiveFields.id,
    projectId: { type: "string", required: true },
    logos: { type: "string[]", default: [] },
    primaryColors: { type: "string[]", default: [] },
    typographyStyle: { type: "string", max: 240 },
    fixedBrandTerms: { type: "string[]", default: [] },
    bannedElements: { type: "string[]", default: [] },
  },

  CharacterProfile: {
    id: primitiveFields.id,
    projectId: { type: "string", required: true },
    name: { type: "string", required: true, max: 80 },
    referenceAssetIds: { type: "string[]", minItems: 1 },
    lockAppearance: { type: "boolean", default: true },
    consistencyStrength: { type: "number", min: 0, max: 1, default: 0.75 },
  },

  SchemeBrief: {
    id: primitiveFields.id,
    projectId: { type: "string", required: true },
    mode: { enum: enums.productionMode, required: true },
    code: { type: "string", required: true },
    title: { ...primitiveFields.title, required: true },
    brief: { type: "string", required: true, max: 1200 },
    slogans: { type: "record<sloganLanguage,string>", default: {} },
    promptBlocks: { type: "PromptBlock[]", default: [] },
    lockedFields: { type: "string[]", default: [] },
    outputPresets: { enumArray: enums.platformPreset, default: [] },
    status: { enum: enums.resultStatus, default: "pending" },
  },

  GenerationJob: {
    id: primitiveFields.id,
    projectId: { type: "string", required: true },
    mode: { enum: enums.productionMode, required: true },
    schemeIds: { type: "string[]", minItems: 1 },
    status: { enum: enums.jobStatus, default: "draft" },
    totalCount: { type: "number", min: 1 },
    completedCount: { type: "number", min: 0, default: 0 },
    failedCount: { type: "number", min: 0, default: 0 },
    providerId: { enum: enums.providerId, required: true },
    estimatedCost: { type: "number", min: 0, nullable: true },
  },

  ResultAsset: {
    id: primitiveFields.id,
    projectId: { type: "string", required: true },
    schemeId: { type: "string", required: true },
    jobId: { type: "string", required: true },
    mode: { enum: enums.productionMode, required: true },
    width: { type: "number", min: 1 },
    height: { type: "number", min: 1 },
    platformPreset: { enum: enums.platformPreset },
    language: { enum: enums.sloganLanguage, nullable: true },
    model: { type: "string", required: true },
    status: { enum: enums.resultStatus, default: "pending" },
  },
};

export const formSchemas = {
  ProjectBriefForm: {
    projectName: entitySchemas.Project.name,
    gameDescription: entitySchemas.Project.description,
    focusGuidanceEnabled: { type: "boolean", default: true },
    focusGuidance: { type: "string", max: 500 },
  },

  OutputSettingsForm: {
    platformPresets: { enumArray: enums.platformPreset, minItems: 1 },
    aspectRatios: { type: "string[]", minItems: 1 },
    customSize: {
      type: "object",
      shape: {
        width: { type: "number", min: 256, max: 8192 },
        height: { type: "number", min: 256, max: 8192 },
      },
      nullable: true,
    },
    selectionMode: { enum: ["single", "suite", "custom-size"], default: "single" },
    planStrategy: { enum: ["unified", "independent"], default: "unified" },
    schemeCount: { type: "number", min: 1, max: 20, default: 4 },
    imagesPerScheme: { type: "number", min: 1, max: 8, default: 1 },
  },

  SloganSettingsForm: {
    mode: { enum: enums.sloganMode, default: "off" },
    globalSlogan: { type: "string", max: 80, nullable: true },
    languages: { enumArray: enums.sloganLanguage, default: ["en-US"] },
  },

  ProviderConfigForm: {
    providerId: { enum: enums.providerId, required: true },
    enabled: { type: "boolean", default: false },
    apiKey: { type: "secret", masked: true, nullable: true },
    baseUrl: { type: "url", nullable: true },
    defaultModel: { type: "string", required: true },
    modelSlots: { type: "record<taskSlot,modelId>", default: {} },
  },

  ModeForms: {
    poster: {
      mode: { const: "poster" },
      styleTags: { type: "string[]", default: [] },
      compositionReferenceStrength: { enum: enums.referenceStrength, default: "composition" },
    },
    collab: {
      mode: { const: "collab" },
      collabBrandName: { type: "string", required: true, max: 80 },
      collabStyleInjection: { enum: ["native", "brand", "game"], default: "native" },
      characterPlaceholdersOnly: { type: "boolean", const: true },
      preventCharacterMerge: { type: "boolean", const: true },
    },
    announcement: {
      mode: { const: "announcement" },
      announcementTitle: { type: "string", required: true, max: 80 },
      copyPreset: { type: "string", nullable: true },
      layoutMode: { enum: ["integratedTypography", "regularPanel"], default: "integratedTypography" },
      groupShotWhenMultiCharacter: { type: "boolean", default: true },
    },
    logo: {
      mode: { const: "logo" },
      styleTags: { type: "string[]", default: [] },
      wordmark: { type: "string", required: true, max: 80 },
      solidBackground: { type: "boolean", const: true },
      backgroundColor: { type: "string", default: "#ffffff" },
      wordmarkIsPrimarySubject: { type: "boolean", const: true },
    },
    icon: {
      mode: { const: "icon" },
      styleTags: { type: "string[]", default: [] },
      aspectRatio: { const: "1:1" },
      noText: { type: "boolean", const: true },
      fullBleedSquare: { type: "boolean", const: true },
      compositionReferenceRotation: { type: "boolean", default: true },
    },
  },
};

export const modeAssetRequirements = {
  poster: ["gameCharacter", "background?", "prop?", "gameLogo?", "styleReference?", "compositionReference?"],
  collab: ["gameCharacter", "collabCharacter", "gameLogo", "brandLogo?", "background?"],
  announcement: ["gameCharacter?", "background?", "gameLogo?", "brandLogo?", "uiScreenshot?"],
  logo: ["subjectReference?", "gameLogo?"],
  icon: ["subjectReference|gameCharacter|prop|gameLogo", "compositionReference?", "styleReference?"],
};

export const implementationNotes = [
  "This file is a framework-agnostic static contract. Map it to Zod + React Hook Form when the app migrates to Next.js.",
  "Do not connect providers or persist API keys from this static schema file.",
  "Mode guardrails are product constraints, not optional UI labels.",
];
