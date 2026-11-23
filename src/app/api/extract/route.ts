import { productFromPaste } from "@/lib/scrape";
import { AppError, clientIp, errorResponse, rateLimit, readJson, tooMany } from "@/lib/server-utils";

export const maxDuration = 120;

// Manual mode: the user pastes the product page text when scraping is blocked.
export async function POST(req: Request) {
  try {
    const wait = rateLimit(`ai:${clientIp(req)}`, 40, 10 * 60_000);
    if (wait) return tooMany(wait);
    const body = await readJson<{ text?: string; url?: string }>(req);
    if (typeof body.text !== "string") throw new AppError("请粘贴商品页面的文字", "bad_input", 400);
    return Response.json(await productFromPaste(body.text, typeof body.url === "string" ? body.url : undefined));
  } catch (e) {
    return errorResponse(e);
  }
}
