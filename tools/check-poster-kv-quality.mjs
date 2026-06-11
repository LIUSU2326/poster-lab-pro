import { readFileSync } from "node:fs";

const issues = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing required poster KV quality file`);
    return "";
  }
}

const qa = read("POSTER_QA.md");
const architectures = read("src/providers/poster-kv-architectures.ts");
const schemeSanitizer = read("src/providers/poster-scheme-sanitizer.ts");
const requestMapper = read("src/providers/request-mapper.ts");
const googleAdapter = read("src/providers/google-live-adapter.ts");
const openAiBriefAdapter = read("src/providers/openai-compatible-brief-adapter.ts");
const promptBuilder = read("src/prompts/builder.ts");
const worker = read("src/queue/workspace-worker.ts");
const providerRequestCheck = read("tools/check-provider-request-mapper.mjs");
const googleCheck = read("tools/check-google-live-adapter.mjs");
const promptCheck = read("tools/check-prompt-contract.mjs");
const pkg = read("package.json");

for (const token of [
  "V0.4.1 Stability Gate",
  "V0.4.2 Scheme Quality Gate",
  "AI integrated redraw is the default path",
  "Local asset overlay is disabled by default",
  "exactly one campaign logo treatment",
  "scene-derived slogan treatment",
  "12000-character provider prompt budget",
  "camera/lens/perspective",
  "foreground-midground-background",
  "Stop after 1-2 paid generations",
]) {
  if (!qa.includes(token)) issues.push(`POSTER_QA.md: missing acceptance item ${token}`);
}

const architectureCount = (architectures.match(/titleZh:/g) || []).length;
if (architectureCount < 12) {
  issues.push(`poster-kv-architectures.ts: expected at least 12 KV architectures, found ${architectureCount}`);
}

for (const token of [
  "Base defense siege KV",
  "High-speed pursuit KV",
  "Portal or breach reveal KV",
  "Victory trophy payoff KV",
  "Giant-scale pressure KV",
  "Objective pressure eruption KV",
  "KV architecture and scenario diversity requirement",
]) {
  if (!architectures.includes(token)) issues.push(`poster-kv-architectures.ts: missing architecture ${token}`);
}

for (const token of [
  "posterHeroPerformanceScaleLock",
  "posterLogoSingleUseLock",
  "posterSubjectAccessoryStrictnessLock",
  "posterFocalHierarchyLock",
  "posterTextEconomyLock",
  "posterInWorldBrandTreatmentLock",
  "posterStaticSchemeLanguageBan",
  "posterSchemeBlueprintRequirement",
  "posterKvArchitectureDiversityRequirement",
]) {
  if (!architectures.includes(`export function ${token}`)) {
    issues.push(`poster-kv-architectures.ts: missing exported quality rule ${token}`);
  }
}

	for (const [file, source] of [
	  ["src/providers/google-live-adapter.ts", googleAdapter],
	  ["src/providers/openai-compatible-brief-adapter.ts", openAiBriefAdapter],
	]) {
  for (const token of [
    "posterStaticSchemeLanguageBan",
    "posterSchemeBlueprintRequirement",
    "posterKvArchitectureDiversityRequirement",
    "posterHeroPerformanceScaleLock",
    "posterLogoSingleUseLock",
    "posterSubjectAccessoryStrictnessLock",
    "posterFocalHierarchyLock",
    "posterTextEconomyLock",
    "posterInWorldBrandTreatmentLock",
  ]) {
    if (!source.includes(token)) issues.push(`${file}: missing brief-stage poster quality rule ${token}`);
  }
	  if (!source.includes("sanitizePosterSchemeText")) {
	    issues.push(`${file}: missing brief-stage poster scheme sanitizer`);
	  }
	  for (const token of [
	    "modeBriefRules",
	    "Icon mode hard lock",
	    "slogans must be an empty object for icon mode",
	    "requiredKvArchitectureSlots",
	    "Batch diversity hard lock",
	  ]) {
	    if (!source.includes(token)) issues.push(`${file}: missing mode-aware brief guard token ${token}`);
	  }
	  if (!source.includes("request.context.mode !== \"poster\"")) {
	    issues.push(`${file}: non-poster brief generation must bypass poster KV prompt construction`);
	  }
	}

for (const token of [
  "export function sanitizePosterSchemeText",
  "POSTER_SCHEME_SANITIZER_LIVE_FAILURE_TERMS",
  "bread shield",
  "large pink hammer",
  "面包盾牌",
  "粉色大锤",
  "using only visible uploaded prop/tool if present",
]) {
  if (!schemeSanitizer.includes(token)) {
    issues.push(`poster-scheme-sanitizer.ts: missing sanitizer guard token ${token}`);
  }
}

for (const token of [
  "Default pipeline: AI integrated redraw",
  "posterHeroPerformanceScaleLock",
  "posterLogoSingleUseLock",
  "posterSubjectAccessoryStrictnessLock",
  "posterFocalHierarchyLock",
  "posterTextEconomyLock",
  "posterInWorldBrandTreatmentLock",
  "Static scheme action rewrite",
  "Scenario uniqueness lock",
  "Placeholder annotation rule",
  "Slogan visibility requirement",
  "Multi-character hero requirement",
  "Render every listed uploaded protagonist",
  "all uploaded characters must be visible as separate readable characters",
  "selected style library tag",
  "retro pixel art / arcade pixel key art",
  "crisp square pixels",
  "styleReference visual guide",
  "uploaded character art direction",
  "When focus guidance is active",
]) {
  if (!requestMapper.includes(token)) issues.push(`request-mapper.ts: missing provider prompt lock ${token}`);
}

for (const token of [
  "Hero performance scale lock",
  "Logo single-use lock",
  "Uploaded subject accessory lock",
  "Static scheme language ban",
  "Scheme blueprint requirement",
  "KV architecture diversity requirement",
  "Focal hierarchy lock",
  "Text economy lock",
  "In-world brand treatment lock",
  "Multi-character usage requirement",
  "Focus guidance impact requirement",
  "retro pixel art / arcade pixel key art",
]) {
  if (!promptBuilder.includes(token) && !architectures.includes(token)) {
    issues.push(`prompt/architecture layer missing poster QA token ${token}`);
  }
}

for (const [file, source] of [
  ["src/providers/google-live-adapter.ts", googleAdapter],
  ["src/providers/openai-compatible-brief-adapter.ts", openAiBriefAdapter],
]) {
  for (const token of [
    "every uploaded protagonist",
    "separate readable",
    "focusGuidance is active",
  ]) {
    if (!source.includes(token)) issues.push(`${file}: missing multi-character/focus prompt guard ${token}`);
  }
}

if (!worker.includes("process.env.POSTER_LAB_FORCE_ASSET_OVERLAY === \"1\"")) {
  issues.push("workspace-worker.ts: missing explicit overlay force gate");
}
if (!worker.includes("metadataBoolean(task.output.metadata.assetOverlayFallback)") ||
    !worker.includes("metadataBoolean(task.output.metadata.posterAssetOverlayFallback)")) {
  issues.push("workspace-worker.ts: overlay fallback must require explicit task metadata");
}

for (const [file, source] of [
  ["tools/check-provider-request-mapper.mjs", providerRequestCheck],
  ["tools/check-google-live-adapter.mjs", googleCheck],
  ["tools/check-prompt-contract.mjs", promptCheck],
]) {
  for (const [functionToken, promptToken] of [
    ["posterHeroPerformanceScaleLock", "Hero performance scale lock"],
    ["posterLogoSingleUseLock", "Logo single-use lock"],
    ["posterSubjectAccessoryStrictnessLock", "Uploaded subject accessory lock"],
    ["posterFocalHierarchyLock", "Focal hierarchy lock"],
    ["posterTextEconomyLock", "Text economy lock"],
    ["posterInWorldBrandTreatmentLock", "In-world brand treatment lock"],
  ]) {
    if (!source.includes(functionToken) && !source.includes(promptToken)) {
      issues.push(`${file}: missing regression token ${functionToken} / ${promptToken}`);
    }
  }
}

if (!pkg.includes("\"poster-kv-quality:check\"")) {
  issues.push("package.json: missing poster-kv-quality:check script");
}
if (!pkg.includes("npm run poster-kv-quality:check")) {
  issues.push("package.json: main check script must include poster-kv-quality:check");
}

if (issues.length > 0) {
  console.error("Poster KV quality checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Poster KV quality checks passed.");
