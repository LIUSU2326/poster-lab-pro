import { ProviderManifestSchema, type ProviderManifest } from "./contracts";

export const providerManifests = {
  openai: ProviderManifestSchema.parse({
    id: "openai",
    name: "openai",
    displayName: "OpenAI",
    baseUrlRequired: false,
    apiKeyRequired: true,
    capabilities: [
      "briefGeneration",
      "imageGeneration",
      "imageEdit",
      "styleReferenceAnalysis",
      "compositionReferenceAnalysis",
      "healthCheck",
      "costEstimate",
    ],
    modelSlots: {
      concept: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1"],
      image: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"],
      styleReference: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1"],
      compositionReference: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1"],
      imageEdit: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"],
    },
    supportedModes: ["poster", "collab", "announcement", "logo", "icon"],
    notes: ["Primary planned provider for text planning and image generation."],
  }),
  aigocode: ProviderManifestSchema.parse({
    id: "aigocode",
    name: "aigocode-openai-compatible",
    displayName: "AIGoCode",
    baseUrlRequired: false,
    apiKeyRequired: true,
    capabilities: [
      "briefGeneration",
      "imageGeneration",
      "imageEdit",
      "styleReferenceAnalysis",
      "compositionReferenceAnalysis",
      "healthCheck",
      "costEstimate",
    ],
    modelSlots: {
      concept: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1"],
      image: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "dall-e-3"],
      styleReference: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1"],
      compositionReference: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1"],
      imageEdit: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"],
    },
    supportedModes: ["poster", "collab", "announcement", "logo", "icon"],
    notes: ["OpenAI-compatible relay provider for AIGoCode API keys and model-list diagnostics."],
  }),
  google: ProviderManifestSchema.parse({
    id: "google",
    name: "google-ai-studio",
    displayName: "Google AI Studio",
    baseUrlRequired: false,
    apiKeyRequired: true,
    capabilities: [
      "briefGeneration",
      "imageGeneration",
      "styleReferenceAnalysis",
      "compositionReferenceAnalysis",
      "healthCheck",
      "costEstimate",
    ],
    modelSlots: {
      concept: ["gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-2.5-pro", "gemini-2.5-flash"],
      image: ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
      styleReference: ["gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-2.5-pro"],
      compositionReference: ["gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-2.5-pro"],
    },
    supportedModes: ["poster", "collab", "announcement", "logo", "icon"],
    notes: ["Google AI Studio Gemini image provider for Nano Banana style generation."],
  }),
  deepseek: ProviderManifestSchema.parse({
    id: "deepseek",
    name: "deepseek",
    displayName: "DeepSeek",
    baseUrlRequired: false,
    apiKeyRequired: true,
    capabilities: ["briefGeneration", "healthCheck", "costEstimate"],
    modelSlots: {
      concept: ["deepseek-v4-flash", "deepseek-v4-pro"],
    },
    supportedModes: ["poster", "collab", "announcement", "logo", "icon"],
    notes: ["Text planning and reasoning provider. Image output should route to an image-capable provider."],
  }),
  claude: ProviderManifestSchema.parse({
    id: "claude",
    name: "anthropic-claude",
    displayName: "Claude",
    baseUrlRequired: false,
    apiKeyRequired: true,
    capabilities: ["briefGeneration", "styleReferenceAnalysis", "compositionReferenceAnalysis", "healthCheck", "costEstimate"],
    modelSlots: {
      concept: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-haiku-4-5-20251001", "claude-opus-4-6"],
      styleReference: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-haiku-4-5-20251001"],
      compositionReference: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-haiku-4-5-20251001"],
    },
    supportedModes: ["poster", "collab", "announcement", "logo", "icon"],
    notes: ["Claude provider for planning, copy, and visual reference understanding."],
  }),
  qwen: ProviderManifestSchema.parse({
    id: "qwen",
    name: "qwen",
    displayName: "Qwen",
    baseUrlRequired: false,
    apiKeyRequired: true,
    capabilities: ["briefGeneration", "imageGeneration", "styleReferenceAnalysis", "compositionReferenceAnalysis", "healthCheck", "costEstimate"],
    modelSlots: {
      concept: ["qwen3.7-max", "qwen3.6-max-preview", "qwen3.6-plus", "qwen3.6-flash"],
      image: ["wan2.7-image-pro", "wan2.7-image", "qwen-image-2.0-pro", "qwen-image-2.0"],
      styleReference: ["qwen3.6-plus", "qwen3.5-flash", "qwen3.5-plus"],
      compositionReference: ["qwen3.6-plus", "qwen3.5-flash", "qwen3.5-plus"],
    },
    supportedModes: ["poster", "collab", "announcement", "logo", "icon"],
    notes: ["Qwen provider for Chinese planning, multimodal reference analysis, and supported image models."],
  }),
} satisfies Record<ProviderManifest["id"], ProviderManifest>;

export const providerManifestList = Object.values(providerManifests);

export function getProviderManifest(providerId: ProviderManifest["id"]): ProviderManifest {
  return providerManifests[providerId];
}
