import { modeSpecs } from './data/modes.js';
import { getActiveMode, getRuntimeWorkspaceSnapshot, setRuntimeWorkspaceSnapshot, state } from './state.js';
import { createModeFormDefaults, createOutputSettingsDefaults, createProjectBriefDefaults, createSloganSettingsDefaults } from './schema/index.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function activeModeId() {
  return getActiveMode().id;
}

function findModeState(snapshot, modeId = activeModeId()) {
  return snapshot.modeStates.find((item) => item.mode === modeId);
}

function ensureModeState(snapshot, modeId = activeModeId()) {
  let modeState = findModeState(snapshot, modeId);
  if (modeState) return modeState;

  modeState = {
    mode: modeId,
    projectBrief: createProjectBriefDefaults(modeId),
    outputSettings: {
      ...createOutputSettingsDefaults(modeId),
      mode: modeId,
    },
    sloganSettings: createSloganSettingsDefaults(),
    modeForm: createModeFormDefaults(modeId),
    selectedSchemeIds: [],
    updatedAt: nowIso(),
  };
  snapshot.modeStates.push(modeState);
  return modeState;
}

function parseFieldValue(path, rawValue) {
  if (path === "outputSettings.schemeCount" || path === "outputSettings.imagesPerScheme") {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : 1;
  }

  if ([
    "projectBrief.focusGuidanceEnabled",
    "modeForm.characterPlaceholdersOnly",
    "modeForm.preventCharacterMerge",
    "modeForm.groupShotWhenMultiCharacter",
    "modeForm.solidBackground",
    "modeForm.wordmarkIsPrimarySubject",
    "modeForm.noText",
    "modeForm.fullBleedSquare",
    "modeForm.compositionReferenceRotation",
  ].includes(path)) {
    return rawValue === true || rawValue === "true" || rawValue === "on";
  }

  return String(rawValue ?? "");
}

function setPath(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== "object") cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
}

function getPath(target, path) {
  return path.split(".").reduce((cursor, part) => cursor?.[part], target);
}

function commitSnapshot(snapshot, source = "form") {
  snapshot.metadata = {
    ...snapshot.metadata,
    updatedAt: nowIso(),
  };
  setRuntimeWorkspaceSnapshot(snapshot, source);
}

export function getActiveGenerationFormValues(modeIdOverride = "") {
  const snapshot = getRuntimeWorkspaceSnapshot();
  const modeId = modeSpecs[modeIdOverride] ? modeIdOverride : activeModeId();
  const modeSpec = modeSpecs[modeId] || getActiveMode();
  const modeState = findModeState(snapshot, modeId);
  const modeForm = normalizeRuntimeModeForm({
    ...createModeFormDefaults(modeId),
    ...(modeState?.modeForm || {}),
    mode: modeId,
  });
  const outputSettings = normalizeRuntimeOutputSettings(modeId, {
    ...createOutputSettingsDefaults(modeId),
    ...(modeState?.outputSettings || {}),
    mode: modeId,
  });

  return {
    mode: modeId,
    projectBrief: {
      ...createProjectBriefDefaults(modeId),
      ...(modeState?.projectBrief || {}),
      projectName: snapshot.project.name,
      gameDescription: modeState?.projectBrief?.gameDescription || snapshot.project.description || modeSpec.description,
    },
    outputSettings,
    sloganSettings: normalizeRuntimeSloganSettings({
      ...createSloganSettingsDefaults(),
      ...(modeState?.sloganSettings || {}),
    }),
    modeForm: {
      ...modeForm,
    },
    providerId: state.provider,
    selectedSchemeIds: modeState?.selectedSchemeIds || [],
  };
}

function normalizeRuntimeOutputSettings(modeId, outputSettings) {
  const aspectRatios = Array.isArray(outputSettings?.aspectRatios) ? outputSettings.aspectRatios : [];
  const platformPresets = Array.isArray(outputSettings?.platformPresets) ? outputSettings.platformPresets : [];
  const selectionMode = ["single", "suite", "custom-size"].includes(outputSettings?.selectionMode)
    ? outputSettings.selectionMode
    : outputSettings?.customSize
      ? "custom-size"
      : "single";
  const planStrategy = ["unified", "independent"].includes(outputSettings?.planStrategy)
    ? outputSettings.planStrategy
    : "unified";
  const oldSuitePresetIds = new Set(["tiktok", "metaAds", "tapTap", "googlePlay", "appStore"]);
  const carriesOldSuitePreset = platformPresets.some((preset) => oldSuitePresetIds.has(preset));
  const carriesCustomSuiteState = platformPresets.includes("custom") && aspectRatios.length > 1 && !outputSettings?.customSize;
  const markedSuite = selectionMode === "suite";

  if (["poster", "collab", "announcement"].includes(modeId) && (carriesOldSuitePreset || (carriesCustomSuiteState && !markedSuite))) {
    return {
      ...outputSettings,
      platformPresets: ["custom"],
      aspectRatios: ["16:9"],
      customSize: null,
      selectionMode: "single",
      planStrategy,
    };
  }

  return {
    ...outputSettings,
    platformPresets,
    aspectRatios: modeId === "icon" ? ["1:1"] : (aspectRatios.length > 0 ? aspectRatios : ["16:9"]),
    selectionMode: modeId === "icon" ? "suite" : selectionMode,
    planStrategy,
  };
}

function normalizeRuntimeModeForm(modeForm) {
  if (!["poster", "logo", "icon"].includes(modeForm?.mode)) return modeForm;
  const styleTags = Array.isArray(modeForm.styleTags)
    ? Array.from(new Set(modeForm.styleTags.map((item) => String(item).trim()).filter(Boolean))).slice(0, 1)
    : [];
  return {
    ...modeForm,
    styleTags,
  };
}

function normalizeRuntimeSloganSettings(settings) {
  const languages = Array.isArray(settings?.languages)
    ? settings.languages.map((item) => String(item).trim()).filter(Boolean)
    : [];
  return {
    ...settings,
    languages: [languages[0] || "en-US"],
  };
}

export function updateGenerationFormField(path, rawValue) {
  const snapshot = clone(getRuntimeWorkspaceSnapshot());
  const modeId = activeModeId();
  const modeState = ensureModeState(snapshot, modeId);
  const parsedValue = parseFieldValue(path, rawValue);
  const value = path === "sloganSettings.languages" ? [parsedValue] : parsedValue;

  setPath(modeState, path, value);
  modeState.updatedAt = nowIso();

  if (path === "projectBrief.projectName") {
    snapshot.project.name = value;
  }
  if (path === "projectBrief.gameDescription") {
    snapshot.project.description = value;
  }
  if (path === "providerId") {
    state.provider = value;
  }

  commitSnapshot(snapshot);
}

export function replaceGenerationFormField(path, value) {
  const snapshot = clone(getRuntimeWorkspaceSnapshot());
  const modeId = activeModeId();
  const modeState = ensureModeState(snapshot, modeId);

  setPath(modeState, path, value);
  modeState.updatedAt = nowIso();

  if (path === "projectBrief" && value && typeof value === "object") {
    snapshot.project.name = value.projectName || snapshot.project.name;
    snapshot.project.description = value.gameDescription || snapshot.project.description;
  }
  if (path === "providerId") {
    state.provider = String(value || "openai");
  }

  commitSnapshot(snapshot);
}

export function setGenerationFormChoice(path, rawValue, options = {}) {
  const snapshot = clone(getRuntimeWorkspaceSnapshot());
  const modeId = activeModeId();
  const modeState = ensureModeState(snapshot, modeId);
  const current = getPath(modeState, path);
  const multi = options.multi === true;
  const value = parseFieldValue(path, rawValue);

  if (path === "sloganSettings.languages") {
    setPath(modeState, path, [value]);
  } else if (multi) {
    const list = Array.isArray(current) ? [...current] : [];
    const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
    const allowEmpty = path === "modeForm.styleTags";
    setPath(modeState, path, next.length > 0 || allowEmpty ? next : [value]);
  } else {
    setPath(modeState, path, value);
  }

  if (path === "providerId") {
    state.provider = value;
  }

  modeState.updatedAt = nowIso();
  commitSnapshot(snapshot);
}

export function applyGenerationFormValuesToSnapshot(snapshot, values) {
  const nextSnapshot = clone(snapshot);
  const modeId = values.mode || activeModeId();
  const modeState = ensureModeState(nextSnapshot, modeId);

  nextSnapshot.activeMode = modeId;
  nextSnapshot.project.name = values.projectBrief.projectName;
  nextSnapshot.project.description = values.projectBrief.gameDescription;
  modeState.projectBrief = clone(values.projectBrief);
  modeState.outputSettings = clone(values.outputSettings);
  modeState.sloganSettings = normalizeRuntimeSloganSettings(clone(values.sloganSettings));
  modeState.modeForm = clone(values.modeForm);
  modeState.selectedSchemeIds = clone(values.selectedSchemeIds || []);
  modeState.updatedAt = nowIso();
  nextSnapshot.metadata.updatedAt = modeState.updatedAt;

  return nextSnapshot;
}
