// The AI pipeline. Each stage is one structured-output call to Claude.
//
//   scrape ─► A info+brief (fast) ─► C script ─► D review (fact-check + compliance)
//          └► B deep analysis (with product images) ──────────────► (in parallel)
//
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ProductData } from "../types";
import { AIError, structuredCall, type CallMeta } from "./client";
import { formatProduct, visionImageUrl } from "./format";
import { ANALYSIS_SYSTEM, INFO_SYSTEM, REVIEW_SYSTEM, SCRIPT_SYSTEM, SHORTEN_SYSTEM } from "./prompts";
import {
  InfoStageSchema,
  ProductAnalysisSchema,
  ReviewReportSchema,
  VideoScriptSchema,
  type InfoStage,
  type ProductAnalysis,
  type ReviewReport,
  type VideoScript,
} from "./schemas";
import { countChars, MAX_CHARS, runScriptChecks, type ScriptCheck } from "../quality/rules";

type Block = Anthropic.Beta.BetaContentBlockParam;

const text = (t: string): Block => ({ type: "text", text: t });

function productBlock(product: ProductData, digest?: string): Block {
  return text(`<product_data>\n${formatProduct(product, digest)}\n</product_data>`);
}

// ---------- A ----------

export async function runInfoStage(product: ProductData, digest?: string): Promise<{ data: InfoStage; meta: CallMeta }> {
  return structuredCall({
    schema: InfoStageSchema,
    system: INFO_SYSTEM,
    effort: "low",
    content: [productBlock(product, digest), text("请输出 productInfo 和 brief。")],
  });
}

// ---------- B ----------

function isImageFetchError(e: unknown): boolean {
  return e instanceof AIError && e.code === "bad_request" && /image|url|download|fetch/i.test(e.message);
}

export async function runAnalysisStage(
  product: ProductData,
  digest?: string,
): Promise<{ data: ProductAnalysis; meta: CallMeta; imagesUsed: number }> {
  const images = product.images.slice(0, 4).map(visionImageUrl);
  const build = (withImages: boolean): Block[] => [
    productBlock(product, digest),
    ...(withImages && images.length
      ? [
          text(`以下是该商品详情页的 ${images.length} 张商品图（第 1 张为主图）：`),
          ...images.map((url): Block => ({ type: "image", source: { type: "url", url } })),
        ]
      : []),
    text(withImages && images.length ? "请结合资料和图片完成分析。" : "（本次没有商品图片，visualInsights.observations 留空数组。）请完成分析。"),
  ];
  try {
    const r = await structuredCall({ schema: ProductAnalysisSchema, system: ANALYSIS_SYSTEM, effort: "medium", content: build(true) });
    return { ...r, imagesUsed: images.length };
  } catch (e) {
    // If Anthropic can't download an image, retry once without images.
    if (images.length && isImageFetchError(e)) {
      const r = await structuredCall({ schema: ProductAnalysisSchema, system: ANALYSIS_SYSTEM, effort: "medium", content: build(false) });
      return { ...r, imagesUsed: 0 };
    }
    throw e;
  }
}

// ---------- C ----------

const ShortScriptSchema = z.object({ script: z.string().describe("压缩后的完整口播文案") });

async function shortenText(script: string, target: number): Promise<string> {
  const { data } = await structuredCall({
    schema: ShortScriptSchema,
    system: SHORTEN_SYSTEM,
    effort: "low",
    maxTokens: 4000,
    content: [text(`原文案（${countChars(script)} 字，含标点）：\n${script}\n\n请压缩到 ${target} 字以内（含标点）。`)],
  });
  return data.script.trim();
}

/** Cut at the last sentence boundary that fits — last-resort guarantee. */
function hardTrim(script: string, max = MAX_CHARS): string {
  if (countChars(script) <= max) return script;
  const parts = script.match(/[^。！？!?…]+[。！？!?…]*/g) ?? [script];
  let out = "";
  for (const p of parts) {
    if (countChars(out + p) > max) break;
    out += p;
  }
  return out || [...script].slice(0, max).join("");
}

export async function enforceLength(script: string): Promise<{ script: string; shortened: boolean }> {
  let s = script.trim();
  if (countChars(s) <= MAX_CHARS) return { script: s, shortened: false };
  for (let i = 0; i < 2 && countChars(s) > MAX_CHARS; i++) {
    s = await shortenText(s, 138 - i * 10);
  }
  return { script: hardTrim(s), shortened: true };
}

export async function runScriptStage(
  product: ProductData,
  info: InfoStage,
  sourceText: string,
): Promise<{ data: VideoScript; meta: CallMeta; checks: ScriptCheck[]; shortened: boolean }> {
  const brief = info.brief;
  const briefText = [
    `中文品名：${info.productInfo.nameZh}`,
    `一句话：${info.productInfo.oneLiner}`,
    `目标人群：${brief.audience}`,
    `核心痛点：${brief.mainPain}`,
    `关键卖点：${brief.topSellingPoints.map((s, i) => `${i + 1}) ${s}`).join(" ")}`,
    `可用背书：${brief.proof || "无"}`,
    `建议钩子角度：${brief.hookAngle}`,
  ].join("\n");
  const r = await structuredCall({
    schema: VideoScriptSchema,
    system: SCRIPT_SYSTEM,
    effort: "medium",
    content: [
      productBlock(product),
      text(`<creative_brief>\n${briefText}\n</creative_brief>\n\n请写口播文案。简报是运营同事的建议，事实仍以 product_data 为准。`),
    ],
  });
  const { script, shortened } = await enforceLength(r.data.script);
  const data: VideoScript = shortened ? { ...r.data, script } : r.data;
  return { data, meta: r.meta, checks: runScriptChecks(data.script, data.hook, sourceText), shortened };
}

// ---------- D ----------

export async function runReviewStage(
  product: ProductData,
  script: VideoScript,
  sourceText: string,
): Promise<{ data: ReviewReport; meta: CallMeta; checksBefore: ScriptCheck[]; checksAfter: ScriptCheck[]; finalScript: string }> {
  const checksBefore = runScriptChecks(script.script, script.hook, sourceText);
  const ruleFindings = checksBefore
    .filter((c) => c.status !== "pass")
    .map((c) => `- ${c.label}：${c.detail}`)
    .join("\n");
  const r = await structuredCall({
    schema: ReviewReportSchema,
    system: REVIEW_SYSTEM,
    effort: "medium",
    content: [
      productBlock(product),
      text(
        `<script_to_review>\n${script.script}\n</script_to_review>\n\n` +
          (ruleFindings ? `规则引擎的预检结果（供参考，需你逐条判断）：\n${ruleFindings}\n\n` : "") +
          "请完成核查并给出修正后的终稿。",
      ),
    ],
  });
  const { script: finalScript } = await enforceLength(r.data.revisedScript || script.script);
  const data: ReviewReport = { ...r.data, revisedScript: finalScript };
  return { data, meta: r.meta, checksBefore, checksAfter: runScriptChecks(finalScript, script.hook, sourceText), finalScript };
}
