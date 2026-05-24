import { readFileSync } from "node:fs";

const issues = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required Next migration shell file`);
    return "";
  }
}

const pkg = read("package.json");
const tsconfig = read("tsconfig.json");
const nextConfig = read("next.config.mjs");
const layout = read("app/layout.tsx");
const page = read("app/page.tsx");
const bridge = read("src/react/StaticWorkbenchBridge.tsx");

for (const token of ["next", "react", "react-dom", "dev:next", "build:next"]) {
  if (!pkg.includes(token)) issues.push(`package.json: missing ${token}`);
}

for (const token of ["app/**/*.tsx", "src/react/**/*.tsx", "jsx", "allowJs"]) {
  if (!tsconfig.includes(token)) issues.push(`tsconfig.json: missing ${token}`);
}

if (!nextConfig.includes("reactStrictMode")) {
  issues.push("next.config.mjs: missing reactStrictMode");
}

for (const token of ["Metadata", "../styles.css", "zh-CN"]) {
  if (!layout.includes(token)) issues.push(`app/layout.tsx: missing ${token}`);
}

if (!page.includes("StaticWorkbenchBridge")) {
  issues.push("app/page.tsx: must render StaticWorkbenchBridge");
}

for (const token of [
  "\"use client\"",
  "useEffect",
  "renderShell",
  "bindEvents",
  "hydrateLocalSubmissionDraft",
  "applyPrototypeStateFromUrl",
]) {
  if (!bridge.includes(token)) issues.push(`StaticWorkbenchBridge.tsx: missing ${token}`);
}

for (const forbidden of ["fetch(", "XMLHttpRequest", "axios", "generateImage(", "healthCheck(", "api.openai.com"]) {
  if ([layout, page, bridge].join("\n").includes(forbidden)) {
    issues.push(`Next migration shell must not add live network/provider calls (${forbidden})`);
  }
}

if (issues.length > 0) {
  console.error("Next migration shell checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Next migration shell checks passed.");
