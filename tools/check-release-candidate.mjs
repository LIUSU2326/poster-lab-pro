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

const currentVersion = "1.1.0-alpha.3";

for (const token of [
  `"version": "${currentVersion}"`,
  "\"check\"",
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

if (!testing.includes("1.1.0-alpha.3 Logo Text Strategy Release Update")) {
  issues.push("TESTING.md: missing 1.1.0-alpha.3 logo text strategy release section");
}

if (issues.length > 0) {
  console.error("Release candidate checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Release candidate checks passed.");
