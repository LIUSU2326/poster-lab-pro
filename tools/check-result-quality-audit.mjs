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
  "announcement-copy-safe-panel-fallback",
  "announcementCopySafetyPolicy",
  "collab-missing-partner-brand-logo",
  "collab-blank-partner-brand-plate",
  "collabBrandSafetyPolicy",
  "local-overlay-fallback-applied",
  "tokenCost: 0",
  "poster-low-thumbnail-contrast-risk",
  "poster-logo-safe-treatment-review",
  "poster-slogan-copy-area-review",
  "poster-reference-integration-review",
  "second corner/bottom plaque",
  "multiple competing signboards",
  "posterCanvasMetrics",
  "iconLightCornerDarkEdgeContainerRisk",
  "iconVerticalEdgeDarkMarkRatio",
  "iconOuterEdgeColorMarkRatio",
  "iconOuterEdgeLightBackgroundRatio",
  "iconTopEdgeColorMarkRatio",
  "iconLeftEdgeColorMarkRatio",
  "iconEdgeTextMarkRisk",
  "icon-edge-text-mark-risk",
]) {
  if (!audit.includes(token)) issues.push(`quality-audit.ts: missing ${token}`);
}

for (const token of [
  "repairIconCanvasEdges",
  "iconCanvasEdgeRepair",
  "IconCanvasEdgeRepairProcessing",
  "edgeTextMarkRisk",
]) {
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
  "Result Quality Audit",
]) {
  if (centerBoard.includes(token)) issues.push(`center-board.js: removed result quality UI token should stay absent ${token}`);
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
    if (iconAudit.findings.some((item) => item.code === "icon-rounded-mask-risk")) {
      issues.push("icon quality audit should allow an intentional transparent rounded icon without white border/container risk");
    }
    if (iconAudit.metrics.iconTransparentCornerRisk !== true || iconAudit.metrics.iconDarkCornerContainerRisk !== true) {
      issues.push("icon quality audit should keep transparent/dark corner metrics as review data");
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
      issues.push("icon edge repair should not introduce high-contrast container audit risk");
    }

    const edgeMarkIconSvg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
        <rect width="128" height="128" fill="#f8f2d8"/>
        <circle cx="64" cy="64" r="37" fill="#ffbf45"/>
        <path d="M39 72 C48 44 80 43 90 72 C80 91 49 91 39 72Z" fill="#f97316"/>
        <rect x="28" y="0" width="12" height="9" fill="#ef4444"/>
        <rect x="49" y="0" width="12" height="9" fill="#f97316"/>
        <rect x="70" y="0" width="12" height="9" fill="#facc15"/>
        <rect x="0" y="36" width="9" height="7" fill="#050505"/>
        <rect x="0" y="49" width="9" height="7" fill="#050505"/>
        <rect x="0" y="62" width="9" height="7" fill="#050505"/>
        <rect x="0" y="76" width="9" height="7" fill="#ef4444"/>
        <rect x="119" y="41" width="9" height="7" fill="#050505"/>
        <rect x="119" y="54" width="9" height="7" fill="#050505"/>
        <rect x="119" y="67" width="9" height="7" fill="#050505"/>
        <rect x="119" y="81" width="9" height="7" fill="#f97316"/>
      </svg>
    `);
    const edgeMarkIconBytes = await sharp(edgeMarkIconSvg).png().toBuffer();
    const edgeMarkIconAudit = await results.auditResultQuality({
      mode: "icon",
      dataUrl: `data:image/png;base64,${edgeMarkIconBytes.toString("base64")}`,
      width: 128,
      height: 128,
      targetWidth: 128,
      targetHeight: 128,
      assetRoles: ["subjectReference"],
    });
    if (!edgeMarkIconAudit.findings.some((item) => item.code === "icon-edge-text-mark-risk")) {
      issues.push("icon quality audit should flag edge pseudo-text, digit, crop-mark, or side-label risk");
    }
    if (edgeMarkIconAudit.metrics.iconEdgeTextMarkRisk !== true) {
      issues.push("icon quality audit should store iconEdgeTextMarkRisk metric");
    }
    if (Number(edgeMarkIconAudit.metrics.iconOuterEdgeColorMarkRatio || 0) <= 0) {
      issues.push("icon quality audit should store outer colored edge mark ratio");
    }
    const repairedEdgeMarkIcon = await results.repairIconCanvasEdges({
      dataUrl: `data:image/png;base64,${edgeMarkIconBytes.toString("base64")}`,
      width: 128,
      height: 128,
      reason: "edgeTextMarkRisk",
    });
    if (repairedEdgeMarkIcon.processing?.reason !== "edgeTextMarkRisk") {
      issues.push("icon edge repair should record edgeTextMarkRisk reason");
    }
    const repairedEdgeMarkAudit = await results.auditResultQuality({
      mode: "icon",
      dataUrl: repairedEdgeMarkIcon.dataUrl,
      width: repairedEdgeMarkIcon.width,
      height: repairedEdgeMarkIcon.height,
      targetWidth: 128,
      targetHeight: 128,
      assetRoles: ["subjectReference"],
    });
    if (repairedEdgeMarkAudit.findings.some((item) => item.code === "icon-edge-text-mark-risk")) {
      issues.push("icon edge repair should reduce edge pseudo-text audit risk");
    }

    const whiteCornerBlackFrameIconSvg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
        <rect width="128" height="128" fill="#ffffff"/>
        <rect x="0" y="0" width="128" height="128" rx="24" fill="#050505"/>
        <rect x="10" y="10" width="108" height="108" rx="18" fill="#365f9d"/>
        <circle cx="64" cy="66" r="30" fill="#ffbf45"/>
        <path d="M40 70 C54 40 82 40 92 70 C80 88 54 90 40 70Z" fill="#f97316"/>
      </svg>
    `);
    const framedIconBytes = await sharp(whiteCornerBlackFrameIconSvg).png().toBuffer();
    const framedIconAudit = await results.auditResultQuality({
      mode: "icon",
      dataUrl: `data:image/png;base64,${framedIconBytes.toString("base64")}`,
      width: 128,
      height: 128,
      targetWidth: 128,
      targetHeight: 128,
      assetRoles: ["subjectReference"],
    });
    if (!framedIconAudit.findings.some((item) => item.code === "icon-rounded-mask-risk")) {
      issues.push("icon quality audit should flag white-corner dark-edge padded container risk");
    }
    if (framedIconAudit.metrics.iconLightCornerDarkEdgeContainerRisk !== true) {
      issues.push("icon quality audit should store light-corner dark-edge container metric");
    }
    const repairedFramedIcon = await results.repairIconCanvasEdges({
      dataUrl: `data:image/png;base64,${framedIconBytes.toString("base64")}`,
      width: 128,
      height: 128,
    });
    const repairedFramedAudit = await results.auditResultQuality({
      mode: "icon",
      dataUrl: repairedFramedIcon.dataUrl,
      width: repairedFramedIcon.width,
      height: repairedFramedIcon.height,
      targetWidth: 128,
      targetHeight: 128,
      assetRoles: ["subjectReference"],
    });
    if (repairedFramedAudit.findings.some((item) => item.code === "icon-rounded-mask-risk")) {
      issues.push("icon edge repair should reduce white-corner dark-edge container risk");
    }

    const flatPosterSvg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
        <rect width="1920" height="1080" fill="#888888"/>
        <rect x="780" y="420" width="360" height="240" fill="#8a8a8a"/>
      </svg>
    `);
    const posterBytes = await sharp(flatPosterSvg).png().toBuffer();
    const posterAudit = await results.auditResultQuality({
      mode: "poster",
      dataUrl: `data:image/png;base64,${posterBytes.toString("base64")}`,
      width: 1920,
      height: 1080,
      targetWidth: 1920,
      targetHeight: 1080,
      assetRoles: ["gameCharacter", "prop", "gameLogo"],
      textTargets: ["Serve Up Victory"],
    });
    for (const code of [
      "poster-low-thumbnail-contrast-risk",
      "poster-reference-integration-review",
      "poster-logo-safe-treatment-review",
      "poster-slogan-copy-area-review",
    ]) {
      if (!posterAudit.findings.some((item) => item.code === code)) {
        issues.push(`poster quality audit should flag ${code}`);
      }
    }
    if (posterAudit.metrics.posterHasLogoReference !== true || posterAudit.metrics.posterHasCopyTarget !== true) {
      issues.push("poster quality audit should store logo/copy target metrics");
    }

    const referencePanelPosterSvg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
        <rect width="1920" height="1080" fill="#4d8a9a"/>
        <rect width="640" height="1080" fill="#020202"/>
        <circle cx="340" cy="560" r="180" fill="#d07a2c"/>
      </svg>
    `);
    const referencePanelPosterBytes = await sharp(referencePanelPosterSvg).png().toBuffer();
    const referencePanelPosterAudit = await results.auditResultQuality({
      mode: "poster",
      dataUrl: `data:image/png;base64,${referencePanelPosterBytes.toString("base64")}`,
      width: 1920,
      height: 1080,
      targetWidth: 1920,
      targetHeight: 1080,
      assetRoles: ["gameCharacter", "prop", "gameLogo"],
      textTargets: ["Serve Up Victory"],
    });
    if (!referencePanelPosterAudit.findings.some((item) => item.code === "poster-reference-sheet-panel-risk" && item.severity === "warning")) {
      issues.push("poster quality audit should warn on copied reference-sheet or black side-panel compositions");
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

    const announcementAudit = await results.auditResultQuality({
      mode: "announcement",
      dataUrl: null,
      width: 1200,
      height: 627,
      targetWidth: 1200,
      targetHeight: 627,
      assetRoles: ["gameLogo"],
      textTargets: ["Scheduled Maintenance And Compensation Details For All Regions"],
    });
    if (!announcementAudit.findings.some((item) => item.code === "announcement-copy-safe-panel-fallback")) {
      issues.push("announcement quality audit should recommend blank copy-safe panel for complex operational title");
    }
    if (announcementAudit.metrics.announcementCopyStrategy !== "blankCopySafePanel") {
      issues.push("announcement quality audit should store blankCopySafePanel strategy for complex copy");
    }

    const collabAudit = await results.auditResultQuality({
      mode: "collab",
      dataUrl: null,
      width: 1920,
      height: 1080,
      targetWidth: 1920,
      targetHeight: 1080,
      assetRoles: ["gameCharacter", "collabCharacter", "gameLogo"],
      textTargets: ["Partner Brand"],
    });
    if (!collabAudit.findings.some((item) => item.code === "collab-missing-partner-brand-logo")) {
      issues.push("collab quality audit should flag missing partner brandLogo");
    }
    if (!collabAudit.findings.some((item) => item.code === "collab-blank-partner-brand-plate")) {
      issues.push("collab quality audit should recommend blank partner brand plate when partner brandLogo is missing");
    }
    if (collabAudit.metrics.collabPartnerBrandStrategy !== "blankPartnerBrandPlate") {
      issues.push("collab quality audit should store blankPartnerBrandPlate strategy when partner brandLogo is missing");
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
