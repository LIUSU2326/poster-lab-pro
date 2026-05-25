export const providerLabels = {
  openai: "OpenAI",
  aigocode: "AIGoCode",
  google: "Google AI Studio",
  deepseek: "DeepSeek",
  claude: "Claude",
  qwen: "Qwen",
};

const providerCapabilities = {
  openai: ["briefGeneration", "imageGeneration", "imageEdit"],
  aigocode: ["briefGeneration", "imageGeneration", "imageEdit", "styleReferenceAnalysis", "compositionReferenceAnalysis"],
  google: ["briefGeneration", "imageGeneration"],
  deepseek: ["briefGeneration"],
  claude: ["briefGeneration", "styleReferenceAnalysis", "compositionReferenceAnalysis"],
  qwen: ["briefGeneration", "imageGeneration", "styleReferenceAnalysis", "compositionReferenceAnalysis"],
};

export const resultOperationRouting = {
  variant: {
    label: "变体",
    taskKind: "图像编辑",
    capability: "imageEdit",
    flags: { includeImageEdit: true, includeUpscale: false, includeBackgroundRemoval: false },
    providers: ["openai", "aigocode", "qwen", "google"],
  },
  upscale: {
    label: "高清放大",
    taskKind: "高清放大",
    capability: "upscale",
    flags: { includeImageEdit: false, includeUpscale: true, includeBackgroundRemoval: false },
    providers: ["openai", "aigocode", "qwen", "google"],
  },
  removeBg: {
    label: "移除背景",
    taskKind: "背景移除",
    capability: "backgroundRemoval",
    flags: { includeImageEdit: false, includeUpscale: false, includeBackgroundRemoval: true },
    providers: ["openai", "aigocode", "qwen", "google"],
  },
};

export function providerSupports(providerId, capability) {
  return Boolean(providerCapabilities[providerId]?.includes(capability));
}

export function resolveResultOperationRoute(action, currentProvider = "openai") {
  const config = resultOperationRouting[action];
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

  const native = providerSupports(currentProvider, config.capability);
  const providerId = native
    ? currentProvider
    : config.providers.find((candidate) => providerSupports(candidate, config.capability));
  const providerLabel = providerLabels[providerId] || providerId || "不可用";

  return {
    supported: Boolean(providerId),
    action,
    providerId: providerId || "",
    providerLabel,
    native,
    taskKind: config.taskKind,
    flags: config.flags,
    title: providerId
      ? native
        ? `${config.label} 将由当前 provider 执行：${providerLabel}。`
        : `${config.label} 将路由到 ${providerLabel}，因为 ${providerLabels[currentProvider] || currentProvider} 不支持该能力。`
      : `${config.label} 不可用：当前没有 provider 支持该能力。`,
  };
}

export function summarizeResultOperationRoutes(currentProvider = "openai") {
  return Object.keys(resultOperationRouting).map((action) => resolveResultOperationRoute(action, currentProvider));
}
