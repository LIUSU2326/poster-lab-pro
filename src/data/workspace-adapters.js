import { modeSpecs } from './modes.js';
import { modelSlots, providers as providerFixtures } from './providers.js';
import { getResultDownloadUrl, getRuntimeWorkspaceSnapshot } from '../state.js';

const providerStateLabels = {
  idle: "未启用",
  testing: "测试中",
  success: "已配置",
  warning: "需检查",
  error: "错误",
};

const archiveStateLabels = {
  editable: "可编辑",
  missing: "待补图",
  archived: "已归档",
};

const modeArchiveType = {
  poster: "KV",
  collab: "CO",
  announcement: "AN",
  logo: "LG",
  icon: "IC",
};

const roleTone = {
  gameCharacter: "blue",
  collabCharacter: "emerald",
  gameLogo: "ink",
  brandLogo: "teal",
  background: "orange",
  prop: "orange",
  uiScreenshot: "ice",
  styleReference: "violet",
  compositionReference: "teal",
  subjectReference: "blue",
};

const rolePriorityByMode = {
  poster: ["gameCharacter", "gameLogo", "background", "prop", "compositionReference", "styleReference"],
  collab: ["gameCharacter", "collabCharacter", "background", "gameLogo", "brandLogo"],
  announcement: ["gameCharacter", "background", "gameLogo", "brandLogo", "uiScreenshot"],
  logo: ["gameLogo", "subjectReference", "prop", "gameCharacter"],
  icon: ["subjectReference", "gameCharacter", "prop", "gameLogo", "compositionReference", "styleReference"],
};

const providerFallbacks = Object.fromEntries(providerFixtures.map((provider) => [provider.id, provider]));

function runtimeSnapshot() {
  return getRuntimeWorkspaceSnapshot();
}

export function getWorkspaceProject() {
  return runtimeSnapshot().project;
}

export function getProviderRows() {
  const configs = runtimeSnapshot().providerConfigs || {};
  const fixtureIds = providerFixtures.map((provider) => provider.id);
  const providerIds = [
    ...fixtureIds,
    ...Object.keys(configs).filter((providerId) => !fixtureIds.includes(providerId)),
  ];

  return providerIds.map((providerId) => {
    const fallback = providerFallbacks[providerId] || {};
    const provider = configs[providerId] || {
      providerId,
      status: fallback.status || "idle",
      apiKeyMasked: fallback.key || "",
      baseUrl: fallback.url || "",
      defaultModel: fallback.model || "",
      displayName: fallback.name || providerId,
      capabilities: fallback.caps || [],
      note: fallback.note || "",
    };
    return {
      id: provider.providerId,
      name: provider.displayName || fallback.name || provider.providerId,
      state: providerStateLabels[provider.status] || provider.status,
      status: provider.status,
      key: provider.apiKeyMasked || fallback.key || "未配置",
      model: provider.defaultModel || fallback.model || "未选择",
      url: provider.baseUrl || fallback.url || "未设置",
      caps: provider.capabilities || fallback.caps || [],
      note: provider.note || fallback.note || "静态配置示意，尚未执行真实连接测试。",
    };
  });
}

export function getModelSlots() {
  return modelSlots;
}

export function getArchiveRows() {
  const snapshot = runtimeSnapshot();

  return snapshot.archiveRows
    .filter((row) => {
      const result = snapshot.results.find((item) => item.id === row.resultAssetId);
      return !isDemoResult(result);
    })
    .map((row) => {
      const result = snapshot.results.find((item) => item.id === row.resultAssetId);
      const scheme = snapshot.schemes.find((item) => item.id === result?.schemeId);
      const mode = modeSpecs[row.mode];
      const mockPreviewUrl = typeof result?.metadata?.mockPreviewUrl === "string" ? result.metadata.mockPreviewUrl : "";
      const previewUrl = mockPreviewUrl
        || (result?.metadata?.resultFile?.storageKey ? getResultDownloadUrl(result, { inline: true }) : "")
        || result?.thumbnailUrl
        || result?.assetUrl
        || "";
      const downloadUrl = mockPreviewUrl
        || (result?.metadata?.resultFile?.storageKey ? getResultDownloadUrl(result) : "")
        || result?.assetUrl
        || result?.thumbnailUrl
        || "";

      return {
        id: row.id,
        resultId: row.resultAssetId,
        title: row.title,
        project: snapshot.project.name,
        model: result?.model || row.model,
        state: archiveStateLabels[row.state] || row.state,
        status: row.state,
        type: modeArchiveType[row.mode] || row.mode.toUpperCase(),
        tone: result?.metadata?.tone || scheme?.source?.tone || mode?.accent || "forest",
        previewUrl,
        downloadUrl,
        width: result?.width || null,
        height: result?.height || null,
        createdAt: result?.createdAt || row.createdAt || "",
        updatedAt: result?.updatedAt || row.updatedAt || "",
      };
    });
}

function isDemoResult(result) {
  if (!result) return false;
  if (result.metadata?.mockPreviewUrl || result.metadata?.source === "mock-provider") return true;
  return /example\.com/i.test(String(result.thumbnailUrl || result.assetUrl || ""));
}

export function getWorkspaceSnapshotSummary() {
  const snapshot = runtimeSnapshot();

  return {
    workspaceId: snapshot.metadata.workspaceId,
    projectId: snapshot.project.id,
    projectName: snapshot.project.name,
    activeMode: snapshot.activeMode,
    revision: snapshot.metadata.revision,
    assetCount: snapshot.assets.length,
    schemeCount: snapshot.schemes.length,
    resultCount: snapshot.results.length,
    archiveCount: snapshot.archiveRows.length,
    updatedAt: snapshot.metadata.updatedAt,
  };
}

export function getAssetSlotsForMode(modeId, fallbackAssets = []) {
  const snapshot = runtimeSnapshot();
  const roles = rolePriorityByMode[modeId] || [];
  const fallbackSlots = fallbackAssets.map((asset, index) => ({
    ...asset,
    role: asset.role || roles[index] || "styleReference",
  }));
  const fallbackRoles = new Set(fallbackSlots.map((slot) => slot.role));
  const uploadedByRole = new Map();

  snapshot.assets
    .map((asset) => ({
      ...asset,
      role: normalizeAssetRole(asset),
    }))
    .filter((asset) => roles.length === 0 || roles.includes(asset.role))
    .sort((a, b) => Date.parse(a.updatedAt || a.createdAt || "") - Date.parse(b.updatedAt || b.createdAt || ""))
    .forEach((asset) => {
      if (!fallbackRoles.has(asset.role)) return;
      uploadedByRole.set(asset.role, asset);
    });

  if (fallbackSlots.length > 0) {
    return fallbackSlots.map((slot) => {
      const asset = uploadedByRole.get(slot.role);
      return {
        role: slot.role,
        label: slot.label,
        sourceType: asset?.sourceType || slot.sourceType || "placeholder",
        state: asset?.sourceType && asset.sourceType !== "placeholder" ? "uploaded" : slot.state,
        tone: roleTone[slot.role] || slot.tone || "blue",
        previewUrl: normalizePreviewUrl(asset?.previewUrl || slot.previewUrl),
      };
    });
  }

  return [...uploadedByRole.values()].map((asset) => ({
    role: asset.role,
    label: asset.label,
    sourceType: asset.sourceType,
    state: asset.sourceType === "placeholder" ? "placeholder" : (asset.usage || ["input"]).join(" / "),
    tone: roleTone[asset.role] || "blue",
    previewUrl: normalizePreviewUrl(asset.previewUrl),
  }));
}

export function getDefaultAssetRoleForMode(modeId) {
  return rolePriorityByMode[modeId]?.[0] || "styleReference";
}

function normalizePreviewUrl(value) {
  const url = typeof value === "string" ? value : "";
  if (!url || /example\.com/i.test(url)) return null;
  if (/^blob:/i.test(url)) return null;
  const localUpload = url.match(/^https?:\/\/(?:localhost|127\.0\.0\.1):\d+(\/uploads\/.+)$/i);
  if (localUpload?.[1]) return localUpload[1];
  return url;
}

function normalizeAssetRole(asset) {
  const role = asset?.role || "";
  const label = String(asset?.label || "");
  if (role === "gameCharacter" && /背景|场景/i.test(label)) {
    return "background";
  }
  if (role === "gameCharacter" && /logo|标识/i.test(label)) {
    return "gameLogo";
  }
  return role;
}
