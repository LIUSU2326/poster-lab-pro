import { readFileSync } from "node:fs";

const issues = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required live gate UI file`);
    return "";
  }
}

const stateSource = read("src/state.js");
const eventsSource = read("src/events.js");
const viewModelSource = read("src/data/live-gate-view-model.js");
const configSource = read("src/render/config-panel.js");
const topbarSource = read("src/render/topbar.js");
const inspectorSource = read("src/render/inspector.js");
const taskChromeSource = read("src/render/task-chrome.js");
const centerBoardSource = read("src/render/center-board.js");
const settingsSheetSource = read("src/render/settings-sheet.js");
const stylesSource = read("styles.css");
const design = read("DESIGN.md");
const product = read("PRODUCT.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const decisions = read("DECISIONS.md");
const pkg = read("package.json");

for (const token of [
  "liveGate",
  "maxAcceptedCost",
  "confirmations",
  "runtimeCredentialReady",
  "transportReady",
  "resultStorageReady",
]) {
  if (!stateSource.includes(token)) issues.push(`state.js: missing live gate state token ${token}`);
}

for (const token of [
  "data-live-toggle",
  "data-live-cost-cap",
  "setLiveGateValue",
  "generationActionRequiresLiveGate",
  "live_gate_blocked",
]) {
  if (!eventsSource.includes(token)) issues.push(`events.js: missing live gate interaction token ${token}`);
}

for (const token of [
  "getLiveGateViewModel",
  "not_enabled",
  "missing_live_confirmation",
  "cost_limit_exceeded",
  "missing_runtime_credential",
  "costSummaryLabel",
  "plannedOutputLabel",
  "costBasisLabel",
  "estimatePreparedGeneration",
  "plannedOutputFromQueue",
  "getGenerationQualityWarnings",
  "agnes_multireference_quality_review",
  "qualityRisk",
]) {
  if (!viewModelSource.includes(token)) issues.push(`live-gate-view-model.js: missing ${token}`);
}

for (const [name, source, tokens] of [
  ["config-panel.js", configSource, ["模型、Key 与实机状态在顶部统一查看"]],
  ["topbar.js", topbarSource, ["live-gate-chip", "实机安全", "open-settings", "costSummaryLabel", "qualityRisk"]],
  ["inspector.js", inspectorSource, ["live-gate-inspector", "实机安全闸"]],
  ["task-chrome.js", taskChromeSource, ["live-gate-slim", "live-gate-context", "安全开关", "qualityRiskDetail"]],
  ["center-board.js", centerBoardSource, ["getLiveGateViewModel", "liveBlocked", "先通过实机安全闸"]],
  ["task-chrome.js", taskChromeSource, ["getManualLiveTestViewModel", "manual.disabled", "run-manual-live-test"]],
  ["settings-sheet.js", settingsSheetSource, ["live-gate-panel", "provider-setup-steps", "data-live-toggle", "data-live-cost-cap", "实机安全闸", "预计数量", "live-gate-quality-warnings"]],
  ["styles.css", stylesSource, ["live-gate-chip", "live-gate-context", "live-gate-slim", "live-gate-metric small", "live-gate-quality-warnings", "run-mode-chip.warning"]],
]) {
  for (const token of tokens) {
    if (!source.includes(token)) issues.push(`${name}: missing ${token}`);
  }
}

if (configSource.includes("live-gate-panel")) {
  issues.push("config-panel.js: live gate panel should not be placed in the left production config");
}

for (const [name, source] of [
  ["DESIGN.md", design],
  ["PRODUCT.md", product],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
]) {
  if (!source.includes("Live Gate") && !source.includes("live gate") && !source.includes("Live Safety Gate")) {
    issues.push(`${name}: missing workbench live gate update`);
  }
}

if (!decisions.includes("D074")) issues.push("DECISIONS.md: missing D074 live gate UI decision");
if (!pkg.includes("workbench-live-gate-ui:check")) issues.push("package.json: missing workbench-live-gate-ui:check script");

for (const forbidden of ["fetch(", "XMLHttpRequest", "axios", "runOpenAILiveQueue", "api.openai.com"]) {
  if ([eventsSource, viewModelSource, configSource, topbarSource, inspectorSource, taskChromeSource].join("\n").includes(forbidden)) {
    issues.push(`live gate UI must not call network or live providers (${forbidden})`);
  }
}

try {
  const [{ getLiveGateViewModel }, { modeSpecs }, { state }] = await Promise.all([
    import("../src/data/live-gate-view-model.js"),
    import("../src/data/modes.js"),
    import("../src/state.js"),
  ]);

  const defaultGate = getLiveGateViewModel(modeSpecs.poster);
  if (defaultGate.status !== "skipped" || defaultGate.allowed) {
    issues.push("default live gate should be skipped and not allowed");
  }
  if (!defaultGate.plannedOutputLabel || defaultGate.estimatedCost <= 0.05 || defaultGate.costBasisLabel !== "来自当前配置") {
    issues.push("default live gate should estimate prepared generation cost from current output settings");
  }

  state.liveGate.enabled = true;
  state.liveGate.maxAcceptedCost = 99;
  state.liveGate.confirmations.liveRun = true;
  state.liveGate.confirmations.providerCost = true;
  state.liveGate.confirmations.externalProvider = true;
  state.liveGate.confirmations.resultStorage = true;
  state.liveGate.runtimeCredentialReady = true;
  state.liveGate.transportReady = true;
  state.liveGate.resultStorageReady = true;

  const allowedGate = getLiveGateViewModel(modeSpecs.poster);
  if (allowedGate.status !== "allowed" || !allowedGate.allowed || allowedGate.blockerCount !== 0) {
    issues.push("confirmed live gate should become allowed with no blockers");
  }
  if (!allowedGate.costSummaryLabel.includes("上限")) {
    issues.push("live gate should expose a cost summary label with accepted cap");
  }

  state.providerSlotRoutes = {
    ...state.providerSlotRoutes,
    concept: { providerId: "agnes", model: "agnes-2.0-flash" },
    image: { providerId: "agnes", model: "agnes-image-2.1-flash" },
  };
  const agnesPosterGate = getLiveGateViewModel(modeSpecs.poster);
  if (!agnesPosterGate.allowed || !agnesPosterGate.qualityRisk || !agnesPosterGate.qualityWarnings?.[0]?.message.includes("正式交付前需要人工复核")) {
    issues.push("Agnes poster live gate should remain allowed but expose a visible quality-risk warning");
  }
  const agnesAnnouncementGate = getLiveGateViewModel(modeSpecs.announcement);
  if (agnesAnnouncementGate.qualityRisk) {
    issues.push("Agnes announcement live gate should not inherit Poster/Collab quality-risk warning");
  }

  state.workspaceSnapshot.queuePlans = [{
    job: {
      id: "job-live-gate-output-check",
      projectId: state.workspaceSnapshot.project.id,
      mode: "poster",
      providerId: "google",
      status: "queued",
      title: "poster output check",
      createdAt: "2026-05-23T00:00:00.000Z",
      updatedAt: "2026-05-23T00:00:00.000Z",
    },
    tasks: [{
      id: "task-live-gate-image-check",
      jobId: "job-live-gate-output-check",
      kind: "imageGeneration",
      status: "queued",
      stage: "planning",
      mode: "poster",
      input: { schemeId: "scheme-live-gate-output-check", count: 2 },
      output: { providerResultIds: [], metadata: {} },
      cost: { estimatedCost: 0.1, actualCost: null, currency: "USD" },
      elapsedMs: 0,
    }],
    events: [],
  }];
  state.workspaceSnapshot.queueSummaries = [{
    jobId: "job-live-gate-output-check",
    total: 1,
    queued: 1,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    progress: 0,
    estimatedCost: 0.1,
    actualCost: null,
    elapsedMs: 0,
  }];
  const queueGate = getLiveGateViewModel(modeSpecs.poster);
  if (queueGate.costBasisLabel !== "来自当前队列" || queueGate.plannedImageCount !== 2) {
    issues.push("live gate should prefer queue-derived cost and planned output when a queue exists");
  }

  state.liveGate.maxAcceptedCost = 0.01;
  const costBlocked = getLiveGateViewModel(modeSpecs.poster);
  if (costBlocked.status !== "blocked" || !costBlocked.blockers.some((blocker) => blocker.code === "cost_limit_exceeded")) {
    issues.push("live gate should block when estimated cost exceeds accepted cap");
  }
} catch (error) {
  issues.push(`live gate view model import/runtime check failed: ${error instanceof Error ? error.message : String(error)}`);
}

if (issues.length > 0) {
  console.error("Workbench live gate UI checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Workbench live gate UI checks passed.");
