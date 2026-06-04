import { readFileSync } from "node:fs";

const requiredProviderIds = ["openai", "aigocode", "google", "deepseek", "claude", "qwen", "agnes"];
const requiredContractFiles = [
  "src/providers/contracts.ts",
  "src/providers/manifests.ts",
  "src/provider-capabilities.js",
  "src/data/providers.js",
  "src/providers/mock-adapter.ts",
  "src/providers/live-adapter-stubs.ts",
  "src/providers/provider-capability-profiles.ts",
  "src/providers/index.ts",
];

const issues = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required provider contract file`);
    return "";
  }
}

const contracts = read("src/providers/contracts.ts");
const manifests = read("src/providers/manifests.ts");
const legacyCapabilities = read("src/provider-capabilities.js");
const dataProviders = read("src/data/providers.js");
const mockAdapter = read("src/providers/mock-adapter.ts");
const liveAdapterStubs = read("src/providers/live-adapter-stubs.ts");
const providerProfiles = read("src/providers/provider-capability-profiles.ts");
const barrel = read("src/providers/index.ts");

for (const file of requiredContractFiles) {
  if (![contracts, manifests, mockAdapter, barrel].some((content) => content.length > 0) && file) {
    issues.push(`${file}: could not be read`);
  }
}

for (const providerId of requiredProviderIds) {
  if (!manifests.includes(`id: "${providerId}"`)) {
    issues.push(`providerManifests.${providerId}: missing provider manifest`);
  }
}

for (const token of [
  "ProviderCapabilitySchema",
  "ProviderImageCapabilityProfileSchema",
  "ProviderImageReferenceInputSchema",
  "ProviderModelSlotSchema",
  "ProviderPromptProfileSchema",
  "ProviderManifestSchema",
  "BriefGenerationRequestSchema",
  "ImageGenerationRequestSchema",
  "ProviderErrorSchema",
  "GenerationProviderAdapter",
]) {
  if (!contracts.includes(token)) {
    issues.push(`contracts.ts: missing ${token}`);
  }
}

for (const capability of ["imageGeneration", "healthCheck"]) {
  if (!manifests.includes(capability)) {
    issues.push(`manifests.ts: expected at least one ${capability} capability`);
  }
}

for (const token of [
  "referenceInput",
  "extraBodyImage",
  "inlineParts",
  "promptProfile",
  "textRendering",
  "resultDelivery",
]) {
  if (!manifests.includes(token)) issues.push(`manifests.ts: missing provider image capability token ${token}`);
}

for (const providerId of ["openai", "aigocode", "google", "claude", "qwen"]) {
  const row = legacyCapabilities.match(new RegExp(`${providerId}: \\[[^\\]]+\\]`))?.[0] || "";
  if (!row.includes("styleReferenceAnalysis") || !row.includes("compositionReferenceAnalysis")) {
    issues.push(`provider-capabilities.js: ${providerId} must expose both reference analysis capabilities`);
  }
}

for (const providerId of ["deepseek", "agnes"]) {
  const row = legacyCapabilities.match(new RegExp(`${providerId}: \\[[^\\]]+\\]`))?.[0] || "";
  if (row.includes("styleReferenceAnalysis") || row.includes("compositionReferenceAnalysis")) {
    issues.push(`provider-capabilities.js: ${providerId} must not expose unsupported reference analysis capabilities`);
  }
}

for (const slotId of ["styleReference", "compositionReference"]) {
  const slotBlock = dataProviders.match(new RegExp(`id: "${slotId}"[\\s\\S]*?\\n  },`))?.[0] || "";
  if (!slotBlock.includes("gemini-2.5-flash") || !slotBlock.includes("gemini-2.5-pro")) {
    issues.push(`data/providers.js: ${slotId} options must include current Gemini reference-analysis models`);
  }
  for (const forbidden of ["agnes-2.0-flash", "gemini-3.1-pro-preview", "gemini-3.5-flash"]) {
    if (slotBlock.includes(forbidden)) {
      issues.push(`data/providers.js: ${slotId} options must not include unsupported/stale model ${forbidden}`);
    }
  }
}

for (const token of [
  "getProviderImageCapabilityProfile",
  "providerCapabilityPromptNote",
  "providerImagePromptMaxChars",
  "providerUsesExtraBodyImageReferences",
  "providerUsesInlineImageReferences",
]) {
  if (!providerProfiles.includes(token)) issues.push(`provider-capability-profiles.ts: missing ${token}`);
  if (!barrel.includes(token)) issues.push(`providers/index.ts: missing provider capability export ${token}`);
}

for (const forbidden of ["fetch(", "XMLHttpRequest", "axios", "api.openai.com"]) {
  if ([mockAdapter, liveAdapterStubs].join("\n").includes(forbidden)) {
    issues.push(`mock-adapter.ts: mock adapter must not perform network calls (${forbidden})`);
  }
}

if (!mockAdapter.includes("unsupported_capability")) {
  issues.push("mock-adapter.ts: unsupported capabilities must return structured errors");
}

for (const token of ["createLiveProviderRegistry", "createLiveProviderAdapter", "provider_unavailable"]) {
  if (!liveAdapterStubs.includes(token)) issues.push(`live-adapter-stubs.ts: missing ${token}`);
}

if (!barrel.includes("createLiveProviderRegistry")) {
  issues.push("providers/index.ts: missing live provider registry export");
}

if (issues.length > 0) {
  console.error("Provider contract checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Provider contract checks passed.");
