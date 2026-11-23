// Orchestrates: parse link -> direct fetch + parse -> (fallback) Claude web tools.
import { aiConfigured } from "./ai/client";
import { extractFromText, extractWithWeb } from "./ai/extract";
import { fetchProductPage } from "./amazon/fetch";
import { buildPageDigest, completenessOf, parseProductHtml } from "./amazon/parse";
import { extractAsinFromPath, parseAmazonInput } from "./amazon/url";
import { AppError, TTLCache } from "./server-utils";
import type { ProductData, ScrapeResult } from "./types";

const cache = new TTLCache<ScrapeResult>(30 * 60_000);

const FAIL_MESSAGES: Record<string, { msg: string; status: number }> = {
  not_found: { msg: "Amazon 上找不到这个商品页面：可能已下架、链接有误，或该站点不售卖此商品。", status: 404 },
  captcha: { msg: "Amazon 暂时用验证码拦截了服务器访问。可以稍后重试，或展开下方「手动粘贴商品信息」继续分析。", status: 502 },
  blocked: { msg: "Amazon 暂时拒绝了服务器访问。可以稍后重试，或展开下方「手动粘贴商品信息」继续分析。", status: 502 },
  network: { msg: "连接 Amazon 超时，请稍后重试。", status: 504 },
};

export async function scrapeProduct(input: string, opts: { fresh?: boolean } = {}): Promise<ScrapeResult & { cached?: boolean }> {
  const t0 = Date.now();
  const { asin, domain, canonicalUrl } = await parseAmazonInput(input);
  const key = `${domain}:${asin}`;
  if (!opts.fresh) {
    const hit = cache.get(key);
    if (hit) return { ...hit, cached: true };
  }

  const outcome = await fetchProductPage(asin, domain);
  if (outcome.ok) {
    const { product, warnings } = parseProductHtml(outcome.html, { asin, domain, url: canonicalUrl });
    if (product.title) {
      const result: ScrapeResult = {
        product,
        source: "direct",
        sourceDetail: `服务器直接请求 Amazon 商品页并解析 HTML（${outcome.attempts.length > 1 ? `重试 ${outcome.attempts.length - 1} 次后成功` : "一次成功"}）`,
        pageDigest: buildPageDigest(outcome.html),
        completeness: completenessOf(product),
        warnings,
        elapsedMs: Date.now() - t0,
      };
      cache.set(key, result);
      return result;
    }
  }

  const reason = outcome.ok ? "blocked" : outcome.reason;
  // Fallback: Claude's own web tools (Anthropic fetches the page / searches the web).
  if (aiConfigured()) {
    const web = await extractWithWeb({ asin, domain, url: canonicalUrl }).catch(() => null);
    if (web) {
      const result: ScrapeResult = {
        product: web.product,
        source: "claude_web",
        sourceDetail: `直连被 Amazon 拦截（${reason}），改用 Claude 联网工具（web_fetch / web_search）获取：${web.notes}`,
        pageDigest: "",
        completeness: completenessOf(web.product),
        warnings: ["数据来自 Claude 联网获取，字段可能不如直连解析完整，建议核对价格等关键信息"],
        elapsedMs: Date.now() - t0,
      };
      cache.set(key, result);
      return result;
    }
  }
  const f = FAIL_MESSAGES[reason] ?? FAIL_MESSAGES.blocked;
  throw new AppError(f.msg, reason, f.status);
}

export async function productFromPaste(text: string, url?: string): Promise<ScrapeResult> {
  const t0 = Date.now();
  if (text.trim().length < 80) throw new AppError("粘贴的内容太少了，请复制商品详情页的完整文字（标题、卖点、参数等）", "too_short", 400);
  let asin = "MANUAL";
  let domain = "amazon.com";
  let canonical = "";
  if (url?.trim()) {
    try {
      const p = await parseAmazonInput(url);
      ({ asin, domain } = p);
      canonical = p.canonicalUrl;
    } catch {
      asin = extractAsinFromPath(url) ?? "MANUAL";
    }
  }
  const product = await extractFromText(text, { asin, domain, url: canonical });
  return {
    product,
    source: "manual",
    sourceDetail: "用户手动粘贴的页面文字，由 Claude 抽取为结构化信息",
    pageDigest: text.slice(0, 12_000),
    completeness: completenessOf(product),
    warnings: [],
    elapsedMs: Date.now() - t0,
  };
}

// ---------- validate product payloads coming back from the browser ----------

const s = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.trim() ? v.slice(0, max) : undefined);
const n = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const arr = <T>(v: unknown, max: number, map: (x: unknown) => T | undefined): T[] =>
  Array.isArray(v) ? (v.slice(0, max).map(map).filter((x) => x !== undefined) as T[]) : [];

/** Re-validate and clamp a ProductData object received from the client. */
export function sanitizeProduct(raw: unknown): ProductData {
  const r = (raw ?? {}) as Record<string, unknown>;
  const title = s(r.title, 400);
  if (!title) throw new AppError("缺少商品数据，请重新抓取", "bad_product", 400);
  const price = r.price as Record<string, unknown> | undefined;
  const ri = r.reviewInsights as Record<string, unknown> | undefined;
  return {
    asin: s(r.asin, 20) ?? "UNKNOWN",
    url: s(r.url, 300) ?? "",
    marketplace: s(r.marketplace, 30) ?? "amazon.com",
    title,
    brand: s(r.brand, 100),
    byline: s(r.byline, 200),
    price: price && s(price.display, 60) ? { display: s(price.display, 60)!, amount: n(price.amount), listPrice: s(price.listPrice, 40), savings: s(price.savings, 20) } : undefined,
    rating: n(r.rating),
    ratingCount: n(r.ratingCount),
    ratingHistogram: arr(r.ratingHistogram, 5, n).length === 5 ? arr(r.ratingHistogram, 5, n) : undefined,
    boughtPastMonth: s(r.boughtPastMonth, 80),
    categories: arr(r.categories, 8, (x) => s(x, 120)),
    bestSellersRank: arr(r.bestSellersRank, 5, (x) => s(x, 160)),
    bullets: arr(r.bullets, 15, (x) => s(x, 800)),
    description: s(r.description, 3000),
    aplusText: s(r.aplusText, 3200),
    specs: arr(r.specs, 45, (x) => {
      const o = x as Record<string, unknown>;
      const name = s(o?.name, 80);
      const value = s(o?.value, 300);
      return name && value ? { name, value } : undefined;
    }),
    variations: arr(r.variations, 5, (x) => {
      const o = x as Record<string, unknown>;
      const name = s(o?.name, 60);
      return name ? { name, selected: s(o.selected, 80), options: arr(o.options, 30, (y) => s(y, 80)) } : undefined;
    }),
    availability: s(r.availability, 200),
    importantInfo: s(r.importantInfo, 1600),
    inTheBox: arr(r.inTheBox, 12, (x) => s(x, 160)),
    images: arr(r.images, 8, (x) => (typeof x === "string" && /^https:\/\/\S+$/.test(x) ? x.slice(0, 400) : undefined)),
    reviewInsights: ri
      ? {
          summary: s(ri.summary, 1500),
          aspects: arr(ri.aspects, 10, (x) => {
            const o = x as Record<string, unknown>;
            const label = s(o?.label, 60);
            return label
              ? { label, sentiment: s(o.sentiment, 20) ?? "", mentions: n(o.mentions), sentimentMentions: n(o.sentimentMentions), summary: s(o.summary, 400), snippets: arr(o.snippets, 3, (y) => s(y, 300)) }
              : undefined;
          }),
        }
      : undefined,
  };
}
