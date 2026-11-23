// Thin wrapper around the official Anthropic SDK: one place for model choice,
// credentials, structured outputs, refusal fallbacks and error translation.
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { jsonrepair } from "jsonrepair";
import { z } from "zod";
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

// ---------- structured output, with a fallback for gateways ----------
//
// Real Claude models support structured outputs (output_config.format): the
// reply is guaranteed to match the schema. Some Anthropic-compatible gateways
// accept the request but silently drop that parameter (often because a
// different model sits behind them), so the model never sees the schema and
// answers in Markdown. For those endpoints we switch to "prompted JSON": the
// schema goes into the system prompt and the reply is validated with zod, with
// one correction round. Which endpoint+model needs this is remembered.

const promptedJsonEndpoints = new Set<string>();

function endpointKey(): string {
  const c = llmConfig();
  return `${c.baseURL ?? "official"}|${c.model}`;
}

function structuredOutputUnsupported(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Failed to parse structured output/i.test(msg)) return true; // param ignored, reply was not JSON
  return e instanceof Anthropic.BadRequestError && /output_config|output_format|json_schema|structured/i.test(msg);
}

/** Pull the JSON object out of a reply that may be wrapped in a code fence or
 *  text, repairing the usual LLM slips (unescaped quotes, trailing commas,
 *  missing closing brackets) locally instead of paying for another round trip. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  if (start < 0) throw new SyntaxError("no JSON object in reply");
  const end = body.lastIndexOf("}");
  const candidate = end > start ? body.slice(start, end + 1) : body.slice(start);
  try {
    return JSON.parse(candidate);
  } catch {
    return JSON.parse(jsonrepair(end > start ? candidate : body.slice(start)));
  }
}

function describeIssues(err: z.ZodError): string {
  return err.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(根)"}：${i.message}`)
    .join("；");
}

function textOf(res: Anthropic.Beta.BetaMessage): string {
  return res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function logCall(mode: string, res: Anthropic.Beta.BetaMessage, ms: number) {
  const c = llmConfig();
  console.info(
    `[ai] ${mode} requested=${c.model} served=${res.model} ${(ms / 1000).toFixed(1)}s in=${res.usage.input_tokens} out=${res.usage.output_tokens} stop=${res.stop_reason}${c.baseURL ? " (custom endpoint)" : ""}`,
  );
}

function checkStop(res: { stop_reason: string | null }) {
  if (res.stop_reason === "refusal") throw new AIError("模型拒绝处理这段内容", "refusal", 422);
  if (res.stop_reason === "max_tokens") throw new AIError("模型输出过长被截断，请重试", "max_tokens", 502);
}

type StructuredOpts<S extends z.ZodType> = {
  schema: S;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  effort: Effort;
  maxTokens?: number;
};

async function nativeStructured<S extends z.ZodType>(opts: StructuredOpts<S>, t0: number): Promise<{ data: z.infer<S>; meta: CallMeta }> {
  const res = await getClient().beta.messages.parse({
    model: currentModel(),
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    ...requestExtras(),
  });
  logCall("native-json", res, Date.now() - t0);
  checkStop(res);
  if (!res.parsed_output) throw new AIError("模型输出格式异常，请重试", "parse_error", 502);
  return {
    data: res.parsed_output as z.infer<S>,
    meta: { model: res.model, ms: Date.now() - t0, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
  };
}

async function promptedStructured<S extends z.ZodType>(opts: StructuredOpts<S>, t0: number): Promise<{ data: z.infer<S>; meta: CallMeta }> {
  const schemaText = JSON.stringify(z.toJSONSchema(opts.schema));
  const system =
    `${opts.system}\n\n## 输出格式（必须遵守）\n` +
    "只输出一个 JSON 对象：不要 Markdown 标题，不要解释文字，不要代码块标记。" +
    "JSON 必须符合下面的 JSON Schema：字段名保持英文原样，所有字段都要有，数组按描述给出合适的条数，文字内容用简体中文。\n" +
    schemaText;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.content }];
  let inputTokens = 0;
  let outputTokens = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ta = Date.now();
    const res = await getClient().beta.messages.create({
      model: currentModel(),
      max_tokens: opts.maxTokens ?? 16000,
      system,
      messages,
      output_config: { effort: opts.effort },
      ...requestExtras(),
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    logCall(attempt === 0 ? "prompted-json" : "prompted-json-fix", res, Date.now() - ta);
    checkStop(res);
    inputTokens += res.usage.input_tokens;
    outputTokens += res.usage.output_tokens;
    const text = textOf(res);
    let problem: string;
    try {
      const parsed = opts.schema.safeParse(extractJson(text));
      if (parsed.success) {
        return { data: parsed.data as z.infer<S>, meta: { model: res.model, ms: Date.now() - t0, inputTokens, outputTokens } };
      }
      problem = describeIssues(parsed.error);
    } catch (err) {
      problem = "输出不是合法的 JSON 对象";
      console.warn(`[ai] could not parse reply even after repair: ${err instanceof Error ? err.message : err}`);
    }
    console.warn(`[ai] reply failed validation, asking for a fix: ${problem.slice(0, 300)}`);
    // one correction round with the concrete validation errors
    messages.push(
      { role: "assistant", content: text || "(空)" },
      { role: "user", content: `你的输出没有通过校验：${problem}。请只输出修正后的完整 JSON 对象，不要任何其他文字。` },
    );
  }
  throw new AIError("模型没有按要求输出 JSON，请重试或换一个模型", "parse_error", 502);
}

/** One structured-output call: returns data validated against `schema`. */
export async function structuredCall<S extends z.ZodType>(opts: StructuredOpts<S>): Promise<{ data: z.infer<S>; meta: CallMeta }> {
  const key = endpointKey();
  // Custom (gateway) endpoints: go straight to prompted JSON. A gateway that
  // drops output_config.format would otherwise waste one full generation first.
  const custom = Boolean(llmConfig().baseURL);
  try {
    if (!custom && !promptedJsonEndpoints.has(key)) {
      try {
        return await nativeStructured(opts, Date.now());
      } catch (e) {
        if (!structuredOutputUnsupported(e)) throw e;
        promptedJsonEndpoints.add(key);
        console.warn(`[ai] structured outputs unsupported at ${key.split("|")[0]} for ${currentModel()}, using prompted JSON`);
      }
    }
    return await promptedStructured(opts, Date.now());
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
