import { modeOrder, modeSpecs } from './modes.js';
import { providers as providerFixtures } from './providers.js';

const createdAt = "2026-05-21T00:00:00.000Z";
const platformPresetsByMode = {
  poster: ["custom"],
  collab: ["custom"],
  announcement: ["custom"],
  logo: ["custom"],
  icon: ["appStore", "googlePlay"],
};

function toProviderConfig(provider) {
  return {
    providerId: provider.id,
    enabled: provider.status !== "idle",
    status: provider.status,
    hasApiKey: provider.status !== "idle",
    apiKeyMasked: provider.key,
    baseUrl: provider.url,
    defaultModel: provider.model,
    modelSlots: {},
    updatedAt: createdAt,
    displayName: provider.name,
    capabilities: provider.caps,
    note: provider.note,
  };
}

function toSchemeBrief(mode, scheme) {
  return {
    id: scheme.id,
    projectId: "project-pizza-kitchen",
    mode: mode.id,
    code: scheme.code,
    title: scheme.title,
    brief: scheme.brief,
    slogans: {
      "zh-CN": scheme.zh,
      "en-US": scheme.en,
    },
    promptBlocks: mode.promptBlocks,
    lockedFields: scheme.locked,
    outputPresets: platformPresetsByMode[mode.id] || ["custom"],
    status: scheme.status === "ready" ? "ready" : scheme.status === "failed" ? "failed" : "pending",
    source: scheme,
  };
}

function createModeState(mode) {
  return {
    mode: mode.id,
    projectBrief: {
      projectName: "Pizza Kitchen Adventures",
      gameDescription: mode.description,
      focusGuidanceEnabled: false,
      focusGuidance: "",
    },
    outputSettings: {
      mode: mode.id,
      platformPresets: platformPresetsByMode[mode.id] || ["custom"],
      aspectRatios: mode.id === "icon" ? ["1:1"] : mode.id === "logo" ? ["1:1"] : ["16:9"],
      customSize: null,
      schemeCount: mode.schemes.length,
      imagesPerScheme: 1,
    },
    sloganSettings: {
      mode: "auto",
      globalSlogan: "",
      languages: ["zh-CN", "en-US"],
    },
    modeForm: createSnapshotModeForm(mode.id),
    selectedSchemeIds: mode.schemes.map((scheme) => scheme.id),
    updatedAt: createdAt,
  };
}

function createSnapshotModeForm(modeId) {
  if (modeId === "collab") {
    return {
      mode: "collab",
      collabBrandName: "Partner Brand",
      collabStyleInjection: "native",
      characterPlaceholdersOnly: true,
      preventCharacterMerge: true,
    };
  }
  if (modeId === "announcement") {
    return {
      mode: "announcement",
      announcementTitle: "Scheduled Maintenance",
      copyPreset: "maintenance",
      layoutMode: "integratedTypography",
      groupShotWhenMultiCharacter: true,
    };
  }
  if (modeId === "logo") {
    return {
      mode: "logo",
      wordmark: "Pizza Kitchen Adventures",
      solidBackground: true,
      backgroundColor: "#ffffff",
      wordmarkIsPrimarySubject: true,
    };
  }
  if (modeId === "icon") {
    return {
      mode: "icon",
      aspectRatio: "1:1",
      noText: true,
      fullBleedSquare: true,
      compositionReferenceRotation: true,
    };
  }
  return {
    mode: "poster",
    styleTags: [],
    compositionReferenceStrength: "composition",
  };
}

const schemes = modeOrder.flatMap((modeId) => {
  const mode = modeSpecs[modeId];
  return mode.schemes.map((scheme) => toSchemeBrief(mode, scheme));
});

const results = schemes
  .filter((scheme) => scheme.status === "ready")
  .map((scheme, index) => ({
    id: `result-${scheme.id}`,
    projectId: scheme.projectId,
    schemeId: scheme.id,
    jobId: `job-${scheme.mode}-project-pizza-kitchen`,
    taskId: `job-${scheme.mode}-project-pizza-kitchen-image-${index + 1}`,
    mode: scheme.mode,
    width: scheme.source.platform.includes("9:16") ? 1080 : 1920,
    height: scheme.source.platform.includes("9:16") ? 1920 : 1080,
    platformPreset: "tiktok",
    language: "en-US",
    model: scheme.source.locked.includes("风格") ? "Imagen Pro" : "Auto-Routing",
    status: "ready",
    providerResultId: `provider-${scheme.id}`,
    thumbnailUrl: null,
    assetUrl: null,
    favorite: index % 2 === 0,
    archivedAt: createdAt,
    metadata: {
      tone: scheme.source.tone,
      code: scheme.code,
      mockPreviewUrl: "/mock-results/pizza-poster-preview.svg",
    },
    createdAt,
    updatedAt: createdAt,
  }));

export const workspaceSnapshot = {
  version: "workspace.v1",
  metadata: {
    workspaceId: "workspace-pizza-kitchen",
    ownerId: "user-demo",
    backend: "memory",
    revision: 1,
    createdAt,
    updatedAt: createdAt,
  },
  activeMode: "poster",
  project: {
    id: "project-pizza-kitchen",
    name: "Pizza Kitchen Adventures",
    description: modeSpecs.poster.description,
    genre: "Simulation RPG",
    coreSellingPoints: ["chef squad", "monster ingredients", "restaurant operation"],
    targetAudience: "Casual and mid-core game players.",
    brandKitId: "brand-pizza-kitchen",
    defaultMode: "poster",
  },
  brandKit: {
    id: "brand-pizza-kitchen",
    projectId: "project-pizza-kitchen",
    logos: ["asset-game-logo"],
    primaryColors: ["#f97316", "#2563eb"],
    typographyStyle: "Chunky readable game campaign typography.",
    fixedBrandTerms: ["Pizza Kitchen Adventures"],
    bannedElements: ["protected third-party IP"],
  },
  characters: [
    {
      id: "character-hero-chef",
      projectId: "project-pizza-kitchen",
      name: "Hero Chef",
      referenceAssetIds: ["asset-game-character"],
      lockAppearance: true,
      consistencyStrength: 0.82,
    },
  ],
  assets: modeSpecs.poster.assets.map((asset, index) => ({
    id: `asset-${index + 1}`,
    projectId: "project-pizza-kitchen",
    role: index === 1 ? "gameLogo" : index === 2 ? "background" : index === 3 ? "compositionReference" : "gameCharacter",
    label: asset.label,
    sourceType: "uploaded",
    previewUrl: null,
    metadata: { tone: asset.tone },
    usage: ["input"],
    storageKey: `project-pizza-kitchen/${asset.label}`,
    mimeType: "image/png",
    byteSize: null,
    checksum: null,
    createdAt,
    updatedAt: createdAt,
  })),
  providerConfigs: Object.fromEntries(providerFixtures.map((provider) => [provider.id, toProviderConfig(provider)])),
  modeStates: modeOrder.map((modeId) => createModeState(modeSpecs[modeId])),
  schemes,
  queuePlans: [],
  queueSummaries: [],
  referenceAnalyses: [],
  results,
  archiveRows: results.map((result) => ({
    id: `archive-${result.id}`,
    projectId: result.projectId,
    resultAssetId: result.id,
    title: schemes.find((scheme) => scheme.id === result.schemeId)?.title || "Untitled result",
    mode: result.mode,
    model: result.model,
    state: result.favorite ? "archived" : "editable",
    createdAt,
    updatedAt: createdAt,
  })),
};
