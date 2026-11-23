// Thin wrapper around the official Anthropic SDK: one place for model choice,
// structured outputs, refusal fallbacks and error translation.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";

// Server-side refusal fallback (beta). Can be switched off, e.g. for gateways
// that don't support beta parameters.
const USE_FALLBACKS = process.env.ANTHROPIC_FALLBACKS !== "off" && !/^claude-haiku/.test(MODEL);
// Optional fast mode (higher price, faster output) for supported models.
const FAST_MODE = process.env.ANTHROPIC_FAST_MODE === "on";

export type Effort = "low" | "medium" | "high";

export class AIError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 500,
  ) {
    super(message);
    this.name = "AIError";
  }
}

let client: Anthropic | null = null;

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function getClient(): Anthropic {
  if (!aiConfigured()) {
    throw new AIError("服务器还没有配置 ANTHROPIC_API_KEY，AI 分析暂不可用", "not_configured", 503);
  }
  client ??= new Anthropic({ maxRetries: 2, timeout: 150_000 });
  return client;
}

export function requestExtras(): Record<string, unknown> {
  return {
    ...(USE_FALLBACKS ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    ...(FAST_MODE ? { speed: "fast" } : {}),
  };
}

export function toAIError(e: unknown): AIError {
  if (e instanceof AIError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new AIError("模型 API Key 无效或已过期，请检查服务器配置", "auth", 503);
  if (e instanceof Anthropic.PermissionDeniedError) return new AIError("API Key 没有调用该模型的权限", "permission", 503);
  if (e instanceof Anthropic.PaymentRequiredError) return new AIError("模型账户余额不足", "billing", 503);
  if (e instanceof Anthropic.RateLimitError) return new AIError("模型接口繁忙（限流），请稍后重试", "rate_limit", 429);
  if (e instanceof Anthropic.OverloadedError) return new AIError("模型服务暂时过载，请稍后重试", "overloaded", 503);
  if (e instanceof Anthropic.BadRequestError) return new AIError(`模型接口拒绝了请求：${e.message}`, "bad_request", 502);
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new AIError("模型响应超时，请重试", "timeout", 504);
  if (e instanceof Anthropic.APIConnectionError) return new AIError("连接模型接口失败，请重试", "connection", 502);
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
      model: MODEL,
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
