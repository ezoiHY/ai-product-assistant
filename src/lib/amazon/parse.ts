// Parse an Amazon product page into structured data.
// Strategy: many selectors per field (Amazon runs several page layouts at once),
// plus a few embedded-JSON sources that are more stable than the markup.
// Nothing here is specific to a product or category.

import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { PriceInfo, ProductData, ReviewAspect, ReviewInsights, Spec, Variation } from "../types";

type Cheerio = ReturnType<CheerioAPI>;

const INVISIBLE = /[​-‏‪-‮⁠﻿]/g;

export function clean(s: string | undefined | null): string {
  return (s ?? "").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

function textOf($: CheerioAPI, el: Cheerio): string {
  const c = el.clone();
  c.find("script, style, noscript, svg, iframe").remove();
  return clean(c.text());
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n).trimEnd() + "…" : s;
}

function uniq<T>(arr: T[], key: (x: T) => string = (x) => String(x)): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = key(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

// ---------------- price ----------------

export function parseMoney(display: string): number | undefined {
  const m = display.replace(INVISIBLE, "").match(/\d[\d.,\s]*/);
  if (!m) return undefined;
  let num = m[0].replace(/\s/g, "");
  const lastDot = num.lastIndexOf(".");
  const lastComma = num.lastIndexOf(",");
  if (lastDot > -1 && lastComma > -1) {
    // the later separator is the decimal one
    if (lastComma > lastDot) num = num.replace(/\./g, "").replace(",", ".");
    else num = num.replace(/,/g, "");
  } else if (lastComma > -1) {
    // "12,99" (EU decimal) vs "1,299" (thousands)
    num = /,\d{2}$/.test(num) ? num.replace(",", ".") : num.replace(/,/g, "");
  }
  const v = parseFloat(num);
  return Number.isFinite(v) ? v : undefined;
}

/** Read one `.a-price` element. Prefers the visible parts because the
 *  offscreen text sometimes drops the decimal point (e.g. "$4499"). */
function readAPrice($: CheerioAPI, priceEl: Cheerio): string {
  const symbol = clean(priceEl.find(".a-price-symbol").first().text());
  const whole = clean(priceEl.find(".a-price-whole").first().text()).replace(/[.,]$/, "");
  const fraction = clean(priceEl.find(".a-price-fraction").first().text());
  const off = clean(priceEl.find(".a-offscreen").first().text());
  if (whole) {
    const hasDecimalInOff = /[.,]\d{2}\b/.test(off);
    if (hasDecimalInOff) return off;
    return `${symbol}${whole}${fraction ? "." + fraction : ""}`;
  }
  return off;
}

function extractPrice($: CheerioAPI): PriceInfo | undefined {
  // Containers for the buy-box price, most specific first.
  const containers = [
    "#corePriceDisplay_desktop_feature_div",
    "#corePrice_feature_div",
    "#corePrice_desktop",
    "#apex_desktop",
    "#apex_offerDisplay_desktop",
    "#tp_price_block_total_price_ww",
    "#buybox",
    "#rightCol",
  ];
  let display = "";
  for (const sel of containers) {
    const box = $(sel).first();
    if (!box.length) continue;
    const range = box.find(".a-price-range").first();
    if (range.length) {
      const parts = range.find(".a-price").toArray().map((e) => readAPrice($, $(e))).filter(Boolean);
      if (parts.length) {
        display = parts.join(" - ");
        break;
      }
    }
    const candidates = box
      .find(".priceToPay, .apex-pricetopay-value, .a-price")
      .toArray()
      .map((e) => $(e))
      // skip strike-through / unit prices
      .filter((e) => e.attr("data-a-strike") !== "true" && !e.hasClass("a-text-price") && !e.closest(".basisPrice, .pricePerUnit, [data-a-size='mini']").length);
    for (const c of candidates) {
      const p = c.hasClass("a-price") ? readAPrice($, c) : readAPrice($, c.find(".a-price").first().length ? c.find(".a-price").first() : c);
      if (p && /\d/.test(p)) {
        display = p;
        break;
      }
    }
    if (display) break;
  }
  // Legacy ids
  if (!display) {
    for (const sel of ["#priceblock_dealprice", "#priceblock_ourprice", "#price_inside_buybox", "#newBuyBoxPrice", "#kindle-price", "#price", "#tmmSwatches .a-button-selected .slot-price", "#tmmSwatches .a-button-selected .a-color-price"]) {
      const t = clean($(sel).first().text());
      if (t && /\d/.test(t)) {
        display = t;
        break;
      }
    }
  }
  if (!display) return undefined;
  display = truncate(display, 40);

  // List / strike-through price: only look inside the buy-box containers,
  // otherwise we pick up prices of other products in carousels.
  const listEl = $(
    "#corePriceDisplay_desktop_feature_div .basisPrice .a-price, #corePrice_desktop .a-text-price, #corePrice_feature_div .a-text-price, #apex_desktop .basisPrice .a-price, #corePriceDisplay_desktop_feature_div .a-price[data-a-strike='true'], #apex_desktop .a-price[data-a-strike='true']",
  ).first();
  const amount = parseMoney(display.split(" - ")[0]);
  let listPrice = listEl.length ? readAPrice($, listEl) : undefined;
  const listAmount = listPrice ? parseMoney(listPrice) : undefined;
  // a "list price" that isn't higher than the current price is noise
  if (!listPrice || listPrice === display || (amount !== undefined && listAmount !== undefined && listAmount <= amount)) {
    listPrice = undefined;
  }
  const savings = listPrice
    ? clean($("#corePriceDisplay_desktop_feature_div .savingsPercentage, #apex_desktop .savingsPercentage, #corePrice_feature_div .savingsPercentage").first().text()) || undefined
    : undefined;
  return { display, amount, listPrice, savings };
}

// ---------------- specs ----------------

const SKIP_SPEC = /^(customer reviews|asin|best sellers rank|amazon best ?sellers rank|is discontinued by manufacturer|unspsc code|global trade identification number|upc|ean)$/i;

function collectSpecs($: CheerioAPI): { specs: Spec[]; bsr: string[] } {
  const raw: Spec[] = [];
  let bsrText = "";
  const push = (name: string, value: string) => {
    const n = clean(name).replace(/[:：]\s*$/, "").trim();
    let v = clean(value);
    if (!n || !v || n.length > 60) return;
    if (/best ?sellers rank/i.test(n)) {
      bsrText = bsrText || v;
      return;
    }
    if (SKIP_SPEC.test(n)) return;
    v = truncate(v, 220);
    raw.push({ name: n, value: v });
  };

  // Product overview (top of page) – 2 column table
  $("#productOverview_feature_div tr, #poExpander tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length >= 2) push($(tds[0]).text(), textOf($, $(tds[tds.length - 1])));
  });
  // New "product facts" layout
  $("#productFactsDesktop_feature_div .product-facts-detail, #productFactsDesktopExpander .product-facts-detail").each((_, row) => {
    push($(row).find(".a-col-left").first().text(), $(row).find(".a-col-right").first().text());
  });
  // Technical details / additional information tables
  $(
    "#productDetails_techSpec_section_1 tr, #productDetails_techSpec_section_2 tr, #productDetails_detailBullets_sections1 tr, #productDetails_db_sections tr, #prodDetails tr, #tech tr, #technicalSpecifications_section_1 tr, #item_details tr",
  ).each((_, tr) => {
    const th = $(tr).find("th").first();
    const td = $(tr).find("td").last();
    if (th.length && td.length) push(th.text(), textOf($, td));
    else {
      const tds = $(tr).find("td");
      if (tds.length >= 2) push($(tds[0]).text(), textOf($, $(tds[1])));
    }
  });
  // Bullet style details (books, many categories)
  $("#detailBullets_feature_div li, #detailBulletsWrapper_feature_div li, #item_details li").each((_, li) => {
    const bold = $(li).find(".a-text-bold").first();
    if (!bold.length) return;
    const name = bold.text();
    const value = textOf($, $(li)).replace(clean(name), "");
    push(name, value);
  });
  // Best Sellers Rank sometimes lives outside the tables
  if (!bsrText) {
    const node = $("#SalesRank, #detailBullets_feature_div li:contains('Best Sellers Rank')").first();
    if (node.length) bsrText = textOf($, node).replace(/^.*?Best Sellers Rank:?/i, "");
  }

  const specs = uniq(raw, (s) => s.name.toLowerCase());
  const bsr = bsrText
    ? bsrText
        .replace(/\(See Top 100[^)]*\)/gi, "")
        .split(/(?=#\d)/)
        .map((s) => clean(s))
        .filter((s) => /^#\d/.test(s))
        .slice(0, 4)
    : [];
  return { specs: specs.slice(0, 40), bsr };
}

// ---------------- images ----------------

function imageKey(url: string): string {
  const m = url.match(/\/images\/I\/([A-Za-z0-9+%-]+)\./);
  return m ? m[1] : url;
}

function extractImages($: CheerioAPI, html: string): string[] {
  const out: string[] = [];
  const block = html.match(/'colorImages'\s*:\s*\{\s*'initial'\s*:\s*(\[[\s\S]*?\])\s*\}\s*,/);
  if (block) {
    try {
      const arr = JSON.parse(block[1]) as Array<{ hiRes?: string | null; large?: string; main?: Record<string, unknown> }>;
      for (const it of arr) {
        const u = it.hiRes || it.large;
        if (u) out.push(u);
      }
    } catch {
      /* fall through to regex */
    }
  }
  if (!out.length) {
    for (const m of html.matchAll(/"hiRes":"(https:\/\/[^"]+?\.(?:jpg|png|webp))"/g)) out.push(m[1]);
  }
  if (!out.length) {
    const img = $("#landingImage, #imgBlkFront, #ebooksImgBlkFront, #main-image").first();
    const hi = img.attr("data-old-hires");
    if (hi) out.push(hi);
    const dyn = img.attr("data-a-dynamic-image");
    if (dyn) {
      try {
        out.push(...Object.keys(JSON.parse(dyn)));
      } catch {
        /* ignore */
      }
    }
    const src = img.attr("src");
    if (src && src.startsWith("http")) out.push(src);
  }
  return uniq(out, imageKey).slice(0, 8);
}

// ---------------- variations ----------------

function extractVariations(html: string): Variation[] {
  const vv = html.match(/"variationValues"\s*:\s*(\{[\s\S]*?\})\s*,\s*"/);
  if (!vv) return [];
  let values: Record<string, string[]>;
  try {
    values = JSON.parse(vv[1]);
  } catch {
    return [];
  }
  const labels: Record<string, string> = {};
  const disp = html.match(/"variationDisplayLabels"\s*:\s*(\{[\s\S]*?\})/);
  if (disp) {
    try {
      Object.assign(labels, JSON.parse(disp[1]));
    } catch {
      /* ignore */
    }
  }
  let selected: Record<string, string> = {};
  const sel = html.match(/"selected_variations"\s*:\s*(\{[\s\S]*?\})/);
  if (sel) {
    try {
      selected = JSON.parse(sel[1]);
    } catch {
      /* ignore */
    }
  }
  return Object.entries(values)
    .filter(([, opts]) => Array.isArray(opts) && opts.length > 0)
    .map(([key, opts]) => ({
      name: labels[key] ?? key.replace(/_name$/, "").replace(/_/g, " "),
      selected: selected[key],
      options: opts.slice(0, 30).map((o) => clean(String(o))),
    }))
    .slice(0, 4);
}

// ---------------- reviews ("Customers say") ----------------

interface KFragment {
  text?: string;
  inertText?: string;
  semanticContent?: { content?: { text?: string } };
}

function fragmentsToText(frags: KFragment[] | undefined): string {
  if (!Array.isArray(frags)) return "";
  return clean(frags.map((f) => f.text ?? f.inertText ?? f.semanticContent?.content?.text ?? "").join(""));
}

/** Amazon renders the review insights widget from base64 JSON embedded in
 *  HTML comments (`<!-- k-injected k+b64 ... -->`). Decode them generically. */
function extractReviewInsights($: CheerioAPI, html: string): ReviewInsights | undefined {
  let summary = "";
  let aspects: ReviewAspect[] = [];
  const re = /<!--\s*k-injected k\+b64 ([A-Za-z0-9+/=]+)\s*-->/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let j: { "k-component"?: string; "k-data"?: Record<string, unknown> };
    try {
      j = JSON.parse(Buffer.from(m[1], "base64").toString("utf8"));
    } catch {
      continue;
    }
    const data = j["k-data"];
    if (!data || typeof data !== "object") continue;
    const comp = String(j["k-component"] ?? "");
    if (!summary && /summary|fragmenttexts/i.test(comp) && Array.isArray((data as { fragments?: unknown }).fragments)) {
      summary = fragmentsToText((data as { fragments: KFragment[] }).fragments);
    }
    const flat = (data as { aspectsFlattened?: unknown }).aspectsFlattened;
    if (Array.isArray(flat) && flat.length && (flat[0] as { summary?: string }).summary && aspects.length === 0) {
      aspects = (flat as Array<Record<string, unknown>>).map((a) => ({
        label: clean(String(a.label ?? "")),
        sentiment: String(a.sentiment ?? ""),
        mentions: typeof a.mentions === "number" ? a.mentions : undefined,
        sentimentMentions: typeof a.sentimentMentions === "number" ? a.sentimentMentions : undefined,
        summary: clean(String(a.summary ?? "")),
        snippets: Array.isArray(a.snippets)
          ? (a.snippets as Array<{ text?: { fragments?: KFragment[] } }>)
              .map((s) => truncate(fragmentsToText(s.text?.fragments), 240))
              .filter(Boolean)
              .slice(0, 3)
          : [],
      }));
    }
  }
  // Plain-markup fallbacks for older layouts
  if (!summary) {
    summary = clean($("#product-summary p, [data-hook='cr-insights-widget-summary'], #cr-product-insights-cards p").first().text());
  }
  if (!aspects.length) {
    $("[data-hook='cr-insights-aspect-link'], #cr-product-insights-cards .a-button-text").each((_, el) => {
      const label = clean($(el).text());
      if (label) aspects.push({ label, sentiment: "", snippets: [] });
    });
  }
  // Top reviews, when the page still server-renders them
  const reviews: string[] = [];
  $("[data-hook='review']").each((_, el) => {
    const body = clean($(el).find("[data-hook='review-body']").text());
    if (body) reviews.push(truncate(body, 300));
  });
  if (reviews.length && !aspects.length) {
    aspects.push({ label: "top reviews", sentiment: "", snippets: reviews.slice(0, 6) });
  }
  if (!summary && !aspects.length) return undefined;
  return { summary: summary || undefined, aspects: aspects.slice(0, 10) };
}

// ---------------- main ----------------

export interface ParseResult {
  product: ProductData;
  warnings: string[];
}

export function parseProductHtml(html: string, ctx: { asin: string; domain: string; url: string }): ParseResult {
  const $ = cheerio.load(html);
  const warnings: string[] = [];

  let title = clean($("#productTitle").first().text()) || clean($("#title").first().text());
  if (!title) {
    title = clean($('meta[name="title"]').attr("content")) || clean($("title").first().text());
    title = title.replace(/^Amazon\.[a-z.]+\s*[:：]\s*/i, "").replace(/\s*[:：]\s*[^:：]+$/, "");
  }

  const byline = clean($("#bylineInfo").first().text()) || undefined;
  const authors = $("#bylineInfo .author a.a-link-normal")
    .toArray()
    .map((a) => clean($(a).text()))
    .filter(Boolean);

  const { specs, bsr } = collectSpecs($);
  const specBrand = specs.find((s) => /^(brand|brand name|manufacturer|marke|marque|marca|ブランド)$/i.test(s.name))?.value;
  let brand =
    byline?.match(/Visit the (.+?) Store/i)?.[1] ??
    byline?.match(/^(?:Brand|Marke|Marque|Marca)\s*[:：]\s*(.+)$/i)?.[1] ??
    specBrand ??
    undefined;
  if (!brand && authors.length) brand = authors.join(", ");

  // rating
  const ratingText =
    $("#acrPopover").attr("title") ||
    clean($("#acrPopover .a-icon-alt").first().text()) ||
    clean($("[data-hook='rating-out-of-text']").first().text()) ||
    clean($("#averageCustomerReviews .a-icon-alt").first().text());
  const rm = ratingText?.match(/(\d+(?:[.,]\d+)?)/);
  const rating = rm ? parseFloat(rm[1].replace(",", ".")) : undefined;
  const countText =
    $("#acrCustomerReviewText").first().attr("aria-label") || clean($("#acrCustomerReviewText").first().text());
  let ratingCount: number | undefined;
  if (countText) {
    const k = countText.match(/([\d.,]+)\s*[kK]\b/);
    ratingCount = k ? Math.round(parseFloat(k[1].replace(",", ".")) * 1000) : parseInt(countText.replace(/[^\d]/g, ""), 10) || undefined;
  }

  // histogram (5★ → 1★)
  const hist: number[] = [];
  $("#histogramTable [aria-label]").each((_, el) => {
    const t = $(el).attr("aria-label") ?? "";
    const mm = t.match(/(\d+)\s*(?:percent|%)[^\d]*(\d)\s*star/i);
    if (mm) hist[5 - parseInt(mm[2], 10)] = parseInt(mm[1], 10);
  });
  if (hist.filter((x) => x !== undefined).length < 3) {
    hist.length = 0;
    $("#histogramTable .a-text-right, #histogramTable .a-list-item .a-size-base:last-child").each((_, el) => {
      const mm = clean($(el).text()).match(/^(\d+)%$/);
      if (mm && hist.length < 5) hist.push(parseInt(mm[1], 10));
    });
  }
  const ratingHistogram = hist.length === 5 && hist.every((x) => typeof x === "number") ? hist : undefined;

  const boughtPastMonth = clean($("#social-proofing-faceout-title-tk_bought").first().text()) || undefined;

  const categories = $("#wayfinding-breadcrumbs_feature_div li:not(.a-breadcrumb-divider) a")
    .toArray()
    .map((a) => clean($(a).text()))
    .filter(Boolean);

  let bullets = $("#feature-bullets li:not(#replacementPartsFitmentBullet) .a-list-item")
    .toArray()
    .map((li) => textOf($, $(li)));
  if (!bullets.length) {
    bullets = $("#productFactsDesktopExpander ul li .a-list-item, #productFactsDesktop_feature_div ul li .a-list-item, #featurebullets_feature_div li")
      .toArray()
      .map((li) => textOf($, $(li)));
  }
  bullets = uniq(
    bullets.filter((b) => b.length > 3 && !/^(see more product details|make sure this fits)/i.test(b)),
  )
    .map((b) => truncate(b, 600))
    .slice(0, 12);

  let description = textOf($, $("#productDescription").first()).replace(/^Product Description\s*/i, "");
  if (!description) description = textOf($, $("#bookDescription_feature_div .a-expander-content, #bookDescription_feature_div").first());
  description = truncate(description, 2500);

  const aplusRoot = $("#aplus_feature_div, #aplus, #aplus3p_feature_div").first();
  let aplusText = "";
  if (aplusRoot.length) {
    const alts = aplusRoot
      .find("img[alt]")
      .toArray()
      .map((i) => clean($(i).attr("alt")))
      .filter((a) => a.length > 12);
    aplusText = truncate(clean(textOf($, aplusRoot) + " " + uniq(alts).join(" | ")), 3000);
  }

  let availability = truncate(textOf($, $("#availability").first()), 160) || undefined;
  if (/cannot be shipped to your selected delivery location/i.test(html)) {
    warnings.push("Amazon 显示该商品无法配送到服务器所在地区，价格/库存信息可能缺失");
    // that message is about the server's location, not the product
    if (availability && /cannot be shipped|different delivery location/i.test(availability)) availability = undefined;
  }

  const importantInfo =
    truncate(textOf($, $("#importantInformation_feature_div, #important-information").first()).replace(/^Important information\s*/i, ""), 1500) || undefined;
  const inTheBox = uniq(
    $("#whatsInTheBox_feature_div li, #witb-content-list li")
      .toArray()
      .map((li) => textOf($, $(li)))
      .filter((t) => t.length > 1),
  ).slice(0, 12);

  const price = extractPrice($);

  const product: ProductData = {
    asin: ctx.asin,
    url: ctx.url,
    marketplace: ctx.domain,
    title,
    brand: brand ? truncate(brand, 80) : undefined,
    byline: byline ? truncate(byline, 160) : undefined,
    price,
    rating: rating && rating <= 5 ? rating : undefined,
    ratingCount,
    ratingHistogram,
    boughtPastMonth,
    categories,
    bestSellersRank: bsr,
    bullets,
    description: description || undefined,
    aplusText: aplusText || undefined,
    specs,
    variations: extractVariations(html),
    availability,
    importantInfo,
    inTheBox: inTheBox.length ? inTheBox : undefined,
    images: extractImages($, html),
    reviewInsights: extractReviewInsights($, html),
  };
  return { product, warnings };
}

/** Cleaned text of the parts of the page that describe the product.
 *  Used as a safety net for layouts the selectors above don't know. */
export function buildPageDigest(html: string, maxChars = 12_000): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, link, .a-carousel-container, [data-a-carousel-options], #sims-consolidated-1_feature_div, [cel_widget_id*='sims'], [id*='sponsored'], [class*='sponsored']").remove();
  const sections: Array<[string, string]> = [
    ["Title & buy box", "#centerCol #title_feature_div, #centerCol #averageCustomerReviews_feature_div, #corePriceDisplay_desktop_feature_div, #corePrice_desktop, #apex_desktop"],
    ["About this item", "#feature-bullets, #productFactsDesktop_feature_div"],
    ["Product overview", "#productOverview_feature_div"],
    ["Description", "#productDescription_feature_div, #bookDescription_feature_div"],
    ["Details", "#prodDetails, #detailBullets_feature_div, #productDetails_feature_div, #tech"],
    ["What's in the box", "#whatsInTheBox_feature_div, #witb-content-list"],
    ["Important information", "#importantInformation_feature_div, #important-information"],
    ["From the brand / A+", "#aplus_feature_div, #aplusBrandStory_feature_div"],
  ];
  const parts: string[] = [];
  const used = new Set<unknown>();
  for (const [label, sel] of sections) {
    const texts: string[] = [];
    $(sel).each((_, el) => {
      if (used.has(el)) return;
      used.add(el);
      const t = clean($(el).text());
      if (t) texts.push(t);
    });
    const joined = uniq(texts).join(" ");
    if (joined) parts.push(`## ${label}\n${truncate(joined, 3500)}`);
  }
  return truncate(parts.join("\n\n"), maxChars);
}

export function completenessOf(p: ProductData): { score: number; missing: string[] } {
  const checks: Array<[string, boolean]> = [
    ["标题", !!p.title],
    ["价格", !!p.price],
    ["评分", p.rating !== undefined],
    ["卖点描述", p.bullets.length >= 2 || !!p.description],
    ["规格参数", p.specs.length >= 3],
    ["图片", p.images.length > 0],
    ["类目", p.categories.length > 0 || p.bestSellersRank.length > 0],
    ["用户评价洞察", !!p.reviewInsights],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([n]) => n);
  return { score: Math.round(((checks.length - missing.length) / checks.length) * 100), missing };
}
