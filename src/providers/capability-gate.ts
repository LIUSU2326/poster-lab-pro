import type { ProductionMode, ProviderId } from "../schema/zod";
import type { ProviderCapability, ProviderModelSlot } from "./contracts";
import { getProviderManifest } from "./manifests";

type ProviderRoute = {
  providerId?: ProviderId | undefined;
  model?: string | undefined;
};

type CapabilityRequirement = {
  slot: ProviderModelSlot;
  capability: ProviderCapability;
  label: string;
  required: boolean;
};

export type ProviderCapabilityGateIssue = {
  severity: "error" | "warning";
  slot: ProviderModelSlot;
  label: string;
  providerId: ProviderId;
  providerName: string;
  capability: ProviderCapability;
  model?: string;
  message: string;
};

export type ProviderCapabilityGateResult = {
  ok: boolean;
  errors: ProviderCapabilityGateIssue[];
  warnings: ProviderCapabilityGateIssue[];
  requirements: Array<CapabilityRequirement & {
    providerId: ProviderId;
    providerName: string;
    model?: string;
  }>;
};

export type QueuePlanCapabilityGateInput = {
  mode: ProductionMode;
  providerId: ProviderId;
  providerRoutes?: Partial<Record<string, ProviderRoute>>;
  regenerateSchemes?: boolean;
  includeImageGeneration?: boolean;
  includeImageEdit?: boolean;
  includeUpscale?: boolean;
  includeBackgroundRemoval?: boolean;
};

const SLOT_REQUIREMENTS: Record<ProviderModelSlot, CapabilityRequirement> = {
  concept: {
    slot: "concept",
    capability: "briefGeneration",
    label: "方案生成",
    required: true,
  },
  image: {
    slot: "image",
    capability: "imageGeneration",
    label: "图像生成",
    required: true,
  },
  styleReference: {
    slot: "styleReference",
    capability: "styleReferenceAnalysis",
    label: "画风参考分析",
    required: false,
  },
  compositionReference: {
    slot: "compositionReference",
    capability: "compositionReferenceAnalysis",
    label: "构图参考分析",
    required: false,
  },
  imageEdit: {
    slot: "imageEdit",
    capability: "imageEdit",
    label: "图像编辑",
    required: false,
  },
  upscale: {
    slot: "upscale",
    capability: "upscale",
    label: "高清放大",
    required: false,
  },
  backgroundRemoval: {
    slot: "backgroundRemoval",
    capability: "backgroundRemoval",
    label: "背景移除",
    required: false,
  },
};

function routeForSlot(input: QueuePlanCapabilityGateInput, slot: ProviderModelSlot): {
  providerId: ProviderId;
  model?: string;
} {
  const route = input.providerRoutes?.[slot];
  return {
    providerId: route?.providerId || input.providerId,
    ...(route?.model ? { model: route.model } : {}),
  };
}

function requiredQueueSlots(input: QueuePlanCapabilityGateInput): ProviderModelSlot[] {
  const slots: ProviderModelSlot[] = [];
  if (input.regenerateSchemes !== false) slots.push("concept");
  if (input.includeImageGeneration !== false) slots.push("image");
  if (input.includeImageEdit) slots.push("imageEdit");
  if (input.includeUpscale) slots.push("upscale");
  if (input.includeBackgroundRemoval) slots.push("backgroundRemoval");
  return slots;
}

function modelWarning(input: {
  slot: ProviderModelSlot;
  label: string;
  providerId: ProviderId;
  model?: string;
}): ProviderCapabilityGateIssue | null {
  const model = input.model?.trim();
  if (!model) return null;
  const manifest = getProviderManifest(input.providerId);
  const knownModels = manifest.modelSlots[input.slot] || [];
  if (knownModels.length === 0 || knownModels.includes(model)) return null;

  return {
    severity: "warning",
    slot: input.slot,
    label: input.label,
    providerId: input.providerId,
    providerName: manifest.displayName,
    capability: SLOT_REQUIREMENTS[input.slot].capability,
    model,
    message: `${manifest.displayName} 的 ${input.label} 模型 ${model} 不在内置支持列表中，请先测试当前配置方案确认可用。`,
  };
}

export function evaluateProviderRouteCapabilityGate(input: {
  mode: ProductionMode;
  routes: Partial<Record<ProviderModelSlot, ProviderRoute>>;
  requiredSlots?: ProviderModelSlot[];
}): ProviderCapabilityGateResult {
  const requiredSlots = input.requiredSlots || ["concept", "image"];
  const requirements = requiredSlots.map((slot) => {
    const requirement = SLOT_REQUIREMENTS[slot];
    const route = input.routes[slot] || {};
    const providerId = route.providerId || "openai";
    const manifest = getProviderManifest(providerId);
    return {
      ...requirement,
      providerId,
      providerName: manifest.displayName,
      ...(route.model ? { model: route.model } : {}),
    };
  });
  const errors: ProviderCapabilityGateIssue[] = [];
  const warnings: ProviderCapabilityGateIssue[] = [];

  for (const requirement of requirements) {
    const manifest = getProviderManifest(requirement.providerId);
    if (!manifest.supportedModes.includes(input.mode)) {
      errors.push({
        severity: "error",
        slot: requirement.slot,
        label: requirement.label,
        providerId: requirement.providerId,
        providerName: manifest.displayName,
        capability: requirement.capability,
        ...(requirement.model ? { model: requirement.model } : {}),
        message: `${manifest.displayName} 当前未声明支持 ${input.mode} 模式。`,
      });
      continue;
    }
    if (!manifest.capabilities.includes(requirement.capability)) {
      errors.push({
        severity: "error",
        slot: requirement.slot,
        label: requirement.label,
        providerId: requirement.providerId,
        providerName: manifest.displayName,
        capability: requirement.capability,
        ...(requirement.model ? { model: requirement.model } : {}),
        message: `${manifest.displayName} 不支持 ${requirement.label} 所需能力 ${requirement.capability}。`,
      });
      continue;
    }
    if (!(manifest.modelSlots[requirement.slot]?.length)) {
      errors.push({
        severity: "error",
        slot: requirement.slot,
        label: requirement.label,
        providerId: requirement.providerId,
        providerName: manifest.displayName,
        capability: requirement.capability,
        ...(requirement.model ? { model: requirement.model } : {}),
        message: `${manifest.displayName} 没有可用于 ${requirement.label} 的模型槽。`,
      });
      continue;
    }

    const warning = modelWarning(requirement);
    if (warning) warnings.push(warning);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    requirements,
  };
}

export function evaluateQueuePlanCapabilityGate(
  input: QueuePlanCapabilityGateInput,
): ProviderCapabilityGateResult {
  const requiredSlots = requiredQueueSlots(input);
  const routes = Object.fromEntries(
    requiredSlots.map((slot) => [slot, routeForSlot(input, slot)]),
  ) as Partial<Record<ProviderModelSlot, ProviderRoute>>;

  return evaluateProviderRouteCapabilityGate({
    mode: input.mode,
    routes,
    requiredSlots,
  });
}

export function providerCapabilityGateUserMessage(result: ProviderCapabilityGateResult): string {
  const first = result.errors[0] || result.warnings[0];
  return first
    ? first.message
    : "当前模型配置满足这个生成流程。";
}
