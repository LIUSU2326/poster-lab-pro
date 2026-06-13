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
  validateProviderConfigForm,
  validateSloganSettingsForm,
  validateStaticSchemaIntegrity,
} from "../src/schema/index.js";

const checks = [];

function addCheck(name, validationResult) {
  checks.push({ name, ...validationResult });
}

addCheck("static schema integrity", validateStaticSchemaIntegrity({ modeSpecs, providers }));
const projectBriefDefaults = createProjectBriefDefaults();
addCheck("project brief defaults are blank placeholders", {
  ok: projectBriefDefaults.projectName === "" && projectBriefDefaults.gameDescription === "",
  issues: [
    ...(projectBriefDefaults.projectName === "" ? [] : [{ path: "projectName", message: "Default project name should be blank." }]),
    ...(projectBriefDefaults.gameDescription === "" ? [] : [{ path: "gameDescription", message: "Default project description should be blank." }]),
  ],
});
addCheck("slogan defaults", validateSloganSettingsForm(createSloganSettingsDefaults()));

for (const mode of enums.productionMode) {
  addCheck(`${mode} output defaults`, validateOutputSettingsForm(mode, createOutputSettingsDefaults(mode)));

  const modeDefaults = createModeFormDefaults(mode);
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
