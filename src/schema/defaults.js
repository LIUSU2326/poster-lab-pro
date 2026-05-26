import { enums } from "./models.js";

const defaultProjectName = "Pizza Kitchen Adventures";

export const modeDefaultOutput = {
  poster: {
    platformPresets: ["tiktok", "metaAds"],
    aspectRatios: ["9:16", "16:9", "1200x627"],
    schemeCount: 16,
    imagesPerScheme: 1,
  },
  collab: {
    platformPresets: ["metaAds", "tiktok"],
    aspectRatios: ["16:9", "9:16", "1200x627"],
    schemeCount: 12,
    imagesPerScheme: 1,
  },
  announcement: {
    platformPresets: ["tapTap", "googlePlay"],
    aspectRatios: ["16:9", "1:1"],
    schemeCount: 8,
    imagesPerScheme: 1,
  },
  logo: {
    platformPresets: ["custom"],
    aspectRatios: ["1:1", "4:3"],
    schemeCount: 6,
    imagesPerScheme: 1,
  },
  icon: {
    platformPresets: ["appStore", "googlePlay"],
    aspectRatios: ["1:1"],
    schemeCount: 6,
    imagesPerScheme: 1,
  },
};

export const defaultProviderModelSlots = {
  concept: "gpt-5.5",
  image: "gpt-image-2",
  styleReference: "gpt-5.5",
  compositionReference: "gpt-5.5",
};

const providerDefaults = {
  openai: {
    baseUrl: "",
    defaultModel: "gpt-image-2",
  },
  aigocode: {
    baseUrl: "https://api.aigocode.com/v1",
    defaultModel: "gpt-5.5",
    modelSlots: {
      concept: "gpt-5.5",
      image: "gpt-image-2",
      styleReference: "gpt-5.5",
      compositionReference: "gpt-5.5",
    },
  },
  google: {
    baseUrl: "",
    defaultModel: "gemini-3-pro-image-preview",
    modelSlots: {
      concept: "gemini-3-pro-preview",
      image: "gemini-3-pro-image-preview",
      styleReference: "gemini-3-pro-preview",
      compositionReference: "gemini-3-pro-preview",
    },
  },
  deepseek: {
    baseUrl: "",
    defaultModel: "deepseek-v4-flash",
  },
  claude: {
    baseUrl: "",
    defaultModel: "claude-opus-4-1-20250805",
  },
  qwen: {
    baseUrl: "",
    defaultModel: "qwen3.7-max",
  },
};

export function createProjectBriefDefaults(mode = "poster") {
  return {
    projectName: defaultProjectName,
    gameDescription:
      "A hybrid cooking management and wilderness hunting game where chef teams gather rare ingredients for VIP guests.",
    focusGuidanceEnabled: true,
    focusGuidance:
      mode === "icon"
        ? "Emphasize the main subject and dynamic prop interaction."
        : "Emphasize the chef squad, monster ingredients, restaurant operation, and adventure tone.",
  };
}

export function createOutputSettingsDefaults(mode = "poster") {
  const defaults = modeDefaultOutput[mode] || modeDefaultOutput.poster;
  return {
    ...defaults,
    customSize: null,
  };
}

export function createSloganSettingsDefaults() {
  return {
    mode: "auto",
    globalSlogan: "",
    languages: ["zh-CN", "en-US"],
  };
}

export function createProviderConfigDefaults(providerId = "openai") {
  const defaults = providerDefaults[providerId] || providerDefaults.openai;
  return {
    providerId,
    enabled: providerId === "openai",
    apiKey: "",
    baseUrl: defaults.baseUrl,
    defaultModel: defaults.defaultModel,
    modelSlots: { ...defaultProviderModelSlots, ...(defaults.modelSlots || {}) },
  };
}

export function createModeFormDefaults(mode = "poster") {
  if (!enums.productionMode.includes(mode)) {
    throw new Error(`Unknown production mode: ${mode}`);
  }

  const common = {
    mode,
    styleTags: [],
  };

  const modeDefaults = {
    poster: {
      ...common,
      styleTags: ["cinematic", "game-key-visual"],
      compositionReferenceStrength: "composition",
    },
    collab: {
      ...common,
      collabBrandName: "",
      collabStyleInjection: "native",
      characterPlaceholdersOnly: true,
      preventCharacterMerge: true,
    },
    announcement: {
      ...common,
      announcementTitle: "",
      copyPreset: null,
      layoutMode: "integratedTypography",
      groupShotWhenMultiCharacter: true,
    },
    logo: {
      ...common,
      wordmark: defaultProjectName,
      solidBackground: true,
      backgroundColor: "#ffffff",
      wordmarkIsPrimarySubject: true,
    },
    icon: {
      ...common,
      aspectRatio: "1:1",
      noText: true,
      fullBleedSquare: true,
      compositionReferenceRotation: true,
    },
  };

  return modeDefaults[mode];
}

export function createGenerationDraft({ projectId, mode, schemeIds, providerId = "openai" }) {
  return {
    projectId,
    mode,
    schemeIds,
    status: "draft",
    totalCount: schemeIds.length,
    completedCount: 0,
    failedCount: 0,
    providerId,
    estimatedCost: null,
  };
}
