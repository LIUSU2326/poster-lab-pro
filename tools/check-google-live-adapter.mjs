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
const barrel = read("src/providers/index.ts");
const manifests = read("src/providers/manifests.ts");
const diagnostics = read("src/providers/connection-diagnostics.ts");
const contracts = read("src/api/contracts.ts");
const manualLive = read("src/api/manual-live-generation.ts");
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
]) {
  if (!adapter.includes(token)) issues.push(`google-live-adapter.ts: missing ${token}`);
}

for (const token of ["id: \"google\"", "gemini-2.5-flash-image", "Google AI Studio"]) {
  if (!manifests.includes(token)) issues.push(`manifests.ts: missing Google manifest token ${token}`);
}

for (const token of ["DEFAULT_GOOGLE_BASE_URL", "x-goog-api-key", "models"]) {
  if (!diagnostics.includes(token)) issues.push(`connection-diagnostics.ts: missing Google diagnostic token ${token}`);
}

for (const token of ["GoogleLiveQueueRunResultSchema", "providerId: z.enum([\"openai\", \"google\"])"]) {
  if (!contracts.includes(token)) issues.push(`contracts.ts: missing Google manual live token ${token}`);
}

for (const token of ["runGoogleLiveQueue", "googleImageTransport", "createGoogleImageFetchTransport"]) {
  if (!manualLive.includes(token)) issues.push(`manual-live-generation.ts: missing ${token}`);
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

    let queueTransportCalls = 0;
    const snapshotBase = storage.createMockWorkspaceSnapshot();
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
          const promptText = request.body?.contents?.[0]?.parts?.[0]?.text || "";
          for (const token of [
            "幻想料理冒险游戏海报",
            "厨师小队",
            "Target output: 1920x1080",
            "Provider asset constraints",
          ]) {
            if (!promptText.includes(token)) {
              issues.push(`Google live queue prompt should include workspace-derived token: ${token}`);
            }
          }
          if (promptText.includes("poster prompt for scheme-poster-01")) {
            issues.push("Google live queue prompt must not use the queue planner placeholder prompt");
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
    if (queueTransportCalls !== 1) {
      issues.push("Google live queue should call image transport exactly once for one image task");
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
