import { readFileSync } from "node:fs";

const issues = [];

function read(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    issues.push(`${filePath}: missing required file`);
    return "";
  }
}

const client = read("src/provider-credential-client.js");
const settings = read("src/render/settings-sheet.js");
const events = read("src/events.js");
const state = read("src/state.js");
const styles = read("styles.css");
const pkg = read("package.json");

for (const token of [
  "loadProviderCredentialStatusForWorkbench",
  "saveProviderCredentialForWorkbench",
  "revokeProviderCredentialForWorkbench",
  "testProviderConnectionForWorkbench",
  "provider-credentials",
  "connection-test",
  "loadWorkspaceSnapshotForWorkbench",
]) {
  if (!client.includes(token)) issues.push(`provider-credential-client.js: missing ${token}`);
}

for (const token of [
  "data-provider-api-key",
  "save-provider-key",
  "refresh-provider-key",
  "revoke-provider-key",
  "test-provider-connection",
  "credential-status",
  "connection-test-status",
  "本地加密凭证库",
]) {
  if (!settings.includes(token)) issues.push(`settings-sheet.js: missing ${token}`);
}

for (const token of [
  "saveProviderCredentialForWorkbench",
  "revokeProviderCredentialForWorkbench",
  "loadProviderCredentialStatusForWorkbench",
  "testProviderConnectionForWorkbench",
  "请输入 API Key 后再保存。",
]) {
  if (!events.includes(token)) issues.push(`events.js: missing ${token}`);
}

if (!state.includes("providerCredential")) {
  issues.push("state.js: missing providerCredential runtime state");
}
if (!state.includes("providerConnection")) {
  issues.push("state.js: missing providerConnection runtime state");
}

for (const token of [".credential-status", ".credential-status.success", ".credential-status.error", ".connection-test-status"]) {
  if (!styles.includes(token)) issues.push(`styles.css: missing ${token}`);
}

if (!pkg.includes("provider-credential-ui:check")) {
  issues.push("package.json: missing provider-credential-ui:check script");
}

for (const forbidden of ["api.openai.com", "generateImage(", "localStorage", "sessionStorage"]) {
  if ([client, settings, events].join("\n").includes(forbidden)) {
    issues.push(`provider credential UI must not call live providers or store browser credentials (${forbidden})`);
  }
}

if (settings.includes('value="${maskedKey')) {
  issues.push("settings-sheet.js: API Key input must not render the masked key as a value");
}

if (issues.length > 0) {
  console.error("Provider credential UI checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Provider credential UI checks passed.");
