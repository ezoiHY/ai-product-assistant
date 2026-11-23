import { productFromHtml } from "@/lib/scrape";
import { AppError, clientIp, errorResponse, rateLimit, readJson, tooMany } from "@/lib/server-utils";

export const maxDuration = 60;

// "浏览器带回": parse a product page the visitor's browser sent (bookmarklet).
export async function POST(req: Request) {
  try {
    const wait = rateLimit(`scrape:${clientIp(req)}`, 20, 10 * 60_000);
    if (wait) return tooMany(wait);
    const body = await readJson<{ url?: string; html?: string }>(req);
    if (typeof body.url !== "string" || typeof body.html !== "string") throw new AppError("缺少商品页内容", "bad_input", 400);
    if (body.html.length < 2000) throw new AppError("带回的页面内容不完整，请在商品页加载完后再点书签", "too_short", 400);
    if (body.html.length > 4_000_000) throw new AppError("页面内容太大了", "too_large", 413);
    return Response.json(await productFromHtml(body.url.slice(0, 2000), body.html));
  } catch (e) {
    return errorResponse(e);
  }
}
