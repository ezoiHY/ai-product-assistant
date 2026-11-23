// Shared between browser and server: header names, model list, validation.
// No Node-only imports here.

export const LLM_HEADERS = {
  key: "x-llm-api-key",
  baseURL: "x-llm-base-url",
  model: "x-llm-model",
  fallbacks: "x-llm-fallbacks",
} as const;

export const DEFAULT_MODEL = "claude-opus-5-5";
export const OFFICIAL_BASE_URL = "https://api.anthropic.com";

export const KNOWN_MODELS = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", note: "质量最好，默认", price: "$4 / $20" },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", note: "更快，更省", price: "$2 / $10" },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", note: "最快，最便宜", price: "$0.10 / $0.50" },
] as const;

export const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{1,79}$/;

/** Config the user saves in their browser. Empty strings mean "use the default". */
export interface ClientLLMConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  fallbacks: boolean;
  /** true: localStorage (stays on this device); false: sessionStorage (cleared with the tab) */
  remember: boolean;
}

/** Returns an error message, or null when the key looks usable. */
export function validateApiKey(key: string): string | null {
  if (!key) return null;
  if (key.length > 300) return "Key 太长了，请检查是否粘贴了多余内容";
  if (/\s/.test(key)) return "Key 里不能有空格或换行";
  if (!/^[\x21-\x7e]+$/.test(key)) return "Key 只能包含英文字母、数字和符号";
  return null;
}

/** Only public https endpoints, so the server can't be pointed at internal hosts. */
export function validateBaseURL(raw: string): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "接口地址格式不正确，例如 https://api.anthropic.com";
  }
  if (u.protocol !== "https:") return "接口地址必须以 https:// 开头";
  if (u.username || u.password) return "接口地址里不能包含账号密码";
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    /\.(localhost|local|internal|lan|home|corp)$/.test(host) ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(":") ||
    host.startsWith("[") ||
    !host.includes(".")
  ) {
    return "接口地址必须是公网域名（不支持 IP、localhost 或内网地址）";
  }
  return null;
}

export function validateModel(model: string): string | null {
  if (!model) return null;
  return MODEL_ID_RE.test(model) ? null : "模型名称只能包含字母、数字和 . _ - : / @";
}
