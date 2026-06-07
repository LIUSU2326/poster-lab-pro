import { readFileSync } from "node:fs";

const issues = [];
const currentVersion = "1.1.0";

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required release file`);
    return "";
  }
}

function requireTokens(fileName, source, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) issues.push(`${fileName}: missing ${token}`);
  }
}

function forbidTokens(fileName, source, tokens) {
  for (const token of tokens) {
    if (source.includes(token)) issues.push(`${fileName}: removed release token should stay absent (${token})`);
  }
}

const pkg = read("package.json");
const readme = read("README.md");
const desktopTesting = read("DESKTOP_TESTING.md");
const testing = read("TESTING.md");
const roadmap = read("ROADMAP.md");
const decisions = read("DECISIONS.md");
const releaseChecklist = read("RELEASE_CHECKLIST.md");
const userTesting = read("USER_TESTING.md");
const topbar = read("src/render/topbar.js");
const settingsSheet = read("src/render/settings-sheet.js");
const centerBoard = read("src/render/center-board.js");
const configPanel = read("src/render/config-panel.js");
const taskChrome = read("src/render/task-chrome.js");

requireTokens("package.json", pkg, [
  `"version": "${currentVersion}"`,
  '"check"',
  '"multimode-regression:check"',
  '"multimode-acceptance:check"',
  '"ux-regression:check"',
  '"user-test-readiness:check"',
  '"desktop:pack:mac"',
  '"release-candidate:check"',
]);

forbidTokens("package.json", pkg, [
  '"real-acceptance:check"',
  '"workbench-live-gate-ui:check"',
  '"desktop-live-test-control:check"',
  '"manual-live-generation:check"',
]);

const releaseDocs = [
  ["README.md", readme],
  ["DESKTOP_TESTING.md", desktopTesting],
  ["TESTING.md", testing],
  ["ROADMAP.md", roadmap],
  ["DECISIONS.md", decisions],
  ["RELEASE_CHECKLIST.md", releaseChecklist],
  ["USER_TESTING.md", userTesting],
];

for (const [file, source] of releaseDocs) {
  requireTokens(file, source, [currentVersion, "No User-Facing Live Generation Switch"]);
}

for (const [file, source] of [
  ["topbar.js", topbar],
  ["settings-sheet.js", settingsSheet],
  ["center-board.js", centerBoard],
  ["config-panel.js", configPanel],
  ["task-chrome.js", taskChrome],
]) {
  forbidTokens(file, source, [
    "live-gate",
    "manual-live",
    "run-manual-live-test",
    "data-live-toggle",
    "data-live-cost-cap",
    "topbar-meta",
    "bundle-path",
    "APP_VERSION",
    "APP_BUNDLE_HINT",
    "APP_MAIN_BRANCH",
    "release/mac/Poster Lab Pro.app",
    "\u771f\u5b9e\u751f\u6210",
    "\u786e\u8ba4\u771f\u5b9e\u751f\u6210\u4fdd\u62a4",
    "\u624b\u52a8\u9a8c\u8bc1",
    "\u8fd8\u6ca1\u6709\u53ef\u5c55\u793a",
  ]);
}

if (!decisions.includes("D112")) {
  issues.push("DECISIONS.md: missing D112 cleanup decision");
}

if (issues.length > 0) {
  console.error("Release candidate checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Release candidate checks passed.");
