// Thin wrapper around the official Anthropic SDK: one place for model choice,
// credentials, structured outputs, refusal fallbacks and error translation.
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { OFFICIAL_BASE_URL } from "../llm-shared";
import { llmConfig } from "./config";
import { AIError } from "./errors";

export { AIError };

export type Effort = "low" | "medium" | "high";

let serverClient: Anthropic | null = null;
const visitorClients = new Map<string, Anthropic>();

export function currentModel(): string {
  return llmConfig().model;
}

export function aiConfigured(): boolean {
  return llmConfig().keySource !== "none";
}

export function getClient(): Anthropic {
  const cfg = llmConfig();
  if (cfg.keySource === "none") {
    throw new AIError("还没有配置 API Key：点击右上角「API 设置」填写你的 Anthropic Key", "not_configured", 503);
  }
  if (cfg.keySource === "server") {
    // credentials and base URL come from the server's env
    serverClient ??= new Anthropic({ maxRetries: 2, timeout: 150_000 });
    return serverClient;
  }
  // Visitor key: pass the key in code (so the SDK reads no env credential) and an
  // explicit base URL (so a server-side ANTHROPIC_BASE_URL is never used for it).
  const id = createHash("sha256").update(`${cfg.apiKey}|${cfg.baseURL ?? ""}`).digest("hex");
  let c = visitorClients.get(id);
  if (!c) {
    c = new Anthropic({ apiKey: cfg.apiKey, baseURL: cfg.baseURL ?? OFFICIAL_BASE_URL, maxRetries: 1, timeout: 150_000 });
    if (visitorClients.size >= 20) visitorClients.clear();
    visitorClients.set(id, c);
  }
  return c;
}

/** Extra request params: server-side refusal fallback (beta) and optional fast mode. */
export function requestExtras(): Record<string, unknown> {
  const cfg = llmConfig();
  // fallbacks: "default" applies to Opus / Sonnet / Fable-class models, not Haiku
  const fallbacks = cfg.fallbacks && /^claude-(opus|sonnet|fable|mythos)-/.test(cfg.model);
  const fast = process.env.ANTHROPIC_FAST_MODE === "on" && cfg.keySource === "server" && /^claude-(opus-5-5|fable-5-2)/.test(cfg.model);
  return {
    ...(fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    ...(fast ? { speed: "fast" } : {}),
  };
}

export function toAIError(e: unknown): AIError {
  if (e instanceof AIError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new AIError("API Key 无效或已过期，请在「API 设置」里检查", "auth", 401);
  if (e instanceof Anthropic.PermissionDeniedError) return new AIError("这个 API Key 没有调用该模型的权限", "permission", 403);
  if (e instanceof Anthropic.PaymentRequiredError) return new AIError("模型账户余额不足", "billing", 402);
  if (e instanceof Anthropic.NotFoundError) return new AIError(`找不到模型 ${currentModel()}，或接口地址不正确`, "bad_config", 404);
  if (e instanceof Anthropic.RateLimitError) return new AIError("模型接口繁忙（限流），请稍后重试", "rate_limit", 429);
  if (e instanceof Anthropic.OverloadedError) return new AIError("模型服务暂时过载，请稍后重试", "overloaded", 503);
  if (e instanceof Anthropic.BadRequestError) return new AIError(`模型接口拒绝了请求：${e.message.slice(0, 300)}`, "bad_request", 502);
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new AIError("模型响应超时，请重试", "timeout", 504);
  if (e instanceof Anthropic.APIConnectionError) return new AIError("连接模型接口失败，请检查接口地址或稍后重试", "connection", 502);
  if (e instanceof Anthropic.APIError) return new AIError(`模型接口错误（${e.status ?? "?"}）`, "api_error", 502);
  const msg = e instanceof Error ? e.message : String(e);
  return new AIError(`AI 处理失败：${msg}`, "unknown", 500);
}

export interface CallMeta {
  model: string;
  ms: number;
  inputTokens: number;
  outputTokens: number;
}

/** One structured-output call: returns data validated against `schema`. */
export async function structuredCall<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  effort: Effort;
  maxTokens?: number;
}): Promise<{ data: z.infer<S>; meta: CallMeta }> {
  const t0 = Date.now();
  try {
    const res = await getClient().beta.messages.parse({
      model: currentModel(),
      max_tokens: opts.maxTokens ?? 16000,
      system: opts.system,
      messages: [{ role: "user", content: opts.content }],
      output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
      ...requestExtras(),
    });
    if (res.stop_reason === "refusal") throw new AIError("模型拒绝处理这段内容", "refusal", 422);
    if (res.stop_reason === "max_tokens") throw new AIError("模型输出过长被截断，请重试", "max_tokens", 502);
    if (!res.parsed_output) throw new AIError("模型输出格式异常，请重试", "parse_error", 502);
    return {
      data: res.parsed_output as z.infer<S>,
      meta: {
        model: res.model,
        ms: Date.now() - t0,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      },
    };
  } catch (e) {
    throw toAIError(e);
  }
}

export interface AvailableModel {
  id: string;
  name: string;
  createdAt?: string;
  contextWindow?: number;
  maxOutput?: number;
  deprecated?: boolean;
}

/** Models the current key can use (Models API, auto-paginated). Also accepts the
 *  slightly different list format some Anthropic-compatible gateways return. */
export async function listModels(limit = 200): Promise<AvailableModel[]> {
  const out: AvailableModel[] = [];
  try {
    for await (const m of getClient().models.list({ limit: 100 })) {
      const x = m as unknown as Record<string, unknown>;
      if (typeof x.id !== "string" || !x.id) continue;
      if (x.lifecycle === "retired") continue;
      out.push({
        id: x.id,
        name: typeof x.display_name === "string" && x.display_name ? x.display_name : x.id,
        createdAt: typeof x.created_at === "string" ? x.created_at : undefined,
        contextWindow: typeof x.max_input_tokens === "number" ? x.max_input_tokens : undefined,
        maxOutput: typeof x.max_tokens === "number" ? x.max_tokens : undefined,
        deprecated: x.lifecycle === "deprecated" || undefined,
      });
      if (out.length >= limit) break; // guard against gateways that never stop paginating
    }
    return out;
  } catch (e) {
    if (e instanceof Anthropic.NotFoundError) {
      throw new AIError("这个接口地址不支持获取模型列表（/v1/models），可以直接填写模型名", "models_unsupported", 404);
    }
    throw toAIError(e);
  }
}

/** Smallest possible request, used by the "测试连接" button. */
export async function pingModel(): Promise<{ model: string; ms: number }> {
  const t0 = Date.now();
  try {
    const res = await getClient().beta.messages.create({
      model: currentModel(),
      max_tokens: 64,
      messages: [{ role: "user", content: "Reply with: OK" }],
      output_config: { effort: "low" },
      ...requestExtras(),
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    return { model: res.model, ms: Date.now() - t0 };
  } catch (e) {
    throw toAIError(e);
  }
}
