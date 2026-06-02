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

const runbook = read("DESKTOP_TESTING.md");
const decisions = read("DECISIONS.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const pkg = read("package.json");
const appMetadata = read("src/app-metadata.js");
const topbar = read("src/render/topbar.js");

for (const token of [
  "npm run check",
  "npm run poster-chain:check",
  "npm run build:next",
  "npm run dev:next",
  "http://localhost:3000",
  "1440",
  "1024",
  "768",
  "375px",
  "Live provider tests are opt-in only",
]) {
  if (!runbook.includes(token)) issues.push(`DESKTOP_TESTING.md: missing ${token}`);
}

for (const scriptName of ["check", "poster-chain:check", "build:next", "dev:next"]) {
  if (!pkg.includes(`"${scriptName}"`)) issues.push(`package.json: missing ${scriptName} script`);
}
if (!pkg.includes("\"version\": \"1.1.0-rc.3\"")) {
  issues.push("package.json: desktop-visible version should match the current 1.1 beta milestone");
}

for (const [file, source] of [
  ["DECISIONS.md", decisions],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
]) {
  if (!source.includes("Desktop Test Path")) {
    issues.push(`${file}: missing Desktop Test Path update`);
  }
}

for (const forbidden of ["api.openai.com", "OPENAI_API_KEY=", "REPLICATE_API_TOKEN=", "curl "]) {
  if (runbook.includes(forbidden)) {
    issues.push(`DESKTOP_TESTING.md: safe local runbook must not prescribe live provider credentials or direct API calls (${forbidden})`);
  }
}

if (!pkg.includes("desktop-test-path:check")) {
  issues.push("package.json: missing desktop-test-path:check script");
}

for (const token of ["APP_VERSION", "1.1.0-rc.3", "APP_BUNDLE_HINT", "release/mac/Poster Lab Pro.app", "APP_MAIN_BRANCH"]) {
  if (!appMetadata.includes(token)) issues.push(`app-metadata.js: missing desktop identity token ${token}`);
}
for (const token of ["APP_VERSION", "APP_BUNDLE_HINT", "topbar-meta", "bundle-path", "getDesktopBundlePath", "posterLabDesktop?.appPath"]) {
  if (!topbar.includes(token)) issues.push(`topbar.js: missing visible app version/path token ${token}`);
}

if (issues.length > 0) {
  console.error("Desktop test path checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Desktop test path checks passed.");
