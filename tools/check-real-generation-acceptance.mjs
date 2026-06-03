import { readFileSync } from "node:fs";

const issues = [];
const currentVersion = "1.1.0-rc.4";

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required real acceptance file`);
    return "";
  }
}

function requireIncludes(source, filePath, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) issues.push(`${filePath}: missing ${token}`);
  }
}

function requireExcludes(source, filePath, tokens) {
  for (const token of tokens) {
    if (source.includes(token)) issues.push(`${filePath}: must not include ${token}`);
  }
}

const pkg = read("package.json");
const realAcceptance = read("REAL_GENERATION_ACCEPTANCE.md");
const multimodeAcceptance = read("MULTIMODE_ACCEPTANCE.md");
const userTesting = read("USER_TESTING.md");
const releaseChecklist = read("RELEASE_CHECKLIST.md");
const testing = read("TESTING.md");
const roadmap = read("ROADMAP.md");
const decisions = read("DECISIONS.md");
const appMetadata = read("src/app-metadata.js");
const manualLiveClient = read("src/manual-live-test-client.js");
const manualLiveService = read("src/api/manual-live-generation.ts");
const liveGate = read("src/data/live-gate-view-model.js");

requireIncludes(pkg, "package.json", [
  `"version": "${currentVersion}"`,
  "\"real-acceptance:check\"",
  "npm run real-acceptance:check",
]);

requireIncludes(realAcceptance, "REAL_GENERATION_ACCEPTANCE.md", [
  currentVersion,
  "/Users/liusu/Desktop/Poster Lab Pro.app",
  "http://127.0.0.1:3000",
  "MULTIMODE_ACCEPTANCE.md",
  "Default automated checks must not spend provider credits",
  "Fresh real generation is manual and opt-in only",
  "The App live safety gate must be enabled",
  "Required confirmations: live run, provider cost, external provider, and local result storage",
  "Accepted cost cap must be greater than or equal to the estimated run cost",
  "max 1 fresh real generation per mode",
  "Never use a direct API/script path to bypass the App live safety gate",
  "Workspace Readiness Snapshot",
  "Baseline Result Evidence",
  "Fresh rc.4 Acceptance Status",
  "Poster:",
  "Icon:",
  "Logo:",
  "Announcement:",
  "Collab:",
  "pending live safety gate",
  "public/mock-assets/collab-partner-sundae-ranger.svg",
  "Completion Rule For 1.1.0 Stable",
  "npm run real-acceptance:check",
]);

for (const mode of ["Poster", "Icon", "Logo", "Announcement", "Collab"]) {
  if (!realAcceptance.includes(`${mode} baseline:`)) {
    issues.push(`REAL_GENERATION_ACCEPTANCE.md: missing ${mode} baseline result`);
  }
}

requireIncludes(multimodeAcceptance, "MULTIMODE_ACCEPTANCE.md", [
  "max 1 real generation per mode",
  "Synthetic Collab Partner Asset",
  "blank partner brand plate",
]);

requireIncludes(userTesting, "USER_TESTING.md", [
  currentVersion,
  "REAL_GENERATION_ACCEPTANCE.md",
  "MULTIMODE_ACCEPTANCE.md",
  "max 1 fresh real generation per mode",
]);

requireIncludes(releaseChecklist, "RELEASE_CHECKLIST.md", [
  currentVersion,
  "npm run real-acceptance:check",
  "REAL_GENERATION_ACCEPTANCE.md",
  "Fresh real generation is manual and opt-in only",
]);

requireIncludes(testing, "TESTING.md", [
  "1.1.0-rc.4 Controlled Real Acceptance Release Update",
  "npm run real-acceptance:check",
  "REAL_GENERATION_ACCEPTANCE.md",
]);

requireIncludes(roadmap, "ROADMAP.md", [
  "1.1.0-rc.4 Controlled Real Acceptance Release Update",
  "REAL_GENERATION_ACCEPTANCE.md",
  "pending live safety gate",
]);

requireIncludes(decisions, "DECISIONS.md", [
  "D107",
  "1.1.0-rc.4",
  "REAL_GENERATION_ACCEPTANCE.md",
  "Never use a direct API/script path to bypass the App live safety gate",
]);

requireIncludes(appMetadata, "src/app-metadata.js", ["APP_VERSION", currentVersion, "APP_BUNDLE_HINT"]);

requireIncludes(manualLiveClient, "src/manual-live-test-client.js", [
  "getHardBlockers",
  "createManualLiveTestPayload",
  "state.liveGate.confirmations.liveRun",
  "state.liveGate.confirmations.providerCost",
  "state.liveGate.confirmations.externalProvider",
  "state.liveGate.confirmations.resultStorage",
]);

requireIncludes(manualLiveService, "src/api/manual-live-generation.ts", [
  "evaluateLiveExecutionGate",
  "credentialReady",
  "transportReady",
  "resultStorageReady",
  "runGoogleLiveQueue",
  "runOpenAILiveQueue",
]);

requireIncludes(liveGate, "src/data/live-gate-view-model.js", [
  "missing_live_confirmation",
  "missing_cost_confirmation",
  "missing_external_provider_confirmation",
  "missing_result_storage_confirmation",
  "cost_limit_exceeded",
]);

requireExcludes(realAcceptance, "REAL_GENERATION_ACCEPTANCE.md", [
  "OPENAI_API_KEY=",
  "GOOGLE_API_KEY=",
  "api.openai.com",
  "generativelanguage.googleapis.com",
  "curl ",
]);

if (issues.length > 0) {
  console.error("Real generation acceptance checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Real generation acceptance checks passed.");
