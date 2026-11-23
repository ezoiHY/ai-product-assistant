// Dev helper: fetch + parse live product pages and print timing / attempts.
// Usage: npx tsx scripts/try-fetch.ts <amazon url or ASIN> [...more]
import { fetchProductPage } from "../src/lib/amazon/fetch";
import { completenessOf, parseProductHtml } from "../src/lib/amazon/parse";
import { parseAmazonInput } from "../src/lib/amazon/url";

async function main() {
for (const input of process.argv.slice(2)) {
  const t0 = Date.now();
  try {
    const { asin, domain, canonicalUrl } = await parseAmazonInput(input);
    const out = await fetchProductPage(asin, domain);
    const attempts = out.attempts.map((a) => `${a.verdict}${a.status ? "/" + a.status : ""} ${a.ms}ms`).join(" -> ");
    if (out.ok) {
      const { product } = parseProductHtml(out.html, { asin, domain, url: canonicalUrl });
      const c = completenessOf(product);
      console.log(`OK   ${asin} ${Date.now() - t0}ms [${attempts}] ${c.score}% | ${product.title.slice(0, 60)} | ${product.price?.display ?? "no price"}`);
    } else {
      console.log(`FAIL ${asin} ${Date.now() - t0}ms [${attempts}] reason=${out.reason}`);
    }
  } catch (e) {
    console.log(`ERR  ${input}: ${(e as Error).message}`);
  }
}
}

void main();
