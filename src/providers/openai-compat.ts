export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

function isSharedLocalDevBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1")
      && url.port === "3000"
    );
  } catch {
    return false;
  }
}

export function normalizeOpenAIBaseUrl(value: string | null | undefined): string {
  const normalized = (value?.trim() || OPENAI_DEFAULT_BASE_URL).replace(/\/+$/, "");
  return isSharedLocalDevBaseUrl(normalized) ? OPENAI_DEFAULT_BASE_URL : normalized;
}
