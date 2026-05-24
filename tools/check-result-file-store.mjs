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

const fileStore = read("src/results/file-store.ts");
const descriptor = read("src/results/download-descriptor.ts");
const resultsIndex = read("src/results/index.ts");
const decisions = read("DECISIONS.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const product = read("PRODUCT.md");
const pkg = read("package.json");

for (const token of [
  "ResultStoredFileMetadataSchema",
  "ResultFileStoreDataUrlInputSchema",
  "createLocalResultFileStore",
  "storeDataUrl",
  "readStoredFile",
  "resolvePath",
  "sha256-",
  "assertSafePath",
]) {
  if (!fileStore.includes(token)) issues.push(`file-store.ts: missing ${token}`);
}

for (const token of ["localFile", "resultFile", "storageKey", "checksum", "byteSize"]) {
  if (!descriptor.includes(token)) issues.push(`download-descriptor.ts: missing local result file descriptor token ${token}`);
}

for (const token of ["file-store", "download-descriptor"]) {
  if (!resultsIndex.includes(token)) issues.push(`src/results/index.ts: missing ${token} export`);
}

for (const [file, source] of [
  ["DECISIONS.md", decisions],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
  ["PRODUCT.md", product],
]) {
  if (!source.includes("Result File Storage") && !source.includes("result file storage")) {
    issues.push(`${file}: missing result file storage update`);
  }
}

if (!decisions.includes("D071")) {
  issues.push("DECISIONS.md: missing D071 result file storage decision");
}

if (!pkg.includes("result-file-store:check")) {
  issues.push("package.json: missing result-file-store:check script");
}

for (const forbidden of ["fetch(", "XMLHttpRequest", "axios", "localStorage", "sessionStorage", "process.env", "generateImage("]) {
  if (fileStore.includes(forbidden)) {
    issues.push(`result file store must not call network, provider, env, or browser storage (${forbidden})`);
  }
}

for (const forbidden of ["readFile", "writeFile"]) {
  if (descriptor.includes(forbidden)) {
    issues.push(`download descriptor must not read/write binary files (${forbidden})`);
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
  const outDir = path.join(root, `.tmp-result-file-store-build-${Date.now()}`);
  const resultRoot = path.join(root, `.tmp-result-file-store-output-${Date.now()}`);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(resultRoot, { recursive: true });

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

    const resultsModulePath = existsSync(path.join(outDir, "results", "index.js"))
      ? path.join(outDir, "results", "index.js")
      : path.join(outDir, "src", "results", "index.js");
    const storageModulePath = existsSync(path.join(outDir, "storage", "index.js"))
      ? path.join(outDir, "storage", "index.js")
      : path.join(outDir, "src", "storage", "index.js");

    const results = await import(pathToFileURL(resultsModulePath).href);
    const storage = await import(pathToFileURL(storageModulePath).href);

    const store = results.createLocalResultFileStore({
      rootDir: resultRoot,
      publicBaseUrl: "http://localhost:3000/generated-results/",
      now: () => "2026-05-22T00:00:00.000Z",
    });
    const dataUrl = `data:image/png;base64,${Buffer.from("fake-result-image").toString("base64")}`;
    const metadata = await store.storeDataUrl({
      workspaceId: "../workspace:danger",
      resultId: "result/one",
      fileName: "Poster Final",
      dataUrl,
    });

    if (!metadata.storageKey.startsWith("workspaces/workspace-danger/results/result-one/")) {
      issues.push("result file store should sanitize workspace/result storage key parts");
    }
    if (!metadata.publicUrl?.startsWith("http://localhost:3000/generated-results/workspaces/")) {
      issues.push("result file store should produce public URL when publicBaseUrl is configured");
    }
    if (metadata.mimeType !== "image/png" || metadata.byteSize !== Buffer.from("fake-result-image").byteLength) {
      issues.push("result file store should preserve mime type and byte size");
    }
    if (!metadata.checksum.startsWith("sha256-")) {
      issues.push("result file store should return checksum metadata");
    }

    const storedFile = await store.readStoredFile(metadata.storageKey);
    if (Buffer.from(storedFile.bytes).toString("utf8") !== "fake-result-image") {
      issues.push("result file store should read back stored bytes");
    }

    const resolvedPath = store.resolvePath(metadata.storageKey);
    if (!path.resolve(resolvedPath).startsWith(path.resolve(resultRoot))) {
      issues.push("result file store resolved path should stay under root");
    }

    const snapshot = storage.createMockWorkspaceSnapshot();
    const result = snapshot.results[0];
    const persistedResult = storage.StoredResultAssetSchema.parse({
      ...result,
      assetUrl: null,
      thumbnailUrl: null,
      metadata: {
        ...result.metadata,
        resultFile: metadata,
        providerAsset: {
          mimeType: "image/png",
          width: result.width,
          height: result.height,
          dataUrl,
        },
      },
    });
    const persistedSnapshot = storage.WorkspaceSnapshotSchema.parse({
      ...snapshot,
      results: [persistedResult],
    });
    const descriptorResult = results.createResultDownloadDescriptor({
      snapshot: persistedSnapshot,
      resultId: persistedResult.id,
    });
    if (!descriptorResult?.available || descriptorResult.source !== "localFile") {
      issues.push("download descriptor should prefer persisted local result files");
    }
    if (descriptorResult.storageKey !== metadata.storageKey || descriptorResult.checksum !== metadata.checksum) {
      issues.push("download descriptor should expose local result file metadata");
    }
    if (descriptorResult.dataUrl) {
      issues.push("download descriptor should not expose provider dataUrl when local file metadata exists");
    }

    const storeWithoutPublicUrl = results.createLocalResultFileStore({
      rootDir: resultRoot,
      now: () => "2026-05-22T00:00:00.000Z",
    });
    const noPublic = await storeWithoutPublicUrl.storeDataUrl({
      workspaceId: "workspace-no-public",
      resultId: "result-no-public",
      fileName: "no-public",
      dataUrl,
    });
    if (noPublic.publicUrl) {
      issues.push("result file store should omit public URL when no publicBaseUrl is configured");
    }
  } finally {
    for (const candidate of [outDir, resultRoot]) {
      const resolved = path.resolve(candidate);
      const allowed =
        resolved.startsWith(`${path.resolve(root)}${path.sep}`) &&
        (path.basename(resolved).startsWith(".tmp-result-file-store-build-") ||
          path.basename(resolved).startsWith(".tmp-result-file-store-output-"));
      if (allowed) rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Result file store checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Result file store checks passed.");
