import { readFileSync } from "node:fs";

const issues = [];
const currentVersion = "1.1.0";

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required user test readiness file`);
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
    if (source.includes(token)) issues.push(`${fileName}: should not include removed token ${token}`);
  }
}

const pkg = read("package.json");
const readme = read("README.md");
const guide = read("USER_TESTING.md");
const releaseChecklist = read("RELEASE_CHECKLIST.md");
const desktopTesting = read("DESKTOP_TESTING.md");
const testing = read("TESTING.md");
const roadmap = read("ROADMAP.md");
const decisions = read("DECISIONS.md");
const topbar = read("src/render/topbar.js");
const configPanel = read("src/render/config-panel.js");

requireTokens("package.json", pkg, [
  `"version": "${currentVersion}"`,
  '"user-test-readiness:check"',
]);

for (const [file, source] of [
  ["README.md", readme],
  ["USER_TESTING.md", guide],
  ["RELEASE_CHECKLIST.md", releaseChecklist],
  ["DESKTOP_TESTING.md", desktopTesting],
  ["TESTING.md", testing],
  ["ROADMAP.md", roadmap],
  ["DECISIONS.md", decisions],
]) {
  requireTokens(file, source, [currentVersion, "No User-Facing Live Generation Switch"]);
}

requireTokens("USER_TESTING.md", guide, [
  "http://127.0.0.1:3000",
  "Model and API Key",
  "Poster:",
  "Icon:",
  "Logo:",
  "Announcement:",
  "Collab:",
]);

forbidTokens("package.json", pkg, [
  '"real-acceptance:check"',
  '"workbench-live-gate-ui:check"',
  '"desktop-live-test-control:check"',
  '"manual-live-generation:check"',
]);

forbidTokens("topbar.js", topbar, ["topbar-meta", "bundle-path", "\u771f\u5b9e\u751f\u6210"]);
forbidTokens("config-panel.js", configPanel, ["MANUAL CHECK", "\u624b\u52a8\u9a8c\u8bc1"]);

for (const forbidden of [
  "OPENAI_API_KEY=",
  "REPLICATE_API_TOKEN=",
  "GOOGLE_API_KEY=",
  "curl ",
  "api.openai.com",
]) {
  if ([guide, releaseChecklist, desktopTesting].join("\n").includes(forbidden)) {
    issues.push(`user-facing test docs must not prescribe direct credential/env/API calls (${forbidden})`);
  }
}

if (issues.length > 0) {
  console.error("User test readiness checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("User test readiness checks passed.");
