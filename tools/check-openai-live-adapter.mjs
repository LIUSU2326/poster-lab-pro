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

const adapter = read("src/providers/openai-live-adapter.ts");
const providerProfiles = read("src/providers/provider-capability-profiles.ts");
const barrel = read("src/providers/index.ts");
const liveStubs = read("src/providers/live-adapter-stubs.ts");
const decisions = read("DECISIONS.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const product = read("PRODUCT.md");
const pkg = read("package.json");

for (const token of [
  "OpenAIImageGenerationResponseSchema",
  "OpenAIImageTransportRequestSchema",
  "OpenAIImageTransportResponseSchema",
  "createOpenAILiveImageAdapter",
  "createOpenAIHttpTransport",
  "OPENAI_IMAGE_GENERATIONS_PATH",
  "/images/generations",
  "Authorization",
  "Bearer",
  "b64_json",
  "data:image/png;base64",
  "modeQualityInstruction",
  "brand-safe typography",
  "no poster scene complexity",
  "Logo text safety",
	  "Logo Text Strategy lock",
	  "polished blank wordmark plate",
	  "pseudo-letters",
	  "project-title fragments",
  "modeAssetFusionDirective",
  "modeReferenceInstruction",
  "Icon reference handling",
  "Announcement Copy Safety Strategy lock",
  "polished blank fields",
  "Collab reference handling",
  "Collab Brand Safety Strategy lock",
  "blank partner brand plate",
  "Uploaded subject accessory lock",
  "no invented shield/weapon/tool/accessory",
  "invent partner brand names",
  "polished blank partner brand plate",
  "Icon logo rule",
  "Collab logo rule",
  "providerCapabilityPromptNote",
  "providerUsesExtraBodyImageReferences",
  "Provider Capability Adapter Contract",
  "compressedProviderPriorityInstruction",
  "COMPRESSED MODEL PRIORITY CONTRACT",
  "posterCompressedSceneContract",
  "SCHEME-SPECIFIC MANDATORY SCENE",
  "blue-sky grassy hero lineup",
  "Poster required anchors",
  "LOW TEXT RELIABILITY LOCK",
  "EXACT HERO ROSTER LOCK",
  "EXACT BOSS ROSTER LOCK",
  "STYLE CONSISTENCY LOCK",
  "Collab partner anchor",
]) {
  if (!adapter.includes(token) && !providerProfiles.includes(token)) issues.push(`openai-live-adapter.ts: missing ${token}`);
}

for (const token of ["createOpenAILiveImageAdapter", "OpenAIImageGenerationResponseSchema", "createOpenAIHttpTransport"]) {
  if (!barrel.includes(token)) issues.push(`providers/index.ts: missing OpenAI adapter export ${token}`);
}

for (const [file, source] of [
  ["DECISIONS.md", decisions],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
  ["PRODUCT.md", product],
]) {
  if (!source.includes("OpenAI") || !source.includes("adapter")) {
    issues.push(`${file}: missing OpenAI adapter boundary update`);
  }
}

if (!decisions.includes("D068")) {
  issues.push("DECISIONS.md: missing D068 OpenAI adapter decision");
}

if (!pkg.includes("openai-live-adapter:check")) {
  issues.push("package.json: missing openai-live-adapter:check script");
}

for (const forbidden of ["process.env", "localStorage", "sessionStorage", "writeFile", "readFile"]) {
  if (adapter.includes(forbidden)) {
    issues.push(`OpenAI adapter must not read env, browser storage, or credential files (${forbidden})`);
  }
}

if (!liveStubs.includes("provider_unavailable") || !liveStubs.includes("createLiveProviderRegistry")) {
  issues.push("live-adapter-stubs.ts: default live stub registry must remain available");
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
  const outDir = path.join(root, `.tmp-openai-live-adapter-check-${Date.now()}`);
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

    const providersModulePath = existsSync(path.join(outDir, "providers", "index.js"))
      ? path.join(outDir, "providers", "index.js")
      : path.join(outDir, "src", "providers", "index.js");
    const defaultsModulePath = existsSync(path.join(outDir, "schema", "zod-defaults.js"))
      ? path.join(outDir, "schema", "zod-defaults.js")
      : path.join(outDir, "src", "schema", "zod-defaults.js");

    const providers = await import(pathToFileURL(providersModulePath).href);
    const defaults = await import(pathToFileURL(defaultsModulePath).href);

    const baseConfig = {
      ...defaults.createProviderConfigDefaults("openai"),
      enabled: true,
      apiKey: "OPENAI_ADAPTER_KEY_TEST_PLACEHOLDER",
      defaultModel: "gpt-image-1",
    };
    const imageRequest = providers.ImageGenerationRequestSchema.parse({
      context: {
        projectId: "project-openai-live-adapter-check",
        mode: "poster",
        providerId: "openai",
        traceId: "trace-openai-live-adapter-check",
      },
      schemeId: "scheme-poster-01",
      prompt: "Create a game marketing poster for a chef squad adventure.",
      negativePrompt: "low quality typography",
      assets: [],
      platformPreset: "tiktok",
      aspectRatio: "9:16",
      width: 1080,
      height: 1920,
      model: "gpt-image-1",
      count: 1,
    });

    let capturedRequest;
    let transportCalls = 0;
    const urlTransport = async (request) => {
      transportCalls += 1;
      capturedRequest = request;
      return {
        ok: true,
        status: 200,
        body: {
          data: [
            {
              url: "https://cdn.example.com/openai-generated-poster.png",
              revised_prompt: "A revised provider prompt.",
            },
          ],
        },
      };
    };

    const adapterWithUrlTransport = providers.createOpenAILiveImageAdapter({
      transport: urlTransport,
      now: (() => {
        let value = 100;
        return () => {
          value += 25;
          return value;
        };
      })(),
    });
    const urlResult = await adapterWithUrlTransport.generateImage(imageRequest, baseConfig);
    if (!urlResult.ok) {
      issues.push(`OpenAI URL response should succeed: ${urlResult.error.code}`);
    } else if (urlResult.value.assets[0]?.url !== "https://cdn.example.com/openai-generated-poster.png") {
      issues.push("OpenAI URL response should preserve provider asset URL");
    }
    if (transportCalls !== 1) issues.push("OpenAI adapter should call injected transport exactly once on success");
    if (!capturedRequest?.url.endsWith("/images/generations")) {
      issues.push("OpenAI adapter should target /images/generations");
    }
    if (capturedRequest?.headers?.Authorization !== "Bearer OPENAI_ADAPTER_KEY_TEST_PLACEHOLDER") {
      issues.push("OpenAI adapter should send bearer token from explicit config");
    }
    if (capturedRequest?.body?.size !== "1080x1920" || capturedRequest?.body?.n !== 1) {
      issues.push("OpenAI adapter should serialize size and image count");
    }
    if (!String(capturedRequest?.body?.prompt || "").includes("Avoid: low quality typography")) {
      issues.push("OpenAI adapter should append negative prompt guidance to text prompt");
    }

    let capturedAigocodeRequest;
    const aigocodeAdapter = providers.createOpenAILiveImageAdapter({
      providerId: "aigocode",
      transport: async (request) => {
        capturedAigocodeRequest = request;
        return {
          ok: true,
          status: 200,
          body: {
            data: [{ b64_json: Buffer.from("aigocode-image").toString("base64") }],
          },
        };
      },
    });
    const aigocodeConfig = {
      ...defaults.createProviderConfigDefaults("aigocode"),
      enabled: true,
      apiKey: "AIGOCODE_ADAPTER_KEY_TEST_PLACEHOLDER",
      defaultModel: "gpt-image-1",
    };
    const aigocodeRequest = providers.ImageGenerationRequestSchema.parse({
      ...imageRequest,
      context: {
        ...imageRequest.context,
        providerId: "aigocode",
        traceId: "trace-aigocode-live-adapter-check",
      },
      model: "gpt-image-1",
    });
    const aigocodeResult = await aigocodeAdapter.generateImage(aigocodeRequest, aigocodeConfig);
    if (!aigocodeResult.ok) {
      issues.push(`AIGoCode image response should succeed: ${aigocodeResult.error.code}`);
    }
    if (!capturedAigocodeRequest?.url.startsWith("https://api.aigocode.app/v1/")) {
      issues.push("AIGoCode image adapter should use the AIGoCode OpenAI-compatible base URL");
    }

    let capturedEditRequest;
    const editAdapter = providers.createOpenAILiveImageAdapter({
      transport: async (request) => {
        capturedEditRequest = request;
        return {
          ok: true,
          status: 200,
          body: {
            data: [{ b64_json: Buffer.from("edited-image").toString("base64") }],
          },
        };
      },
    });
    const editResult = await editAdapter.editImage(
      providers.ImageEditRequestSchema.parse({
        ...imageRequest,
        sourceResultId: "result-openai-live-adapter-check",
        editInstruction: "Make a cleaner alternate composition.",
      }),
      baseConfig,
    );
    if (!editResult.ok) {
      issues.push(`OpenAI-compatible editImage fallback should succeed: ${editResult.error.code}`);
    }
    if (!String(capturedEditRequest?.body?.prompt || "").includes("Result operation: visual reconstruction / image-to-image refinement")) {
      issues.push("OpenAI-compatible editImage fallback should include the variation operation instruction");
    }

    let capturedLocalPortRequest;
    const localPortAdapter = providers.createOpenAILiveImageAdapter({
      transport: async (request) => {
        capturedLocalPortRequest = request;
        return {
          ok: true,
          status: 200,
          body: {
            data: [{ b64_json: Buffer.from("local-port-normalized").toString("base64") }],
          },
        };
      },
    });
    await localPortAdapter.generateImage(imageRequest, {
      ...baseConfig,
      baseUrl: "http://localhost:3000",
    });
    if (!String(capturedLocalPortRequest?.url || "").startsWith("https://api.openai.com/v1/")) {
      issues.push("OpenAI adapter should normalize the shared localhost:3000 dev port to the official OpenAI base URL");
    }

    const imageUrlBytes = Buffer.from("fake-provider-url-image-bytes");
    const httpTransport = providers.createOpenAIHttpTransport(async (url, init) => {
      if (String(url).includes("/images/generations")) {
        const posted = JSON.parse(String(init?.body || "{}"));
        if (posted.prompt !== "provider url download check") {
          issues.push("OpenAI HTTP transport should forward the original generation body");
        }
        return new Response(JSON.stringify({
          data: [
            {
              url: "https://cdn.example.com/provider-url-result.png",
              b64_json: null,
              revised_prompt: null,
            },
          ],
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (String(url) === "https://cdn.example.com/provider-url-result.png") {
        return new Response(imageUrlBytes, {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      return new Response("not found", { status: 404 });
    });
    const httpTransportResult = await httpTransport({
      url: "https://api.example.com/v1/images/generations",
      method: "POST",
      headers: { Authorization: "Bearer test" },
      body: {
        model: "agnes-image-2.1-flash",
        prompt: "provider url download check",
        size: "1024x1024",
        n: 1,
      },
    });
    const downloadedAsset = httpTransportResult.body?.data?.[0];
    if (
      !httpTransportResult.ok
      || downloadedAsset?.url !== "https://cdn.example.com/provider-url-result.png"
      || downloadedAsset?.b64_json !== imageUrlBytes.toString("base64")
    ) {
      issues.push("OpenAI HTTP transport should preserve provider URL results and attach base64 bytes for local result storage");
    }

    let capturedAgnesRequest;
    const nullableFieldAdapter = providers.createOpenAILiveImageAdapter({
      providerId: "agnes",
      transport: async (request) => {
        capturedAgnesRequest = request;
        return {
          ok: true,
          status: 200,
          body: {
            data: [
              {
                url: "https://cdn.example.com/agnes-generated-poster.png",
                b64_json: null,
                revised_prompt: null,
              },
            ],
          },
        };
      },
    });
    const nullableFieldResult = await nullableFieldAdapter.generateImage(
      providers.ImageGenerationRequestSchema.parse({
        ...imageRequest,
        context: {
          ...imageRequest.context,
          providerId: "agnes",
        },
        model: "agnes-image-2.1-flash",
        prompt: "Create a poster with uploaded hero, BOSS, logo treatment, and slogan/copy-safe area.",
        assets: [
          {
            id: "asset-uploaded-hero",
            role: "gameCharacter",
            description: "semanticRole=protagonist; fusion=hero identity reference",
            url: "https://cdn.example.com/hero.png",
          },
          {
            id: "asset-uploaded-boss",
            role: "prop",
            description: "semanticRole=antagonist; label=BOSS; fusion=boss threat reference",
            url: "https://cdn.example.com/boss.png",
          },
          {
            id: "asset-uploaded-logo",
            role: "gameLogo",
            description: "semanticRole=brandLogo; fusion=brand reference",
            url: "https://cdn.example.com/logo.png",
          },
        ],
      }),
      {
        ...baseConfig,
        providerId: "agnes",
        defaultModel: "agnes-image-2.1-flash",
      },
    );
    if (!nullableFieldResult.ok || nullableFieldResult.value.assets[0]?.url !== "https://cdn.example.com/agnes-generated-poster.png") {
      issues.push("OpenAI-compatible adapter should accept provider success responses with nullable b64_json/revised_prompt fields");
    }
    const agnesPrompt = String(capturedAgnesRequest?.body?.prompt || "");
    if (
      !agnesPrompt.includes("COMPRESSED MODEL PRIORITY CONTRACT")
      || !agnesPrompt.includes("Poster required anchors")
      || !agnesPrompt.includes("LOW TEXT RELIABILITY LOCK")
      || !agnesPrompt.includes("EXACT HERO ROSTER LOCK")
      || !agnesPrompt.includes("EXACT BOSS ROSTER LOCK")
      || !agnesPrompt.includes("STYLE CONSISTENCY LOCK")
      || !agnesPrompt.includes("AGNES/COMPRESSED POSTER ORDER")
      || !agnesPrompt.includes("AGNES POSTER REFERENCE INPUT")
      || !agnesPrompt.includes("SELECTED SCHEME ARCHITECTURE LOCK")
      || !agnesPrompt.includes("KV ACTION MINI-BRIEF")
      || !agnesPrompt.includes("REFERENCE PANEL BAN")
      || !agnesPrompt.includes("EMPTY BACKGROUND BAN")
      || !agnesPrompt.includes("MINIMUM ENVIRONMENT CHECKLIST")
    ) {
      issues.push("Agnes image prompt should front-load compressed-provider Poster priority anchors");
    }
    const agnesImages = capturedAgnesRequest?.body?.extra_body?.image || [];
    if (!Array.isArray(agnesImages) || agnesImages.length < 3) {
      issues.push("Agnes poster image request should pass uploaded identity visual references through extra_body.image");
    }

    let capturedAgnesCollabRequest;
    const agnesCollabAdapter = providers.createOpenAILiveImageAdapter({
      providerId: "agnes",
      transport: async (request) => {
        capturedAgnesCollabRequest = request;
        return {
          ok: true,
          status: 200,
          body: { data: [{ b64_json: "ZmFrZS1jb2xsYWItYnl0ZXM=" }] },
        };
      },
    });
    const agnesCollabResult = await agnesCollabAdapter.generateImage(
      providers.ImageGenerationRequestSchema.parse({
        ...imageRequest,
        context: {
          ...imageRequest.context,
          mode: "collab",
          providerId: "agnes",
        },
        schemeId: "scheme-collab-01",
        model: "agnes-image-2.1-flash",
        prompt: "Create a collaboration visual with [Collab Partner] and [Game Character] as separate identities.",
        assets: [
          {
            id: "asset-collab-partner",
            role: "collabCharacter",
            description: "semanticRole=protagonist; fusion=partner identity reference",
            url: "https://cdn.example.com/partner.png",
          },
          {
            id: "asset-game-character",
            role: "gameCharacter",
            description: "semanticRole=protagonist; fusion=game identity reference",
            url: "https://cdn.example.com/game-character.png",
          },
        ],
      }),
      {
        ...baseConfig,
        providerId: "agnes",
        defaultModel: "agnes-image-2.1-flash",
      },
    );
    const agnesCollabPrompt = String(capturedAgnesCollabRequest?.body?.prompt || "");
    if (
      !agnesCollabResult.ok
      || !agnesCollabPrompt.includes("Collab partner anchor")
      || !agnesCollabPrompt.includes("DUAL-SUBJECT FRAMING LOCK")
      || !agnesCollabPrompt.includes("Both co-stars need comparable visual weight")
      || !agnesCollabPrompt.includes("COLLAB DUAL-STAR ORDER")
      || !agnesCollabPrompt.includes("Two-character audit")
      || !agnesCollabPrompt.includes("EMPTY COLLAB BACKGROUND BAN")
    ) {
      issues.push("Agnes collab prompt should front-load dual-subject co-star priority anchors");
    }

    let capturedLogoRequest;
    const logoAdapter = providers.createOpenAILiveImageAdapter({
      transport: async (request) => {
        capturedLogoRequest = request;
        return {
          ok: true,
          status: 200,
          body: { data: [{ b64_json: "ZmFrZS1sb2dvLWJ5dGVz" }] },
        };
      },
    });
    const logoRequest = providers.ImageGenerationRequestSchema.parse({
      ...imageRequest,
      context: {
        ...imageRequest.context,
        mode: "logo",
      },
      schemeId: "scheme-logo-01",
      prompt: "Create a readable game logo wordmark.",
      negativePrompt: "fake lettering",
      assets: [
        {
          id: "asset-uploaded-logo",
          role: "gameLogo",
          description: "semanticRole=brandLogo; fusion=brand continuity reference",
        },
      ],
      platformPreset: "custom",
      aspectRatio: "1:1",
      width: 1024,
      height: 1024,
    });
    const logoResult = await logoAdapter.generateImage(logoRequest, baseConfig);
    const logoPrompt = String(capturedLogoRequest?.body?.prompt || "");
    if (!logoResult.ok || !logoPrompt.includes("logo/wordmark is primary") || !logoPrompt.includes("do not invent fake replacement lettering")) {
      issues.push("OpenAI logo prompt should use logo-specific quality and fake-lettering safety rules");
    }

    let missingKeyTransportCalls = 0;
    const missingKeyAdapter = providers.createOpenAILiveImageAdapter({
      transport: async () => {
        missingKeyTransportCalls += 1;
        return { ok: true, status: 200, body: { data: [] } };
      },
    });
    const missingKeyResult = await missingKeyAdapter.generateImage(imageRequest, {
      ...baseConfig,
      apiKey: "",
    });
    if (missingKeyResult.ok || missingKeyResult.error.code !== "auth_failed") {
      issues.push("OpenAI adapter should fail with auth_failed before transport when API key is missing");
    }
    if (missingKeyTransportCalls !== 0) {
      issues.push("OpenAI adapter should not call transport when API key is missing");
    }

    const b64Adapter = providers.createOpenAILiveImageAdapter({
      transport: async () => ({
        ok: true,
        status: 200,
        body: {
          data: [
            {
              b64_json: "ZmFrZS1wbmctYnl0ZXM=",
            },
          ],
        },
      }),
    });
    const b64Result = await b64Adapter.generateImage(imageRequest, baseConfig);
    if (!b64Result.ok || !b64Result.value.assets[0]?.dataUrl?.startsWith("data:image/png;base64,")) {
      issues.push("OpenAI base64 response should become a dataUrl provider asset");
    }

    const rateLimitAdapter = providers.createOpenAILiveImageAdapter({
      transport: async () => ({
        ok: false,
        status: 429,
        body: { error: { message: "Rate limit reached." } },
      }),
    });
    const rateLimitResult = await rateLimitAdapter.generateImage(imageRequest, baseConfig);
    if (rateLimitResult.ok || rateLimitResult.error.code !== "rate_limited" || !rateLimitResult.error.retryable) {
      issues.push("OpenAI 429 response should become a retryable rate_limited provider error");
    }

    const noTransportAdapter = providers.createOpenAILiveImageAdapter();
    const noTransportHealth = await noTransportAdapter.healthCheck(baseConfig);
    if (!noTransportHealth.ok || noTransportHealth.value.status !== "unavailable") {
      issues.push("OpenAI adapter without transport should report unavailable health");
    }
    const noTransportResult = await noTransportAdapter.generateImage(imageRequest, baseConfig);
    if (noTransportResult.ok || noTransportResult.error.code !== "provider_unavailable") {
      issues.push("OpenAI adapter without transport should not execute live requests");
    }

    const liveStubRegistry = providers.createLiveProviderRegistry({ providerIds: ["openai"] });
    const liveStubResult = await liveStubRegistry.openai.generateImage(imageRequest, baseConfig);
    if (liveStubResult.ok || liveStubResult.error.code !== "provider_unavailable") {
      issues.push("default live stub registry should remain disabled unless explicitly replaced");
    }
  } finally {
    const resolved = path.resolve(outDir);
    if (
      resolved.startsWith(`${path.resolve(root)}${path.sep}`) &&
      path.basename(resolved).startsWith(".tmp-openai-live-adapter-check-")
    ) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("OpenAI live adapter checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("OpenAI live adapter checks passed.");
