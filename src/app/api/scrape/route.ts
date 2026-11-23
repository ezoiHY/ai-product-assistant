import { withLLM } from "@/lib/ai/config";
import { scrapeProduct } from "@/lib/scrape";
import { AppError, clientIp, errorResponse, rateLimit, readJson, tooMany } from "@/lib/server-utils";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const wait = rateLimit(`scrape:${clientIp(req)}`, 20, 10 * 60_000);
    if (wait) return tooMany(wait);
    const body = await readJson<{ input?: string; fresh?: boolean }>(req);
    if (typeof body.input !== "string") throw new AppError("请粘贴一个 Amazon 商品链接", "bad_input", 400);
    const input = body.input.slice(0, 2000);
    // the model config matters here too: it powers the Claude web fallback
    return await withLLM(req, async () => Response.json(await scrapeProduct(input, { fresh: body.fresh === true })));
  } catch (e) {
    return errorResponse(e);
  }
}
