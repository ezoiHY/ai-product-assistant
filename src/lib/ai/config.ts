// Request-scoped model configuration.
//
// Two ways to provide a key:
//  - the server owner sets ANTHROPIC_API_KEY (env), or
//  - a visitor enters their own key in the "API 设置" sheet; the browser sends it
//    in request headers and we use it for that request only (never stored).
//
// AsyncLocalStorage carries the config through one request, so the pipeline code
// (stages, extract, client) doesn't need an extra parameter everywhere.
import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_MODEL, KNOWN_MODELS, LLM_HEADERS, validateApiKey, validateBaseURL, validateModel } from "../llm-shared";
import { AIError } from "./errors";

export interface LLMConfig {
  /** set only for a visitor-provided key; the server key is read by the SDK from env */
  apiKey?: string;
  baseURL?: string;
  model: string;
  fallbacks: boolean;
  keySource: "user" | "server" | "none";
}

const store = new AsyncLocalStorage<LLMConfig>();

export function envConfig(): LLMConfig {
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  return {
    model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
    fallbacks: process.env.ANTHROPIC_FALLBACKS !== "off",
    keySource: hasKey ? "server" : "none",
  };
}

export function configFromRequest(req: Request): LLMConfig {
  const env = envConfig();
  const h = req.headers;
  const userKey = h.get(LLM_HEADERS.key)?.trim() ?? "";
  const model = h.get(LLM_HEADERS.model)?.trim() ?? "";
  const fallbacksOff = h.get(LLM_HEADERS.fallbacks) === "off";

  if (userKey) {
    const baseURL = h.get(LLM_HEADERS.baseURL)?.trim() ?? "";
    const err = validateApiKey(userKey) ?? validateBaseURL(baseURL) ?? validateModel(model);
    if (err) throw new AIError(err, "bad_config", 400);
    return { apiKey: userKey, baseURL: baseURL || undefined, model: model || DEFAULT_MODEL, fallbacks: !fallbacksOff, keySource: "user" };
  }

  // Using the server's key: never send it to a visitor-supplied base URL, and
  // only allow switching between the known Claude models.
  const knownModel = KNOWN_MODELS.some((m) => m.id === model) ? model : env.model;
  return { ...env, model: knownModel, fallbacks: env.fallbacks && !fallbacksOff };
}

/** Run `fn` with the model config taken from this request's headers. */
export function withLLM<T>(req: Request, fn: () => Promise<T>): Promise<T> {
  return store.run(configFromRequest(req), fn);
}

export function llmConfig(): LLMConfig {
  return store.getStore() ?? envConfig();
}
