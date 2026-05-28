import type {
  ModeForm,
  OutputSettingsForm,
  ProjectBriefForm,
  ProviderConfigForm,
  ProviderId,
  SloganSettingsForm,
  ProductionMode,
} from "./zod";

export const defaultProjectName = "Pizza Kitchen Adventures";

export const modeDefaultOutput: Record<ProductionMode, Omit<OutputSettingsForm, "mode">> = {
  poster: {
    platformPresets: ["custom"],
    aspectRatios: ["16:9"],
    schemeCount: 16,
    imagesPerScheme: 1,
    customSize: null,
  },
  collab: {
    platformPresets: ["custom"],
    aspectRatios: ["16:9"],
    schemeCount: 12,
    imagesPerScheme: 1,
    customSize: null,
  },
  announcement: {
    platformPresets: ["custom"],
    aspectRatios: ["16:9"],
    schemeCount: 8,
    imagesPerScheme: 1,
    customSize: null,
  },
  logo: {
    platformPresets: ["custom"],
    aspectRatios: ["1:1", "4:3"],
    schemeCount: 6,
    imagesPerScheme: 1,
    customSize: null,
  },
  icon: {
    platformPresets: ["appStore", "googlePlay"],
    aspectRatios: ["1:1"],
    schemeCount: 6,
    imagesPerScheme: 1,
    customSize: null,
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
      concept: "gemini-2.5-flash",
      image: "gemini-3-pro-image-preview",
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
};

export function createProjectBriefDefaults(mode: ProductionMode = "poster"): ProjectBriefForm {
  return {
    projectName: defaultProjectName,
    gameDescription:
      "A hybrid cooking management and wilderness hunting game where chef teams gather rare ingredients for VIP guests.",
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
    mode: "auto",
    globalSlogan: "",
    languages: ["en-US"],
  };
}

export function createProviderConfigDefaults(providerId: ProviderId = "openai"): ProviderConfigForm {
  const defaults = providerDefaults[providerId] || providerDefaults.openai;
  return {
    providerId,
    enabled: providerId === "openai",
    apiKey: "",
    baseUrl: defaults.baseUrl,
    defaultModel: defaults.defaultModel,
    modelSlots: { ...defaultProviderModelSlots, ...defaults.modelSlots },
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
      wordmark: defaultProjectName,
      solidBackground: true,
      backgroundColor: "#ffffff",
      wordmarkIsPrimarySubject: true,
    },
    icon: {
      mode: "icon",
      aspectRatio: "1:1",
      noText: true,
      fullBleedSquare: true,
      compositionReferenceRotation: true,
    },
  };

  return defaults[mode];
}
