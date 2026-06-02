import { readFileSync } from "node:fs";

const issues = [];
const currentVersion = "1.1.0-rc.3";

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required multimode acceptance file`);
    return "";
  }
}

function requireIncludes(source, filePath, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) issues.push(`${filePath}: missing ${token}`);
  }
}

function requireExcludes(source, filePath, tokens) {
  for (const token of tokens) {
    if (source.includes(token)) issues.push(`${filePath}: must not include ${token}`);
  }
}

const pkg = read("package.json");
const acceptance = read("MULTIMODE_ACCEPTANCE.md");
const fixture = read("public/mock-assets/collab-partner-sundae-ranger.svg");
const userTesting = read("USER_TESTING.md");
const releaseChecklist = read("RELEASE_CHECKLIST.md");
const testing = read("TESTING.md");
const roadmap = read("ROADMAP.md");
const decisions = read("DECISIONS.md");
const slotDefinitions = read("src/assets/slot-definitions.ts");
const modeModels = read("src/schema/models.js");
const multimodeGate = read("tools/check-multimode-regression.mjs");
const resultAuditGate = read("tools/check-result-quality-audit.mjs");

requireIncludes(pkg, "package.json", [
  `"version": "${currentVersion}"`,
  "\"multimode-acceptance:check\"",
  "npm run multimode-acceptance:check",
]);

requireIncludes(acceptance, "MULTIMODE_ACCEPTANCE.md", [
  currentVersion,
  "Cost Rule",
  "Synthetic Collab Partner Asset",
  "public/mock-assets/collab-partner-sundae-ranger.svg",
  "Role: `collabCharacter`",
  "not a partner logo",
  "blank partner brand plate",
  "Poster:",
  "Icon:",
  "Logo:",
  "Announcement:",
  "Collab:",
  "max 1 real generation per mode",
  "Result Quality Audit",
  "npm run multimode-acceptance:check",
]);

requireIncludes(fixture, "public/mock-assets/collab-partner-sundae-ranger.svg", [
  "<svg",
  "id=\"sundae-ranger\"",
  "Synthetic Collab Partner Character",
  "collabCharacter visual reference fixture",
  "no readable brand text or logo",
]);
requireExcludes(fixture, "public/mock-assets/collab-partner-sundae-ranger.svg", [
  "<text",
  "font-family",
  "Pizza Kitchen",
  "Partner Brand",
]);

requireIncludes(userTesting, "USER_TESTING.md", [
  currentVersion,
  "MULTIMODE_ACCEPTANCE.md",
  "public/mock-assets/collab-partner-sundae-ranger.svg",
  "collabCharacter",
  "max 1 real generation per mode",
]);

requireIncludes(releaseChecklist, "RELEASE_CHECKLIST.md", [
  currentVersion,
  "npm run multimode-acceptance:check",
  "MULTIMODE_ACCEPTANCE.md",
  "public/mock-assets/collab-partner-sundae-ranger.svg",
]);

requireIncludes(testing, "TESTING.md", [
  "1.1.0-rc.3 Multimode Acceptance Matrix Release Update",
  "npm run multimode-acceptance:check",
  "public/mock-assets/collab-partner-sundae-ranger.svg",
]);

requireIncludes(roadmap, "ROADMAP.md", [
  "1.1.0-rc.3 Multimode Acceptance Matrix Release Update",
  "Synthetic Collab Partner Asset",
  "multimode-acceptance:check",
]);

requireIncludes(decisions, "DECISIONS.md", [
  "D106",
  "1.1.0-rc.3",
  "MULTIMODE_ACCEPTANCE.md",
  "collab-partner-sundae-ranger.svg",
]);

requireIncludes(slotDefinitions, "src/assets/slot-definitions.ts", [
  "collab-partner-character",
  "role: \"collabCharacter\"",
  "required: true",
  "Partner brand logo",
  "required: false",
]);

requireIncludes(modeModels, "src/schema/models.js", [
  "collab: [\"gameCharacter\", \"collabCharacter\", \"gameLogo\", \"brandLogo?\", \"background?\"]",
  "icon: [\"subjectReference|gameCharacter|prop|gameLogo\", \"compositionReference?\", \"styleReference?\"]",
]);

requireIncludes(multimodeGate, "tools/check-multimode-regression.mjs", [
  "asset-beta6-collab-partner",
  "\"collabCharacter\"",
  "independentCharacterIndex=",
  "blankPartnerBrandPlate",
  "uploadedPartnerBrandLockup",
]);

requireIncludes(resultAuditGate, "tools/check-result-quality-audit.mjs", [
  "collab-missing-partner-brand-logo",
  "collab-blank-partner-brand-plate",
  "icon-rounded-mask-risk",
  "announcement-copy-safe-panel-fallback",
  "logo-text-accuracy-review",
]);

if (issues.length > 0) {
  console.error("Multimode acceptance checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Multimode acceptance checks passed.");
