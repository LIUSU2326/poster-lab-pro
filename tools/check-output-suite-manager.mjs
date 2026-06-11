import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const issues = [];

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required file`);
    return "";
  }
}

const outputSettings = read("src/react/OutputSettingsSection.tsx");
const plannerSource = read("src/queue/planner.ts");
const localDraftStore = read("src/local-draft-store.js");
const bridge = read("src/react/StaticWorkbenchBridge.tsx");
const workspaceDataService = read("src/workspace-data-service.js");

for (const token of [
  "persistCustomSuites",
  "applyCustomSuiteSizes",
  "state.outputCustomSuites",
  "state.outputCustomSuiteSizes",
  "state.outputActiveCustomSuiteId",
  "SuiteManager",
  "saveLocalOutputPreferences",
  "saveWorkspaceSnapshotForWorkbench",
]) {
  if (!outputSettings.includes(token)) {
    issues.push(`OutputSettingsSection.tsx: missing custom suite persistence token ${token}`);
  }
}

for (const token of ["outputTargetsForPlan", "selectionMode", "planStrategy", "inferDimensions", "imageGeneration"]) {
  if (!plannerSource.includes(token)) {
    issues.push(`planner.ts: missing suite expansion token ${token}`);
  }
}

for (const token of [
  "poster-lab-pro:output-preferences",
  "saveLocalOutputPreferences",
  "hydrateLocalOutputPreferences",
  "modeOutputSettings",
]) {
  if (!localDraftStore.includes(token)) {
    issues.push(`local-draft-store.js: missing output preference persistence token ${token}`);
  }
}

if (!bridge.includes("hydrateLocalOutputPreferences")) {
  issues.push("StaticWorkbenchBridge.tsx: should hydrate output preferences on startup and after workspace load");
}

if (!workspaceDataService.includes("saveWorkspaceSnapshotForWorkbench")) {
  issues.push("workspace-data-service.js: missing workspace snapshot save helper for durable output settings");
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
  const outDir = path.join(root, `.tmp-output-suite-manager-check-${Date.now()}`);
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

    const queueModulePath = existsSync(path.join(outDir, "queue", "index.js"))
      ? path.join(outDir, "queue", "index.js")
      : path.join(outDir, "src", "queue", "index.js");
    const queue = await import(pathToFileURL(queueModulePath).href);
    const sizes = ["1024x1024", "1200x627", "1080x1920", "1600x1200", "1024x500"];
    const unifiedPlan = queue.createBatchQueuePlan({
      projectId: "project-output-suite-manager-check",
      mode: "poster",
      providerId: "aigocode",
      providerRoutes: {
        concept: { providerId: "mimo", model: "mimo-v2.5-pro" },
        image: { providerId: "aigocode", model: "gpt-image-1" },
      },
      schemeIds: ["scheme-suite-1", "scheme-suite-2"],
      platformPresets: ["custom"],
      aspectRatios: sizes,
      selectionMode: "suite",
      planStrategy: "unified",
      imagesPerScheme: 2,
      regenerateSchemes: false,
      includeImageGeneration: true,
    });
    const unifiedImageTasks = unifiedPlan.tasks.filter((task) => task.kind === "imageGeneration");
    if (unifiedImageTasks.length !== sizes.length * 2) {
      issues.push(`unified custom suite should create ${sizes.length * 2} image tasks, got ${unifiedImageTasks.length}`);
    }
    for (const [index, size] of sizes.entries()) {
      const task = unifiedImageTasks[index];
      if (!task) continue;
      const [width, height] = size.split("x").map(Number);
      if (task.input.width !== width || task.input.height !== height || task.input.aspectRatio !== size) {
        issues.push(`unified custom suite task ${index + 1} should preserve ${size}, got ${task.input.width}x${task.input.height}/${task.input.aspectRatio}`);
      }
      if (task.input.schemeId !== "scheme-suite-1") {
        issues.push("unified custom suite should fan out the first full size set from the first selected scheme");
      }
      if (task.input.count !== 2) {
        issues.push("unified custom suite should preserve imagesPerScheme as per-size variant count");
      }
    }
    for (const [index, size] of sizes.entries()) {
      const task = unifiedImageTasks[index + sizes.length];
      if (!task) continue;
      if (task.input.schemeId !== "scheme-suite-2" || task.input.aspectRatio !== size) {
        issues.push("unified custom suite should fan out every selected scheme across every suite size");
      }
    }

    const independentSchemeIds = Array.from({ length: sizes.length * 2 }, (_, index) => `scheme-independent-${index + 1}`);
    const independentPlan = queue.createBatchQueuePlan({
      projectId: "project-output-suite-manager-check",
      mode: "poster",
      providerId: "aigocode",
      providerRoutes: {
        concept: { providerId: "mimo", model: "mimo-v2.5-pro" },
        image: { providerId: "aigocode", model: "gpt-image-1" },
      },
      schemeIds: independentSchemeIds,
      platformPresets: ["custom"],
      aspectRatios: sizes,
      selectionMode: "suite",
      planStrategy: "independent",
      imagesPerScheme: 3,
      regenerateSchemes: false,
      includeImageGeneration: true,
    });
    const independentImageTasks = independentPlan.tasks.filter((task) => task.kind === "imageGeneration");
    if (independentImageTasks.length !== independentSchemeIds.length) {
      issues.push(`independent custom suite should create ${independentSchemeIds.length} image tasks, got ${independentImageTasks.length}`);
    }
    for (const [index, task] of independentImageTasks.entries()) {
      const expectedSize = sizes[index % sizes.length];
      const [width, height] = expectedSize.split("x").map(Number);
      if (task.input.schemeId !== independentSchemeIds[index]) {
        issues.push("independent custom suite should keep one scheme per size-specific design");
      }
      if (task.input.width !== width || task.input.height !== height || task.input.aspectRatio !== expectedSize) {
        issues.push(`independent custom suite task ${index + 1} should preserve ${expectedSize}, got ${task.input.width}x${task.input.height}/${task.input.aspectRatio}`);
      }
      if (task.input.count !== 3) {
        issues.push("independent custom suite should preserve imagesPerScheme as per-size variant count");
      }
    }
  } finally {
    const resolved = path.resolve(outDir);
    if (
      resolved.startsWith(`${path.resolve(root)}${path.sep}`)
      && path.basename(resolved).startsWith(".tmp-output-suite-manager-check-")
    ) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Output suite manager checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Output suite manager checks passed.");
