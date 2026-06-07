import { enums } from "./models.js";

const defaultProjectName = "Pizza Kitchen Adventures";

export const modeDefaultOutput = {
  poster: {
    platformPresets: ["custom"],
    aspectRatios: ["16:9"],
    schemeCount: 16,
    imagesPerScheme: 1,
    selectionMode: "single",
    planStrategy: "unified",
  },
  collab: {
    platformPresets: ["custom"],
    aspectRatios: ["16:9"],
    schemeCount: 12,
    imagesPerScheme: 1,
    selectionMode: "single",
    planStrategy: "unified",
  },
  announcement: {
    platformPresets: ["custom"],
    aspectRatios: ["16:9"],
    schemeCount: 8,
    imagesPerScheme: 1,
    selectionMode: "single",
    planStrategy: "unified",
  },
  logo: {
    platformPresets: ["custom"],
    aspectRatios: ["1:1", "4:3"],
    schemeCount: 6,
    imagesPerScheme: 1,
    selectionMode: "suite",
    planStrategy: "unified",
  },
  icon: {
    platformPresets: ["appStore", "googlePlay"],
    aspectRatios: ["1:1"],
    schemeCount: 6,
    imagesPerScheme: 1,
    selectionMode: "suite",
    planStrategy: "unified",
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
    baseUrl: "https://api.aigocode.app/v1",
    defaultModel: "gpt-5.5",
    modelSlots: {
      concept: "gpt-5.5",
      image: "gpt-image-1",
      styleReference: "gpt-5.5",
      compositionReference: "gpt-5.5",
    },
  },
  google: {
    baseUrl: "",
    defaultModel: "gemini-2.5-flash-image",
    modelSlots: {
      concept: "gemini-2.5-flash",
      image: "gemini-2.5-flash-image",
      styleReference: "gemini-2.5-flash",
      compositionReference: "gemini-2.5-flash",
    },
  },
  deepseek: {
    baseUrl: "",
    defaultModel: "deepseek-v4-flash",
    modelSlots: {
      concept: "deepseek-v4-flash",
    },
  },
  claude: {
    baseUrl: "",
    defaultModel: "claude-opus-4-7",
    modelSlots: {
      concept: "claude-opus-4-7",
      styleReference: "claude-opus-4-7",
      compositionReference: "claude-opus-4-7",
    },
  },
  qwen: {
    baseUrl: "",
    defaultModel: "qwen3.7-max",
    modelSlots: {
      concept: "qwen3.7-max",
      image: "wan2.7-image-pro",
      styleReference: "qwen3.6-plus",
      compositionReference: "qwen3.6-plus",
    },
  },
  agnes: {
    baseUrl: "https://apihub.agnes-ai.com/v1",
    defaultModel: "agnes-image-2.1-flash",
    modelSlots: {
      concept: "agnes-2.0-flash",
      image: "agnes-image-2.1-flash",
    },
  },
  mimo: {
    baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
    defaultModel: "mimo-v2.5-pro",
    modelSlots: {
      concept: "mimo-v2.5-pro",
    },
  },
};

export function createProjectBriefDefaults(mode = "poster") {
  return {
    projectName: defaultProjectName,
    gameDescription:
      "A hybrid cooking management and wilderness hunting game where chef teams gather rare ingredients for VIP guests.",
    focusGuidanceEnabled: false,
    focusGuidance: "",
  };
}

export function createOutputSettingsDefaults(mode = "poster") {
  const defaults = modeDefaultOutput[mode] || modeDefaultOutput.poster;
  return {
    ...defaults,
    customSize: null,
    selectionMode: defaults.selectionMode || "single",
    planStrategy: defaults.planStrategy || "unified",
  };
}

export function createSloganSettingsDefaults() {
  return {
    mode: "off",
    globalSlogan: "",
    languages: ["en-US"],
  };
}

export function createProviderConfigDefaults(providerId = "openai") {
  const defaults = providerDefaults[providerId] || providerDefaults.openai;
  const modelSlots = providerId === "openai"
    ? { ...defaultProviderModelSlots, ...(defaults.modelSlots || {}) }
    : { ...(defaults.modelSlots || {}) };
  return {
    providerId,
    enabled: providerId === "openai",
    apiKey: "",
    baseUrl: defaults.baseUrl,
    defaultModel: defaults.defaultModel,
    modelSlots,
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
      styleTags: [],
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
