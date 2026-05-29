import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const issues = [];
const root = process.cwd();

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required workbench form binding file`);
    return "";
  }
}

const runtime = read("src/generation-form-runtime.js");
const configPanel = read("src/render/config-panel.js");
const assetsSection = read("src/react/AssetsSection.tsx");
const briefSection = read("src/react/BriefSection.tsx");
const directionSection = read("src/react/DirectionSection.tsx");
const outputSection = read("src/react/OutputSettingsSection.tsx");
const sectionMount = read("src/react/mount-workbench-sections.tsx");
const bridge = read("src/react/StaticWorkbenchBridge.tsx");
const events = read("src/events.js");
const binding = read("src/form-binding.js");
const pkg = read("package.json");

for (const token of [
  "getActiveGenerationFormValues",
  "updateGenerationFormField",
  "setGenerationFormChoice",
  "applyGenerationFormValuesToSnapshot",
  "setRuntimeWorkspaceSnapshot",
  "replaceGenerationFormField",
]) {
  if (!runtime.includes(token)) issues.push(`generation-form-runtime.js: missing ${token}`);
}

for (const token of [
  "data-form-field",
  "data-form-choice",
  "data-react-assets-section",
  "data-assets-section-fallback",
  "data-react-brief-section",
  "data-brief-section-fallback",
  "data-react-direction-section",
  "data-direction-section-fallback",
  "data-react-output-settings",
  "data-output-settings-fallback",
  "projectBrief.gameDescription",
]) {
  if (!configPanel.includes(token)) issues.push(`config-panel.js: missing bound control token ${token}`);
}

for (const token of [
  "uploadWorkbenchAssetFile",
  "data-asset-file-input",
  "data-react-assets-ready",
  "asset-slot",
  "upload-drop",
  "asset-route-status",
  "onRequestRender",
]) {
  if (!assetsSection.includes(token)) issues.push(`AssetsSection.tsx: missing React assets token ${token}`);
}

for (const token of [
  "useForm",
  "zodResolver",
  "ProjectBriefFormSchema",
  "replaceGenerationFormField",
  "projectName",
  "gameDescription",
  "focusGuidanceEnabled",
  "focusGuidance",
]) {
  if (!briefSection.includes(token)) issues.push(`BriefSection.tsx: missing React brief token ${token}`);
}

for (const token of [
  "useForm",
  "zodResolver",
  "ModeFormSchema",
  "replaceGenerationFormField",
  "styleTags",
  "collabStyleInjection",
  "copyPreset",
  "layoutMode",
  "compositionReferenceRotation",
]) {
  if (!directionSection.includes(token)) issues.push(`DirectionSection.tsx: missing React direction token ${token}`);
}

for (const token of [
  "useForm",
  "zodResolver",
  "OutputSettingsFormSchema",
  "replaceGenerationFormField",
  "platformPresets",
  "aspectRatios",
  "imagesPerScheme",
  "schemeCount",
]) {
  if (!outputSection.includes(token)) issues.push(`OutputSettingsSection.tsx: missing React output settings token ${token}`);
}

for (const token of [
  "createRoot",
  "data-react-assets-section",
  "AssetsSection",
  "has-react-assets",
  "data-react-brief-section",
  "BriefSection",
  "has-react-brief",
  "data-react-direction-section",
  "DirectionSection",
  "has-react-direction",
  "data-react-output-settings",
  "OutputSettingsSection",
  "has-react-output",
]) {
  if (!sectionMount.includes(token)) issues.push(`mount-workbench-sections.tsx: missing mount token ${token}`);
}

if (!bridge.includes("mountWorkbenchSections")) {
  issues.push("StaticWorkbenchBridge.tsx: must mount React workbench sections after static shell render");
}

for (const token of [
  "bindGenerationFormControls",
  "updateGenerationFormField",
  "setGenerationFormChoice",
]) {
  if (!events.includes(token)) issues.push(`events.js: missing form event token ${token}`);
}

for (const token of [
  "getActiveGenerationFormValues",
  "applyGenerationFormValuesToSnapshot",
  "validateBoundFrontendForms",
]) {
  if (!binding.includes(token)) issues.push(`form-binding.js: missing form snapshot token ${token}`);
}

if (!pkg.includes("workbench-form:check")) {
  issues.push("package.json: missing workbench-form:check script");
}

for (const [fileName, source] of [
  ["generation-form-runtime.js", runtime],
  ["config-panel.js", configPanel],
  ["AssetsSection.tsx", assetsSection],
  ["BriefSection.tsx", briefSection],
  ["DirectionSection.tsx", directionSection],
  ["OutputSettingsSection.tsx", outputSection],
  ["mount-workbench-sections.tsx", sectionMount],
  ["events.js", events],
  ["form-binding.js", binding],
]) {
  for (const forbidden of ["fetch(", "XMLHttpRequest", "axios", "localStorage", "sessionStorage", "generateImage(", "healthCheck("]) {
    if (source.includes(forbidden)) {
      issues.push(`${fileName}: form binding must not perform network, browser storage, or provider side effects (${forbidden})`);
    }
  }
}

async function runRuntimeCheck() {
  const { workspaceSnapshot } = await import(pathToFileURL(path.join(root, "src/data/workspace-snapshot.js")).href);
  const { state, ensureSelectedScheme, setRuntimeWorkspaceSnapshot } = await import(pathToFileURL(path.join(root, "src/state.js")).href);
  const { getActiveGenerationFormValues, replaceGenerationFormField, updateGenerationFormField, setGenerationFormChoice } = await import(pathToFileURL(path.join(root, "src/generation-form-runtime.js")).href);
  const {
    createBoundWorkspaceSnapshot,
    validateBoundFrontendForms,
    buildPromptPackageCreateSubmission,
    buildQueuePlanCreateSubmission,
  } = await import(pathToFileURL(path.join(root, "src/form-binding.js")).href);

  const snapshot = JSON.parse(JSON.stringify(workspaceSnapshot));
  state.activeMode = "poster";
  state.provider = "openai";
  setRuntimeWorkspaceSnapshot(snapshot, "static");
  ensureSelectedScheme();

  updateGenerationFormField("projectBrief.gameDescription", "Custom form-bound game description.");
  updateGenerationFormField("projectBrief.focusGuidance", "Keep the creative range focused on boss encounter posters.");
  replaceGenerationFormField("projectBrief", {
    projectName: "Form Bound Pizza Lab",
    gameDescription: "Custom form-bound game description.",
    focusGuidanceEnabled: true,
    focusGuidance: "Keep the creative range focused on boss encounter posters.",
  });
  setGenerationFormChoice("outputSettings.imagesPerScheme", "3");
  updateGenerationFormField("outputSettings.schemeCount", "7");
  setGenerationFormChoice("modeForm.styleTags", "电影级3D", { multi: true });
  replaceGenerationFormField("modeForm", {
    mode: "poster",
    styleTags: ["cinematic-3d"],
    compositionReferenceStrength: "composition",
  });

  const values = getActiveGenerationFormValues();
  if (values.projectBrief.gameDescription !== "Custom form-bound game description.") {
    issues.push("runtime generation form should expose edited project brief");
  }
  if (values.projectBrief.projectName !== "Form Bound Pizza Lab") {
    issues.push("runtime generation form should expose edited project name");
  }
  if (values.outputSettings.imagesPerScheme !== 3 || values.outputSettings.schemeCount !== 7) {
    issues.push("runtime generation form should expose edited output numbers");
  }
  if (values.modeForm.mode !== "poster" || !values.modeForm.styleTags.includes("cinematic-3d")) {
    issues.push("runtime generation form should expose replaced direction form values");
  }

  const bound = createBoundWorkspaceSnapshot();
  const modeState = bound.modeStates.find((item) => item.mode === "poster");
  if (bound.project.description !== "Custom form-bound game description.") {
    issues.push("bound workspace snapshot should carry edited project description");
  }
  if (bound.project.name !== "Form Bound Pizza Lab") {
    issues.push("bound workspace snapshot should carry edited project name");
  }
  if (modeState?.outputSettings.imagesPerScheme !== 3 || modeState?.outputSettings.schemeCount !== 7) {
    issues.push("bound workspace snapshot should carry edited output settings");
  }
  if (modeState?.modeForm?.styleTags?.[0] !== "cinematic-3d") {
    issues.push("bound workspace snapshot should carry edited direction settings");
  }

  const validation = validateBoundFrontendForms(bound);
  if (!validation.ok) issues.push("edited workbench form values should pass validation");

  const queueSubmission = buildQueuePlanCreateSubmission(bound);
  if (queueSubmission.payload.imagesPerScheme !== 3) {
    issues.push("queue plan payload should read imagesPerScheme from bound form state");
  }
  const schemeOnlyPrompt = buildPromptPackageCreateSubmission(bound, { renderImages: false });
  const schemeOnlyQueue = buildQueuePlanCreateSubmission(bound, { renderImages: false });
  if (schemeOnlyPrompt.payload.target !== "brief") {
    issues.push("scheme-only generation should create a brief prompt package");
  }
  if (schemeOnlyQueue.payload.includeImageGeneration !== false) {
    issues.push("scheme-only generation should not queue image generation");
  }
  const renderQueue = buildQueuePlanCreateSubmission(bound, { schemeStrategy: "continue" });
  if (renderQueue.payload.includeImageGeneration !== true) {
    issues.push("render generation should queue image generation by default");
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Workbench form binding checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Workbench form binding checks passed.");
