import { readFileSync } from "node:fs";

const issues = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required RC file`);
    return "";
  }
}

const pkg = read("package.json");
const appMetadata = read("src/app-metadata.js");
const topbar = read("src/render/topbar.js");
const settingsSheet = read("src/render/settings-sheet.js");
const formBinding = read("src/form-binding.js");
const readme = read("README.md");
const desktopTesting = read("DESKTOP_TESTING.md");
const testing = read("TESTING.md");
const roadmap = read("ROADMAP.md");
const decisions = read("DECISIONS.md");
const releaseChecklist = read("RELEASE_CHECKLIST.md");
const userTesting = read("USER_TESTING.md");
const multimodeAcceptance = read("MULTIMODE_ACCEPTANCE.md");
const realAcceptance = read("REAL_GENERATION_ACCEPTANCE.md");

const currentVersion = "1.1.0-rc.7";

for (const token of [
  `"version": "${currentVersion}"`,
  "\"check\"",
  "\"multimode-regression:check\"",
  "\"multimode-acceptance:check\"",
  "\"real-acceptance:check\"",
  "\"ux-regression:check\"",
  "\"user-test-readiness:check\"",
  "\"desktop:pack:mac\"",
  "\"release-candidate:check\"",
]) {
  if (!pkg.includes(token)) issues.push(`package.json: missing ${token}`);
}

for (const token of ["APP_VERSION", currentVersion, "APP_BUNDLE_HINT", "APP_MAIN_BRANCH"]) {
  if (!appMetadata.includes(token)) issues.push(`app-metadata.js: missing ${token}`);
}

for (const token of ["APP_VERSION", "bundle-path", "APP_MAIN_BRANCH", "posterLabDesktop?.appPath"]) {
  if (!topbar.includes(token)) issues.push(`topbar.js: missing visible identity token ${token}`);
}

for (const token of [
  "provider-setup-steps",
  "实机安全闸",
  "estimatedCostLabel",
  "maxAcceptedCost",
  "data-live-cost-cap",
  "live-gate-checks",
]) {
  if (!settingsSheet.includes(token) && !formBinding.includes(token)) {
    issues.push(`live gate UI: missing ${token}`);
  }
}

for (const [file, source] of [
  ["README.md", readme],
  ["DESKTOP_TESTING.md", desktopTesting],
  ["TESTING.md", testing],
  ["ROADMAP.md", roadmap],
  ["RELEASE_CHECKLIST.md", releaseChecklist],
  ["USER_TESTING.md", userTesting],
  ["MULTIMODE_ACCEPTANCE.md", multimodeAcceptance],
  ["REAL_GENERATION_ACCEPTANCE.md", realAcceptance],
]) {
  for (const token of [currentVersion, "Desktop Test Path", "release/mac/Poster Lab Pro.app"]) {
    if (!source.includes(token)) issues.push(`${file}: missing ${token}`);
  }
}

for (const token of [
  "Manual Live Generation Gate",
  "Accepted cost cap",
  "Default automated checks must not spend provider credits",
  "AI integrated redraw",
  "Local overlay is a fallback",
  "Known Non-Blocking Watch Items",
]) {
  if (!releaseChecklist.includes(token)) issues.push(`RELEASE_CHECKLIST.md: missing ${token}`);
}

if (!decisions.includes("D092")) {
  issues.push("DECISIONS.md: missing D092 real generation QA decision");
}

if (!testing.includes("1.1.0-rc.2 User Test Readiness Release Update")) {
  issues.push("TESTING.md: missing 1.1.0-rc.2 user test readiness release section");
}

for (const token of [
  "1.1.0-rc.3 Multimode Acceptance Matrix Release Update",
  "npm run multimode-acceptance:check",
  "1.1.0-rc.5 Controlled Real Acceptance Release Update",
  "npm run real-acceptance:check",
]) {
  if (!testing.includes(token)) issues.push(`TESTING.md: missing ${token}`);
}

for (const token of [
  "Fresh real generation is manual and opt-in only",
  "Never use a direct API/script path to bypass the App live safety gate",
  "Agnes all-core multimode pass",
  "quality-risk",
]) {
  if (!realAcceptance.includes(token)) issues.push(`REAL_GENERATION_ACCEPTANCE.md: missing ${token}`);
}

if (issues.length > 0) {
  console.error("Release candidate checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Release candidate checks passed.");
