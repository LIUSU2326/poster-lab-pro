import { readFileSync } from "node:fs";
import {
  evaluateProviderRouteCapabilityGate,
  evaluateQueuePlanCapabilityGate,
  providerCapabilityGateUserMessage,
  resolveResultOperationRoute,
} from "../src/provider-capabilities.js";

const issues = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    issues.push(`${path}: missing provider capability gate source`);
    return "";
  }
}

function assert(condition, message) {
  if (!condition) issues.push(message);
}

const tsGate = read("src/providers/capability-gate.ts");
const jsGate = read("src/provider-capabilities.js");
const service = read("src/api/service.ts");
const staticService = read("src/static-local-api-service.js");
const formBinding = read("src/form-binding.js");
const configPanel = read("src/render/config-panel.js");
const apiContracts = read("src/api/contracts.ts");
const nextResponse = read("src/api/next-response.ts");
const providerIndex = read("src/providers/index.ts");

for (const token of [
  "evaluateQueuePlanCapabilityGate",
  "evaluateProviderRouteCapabilityGate",
  "providerCapabilityGateUserMessage",
  "styleReferenceAnalysis",
  "compositionReferenceAnalysis",
]) {
  assert(tsGate.includes(token), `capability-gate.ts: missing ${token}`);
  assert(jsGate.includes(token), `provider-capabilities.js: missing ${token}`);
}

assert(jsGate.includes("resolveResultOperationRoute"), "provider-capabilities.js: missing resolveResultOperationRoute");

for (const [fileName, source] of [
  ["service.ts", service],
  ["static-local-api-service.js", staticService],
  ["form-binding.js", formBinding],
]) {
  assert(source.includes("evaluateQueuePlanCapabilityGate"), `${fileName}: queue-plan capability gate must run before generation`);
  assert(source.includes("unsupported_capability") || source.includes("providerCapabilities"), `${fileName}: missing capability failure plumbing`);
}

assert(configPanel.includes("model-capability-note"), "config-panel.js: model capability note must be visible in UI");
assert(configPanel.includes("evaluateProviderRouteCapabilityGate"), "config-panel.js: routing summary must evaluate route capabilities");
assert(apiContracts.includes("unsupported_capability"), "contracts.ts: API error code must include unsupported_capability");
assert(nextResponse.includes("unsupported_capability: 422"), "next-response.ts: unsupported_capability must map to 422");
assert(providerIndex.includes("evaluateQueuePlanCapabilityGate"), "providers/index.ts: capability gate must be exported");

const agnesAllCore = evaluateQueuePlanCapabilityGate({
  mode: "poster",
  providerId: "agnes",
  providerRoutes: {
    concept: { providerId: "agnes", model: "agnes-2.0-flash" },
    image: { providerId: "agnes", model: "agnes-image-2.1-flash" },
  },
  regenerateSchemes: true,
  includeImageGeneration: true,
});
assert(agnesAllCore.ok, `Agnes all-core poster route should pass: ${providerCapabilityGateUserMessage(agnesAllCore)}`);

const deepseekImage = evaluateQueuePlanCapabilityGate({
  mode: "poster",
  providerId: "deepseek",
  providerRoutes: {
    concept: { providerId: "deepseek", model: "deepseek-v4-flash" },
    image: { providerId: "deepseek", model: "deepseek-v4-flash" },
  },
  regenerateSchemes: true,
  includeImageGeneration: true,
});
assert(!deepseekImage.ok, "DeepSeek image route must be blocked because it lacks imageGeneration");
assert(
  providerCapabilityGateUserMessage(deepseekImage).includes("图像生成"),
  "DeepSeek image block should explain the image-generation slot",
);

const agnesReferenceAnalysis = evaluateProviderRouteCapabilityGate({
  mode: "poster",
  routes: {
    styleReference: { providerId: "agnes", model: "agnes-2.0-flash" },
    compositionReference: { providerId: "agnes", model: "agnes-2.0-flash" },
  },
  requiredSlots: ["styleReference", "compositionReference"],
});
assert(!agnesReferenceAnalysis.ok, "Agnes must not be marked as supporting style/composition reference analysis");
assert(
  agnesReferenceAnalysis.errors.some((issue) => issue.capability === "styleReferenceAnalysis"),
  "Agnes reference analysis gate should report missing styleReferenceAnalysis",
);
assert(
  agnesReferenceAnalysis.errors.some((issue) => issue.capability === "compositionReferenceAnalysis"),
  "Agnes reference analysis gate should report missing compositionReferenceAnalysis",
);

const customOpenAIModel = evaluateQueuePlanCapabilityGate({
  mode: "icon",
  providerId: "openai",
  providerRoutes: {
    concept: { providerId: "openai", model: "gpt-5.5" },
    image: { providerId: "openai", model: "custom-image-model" },
  },
  regenerateSchemes: true,
  includeImageGeneration: true,
});
assert(customOpenAIModel.ok, "Custom model names should not hard-block when provider capability exists");
assert(customOpenAIModel.warnings.length === 1, "Custom model names should produce one confirmation warning");

const googleVariantRoute = resolveResultOperationRoute("variant", "google");
assert(!googleVariantRoute.supported, "Google result variant route must not silently fallback to OpenAI");
assert(
  googleVariantRoute.title.includes("Google AI Studio 不支持变体") && googleVariantRoute.title.includes("请切换"),
  "Google unsupported result operation should explain the provider switch instead of fallback routing",
);

const agnesVariantRoute = resolveResultOperationRoute("variant", "agnes");
assert(agnesVariantRoute.supported, "Agnes result variant route should be enabled because it supports imageEdit");
assert(agnesVariantRoute.providerId === "agnes", "Agnes variant route should remain on Agnes");

const agnesUpscaleRoute = resolveResultOperationRoute("upscale", "agnes");
assert(!agnesUpscaleRoute.supported, "Agnes upscale route should be blocked when the provider lacks upscale capability");
assert(
  agnesUpscaleRoute.title.includes("Agnes AI 不支持高清放大") || agnesUpscaleRoute.title.includes("当前没有供应商声明支持"),
  "Agnes unsupported upscale route should show an explicit capability explanation",
);

if (issues.length > 0) {
  console.error("Provider capability gate checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Provider capability gate checks passed.");
