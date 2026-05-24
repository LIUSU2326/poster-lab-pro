import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const issues = [];
const root = process.cwd();

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required queue feedback file`);
    return "";
  }
}

const feedback = read("src/queue/feedback.ts");
const decisions = read("DECISIONS.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const pkg = read("package.json");

for (const token of [
  "QueueFeedbackSnapshotSchema",
  "QueueFeedbackTaskSchema",
  "QueueFeedbackFailureSchema",
  "createQueueFeedbackSnapshot",
  "formatQueueCost",
  "formatElapsedMs",
  "queueStageLabel",
]) {
  if (!feedback.includes(token)) issues.push(`feedback.ts: missing ${token}`);
}

for (const [file, source] of [
  ["DECISIONS.md", decisions],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
]) {
  if (!source.includes("Queue Feedback")) {
    issues.push(`${file}: missing Queue Feedback update`);
  }
}

if (!pkg.includes("queue-feedback:check")) issues.push("package.json: missing queue-feedback:check script");

for (const forbidden of [
  "fetch(",
  "XMLHttpRequest",
  "axios",
  "localStorage",
  "sessionStorage",
  "writeFile",
  "readFile",
  "process.env",
  "generateImage(",
  "api.openai.com",
]) {
  if (feedback.includes(forbidden)) {
    issues.push(`queue feedback must not perform network, env, browser storage, provider, or file IO (${forbidden})`);
  }
}

function resolveRelativeSpecifier(filePath, specifier) {
  if (/\.[cm]?js$|\.json$/.test(specifier)) return specifier;
  const base = path.resolve(path.dirname(filePath), specifier);
  if (existsSync(`${base}.js`)) return `${specifier}.js`;
  if (existsSync(path.join(base, "index.js"))) return `${specifier}/index.js`;
  return `${specifier}.js`;
}

function patchImports(filePath) {
  let text = readFileSync(filePath, "utf8");
  text = text.replace(/(from\s+["'])(\.?\.\/[^"']+)(["'])/g, (_match, start, specifier, end) => {
    return `${start}${resolveRelativeSpecifier(filePath, specifier)}${end}`;
  });
  writeFileSync(filePath, text, "utf8");
}

async function runRuntimeCheck() {
  const outDir = path.join(root, `.tmp-queue-feedback-check-${Date.now()}`);
  mkdirSync(outDir, { recursive: true });

  try {
    const configFile = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
    if (configFile.error) {
      issues.push(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
      return;
    }

    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root, {
      noEmit: false,
      outDir,
      declaration: false,
      sourceMap: false,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      incremental: false,
    });
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const emitResult = program.emit();
    const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
    const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    if (errors.length > 0) {
      issues.push(ts.formatDiagnosticsWithColorAndContext(errors, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      }));
      return;
    }

    const stack = [outDir];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(entryPath);
        if (entry.isFile() && entry.name.endsWith(".js")) patchImports(entryPath);
      }
    }

    const feedbackModulePath = existsSync(path.join(outDir, "queue", "feedback.js"))
      ? path.join(outDir, "queue", "feedback.js")
      : path.join(outDir, "src", "queue", "feedback.js");
    const plannerModulePath = existsSync(path.join(outDir, "queue", "planner.js"))
      ? path.join(outDir, "queue", "planner.js")
      : path.join(outDir, "src", "queue", "planner.js");
    const providersModulePath = existsSync(path.join(outDir, "providers", "index.js"))
      ? path.join(outDir, "providers", "index.js")
      : path.join(outDir, "src", "providers", "index.js");

    const feedbackModule = await import(pathToFileURL(feedbackModulePath).href);
    const planner = await import(pathToFileURL(plannerModulePath).href);
    const providers = await import(pathToFileURL(providersModulePath).href);

    const plan = planner.createBatchQueuePlan({
      projectId: "project-feedback-check",
      mode: "poster",
      providerId: "openai",
      schemeIds: ["scheme-feedback"],
      imagesPerScheme: 1,
      includeImageEdit: false,
      includeUpscale: false,
      includeBackgroundRemoval: false,
    });
    const runningPlan = {
      ...plan,
      job: {
        ...plan.job,
        status: "running",
      },
      tasks: plan.tasks.map((task, index) =>
        index === 0
          ? {
              ...task,
              status: "running",
              stage: "providerCall",
              progress: 50,
              elapsedMs: 65000,
              cost: {
                estimatedCost: 1.2,
                actualCost: null,
                currency: "USD",
              },
            }
          : {
              ...task,
              cost: {
                estimatedCost: 0,
                actualCost: null,
                currency: "USD",
              },
            },
      ),
    };
    const runningFeedback = feedbackModule.createQueueFeedbackSnapshot(runningPlan);
    if (runningFeedback.currentStage !== "Provider call") issues.push("running task should drive current stage label");
    if (runningFeedback.costLabel !== "USD 1.20") issues.push("queue feedback should format estimated cost");
    if (runningFeedback.elapsedLabel !== "1m 05s") issues.push("queue feedback should format elapsed minutes");

    const failedPlan = {
      ...plan,
      job: {
        ...plan.job,
        status: "failed",
      },
      tasks: plan.tasks.map((task, index) =>
        index === 0
          ? {
              ...task,
              status: "failed",
              stage: "done",
              progress: 100,
              attempts: 1,
              maxAttempts: 2,
              error: providers.createProviderError("openai", "provider_unavailable", "Provider unavailable.", {
                retryable: true,
                userMessage: "Provider is temporarily unavailable.",
              }),
              cost: {
                estimatedCost: 1.2,
                actualCost: 0,
                currency: "USD",
              },
            }
          : {
              ...task,
              cost: {
                estimatedCost: 0,
                actualCost: null,
                currency: "USD",
              },
            },
      ),
    };
    const failedFeedback = feedbackModule.createQueueFeedbackSnapshot(failedPlan);
    if (failedFeedback.failures.length !== 1 || failedFeedback.retryableFailureCount !== 1) {
      issues.push("queue feedback should expose retryable failure details");
    }
    if (failedFeedback.currentStage !== "Failed: provider_unavailable") {
      issues.push("failed task should drive current stage label when no task is running");
    }
    if (failedFeedback.costLabel !== "USD 0.00") issues.push("queue feedback should prefer actual cost");
  } finally {
    const resolved = path.resolve(outDir);
    if (resolved.startsWith(`${path.resolve(root)}${path.sep}`) && path.basename(resolved).startsWith(".tmp-queue-feedback-check-")) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Queue feedback checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Queue feedback checks passed.");
