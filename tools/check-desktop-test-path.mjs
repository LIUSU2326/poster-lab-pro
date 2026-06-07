import { readFileSync } from "node:fs";

const issues = [];

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required desktop test path file`);
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

const runbook = read("DESKTOP_TESTING.md");
const decisions = read("DECISIONS.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const pkg = read("package.json");
const topbar = read("src/render/topbar.js");
const taskChrome = read("src/render/task-chrome.js");

requireTokens("DESKTOP_TESTING.md", runbook, [
  "npm run check",
  "npm run poster-chain:check",
  "npm run build:next",
  "npm run dev:next",
  "http://localhost:3000",
  "1440",
  "1024",
  "768",
  "375px",
  "No User-Facing Live Generation Switch",
]);

requireTokens("package.json", pkg, [
  '"check"',
  '"poster-chain:check"',
  '"build:next"',
  '"dev:next"',
  '"desktop-test-path:check"',
  '"version": "1.1.0"',
]);

for (const [file, source] of [
  ["DECISIONS.md", decisions],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
]) {
  requireTokens(file, source, ["Desktop Test Path", "No User-Facing Live Generation Switch"]);
}

forbidTokens("topbar.js", topbar, [
  "APP_VERSION",
  "APP_BUNDLE_HINT",
  "APP_MAIN_BRANCH",
  "topbar-meta",
  "bundle-path",
  "getDesktopBundlePath",
  "posterLabDesktop?.appPath",
]);

forbidTokens("task-chrome.js", taskChrome, ["task-slim-cue"]);

for (const forbidden of ["api.openai.com", "OPENAI_API_KEY=", "REPLICATE_API_TOKEN=", "curl "]) {
  if (runbook.includes(forbidden)) {
    issues.push(`DESKTOP_TESTING.md: safe local runbook must not prescribe live provider credentials or direct API calls (${forbidden})`);
  }
}

if (issues.length > 0) {
  console.error("Desktop test path checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Desktop test path checks passed.");
