export const providerLabels = {
  openai: "OpenAI",
  aigocode: "AIGoCode",
  custom: "自定义中转",
  google: "Google AI Studio",
  deepseek: "DeepSeek",
  claude: "Claude",
  qwen: "Qwen",
  agnes: "Agnes AI",
  mimo: "小米 MiMo",
};

export const providerCapabilities = {
  openai: ["briefGeneration", "imageGeneration", "imageEdit", "styleReferenceAnalysis", "compositionReferenceAnalysis"],
  aigocode: ["briefGeneration", "imageGeneration", "imageEdit", "styleReferenceAnalysis", "compositionReferenceAnalysis"],
  custom: ["briefGeneration", "imageGeneration", "imageEdit", "styleReferenceAnalysis", "compositionReferenceAnalysis"],
  google: ["briefGeneration", "imageGeneration", "styleReferenceAnalysis", "compositionReferenceAnalysis"],
  deepseek: ["briefGeneration"],
  claude: ["briefGeneration", "styleReferenceAnalysis", "compositionReferenceAnalysis"],
  qwen: ["briefGeneration", "styleReferenceAnalysis", "compositionReferenceAnalysis"],
  agnes: ["briefGeneration", "imageGeneration", "imageEdit"],
  mimo: ["briefGeneration", "styleReferenceAnalysis", "compositionReferenceAnalysis"],
};

export const providerModelSlots = {
  openai: {
    concept: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1"],
    image: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"],
    styleReference: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1"],
    compositionReference: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1"],
    imageEdit: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"],
  },
  aigocode: {
    concept: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1"],
    image: ["gpt-image-1", "gpt-image-2", "gpt-image-1.5", "image-2", "image-1", "dall-e-3"],
    styleReference: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1"],
    compositionReference: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.1"],
    imageEdit: ["gpt-image-1", "gpt-image-2", "gpt-image-1.5", "image-2", "image-1"],
  },
  custom: {
    concept: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.2", "gpt-5.1"],
    image: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "image-2", "image-1", "dall-e-3"],
    styleReference: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.2", "gpt-5.1"],
    compositionReference: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.2", "gpt-5.1"],
    imageEdit: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "image-2", "image-1"],
  },
  google: {
    concept: ["gemini-2.5-flash", "gemini-2.5-pro"],
    image: ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
    styleReference: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-pro-image-preview"],
    compositionReference: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-pro-image-preview"],
  },
  deepseek: {
    concept: ["deepseek-v4-flash", "deepseek-v4-pro"],
  },
  claude: {
    concept: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-haiku-4-5-20251001", "claude-opus-4-6"],
    styleReference: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-haiku-4-5-20251001"],
    compositionReference: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-haiku-4-5-20251001"],
  },
  qwen: {
    concept: ["qwen3.7-max", "qwen3.6-max-preview", "qwen3.6-plus", "qwen3.6-flash"],
    styleReference: ["qwen3.6-plus", "qwen3.5-flash", "qwen3.5-plus"],
    compositionReference: ["qwen3.6-plus", "qwen3.5-flash", "qwen3.5-plus"],
  },
  agnes: {
    concept: ["agnes-2.0-flash", "agnes-1.5-flash"],
    image: ["agnes-image-2.1-flash", "agnes-image-2.0-flash"],
    imageEdit: ["agnes-image-2.1-flash", "agnes-image-2.0-flash"],
  },
  mimo: {
    concept: ["mimo-v2.5-pro", "mimo-v2.5", "mimo-v2-pro", "mimo-v2-omni"],
    styleReference: ["mimo-v2-omni"],
    compositionReference: ["mimo-v2-omni"],
  },
};

export const providerSupportedModes = {
  openai: ["poster", "collab", "announcement", "logo", "icon"],
  aigocode: ["poster", "collab", "announcement", "logo", "icon"],
  custom: ["poster", "collab", "announcement", "logo", "icon"],
  google: ["poster", "collab", "announcement", "logo", "icon"],
  deepseek: ["poster", "collab", "announcement", "logo", "icon"],
  claude: ["poster", "collab", "announcement", "logo", "icon"],
  qwen: ["poster", "collab", "announcement", "logo", "icon"],
  agnes: ["poster", "collab", "announcement", "logo", "icon"],
  mimo: ["poster", "collab", "announcement", "logo", "icon"],
};

const slotRequirements = {
  concept: { slot: "concept", capability: "briefGeneration", label: "方案生成", required: true },
  image: { slot: "image", capability: "imageGeneration", label: "图像生成", required: true },
  styleReference: { slot: "styleReference", capability: "styleReferenceAnalysis", label: "画风参考分析", required: false },
  compositionReference: { slot: "compositionReference", capability: "compositionReferenceAnalysis", label: "构图参考分析", required: false },
  imageEdit: { slot: "imageEdit", capability: "imageEdit", label: "图像编辑", required: false },
  upscale: { slot: "upscale", capability: "upscale", label: "高清放大", required: false },
  backgroundRemoval: { slot: "backgroundRemoval", capability: "backgroundRemoval", label: "背景移除", required: false },
};

export const resultOperationRouting = {
  variant: {
    label: "变体",
    taskKind: "图像编辑",
    capability: "imageEdit",
    flags: { includeImageEdit: true, includeUpscale: false, includeBackgroundRemoval: false },
    providers: ["openai", "agnes", "aigocode", "custom", "qwen", "google"],
  },
  upscale: {
    label: "高清放大",
    taskKind: "高清放大",
    capability: "upscale",
    flags: { includeImageEdit: false, includeUpscale: true, includeBackgroundRemoval: false },
    providers: ["openai", "aigocode", "custom", "qwen", "google"],
  },
  removeBg: {
    label: "移除背景",
    taskKind: "背景移除",
    capability: "backgroundRemoval",
    flags: { includeImageEdit: false, includeUpscale: false, includeBackgroundRemoval: true },
    providers: ["openai", "aigocode", "custom", "qwen", "google"],
  },
};

export function providerSupports(providerId, capability) {
  return Boolean(providerCapabilities[providerId]?.includes(capability));
}

export function providerSupportsSlot(providerId, slot) {
  const requirement = slotRequirements[slot];
  return Boolean(
    requirement
      && providerSupports(providerId, requirement.capability)
      && providerModelSlots[providerId]?.[slot]?.length,
  );
}

export function knownProviderModels(providerId) {
  const slots = providerModelSlots[providerId] || {};
  return Array.from(new Set(Object.values(slots).flat().filter(Boolean)));
}

export function isKnownUnsupportedProviderSlotModel(providerId, slot, model) {
  const normalized = String(model || "").trim();
  if (!normalized) return false;
  const supportedModels = providerModelSlots[providerId]?.[slot] || [];
  if (supportedModels.includes(normalized)) return false;
  return knownProviderModels(providerId).includes(normalized);
}

function providerName(providerId) {
  return providerLabels[providerId] || providerId || "未知供应商";
}

function requiredQueueSlots(input = {}) {
  const slots = [];
  if (input.regenerateSchemes !== false) slots.push("concept");
  if (input.includeImageGeneration !== false) slots.push("image");
  if (input.includeImageEdit) slots.push("imageEdit");
  if (input.includeUpscale) slots.push("upscale");
  if (input.includeBackgroundRemoval) slots.push("backgroundRemoval");
  return slots;
}

function routeForSlot(input, slot) {
  const route = input.providerRoutes?.[slot] || {};
  return {
    providerId: route.providerId || input.providerId || "openai",
    model: route.model || "",
  };
}

function createGateIssue(input) {
  return {
    severity: input.severity || "error",
    slot: input.slot,
    label: input.label,
    providerId: input.providerId,
    providerName: providerName(input.providerId),
    capability: input.capability,
    model: input.model || "",
    message: input.message,
  };
}

export function evaluateProviderRouteCapabilityGate(input = {}) {
  const requiredSlots = input.requiredSlots || ["concept", "image"];
  const requirements = requiredSlots
    .map((slot) => {
      const requirement = slotRequirements[slot];
      if (!requirement) return null;
      const route = input.routes?.[slot] || {};
      const providerId = route.providerId || "openai";
      return {
        ...requirement,
        providerId,
        providerName: providerName(providerId),
        model: route.model || "",
      };
    })
    .filter(Boolean);
  const errors = [];
  const warnings = [];

  for (const requirement of requirements) {
    const modes = providerSupportedModes[requirement.providerId] || [];
    const models = providerModelSlots[requirement.providerId]?.[requirement.slot] || [];
    if (!modes.includes(input.mode || "poster")) {
      errors.push(createGateIssue({
        ...requirement,
        message: `${providerName(requirement.providerId)} 当前未声明支持 ${input.mode || "poster"} 模式。`,
      }));
      continue;
    }
    if (!providerSupports(requirement.providerId, requirement.capability)) {
      errors.push(createGateIssue({
        ...requirement,
        message: `${providerName(requirement.providerId)} 不支持 ${requirement.label} 所需能力 ${requirement.capability}。`,
      }));
      continue;
    }
    if (models.length === 0) {
      errors.push(createGateIssue({
        ...requirement,
        message: `${providerName(requirement.providerId)} 没有可用于 ${requirement.label} 的模型槽。`,
      }));
      continue;
    }
    if (isKnownUnsupportedProviderSlotModel(requirement.providerId, requirement.slot, requirement.model)) {
      errors.push(createGateIssue({
        ...requirement,
        message: `${providerName(requirement.providerId)} 的 ${requirement.label} 模型 ${requirement.model} 属于其他槽位，不能用于当前流程。请切换到 ${models.join(" / ")}。`,
      }));
      continue;
    }
    if (requirement.model && !models.includes(requirement.model)) {
      warnings.push(createGateIssue({
        ...requirement,
        severity: "warning",
        message: `${providerName(requirement.providerId)} 的 ${requirement.label} 模型 ${requirement.model} 不在内置支持列表中，请先测试当前配置方案确认可用。`,
      }));
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    requirements,
  };
}

export function evaluateQueuePlanCapabilityGate(input = {}) {
  const requiredSlots = requiredQueueSlots(input);
  const routes = Object.fromEntries(requiredSlots.map((slot) => [slot, routeForSlot(input, slot)]));
  return evaluateProviderRouteCapabilityGate({
    mode: input.mode || "poster",
    routes,
    requiredSlots,
  });
}

export function providerCapabilityGateUserMessage(gate) {
  return gate?.errors?.[0]?.message || gate?.warnings?.[0]?.message || "当前模型配置满足这个生成流程。";
}

function uniqueProviderIds(providerIds = []) {
  return Array.from(new Set(providerIds.filter(Boolean)));
}

function firstModelForCapability(providerId, capability) {
  if (capability === "imageEdit") return providerModelSlots[providerId]?.imageEdit?.[0] || "";
  if (capability === "upscale") return providerModelSlots[providerId]?.upscale?.[0] || "";
  if (capability === "backgroundRemoval") return providerModelSlots[providerId]?.backgroundRemoval?.[0] || "";
  return "";
}

export function resolveResultOperationRoute(action, currentProvider = "openai", options = {}) {
  const config = resultOperationRouting[action];
  const currentProviderLabel = providerLabels[currentProvider] || currentProvider || "当前供应商";
  if (!config) {
    return {
      supported: false,
      action,
      providerId: "",
      providerLabel: "不可用",
      native: false,
      taskKind: "",
      flags: {},
      title: "操作不可用。",
    };
  }

  const configuredProviders = Array.isArray(options.configuredProviders)
    ? uniqueProviderIds(options.configuredProviders)
    : null;
  const currentSupported = providerSupports(currentProvider, config.capability);
  const alternateProviderId = currentSupported || !configuredProviders
    ? ""
    : uniqueProviderIds([...(options.preferredProviders || []), ...config.providers])
        .find((candidate) =>
          providerSupports(candidate, config.capability)
          && (!configuredProviders || configuredProviders.includes(candidate)),
        ) || "";
  const providerId = currentSupported ? currentProvider : alternateProviderId;
  const supported = Boolean(providerId);
  const providerLabel = providerLabels[providerId] || providerId || "不可用";
  const model = firstModelForCapability(providerId, config.capability);
  const supportingProviders = config.providers
    .filter((candidate) => providerSupports(candidate, config.capability))
    .map((candidate) => providerLabels[candidate] || candidate);
  const supportingProvidersLabel = supportingProviders.join(" / ");

  return {
    supported,
    action,
    providerId: providerId || "",
    providerLabel,
    native: currentSupported,
    model,
    taskKind: config.taskKind,
    flags: config.flags,
    requiredCapability: config.capability,
    supportedProviders: supportingProviders,
    supportingProvidersLabel,
    title: currentSupported
      ? `${config.label} 将由当前供应商执行：${providerLabel}。`
      : alternateProviderId
        ? `${currentProviderLabel} 不支持${config.label}；将改由已配置的 ${providerLabel} 执行。`
      : supportingProviders.length
        ? `${currentProviderLabel} 不支持${config.label}；请切换到支持 ${config.capability} 的配置方案：${supportingProvidersLabel}。`
        : `${config.label} 不可用：当前没有供应商声明支持 ${config.capability}。`,
  };
}

export function summarizeResultOperationRoutes(currentProvider = "openai") {
  return Object.keys(resultOperationRouting).map((action) => resolveResultOperationRoute(action, currentProvider));
}
