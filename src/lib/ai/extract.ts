// Fallbacks for when the direct page fetch fails:
//  1. Claude's server-side web tools (web_fetch the URL, else web_search the ASIN)
//  2. The user pastes the page text and Claude extracts the fields
import type Anthropic from "@anthropic-ai/sdk";
import type { ProductData } from "../types";
import { parseMoney } from "../amazon/parse";
import { AIError, currentModel, getClient, requestExtras, structuredCall, toAIError } from "./client";
import { EXTRACT_SYSTEM } from "./prompts";
import { ExtractedProductSchema, type ExtractedProduct } from "./schemas";

interface Ctx {
  asin: string;
  domain: string;
  url: string;
}

export function extractedToProduct(x: ExtractedProduct, ctx: Ctx): ProductData {
  const specs = x.specs.filter((s) => s.name && s.value).slice(0, 40);
  if (x.variations) specs.push({ name: "款式", value: x.variations });
  return {
    asin: ctx.asin,
    url: ctx.url,
    marketplace: ctx.domain,
    title: x.title,
    brand: x.brand || undefined,
    price: x.price ? { display: x.price, amount: parseMoney(x.price) } : undefined,
    rating: x.rating > 0 && x.rating <= 5 ? x.rating : undefined,
    ratingCount: x.ratingCount > 0 ? Math.round(x.ratingCount) : undefined,
    categories: x.categories.filter(Boolean).slice(0, 6),
    bestSellersRank: [],
    bullets: x.bullets.filter(Boolean).slice(0, 12),
    description: x.description || undefined,
    specs,
    variations: [],
    images: x.images.filter((u) => /^https:\/\/[^\s]+$/.test(u)).slice(0, 6),
    reviewInsights: x.reviewSummary ? { summary: x.reviewSummary, aspects: [] } : undefined,
  };
}

/** Manual mode: the user pasted the product page text. */
export async function extractFromText(pasted: string, ctx: Ctx): Promise<ProductData> {
  const body = pasted.slice(0, 40_000);
  const { data } = await structuredCall({
    schema: ExtractedProductSchema,
    system: EXTRACT_SYSTEM,
    effort: "low",
    content: [{ type: "text", text: `<page_content>\n${body}\n</page_content>\n\n请抽取商品信息。` }],
  });
  if (!data.found || !data.title) {
    throw new AIError("没能从粘贴的内容里识别出商品信息，请粘贴商品详情页的完整文字（标题、卖点、参数等）", "not_product", 422);
  }
  return extractedToProduct(data, ctx);
}

function findJson(textOut: string): unknown {
  const fenced = textOut.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : textOut.slice(textOut.indexOf("{"), textOut.lastIndexOf("}") + 1);
  return JSON.parse(candidate);
}

const WEB_INSTRUCTIONS = (ctx: Ctx) => `需要获取这个 Amazon 商品的信息：${ctx.url}（ASIN: ${ctx.asin}）

步骤：
1. 先用 web_fetch 打开上面的链接，读取商品详情页。
2. 如果页面是验证码/机器人检查页或打不开，再用 web_search 搜索 "${ctx.asin}"（可加上商品名），从可靠来源收集信息：优先 Amazon 页面，其次品牌官网和主流零售/评测网站。确认搜到的是同一个商品（ASIN 或型号一致）。
3. 如果页面明确显示商品不存在或已下架（404 / Page Not Found），不要用搜索结果代替，直接 found=false。

最后只输出一个 JSON 对象，放在 \`\`\`json 代码块里，不要输出其他文字。字段：
{"found": boolean, "title": string, "brand": string, "price": string, "rating": number, "ratingCount": number,
 "categories": string[], "bullets": string[], "description": string, "specs": [{"name": string, "value": string}],
 "variations": string, "reviewSummary": string, "images": string[], "notes": string}
规则：只写来源中明确出现的信息，未知填 "" / 0 / []；保留英文原文；notes 写清信息来自哪里。`;

/** Fallback when Amazon blocks the server: let Claude fetch / search the web. */
export async function extractWithWeb(ctx: Ctx): Promise<{ product: ProductData; notes: string } | null> {
  const client = getClient();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: WEB_INSTRUCTIONS(ctx) }];
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 },
    { type: "web_search_20260209", name: "web_search", max_uses: 3 },
  ];
  try {
    let res: Anthropic.Beta.BetaMessage | null = null;
    for (let turn = 0; turn < 4; turn++) {
      res = await client.beta.messages.create({
        model: currentModel(),
        max_tokens: 16000,
        system: EXTRACT_SYSTEM,
        messages,
        tools,
        output_config: { effort: "low" },
        ...requestExtras(),
      } as Anthropic.Beta.MessageCreateParamsNonStreaming);
      if (res.stop_reason !== "pause_turn") break;
      // server tool loop paused: send the partial turn back so it can continue
      messages.push({ role: "assistant", content: res.content });
    }
    if (!res || res.stop_reason === "refusal") return null;
    // Only trust the answer when the server tools actually ran: a model that
    // ignored the tools could otherwise invent "fetched" product data.
    const usedTools = res.content.some((b) => b.type === "web_fetch_tool_result" || b.type === "web_search_tool_result");
    if (!usedTools) {
      console.warn("[scrape] web fallback returned no tool results; ignoring its answer");
      return null;
    }
    const out = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const parsed = ExtractedProductSchema.safeParse(findJson(out));
    if (!parsed.success || !parsed.data.found || !parsed.data.title) return null;
    return { product: extractedToProduct(parsed.data, ctx), notes: parsed.data.notes };
  } catch (e) {
    if (e instanceof SyntaxError) return null;
    throw toAIError(e);
  }
}
