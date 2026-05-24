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
      concept: ["gpt-4o", "gpt-4.1"],
      image: ["gpt-image-1"],
      styleReference: ["gpt-4o"],
      compositionReference: ["gpt-4o"],
      imageEdit: ["gpt-image-1"],
    },
    supportedModes: ["poster", "collab", "announcement", "logo", "icon"],
    notes: ["Primary planned provider for text planning and image generation."],
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
      concept: ["gemini-2.5-flash", "gemini-2.0-flash"],
      image: ["gemini-2.5-flash-image", "gemini-3.1-flash-image-preview"],
      styleReference: ["gemini-2.5-flash"],
      compositionReference: ["gemini-2.5-flash"],
    },
    supportedModes: ["poster", "collab", "announcement", "logo", "icon"],
    notes: ["Google AI Studio Gemini image provider for Nano Banana style generation."],
  }),
  replicate: ProviderManifestSchema.parse({
    id: "replicate",
    name: "replicate",
    displayName: "Replicate",
    baseUrlRequired: false,
    apiKeyRequired: true,
    capabilities: ["imageGeneration", "imageEdit", "upscale", "backgroundRemoval", "healthCheck", "costEstimate"],
    modelSlots: {
      image: ["black-forest-labs/flux", "ideogram-ai/ideogram-v3"],
      imageEdit: ["black-forest-labs/flux-fill"],
      upscale: ["nightmareai/real-esrgan"],
      backgroundRemoval: ["cjwbw/rembg"],
    },
    supportedModes: ["poster", "collab", "announcement", "logo", "icon"],
    notes: ["Planned experimental model pool for stylized output and post-processing."],
  }),
  comfy: ProviderManifestSchema.parse({
    id: "comfy",
    name: "comfy",
    displayName: "ComfyUI",
    baseUrlRequired: true,
    apiKeyRequired: false,
    capabilities: ["imageGeneration", "imageEdit", "upscale", "backgroundRemoval", "healthCheck"],
    modelSlots: {
      image: ["poster-lab-workflow"],
      imageEdit: ["poster-lab-edit-workflow"],
      upscale: ["poster-lab-upscale-workflow"],
      backgroundRemoval: ["poster-lab-remove-bg-workflow"],
    },
    supportedModes: ["poster", "collab", "announcement", "logo", "icon"],
    notes: ["Planned private workflow target. Static prototype does not call local services."],
  }),
  custom: ProviderManifestSchema.parse({
    id: "custom",
    name: "custom-http",
    displayName: "Custom HTTP",
    baseUrlRequired: true,
    apiKeyRequired: false,
    capabilities: ["imageGeneration", "imageEdit", "upscale", "backgroundRemoval", "healthCheck"],
    modelSlots: {
      image: ["custom-image-endpoint"],
      imageEdit: ["custom-edit-endpoint"],
      upscale: ["custom-upscale-endpoint"],
      backgroundRemoval: ["custom-background-removal-endpoint"],
    },
    supportedModes: ["poster", "collab", "announcement", "logo", "icon"],
    notes: ["Planned escape hatch for user-owned HTTP image services."],
  }),
} satisfies Record<ProviderManifest["id"], ProviderManifest>;

export const providerManifestList = Object.values(providerManifests);

export function getProviderManifest(providerId: ProviderManifest["id"]): ProviderManifest {
  return providerManifests[providerId];
}
