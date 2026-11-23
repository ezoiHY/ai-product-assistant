// Deterministic checks for the voice-over script. These run without the LLM,
// so the hard requirements (length, hook, banned words) are always verified.

export type CheckStatus = "pass" | "warn" | "fail";

export interface ScriptCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export const MAX_CHARS = 150;
/** Typical short-video voice-over speed (Chinese characters per second). */
export const CHARS_PER_SECOND = 4.5;
/** Characters that fit in the first 5 seconds. */
export const HOOK_MAX_CHARS = 25;

/** Count every non-whitespace character (汉字, 标点, 字母, 数字 each count as 1). */
export function countChars(s: string): number {
  return [...s.replace(/\s/g, "")].length;
}

export function estimateSeconds(s: string): number {
  return Math.round(countChars(s) / CHARS_PER_SECOND);
}

/** First sentence of the script (up to the first sentence-ending punctuation). */
export function firstSentence(s: string): string {
  const m = s.trim().match(/^.+?[。！？!?…]+/);
  return (m ? m[0] : s.trim().slice(0, HOOK_MAX_CHARS)).trim();
}

interface BannedRule {
  re: RegExp;
  reason: string;
  severity: "fail" | "warn";
}

// 《广告法》第九条 绝对化用语 + common platform rules. Patterns are written to
// avoid harmless words like 最近 / 最后 / 第一次.
const BANNED: BannedRule[] = [
  { re: /最(好|强|佳|优|低|高|便宜|划算|实惠|大|小|轻|快|安全|舒服|舒适|实用|值|火|热|新|先进|受欢迎|顶级)/g, reason: "绝对化用语（最…）", severity: "fail" },
  { re: /全网(最|第一|独家|首发)|史上最|宇宙级|天花板/g, reason: "绝对化/夸大用语", severity: "fail" },
  { re: /(排名|销量|全网|行业|全球)第一|第一(品牌|名)|NO\.?\s?1|No\.?\s?1|TOP\s?1/gi, reason: "绝对化用语（第一）", severity: "fail" },
  { re: /唯一|独一无二|首选|首个|首款|首家/g, reason: "绝对化用语（唯一/首选）", severity: "fail" },
  { re: /顶级|顶尖|极品|极致|至尊|王牌|无敌|完美/g, reason: "绝对化/夸大用语", severity: "fail" },
  { re: /100%|百分之百|绝对|永久|永不|万能|零风险|无副作用/g, reason: "绝对化承诺", severity: "fail" },
  { re: /国家级|世界级|全球领先|国际领先/g, reason: "无依据的级别表述", severity: "fail" },
  { re: /根治|治愈|特效|药到病除|包治|治疗|疗效|抗癌|降血压|降血糖/g, reason: "医疗/功效承诺", severity: "fail" },
  { re: /最后一天|马上涨价|即将涨价|仅剩\d*|错过再等|史低|秒杀/g, reason: "可能构成虚假紧迫感，需有真实依据", severity: "warn" },
];

export interface BannedHit {
  text: string;
  reason: string;
  severity: "fail" | "warn";
}

export function scanBanned(s: string): BannedHit[] {
  const hits: BannedHit[] = [];
  for (const r of BANNED) {
    for (const m of s.matchAll(r.re)) hits.push({ text: m[0], reason: r.reason, severity: r.severity });
  }
  // de-duplicate identical hits
  return hits.filter((h, i) => hits.findIndex((x) => x.text === h.text) === i);
}

/** Numbers in the script that cannot be found anywhere in the source data.
 *  Unit conversions (e.g. 300 lbs -> 136 公斤) will show up here; the LLM review
 *  decides whether they are correct, this check just makes them visible. */
export function unverifiedNumbers(script: string, source: string): string[] {
  const src = source.replace(/,/g, "");
  const srcNums = new Set((src.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(parseFloat(n))));
  const out: string[] = [];
  for (const m of script.replace(/,/g, "").matchAll(/\d+(?:\.\d+)?/g)) {
    const n = String(parseFloat(m[0]));
    // tiny numbers (1, 2, 3 …) are usually counting words, not claims
    if (parseFloat(n) < 4 && !n.includes(".")) continue;
    if (!srcNums.has(n)) out.push(m[0]);
  }
  return [...new Set(out)];
}

const CLICHE_OPENINGS = /^(今天(给大家|来给大家|跟大家)|家人们|大家好|哈喽大家好|宝子们|姐妹们)/;

export function runScriptChecks(script: string, hook: string | undefined, sourceText: string): ScriptCheck[] {
  const checks: ScriptCheck[] = [];
  const n = countChars(script);
  checks.push({
    id: "length",
    label: "字数",
    status: n <= MAX_CHARS ? "pass" : "fail",
    detail: `${n} / ${MAX_CHARS} 字（含标点），约 ${estimateSeconds(script)} 秒`,
  });

  const opening = (hook && script.replace(/\s/g, "").startsWith(hook.replace(/\s/g, "")) ? hook : firstSentence(script)).trim();
  const openingLen = countChars(opening);
  const openingSecs = (openingLen / CHARS_PER_SECOND).toFixed(1);
  checks.push({
    id: "hook",
    label: "前 5 秒钩子",
    status: openingLen <= HOOK_MAX_CHARS && !CLICHE_OPENINGS.test(opening) ? "pass" : "warn",
    detail: CLICHE_OPENINGS.test(opening)
      ? `开场是套话：“${opening}”`
      : `“${opening}” ${openingLen} 字，约 ${openingSecs} 秒说完${openingLen > HOOK_MAX_CHARS ? "，超过 5 秒" : ""}`,
  });

  const banned = scanBanned(script);
  const fails = banned.filter((b) => b.severity === "fail");
  checks.push({
    id: "banned",
    label: "广告法用语",
    status: fails.length ? "fail" : banned.length ? "warn" : "pass",
    detail: banned.length ? banned.map((b) => `“${b.text}”：${b.reason}`).join("；") : "未发现绝对化用语、功效承诺或虚假紧迫",
  });

  const nums = unverifiedNumbers(script, sourceText);
  checks.push({
    id: "numbers",
    label: "数字可溯源",
    status: nums.length ? "warn" : "pass",
    detail: nums.length
      ? `资料中找不到原数字：${nums.join("、")}（可能是单位换算，已交给 AI 质检逐条核对）`
      : "文案中的数字都能在商品资料中找到",
  });
  return checks;
}
