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
    issues.push(`${filePath}: missing required Google live adapter file`);
    return "";
  }
}

const adapter = read("src/providers/google-live-adapter.ts");
const providerProfiles = read("src/providers/provider-capability-profiles.ts");
const sloganPolicy = read("src/prompts/slogan-policy.ts");
const barrel = read("src/providers/index.ts");
const manifests = read("src/providers/manifests.ts");
const diagnostics = read("src/providers/connection-diagnostics.ts");
const contracts = read("src/api/contracts.ts");
const queueIndex = read("src/queue/index.ts");
const googleLiveQueue = read("src/queue/google-live-queue.ts");
const providerTransports = read("src/api/provider-image-transports.ts");
const product = read("PRODUCT.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const decisions = read("DECISIONS.md");
const pkg = read("package.json");

for (const token of [
  "GoogleGenerateContentResponseSchema",
  "GoogleImageTransportRequestSchema",
  "createGoogleLiveImageAdapter",
  "createGoogleImageFetchTransport",
  "GOOGLE_GENERATE_CONTENT_METHOD",
  "inlineData",
  "x-goog-api-key",
  "responseModalities",
  "imageConfig",
  "googleAspectRatio",
  "posterAssetSemanticRole",
  "Default pipeline: AI integrated redraw",
  "ReferenceAssetError",
  "requireInlineIntegratedReferences",
  "inline image data unavailable for integrated redraw",
  "Placeholder annotation rule",
  "Reference pose release",
  "BOSS performance lock",
  "Static scheme action rewrite",
  "posterFocalHierarchyLock",
  "posterTextEconomyLock",
  "posterInWorldBrandTreatmentLock",
  "posterHeroPerformanceScaleLock",
  "posterLogoSingleUseLock",
  "posterSubjectAccessoryStrictnessLock",
  "providerCapabilityPromptNote",
  "providerUsesInlineImageReferences",
  "Provider Capability Adapter Contract",
  "Contact and occlusion audit",
  "Subject scale and weight requirement",
  "do not invent look-alike words",
  "do not silently omit the copy treatment",
  "large secondary campaign object",
  "scene-derived",
  "Avoid generic three-part lists",
  "sanitizePosterSchemeText",
  "Icon reference lock",
  "Logo reference lock",
  "Logo Text Strategy lock",
  "polished blank wordmark plate",
  "pseudo-letters",
  "Announcement reference lock",
  "Announcement Copy Safety Strategy lock",
  "polished blank fields",
  "Collab reference lock",
  "Collab Brand Safety Strategy lock",
  "blank partner brand plate",
  "Uploaded subject accessory lock",
  "no invented shield/weapon/tool/accessory",
  "invent partner brand names",
	  "polished blank partner brand plate",
	  "Brand icon rule",
	  "Brand collab rule",
	  "modeBriefPrompt",
	  "Icon mode hard lock",
	  "slogans must be an empty object for icon mode",
	  "normalizeModeBriefSchemes",
	  "BRAND MOTIF REFERENCE",
	  "copy-safe blank wordmark mode",
	  "BRAND MOTIF REFERENCE WITHHELD FOR COPY-SAFE LOGO TEXT",
	  "withholdLogoTextReferences",
	  "referenceUrl=withheld for copy-safe blank wordmark mode",
	]) {
	  if (!adapter.includes(token) && !providerProfiles.includes(token) && !sloganPolicy.includes(token)) issues.push(`google-live-adapter.ts: missing ${token}`);
	}

for (const token of ["id: \"google\"", "gemini-2.5-flash-image", "Google AI Studio"]) {
  if (!manifests.includes(token)) issues.push(`manifests.ts: missing Google manifest token ${token}`);
}

for (const token of ["DEFAULT_GOOGLE_BASE_URL", "x-goog-api-key", "models"]) {
  if (!diagnostics.includes(token)) issues.push(`connection-diagnostics.ts: missing Google diagnostic token ${token}`);
}

for (const token of ["ProviderIdSchema", "providerId: ProviderIdSchema.default(\"openai\")"]) {
  if (!contracts.includes(token)) issues.push(`contracts.ts: missing Google provider token ${token}`);
}

for (const token of ["runGoogleLiveQueue", "transport?: GoogleImageTransport", "createGoogleImageFetchTransport"]) {
  if (!queueIndex.includes(token) && !googleLiveQueue.includes(token) && !providerTransports.includes(token)) {
    issues.push(`Google queue/transport wiring: missing ${token}`);
  }
}

for (const token of ["createGoogleLiveImageAdapter", "createGoogleImageFetchTransport"]) {
  if (!barrel.includes(token)) issues.push(`providers/index.ts: missing Google export ${token}`);
}

for (const [file, source] of [
  ["PRODUCT.md", product],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
]) {
  if (!source.includes("OpenAI-Compatible And Google Provider")) {
    issues.push(`${file}: missing OpenAI-Compatible And Google Provider update`);
  }
}
if (!decisions.includes("D080")) issues.push("DECISIONS.md: missing D080 Google provider decision");
if (!pkg.includes("google-live-adapter:check")) issues.push("package.json: missing google-live-adapter:check script");

for (const forbidden of ["process.env", "localStorage", "sessionStorage", "XMLHttpRequest", "axios"]) {
  if (adapter.includes(forbidden)) {
    issues.push(`Google adapter must not read env, browser storage, or alternate HTTP clients (${forbidden})`);
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

function compiledModulePath(outDir, folder) {
  const direct = path.join(outDir, folder, "index.js");
  if (existsSync(direct)) return direct;
  return path.join(outDir, "src", folder, "index.js");
}

function allowedSafety() {
  return {
    estimatedCost: 0.1,
    maxAcceptedCost: 1,
    confirmations: {
      liveRun: true,
      providerCost: true,
      externalProvider: true,
      resultStorage: true,
    },
  };
}

function withInlineMockAssets(snapshot) {
  const referenceDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axw6OQAAAAASUVORK5CYII=";
  return {
    ...snapshot,
    assets: snapshot.assets.map((asset) => ({
      ...asset,
      metadata: { ...(asset.metadata || {}), mockAsset: true },
      previewUrl: referenceDataUrl,
    })),
  };
}

async function fakePngBase64(width, height) {
  const sharp = (await import("sharp")).default;
  const bytes = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 24, g: 42, b: 68 },
    },
  }).png().toBuffer();
  return bytes.toString("base64");
}

async function runRuntimeCheck() {
  const outDir = path.join(root, `.tmp-google-live-adapter-check-${Date.now()}`);
  const resultRoot = path.join(root, `.tmp-google-live-results-${Date.now()}`);
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

    const providersModulePath = compiledModulePath(outDir, "providers");
    const defaultsModulePath = existsSync(path.join(outDir, "schema", "zod-defaults.js"))
      ? path.join(outDir, "schema", "zod-defaults.js")
      : path.join(outDir, "src", "schema", "zod-defaults.js");

    const providers = await import(pathToFileURL(providersModulePath).href);
    const defaults = await import(pathToFileURL(defaultsModulePath).href);
    const queue = await import(pathToFileURL(compiledModulePath(outDir, "queue")).href);
    const storage = await import(pathToFileURL(compiledModulePath(outDir, "storage")).href);
    const results = await import(pathToFileURL(compiledModulePath(outDir, "results")).href);

    let capturedRequest = null;
    const adapter = providers.createGoogleLiveImageAdapter({
      now: () => 1000,
      transport: async (request) => {
        capturedRequest = request;
        return {
          ok: true,
          status: 200,
          body: {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: "image/png",
                        data: await fakePngBase64(768, 1344),
                      },
                    },
                  ],
                },
              },
            ],
          },
        };
      },
    });

    const config = {
      ...defaults.createProviderConfigDefaults("google"),
      enabled: true,
      apiKey: "GOOGLE_API_KEY_TEST_PLACEHOLDER",
      defaultModel: "gemini-2.5-flash-image",
      modelSlots: {
        image: "gemini-2.5-flash-image",
      },
    };
    const request = providers.ImageGenerationRequestSchema.parse({
      context: {
        projectId: "project-google-live-adapter-check",
        mode: "poster",
        providerId: "google",
        traceId: "trace-google-live-adapter-check",
      },
      schemeId: "scheme-google-poster-01",
      prompt: "Generate a game marketing poster key visual.",
      assets: [],
      platformPreset: "tiktok",
      aspectRatio: "9:16",
      width: 1080,
      height: 1920,
      model: "gemini-2.5-flash-image",
      count: 1,
    });

    const health = await adapter.healthCheck(config);
    if (!health.ok || health.value.status !== "ready") {
      issues.push("Google live adapter health should be ready with config and transport");
    }

    const result = await adapter.generateImage(request, config);
    if (!result.ok) {
      issues.push(`Google inline image response should succeed: ${result.error.code}`);
    } else if (!result.value.assets[0]?.dataUrl?.startsWith("data:image/png;base64,")) {
      issues.push("Google inline image response should become a dataUrl provider asset");
    } else if (result.value.assets[0].width !== 768 || result.value.assets[0].height !== 1344) {
      issues.push("Google inline image response should preserve actual provider image dimensions");
    }

    if (!capturedRequest?.url.includes("/models/gemini-2.5-flash-image:generateContent")) {
      issues.push("Google adapter should call Gemini generateContent for the selected model");
    }
    if (capturedRequest?.headers?.["x-goog-api-key"] !== "GOOGLE_API_KEY_TEST_PLACEHOLDER") {
      issues.push("Google adapter should send API key through x-goog-api-key header");
    }
    if (!capturedRequest?.body?.generationConfig?.responseModalities?.includes("IMAGE")) {
      issues.push("Google adapter should request IMAGE response modality");
    }
    if (capturedRequest?.body?.generationConfig?.imageConfig?.aspectRatio !== "9:16") {
      issues.push("Google adapter should pass the closest supported aspect ratio through imageConfig");
    }
    if (capturedRequest?.body?.generationConfig?.responseFormat) {
      issues.push("Google adapter should not send the rejected responseFormat.image request shape");
    }
    const capturedPrompt = (capturedRequest?.body?.contents?.[0]?.parts || [])
      .map((part) => part?.text || "")
      .filter(Boolean)
      .join("\n");
    if (!capturedPrompt.includes("Default pipeline: AI integrated redraw")) {
      issues.push("Google image prompt should default to AI integrated redraw for poster mode");
    }
    if (capturedPrompt.includes("Identity-Safe Game Campaign KV Plate") || capturedPrompt.includes("SCENE PLATE only")) {
      issues.push("Google image prompt should not use scene-plate fallback by default");
    }

    let capturedLogoRequest = null;
    const logoAdapter = providers.createGoogleLiveImageAdapter({
      now: () => 1100,
      transport: async (request) => {
        capturedLogoRequest = request;
        return {
          ok: true,
          status: 200,
          body: {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: "image/png",
                        data: await fakePngBase64(1024, 1024),
                      },
                    },
                  ],
                },
              },
            ],
          },
        };
      },
    });
    const logoCopySafeRequest = providers.ImageGenerationRequestSchema.parse({
      context: {
        projectId: "project-google-logo-copy-safe-check",
        mode: "logo",
        providerId: "google",
        traceId: "trace-google-logo-copy-safe-check",
      },
      schemeId: "scheme-google-logo-copy-safe-01",
      prompt: [
        "COPY-SAFE BLANK WORDMARK ENFORCEMENT: do not render readable letters.",
        "Premium blank brand badge with a reserved empty wordmark plate.",
      ].join("\n"),
      assets: [
        {
          id: "asset-uploaded-logo-with-text",
          role: "gameLogo",
          mimeType: "image/png",
          description: "Uploaded readable Pizza Kitchen Adventures logo reference.",
          url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axw6OQAAAAASUVORK5CYII=",
        },
      ],
      platformPreset: "custom",
      aspectRatio: "1:1",
      width: 1024,
      height: 1024,
      model: "gemini-2.5-flash-image",
      count: 1,
    });
    const logoCopySafeResult = await logoAdapter.generateImage(logoCopySafeRequest, config);
    if (!logoCopySafeResult.ok) {
      issues.push(`Google logo copy-safe image generation should succeed: ${logoCopySafeResult.error.code}`);
    }
    const logoParts = capturedLogoRequest?.body?.contents?.[0]?.parts || [];
    const logoPrompt = logoParts.map((part) => part?.text || "").filter(Boolean).join("\n");
    if (logoParts.some((part) => part?.inlineData)) {
      issues.push("Google logo copy-safe mode must withhold uploaded logo inlineData to prevent copied wordmark text");
    }
    if (!logoPrompt.includes("BRAND MOTIF REFERENCE WITHHELD FOR COPY-SAFE LOGO TEXT")) {
      issues.push("Google logo copy-safe prompt should explain that the uploaded logo text reference was withheld");
    }
    if (logoPrompt.includes("referenceUrl=data:image")) {
      issues.push("Google logo copy-safe prompt must not expose the uploaded readable logo data URL");
    }

    let calls = 0;
    const missingKeyAdapter = providers.createGoogleLiveImageAdapter({
      transport: async () => {
        calls += 1;
        return { ok: true, status: 200, body: {} };
      },
    });
    const missingKey = await missingKeyAdapter.generateImage(request, {
      ...config,
      apiKey: "",
    });
    if (missingKey.ok || missingKey.error.code !== "auth_failed" || calls !== 0) {
      issues.push("Google adapter should fail before transport when API key is missing");
    }

    const authFailedAdapter = providers.createGoogleLiveImageAdapter({
      transport: async () => ({
        ok: false,
        status: 403,
        body: { error: { message: "API key invalid" } },
      }),
    });
    const authFailed = await authFailedAdapter.generateImage(request, config);
    if (authFailed.ok || authFailed.error.code !== "auth_failed") {
      issues.push("Google 403 response should become auth_failed");
    }

    const briefFallbackCalls = [];
    const fallbackBriefAdapter = providers.createGoogleLiveImageAdapter({
      now: () => 2000,
      transport: async (request) => {
        briefFallbackCalls.push(request.url);
        if (briefFallbackCalls.length === 1) {
          return {
            ok: false,
            status: 503,
            body: { error: { message: "This model is currently experiencing high demand." } },
          };
        }
        return {
          ok: true,
          status: 200,
          body: {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        schemes: [
                          {
                            title: "备用模型方案",
                            brief: "备用方案模型生成的游戏海报构图。",
                            prompt: "Premium game key art poster generated by fallback brief model.",
                            promptZh: "备用模型生成的高完成度游戏主视觉海报。",
                            promptEn: "Premium game key art poster generated by fallback brief model.",
                            slogans: { "en-US": "Fallback plan ready." },
                          },
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
          },
        };
      },
    });
    const fallbackBriefRequest = providers.BriefGenerationRequestSchema.parse({
      context: {
        projectId: "project-google-live-adapter-check",
        mode: "poster",
        providerId: "google",
        traceId: "trace-google-brief-fallback-check",
      },
      projectName: "Fallback Pizza Lab",
      gameDescription: "Cooking adventure game.",
      creativeDirection: "Generate varied game poster schemes.",
      assets: [],
      guardrails: providers.modeGuardrails("poster"),
      languageTargets: ["en-US"],
      schemeCount: 1,
    });
    const fallbackBrief = await fallbackBriefAdapter.generateBrief(fallbackBriefRequest, {
      ...config,
      defaultModel: "gemini-2.5-flash-image",
      modelSlots: {
        concept: "gemini-2.5-flash",
        image: "gemini-2.5-flash-image",
      },
    });
    if (!fallbackBrief.ok || fallbackBrief.value.model !== "gemini-2.5-pro") {
      issues.push("Google brief generation should retry with gemini-2.5-pro when flash is temporarily unavailable");
    }
	    if (briefFallbackCalls.length !== 2 || !briefFallbackCalls[0].includes("gemini-2.5-flash") || !briefFallbackCalls[1].includes("gemini-2.5-pro")) {
	      issues.push("Google brief fallback should call flash first and pro second");
	    }

	    let iconBriefPrompt = "";
	    const iconBriefAdapter = providers.createGoogleLiveImageAdapter({
	      now: () => 2100,
	      transport: async (request) => {
	        iconBriefPrompt = request.body?.contents?.[0]?.parts?.[0]?.text || "";
	        return {
	          ok: true,
	          status: 200,
	          body: {
	            candidates: [
	              {
	                content: {
	                  parts: [
	                    {
	                      text: JSON.stringify({
	                        schemes: [
	                          {
	                            title: "KV构图母版：错误的图标海报",
	                            brief: "KV构图母版：角色站在海报中央，电影级游戏主视觉海报。",
	                            prompt: "Premium game key art poster, KV composition, cinematic battle scene.",
	                            promptZh: "高完成度游戏主视觉海报，KV 构图，电影战斗场景。",
	                            promptEn: "Premium game key art poster, KV composition, cinematic battle scene.",
	                            slogans: { "en-US": "Wrong poster slogan" },
	                          },
	                        ],
	                      }),
	                    },
	                  ],
	                },
	              },
	            ],
	          },
	        };
	      },
	    });
	    const iconBriefRequest = providers.BriefGenerationRequestSchema.parse({
	      context: {
	        projectId: "project-google-icon-brief-check",
	        mode: "icon",
	        providerId: "google",
	        traceId: "trace-google-icon-brief-check",
	      },
	      projectName: "Pizza Kitchen Adventures",
	      gameDescription: "Cooking adventure game.",
	      creativeDirection: "Generate a clean 1:1 icon.",
	      assets: [
	        {
	          id: "asset-icon-character",
	          role: "gameCharacter",
	          mimeType: "image/png",
	          description: "Uploaded hero reference",
	        },
	      ],
	      guardrails: providers.modeGuardrails("icon"),
	      languageTargets: ["en-US"],
	      schemeCount: 1,
	    });
	    const iconBrief = await iconBriefAdapter.generateBrief(iconBriefRequest, config);
	    if (!iconBrief.ok) {
	      issues.push(`Google icon brief mode-aware generation should succeed: ${iconBrief.error.code}`);
	    } else {
	      const scheme = iconBrief.value.schemes[0];
	      if (!scheme.prompt.includes("ICON MODE ONLY")) {
	        issues.push("Google icon brief normalization should prepend ICON MODE ONLY lock");
	      }
	      if (scheme.prompt.includes("Premium game key art poster") || scheme.prompt.includes("KV composition")) {
	        issues.push("Google icon brief normalization should strip poster/KV contamination from provider text");
	      }
	      if (Object.keys(scheme.slogans || {}).length !== 0) {
	        issues.push("Google icon brief normalization should drop slogans for icon mode");
	      }
	    }
	    for (const forbidden of ["Generate NEW poster design schemes", "requiredKvArchitectureSlots", "posterKvArchitectureBriefSlots"]) {
	      if (iconBriefPrompt.includes(forbidden)) {
	        issues.push(`Google icon brief prompt must not include poster-only planning token: ${forbidden}`);
	      }
	    }
	    for (const required of ["Generate icon design schemes", "Icon mode hard lock", "one single dominant subject"]) {
	      if (!iconBriefPrompt.includes(required)) {
	        issues.push(`Google icon brief prompt should include icon mode token: ${required}`);
	      }
	    }

	    let queueTransportCalls = 0;
    const snapshotBase = withInlineMockAssets(storage.createMockWorkspaceSnapshot());
    const plan = queue.createBatchQueuePlan({
      projectId: snapshotBase.project.id,
      mode: "poster",
      providerId: "google",
      schemeIds: ["scheme-poster-01"],
      imagesPerScheme: 1,
      includeImageEdit: false,
      includeUpscale: false,
      includeBackgroundRemoval: false,
    });
    const snapshot = storage.WorkspaceSnapshotSchema.parse({
      ...snapshotBase,
      providerConfigs: {
        ...snapshotBase.providerConfigs,
        google: {
          ...snapshotBase.providerConfigs.google,
          enabled: true,
          status: "success",
          hasApiKey: true,
          apiKeyMasked: "AIza **** check",
          defaultModel: "gemini-2.5-flash-image",
          modelSlots: {
            ...(snapshotBase.providerConfigs.google?.modelSlots || {}),
            image: "gemini-2.5-flash-image",
          },
        },
      },
      queuePlans: [plan],
      queueSummaries: [queue.summarizeQueue(plan)],
      results: [],
      archiveRows: [],
    });
    const repository = storage.createMemoryDraftRepository([snapshot]);
    const resultFileStore = results.createLocalResultFileStore({
      rootDir: resultRoot,
      now: () => "2026-05-23T00:00:00.000Z",
    });
    const liveQueueResult = await queue.runGoogleLiveQueue(
      {
        enabled: true,
        workspaceId: snapshot.metadata.workspaceId,
        jobId: plan.job.id,
        apiKey: "GOOGLE_QUEUE_KEY_TEST_PLACEHOLDER",
        safety: allowedSafety(),
        traceId: "trace-google-live-queue-check",
      },
      {
        repository,
        resultFileStore,
        transport: async (request) => {
          queueTransportCalls += 1;
          if (request.headers["x-goog-api-key"] !== "GOOGLE_QUEUE_KEY_TEST_PLACEHOLDER") {
            issues.push("Google live queue should pass runtime credential only to the image transport");
          }
          const isBriefRequest = request.body?.generationConfig?.responseMimeType === "application/json";
          if (isBriefRequest) {
            const briefPrompt = request.body?.contents?.[0]?.parts?.[0]?.text || "";
            for (const token of [
              "Generate NEW poster design schemes",
              "randomizationSeed",
              "Every scheme must have a unique title",
              "premium game key art",
            ]) {
              if (!briefPrompt.includes(token)) {
                issues.push(`Google live queue brief prompt should include scheme diversity token: ${token}`);
              }
            }
            return {
              ok: true,
              status: 200,
              body: {
                candidates: [
                  {
                    content: {
                      parts: [
                        {
                          text: JSON.stringify({
                            schemes: [
                              {
                                title: "荒野食材追击战",
                                brief: "厨师小队在山谷小径追击逃窜的巨型食材，前景飞溅食材碎片，中景角色冲刺，远景餐厅招牌形成回收目标。",
                                prompt: "Premium game key art poster, wilderness ingredient chase, chef squad pursuing a giant ingredient monster through a layered valley, cinematic lighting, strong depth, readable logo safe area.",
                                promptZh: "高完成度游戏主视觉海报，荒野食材追击战，厨师小队在层次分明的山谷中追击巨型食材怪物，电影级光影，强烈前中后景，LOGO 位于安全区。",
                                promptEn: "Premium game key art poster, wilderness ingredient chase, chef squad pursuing a giant ingredient monster through a layered valley, cinematic lighting, strong foreground midground background depth, readable logo safe area.",
                                slogans: {
                                  "en-US": "Hunt giant ingredients. Serve the wild feast.",
                                },
                              },
                            ],
                          }),
                        },
                      ],
                    },
                  },
                ],
              },
            };
          }
          const promptText = (request.body?.contents?.[0]?.parts || [])
            .map((part) => part?.text || "")
            .filter(Boolean)
            .join("\n");
          for (const token of [
            "荒野食材追击战",
            "Target output: 1920x1080",
            "Provider asset constraints",
            "Default pipeline: AI integrated redraw",
            "Reference pose release",
            "Static scheme action rewrite",
            "semanticRole",
          ]) {
            if (!promptText.includes(token)) {
              issues.push(`Google live queue prompt should include workspace-derived token: ${token}`);
            }
          }
          if (promptText.includes("poster prompt for scheme-poster-01")) {
            issues.push("Google live queue prompt must not use the queue planner placeholder prompt");
          }
          if (promptText.includes("Identity-Safe Game Campaign KV Plate") || promptText.includes("SCENE PLATE only")) {
            issues.push("Google live queue image prompt should not default to scene-plate fallback");
          }
          return {
            ok: true,
            status: 200,
            body: {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        inlineData: {
                          mimeType: "image/png",
                            data: await fakePngBase64(1344, 768),
                        },
                      },
                    ],
                  },
                },
              ],
            },
          };
        },
        now: () => "2026-05-23T00:00:00.000Z",
        adapterNow: () => 1000,
      },
    );
    if (liveQueueResult.status !== "attempted" || liveQueueResult.persistedFileCount !== 1) {
      issues.push("Google live queue should complete through fake transport and persist one result file");
    }
    if (queueTransportCalls !== 2) {
      issues.push("Google live queue should call Google transport once for brief generation and once for one image task");
    }
    const loaded = await repository.loadSnapshot(snapshot.metadata.workspaceId);
    if (!loaded.ok || !loaded.snapshot.results[0]?.metadata?.resultFile?.storageKey) {
      issues.push("Google live queue should store resultFile metadata in the workspace snapshot");
    }
    if (loaded.ok && (loaded.snapshot.results[0]?.width !== 1920 || loaded.snapshot.results[0]?.height !== 1080)) {
      issues.push("Google live queue should store locally resized platform dimensions on result assets");
    }
    if (loaded.ok && loaded.snapshot.results[0]?.metadata?.requestedOutput?.width !== 1920) {
      issues.push("Google live queue should keep requested output dimensions in task metadata");
    }
    if (loaded.ok && loaded.snapshot.results[0]?.metadata?.outputProcessing?.strategy !== "localResizeExact") {
      issues.push("Google live queue should record localResizeExact output processing metadata");
    }
    if (loaded.ok && loaded.snapshot.results[0]?.metadata?.providerAsset?.width !== 1344) {
      issues.push("Google live queue should keep native provider dimensions inside providerAsset metadata");
    }
    if (loaded.ok && JSON.stringify(loaded.snapshot).includes("GOOGLE_QUEUE_KEY_TEST_PLACEHOLDER")) {
      issues.push("Google live queue snapshot must not contain the clear-text API key");
    }
  } finally {
    for (const candidate of [outDir, resultRoot]) {
      const resolved = path.resolve(candidate);
      const allowed =
        resolved.startsWith(`${path.resolve(root)}${path.sep}`) &&
        (path.basename(resolved).startsWith(".tmp-google-live-adapter-check-") ||
          path.basename(resolved).startsWith(".tmp-google-live-results-"));
      if (allowed) rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Google live adapter checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Google live adapter checks passed.");
