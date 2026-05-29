import { readFileSync } from "node:fs";

const issues = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required queue contract file`);
    return "";
  }
}

const contracts = read("src/queue/contracts.ts");
const planner = read("src/queue/planner.ts");
const runner = read("src/queue/mock-runner.ts");
const worker = read("src/queue/workspace-worker.ts");
const barrel = read("src/queue/index.ts");
const queueViewModel = read("src/data/queue-view-model.js");
const taskChrome = read("src/render/task-chrome.js");

for (const token of [
  "QueueJobSchema",
  "QueueTaskSchema",
  "QueueEventSchema",
  "QueuePlanSchema",
  "RetryPolicySchema",
  "summarizeQueue",
  "providerCapabilityForTask",
]) {
  if (!contracts.includes(token)) issues.push(`contracts.ts: missing ${token}`);
}

for (const kind of ["briefGeneration", "imageGeneration", "imageEdit", "upscale", "backgroundRemoval"]) {
  if (!contracts.includes(kind)) issues.push(`contracts.ts: missing task kind ${kind}`);
}

for (const capability of ["imageGeneration", "imageEdit", "upscale", "backgroundRemoval"]) {
  if (!contracts.includes(capability)) issues.push(`contracts.ts: missing provider capability mapping ${capability}`);
}

if (!planner.includes("createBatchQueuePlan")) {
  issues.push("planner.ts: missing createBatchQueuePlan");
}

if (!runner.includes("runMockQueuePlan")) {
  issues.push("mock-runner.ts: missing runMockQueuePlan");
}

if (!worker.includes("createWorkspaceQueueWorker")) {
  issues.push("workspace-worker.ts: missing createWorkspaceQueueWorker");
}

for (const forbidden of ["fetch(", "XMLHttpRequest", "axios", "api.openai.com"]) {
  if ([runner, worker].join("\n").includes(forbidden)) {
    issues.push(`queue runner/worker must not perform network calls (${forbidden})`);
  }
}

if (!barrel.includes("createBatchQueuePlan") || !barrel.includes("runMockQueuePlan") || !barrel.includes("createWorkspaceQueueWorker")) {
  issues.push("index.ts: queue barrel must export planner, mock runner, and workspace worker");
}

if (!queueViewModel.includes("createQueueViewModel")) {
  issues.push("queue-view-model.js: missing createQueueViewModel");
}

const taskChromeRemoved = taskChrome.includes("export function renderTaskChrome()") && taskChrome.includes('return "";');
if (!taskChromeRemoved && !taskChrome.includes("createQueueViewModel")) {
  issues.push("task-chrome.js: active task chrome must derive display state from the queue view model");
}

for (const hardcoded of ["12 / 16 完成", "75%", "$4.88", "03:12"]) {
  if (taskChrome.includes(hardcoded)) {
    issues.push(`task-chrome.js: remove hard-coded queue display value (${hardcoded})`);
  }
}

if (issues.length > 0) {
  console.error("Queue contract checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Queue contract checks passed.");
