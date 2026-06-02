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
    issues.push(`${filePath}: missing required result quality audit file`);
    return "";
  }
}

const audit = read("src/results/quality-audit.ts");
const imagePostProcessing = read("src/results/image-post-processing.ts");
const resultsIndex = read("src/results/index.ts");
const worker = read("src/queue/workspace-worker.ts");
const centerBoard = read("src/render/center-board.js");
const styles = read("styles.css");
const decisions = read("DECISIONS.md");
const roadmap = read("ROADMAP.md");
const testing = read("TESTING.md");
const pkg = read("package.json");

for (const token of [
  "auditResultQuality",
  "result-quality-audit.v1",
  "icon-rounded-mask-risk",
  "logo-text-accuracy-review",
  "logo-copy-safe-wordmark-fallback",
  "logoWordmarkTextRisk",
  "logoTextStrategy",
  "announcement-copy-safe-review",
  "collab-missing-partner-brand-logo",
  "local-overlay-fallback-applied",
  "tokenCost: 0",
]) {
  if (!audit.includes(token)) issues.push(`quality-audit.ts: missing ${token}`);
}

for (const token of ["repairIconCanvasEdges", "iconCanvasEdgeRepair", "IconCanvasEdgeRepairProcessing"]) {
  if (!imagePostProcessing.includes(token)) issues.push(`image-post-processing.ts: missing ${token}`);
}

if (!resultsIndex.includes("quality-audit")) {
  issues.push("src/results/index.ts: missing quality-audit export");
}

for (const token of ["auditResultQuality", "qualityAudit", "projectAssetRoles", "repairIconCanvasEdges", "iconPostProcessing", "resultQualityTextTargets"]) {
  if (!worker.includes(token)) issues.push(`workspace-worker.ts: missing quality audit worker token ${token}`);
}

for (const token of [
  "renderResultQualityPill",
  "renderResultQualityPanel",
  "qualityFindingLabel",
  "result-quality-audit.v1",
  "Result Quality Audit",
]) {
  if (!centerBoard.includes(token)) issues.push(`center-board.js: missing result quality UI token ${token}`);
}

for (const token of [".result-quality-pill", ".result-quality-panel"]) {
  if (!styles.includes(token)) issues.push(`styles.css: missing result quality UI style ${token}`);
}

for (const [file, source] of [
  ["DECISIONS.md", decisions],
  ["ROADMAP.md", roadmap],
  ["TESTING.md", testing],
]) {
  if (!source.includes("Result Quality Audit")) {
    issues.push(`${file}: missing Result Quality Audit update`);
  }
}

if (!pkg.includes("result-quality-audit:check")) {
  issues.push("package.json: missing result-quality-audit:check script");
}

for (const forbidden of ["fetch(", "XMLHttpRequest", "axios", "localStorage", "sessionStorage", "generateImage("]) {
  if (audit.includes(forbidden)) {
    issues.push(`quality audit must not call providers, network, or browser storage (${forbidden})`);
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
  text = text.replace(/(from\s+["'])(\.?\.\/[^"']+)(["'])/g, (_match, start, specifier, end) =>
    `${start}${resolveRelativeSpecifier(filePath, specifier)}${end}`);
  writeFileSync(filePath, text, "utf8");
}

async function runRuntimeCheck() {
  const outDir = path.join(root, `.tmp-result-quality-audit-${Date.now()}`);
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

    const resultsModulePath = existsSync(path.join(outDir, "results", "index.js"))
      ? path.join(outDir, "results", "index.js")
      : path.join(outDir, "src", "results", "index.js");
    const results = await import(pathToFileURL(resultsModulePath).href);
    const sharp = (await import("sharp")).default;

    const maskedIconSvg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
        <rect width="64" height="64" fill="transparent"/>
        <rect x="5" y="5" width="54" height="54" rx="14" fill="#101010"/>
        <circle cx="32" cy="32" r="18" fill="#ffc857"/>
      </svg>
    `);
    const iconBytes = await sharp(maskedIconSvg).png().toBuffer();
    const iconAudit = await results.auditResultQuality({
      mode: "icon",
      dataUrl: `data:image/png;base64,${iconBytes.toString("base64")}`,
      width: 64,
      height: 64,
      targetWidth: 64,
      targetHeight: 64,
      assetRoles: ["subjectReference"],
    });
    if (!iconAudit.findings.some((item) => item.code === "icon-rounded-mask-risk")) {
      issues.push("icon quality audit should flag transparent/dark rounded mask risk");
    }
    const repairedIcon = await results.repairIconCanvasEdges({
      dataUrl: `data:image/png;base64,${iconBytes.toString("base64")}`,
      width: 64,
      height: 64,
    });
    if (repairedIcon.processing?.strategy !== "iconCanvasEdgeRepair") {
      issues.push("icon edge repair should record iconCanvasEdgeRepair processing");
    }
    const repairedAudit = await results.auditResultQuality({
      mode: "icon",
      dataUrl: repairedIcon.dataUrl,
      width: repairedIcon.width,
      height: repairedIcon.height,
      targetWidth: 64,
      targetHeight: 64,
      assetRoles: ["subjectReference"],
    });
    if (repairedAudit.findings.some((item) => item.code === "icon-rounded-mask-risk")) {
      issues.push("icon edge repair should reduce rounded mask audit risk");
    }

    const logoAudit = await results.auditResultQuality({
      mode: "logo",
      dataUrl: null,
      width: 1024,
      height: 1024,
      targetWidth: 1024,
      targetHeight: 1024,
      assetRoles: ["gameLogo"],
      textTargets: ["Pizza Kitchen Adventures Ultimate Saga"],
    });
    if (!logoAudit.findings.some((item) => item.code === "logo-text-accuracy-review")) {
      issues.push("logo quality audit should require text accuracy review");
    }
    if (!logoAudit.findings.some((item) => item.code === "logo-copy-safe-wordmark-fallback")) {
      issues.push("logo quality audit should recommend copy-safe wordmark fallback for complex lettering");
    }
    if (logoAudit.metrics.logoTextStrategy !== "copySafeBlankWordmark") {
      issues.push("logo quality audit should store copySafeBlankWordmark strategy for complex lettering");
    }

    const collabAudit = await results.auditResultQuality({
      mode: "collab",
      dataUrl: null,
      width: 1920,
      height: 1080,
      targetWidth: 1920,
      targetHeight: 1080,
      assetRoles: ["gameCharacter", "collabCharacter", "gameLogo"],
    });
    if (!collabAudit.findings.some((item) => item.code === "collab-missing-partner-brand-logo")) {
      issues.push("collab quality audit should flag missing partner brandLogo");
    }
  } finally {
    if (path.basename(outDir).startsWith(".tmp-result-quality-audit-")) {
      rmSync(outDir, { recursive: true, force: true });
    }
  }
}

await runRuntimeCheck();

if (issues.length > 0) {
  console.error("Result quality audit checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Result quality audit checks passed.");
