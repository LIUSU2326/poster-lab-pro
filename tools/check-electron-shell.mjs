import { readFileSync } from "node:fs";

const issues = [];

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required Electron shell file`);
    return "";
  }
}

const pkg = read("package.json");
const main = read("electron/main.cjs");
const preload = read("electron/preload.cjs");
const roadmap = read("ROADMAP.md");
const decisions = read("DECISIONS.md");
const testing = read("TESTING.md");

for (const token of [
  "BrowserWindow",
  "resolveNextTarget",
  "spawnNextDev",
  "waitForNext",
  "configureLocalSessionProxy",
  "proxyBypassRules",
  "did-fail-load",
  "POSTER_LAB_DESKTOP_URL",
  "POSTER_LAB_NEXT_PORT",
  "POSTER_LAB_DESKTOP_USER_DATA",
  "nodeIntegration: false",
  "contextIsolation: true",
  "setWindowOpenHandler",
]) {
  if (!main.includes(token)) issues.push(`electron/main.cjs: missing ${token}`);
}

for (const token of ["contextBridge", "posterLabDesktop", "onNextExit"]) {
  if (!preload.includes(token)) issues.push(`electron/preload.cjs: missing ${token}`);
}

for (const token of [
  '"main": "electron/main.cjs"',
  '"desktop:dev"',
  '"electron-shell:check"',
  '"electron"',
]) {
  if (!pkg.includes(token)) issues.push(`package.json: missing ${token}`);
}

for (const [file, source] of [
  ["ROADMAP.md", roadmap],
  ["DECISIONS.md", decisions],
  ["TESTING.md", testing],
]) {
  if (!source.includes("Electron Desktop Shell")) {
    issues.push(`${file}: missing Electron Desktop Shell update`);
  }
}

for (const forbidden of ["api.openai.com", "OPENAI_API_KEY", "localStorage", "sessionStorage"]) {
  if ([main, preload].join("\n").includes(forbidden)) {
    issues.push(`Electron shell must not contain provider calls or browser credential storage (${forbidden})`);
  }
}

if (issues.length > 0) {
  console.error("Electron shell checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Electron shell checks passed.");
