import { readFileSync } from "node:fs";

const issues = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required prompt contract file`);
    return "";
  }
}

const contracts = read("src/prompts/contracts.ts");
const guardrails = read("src/prompts/guardrails.ts");
const builder = read("src/prompts/builder.ts");
const barrel = read("src/prompts/index.ts");

for (const token of [
  "PromptPackageSchema",
  "PromptSectionSchema",
  "PromptAssetBindingSchema",
  "PromptPlatformConstraintSchema",
  "PromptGuardrailRuleSchema",
  "PromptValidationSchema",
]) {
  if (!contracts.includes(token)) issues.push(`contracts.ts: missing ${token}`);
}

for (const token of ["poster", "collab", "announcement", "logo", "icon"]) {
  if (!guardrails.includes(`${token}: [`)) issues.push(`guardrails.ts: missing ${token} mode guardrails`);
}

for (const token of [
  "[Game Character]",
  "[Collab Partner]",
  "Do NOT merge",
  "pure solid-color background",
  "ABSOLUTELY NO TEXT",
  "full-bleed",
]) {
  if (!guardrails.includes(token) && !builder.includes(token)) {
    issues.push(`prompt guardrails missing critical rule token: ${token}`);
  }
}

for (const token of [
  "createPromptPackage",
  "createImagePromptPackage",
  "createBriefPromptPackage",
  "WorkspaceSnapshotSchema",
  "validatePromptPackage",
  "getPromptGuardrails",
  "getRequiredAssetSlots",
  "Mode Asset References",
  "Reference Analysis",
  "referenceAnalyses",
  "providerReady",
  "isProviderSafeAssetUrl",
]) {
  if (!builder.includes(token)) issues.push(`builder.ts: missing ${token}`);
}

for (const token of ["contracts", "guardrails", "builder"]) {
  if (!barrel.includes(token)) issues.push(`index.ts: missing export for ${token}`);
}

for (const forbidden of ["fetch(", "XMLHttpRequest", "axios", "localStorage", "sessionStorage", "generateImage(", "healthCheck("]) {
  if ([contracts, guardrails, builder].join("\n").includes(forbidden)) {
    issues.push(`prompt layer must not perform provider, network, DOM, or persistence side effects (${forbidden})`);
  }
}

if (!builder.includes("modeState.projectBrief.focusGuidance")) {
  issues.push("builder.ts: prompt package must include focus guidance");
}

if (!builder.includes("snapshot.brandKit")) {
  issues.push("builder.ts: prompt package must include brand kit context");
}

if (!builder.includes("snapshot.characters")) {
  issues.push("builder.ts: prompt package must include character context");
}

if (issues.length > 0) {
  console.error("Prompt contract checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Prompt contract checks passed.");
