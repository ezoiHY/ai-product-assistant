import { formatProduct } from "@/lib/ai/format";
import { InfoStageSchema } from "@/lib/ai/schemas";
import { runScriptStage } from "@/lib/ai/stages";
import { sanitizeProduct } from "@/lib/scrape";
import { AppError, clientIp, errorResponse, rateLimit, readJson, tooMany } from "@/lib/server-utils";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const wait = rateLimit(`ai:${clientIp(req)}`, 40, 10 * 60_000);
    if (wait) return tooMany(wait);
    const body = await readJson<{ product?: unknown; info?: unknown }>(req);
    const product = sanitizeProduct(body.product);
    const info = InfoStageSchema.safeParse(body.info);
    if (!info.success) throw new AppError("缺少产品档案，请先完成信息整理", "bad_input", 400);
    const result = await runScriptStage(product, info.data, formatProduct(product));
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
