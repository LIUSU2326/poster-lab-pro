import { modeSpecs } from "../src/data/modes.js";
import { providers } from "../src/data/providers.js";
import {
  createModeFormDefaults,
  createOutputSettingsDefaults,
  createProjectBriefDefaults,
  createProviderConfigDefaults,
  createSloganSettingsDefaults,
  enums,
  validateModeForm,
  validateOutputSettingsForm,
  validateProjectBriefForm,
  validateProviderConfigForm,
  validateSloganSettingsForm,
  validateStaticSchemaIntegrity,
} from "../src/schema/index.js";

const checks = [];

function addCheck(name, validationResult) {
  checks.push({ name, ...validationResult });
}

addCheck("static schema integrity", validateStaticSchemaIntegrity({ modeSpecs, providers }));
addCheck("project brief defaults", validateProjectBriefForm(createProjectBriefDefaults()));
addCheck("slogan defaults", validateSloganSettingsForm(createSloganSettingsDefaults()));

for (const mode of enums.productionMode) {
  addCheck(`${mode} output defaults`, validateOutputSettingsForm(mode, createOutputSettingsDefaults(mode)));

  const modeDefaults = createModeFormDefaults(mode);
  if (mode === "collab") modeDefaults.collabBrandName = "Partner Brand";
  if (mode === "announcement") modeDefaults.announcementTitle = "Scheduled Maintenance";
  addCheck(`${mode} mode defaults`, validateModeForm(mode, modeDefaults));
}

for (const provider of providers) {
  addCheck(`${provider.id} provider defaults`, validateProviderConfigForm(createProviderConfigDefaults(provider.id)));
}

const failed = checks.filter((check) => !check.ok);

if (failed.length > 0) {
  console.error("Schema checks failed:");
  for (const check of failed) {
    console.error(`\n- ${check.name}`);
    for (const issue of check.issues) {
      console.error(`  ${issue.path}: ${issue.message}`);
    }
  }
  process.exit(1);
}

console.log(`Schema checks passed (${checks.length} checks).`);
