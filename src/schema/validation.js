import { enums, formSchemas, modeAssetRequirements } from "./models.js";

function issue(path, message) {
  return { path, message };
}

function assertEnum(value, options, path, issues) {
  if (!options.includes(value)) {
    issues.push(issue(path, `Expected one of: ${options.join(", ")}`));
  }
}

function assertNonEmptyString(value, path, issues) {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(issue(path, "Expected a non-empty string."));
  }
}

function assertStringArray(value, path, issues, { minItems = 0 } = {}) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    issues.push(issue(path, "Expected an array of strings."));
    return;
  }
  if (value.length < minItems) {
    issues.push(issue(path, `Expected at least ${minItems} item(s).`));
  }
}

function assertNumberRange(value, path, issues, { min = -Infinity, max = Infinity } = {}) {
  if (typeof value !== "number" || Number.isNaN(value) || value < min || value > max) {
    issues.push(issue(path, `Expected a number between ${min} and ${max}.`));
  }
}

function result(issues) {
  return {
    ok: issues.length === 0,
    issues,
  };
}

export function validateProjectBriefForm(data) {
  const issues = [];
  assertNonEmptyString(data?.projectName, "projectName", issues);
  assertNonEmptyString(data?.gameDescription, "gameDescription", issues);
  if (typeof data?.focusGuidanceEnabled !== "boolean") {
    issues.push(issue("focusGuidanceEnabled", "Expected a boolean."));
  }
  if (data?.focusGuidance && data.focusGuidance.length > 500) {
    issues.push(issue("focusGuidance", "Expected 500 characters or fewer."));
  }
  return result(issues);
}

export function validateOutputSettingsForm(mode, data) {
  const issues = [];
  assertEnum(mode, enums.productionMode, "mode", issues);
  assertStringArray(data?.platformPresets, "platformPresets", issues, { minItems: 1 });
  assertStringArray(data?.aspectRatios, "aspectRatios", issues, { minItems: 1 });
  assertNumberRange(data?.schemeCount, "schemeCount", issues, { min: 1, max: 20 });
  assertNumberRange(data?.imagesPerScheme, "imagesPerScheme", issues, { min: 1, max: 8 });

  if (mode === "icon" && !data?.aspectRatios?.every((ratio) => ratio === "1:1")) {
    issues.push(issue("aspectRatios", "Icon mode only supports 1:1."));
  }

  return result(issues);
}

export function validateSloganSettingsForm(data) {
  const issues = [];
  assertEnum(data?.mode, enums.sloganMode, "mode", issues);
  assertStringArray(data?.languages, "languages", issues, { minItems: 1 });
  for (const language of data?.languages || []) {
    assertEnum(language, enums.sloganLanguage, `languages.${language}`, issues);
  }
  if (data?.mode === "global") {
    assertNonEmptyString(data?.globalSlogan, "globalSlogan", issues);
  }
  return result(issues);
}

export function validateProviderConfigForm(data) {
  const issues = [];
  assertEnum(data?.providerId, enums.providerId, "providerId", issues);
  if (typeof data?.enabled !== "boolean") {
    issues.push(issue("enabled", "Expected a boolean."));
  }
  if (data?.enabled && !data?.defaultModel) {
    issues.push(issue("defaultModel", "Enabled providers need a default model."));
  }
  if (data?.apiKey && typeof data.apiKey !== "string") {
    issues.push(issue("apiKey", "Expected a masked or plain secret string."));
  }
  return result(issues);
}

export function validateModeForm(mode, data) {
  const issues = [];
  assertEnum(mode, enums.productionMode, "mode", issues);
  if (data?.mode !== mode) {
    issues.push(issue("mode", `Expected mode to be ${mode}.`));
  }

  if (mode === "poster") {
    assertStringArray(data?.styleTags, "styleTags", issues);
    assertEnum(data?.compositionReferenceStrength, enums.referenceStrength, "compositionReferenceStrength", issues);
  }

  if (mode === "collab") {
    assertNonEmptyString(data?.collabBrandName, "collabBrandName", issues);
    assertEnum(data?.collabStyleInjection, ["native", "brand", "game"], "collabStyleInjection", issues);
    if (data?.characterPlaceholdersOnly !== true) {
      issues.push(issue("characterPlaceholdersOnly", "Collab planning must use character placeholders only."));
    }
    if (data?.preventCharacterMerge !== true) {
      issues.push(issue("preventCharacterMerge", "Collab mode must prevent character merging."));
    }
  }

  if (mode === "announcement") {
    assertNonEmptyString(data?.announcementTitle, "announcementTitle", issues);
    assertEnum(data?.layoutMode, ["integratedTypography", "regularPanel"], "layoutMode", issues);
  }

  if (mode === "logo") {
    assertNonEmptyString(data?.wordmark, "wordmark", issues);
    if (data?.solidBackground !== true) {
      issues.push(issue("solidBackground", "Logo mode requires a solid background."));
    }
    if (data?.wordmarkIsPrimarySubject !== true) {
      issues.push(issue("wordmarkIsPrimarySubject", "Logo mode requires the wordmark to be primary."));
    }
  }

  if (mode === "icon") {
    if (data?.aspectRatio !== "1:1") {
      issues.push(issue("aspectRatio", "Icon mode is locked to 1:1."));
    }
    if (data?.noText !== true) {
      issues.push(issue("noText", "Icon mode must prohibit text."));
    }
    if (data?.fullBleedSquare !== true) {
      issues.push(issue("fullBleedSquare", "Icon mode requires full-bleed square composition."));
    }
  }

  return result(issues);
}

export function validateStaticSchemaIntegrity({ modeSpecs, providers }) {
  const issues = [];

  for (const mode of enums.productionMode) {
    const spec = modeSpecs[mode];
    if (!spec) {
      issues.push(issue(`modeSpecs.${mode}`, "Missing mode specification."));
      continue;
    }
    if (!formSchemas.ModeForms[mode]) {
      issues.push(issue(`formSchemas.ModeForms.${mode}`, "Missing mode form schema."));
    }
    if (!modeAssetRequirements[mode]) {
      issues.push(issue(`modeAssetRequirements.${mode}`, "Missing asset requirement definition."));
    }
    if (!Array.isArray(spec.schemes) || spec.schemes.length === 0) {
      issues.push(issue(`modeSpecs.${mode}.schemes`, "Expected at least one scheme."));
    }
  }

  const providerIds = providers.map((provider) => provider.id);
  for (const providerId of enums.providerId) {
    if (!providerIds.includes(providerId)) {
      issues.push(issue(`providers.${providerId}`, "Missing provider fixture."));
    }
  }

  const collab = modeSpecs.collab;
  if (collab) {
    const guardrailText = [...collab.guardrails, ...collab.promptBlocks.map((block) => block.text)].join(" ");
    if (!guardrailText.includes("[Game Character]") || !guardrailText.includes("[Collab Partner]")) {
      issues.push(issue("modeSpecs.collab.guardrails", "Collab mode must expose character placeholders."));
    }
    if (!/Do NOT merge|merge/i.test(guardrailText)) {
      issues.push(issue("modeSpecs.collab.guardrails", "Collab mode must expose anti-merge guardrail."));
    }
  }

  const logo = modeSpecs.logo;
  if (logo && !/solid|pure/i.test([...logo.guardrails, ...logo.promptBlocks.map((block) => block.text)].join(" "))) {
    issues.push(issue("modeSpecs.logo.guardrails", "Logo mode must expose solid background guardrail."));
  }

  const icon = modeSpecs.icon;
  if (icon) {
    if (!icon.outputSizes.every((size) => size === "1:1")) {
      issues.push(issue("modeSpecs.icon.outputSizes", "Icon mode must only expose 1:1 output size."));
    }
    const iconText = [...icon.guardrails, ...icon.promptBlocks.map((block) => block.text)].join(" ");
    if (!/No text/i.test(iconText)) {
      issues.push(issue("modeSpecs.icon.guardrails", "Icon mode must expose no-text guardrail."));
    }
  }

  return result(issues);
}
