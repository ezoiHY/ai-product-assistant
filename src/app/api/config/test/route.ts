import { pingModel } from "@/lib/ai/client";
import { llmConfig, withLLM } from "@/lib/ai/config";
import { clientIp, errorResponse, rateLimit, tooMany } from "@/lib/server-utils";

export const maxDuration = 60;

// "测试连接": one tiny request with the config from the headers (the visitor's
// unsaved form values, or the server key when no key is given).
export async function POST(req: Request) {
  try {
    const wait = rateLimit(`cfgtest:${clientIp(req)}`, 10, 10 * 60_000);
    if (wait) return tooMany(wait);
    return await withLLM(req, async () => {
      const r = await pingModel();
      const cfg = llmConfig();
      return Response.json({ ok: true, model: r.model, ms: r.ms, keySource: cfg.keySource, customBaseURL: Boolean(cfg.baseURL) });
    });
  } catch (e) {
    return errorResponse(e);
  }
}
