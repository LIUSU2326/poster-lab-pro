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
    platformPresets: ["tiktok", "metaAds"],
    aspectRatios: ["9:16", "16:9", "1200x627"],
    schemeCount: 16,
    imagesPerScheme: 1,
    customSize: null,
  },
  collab: {
    platformPresets: ["metaAds", "tiktok"],
    aspectRatios: ["16:9", "9:16", "1200x627"],
    schemeCount: 12,
    imagesPerScheme: 1,
    customSize: null,
  },
  announcement: {
    platformPresets: ["tapTap", "googlePlay"],
    aspectRatios: ["16:9", "1:1"],
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
  concept: "gpt-4o",
  image: "gpt-image-1",
  styleReference: "gpt-4o",
  compositionReference: "gpt-4o",
};

const providerDefaults: Record<ProviderId, { baseUrl: string; defaultModel: string; modelSlots?: Record<string, string> }> = {
  openai: {
    baseUrl: "",
    defaultModel: "gpt-image-1",
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
  replicate: {
    baseUrl: "",
    defaultModel: "black-forest-labs/flux",
  },
  comfy: {
    baseUrl: "http://127.0.0.1:8188",
    defaultModel: "poster-lab-workflow",
  },
  custom: {
    baseUrl: "",
    defaultModel: "custom-image-endpoint",
  },
};

export function createProjectBriefDefaults(mode: ProductionMode = "poster"): ProjectBriefForm {
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
    languages: ["zh-CN", "en-US"],
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
      styleTags: ["cinematic", "game-key-visual"],
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
