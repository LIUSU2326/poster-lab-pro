import { readFileSync } from "node:fs";

const issues = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required provider executor file`);
    return "";
  }
}

const executor = read("src/providers/executor.ts");
const barrel = read("src/providers/index.ts");

for (const token of [
  "ProviderExecutionInputSchema",
  "ProviderExecutionWithCredentialInputSchema",
  "ProviderExecutionResponseSchema",
  "createMockProviderRegistry",
  "executeMappedProviderRequest",
  "executeMappedProviderRequestWithCredentials",
  "providerConfigFromStoredConfig",
  "normalizeProviderExecutionResult",
  "ProviderMappedRequestSchema",
  "GenerationProviderAdapter",
  "createMockProviderAdapter",
]) {
  if (!executor.includes(token)) issues.push(`executor.ts: missing ${token}`);
}

for (const token of ["generateBrief", "generateImage", "editImage", "upscale", "removeBackground", "unsupported_capability", "No adapter registered"]) {
  if (!executor.includes(token)) issues.push(`executor.ts: missing dispatch or error token ${token}`);
}

for (const token of ["executeMappedProviderRequest", "createMockProviderRegistry", "providerConfigFromStoredConfig"]) {
  if (!barrel.includes(token)) issues.push(`providers/index.ts: missing executor export ${token}`);
}

for (const forbidden of ["fetch(", "XMLHttpRequest", "axios", "localStorage", "sessionStorage", "writeFile", "readFile"]) {
  if (executor.includes(forbidden)) {
    issues.push(`executor.ts: default provider execution bridge must not perform network or persistence side effects (${forbidden})`);
  }
}

if (issues.length > 0) {
  console.error("Provider executor checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Provider executor checks passed.");
