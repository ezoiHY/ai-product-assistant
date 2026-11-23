import { formatProduct } from "@/lib/ai/format";
import { VideoScriptSchema } from "@/lib/ai/schemas";
import { runReviewStage } from "@/lib/ai/stages";
import { sanitizeProduct } from "@/lib/scrape";
import { AppError, clientIp, errorResponse, rateLimit, readJson, tooMany } from "@/lib/server-utils";

export const maxDuration = 300;

// Fact-check + ad-compliance review of the generated script, returns a corrected final version.
export async function POST(req: Request) {
  try {
    const wait = rateLimit(`ai:${clientIp(req)}`, 40, 10 * 60_000);
    if (wait) return tooMany(wait);
    const body = await readJson<{ product?: unknown; script?: unknown }>(req);
    const product = sanitizeProduct(body.product);
    const script = VideoScriptSchema.safeParse(body.script);
    if (!script.success) throw new AppError("缺少待审核的文案", "bad_input", 400);
    const result = await runReviewStage(product, script.data, formatProduct(product));
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
