import { readFileSync, rmSync, mkdirSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const issues = [];
const root = process.cwd();

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required asset library file`);
    return "";
  }
}

const contracts = read("src/assets/contracts.ts");
const slots = read("src/assets/slot-definitions.ts");
const service = read("src/assets/library-service.ts");
const localBinary = read("src/assets/local-binary-store.ts");
const barrel = read("src/assets/index.ts");
const apiContracts = read("src/api/contracts.ts");
const apiService = read("src/api/service.ts");
const assetRoute = read("app/api/workspaces/[workspaceId]/assets/route.ts");
const uploadPlanRoute = read("app/api/workspaces/[workspaceId]/assets/upload-plan/route.ts");
const tsconfig = read("tsconfig.json");
const pkg = read("package.json");

for (const token of [
  "AssetUploadMimeTypeSchema",
  "AssetUploadPlanRequestSchema",
  "AssetUploadPlanResultSchema",
  "AssetBinaryUploadResultSchema",
  "AssetCommitRequestSchema",
  "AssetListRequestSchema",
  "maxUploadBytes",
]) {
  if (!contracts.includes(token)) issues.push(`contracts.ts: missing ${token}`);
}

for (const mode of ["poster", "collab", "announcement", "logo", "icon"]) {
  if (!slots.includes(`${mode}:`)) issues.push(`slot-definitions.ts: missing ${mode} slots`);
}

for (const token of [
  'id: "announcement-brand-logo"',
  'role: "brandLogo"',
  'id: "announcement-ui-reference"',
  'role: "uiScreenshot"',
  'description: "Optional scene, event background',
]) {
  if (!slots.includes(token)) issues.push(`slot-definitions.ts: missing announcement optional asset token ${token}`);
}

for (const token of ["getModeAssetSlots", "getRequiredAssetSlots", "AssetSlotDefinitionSchema"]) {
  if (!slots.includes(token)) issues.push(`slot-definitions.ts: missing ${token}`);
}

for (const token of ["createAssetLibraryService", "createUploadPlan", "commitAsset", "listAssets", "StorageRepository"]) {
  if (!service.includes(token)) issues.push(`library-service.ts: missing ${token}`);
}

for (const token of ["writeLocalAssetBinary", "uploads", "assertInsideDirectory"]) {
  if (!localBinary.includes(token)) issues.push(`local-binary-store.ts: missing ${token}`);
}

for (const token of ["contracts", "slot-definitions", "library-service"]) {
  if (!barrel.includes(token)) issues.push(`src/assets/index.ts: missing export for ${token}`);
}

for (const token of ["AssetUploadPlanApiRequestSchema", "AssetCommitApiRequestSchema", "AssetListApiRequestSchema"]) {
  if (!apiContracts.includes(token)) issues.push(`api/contracts.ts: missing ${token}`);
}

for (const method of ["createAssetUploadPlan", "commitAssetRecord", "listWorkspaceAssets"]) {
  if (!apiService.includes(method)) issues.push(`api/service.ts: missing ${method}`);
}

if (!assetRoute.includes("listWorkspaceAssets") || !assetRoute.includes("commitAssetRecord")) {
  issues.push("assets route must delegate list and commit methods");
}

if (!uploadPlanRoute.includes("createAssetUploadPlan")) {
  issues.push("upload-plan route must delegate createAssetUploadPlan");
}

if (!tsconfig.includes("src/assets/**/*.ts")) issues.push("tsconfig.json: missing assets include");
if (!pkg.includes("assets:check")) issues.push("package.json: missing assets:check script");

const assetSource = [contracts, slots, service, apiContracts, apiService, assetRoute, uploadPlanRoute].join("\n");
for (const forbidden of [
  "fetch(",
  "XMLHttpRequest",
  "axios",
  "localStorage",
  "sessionStorage",
  "writeFile",
  "readFile",
  "createReadStream",
  "S3Client",
  "PutObject",
  "api.openai.com",
  "generateImage(",
]) {
  if (assetSource.includes(forbidden)) {
    issues.push(`asset library must not perform real upload, file, network, or provider side effects (${forbidden})`);
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
  const outDir = path.join(root, `.tmp-asset-library-check-${Date.now()}`);
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

    const assetModulePath = existsSync(path.join(outDir, "assets", "index.js"))
      ? path.join(outDir, "assets", "index.js")
      : path.join(outDir, "src", "assets", "index.js");
    const storageModulePath = existsSync(path.join(outDir, "storage", "index.js"))
      ? path.join(outDir, "storage", "index.js")
      : path.join(outDir, "src", "storage", "index.js");

    const assets = await import(pathToFileURL(assetModulePath).href);
    const localBinaryModulePath = existsSync(path.join(outDir, "assets", "local-binary-store.js"))
      ? path.join(outDir, "assets", "local-binary-store.js")
      : path.join(outDir, "src", "assets", "local-binary-store.js");
    const localBinaryModule = await import(pathToFileURL(localBinaryModulePath).href);
    const storage = await import(pathToFileURL(storageModulePath).href);
    const snapshot = storage.createMockWorkspaceSnapshot();
    const repository = storage.createMemoryDraftRepository([snapshot]);
    const serviceModule = assets.createAssetLibraryService({
      repository,
      now: () => "2026-05-21T12:00:00.000Z",
    });

    for (const mode of ["poster", "collab", "announcement", "logo", "icon"]) {
      const modeSlots = assets.getModeAssetSlots(mode);
      if (!Array.isArray(modeSlots) || modeSlots.length === 0) issues.push(`${mode} must expose asset slots`);
      if (!["announcement", "logo"].includes(mode) && assets.getRequiredAssetSlots(mode).length === 0) {
        issues.push(`${mode} must have at least one required asset slot`);
      }
    }

    const announcementRequired = assets.getRequiredAssetSlots("announcement");
    if (announcementRequired.length !== 0) {
      issues.push("announcement mode should not hard-require uploaded assets; title/copy safety is the primary input");
    }
    const announcementRoles = assets.getModeAssetSlots("announcement").map((slot) => slot.role);
    for (const role of ["gameCharacter", "background", "gameLogo", "brandLogo", "uiScreenshot"]) {
      if (!announcementRoles.includes(role)) issues.push(`announcement mode should expose optional ${role} reference slot`);
    }

    const invalidName = assets.AssetUploadPlanRequestSchema.safeParse({
      workspaceId: snapshot.metadata.workspaceId,
      projectId: snapshot.project.id,
      role: "subjectReference",
      label: "Unsafe",
      fileName: "../unsafe.gif",
      mimeType: "image/gif",
      byteSize: 10,
    });
    if (invalidName.success) issues.push("upload validation should reject unsafe names and unsupported mime types");

    const planned = await serviceModule.createUploadPlan({
      workspaceId: snapshot.metadata.workspaceId,
      projectId: snapshot.project.id,
      role: "subjectReference",
      label: "Icon hero",
      fileName: "icon-hero.png",
      mimeType: "image/png",
      byteSize: 1024,
      checksum: "sha256-icon-hero",
      usage: ["input", "reference"],
      clientAssetId: "asset-icon-hero",
    });

    if (planned.uploadPlan.assetId !== "asset-icon-hero") issues.push("upload plan should preserve client asset id");
    if (!planned.uploadPlan.storageKey.includes("projects/project-pizza-kitchen/assets/subjectReference/asset-icon-hero.png")) {
      issues.push("upload plan should produce a safe storage key");
    }

    const committed = await serviceModule.commitAsset({
      workspaceId: snapshot.metadata.workspaceId,
      asset: planned.assetDraft,
    });
    if (committed.summary.assetCount !== snapshot.assets.length + 1) issues.push("committing asset should update snapshot asset count");

    const listed = await serviceModule.listAssets({
      workspaceId: snapshot.metadata.workspaceId,
      role: "subjectReference",
      usage: "reference",
    });
    if (listed.assets.length !== 1 || listed.assets[0].id !== "asset-icon-hero") {
      issues.push("asset list should filter by role and usage");
    }

    const binaryResult = await localBinaryModule.writeLocalAssetBinary({
      workspaceId: "workspace-binary-check",
      assetId: "asset-binary-check",
      storageKey: "projects/project-check/assets/styleReference/asset-binary-check.png",
      mimeType: "image/png",
      bytes: new Uint8Array([137, 80, 78, 71]),
      origin: "http://localhost:3001",
    });
    if (!binaryResult.publicUrl.includes("/uploads/workspaces/workspace-binary-check/")) {
      issues.push("local binary upload should return a public workspace upload URL");
    }
    const binaryFilePath = path.join(root, "public", "uploads", "workspaces", "workspace-binary-check", "projects", "project-check", "assets", "styleReference", "asset-binary-check.png");
    if (!existsSync(binaryFilePath)) {
      issues.push("local binary upload should write the file inside public workspace uploads");
    }

    try {
      await localBinaryModule.writeLocalAssetBinary({
        workspaceId: "workspace-binary-check",
        assetId: "asset-binary-check",
        storageKey: "../escape.png",
        mimeType: "image/png",
        bytes: new Uint8Array([1]),
        origin: "http://localhost:3001",
      });
      issues.push("local binary upload should reject path traversal storage keys");
    } catch {
      // Expected: traversal attempts must be rejected.
    }
  } finally {
    const uploadCheckDir = path.join(root, "public", "uploads", "workspaces", "workspace-binary-check");
    if (path.resolve(uploadCheckDir).startsWith(path.resolve(root)) && existsSync(uploadCheckDir)) {
      rmSync(uploadCheckDir, { recursive: true, force: true });
    }
    const resolved = path.resolve(outDir);
    if (resolved.startsWith(`${path.resolve(root)}${path.sep}`) && path.basename(resolved).startsWith(".tmp-asset-library-check-")) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Asset library checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Asset library checks passed.");
