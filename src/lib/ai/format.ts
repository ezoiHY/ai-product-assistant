// Render ProductData as a compact, readable text block for the prompts.
import type { ProductData } from "../types";

const fmt = (n: number) => n.toLocaleString("en-US");

export function formatProduct(p: ProductData, digest?: string): string {
  const L: string[] = [];
  L.push("【基本信息】");
  L.push(`ASIN: ${p.asin} | 站点: ${p.marketplace}`);
  L.push(`标题: ${p.title}`);
  if (p.brand) L.push(`品牌/作者: ${p.brand}`);
  if (p.price) {
    const extra = [p.price.listPrice ? `划线价 ${p.price.listPrice}` : "", p.price.savings ? `折扣 ${p.price.savings}` : ""].filter(Boolean).join("，");
    L.push(`价格: ${p.price.display}${extra ? `（${extra}）` : ""}`);
  } else {
    L.push("价格: 页面未显示价格");
  }
  if (p.rating !== undefined) {
    let s = `评分: ${p.rating}/5`;
    if (p.ratingCount) s += `（${fmt(p.ratingCount)} 个评分）`;
    if (p.ratingHistogram) s += `；星级分布 5★${p.ratingHistogram[0]}% 4★${p.ratingHistogram[1]}% 3★${p.ratingHistogram[2]}% 2★${p.ratingHistogram[3]}% 1★${p.ratingHistogram[4]}%`;
    L.push(s);
  }
  if (p.boughtPastMonth) L.push(`近期销量: ${p.boughtPastMonth}`);
  if (p.categories.length) L.push(`类目: ${p.categories.join(" > ")}`);
  if (p.bestSellersRank.length) L.push(`畅销榜排名: ${p.bestSellersRank.join("；")}`);
  if (p.variations.length) {
    L.push(
      `款式: ${p.variations
        .map((v) => `${v.name}（${v.options.length}种${v.selected ? `，当前 ${v.selected}` : ""}）: ${v.options.slice(0, 8).join(" / ")}${v.options.length > 8 ? " …" : ""}`)
        .join("；")}`,
    );
  }
  if (p.availability) L.push(`库存: ${p.availability}`);

  if (p.bullets.length) {
    L.push("", "【卖点 About this item】");
    p.bullets.forEach((b, i) => L.push(`${i + 1}. ${b}`));
  }
  if (p.specs.length) {
    L.push("", "【规格参数】");
    for (const s of p.specs) L.push(`- ${s.name}: ${s.value}`);
  }
  if (p.description) L.push("", "【商品描述】", p.description);
  if (p.inTheBox?.length) L.push("", "【包装清单】", p.inTheBox.join("；"));
  if (p.importantInfo) L.push("", "【重要信息（成分/用法/安全提示等）】", p.importantInfo);
  if (p.aplusText) L.push("", "【A+ 品牌内容（节选）】", p.aplusText);

  const ri = p.reviewInsights;
  if (ri && (ri.summary || ri.aspects.length)) {
    L.push("", "【买家评价洞察（Amazon \"Customers say\"，由全部评价汇总）】");
    if (ri.summary) L.push(`总体: ${ri.summary}`);
    for (const a of ri.aspects) {
      const senti = a.sentiment === "positive" ? "正面" : a.sentiment === "negative" ? "负面" : a.sentiment === "mixed" ? "褒贬不一" : a.sentiment;
      const nums = [a.mentions ? `提及 ${fmt(a.mentions)} 次` : "", a.sentimentMentions ? `其中 ${fmt(a.sentimentMentions)} 次为该倾向` : ""].filter(Boolean).join("，");
      L.push(`- ${a.label}${senti ? `（${senti}${nums ? "，" + nums : ""}）` : ""}${a.summary ? `：${a.summary}` : ""}`);
      for (const sn of a.snippets.slice(0, 2)) L.push(`    买家原话: "${sn}"`);
    }
  } else {
    L.push("", "【买家评价洞察】页面未提供评价摘要");
  }

  if (digest) L.push("", "【页面原文摘录（补充参考）】", digest);
  return L.join("\n");
}

/** Smaller image variant for vision input (~800px is plenty and cheaper). */
export function visionImageUrl(url: string): string {
  if (!/m\.media-amazon\.com\/images\/I\//.test(url)) return url;
  if (/\._[^/]*_\.(jpe?g|png|webp)$/i.test(url)) return url.replace(/\._[^/]*_\.(jpe?g|png|webp)$/i, "._SL800_.$1");
  return url.replace(/\.(jpe?g|png|webp)$/i, "._SL800_.$1");
}
