// Dev helper: run the whole pipeline (scrape -> info -> analysis | script -> review)
// for one or more products and save every stage's output as JSON.
// Usage: npx tsx --env-file=.env.local scripts/run-pipeline.ts <url|ASIN> [...more] [--out dir]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatProduct } from "../src/lib/ai/format";
import { runAnalysisStage, runInfoStage, runReviewStage, runScriptStage } from "../src/lib/ai/stages";
import { scrapeProduct } from "../src/lib/scrape";

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outDir = outIdx > -1 ? args[outIdx + 1] : "pipeline-out";
  const inputs = args.filter((a, i) => a !== "--out" && i !== outIdx + 1);
  mkdirSync(outDir, { recursive: true });

  for (const input of inputs) {
    const t0 = Date.now();
    try {
      const scrape = await scrapeProduct(input, { fresh: true });
      const p = scrape.product;
      const digest = scrape.completeness.score < 75 ? scrape.pageDigest : undefined;
      const source = formatProduct(p);
      console.log(`\n=== ${p.asin} | ${p.title.slice(0, 70)}\nscrape: ${scrape.source} ${scrape.elapsedMs}ms completeness ${scrape.completeness.score}%`);

      const insightP = runAnalysisStage(p, digest).then((r) => {
        console.log(`insight: ${r.meta.ms}ms, in ${r.meta.inputTokens} / out ${r.meta.outputTokens} tok, images ${r.imagesUsed}`);
        return r;
      });
      const chainP = (async () => {
        const info = await runInfoStage(p, digest);
        console.log(`info: ${info.meta.ms}ms, in ${info.meta.inputTokens} / out ${info.meta.outputTokens} tok`);
        const script = await runScriptStage(p, info.data, source);
        console.log(`script: ${script.meta.ms}ms${script.shortened ? " (shortened)" : ""}\n  ${script.data.script}`);
        const review = await runReviewStage(p, script.data, source);
        console.log(`review: ${review.meta.ms}ms scores ${JSON.stringify(review.data.scores)}\n  final: ${review.finalScript}`);
        console.log(`  checks: ${review.checksAfter.map((c) => `${c.label}=${c.status}`).join(", ")}`);
        return { info, script, review };
      })();
      const [insight, chain] = await Promise.all([insightP, chainP]);
      writeFileSync(join(outDir, `${p.asin}.json`), JSON.stringify({ scrape, insight, ...chain }, null, 2));
      console.log(`total: ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${join(outDir, p.asin + ".json")}`);
    } catch (e) {
      console.log(`FAILED ${input}: ${(e as Error).message}`);
    }
  }
}

void main();
