// Small server helpers: TTL cache, per-IP rate limit, JSON error responses.
import { AIError } from "./ai/client";
import { InputError } from "./amazon/url";

// ---------- TTL cache (per server instance) ----------

export class TTLCache<V> {
  private map = new Map<string, { v: V; exp: number }>();
  constructor(
    private ttlMs: number,
    private max = 200,
  ) {}
  get(k: string): V | undefined {
    const e = this.map.get(k);
    if (!e) return undefined;
    if (Date.now() > e.exp) {
      this.map.delete(k);
      return undefined;
    }
    return e.v;
  }
  set(k: string, v: V) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value as string);
    this.map.set(k, { v, exp: Date.now() + this.ttlMs });
  }
}

// ---------- rate limit ----------

const hits = new Map<string, number[]>();

/** Sliding-window limiter. Returns seconds to wait, or 0 when allowed. */
export function rateLimit(key: string, limit: number, windowMs: number): number {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return Math.ceil((windowMs - (now - arr[0])) / 1000);
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return 0;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

// ---------- errors ----------

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 500,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorResponse(e: unknown): Response {
  if (e instanceof InputError) return Response.json({ error: e.message, code: "bad_input" }, { status: 400 });
  if (e instanceof AppError || e instanceof AIError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
  console.error("[unexpected]", e);
  return Response.json({ error: "服务器内部错误，请重试", code: "internal" }, { status: 500 });
}

export function tooMany(seconds: number): Response {
  return Response.json({ error: `请求太频繁，请 ${seconds} 秒后再试`, code: "rate_limited" }, { status: 429 });
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError("请求格式不正确", "bad_json", 400);
  }
}
