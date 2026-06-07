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
    issues.push(`${filePath}: missing required result download file`);
    return "";
  }
}

const descriptor = read("src/results/download-descriptor.ts");
const resultsIndex = read("src/results/index.ts");
const service = read("src/api/service.ts");
const contracts = read("src/api/contracts.ts");
const route = read("app/api/workspaces/[workspaceId]/results/[resultId]/download/route.ts");
const decisions = read("DECISIONS.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const pkg = read("package.json");

for (const token of [
  "ResultDownloadDescriptorSchema",
  "ResultDownloadSourceSchema",
  "createResultDownloadDescriptor",
  "resultDownloadFileName",
  "inlineDataUrl",
  "unavailable",
]) {
  if (!descriptor.includes(token)) issues.push(`download-descriptor.ts: missing ${token}`);
}

if (!resultsIndex.includes("download-descriptor")) issues.push("src/results/index.ts: missing download descriptor export");

for (const token of [
  "ResultDownloadDescribeApiRequestSchema",
  "ResultDownloadDescribeApiResponseSchema",
  "result.download.describe",
]) {
  if (!contracts.includes(token)) issues.push(`contracts.ts: missing result download API token ${token}`);
}

for (const token of ["describeResultDownload", "createResultDownloadDescriptor"]) {
  if (!service.includes(token)) issues.push(`service.ts: missing ${token}`);
}

for (const token of [
  "nextLocalApiService",
  "nextResultFileStore",
  "describeResultDownload",
  "jsonEnvelope",
  "file=1",
  "readStoredFile",
  "content-disposition",
  "x-result-storage-key",
]) {
  if (!route.includes(token)) issues.push(`result download route: missing ${token}`);
}

for (const [file, source] of [
  ["DECISIONS.md", decisions],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
]) {
  if (!source.includes("Result Download Descriptor")) {
    issues.push(`${file}: missing Result Download Descriptor update`);
  }
}

for (const [file, source] of [
  ["DECISIONS.md", decisions],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
]) {
  if (!source.includes("Persisted Result File Download")) {
    issues.push(`${file}: missing Persisted Result File Download update`);
  }
}

if (!pkg.includes("result-download:check")) issues.push("package.json: missing result-download:check script");

for (const [file, source] of [
  ["download-descriptor.ts", descriptor],
  ["result download route", route],
]) {
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
    if (source.includes(forbidden)) {
      issues.push(`${file}: must not perform network, env, browser storage, providers, or file IO (${forbidden})`);
    }
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
  const outDir = path.join(root, `.tmp-result-download-check-${Date.now()}`);
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

    const resultsModulePath = existsSync(path.join(outDir, "results", "index.js"))
      ? path.join(outDir, "results", "index.js")
      : existsSync(path.join(outDir, "src", "results", "index.js"))
        ? path.join(outDir, "src", "results", "index.js")
        : existsSync(path.join(outDir, "results", "download-descriptor.js"))
          ? path.join(outDir, "results", "download-descriptor.js")
          : path.join(outDir, "src", "results", "download-descriptor.js");
    const storageModulePath = existsSync(path.join(outDir, "storage", "index.js"))
      ? path.join(outDir, "storage", "index.js")
      : path.join(outDir, "src", "storage", "index.js");
    const apiModulePath = existsSync(path.join(outDir, "api", "index.js"))
      ? path.join(outDir, "api", "index.js")
      : path.join(outDir, "src", "api", "index.js");

    const results = await import(pathToFileURL(resultsModulePath).href);
    const storage = await import(pathToFileURL(storageModulePath).href);
    const api = await import(pathToFileURL(apiModulePath).href);
    const snapshot = storage.createMockWorkspaceSnapshot();
    const storedUrlResult = snapshot.results[0];

    const storedUrlDescriptor = results.createResultDownloadDescriptor({
      snapshot,
      resultId: storedUrlResult.id,
    });
    if (!storedUrlDescriptor?.available || storedUrlDescriptor.source !== "assetUrl") {
      issues.push("stored assetUrl results should resolve to assetUrl download descriptors");
    }

    const inlineResult = {
      ...storedUrlResult,
      id: "result-inline-data",
      assetUrl: null,
      thumbnailUrl: null,
      metadata: {
        providerAsset: {
          id: "provider-inline-data",
          mimeType: "image/png",
          width: 640,
          height: 640,
          dataUrl: "data:image/png;base64,",
        },
      },
    };
    const inlineSnapshot = storage.WorkspaceSnapshotSchema.parse({
      ...snapshot,
      results: [inlineResult],
    });
    const inlineDescriptor = results.createResultDownloadDescriptor({
      snapshot: inlineSnapshot,
      resultId: inlineResult.id,
    });
    if (!inlineDescriptor?.available || inlineDescriptor.source !== "inlineDataUrl") {
      issues.push("provider dataUrl metadata should resolve to inlineDataUrl descriptors");
    }

    const unavailableResult = {
      ...storedUrlResult,
      id: "result-unavailable",
      assetUrl: null,
      thumbnailUrl: null,
      metadata: {},
    };
    const unavailableSnapshot = storage.WorkspaceSnapshotSchema.parse({
      ...snapshot,
      results: [unavailableResult],
    });
    const unavailableDescriptor = results.createResultDownloadDescriptor({
      snapshot: unavailableSnapshot,
      resultId: unavailableResult.id,
    });
    if (!unavailableDescriptor || unavailableDescriptor.available || unavailableDescriptor.source !== "unavailable") {
      issues.push("results without downloadable sources should produce an unavailable descriptor");
    }

    const localFileResult = {
      ...storedUrlResult,
      id: "result-local-file",
      assetUrl: null,
      thumbnailUrl: null,
      metadata: {
        resultFile: {
          storageKey: "workspaces/workspace-pizza-kitchen/results/result-local-file/result.png",
          mimeType: "image/png",
          byteSize: 1,
          checksum: "sha256-local-file",
          storedAt: "2026-05-23T00:00:00.000Z",
        },
      },
    };
    const localFileSnapshot = storage.WorkspaceSnapshotSchema.parse({
      ...snapshot,
      results: [localFileResult],
    });
    const localFileDescriptor = results.createResultDownloadDescriptor({
      snapshot: localFileSnapshot,
      resultId: localFileResult.id,
    });
    if (
      !localFileDescriptor?.available ||
      localFileDescriptor.source !== "localFile" ||
      localFileDescriptor.storageKey !== localFileResult.metadata.resultFile.storageKey ||
      localFileDescriptor.byteSize !== 1
    ) {
      issues.push("persisted result files should resolve to localFile download descriptors");
    }

    const localFileWithAssetUrlResult = {
      ...localFileResult,
      id: "result-local-file-with-asset-url",
      assetUrl: "https://cdn.example.com/stale-result.png",
    };
    const localFileWithAssetUrlSnapshot = storage.WorkspaceSnapshotSchema.parse({
      ...snapshot,
      results: [localFileWithAssetUrlResult],
    });
    const localFileWithAssetUrlDescriptor = results.createResultDownloadDescriptor({
      snapshot: localFileWithAssetUrlSnapshot,
      resultId: localFileWithAssetUrlResult.id,
    });
    if (!localFileWithAssetUrlDescriptor?.available || localFileWithAssetUrlDescriptor.source !== "localFile") {
      issues.push("persisted local result files should take precedence over stale assetUrl values");
    }

    const repository = storage.createMemoryDraftRepository([inlineSnapshot]);
    const service = api.createLocalApiService({ repository });
    const apiDescriptor = await service.describeResultDownload({
      workspaceId: inlineSnapshot.metadata.workspaceId,
      resultId: inlineResult.id,
    });
    if (!apiDescriptor.ok || apiDescriptor.data.descriptor.source !== "inlineDataUrl") {
      issues.push("local API service should describe result downloads");
    }

    const missing = await service.describeResultDownload({
      workspaceId: inlineSnapshot.metadata.workspaceId,
      resultId: "missing-result",
    });
    if (missing.ok || missing.error.code !== "not_found") {
      issues.push("missing result downloads should return not_found");
    }
  } finally {
    const resolved = path.resolve(outDir);
    if (resolved.startsWith(`${path.resolve(root)}${path.sep}`) && path.basename(resolved).startsWith(".tmp-result-download-check-")) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Result download descriptor checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Result download descriptor checks passed.");
