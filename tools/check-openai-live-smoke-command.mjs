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

const smoke = read("src/providers/openai-live-smoke.ts");
const cli = read("tools/run-openai-live-smoke.mjs");
const barrel = read("src/providers/index.ts");
const decisions = read("DECISIONS.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const product = read("PRODUCT.md");
const pkg = read("package.json");

for (const token of [
  "OpenAIManualLiveSmokeInputSchema",
  "OpenAIManualLiveSmokeResultSchema",
  "runOpenAIManualLiveSmoke",
  "resolveProviderRuntimeConfig",
  "createRuntimeProviderCredentialStore",
  "createOpenAILiveImageAdapter",
  "createOpenAIHttpTransport",
  "dataUrlLength",
  "skipped",
  "blocked",
  "attempted",
]) {
  if (!smoke.includes(token)) issues.push(`openai-live-smoke.ts: missing ${token}`);
}

for (const token of ["--allow-live", "--api-key", "--api-key-stdin", "--prompt", "--size", "runOpenAIManualLiveSmoke"]) {
  if (!cli.includes(token)) issues.push(`run-openai-live-smoke.mjs: missing ${token}`);
}

for (const token of ["runOpenAIManualLiveSmoke", "OpenAIManualLiveSmokeInputSchema"]) {
  if (!barrel.includes(token)) issues.push(`providers/index.ts: missing OpenAI live smoke export ${token}`);
}

for (const [file, source] of [
  ["DECISIONS.md", decisions],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
  ["PRODUCT.md", product],
]) {
  if (!source.includes("Manual") || !source.includes("OpenAI") || !source.includes("smoke")) {
    issues.push(`${file}: missing manual OpenAI live smoke update`);
  }
}

if (!decisions.includes("D069")) {
  issues.push("DECISIONS.md: missing D069 manual OpenAI live smoke decision");
}

for (const token of ["openai-live-smoke", "openai-live-smoke:check"]) {
  if (!pkg.includes(token)) issues.push(`package.json: missing ${token} script`);
}

for (const forbidden of ["process.env", "localStorage", "sessionStorage"]) {
  if (smoke.includes(forbidden) || cli.includes(forbidden)) {
    issues.push(`OpenAI manual live smoke must not read env or browser storage (${forbidden})`);
  }
}

if (pkg.includes("&& npm run openai-live-smoke &&")) {
  issues.push("package.json: real openai-live-smoke command must not be included in the default check chain");
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
  const outDir = path.join(root, `.tmp-openai-live-smoke-command-check-${Date.now()}`);
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

    const providers = await import(pathToFileURL(providersModulePath).href);

    let calls = 0;
    const fakeSuccessTransport = async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        body: {
          data: [
            {
              url: "https://cdn.example.com/manual-openai-smoke.png",
            },
          ],
        },
      };
    };

    const skipped = await providers.runOpenAIManualLiveSmoke(
      {
        model: "gpt-image-1",
      },
      { transport: fakeSuccessTransport },
    );
    if (skipped.status !== "skipped" || skipped.attempted || calls !== 0) {
      issues.push("manual OpenAI smoke should skip without explicit enable and avoid transport calls");
    }

    const missingKey = await providers.runOpenAIManualLiveSmoke(
      {
        enabled: true,
        model: "gpt-image-1",
      },
      { transport: fakeSuccessTransport },
    );
    if (missingKey.status !== "blocked" || missingKey.providerError?.code !== "auth_failed" || calls !== 0) {
      issues.push("manual OpenAI smoke should block missing API key before adapter execution");
    }

    const success = await providers.runOpenAIManualLiveSmoke(
      {
        enabled: true,
        apiKey: "OPENAI_MANUAL_SMOKE_KEY_TEST_PLACEHOLDER",
        model: "gpt-image-1",
        prompt: "Smoke test prompt.",
        width: 1024,
        height: 1024,
      },
      { transport: fakeSuccessTransport },
    );
    if (
      success.status !== "attempted" ||
      !success.attempted ||
      success.assetCount !== 1 ||
      success.firstAsset?.source !== "url" ||
      success.firstAsset?.url !== "https://cdn.example.com/manual-openai-smoke.png"
    ) {
      issues.push("manual OpenAI smoke should summarize successful URL assets");
    }
    if (JSON.stringify(success).includes("OPENAI_MANUAL_SMOKE_KEY_TEST_PLACEHOLDER")) {
      issues.push("manual OpenAI smoke result must not echo the clear-text API key");
    }

    const b64 = await providers.runOpenAIManualLiveSmoke(
      {
        enabled: true,
        apiKey: "OPENAI_MANUAL_SMOKE_KEY_TEST_PLACEHOLDER",
        model: "gpt-image-1",
      },
      {
        transport: async () => ({
          ok: true,
          status: 200,
          body: { data: [{ b64_json: "ZmFrZQ==" }] },
        }),
      },
    );
    if (b64.firstAsset?.source !== "dataUrl" || !b64.firstAsset.dataUrlLength) {
      issues.push("manual OpenAI smoke should summarize base64 assets without returning image bytes");
    }
    if (JSON.stringify(b64).includes("data:image/png;base64,ZmFrZQ==")) {
      issues.push("manual OpenAI smoke result must not print base64 image bytes");
    }

    const rateLimited = await providers.runOpenAIManualLiveSmoke(
      {
        enabled: true,
        apiKey: "OPENAI_MANUAL_SMOKE_KEY_TEST_PLACEHOLDER",
        model: "gpt-image-1",
      },
      {
        transport: async () => ({
          ok: false,
          status: 429,
          body: { error: { message: "Rate limited." } },
        }),
      },
    );
    if (rateLimited.status !== "attempted" || rateLimited.providerError?.code !== "rate_limited" || !rateLimited.providerError.retryable) {
      issues.push("manual OpenAI smoke should summarize retryable provider errors");
    }
  } finally {
    const resolved = path.resolve(outDir);
    if (
      resolved.startsWith(`${path.resolve(root)}${path.sep}`) &&
      path.basename(resolved).startsWith(".tmp-openai-live-smoke-command-check-")
    ) {
      rmSync(resolved, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("OpenAI manual live smoke command checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("OpenAI manual live smoke command checks passed.");
