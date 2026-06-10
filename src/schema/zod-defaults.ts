import type {
  ModeForm,
  OutputSettingsForm,
  ProjectBriefForm,
  ProviderConfigForm,
  ProviderId,
  SloganSettingsForm,
  ProductionMode,
} from "./zod";

export const defaultProjectName = "";
const defaultLogoWordmark = "Untitled Logo";

export const modeDefaultOutput: Record<ProductionMode, Omit<OutputSettingsForm, "mode">> = {
  poster: {
    platformPresets: ["custom"],
    aspectRatios: ["16:9"],
    schemeCount: 16,
    imagesPerScheme: 1,
    customSize: null,
    selectionMode: "single",
    planStrategy: "unified",
  },
  collab: {
    platformPresets: ["custom"],
    aspectRatios: ["16:9"],
    schemeCount: 12,
    imagesPerScheme: 1,
    customSize: null,
    selectionMode: "single",
    planStrategy: "unified",
  },
  announcement: {
    platformPresets: ["custom"],
    aspectRatios: ["16:9"],
    schemeCount: 8,
    imagesPerScheme: 1,
    customSize: null,
    selectionMode: "single",
    planStrategy: "unified",
  },
  logo: {
    platformPresets: ["custom"],
    aspectRatios: ["1:1", "4:3"],
    schemeCount: 6,
    imagesPerScheme: 1,
    customSize: null,
    selectionMode: "suite",
    planStrategy: "unified",
  },
  icon: {
    platformPresets: ["appStore", "googlePlay"],
    aspectRatios: ["1:1"],
    schemeCount: 6,
    imagesPerScheme: 1,
    customSize: null,
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

const providerDefaults: Record<ProviderId, { baseUrl: string; defaultModel: string; modelSlots?: Record<string, string> }> = {
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

export function createProjectBriefDefaults(mode: ProductionMode = "poster"): ProjectBriefForm {
  return {
    projectName: defaultProjectName,
    gameDescription: "",
    focusGuidanceEnabled: false,
    focusGuidance: "",
  };
}

export function createOutputSettingsDefaults(mode: ProductionMode = "poster"): OutputSettingsForm {
  return {
    mode,
    ...modeDefaultOutput[mode],
  };
}

export function createSloganSettingsDefaults(): SloganSettingsForm {
  return {
    mode: "off",
    globalSlogan: "",
    languages: ["en-US"],
  };
}

export function createProviderConfigDefaults(providerId: ProviderId = "openai"): ProviderConfigForm {
  const defaults = providerDefaults[providerId] || providerDefaults.openai;
  const modelSlots = providerId === "openai"
    ? { ...defaultProviderModelSlots, ...defaults.modelSlots }
    : { ...defaults.modelSlots };
  return {
    providerId,
    enabled: providerId === "openai",
    apiKey: "",
    baseUrl: defaults.baseUrl,
    defaultModel: defaults.defaultModel,
    modelSlots,
  };
}

export function createModeFormDefaults(mode: ProductionMode = "poster"): ModeForm {
  const defaults: Record<ProductionMode, ModeForm> = {
    poster: {
      mode: "poster",
      styleTags: [],
      compositionReferenceStrength: "composition",
    },
    collab: {
      mode: "collab",
      collabBrandName: "Partner Brand",
      collabStyleInjection: "native",
      characterPlaceholdersOnly: true,
      preventCharacterMerge: true,
    },
    announcement: {
      mode: "announcement",
      announcementTitle: "Scheduled Maintenance",
      copyPreset: null,
      layoutMode: "integratedTypography",
      groupShotWhenMultiCharacter: true,
    },
    logo: {
      mode: "logo",
      styleTags: [],
      wordmark: defaultLogoWordmark,
      solidBackground: true,
      backgroundColor: "#ffffff",
      wordmarkIsPrimarySubject: true,
    },
    icon: {
      mode: "icon",
      styleTags: [],
      aspectRatio: "1:1",
      noText: true,
      fullBleedSquare: true,
      compositionReferenceRotation: true,
    },
  };

  return defaults[mode];
}
