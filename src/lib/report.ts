// Build a Markdown report from a finished run (for copy / download).
import type { AnalysisRun } from "./api-types";

export function buildMarkdown(run: AnalysisRun): string {
  const p = run.scrape.data?.product;
  if (!p) return "";
  const info = run.info.data?.data.productInfo;
  const a = run.insight.data?.data;
  const s = run.script.data?.data;
  const r = run.review.data;
  const L: string[] = [];
  L.push(`# ${info?.nameZh ?? p.title}`, "", `> ${p.title}`, `> ${p.url || ""}`, "");

  if (info) {
    L.push("## 1. 产品信息整理", "", info.oneLiner, "");
    L.push(`- **品类**：${info.category}`, `- **价格**：${info.price}`, `- **口碑**：${info.socialProof}`);
    if (info.variants) L.push(`- **款式**：${info.variants}`);
    L.push("", "**核心功能**", "");
    info.coreFeatures.forEach((f) => L.push(`- **${f.title}**：${f.detail}`));
    L.push("", "| 参数 | 值 |", "| --- | --- |");
    info.keySpecs.forEach((x) => L.push(`| ${x.name} | ${x.value} |`));
    L.push("");
  }
  if (a) {
    L.push("## 2. 产品分析", "", `**定位**：${a.positioning.summary}`, "", `**价格带**：${a.positioning.priceBand}`, "");
    L.push("**目标用户**", "");
    a.targetUsers.forEach((u) => L.push(`- **${u.persona}**：${u.need}（下单时刻：${u.trigger}）`));
    L.push("", "**使用场景**", "");
    a.scenarios.forEach((x) => L.push(`- ${x.scene}：${x.value}`));
    L.push("", "**痛点 → 解决方案**", "");
    a.painPoints.forEach((x) => L.push(`- ${x.pain} → ${x.solution}（${x.evidence}）`));
    L.push("", "**核心卖点**", "");
    a.sellingPoints.forEach((x, i) => L.push(`${i + 1}. **${x.point}**（证据${x.strength}）：${x.benefit}（${x.evidence}）`));
    L.push("", "**买家声音**", "", a.voiceOfCustomer.verdict, "");
    a.voiceOfCustomer.loves.forEach((x) => L.push(`- 👍 ${x}`));
    a.voiceOfCustomer.complaints.forEach((x) => L.push(`- 👎 ${x}`));
    L.push("", "**购买顾虑与应对**", "");
    a.objections.forEach((x) => L.push(`- “${x.concern}” → ${x.response}`));
    L.push("", `**竞争格局（推断）**：替代方案 ${a.competition.alternatives.join("、")}；优势：${a.competition.advantage}；劣势：${a.competition.weakness}`);
    L.push("", `**内容策略**：${a.contentStrategy.bestAngle}`, "");
    a.contentStrategy.angles.forEach((x) => L.push(`- ${x.angle}：“${x.hook}”（${x.platform}）`));
    if (a.contentStrategy.avoid.length) L.push(`- 避免：${a.contentStrategy.avoid.join("；")}`);
    if (a.visualInsights.observations.length) {
      L.push("", "**图片洞察**", "");
      a.visualInsights.observations.forEach((x) => L.push(`- ${x}`));
      a.visualInsights.shotIdeas.forEach((x) => L.push(`- 🎬 ${x}`));
    }
    L.push("");
  }
  if (s) {
    L.push("## 3. 短视频口播文案", "", `**标题**：${s.title}　**钩子类型**：${s.hookType}`, "");
    L.push(`> ${r?.finalScript ?? s.script}`, "");
    L.push("| 时间 | 口播 | 画面 |", "| --- | --- | --- |");
    s.segments.forEach((x) => L.push(`| ${x.time} | ${x.line} | ${x.visual} |`));
    L.push("", s.hashtags.map((t) => `#${t.replace(/^#/, "")}`).join(" "), "");
  }
  if (r) {
    L.push("## 4. 质量检查", "", r.data.verdict, "");
    L.push(`事实准确 ${r.data.scores.factuality} · 合规 ${r.data.scores.compliance} · 钩子 ${r.data.scores.hook} · 自然度 ${r.data.scores.naturalness}`, "");
    r.data.claims.forEach((c) => L.push(`- [${c.status}] “${c.claim}” — ${c.source}${c.fix ? `（改为：${c.fix}）` : ""}`));
    r.data.compliance.forEach((c) => L.push(`- [合规] “${c.text}” — ${c.issue}`));
    L.push("");
  }
  return L.join("\n");
}
