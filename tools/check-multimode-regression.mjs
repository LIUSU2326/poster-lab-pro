import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const issues = [];
const root = process.cwd();

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

function withProviderReadyMockAssets(snapshot) {
  return {
    ...snapshot,
    assets: snapshot.assets.map((asset) => ({
      ...asset,
      metadata: { ...(asset.metadata || {}), mockAsset: true },
      previewUrl: `https://cdn.poster-lab.test/mock-assets/${asset.id}.png`,
    })),
  };
}

function createModeAsset(baseAsset, id, role, label, description = "") {
  const now = "2026-06-03T00:00:00.000Z";
  return {
    ...baseAsset,
    id,
    role,
    label,
    description,
    metadata: {},
    previewUrl: `http://localhost:3000/uploads/workspaces/check/${id}.png`,
    storageKey: `projects/project-pizza-kitchen/assets/${role}/${id}.png`,
    checksum: `sha256-${id}`,
    createdAt: now,
    updatedAt: now,
  };
}

function requireIncludes(text, token, label) {
  if (!text.includes(token)) issues.push(`${label}: missing required token "${token}"`);
}

function requireExcludes(text, token, label) {
  if (text.includes(token)) issues.push(`${label}: should not include token "${token}"`);
}

function requireRegex(text, pattern, label) {
  if (!pattern.test(text)) issues.push(`${label}: missing required pattern ${pattern}`);
}

function requireNoRegex(text, pattern, label) {
  if (pattern.test(text)) issues.push(`${label}: should not match forbidden pattern ${pattern}`);
}

function assertProviderRequestCommon(mode, mapped) {
  const label = `${mode} provider request`;
  if (mapped.kind !== "imageGeneration") issues.push(`${label}: expected imageGeneration request`);
  if (mapped.request.context.mode !== mode) issues.push(`${label}: context mode should be ${mode}`);
  if (mapped.request.prompt.length > 12000) issues.push(`${label}: prompt exceeds 12000 characters`);
  if (!mapped.request.assets.every((asset) => asset.url)) issues.push(`${label}: every bound asset should carry a provider-ready URL`);
  if (!mapped.request.assets.every((asset) => /semanticRole=/.test(asset.description || ""))) {
    issues.push(`${label}: every asset should carry semanticRole in provider description`);
  }
  if (!mapped.request.assets.every((asset) => /fusion=/.test(asset.description || ""))) {
    issues.push(`${label}: every asset should carry fusion strategy in provider description`);
  }
  if (mode !== "poster") {
    requireExcludes(mapped.request.prompt, "Integrated Game Campaign KV Task", label);
    requireExcludes(mapped.request.prompt, "Poster Quality Bar", label);
    requireExcludes(mapped.request.prompt, "Hard KV Exclusions", label);
  }
}

function assertPromptCommon(mode, promptPackage, mapped) {
  const label = `${mode} prompt package`;
  if (!promptPackage.validation.ok) {
    issues.push(`${label}: should validate, got errors: ${promptPackage.validation.errors.join(" ")}`);
  }
  if (promptPackage.finalPrompt.length > 12000) issues.push(`${label}: final prompt exceeds 12000 characters`);
  requireIncludes(promptPackage.finalPrompt, "Mode Asset References", label);
  requireIncludes(promptPackage.finalPrompt, "Mode Guardrails", label);
  assertProviderRequestCommon(mode, mapped);
}

function buildAndMap({ prompts, mapper, snapshot, mode, providerId = "google" }) {
  const promptPackage = prompts.createImagePromptPackage({
    snapshot,
    mode,
    schemeId: `scheme-${mode}-01`,
  });
  const mapped = mapper.mapPromptPackageToProviderRequest({
    promptPackage,
    snapshot,
    providerId,
    kind: "imageGeneration",
    traceId: `trace-multimode-${mode}`,
  });
  assertPromptCommon(mode, promptPackage, mapped);
  return { promptPackage, mapped };
}

async function compileRuntimeModules() {
  const outDir = path.join(root, `.tmp-multimode-regression-${Date.now()}`);
  mkdirSync(outDir, { recursive: true });

  const cleanup = () => {
    const resolved = path.resolve(outDir);
    if (resolved.startsWith(`${path.resolve(root)}${path.sep}`) && path.basename(resolved).startsWith(".tmp-multimode-regression-")) {
      rmSync(resolved, { recursive: true, force: true });
    }
  };

  try {
    const configFile = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
    if (configFile.error) {
      issues.push(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
      return { cleanup };
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
      return { cleanup };
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

    const modulePath = (...parts) => {
      const first = path.join(outDir, ...parts);
      if (existsSync(first)) return first;
      return path.join(outDir, "src", ...parts);
    };

    return {
      cleanup,
      storage: await import(pathToFileURL(modulePath("storage", "mock-snapshot.js")).href),
      prompts: await import(pathToFileURL(modulePath("prompts", "builder.js")).href),
      mapper: await import(pathToFileURL(modulePath("providers", "request-mapper.js")).href),
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}

async function runRuntimeCheck() {
  const runtime = await compileRuntimeModules();
  try {
    if (!runtime.storage || !runtime.prompts || !runtime.mapper) return;

    const baseSnapshot = withProviderReadyMockAssets(runtime.storage.createMockWorkspaceSnapshot());
    const baseAsset = baseSnapshot.assets.find((asset) => asset.role === "gameCharacter") || baseSnapshot.assets[0];
    const modeAssets = [
      createModeAsset(baseAsset, "asset-beta6-game-character", "gameCharacter", "Uploaded playable character", "real protagonist reference"),
      createModeAsset(baseAsset, "asset-beta6-game-logo", "gameLogo", "Uploaded game logo", "real game logo reference"),
      createModeAsset(baseAsset, "asset-beta6-boss", "prop", "Uploaded BOSS monster", "real antagonist/BOSS reference"),
      createModeAsset(baseAsset, "asset-beta6-icon-subject", "subjectReference", "Uploaded icon subject", "real icon primary subject"),
      createModeAsset(baseAsset, "asset-beta6-announcement-ui", "uiScreenshot", "Uploaded announcement UI", "real UI layout reference"),
      createModeAsset(baseAsset, "asset-beta6-collab-partner", "collabCharacter", "Synthetic collab partner", "synthetic partner mascot reference"),
    ];
    const snapshot = {
      ...baseSnapshot,
      assets: [...baseSnapshot.assets, ...modeAssets],
    };

    const poster = buildAndMap({ prompts: runtime.prompts, mapper: runtime.mapper, snapshot, mode: "poster" });
    requireIncludes(poster.mapped.request.prompt, "Integrated Game Campaign KV Task", "poster provider request");
    requireIncludes(poster.mapped.request.prompt, "Default pipeline: AI integrated redraw", "poster provider request");
    requireIncludes(poster.mapped.request.prompt, "BOSS performance lock", "poster provider request");
    requireIncludes(poster.mapped.request.prompt, "Contact and occlusion audit", "poster provider request");
    requireIncludes(poster.mapped.request.prompt, "Slogan visibility requirement", "poster provider request");
    requireExcludes(poster.mapped.request.prompt, "Identity-Safe Game Campaign KV Plate", "poster provider request");
    requireExcludes(poster.mapped.request.prompt, "SCENE PLATE only", "poster provider request");
    if (!poster.mapped.request.assets.some((asset) => /semanticRole=antagonist/.test(asset.description || ""))) {
      issues.push("poster provider request: uploaded BOSS should be marked semanticRole=antagonist");
    }

    const icon = buildAndMap({ prompts: runtime.prompts, mapper: runtime.mapper, snapshot, mode: "icon" });
    requireIncludes(icon.mapped.request.prompt, "Icon quality target", "icon provider request");
    requireIncludes(icon.mapped.request.prompt, "one single dominant subject", "icon provider request");
    requireIncludes(icon.mapped.request.prompt, "readable at 64px", "icon provider request");
    requireIncludes(icon.mapped.request.prompt, "ABSOLUTELY NO TEXT", "icon provider request");
    requireIncludes(icon.mapped.request.prompt, "no poster scene complexity", "icon provider request");
    requireExcludes(icon.mapped.request.prompt, "Slogan mode is active", "icon provider request");
    if (icon.mapped.request.aspectRatio !== "1:1" || icon.mapped.request.width !== 1024 || icon.mapped.request.height !== 1024) {
      issues.push("icon provider request: expected 1:1 1024x1024 output");
    }

    const logo = buildAndMap({ prompts: runtime.prompts, mapper: runtime.mapper, snapshot, mode: "logo" });
    requireIncludes(logo.mapped.request.prompt, "COPY-SAFE BLANK WORDMARK ENFORCEMENT", "logo provider request");
    requireIncludes(logo.mapped.request.prompt, "polished blank wordmark plate", "logo provider request");
    requireIncludes(logo.mapped.request.prompt, "pure solid-color background", "logo provider request");
    requireIncludes(logo.mapped.request.prompt, "do not render readable letters", "logo provider request");
    requireNoRegex(logo.mapped.request.prompt, /\b(Pizza|Kitchen|Adventures)\b/i, "logo provider request");
    requireNoRegex(logo.mapped.request.prompt, /readable wordmark|lettering rhythm|letter rhythm/i, "logo provider request");
    if (logo.mapped.request.assets.some((asset) =>
      /readable wordmark|lettering rhythm|letter rhythm|readable brand rhythm/i.test(asset.description || ""))) {
      issues.push("logo provider request: copy-safe asset descriptions should not contain readable-lettering cues");
    }

    const announcement = buildAndMap({ prompts: runtime.prompts, mapper: runtime.mapper, snapshot, mode: "announcement" });
    requireIncludes(announcement.mapped.request.prompt, "Announcement quality target", "announcement provider request");
    requireIncludes(announcement.mapped.request.prompt, "Announcement Copy Safety Strategy", "announcement provider request");
    requireIncludes(announcement.mapped.request.prompt, "editable copy-safe panel", "announcement provider request");
    requireIncludes(announcement.mapped.request.prompt, "do not cover the headline/copy zone", "announcement provider request");
    requireIncludes(announcement.mapped.request.prompt, "blank text fields", "announcement provider request");
    requireExcludes(announcement.mapped.request.prompt, "Integrated Game Campaign KV Task", "announcement provider request");

    const collab = buildAndMap({ prompts: runtime.prompts, mapper: runtime.mapper, snapshot, mode: "collab" });
    requireIncludes(collab.mapped.request.prompt, "Collab quality target", "collab provider request");
    requireIncludes(collab.mapped.request.prompt, "Collab Brand Safety Strategy", "collab provider request");
    requireIncludes(collab.mapped.request.prompt, "blankPartnerBrandPlate", "collab provider request");
    requireIncludes(collab.mapped.request.prompt, "[Game Character]", "collab provider request");
    requireIncludes(collab.mapped.request.prompt, "[Collab Partner]", "collab provider request");
    requireIncludes(collab.mapped.request.prompt, "do not merge characters", "collab provider request");
    requireIncludes(collab.mapped.request.prompt, "do not generate readable partner names", "collab provider request");
    requireExcludes(collab.mapped.request.prompt, "uploadedPartnerBrandLockup", "collab provider request without partner brandLogo");
    if (!collab.mapped.request.assets.some((asset) => asset.role === "collabCharacter" && /independentCharacterIndex=/.test(asset.description || ""))) {
      issues.push("collab provider request: collabCharacter should carry an independent character index");
    }

    const partnerBrandSnapshot = {
      ...snapshot,
      assets: [
        ...snapshot.assets,
        createModeAsset(baseAsset, "asset-beta6-partner-brand-logo", "brandLogo", "Uploaded partner brand logo", "real partner brand logo reference"),
      ],
    };
    const collabWithPartnerLogo = buildAndMap({
      prompts: runtime.prompts,
      mapper: runtime.mapper,
      snapshot: partnerBrandSnapshot,
      mode: "collab",
    });
    requireIncludes(collabWithPartnerLogo.mapped.request.prompt, "uploadedPartnerBrandLockup", "collab provider request with partner brandLogo");
    requireExcludes(collabWithPartnerLogo.mapped.request.prompt, "blankPartnerBrandPlate", "collab provider request with partner brandLogo");
    if (!collabWithPartnerLogo.mapped.request.assets.some((asset) => asset.role === "brandLogo")) {
      issues.push("collab provider request with partner brandLogo: should bind uploaded partner brandLogo");
    }
  } finally {
    runtime.cleanup?.();
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Multimode regression checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Multimode regression checks passed.");
