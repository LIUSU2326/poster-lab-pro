import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const providerConfigs = {
  openai: {
    keyEnv: "OPENAI_API_KEY",
    baseEnv: "OPENAI_BASE_URL",
    baseUrl: "https://api.openai.com/v1",
    type: "openai",
  },
  deepseek: {
    keyEnv: "DEEPSEEK_API_KEY",
    baseEnv: "DEEPSEEK_BASE_URL",
    baseUrl: "https://api.deepseek.com/v1",
    type: "openai",
  },
  qwen: {
    keyEnv: "DASHSCOPE_API_KEY",
    baseEnv: "DASHSCOPE_BASE_URL",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    type: "openai",
  },
  agnes: {
    keyEnv: "AGNES_API_KEY",
    baseEnv: "AGNES_BASE_URL",
    baseUrl: "https://apihub.agnes-ai.com/v1",
    type: "openai",
  },
  doubao: {
    keyEnv: "ARK_API_KEY",
    baseEnv: "ARK_BASE_URL",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    type: "openai",
  },
  hunyuan: {
    keyEnv: "HUNYUAN_API_KEY",
    baseEnv: "HUNYUAN_BASE_URL",
    baseUrl: "",
    type: "openai",
  },
  "custom-openai": {
    keyEnv: "CUSTOM_OPENAI_API_KEY",
    baseEnv: "CUSTOM_OPENAI_BASE_URL",
    baseUrl: "",
    type: "openai",
  },
  gemini: {
    keyEnv: "GEMINI_API_KEY",
    type: "gemini",
  },
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (request.method === "OPTIONS") return send(response, 204, "");
    if (url.pathname === "/api/providers" && request.method === "GET") {
      return json(response, 200, { providers: Object.keys(providerConfigs).concat("youdao", "local-demo") });
    }
    if (url.pathname === "/api/chat" && request.method === "POST") {
      const payload = await readJson(request);
      const result = await chat(payload);
      return json(response, 200, result);
    }
    if (url.pathname === "/api/convert-encoding") {
      return json(response, 501, {
        error: "GBK/GB2312 export requires adding a backend encoding library such as iconv-lite.",
      });
    }
    if (request.method !== "GET") return json(response, 405, { error: "Method not allowed" });
    return serveStatic(url.pathname, response);
  } catch (error) {
    return json(response, error.statusCode || 500, { error: error.message || "Internal server error" });
  }
});

server.listen(port, () => {
  console.log(`NEXUS local server: http://localhost:${port}`);
});

async function serveStatic(pathname, response) {
  const cleanPath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const target = normalize(join(root, cleanPath));
  if (!target.startsWith(root)) return json(response, 403, { error: "Forbidden" });
  try {
    const data = await readFile(target);
    const type = mimeTypes[extname(target)] || "application/octet-stream";
    send(response, 200, data, type);
  } catch {
    const data = await readFile(join(root, "index.html"));
    send(response, 200, data, mimeTypes[".html"]);
  }
}

async function chat(payload) {
  const provider = payload.provider || "local-demo";
  const model = payload.model || "demo-localizer";
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const responseFormat = payload.responseFormat || "text";

  if (provider === "local-demo") {
    return { text: demoResponse(messages, responseFormat) };
  }
  if (provider === "youdao") {
    throw httpError(501, "有道智云需要签名鉴权适配层；当前代理已预留入口。");
  }

  const config = providerConfigs[provider];
  if (!config) throw httpError(400, `Unknown provider: ${provider}`);

  if (config.type === "gemini") return callGemini(config, model, messages, responseFormat);
  return callOpenAiCompatible(config, model, messages, responseFormat);
}

async function callOpenAiCompatible(config, model, messages, responseFormat) {
  const apiKey = process.env[config.keyEnv];
  const baseUrl = process.env[config.baseEnv] || config.baseUrl;
  if (!apiKey) throw httpError(400, `Missing backend environment variable: ${config.keyEnv}`);
  if (!baseUrl) throw httpError(400, `Missing backend environment variable: ${config.baseEnv}`);

  const body = {
    model,
    messages,
    temperature: 0.2,
  };
  if (responseFormat === "json") body.response_format = { type: "json_object" };

  const upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const text = await upstream.text();
  if (!upstream.ok) throw httpError(upstream.status, text);
  const data = JSON.parse(text);
  return { text: data.choices?.[0]?.message?.content || "" };
}

async function callGemini(config, model, messages, responseFormat) {
  const apiKey = process.env[config.keyEnv];
  if (!apiKey) throw httpError(400, `Missing backend environment variable: ${config.keyEnv}`);

  const system = messages.find((message) => message.role === "system")?.content || "";
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: String(message.content || "") }],
    }));
  if (system) contents.unshift({ role: "user", parts: [{ text: `System instruction:\n${system}` }] });
  if (responseFormat === "json") {
    contents.push({ role: "user", parts: [{ text: "Return valid JSON only. Do not wrap it in Markdown." }] });
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature: 0.2 },
    }),
  });

  const text = await upstream.text();
  if (!upstream.ok) throw httpError(upstream.status, text);
  const data = JSON.parse(text);
  return { text: data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "" };
}

function demoResponse(messages, responseFormat) {
  const system = messages.map((message) => String(message.content || "")).join("\n");
  const last = String(messages.at(-1)?.content || "");

  if (responseFormat === "json" && /Extract game localization terminology/i.test(system)) {
    const candidates = Array.from(
      new Set((last.match(/[A-Z][A-Za-z0-9]*(?: [A-Z][A-Za-z0-9]*){0,3}|[\u4e00-\u9fa5]{2,8}(?:剑|盾|药水|佣兵|小镇|技能|宝箱)/g) || []).slice(0, 20)),
    );
    return JSON.stringify(candidates.map((source) => ({ source, target: "", type: "其他", note: "本地演示提取" })));
  }

  if (responseFormat === "json") {
    return JSON.stringify({ severity: "pass", issues: [], suggestion: "" });
  }

  const textMatch = last.match(/Text:\n([\s\S]*)$/);
  const text = textMatch ? textMatch[1].trim() : last.trim();
  return `[DEMO] ${text}`;
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf-8");
  if (!text) return {};
  return JSON.parse(text);
}

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  });
  response.end(body);
}

function json(response, status, body) {
  send(response, status, JSON.stringify(body), "application/json; charset=utf-8");
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
