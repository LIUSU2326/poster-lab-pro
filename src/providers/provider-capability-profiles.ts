import type { ProductionMode, ProviderId } from "../schema/zod";
import type { ProviderImageCapabilityProfile } from "./contracts";
import { getProviderManifest } from "./manifests";

export function getProviderImageCapabilityProfile(providerId: ProviderId): ProviderImageCapabilityProfile {
  return getProviderManifest(providerId).imageGeneration;
}

export function providerImagePromptMaxChars(providerId: ProviderId): number {
  return getProviderImageCapabilityProfile(providerId).promptMaxChars;
}

export function providerUsesInlineImageReferences(providerId: ProviderId): boolean {
  return getProviderImageCapabilityProfile(providerId).referenceInput === "inlineParts";
}

export function providerUsesExtraBodyImageReferences(providerId: ProviderId): boolean {
  return getProviderImageCapabilityProfile(providerId).referenceInput === "extraBodyImage";
}

export function providerUsesMultipartEditImageReferences(providerId: ProviderId): boolean {
  return getProviderImageCapabilityProfile(providerId).referenceInput === "multipartEditImages";
}

export function providerRequiresCopySafeTextFallback(providerId: ProviderId): boolean {
  return getProviderImageCapabilityProfile(providerId).textRendering === "low";
}

export function providerCapabilityPromptNote(input: {
  providerId: ProviderId;
  mode: ProductionMode;
  hasReferenceAssets: boolean;
  hasTextTargets?: boolean;
}): string {
  const profile = getProviderImageCapabilityProfile(input.providerId);
  const lines = [
    "Provider Capability Adapter Contract:",
    "The creative/KV rules above are provider-neutral and must not be rewritten for this model. Apply only the provider capability handling below.",
    `Reference input mode: ${profile.referenceInput}; local reference handling: ${profile.localReferenceHandling}; prompt profile: ${profile.promptProfile}.`,
  ];

  if (input.hasReferenceAssets && profile.referenceInput === "extraBodyImage") {
    lines.push("Reference images are supplied as provider image inputs; use them as identity/semantic/brand anchors instead of treating prompt text as the only source.");
  } else if (input.hasReferenceAssets && profile.referenceInput === "multipartEditImages") {
    lines.push("Reference images are uploaded as multipart image edit inputs; visual references are binding identity/semantic/brand anchors, not prompt-only hints.");
  } else if (input.hasReferenceAssets && profile.referenceInput === "inlineParts") {
    lines.push("Reference images are supplied as inline visual parts; visual references override loose text guesses about identity, logo, prop, style, and composition.");
  } else if (input.hasReferenceAssets) {
    lines.push("This provider may receive references through prompt-described asset semantics only; follow semantic duties exactly and avoid invented replacements.");
  }

  if (profile.promptProfile === "compressed") {
    lines.push("Compressed prompt handling: prioritize identity locks, semantic duties, action/contact rules, logo/copy safety, and final hard exclusions over repeated examples.");
  }

  if (input.hasTextTargets && profile.textRendering === "low") {
    lines.push("Text rendering reliability is low: render exact text only if clean. Otherwise create a visible polished blank sign/ribbon/title plate in the intended copy area; do not omit the copy area or generate fake lettering.");
  }

  if (profile.notes.length > 0) {
    lines.push(`Provider notes: ${profile.notes.join(" ")}`);
  }

  return lines.join("\n");
}
