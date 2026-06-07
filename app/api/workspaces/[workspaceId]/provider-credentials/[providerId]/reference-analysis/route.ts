import { z } from "zod";
import { providerCredentialKeyRef } from "../../../../../../../src/api/provider-credential-refs";
import { nextCredentialVault, nextRepository } from "../../../../../../../src/api/next-service";
import { ProviderIdSchema } from "../../../../../../../src/schema/zod";
import { getProviderManifest } from "../../../../../../../src/providers/manifests";
import { normalizeMimoProviderBaseUrl, normalizeMimoProviderModel } from "../../../../../../../src/providers/mimo-compat";

const ReferenceAnalysisRequestSchema = z.object({
  kind: z.enum(["composition", "full", "style"]),
  role: z.string().min(1).max(80).default("compositionReference"),
  label: z.string().min(1).max(120).default("Reference image"),
  imageDataUrl: z.string().min(32).max(18_000_000),
});

const DEFAULT_BASE_URLS: Record<z.infer<typeof ProviderIdSchema>, string> = {
  openai: "https://api.openai.com/v1",
  aigocode: "https://api.aigocode.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  deepseek: "https://api.deepseek.com",
  claude: "https://api.anthropic.com/v1",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  agnes: "https://apihub.agnes-ai.com/v1",
  mimo: "https://token-plan-cn.xiaomimimo.com/v1",
};

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizeBaseUrl(value: string | undefined, providerId: z.infer<typeof ProviderIdSchema>): string {
  return normalizeMimoProviderBaseUrl(providerId, value?.trim() || DEFAULT_BASE_URLS[providerId]);
}

function parseImageDataUrl(value: string): { mimeType: string; base64: string } {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("Reference image must be a data URL.");
  const mimeType = match[1];
  const base64 = match[2];
  if (!mimeType || !base64) throw new Error("Reference image data URL is incomplete.");
  return {
    mimeType: mimeType === "image/jpg" ? "image/jpeg" : mimeType,
    base64,
  };
}

function promptFor(kind: z.infer<typeof ReferenceAnalysisRequestSchema>["kind"], label: string): string {
  if (kind === "style") {
    return [
      `Analyze this style reference image: ${label}.`,
      "Return concise production-ready style notes in Chinese.",
      "Cover palette, lighting, material, rendering medium, texture, camera/space feeling, and reusable visual keywords.",
      "Do not identify real people or copyrighted characters.",
    ].join("\n");
  }

  if (kind === "full") {
    return [
      `Reverse this reference image into a reusable image-generation prompt: ${label}.`,
      "Return Chinese output with: subject, composition, scene, lighting, color, style, camera, detail density, negative prompt hints.",
      "The goal is to generate a similar image without copying protected characters or logos.",
    ].join("\n");
  }

  return [
    `Analyze composition only for this reference image: ${label}.`,
    "Return Chinese output focused only on layout: subject placement, visual path, safe areas, crop strategy, depth, focal hierarchy, and aspect-ratio guidance.",
    "Ignore style, character identity, brand, and exact content details unless they affect composition.",
  ].join("\n");
}

function extractOpenAIText(body: unknown): string {
  const parsed = z
    .object({
      choices: z.array(
        z.object({
          message: z.object({
            content: z.union([z.string(), z.array(z.unknown())]).optional(),
          }).passthrough(),
        }).passthrough(),
      ).default([]),
    })
    .passthrough()
    .safeParse(body);
  const content = parsed.success ? parsed.data.choices[0]?.message?.content : "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (item && typeof item === "object" && "text" in item) return String((item as { text?: unknown }).text || "");
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractGoogleText(body: unknown): string {
  const parsed = z
    .object({
      candidates: z.array(
        z.object({
          content: z.object({
            parts: z.array(z.object({ text: z.string().optional() }).passthrough()).default([]),
          }).passthrough(),
        }).passthrough(),
      ).default([]),
    })
    .passthrough()
    .safeParse(body);
  return parsed.success
    ? parsed.data.candidates[0]?.content.parts.map((part) => part.text || "").filter(Boolean).join("\n") || ""
    : "";
}

function extractClaudeText(body: unknown): string {
  const parsed = z
    .object({
      content: z.array(z.object({ text: z.string().optional() }).passthrough()).default([]),
    })
    .passthrough()
    .safeParse(body);
  return parsed.success ? parsed.data.content.map((part) => part.text || "").filter(Boolean).join("\n") : "";
}

async function postJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = formatProviderError(url, response.status, body);
    throw new Error(message);
  }
  return body;
}

function formatProviderError(url: string, status: number, body: unknown): string {
  const parsed = z
    .object({
      error: z
        .object({
          message: z.string().optional(),
          status: z.string().optional(),
          code: z.union([z.string(), z.number()]).optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .safeParse(body);
  const providerMessage = parsed.success ? parsed.data.error?.message || "" : "";
  const modelMatch = url.match(/\/models\/([^:/?]+):/) || url.match(/model=([^&]+)/);
  const model = modelMatch?.[1] ? decodeURIComponent(modelMatch[1]) : "";

  if (status === 404 && /not found|no longer available|not available/i.test(providerMessage)) {
    return model
      ? `模型 ${model} 已不可用，请在“模型与 API Key”里改用新版模型后再提取参考图。`
      : "当前选择的模型已不可用，请在“模型与 API Key”里改用新版模型后再提取参考图。";
  }
  if (status === 401 || status === 403) return "API Key 鉴权失败，请检查 Key、模型权限和供应商区域限制。";
  if (status === 429) return "供应商限流或额度不足，请稍后重试或切换模型。";
  return providerMessage || `Provider returned HTTP ${status}.`;
}

function normalizeReferenceModel(providerId: z.infer<typeof ProviderIdSchema>, model: string): string {
  if (providerId === "google" && model === "gemini-3-pro-preview") return "gemini-3.1-pro-preview";
  return normalizeMimoProviderModel(providerId, model);
}

async function runOpenAICompatible(input: {
  providerId: z.infer<typeof ProviderIdSchema>;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  imageDataUrl: string;
}) {
  const body = await postJson(`${input.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: input.prompt },
            { type: "image_url", image_url: { url: input.imageDataUrl } },
          ],
        },
      ],
      temperature: 0.2,
    }),
  });
  return extractOpenAIText(body);
}

async function runGoogle(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  mimeType: string;
  base64: string;
}) {
  const modelPath = input.model.startsWith("models/") ? input.model : `models/${input.model}`;
  const body = await postJson(`${input.baseUrl}/${modelPath}:generateContent?key=${encodeURIComponent(input.apiKey)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: input.prompt },
            { inline_data: { mime_type: input.mimeType, data: input.base64 } },
          ],
        },
      ],
      generation_config: {
        temperature: 0.2,
        max_output_tokens: 1200,
      },
    }),
  });
  return extractGoogleText(body);
}

async function runClaude(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  mimeType: string;
  base64: string;
}) {
  const body = await postJson(`${input.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: input.prompt },
            { type: "image", source: { type: "base64", media_type: input.mimeType, data: input.base64 } },
          ],
        },
      ],
    }),
  });
  return extractClaudeText(body);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; providerId: string }> },
) {
  const params = await context.params;
  const workspaceId = params.workspaceId;
  const providerId = ProviderIdSchema.parse(params.providerId);

  try {
    const body = ReferenceAnalysisRequestSchema.parse(await readJsonBody(request));
    const loaded = await nextRepository.loadSnapshot(workspaceId);
    if (!loaded.ok) {
      return json({ ok: false, error: { code: "not_found", message: loaded.message } }, { status: 404 });
    }

    const config = loaded.snapshot.providerConfigs[providerId];
    if (!config?.enabled) {
      return json({ ok: false, error: { code: "not_configured", message: "请先启用并保存这个 provider。" } }, { status: 400 });
    }

    const manifest = getProviderManifest(providerId);
    const requiredCapability = body.kind === "style" ? "styleReferenceAnalysis" : "compositionReferenceAnalysis";
    if (!manifest.capabilities.includes(requiredCapability)) {
      const unsupportedMessage = providerId === "agnes"
        ? "Agnes Image 2.1 Flash 支持图生图参考，但构图/画风文字分析需要视觉理解模型。请将参考图识别路由切换到小米 MiMo、OpenAI、AIGoCode、Google AI Studio、Claude 或 Qwen。"
        : "当前供应商不支持参考图识别，请切换到小米 MiMo、OpenAI、AIGoCode、Google AI Studio、Claude 或 Qwen。";
      return json({
        ok: false,
        error: {
          code: "unsupported_provider",
          message: unsupportedMessage,
        },
      }, { status: 400 });
    }

    const credentialStatus = await nextCredentialVault.describe({
      providerId,
      keyRef: providerCredentialKeyRef({ workspaceId, providerId, keyRef: config.credentialKeyRef }),
    });
    if (!credentialStatus.credentialRef) {
      return json({ ok: false, error: { code: "missing_api_key", message: "请先保存 API Key。" } }, { status: 400 });
    }

    const resolved = await nextCredentialVault.resolveCredential(credentialStatus.credentialRef);
    if (!resolved.ok) {
      return json({ ok: false, error: { code: resolved.error.code, message: resolved.error.userMessage } }, { status: 400 });
    }

    const slot = body.kind === "style" ? "styleReference" : "compositionReference";
    const model = providerId === "mimo"
      ? "mimo-v2-omni"
      : normalizeReferenceModel(providerId, config.modelSlots?.[slot] || config.defaultModel || "gpt-5.2");
    const baseUrl = normalizeBaseUrl(config.baseUrl, providerId);
    const image = parseImageDataUrl(body.imageDataUrl);
    const prompt = promptFor(body.kind, body.label);

    const text = providerId === "google"
      ? await runGoogle({ baseUrl, apiKey: resolved.value.apiKey, model, prompt, ...image })
      : providerId === "claude"
        ? await runClaude({ baseUrl, apiKey: resolved.value.apiKey, model, prompt, ...image })
        : await runOpenAICompatible({ providerId, baseUrl, apiKey: resolved.value.apiKey, model, prompt, imageDataUrl: body.imageDataUrl });

    return json({
      ok: true,
      data: {
        kind: body.kind,
        providerId,
        model,
        text: text || "Provider returned no text.",
      },
    });
  } catch (error) {
    return json({
      ok: false,
      error: {
        code: error instanceof z.ZodError ? "validation_error" : "provider_error",
        message: error instanceof Error ? error.message : "Reference analysis failed.",
      },
    }, { status: 400 });
  }
}
