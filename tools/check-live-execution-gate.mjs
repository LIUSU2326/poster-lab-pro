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
    issues.push(`${filePath}: missing required file`);
    return "";
  }
}

const gate = read("src/queue/live-execution-gate.ts");
const liveQueue = read("src/queue/openai-live-queue.ts");
const queueIndex = read("src/queue/index.ts");
const decisions = read("DECISIONS.md");
const product = read("PRODUCT.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const pkg = read("package.json");

for (const token of [
  "LiveExecutionSafetyInputSchema",
  "LiveExecutionGateInputSchema",
  "LiveExecutionGateDecisionSchema",
  "LiveExecutionGateBlockerCodeSchema",
  "evaluateLiveExecutionGate",
  "cost_limit_exceeded",
  "missing_live_confirmation",
  "missing_runtime_credential",
]) {
  if (!gate.includes(token)) issues.push(`live-execution-gate.ts: missing ${token}`);
}

for (const token of ["LiveExecutionSafetyInputSchema", "evaluateLiveExecutionGate", "gate"]) {
  if (!liveQueue.includes(token)) issues.push(`openai-live-queue.ts: missing safety gate integration token ${token}`);
}

for (const token of ["evaluateLiveExecutionGate", "LiveExecutionGateDecisionSchema"]) {
  if (!queueIndex.includes(token)) issues.push(`src/queue/index.ts: missing live execution gate export ${token}`);
}

for (const [file, source] of [
  ["DECISIONS.md", decisions],
  ["PRODUCT.md", product],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
]) {
  if (!source.includes("Live Execution Safety Gate") && !source.includes("live execution gate")) {
    issues.push(`${file}: missing live execution safety gate update`);
  }
}

if (!decisions.includes("D073")) issues.push("DECISIONS.md: missing D073 live execution safety gate decision");
if (!pkg.includes("live-execution-gate:check")) issues.push("package.json: missing live-execution-gate:check script");

for (const forbidden of ["fetch(", "XMLHttpRequest", "axios", "localStorage", "sessionStorage", "process.env", "writeFile", "readFile"]) {
  if (gate.includes(forbidden)) issues.push(`live execution gate must stay pure (${forbidden})`);
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
  const outDir = path.join(root, `.tmp-live-execution-gate-build-${Date.now()}`);
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
      issues.push(
        ts.formatDiagnosticsWithColorAndContext(errors, {
          getCanonicalFileName: (fileName) => fileName,
          getCurrentDirectory: () => root,
          getNewLine: () => "\n",
        }),
      );
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

    const queueModulePath = existsSync(path.join(outDir, "queue", "index.js"))
      ? path.join(outDir, "queue", "index.js")
      : path.join(outDir, "src", "queue", "index.js");
    const queue = await import(pathToFileURL(queueModulePath).href);

    const skipped = queue.evaluateLiveExecutionGate({
      enabled: false,
      providerId: "openai",
    });
    if (skipped.status !== "skipped" || skipped.allowed) {
      issues.push("disabled live execution should return skipped and not allowed");
    }
    if (!skipped.blockers.some((item) => item.code === "not_enabled")) {
      issues.push("skipped gate should include not_enabled blocker");
    }

    const missing = queue.evaluateLiveExecutionGate({
      enabled: true,
      providerId: "openai",
      estimatedCost: 0.2,
      maxAcceptedCost: 1,
      credentialReady: false,
      transportReady: false,
      resultStorageReady: false,
    });
    const missingCodes = missing.blockers.map((item) => item.code);
    for (const code of [
      "missing_live_confirmation",
      "missing_cost_confirmation",
      "missing_external_provider_confirmation",
      "missing_result_storage_confirmation",
      "missing_runtime_credential",
      "missing_transport",
      "missing_result_storage",
    ]) {
      if (!missingCodes.includes(code)) issues.push(`missing gate should include ${code}`);
    }

    const costBlocked = queue.evaluateLiveExecutionGate({
      enabled: true,
      providerId: "openai",
      estimatedCost: 3.5,
      maxAcceptedCost: 1,
      credentialReady: true,
      transportReady: true,
      resultStorageReady: true,
      confirmations: {
        liveRun: true,
        providerCost: true,
        externalProvider: true,
        resultStorage: true,
      },
    });
    if (costBlocked.status !== "blocked" || !costBlocked.blockers.some((item) => item.code === "cost_limit_exceeded")) {
      issues.push("gate should block when estimated cost exceeds accepted cap");
    }

    const allowed = queue.evaluateLiveExecutionGate({
      enabled: true,
      providerId: "openai",
      estimatedCost: 0.4,
      maxAcceptedCost: 1,
      credentialReady: true,
      transportReady: true,
      resultStorageReady: true,
      confirmations: {
        liveRun: true,
        providerCost: true,
        externalProvider: true,
        resultStorage: true,
      },
    });
    if (allowed.status !== "allowed" || !allowed.allowed || allowed.blockers.length !== 0) {
      issues.push("gate should allow execution only after confirmations and runtime prerequisites pass");
    }
    if (JSON.stringify([missing, costBlocked, allowed]).includes("sk-") || JSON.stringify([missing, costBlocked, allowed]).includes("data:image")) {
      issues.push("gate decisions must not expose API keys or image data URLs");
    }
  } finally {
    const resolved = path.resolve(outDir);
    if (
      resolved.startsWith(`${path.resolve(root)}${path.sep}`) &&
      path.basename(resolved).startsWith(".tmp-live-execution-gate-build-")
    ) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Live execution gate checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Live execution gate checks passed.");
