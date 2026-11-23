import { createHash } from "node:crypto";
import { runAnalysisStage, runInfoStage } from "@/lib/ai/stages";
import { completenessOf } from "@/lib/amazon/parse";
import { sanitizeProduct } from "@/lib/scrape";
import { AppError, TTLCache, clientIp, errorResponse, rateLimit, readJson, tooMany } from "@/lib/server-utils";

export const maxDuration = 300;

const cache = new TTLCache<unknown>(30 * 60_000);

// part = "info"    -> 中文产品档案 + 创作简报 (fast)
// part = "insight" -> 深度产品分析 (with product images)
export async function POST(req: Request) {
  try {
    const wait = rateLimit(`ai:${clientIp(req)}`, 40, 10 * 60_000);
    if (wait) return tooMany(wait);
    const body = await readJson<{ part?: string; product?: unknown; pageDigest?: string; fresh?: boolean }>(req);
    const product = sanitizeProduct(body.product);
    // The raw page digest is a safety net for unusual layouts; skip it (and its
    // tokens) when the structured parse already captured the page well.
    const rawDigest = typeof body.pageDigest === "string" ? body.pageDigest.slice(0, 12_000) : "";
    const digest = rawDigest && completenessOf(product).score < 75 ? rawDigest : undefined;
    if (body.part !== "info" && body.part !== "insight") throw new AppError("unknown part", "bad_input", 400);

    const key = createHash("sha1").update(body.part + JSON.stringify(product) + (digest ?? "")).digest("hex");
    if (!body.fresh) {
      const hit = cache.get(key);
      if (hit) return Response.json({ ...(hit as object), cached: true });
    }
    const result = body.part === "info" ? await runInfoStage(product, digest) : await runAnalysisStage(product, digest);
    cache.set(key, result);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
