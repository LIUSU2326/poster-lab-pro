import { readFileSync } from "node:fs";

const issues = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required asset fusion engine file`);
    return "";
  }
}

const semanticRoles = read("src/assets/semantic-roles.ts");
const promptBuilder = read("src/prompts/builder.ts");
const requestMapper = read("src/providers/request-mapper.ts");
const googleAdapter = read("src/providers/google-live-adapter.ts");
const pkg = read("package.json");

for (const token of [
  "export type AssetSemanticRole",
  "export function assetSemanticRole",
  "export function assetFusionStrategy",
  "export function assetSemanticInventory",
  "export function modeAssetFusionDirective",
  "Default pipeline: AI integrated redraw",
  "Fallback overlay is only acceptable after a failed integrated redraw",
  "Icon target: 1:1 square, ABSOLUTELY NO TEXT",
  "readable at 64px",
  "Logo target: readable wordmark/mark system",
  "Uploaded logos are brand references",
  "Announcement target: text-safe",
  "Collab target: separate identities and logos",
]) {
  if (!semanticRoles.includes(token)) issues.push(`semantic-roles.ts: missing fusion-engine token ${token}`);
}

for (const [file, source] of [
  ["src/prompts/builder.ts", promptBuilder],
  ["src/providers/request-mapper.ts", requestMapper],
  ["src/providers/google-live-adapter.ts", googleAdapter],
]) {
  for (const token of [
    "assetSemanticRole",
    "assetFusionStrategy",
    "assetSemanticInventory",
    "modeAssetFusionDirective",
  ]) {
    if (!source.includes(token)) issues.push(`${file}: missing generic asset fusion usage ${token}`);
  }
}

if (!googleAdapter.includes("[REFERENCE FUSION RULE]")) {
  issues.push("google-live-adapter.ts: missing non-poster inline reference fusion rule");
}
if (!promptBuilder.includes("modeAssetFusionDirective(mode, assets)")) {
  issues.push("builder.ts: mode asset inventory must include the generic fusion directive");
}
if (!requestMapper.includes("modeAssetFusionDirective(promptPackage.mode, promptPackage.assets)")) {
  issues.push("request-mapper.ts: poster integrated request must carry generic fusion directive");
}
if (!pkg.includes("\"asset-fusion:check\"")) {
  issues.push("package.json: missing asset-fusion:check script");
}
if (!pkg.includes("npm run asset-fusion:check")) {
  issues.push("package.json: main check script must include asset-fusion:check");
}

if (issues.length > 0) {
  console.error("Asset fusion engine checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Asset fusion engine checks passed.");
