import { AIError, listModels } from "@/lib/ai/client";
import { llmConfig, withLLM } from "@/lib/ai/config";
import { clientIp, errorResponse, rateLimit, tooMany } from "@/lib/server-utils";

export const maxDuration = 60;

// "获取模型": list the models the visitor's key (from the unsaved form) can use.
export async function POST(req: Request) {
  try {
    const wait = rateLimit(`cfgmodels:${clientIp(req)}`, 10, 10 * 60_000);
    if (wait) return tooMany(wait);
    return await withLLM(req, async () => {
      // With the server's key only the preset models are accepted, so a list
      // would only offer models that can't be selected.
      if (llmConfig().keySource !== "user") {
        throw new AIError("获取模型列表需要先填写你自己的 API Key（使用服务器的 Key 时只能选择预设模型）", "needs_user_key", 400);
      }
      const models = await listModels();
      return Response.json({ models });
    });
  } catch (e) {
    return errorResponse(e);
  }
}
