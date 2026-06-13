import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const issues = [];
const root = process.cwd();

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required provider request mapper file`);
    return "";
  }
}

const mapper = read("src/providers/request-mapper.ts");
const barrel = read("src/providers/index.ts");

for (const token of [
  "ProviderRequestMapperInputSchema",
  "ProviderMappedRequestSchema",
  "mapPromptPackageToProviderRequest",
  "mapPromptPackageToBriefRequest",
  "mapPromptPackageToImageRequest",
  "BriefGenerationRequestSchema",
  "ImageGenerationRequestSchema",
  "PromptPackageSchema",
  "WorkspaceSnapshotSchema",
  "ProviderAssetReferenceSchema",
  "resolveProviderModel",
]) {
  if (!mapper.includes(token)) issues.push(`request-mapper.ts: missing ${token}`);
}

for (const token of [
  "mapPromptPackageToProviderRequest",
  "mapPromptPackageToBriefRequest",
  "mapPromptPackageToImageRequest",
  "ProviderMappedRequestSchema",
]) {
  if (!barrel.includes(token)) issues.push(`providers/index.ts: missing request mapper export ${token}`);
}

for (const forbidden of [
  "fetch(",
  "XMLHttpRequest",
  "axios",
  "generateImage(",
  "editImage(",
  "upscale(",
  "removeBackground(",
  "healthCheck(",
  "localStorage",
  "sessionStorage",
  "writeFile",
  "readFile",
  "api.openai.com",
]) {
  if (mapper.includes(forbidden)) {
    issues.push(`request-mapper.ts: mapper must not perform provider, network, DOM, or persistence side effects (${forbidden})`);
  }
}

if (!mapper.includes("modeGuardrails(input.promptPackage.mode)")) {
  issues.push("request-mapper.ts: mapped provider requests must include provider mode guardrails");
}

if (!mapper.includes("modelSlots[parsedSlot]")) {
  issues.push("request-mapper.ts: model resolution must check provider model slot overrides");
}

if (!mapper.includes("input.promptPackage.finalPrompt")) {
  issues.push("request-mapper.ts: image requests must use prompt package finalPrompt");
}

for (const token of ["isProviderSafeAssetUrl", "assertPromptPackageReadyForProvider", "binding.url", "providerReady"]) {
  if (!mapper.includes(token)) issues.push(`request-mapper.ts: missing asset URL safety token ${token}`);
}

for (const token of [
  "assetSemanticRole",
  "assetFusionStrategy",
  "modeAssetFusionDirective",
  "redactLogoCopySafeWordmarkPrompt",
  "COPY-SAFE BLANK WORDMARK ENFORCEMENT",
  "LOGO_COPY_SAFE_VISUAL_TOKEN_REPLACEMENTS",
  "word fragments are intentionally redacted",
  "shouldUsePosterScenePlateFallback",
  "providerImagePromptMaxChars",
  "providerImageAssetsForRequest",
  "AI integrated redraw",
  "StyleReference and compositionReference are guide-only inputs",
  "Style reference handling",
  "Composition reference handling",
  "Non-Negotiable Poster Visual Contract",
  "Non-Negotiable Collab Dual-Subject Contract",
  "Pre-render checklist",
  "BOSS anchor requirement",
  "Slogan anchor requirement",
  "isExampleAssetUrl",
  "demo placeholder URLs",
  "re-uploaded",
]) {
  if (!mapper.includes(token)) issues.push(`request-mapper.ts: missing integrated redraw semantic token ${token}`);
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

function withPosterSloganMode(snapshot, mode = "auto") {
  return {
    ...snapshot,
    modeStates: snapshot.modeStates.map((modeState) => modeState.mode === "poster"
      ? {
        ...modeState,
        sloganSettings: {
          ...(modeState.sloganSettings || {}),
          mode,
          languages: ["en-US"],
        },
      }
      : modeState),
  };
}

async function runRuntimeCheck() {
  const outDir = path.join(root, `.tmp-provider-request-check-${Date.now()}`);
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

    const storageModulePath = existsSync(path.join(outDir, "storage", "mock-snapshot.js"))
      ? path.join(outDir, "storage", "mock-snapshot.js")
      : path.join(outDir, "src", "storage", "mock-snapshot.js");
    const promptModulePath = existsSync(path.join(outDir, "prompts", "builder.js"))
      ? path.join(outDir, "prompts", "builder.js")
      : path.join(outDir, "src", "prompts", "builder.js");
    const mapperModulePath = existsSync(path.join(outDir, "providers", "request-mapper.js"))
      ? path.join(outDir, "providers", "request-mapper.js")
      : path.join(outDir, "src", "providers", "request-mapper.js");

    const storage = await import(pathToFileURL(storageModulePath).href);
    const prompts = await import(pathToFileURL(promptModulePath).href);
    const mapperModule = await import(pathToFileURL(mapperModulePath).href);

    const snapshot = withPosterSloganMode(withProviderReadyMockAssets(storage.createMockWorkspaceSnapshot()));
    const imagePrompt = prompts.createImagePromptPackage({
      snapshot,
      mode: "poster",
      schemeId: "scheme-poster-01",
    });

    if (!imagePrompt.validation.ok) issues.push("poster image prompt should validate when required asset URLs are present");
    if (!imagePrompt.finalPrompt.includes("Mode Asset References")) {
      issues.push("image prompt should include a mode asset inventory section");
    }
    if (!imagePrompt.assets.every((asset) => asset.url && asset.providerReady)) {
      issues.push("prompt asset bindings should carry provider-ready committed URLs");
    }

    const mapped = mapperModule.mapPromptPackageToProviderRequest({
      promptPackage: imagePrompt,
      snapshot,
      providerId: "openai",
      kind: "imageGeneration",
      traceId: "trace-provider-request-check",
    });
    if (!mapped.request.assets.every((asset) => asset.url && !asset.url.includes("example.com"))) {
      issues.push("provider image request should receive real provider-ready asset URLs, not example placeholders");
    }
    if (!mapped.request.assets.some((asset) => asset.role === "compositionReference")) {
      issues.push("poster image request should send uploaded compositionReference as a guide image asset");
    }
    if (!mapped.request.prompt.includes("Default pipeline: AI integrated redraw")) {
      issues.push("poster image request should default to AI integrated redraw");
    }
    if (!mapped.request.prompt.includes("StyleReference and compositionReference are guide-only inputs")) {
      issues.push("poster image request should state that style/composition references are guide-only");
    }
    if (!mapped.request.prompt.includes("Composition reference handling: the uploaded compositionReference is a visual guide only")) {
      issues.push("poster image request should preserve uploaded composition reference as a visual guide without copying its content");
    }
	    if (mapped.request.prompt.length > 18000) {
	      issues.push("openai poster image request should stay inside the provider-neutral prompt budget");
	    }
    if (!mapped.request.prompt.includes("Uploaded Asset Role Semantics and Fusion Strategies")) {
      issues.push("poster image request should include semantic asset fusion strategies");
    }
    const pixelStyleSnapshot = {
      ...snapshot,
      modeStates: snapshot.modeStates.map((modeState) => modeState.mode === "poster"
        ? {
          ...modeState,
          modeForm: {
            ...modeState.modeForm,
            styleTags: ["像素复古"],
          },
        }
        : modeState),
    };
    const pixelStylePrompt = prompts.createImagePromptPackage({
      snapshot: pixelStyleSnapshot,
      mode: "poster",
      schemeId: "scheme-poster-01",
    });
    const pixelStyleMapped = mapperModule.mapPromptPackageToProviderRequest({
      promptPackage: pixelStylePrompt,
      snapshot: pixelStyleSnapshot,
      providerId: "openai",
      kind: "imageGeneration",
      traceId: "trace-provider-request-pixel-style-check",
    });
    if (!pixelStylePrompt.finalPrompt.includes("retro pixel art / arcade pixel key art")) {
      issues.push("selected pixel style should be expanded into the prompt package style lock");
    }
    if (!pixelStyleMapped.request.prompt.includes("crisp square pixels") || !pixelStyleMapped.request.prompt.includes("Do not render smooth 3D")) {
      issues.push("selected pixel style should survive provider image request mapping as a hard rendering lock");
    }
    const agnesMapped = mapperModule.mapPromptPackageToProviderRequest({
      promptPackage: imagePrompt,
      snapshot,
      providerId: "agnes",
      kind: "imageGeneration",
      traceId: "trace-provider-request-agnes-profile-check",
    });
	    if (agnesMapped.request.prompt.length > 12000) {
	      issues.push("agnes poster image request should use the provider image capability promptMaxChars profile");
	    }
    if (!agnesMapped.request.prompt.includes("Default pipeline: AI integrated redraw")) {
      issues.push("agnes provider profile must not replace the shared integrated redraw Poster logic");
    }
    if (!agnesMapped.request.assets.every((asset) => asset.url && !asset.url.includes("example.com"))) {
      issues.push("agnes poster image request should retain provider-ready visual reference URLs for extra_body.image");
    }
    if (!agnesMapped.request.assets.some((asset) => asset.role === "compositionReference")) {
      issues.push("agnes poster image request should send uploaded compositionReference as a guide image asset");
    }
    if (!agnesMapped.request.assets.some((asset) => /semanticRole=protagonist/.test(asset.description || ""))) {
      issues.push("agnes poster image request should keep uploaded protagonist semantic reference");
    }
    for (const priorityToken of [
      "The uploaded subjects and brand elements must look repainted into the same scene",
      "Set-piece and action requirement",
      "Contact and occlusion audit",
      "Subject scale and weight requirement",
      "Placeholder annotation rule",
      "Scheme text sanitation rule",
      "Selected Scheme",
      "Reference pose release",
      "BOSS performance lock",
      "Static scheme action rewrite",
      "Focal hierarchy lock",
      "Text economy lock",
      "In-world brand treatment lock",
      "Hero performance scale lock",
      "Logo single-use lock",
      "Uploaded subject accessory lock",
      "Allocate one readable campaign-safe logo treatment",
      "do not invent look-alike words",
      "Slogan visibility requirement",
      "Non-Negotiable Poster Visual Contract",
      "Pre-render checklist",
      "Selected-scheme architecture lock",
      "Slogan anchor requirement",
      "large secondary campaign object",
      "Single-use typography requirement",
      "scene-derived",
      "No duplicate uploaded asset",
      "KV ACTION MINI-BRIEF",
      "REFERENCE PANEL BAN",
      "No copied reference image",
      "Selected Scheme Visual Difference Contract",
      "Layout uniqueness rule",
      "Final selected-scheme diversity audit",
      "Selected Scheme Execution Blueprint",
      "mandatory visual direction",
      "Slogan/logo text cannot be the only evidence",
      "Detailed-plan compliance audit",
      "changing only the slogan words is a failure",
    ]) {
      if (!mapped.request.prompt.includes(priorityToken)) {
        issues.push(`poster image request should keep priority integrated-redraw rule before prompt truncation: ${priorityToken}`);
      }
    }
    if (mapped.request.prompt.includes("Identity-Safe Game Campaign KV Plate") || mapped.request.prompt.includes("SCENE PLATE only")) {
      issues.push("poster image request must not default to identity-safe scene plate generation");
    }

    const longSchemeSnapshot = {
      ...snapshot,
      schemes: snapshot.schemes.map((scheme) => scheme.id === "scheme-poster-01"
        ? {
          ...scheme,
          brief: `${scheme.brief}\n[Game Character 1]（保持其面部、发型、服装、武器和盾牌）手持其标志性的面包武器/盾牌冲向[Boss]。`.slice(0, 1200),
          promptBlocks: [
            ...scheme.promptBlocks,
            ...Array.from({ length: 12 }, (_, index) => ({
              title: `超长方案噪声 ${index + 1}`,
              text: `${"[Game Character 1]（保持其面部、发型、服装、武器和盾牌）手持其标志性的面包武器/盾牌。"} ${"FILLER cinematic detail. ".repeat(38)}`.slice(0, 1200),
            })),
          ],
        }
        : scheme),
    };
    const longPrompt = prompts.createImagePromptPackage({
      snapshot: longSchemeSnapshot,
      mode: "poster",
      schemeId: "scheme-poster-01",
    });
    const longMapped = mapperModule.mapPromptPackageToProviderRequest({
      promptPackage: longPrompt,
      snapshot: longSchemeSnapshot,
      providerId: "openai",
      kind: "imageGeneration",
      traceId: "trace-provider-request-long-check",
    });
	    if (longMapped.request.prompt.length > 18000) {
	      issues.push("poster image request should keep provider prompt within the 18000 character contract");
	    }
    for (const retainedToken of [
      "Mode Guardrails",
      "Hard KV Exclusions",
      "Selected Scheme",
      "Scheme text sanitation rule",
      "Contact and occlusion audit",
      "Slogan visibility requirement",
      "Non-Negotiable Poster Visual Contract",
      "Pre-render checklist",
      "large secondary campaign object",
      "scene-derived",
      "Selected Scheme Visual Difference Contract",
      "Final selected-scheme diversity audit",
      "Selected Scheme Execution Blueprint",
      "Detailed-plan compliance audit",
    ]) {
      if (!longMapped.request.prompt.includes(retainedToken)) {
        issues.push(`poster image request should preserve ${retainedToken} even with long scheme text`);
      }
    }
    for (const sanitizedToken of ["保持其面部", "面包武器/盾牌"]) {
      if (longMapped.request.prompt.includes(sanitizedToken)) {
        issues.push(`poster image request should demote placeholder appearance text before provider mapping: ${sanitizedToken}`);
      }
    }

    const blueprintSnapshot = {
      ...snapshot,
      schemes: snapshot.schemes.map((scheme) => scheme.id === "scheme-poster-01"
        ? {
          ...scheme,
          brief: "Blueprint regression scheme.",
          promptBlocks: [
            {
              title: "KV 主视觉详细策划",
              text: "posterPromise: Moonlit coin-conveyor pizzeria management fantasy. userClickReason: the player sees idle coins becoming toppings. visual hook: glowing coin rain spirals into a pizza oven conveyor. setting/format: night-market kitchen counter with VIP order cards and visible conveyor belt. camera grammar: low 24mm counter-level push-in with foreground coins leading into the oven.",
            },
          ],
        }
        : scheme),
    };
    const blueprintPrompt = prompts.createImagePromptPackage({
      snapshot: blueprintSnapshot,
      mode: "poster",
      schemeId: "scheme-poster-01",
    });
    const blueprintMapped = mapperModule.mapPromptPackageToProviderRequest({
      promptPackage: blueprintPrompt,
      snapshot: blueprintSnapshot,
      providerId: "openai",
      kind: "imageGeneration",
      traceId: "trace-provider-request-blueprint-check",
    });
    for (const blueprintToken of [
      "Selected Scheme Execution Blueprint",
      "Moonlit coin-conveyor",
      "glowing coin rain",
      "night-market kitchen counter",
      "low 24mm counter-level",
      "Slogan/logo text cannot be the only evidence",
    ]) {
      if (!blueprintMapped.request.prompt.includes(blueprintToken)) {
        issues.push(`poster image request should turn KV detailed planning into render blueprint: ${blueprintToken}`);
      }
    }

    const blobSnapshot = {
      ...snapshot,
      assets: snapshot.assets.map((asset) =>
        asset.role === "gameLogo" ? { ...asset, previewUrl: "blob:http://localhost/logo" } : asset,
      ),
    };
    const blobPrompt = prompts.createImagePromptPackage({
      snapshot: blobSnapshot,
      mode: "poster",
      schemeId: "scheme-poster-01",
    });
    if (!blobPrompt.validation.ok) {
      issues.push("browser-only optional poster logo assets should not block image prompt validation");
    }
    try {
      mapperModule.mapPromptPackageToProviderRequest({
        promptPackage: blobPrompt,
        snapshot: blobSnapshot,
        providerId: "openai",
        kind: "imageGeneration",
      });
    } catch (error) {
      issues.push(`provider mapper should allow optional blob-only poster logo references, received ${error instanceof Error ? error.message : "error"}`);
    }

    const missingSnapshot = {
      ...snapshot,
      assets: snapshot.assets.filter((asset) => asset.role !== "gameLogo"),
    };
    const missingPrompt = prompts.createImagePromptPackage({
      snapshot: missingSnapshot,
      mode: "poster",
      schemeId: "scheme-poster-01",
    });
    if (!missingPrompt.validation.ok || missingPrompt.validation.errors.some((error) => error.includes("gameLogo"))) {
      issues.push("missing optional poster logo should not be reported as an image prompt validation error");
    }

    const baseAsset = snapshot.assets.find((asset) => asset.role === "gameCharacter");
    const now = "2026-05-29T00:00:00.000Z";
    const userAssetSnapshot = {
      ...snapshot,
      assets: [
        ...snapshot.assets,
        {
          ...baseAsset,
          id: "asset-user-character",
          role: "gameCharacter",
          label: "角色",
          metadata: {},
          previewUrl: "http://localhost:3000/uploads/workspaces/check/character.png",
          storageKey: "projects/project-pizza-kitchen/assets/gameCharacter/asset-user-character.png",
          createdAt: now,
          updatedAt: now,
        },
        {
          ...baseAsset,
          id: "asset-user-logo",
          role: "gameLogo",
          label: "LOGO",
          metadata: {},
          previewUrl: "http://localhost:3000/uploads/workspaces/check/logo.png",
          storageKey: "projects/project-pizza-kitchen/assets/gameLogo/asset-user-logo.png",
          createdAt: now,
          updatedAt: now,
        },
        {
          ...baseAsset,
          id: "asset-user-boss",
          role: "prop",
          label: "BOSS",
          metadata: {},
          previewUrl: "http://localhost:3000/uploads/workspaces/check/boss.png",
          storageKey: "projects/project-pizza-kitchen/assets/prop/asset-user-boss.png",
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    const userAssetPrompt = prompts.createImagePromptPackage({
      snapshot: userAssetSnapshot,
      mode: "poster",
      schemeId: "scheme-poster-01",
    });
    const userAssetIds = userAssetPrompt.assets.map((asset) => asset.assetId);
    for (const expected of ["asset-user-character", "asset-user-logo", "asset-user-boss"]) {
      if (!userAssetIds.includes(expected)) issues.push(`poster prompt should bind uploaded ${expected}`);
    }
    for (const demoId of ["asset-game-character", "asset-game-logo", "asset-poster-composition"]) {
      if (userAssetIds.includes(demoId)) issues.push(`poster prompt should not mix demo asset ${demoId} when user uploads real references`);
    }
    if (!userAssetPrompt.finalPrompt.includes("uploaded BOSS")) {
      issues.push("poster prompt should hard-require the uploaded BOSS asset");
    }
    const userMapped = mapperModule.mapPromptPackageToProviderRequest({
      promptPackage: userAssetPrompt,
      snapshot: userAssetSnapshot,
      providerId: "google",
      kind: "imageGeneration",
    });
    if (!userMapped.request.assets.some((asset) => asset.role === "prop" && /BOSS/i.test(asset.description || ""))) {
      issues.push("provider image request should carry the uploaded BOSS reference constraint");
    }
    if (!userMapped.request.assets.some((asset) => /semanticRole=protagonist/.test(asset.description || ""))) {
      issues.push("provider image request should mark uploaded characters with protagonist semantic role");
    }
    if (!userMapped.request.assets.some((asset) => /semanticRole=antagonist/.test(asset.description || ""))) {
      issues.push("provider image request should mark uploaded BOSS/key subjects with antagonist semantic role");
    }
    if (!userMapped.request.assets.some((asset) => /semanticRole=brandLogo/.test(asset.description || ""))) {
      issues.push("provider image request should mark uploaded logos with brandLogo semantic role");
    }
    if (!userMapped.request.prompt.includes("Default pipeline: AI integrated redraw")) {
      issues.push("user-asset poster request should use AI integrated redraw by default");
    }
    if (!userMapped.request.prompt.includes("BOSS anchor requirement")) {
      issues.push("user-asset poster request should make uploaded BOSS a non-negotiable visual anchor");
    }
    const userAgnesMapped = mapperModule.mapPromptPackageToProviderRequest({
      promptPackage: userAssetPrompt,
      snapshot: userAssetSnapshot,
      providerId: "agnes",
      kind: "imageGeneration",
    });
    if (!userAgnesMapped.request.assets.every((asset) => asset.url && !asset.url.includes("example.com"))) {
      issues.push("agnes user-asset poster request should retain provider-ready visual reference URLs for extra_body.image");
    }
    if (!userAgnesMapped.request.assets.some((asset) => /semanticRole=protagonist/.test(asset.description || ""))) {
      issues.push("agnes user-asset poster request should keep uploaded protagonist semantic reference");
    }
    if (!userAgnesMapped.request.assets.some((asset) => /semanticRole=antagonist/.test(asset.description || ""))) {
      issues.push("agnes user-asset poster request should keep uploaded BOSS/threat semantic reference");
    }
    if (userMapped.request.prompt.includes("Identity-Safe Game Campaign KV Plate") || userMapped.request.prompt.includes("SCENE PLATE only")) {
      issues.push("user-asset poster request should not use scene-plate fallback unless explicitly forced");
    }
    if (!userAssetPrompt.finalPrompt.includes("Active style source: uploaded character asset art style")) {
      issues.push("poster prompt should default to uploaded character asset style when no style tag or style reference exists");
    }

    const multiCharacterSnapshot = {
      ...userAssetSnapshot,
      assets: [
        ...userAssetSnapshot.assets.filter((asset) => asset.role !== "gameCharacter"),
        {
          ...baseAsset,
          id: "asset-user-character-a",
          role: "gameCharacter",
          label: "瑙掕壊",
          metadata: { originalFileName: "hero-a.png" },
          previewUrl: "http://localhost:3000/uploads/workspaces/check/hero-a.png",
          storageKey: "projects/project-pizza-kitchen/assets/gameCharacter/asset-user-character-a.png",
          checksum: "sha256-hero-a",
          byteSize: 111000,
          createdAt: now,
          updatedAt: now,
        },
        {
          ...baseAsset,
          id: "asset-user-character-b",
          role: "gameCharacter",
          label: "瑙掕壊",
          metadata: { originalFileName: "hero-b.png" },
          previewUrl: "http://localhost:3000/uploads/workspaces/check/hero-b.png",
          storageKey: "projects/project-pizza-kitchen/assets/gameCharacter/asset-user-character-b.png",
          checksum: "sha256-hero-b",
          byteSize: 222000,
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    const multiCharacterPrompt = prompts.createImagePromptPackage({
      snapshot: multiCharacterSnapshot,
      mode: "poster",
      schemeId: "scheme-poster-01",
    });
    const multiCharacterIds = multiCharacterPrompt.assets
      .filter((asset) => asset.role === "gameCharacter")
      .map((asset) => asset.assetId);
    for (const expected of ["asset-user-character-a", "asset-user-character-b"]) {
      if (!multiCharacterIds.includes(expected)) {
        issues.push(`poster prompt should preserve same-slot multi-character asset ${expected}`);
      }
    }
    if (multiCharacterIds.length !== 2) {
      issues.push(`poster prompt should keep exactly two distinct uploaded gameCharacter assets with the same label, found ${multiCharacterIds.length}`);
    }
    const multiCharacterPlaceholders = multiCharacterPrompt.assets
      .filter((asset) => asset.role === "gameCharacter")
      .map((asset) => asset.placeholder);
    if (!multiCharacterPlaceholders.includes("[Game Character 1]")
      || !multiCharacterPlaceholders.includes("[Game Character 2]")) {
      issues.push("poster prompt should assign numbered placeholders to both uploaded gameCharacter assets");
    }
    if (!multiCharacterPrompt.negativePrompt.includes("No extra arms")) {
      issues.push("poster prompt negative prompt should include limb and hand sanity exclusions");
    }
    const multiCharacterMapped = mapperModule.mapPromptPackageToProviderRequest({
      promptPackage: multiCharacterPrompt,
      snapshot: multiCharacterSnapshot,
      providerId: "google",
      kind: "imageGeneration",
    });
    const providerCharacterIds = multiCharacterMapped.request.assets
      .filter((asset) => /semanticRole=protagonist/.test(asset.description || ""))
      .map((asset) => asset.id);
    for (const expected of ["asset-user-character-a", "asset-user-character-b"]) {
      if (!providerCharacterIds.includes(expected)) {
        issues.push(`provider image request should carry same-slot multi-character reference ${expected}`);
      }
    }
    if (!multiCharacterMapped.request.prompt.includes("Multi-character hero requirement")
      || !multiCharacterMapped.request.prompt.includes("Limb and hand sanity audit")
      || !multiCharacterMapped.request.prompt.includes("Pose clarity lock")
      || !multiCharacterMapped.request.prompt.includes("prop-as-limb silhouette")) {
      issues.push("provider image request should include multi-character and limb sanity prompt locks");
    }

    const selectedStyleSnapshot = JSON.parse(JSON.stringify(userAssetSnapshot));
    selectedStyleSnapshot.modeStates = selectedStyleSnapshot.modeStates.map((modeState) =>
      modeState.mode === "poster"
        ? {
            ...modeState,
            modeForm: {
              ...modeState.modeForm,
              styleTags: ["美式卡通"],
            },
          }
        : modeState,
    );
    const selectedStylePrompt = prompts.createImagePromptPackage({
      snapshot: selectedStyleSnapshot,
      mode: "poster",
      schemeId: "scheme-poster-01",
    });
    if (!selectedStylePrompt.finalPrompt.includes('Active style source: selected style tag "美式卡通"')) {
      issues.push("poster prompt should use the manually selected style tag when no style reference image exists");
    }

    const styleReferenceSnapshot = JSON.parse(JSON.stringify(selectedStyleSnapshot));
    styleReferenceSnapshot.assets.push({
      ...baseAsset,
      id: "asset-user-style-reference",
      role: "styleReference",
      label: "画风参考",
      metadata: {},
      previewUrl: "http://localhost:3000/uploads/workspaces/check/style.png",
      storageKey: "projects/project-pizza-kitchen/assets/styleReference/asset-user-style-reference.png",
      createdAt: now,
      updatedAt: now,
    });
    const styleReferencePrompt = prompts.createImagePromptPackage({
      snapshot: styleReferenceSnapshot,
      mode: "poster",
      schemeId: "scheme-poster-01",
    });
    if (!styleReferencePrompt.finalPrompt.includes("Active style source: uploaded style reference image")) {
      issues.push("poster prompt should prioritize uploaded style reference images over style tags");
    }
    if (!styleReferencePrompt.finalPrompt.includes('Selected style tag "美式卡通" is secondary')) {
      issues.push("poster prompt should demote selected style tag when a style reference image is present");
    }
    const styleReferenceMapped = mapperModule.mapPromptPackageToProviderRequest({
      promptPackage: styleReferencePrompt,
      snapshot: styleReferenceSnapshot,
      providerId: "google",
      kind: "imageGeneration",
    });
    if (!styleReferenceMapped.request.assets.some((asset) => asset.role === "styleReference")) {
      issues.push("provider image request should include uploaded style reference as a guide image input");
    }
    if (!styleReferenceMapped.request.prompt.includes("Style reference handling: the uploaded styleReference is a visual guide only")) {
      issues.push("provider image request should preserve uploaded style reference as a visual guide without copying its content");
    }

    const createModeAsset = (asset, id, role, label) => ({
      ...asset,
      id,
      role,
      label,
      metadata: {},
      previewUrl: `http://localhost:3000/uploads/workspaces/check/${id}.png`,
      storageKey: `projects/project-pizza-kitchen/assets/${role}/${id}.png`,
      createdAt: now,
      updatedAt: now,
    });
    const modeBaseAsset = baseAsset || snapshot.assets[0];
    const multimodeSnapshot = {
      ...snapshot,
      assets: [
        ...snapshot.assets,
        createModeAsset(modeBaseAsset, "asset-collab-partner", "collabCharacter", "Collab partner"),
        createModeAsset(modeBaseAsset, "asset-icon-subject", "subjectReference", "Icon subject"),
        createModeAsset(modeBaseAsset, "asset-announcement-ui", "uiScreenshot", "Announcement UI"),
      ],
    };
    const multimodeExpectations = {
      icon: [
        "Mode Quality Bar",
        "Icon quality target",
        "single dominant subject",
        "readable at 64px",
        "ABSOLUTELY NO TEXT",
        "no poster scene complexity",
        "Default pipeline: AI integrated redraw",
	      ],
	      logo: [
	        "Logo mode isolation",
	        "uploaded logo reference is present",
	        "primary brand redesign source",
	        "Uploaded-logo redraw lock",
	        "uploadedLogoReferenceRedraw",
	        "not a blank generic plaque",
      ],
      announcement: [
        "Game Announcement Card Task",
        "large calm editable copy area",
        "natural UI panel",
        "Keep the copy area intentionally blank",
        "small blank decorative brand badge",
        "No character squads",
        "blank editable copy zone",
        "No readable generated text",
      ],
      collab: [
        "Mode Quality Bar",
        "Collab quality target",
        "Non-Negotiable Collab Dual-Subject Contract",
        "Partner-first co-star lock",
        "Two-character audit",
        "Shared-scene integration",
        "Collab Brand Safety Strategy",
        "blankPartnerBrandPlate",
        "[Game Character]",
        "[Collab Partner]",
        "must remain separate visible entities",
        "The image fails if the two sides",
        "do not merge characters",
        "Collab target: separate identities and logos",
      ],
    };
    for (const [mode, expectedTokens] of Object.entries(multimodeExpectations)) {
      const prompt = prompts.createImagePromptPackage({
        snapshot: multimodeSnapshot,
        mode,
        schemeId: `scheme-${mode}-01`,
      });
      if (!prompt.validation.ok) {
        issues.push(`${mode} image prompt should validate with mode-appropriate reference assets: ${prompt.validation.errors.join(" ")}`);
      }
      const mappedMode = mapperModule.mapPromptPackageToProviderRequest({
        promptPackage: prompt,
        snapshot: multimodeSnapshot,
        providerId: "google",
        kind: "imageGeneration",
      });
      for (const token of expectedTokens) {
        if (!mappedMode.request.prompt.includes(token)) {
          issues.push(`${mode} mapped image prompt should include multimode quality token: ${token}`);
        }
      }
      if (!mappedMode.request.assets.every((asset) => /fusion=/.test(asset.description || ""))) {
        issues.push(`${mode} mapped assets should carry semantic fusion descriptions`);
      }
	      if (mappedMode.request.prompt.includes("Poster Quality Bar") && mode !== "poster") {
	        issues.push(`${mode} prompt should not inherit poster-only quality bar`);
	      }
	      if (mode === "logo" && !mappedMode.request.assets.some((asset) => /semanticRole=brandLogo/.test(asset.description || ""))) {
	        issues.push("logo mapped request with uploaded logo should send the logo reference to the image model");
	      }
	      if (mode === "logo" && /Logo Asset Task|blank non-letter title plaque|No readable text anywhere|zero characters/i.test(mappedMode.request.prompt)) {
	        issues.push("logo mapped request with uploaded logo should not fall back to the blank plaque task");
	      }
	    }
  } finally {
    const resolved = path.resolve(outDir);
    if (resolved.startsWith(`${path.resolve(root)}${path.sep}`) && path.basename(resolved).startsWith(".tmp-provider-request-check-")) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Provider request mapper checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Provider request mapper checks passed.");
