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
  concept: "gpt-4o",
  image: "gpt-image-1",
  styleReference: "gpt-4o",
  compositionReference: "gpt-4o",
};

const providerDefaults = {
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
