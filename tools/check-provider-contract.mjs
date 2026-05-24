import { readFileSync } from "node:fs";

const requiredProviderIds = ["openai", "google", "replicate", "comfy", "custom"];
const requiredContractFiles = [
  "src/providers/contracts.ts",
  "src/providers/manifests.ts",
  "src/providers/mock-adapter.ts",
  "src/providers/live-adapter-stubs.ts",
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
const mockAdapter = read("src/providers/mock-adapter.ts");
const liveAdapterStubs = read("src/providers/live-adapter-stubs.ts");
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
  "ProviderModelSlotSchema",
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
