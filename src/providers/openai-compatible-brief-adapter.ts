import { z } from "zod";
import { ProviderConfigFormSchema, type ProviderConfigForm } from "../schema/zod";
import type { ProviderId } from "../schema/zod";
import {
  BriefGenerationRequestSchema,
  ProviderBriefResponseSchema,
  ProviderHealthResponseSchema,
  createProviderError,
  type BriefGenerationRequest,
  type GenerationProviderAdapter,
  type ProviderBriefResponse,
  type ProviderConfigValidation,
  type ProviderHealthResponse,
  type ProviderResult,
} from "./contracts";
import { getProviderManifest } from "./manifests";

const CHAT_COMPLETIONS_PATH = "/chat/completions";

const defaultBaseUrls: Partial<Record<ProviderId, string>> = {
  openai: "https://api.openai.com/v1",
  aigocode: "https://api.aigocode.com/v1",
  deepseek: "https://api.deepseek.com",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
};

export const OpenAICompatibleChatTransportRequestSchema = z.object({
  url: z.string().url(),
  method: z.literal("POST"),
  headers: z.record(z.string(), z.string()),
  body: z.record(z.string(), z.unknown()),
});

export const OpenAICompatibleChatTransportResponseSchema = z.object({
  ok: z.boolean(),
  status: z.number().int(),
  body: z.unknown(),
});

const ChatCompletionResponseSchema = z
  .object({
    choices: z.array(
      z
        .object({
          message: z
            .object({
              content: z.union([z.string(), z.array(z.unknown())]).optional(),
            })
            .passthrough()
            .optional(),
        })
        .passthrough(),
    ).default([]),
    usage: z
      .object({
        prompt_tokens: z.number().int().min(0).optional(),
        completion_tokens: z.number().int().min(0).optional(),
        total_tokens: z.number().int().min(0).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const BriefCompletionSchema = z.object({
  schemes: z.array(
    z.object({
      title: z.string().min(1),
      brief: z.string().min(1),
      prompt: z.string().min(1),
      promptZh: z.string().min(1).optional(),
      promptEn: z.string().min(1).optional(),
      slogans: z.record(z.string(), z.string()).default({}),
    }),
  ).min(1),
});

const SUPPORTED_SLOGAN_LANGUAGES = ["zh-CN", "en-US", "ja-JP", "ko-KR"] as const;

export type OpenAICompatibleChatTransportRequest = z.infer<typeof OpenAICompatibleChatTransportRequestSchema>;
export type OpenAICompatibleChatTransportResponse = z.infer<typeof OpenAICompatibleChatTransportResponseSchema>;
export type OpenAICompatibleChatTransport = (
  request: OpenAICompatibleChatTransportRequest,
) => Promise<OpenAICompatibleChatTransportResponse>;

export type OpenAICompatibleBriefAdapterOptions = {
  providerId: ProviderId;
  transport?: OpenAICompatibleChatTransport;
  now?: () => number;
};

export function createOpenAICompatibleChatFetchTransport(fetchImpl: typeof fetch): OpenAICompatibleChatTransport {
  return async (request) => {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();
    return OpenAICompatibleChatTransportResponseSchema.parse({
      ok: response.ok,
      status: response.status,
      body,
    });
  };
}

function validateConfig(providerId: ProviderId, config: ProviderConfigForm): ProviderConfigValidation {
  const parsed = ProviderConfigFormSchema.parse(config);
  const missing: (keyof ProviderConfigForm)[] = [];
  const warnings: string[] = [];

  if (parsed.providerId !== providerId) {
    warnings.push(`Config providerId ${parsed.providerId} does not match adapter ${providerId}.`);
  }
  if (!parsed.enabled) missing.push("enabled");
  if (!parsed.apiKey?.trim()) missing.push("apiKey");
  if (!parsed.defaultModel?.trim() && !parsed.modelSlots.concept?.trim()) missing.push("defaultModel");

  return {
    ok: missing.length === 0,
    missing,
    warnings,
  };
}

function normalizeBaseUrl(providerId: ProviderId, config: ProviderConfigForm): string {
  return (config.baseUrl?.trim() || defaultBaseUrls[providerId] || "").replace(/\/+$/, "");
}

function conceptModel(config: ProviderConfigForm): string {
  return config.modelSlots.concept || config.defaultModel || "gpt-5.5";
}

function configError<T>(providerId: ProviderId, config: ProviderConfigForm): ProviderResult<T> {
  const validation = validateConfig(providerId, config);
  const hasMissingApiKey = validation.missing.includes("apiKey");
  return {
    ok: false,
    error: createProviderError(
      providerId,
      hasMissingApiKey ? "auth_failed" : "missing_config",
      `Provider is missing configuration: ${validation.missing.join(", ")}`,
      {
        userMessage: hasMissingApiKey ? "请先保存 API Key，再生成海报方案。" : "当前供应商配置不完整。",
      },
    ),
  };
}

function transportError<T>(providerId: ProviderId): ProviderResult<T> {
  return {
    ok: false,
    error: createProviderError(providerId, "provider_unavailable", "Chat transport is not connected.", {
      userMessage: "当前供应商的文本生成通道未连接。",
    }),
  };
}

function statusError<T>(providerId: ProviderId, status: number, body: unknown): ProviderResult<T> {
  const message = typeof body === "string"
    ? body
    : body && typeof body === "object" && "error" in body
      ? JSON.stringify((body as Record<string, unknown>).error)
      : JSON.stringify(body);
  return {
    ok: false,
    error: createProviderError(providerId, status === 401 || status === 403 ? "auth_failed" : "unknown", message, {
      userMessage: status === 401 || status === 403 ? "API Key 校验失败，请检查供应商和模型。" : "供应商返回错误，方案生成失败。",
    }),
  };
}

function buildBriefMessages(request: BriefGenerationRequest) {
  const targetLanguage = request.languageTargets[0] || "en-US";
  const assets = request.assets.map((asset) => ({
    role: asset.role,
    id: asset.id,
    description: asset.description || "",
    mimeType: asset.mimeType,
    hasUrl: Boolean(asset.url),
  }));

  return [
    {
      role: "system",
      content: [
        "You are a senior game marketing art director.",
        "Return JSON only. No markdown, no commentary.",
        "Each scheme must include title, brief, prompt, promptZh, promptEn, and slogans.",
        "promptZh must be a Chinese image-generation prompt. promptEn must be an English image-generation prompt.",
        "languageTargets contains exactly one target slogan language. Return slogans only for that selected language.",
        "If multiple assets share role gameCharacter, each one is an independent game character reference. Plan them as separate characters in group compositions when possible; never merge their appearances.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Generate poster design schemes for batch image generation.",
        projectName: request.projectName,
        gameDescription: request.gameDescription,
        focusGuidance: request.focusGuidance || "",
        creativeDirection: request.creativeDirection || "",
        guardrails: request.guardrails,
        languageTargets: request.languageTargets,
        schemeCount: request.schemeCount,
        assets,
        rules: [
          "Generate NEW random poster schemes for this batch.",
          "Do not assume a logo exists unless an asset with role gameLogo is present.",
          "If no image assets are provided, create concepts from project description and focus guidance only.",
          "Use multiple gameCharacter assets as separate characters when the campaign composition supports it.",
          "Respect creativeDirection for selected style tags, output sizes, composition/reference analysis, and prompt constraints.",
          `Return exactly one slogan language: ${targetLanguage}.`,
        ],
        outputShape: {
          schemes: [
            {
              title: "Chinese poster scheme title",
              brief: "Chinese visual direction and layout plan",
              prompt: "Image prompt suitable for the selected image model",
              promptZh: "Chinese image prompt",
              promptEn: "English image prompt",
              slogans: {
                [targetLanguage]: "Promotional slogan in the selected target language",
              },
            },
          ],
        },
      }),
    },
  ];
}

function contentToString(content: string | unknown[] | undefined): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object" && "text" in part) return String((part as Record<string, unknown>).text || "");
    return "";
  }).join("");
}

function parseBriefContent(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  return BriefCompletionSchema.parse(JSON.parse(fenced || trimmed));
}

function normalizeSchemes(parsed: z.infer<typeof BriefCompletionSchema>, schemeCount: number, targetLanguage: string) {
  return parsed.schemes.slice(0, schemeCount).map((scheme) => {
    const promptZh = scheme.promptZh || scheme.prompt;
    const promptEn = scheme.promptEn || scheme.prompt;
    const slogans = Object.fromEntries(
      SUPPORTED_SLOGAN_LANGUAGES
        .filter((language) => language === targetLanguage && scheme.slogans[language])
        .map((language) => [language, scheme.slogans[language]]),
    );
    return {
      title: scheme.title,
      brief: scheme.brief,
      prompt: scheme.prompt,
      promptZh,
      promptEn,
      slogans,
    };
  });
}

export function createOpenAICompatibleBriefAdapter(options: OpenAICompatibleBriefAdapterOptions): GenerationProviderAdapter {
  const providerId = options.providerId;
  const manifest = getProviderManifest(providerId);
  const now = options.now || Date.now;

  return {
    manifest,

    validateConfig(config) {
      return validateConfig(providerId, config);
    },

    async healthCheck(config): Promise<ProviderResult<ProviderHealthResponse>> {
      const validation = validateConfig(providerId, config);
      return {
        ok: true,
        value: ProviderHealthResponseSchema.parse({
          providerId,
          ok: validation.ok && Boolean(options.transport),
          status: validation.ok && options.transport ? "ready" : "not_configured",
          message: validation.ok ? "文本方案生成通道已配置。" : `缺少配置：${validation.missing.join(", ")}`,
        }),
      };
    },

    async generateBrief(request: BriefGenerationRequest, config: ProviderConfigForm): Promise<ProviderResult<ProviderBriefResponse>> {
      const parsedRequest = BriefGenerationRequestSchema.parse(request);
      const parsedConfig = ProviderConfigFormSchema.parse(config);
      const validation = validateConfig(providerId, parsedConfig);
      if (!manifest.capabilities.includes("briefGeneration")) {
        return {
          ok: false,
          error: createProviderError(providerId, "unsupported_capability", `${providerId} does not support briefGeneration.`, {
            userMessage: "当前供应商不支持方案生成。",
          }),
        };
      }
      if (!validation.ok) return configError(providerId, parsedConfig);
      if (!options.transport) return transportError(providerId);

      const baseUrl = normalizeBaseUrl(providerId, parsedConfig);
      if (!baseUrl) return configError(providerId, parsedConfig);

      const model = conceptModel(parsedConfig);
      const startedAt = now();
      const transportResponse = await options.transport(
        OpenAICompatibleChatTransportRequestSchema.parse({
          url: `${baseUrl}${CHAT_COMPLETIONS_PATH}`,
          method: "POST",
          headers: {
            Authorization: `Bearer ${parsedConfig.apiKey}`,
            "Content-Type": "application/json",
          },
          body: {
            model,
            messages: buildBriefMessages(parsedRequest),
            temperature: 0.85,
          },
        }),
      );
      const parsedTransportResponse = OpenAICompatibleChatTransportResponseSchema.parse(transportResponse);
      if (!parsedTransportResponse.ok) return statusError(providerId, parsedTransportResponse.status, parsedTransportResponse.body);

      try {
        const response = ChatCompletionResponseSchema.parse(parsedTransportResponse.body);
        const content = contentToString(response.choices[0]?.message?.content);
        const parsedBrief = parseBriefContent(content);
        return {
          ok: true,
          value: ProviderBriefResponseSchema.parse({
            providerId,
            model,
            schemes: normalizeSchemes(parsedBrief, parsedRequest.schemeCount, parsedRequest.languageTargets[0] || "en-US"),
            usage: {
              promptTokens: response.usage?.prompt_tokens || response.usage?.total_tokens || 0,
              elapsedMs: Math.max(0, now() - startedAt),
            },
          }),
        };
      } catch (error) {
        return {
          ok: false,
          error: createProviderError(providerId, "unknown", error instanceof Error ? error.message : "Invalid brief response.", {
            userMessage: "供应商返回的方案结构无法解析。",
          }),
        };
      }
    },
  };
}
