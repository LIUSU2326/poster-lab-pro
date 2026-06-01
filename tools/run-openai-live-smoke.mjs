import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();

function usage() {
  return [
    "Manual OpenAI live smoke command.",
    "",
    "This command may call the OpenAI Images API and consume provider quota.",
    "It never runs unless --allow-live is provided.",
    "",
    "Recommended:",
    "  echo sk-... | npm run openai-live-smoke -- --allow-live --api-key-stdin --prompt \"Smoke test poster\"",
    "",
    "Options:",
    "  --allow-live           Required before any provider call.",
    "  --api-key <key>        Runtime API key. Not persisted or printed.",
    "  --api-key-stdin        Read runtime API key from stdin.",
    "  --model <model>        Default: gpt-image-1.",
    "  --size <WxH>           Default: 1024x1024.",
    "  --prompt <text>        Smoke prompt, max 800 chars.",
    "  --base-url <url>       Optional OpenAI-compatible base URL.",
    "  --help                 Show this help.",
  ].join("\n");
}

function argValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return "";
  return args[index + 1] || "";
}

function parseSize(value) {
  if (!value) return { width: 1024, height: 1024 };
  const match = /^(\d+)x(\d+)$/i.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid --size value "${value}". Use WIDTHxHEIGHT, for example 1024x1024.`);
  }
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) {
    text += chunk;
  }
  return text.trim();
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

async function compileProviderModules() {
  const outDir = path.join(root, `.tmp-openai-live-smoke-run-${Date.now()}`);
  mkdirSync(outDir, { recursive: true });

  try {
    const configFile = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
    if (configFile.error) {
      throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
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
      throw new Error(
        ts.formatDiagnosticsWithColorAndContext(errors, {
          getCanonicalFileName: (fileName) => fileName,
          getCurrentDirectory: () => root,
          getNewLine: () => "\n",
        }),
      );
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
    return {
      providers,
      cleanup() {
        const resolved = path.resolve(outDir);
        if (
          resolved.startsWith(`${path.resolve(root)}${path.sep}`) &&
          path.basename(resolved).startsWith(".tmp-openai-live-smoke-run-")
        ) {
          rmSync(resolved, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    const resolved = path.resolve(outDir);
    if (
      resolved.startsWith(`${path.resolve(root)}${path.sep}`) &&
      path.basename(resolved).startsWith(".tmp-openai-live-smoke-run-")
    ) {
      rmSync(resolved, { recursive: true, force: true });
    }
    throw error;
  }
}

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(usage());
  process.exit(0);
}

let cleanup = () => {};

try {
  const allowLive = args.includes("--allow-live");
  const model = argValue(args, "--model") || "gpt-image-1";
  const prompt =
    argValue(args, "--prompt") ||
    "Create a small smoke-test game marketing poster. Keep it simple and non-branded.";
  const baseUrl = argValue(args, "--base-url");
  const { width, height } = parseSize(argValue(args, "--size"));
  let apiKey = argValue(args, "--api-key");
  if (args.includes("--api-key-stdin")) {
    apiKey = await readStdin();
  }

  const compiled = await compileProviderModules();
  cleanup = compiled.cleanup;
  const result = await compiled.providers.runOpenAIManualLiveSmoke({
    enabled: allowLive,
    apiKey,
    model,
    prompt,
    width,
    height,
    baseUrl,
    traceId: `trace-openai-manual-live-smoke-${Date.now()}`,
  });

  console.log(JSON.stringify(result, null, 2));

  const success = result.status === "attempted" && !result.providerError && result.assetCount > 0;
  process.exit(success ? 0 : 1);
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "blocked",
        providerId: "openai",
        attempted: false,
        message: error instanceof Error ? error.message : "OpenAI live smoke command failed.",
      },
      null,
      2,
    ),
  );
  process.exit(1);
} finally {
  cleanup();
}
