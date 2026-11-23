// Dev helper: run the parser over saved product pages and print a compact report.
// Usage: npx tsx scripts/parse-fixtures.ts <dir-with-ASIN.html-files> [--full ASIN]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPageDigest, completenessOf, parseProductHtml } from "../src/lib/amazon/parse";

const dir = process.argv[2];
const fullIdx = process.argv.indexOf("--full");
const fullAsin = fullIdx > -1 ? process.argv[fullIdx + 1] : undefined;
if (!dir) {
  console.error("usage: tsx scripts/parse-fixtures.ts <dir> [--full ASIN]");
  process.exit(1);
}

for (const file of readdirSync(dir).filter((f) => f.endsWith(".html")).sort()) {
  const asin = file.replace(/\.html$/, "");
  if (fullAsin && asin !== fullAsin) continue;
  const html = readFileSync(join(dir, file), "utf8");
  const t0 = performance.now();
  const { product: p, warnings } = parseProductHtml(html, { asin, domain: "amazon.com", url: `https://www.amazon.com/dp/${asin}` });
  const ms = Math.round(performance.now() - t0);
  if (fullAsin) {
    console.log(JSON.stringify(p, null, 2));
    console.log("\n--- digest ---\n" + buildPageDigest(html).slice(0, 3000));
    continue;
  }
  const c = completenessOf(p);
  console.log(`\n=== ${asin}  (${ms}ms, completeness ${c.score}%${c.missing.length ? " missing: " + c.missing.join("/") : ""})`);
  console.log(`title    : ${p.title.slice(0, 90)}`);
  console.log(`brand    : ${p.brand ?? "-"}   | byline: ${p.byline?.slice(0, 50) ?? "-"}`);
  console.log(`price    : ${p.price ? `${p.price.display} (amount=${p.price.amount}, list=${p.price.listPrice ?? "-"}, save=${p.price.savings ?? "-"})` : "-"}`);
  console.log(`rating   : ${p.rating ?? "-"} (${p.ratingCount ?? "-"} ratings) hist=${p.ratingHistogram?.join("/") ?? "-"} | bought: ${p.boughtPastMonth ?? "-"}`);
  console.log(`category : ${p.categories.join(" > ") || "-"} | BSR: ${p.bestSellersRank.join(" ; ") || "-"}`);
  console.log(`bullets  : ${p.bullets.length}  first: ${p.bullets[0]?.slice(0, 80) ?? "-"}`);
  console.log(`specs    : ${p.specs.length}  ${p.specs.slice(0, 6).map((s) => `${s.name}=${s.value.slice(0, 25)}`).join(" | ")}`);
  console.log(`variation: ${p.variations.map((v) => `${v.name}(${v.options.length}${v.selected ? ", sel=" + v.selected : ""})`).join(", ") || "-"}`);
  console.log(`images   : ${p.images.length}  ${p.images[0] ?? ""}`);
  console.log(`desc/aplus: ${p.description?.length ?? 0} / ${p.aplusText?.length ?? 0} chars | avail: ${p.availability?.slice(0, 60) ?? "-"}`);
  const ri = p.reviewInsights;
  console.log(`reviews  : summary=${ri?.summary ? ri.summary.slice(0, 80) + "…" : "-"}`);
  console.log(`           aspects=${ri?.aspects.map((a) => `${a.label}[${a.sentiment[0] ?? "?"}${a.mentions ?? ""}]`).join(", ") ?? "-"}`);
  if (warnings.length) console.log(`warnings : ${warnings.join("; ")}`);
}
