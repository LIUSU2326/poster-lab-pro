import { readFileSync } from "node:fs";

const issues = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required E2E mock loop file`);
    return "";
  }
}

const loop = read("src/e2e/mock-loop.ts");
const barrel = read("src/e2e/index.ts");

for (const token of [
  "runMockE2ELoop",
  "createMockWorkspaceSnapshot",
  "createBriefPromptPackage",
  "createImagePromptPackage",
  "mapPromptPackageToProviderRequest",
  "createMockProviderRegistry",
  "executeMappedProviderRequest",
  "normalizeProviderExecutionResult",
  "createBatchQueuePlan",
  "summarizeQueue",
  "MockE2ELoopSummarySchema",
]) {
  if (!loop.includes(token)) issues.push(`mock-loop.ts: missing ${token}`);
}

for (const token of ["briefGeneration", "imageGeneration", "QueueSummarySchema"]) {
  if (!loop.includes(token)) issues.push(`mock-loop.ts: missing contract loop token ${token}`);
}

if (!barrel.includes("mock-loop")) {
  issues.push("index.ts: missing mock-loop export");
}

for (const forbidden of [
  "fetch(",
  "XMLHttpRequest",
  "axios",
  "localStorage",
  "sessionStorage",
  "writeFile",
  "readFile",
  "api.openai.com",
]) {
  if (loop.includes(forbidden)) {
    issues.push(`mock-loop.ts: E2E mock loop must not call network, browser storage, or filesystem (${forbidden})`);
  }
}

if (issues.length > 0) {
  console.error("E2E mock loop checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("E2E mock loop checks passed.");
