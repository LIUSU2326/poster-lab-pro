import { readFileSync } from "node:fs";

const issues = [];
const currentVersion = "1.1.0-rc.2";

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required user test readiness file`);
    return "";
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
const appMetadata = read("src/app-metadata.js");

for (const token of [
  `"version": "${currentVersion}"`,
  "\"user-test-readiness:check\"",
]) {
  if (!pkg.includes(token)) issues.push(`package.json: missing ${token}`);
}

for (const token of [
  currentVersion,
  "USER_TESTING.md",
  "Desktop Test Path",
  "release/mac/Poster Lab Pro.app",
]) {
  if (!readme.includes(token)) issues.push(`README.md: missing ${token}`);
}

for (const token of [
  currentVersion,
  "/Users/liusu/Desktop/Poster Lab Pro.app",
  "http://127.0.0.1:3000",
  "模型与 Key",
  "live safety gate",
  "accepted cost cap",
  "Default automated checks must not spend provider credits",
  "1-2 real generations per mode",
  "old Logo/BOSS/partner assets do not reappear",
  "Poster:",
  "Icon:",
  "Logo:",
  "Announcement:",
  "Collab:",
  "Result Quality Audit",
  "失败原因",
  "重试失败图片",
  "second confirmation click",
]) {
  if (!guide.includes(token)) issues.push(`USER_TESTING.md: missing ${token}`);
}

for (const token of [
  currentVersion,
  "User Test Readiness Gate",
  "USER_TESTING.md",
  "1-2 real generations per mode",
]) {
  if (!releaseChecklist.includes(token)) issues.push(`RELEASE_CHECKLIST.md: missing ${token}`);
}

for (const [fileName, source] of [
  ["DESKTOP_TESTING.md", desktopTesting],
  ["TESTING.md", testing],
  ["ROADMAP.md", roadmap],
  ["DECISIONS.md", decisions],
]) {
  if (!source.includes(currentVersion)) issues.push(`${fileName}: missing ${currentVersion}`);
}

for (const token of ["APP_VERSION", currentVersion, "APP_BUNDLE_HINT"]) {
  if (!appMetadata.includes(token)) issues.push(`app-metadata.js: missing ${token}`);
}

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
