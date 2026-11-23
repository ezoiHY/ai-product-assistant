"use client";

import {
  ArrowRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  ClipboardPaste,
  Download,
  History,
  Link2,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyRun,
  postJSON,
  type AnalysisRun,
  type InfoResponse,
  type InsightResponse,
  type ReviewResponse,
  type ScrapeResponse,
  type ScriptResponse,
  type StageKey,
  type StageState,
} from "@/lib/api-types";
import { buildMarkdown } from "@/lib/report";
import { AnalysisSection } from "./AnalysisSection";
import { InfoSection } from "./InfoSection";
import { ProductCard } from "./ProductCard";
import { ReviewSection } from "./ReviewSection";
import { ScriptSection } from "./ScriptSection";
import { CopyButton, ErrorBox, cx } from "./ui";

const EXAMPLES = [
  { label: "露营遮阳椅", url: "https://www.amazon.com/VTOY-Chairs%EF%BC%8CCamping-Foldable-ShadeforCamping/dp/B0CXT9RSGQ" },
  { label: "空气炸锅", url: "https://www.amazon.com/dp/B07FDJMC9Q" },
  { label: "洞洞鞋", url: "https://www.amazon.com/dp/B0014C0LSY" },
  { label: "保湿霜", url: "https://www.amazon.com/dp/B00TTD9BRC" },
  { label: "畅销书", url: "https://www.amazon.com/dp/0735211299" },
  { label: "降噪耳机", url: "https://www.amazon.com/dp/B0D1XD1ZV3" },
];

const STEPS: Array<{ key: StageKey; label: string }> = [
  { key: "scrape", label: "获取商品页" },
  { key: "info", label: "信息整理" },
  { key: "insight", label: "深度分析" },
  { key: "script", label: "口播文案" },
  { key: "review", label: "质量检查" },
];

interface HistoryItem {
  id: string;
  title: string;
  image?: string;
  at: number;
  input: string;
  run: AnalysisRun;
}
const HISTORY_KEY = "apa-history-v1";

function loadHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 6)));
  } catch {
    /* storage full or blocked: history is a convenience only */
  }
}

function StepIcon({ s }: { s: StageState<unknown> }) {
  if (s.status === "running") return <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />;
  if (s.status === "done") return <CircleCheck className="h-4 w-4 text-emerald-500" />;
  if (s.status === "error") return <CircleX className="h-4 w-4 text-rose-500" />;
  return <CircleDashed className="h-4 w-4 text-slate-300" />;
}

function Progress({ run, now }: { run: AnalysisRun; now: number }) {
  return (
    <div className="card mt-6 flex flex-wrap items-center gap-x-1 gap-y-2 px-4 py-3">
      {STEPS.map((st, i) => {
        const s = run[st.key] as StageState<unknown>;
        const secs = s.status === "running" && s.startedAt ? Math.max(0, now - s.startedAt) / 1000 : s.ms ? s.ms / 1000 : undefined;
        return (
          <div key={st.key} className="flex items-center">
            <a
              href={st.key === "scrape" ? undefined : `#${st.key === "insight" ? "analysis" : st.key}`}
              className={cx(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm",
                s.status === "running" ? "bg-indigo-50 text-indigo-700" : s.status === "done" ? "text-slate-700" : "text-slate-400",
              )}
            >
              <StepIcon s={s} />
              {st.label}
              {secs !== undefined && <span className="text-xs tabular-nums text-slate-400">{secs.toFixed(0)}s</span>}
            </a>
            {i < STEPS.length - 1 && <span className="mx-0.5 text-slate-200">/</span>}
          </div>
        );
      })}
      <span className="ml-auto hidden text-xs text-slate-400 md:block">深度分析与文案链路并行执行</span>
    </div>
  );
}

export function Analyzer() {
  const [input, setInput] = useState("");
  const [run, setRun] = useState<AnalysisRun>(emptyRun);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState("");
  const [health, setHealth] = useState<{ ai: boolean; model: string } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [now, setNow] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  // latest finished data, used by chained / retried stages
  const dataRef = useRef<{ input: string; scrape?: ScrapeResponse; info?: InfoResponse; script?: ScriptResponse }>({ input: "" });

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ ai: false, model: "" }))
      .finally(() => setHistory(loadHistory()));
  }, []);

  const anyRunning = Object.values(run).some((s) => s.status === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 500);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [anyRunning]);

  const patch = useCallback(<K extends StageKey>(key: K, s: Partial<AnalysisRun[K]>) => {
    setRun((r) => ({ ...r, [key]: { ...r[key], ...s } }));
  }, []);

  const stage = useCallback(
    async <T,>(key: StageKey, fn: () => Promise<T>, signal: AbortSignal): Promise<T | undefined> => {
      const t0 = Date.now();
      patch(key, { status: "running", startedAt: t0, error: undefined, data: undefined, ms: undefined });
      try {
        const data = await fn();
        if (signal.aborted) return undefined;
        patch(key, { status: "done", data, ms: Date.now() - t0 } as Partial<AnalysisRun[StageKey]>);
        return data;
      } catch (e) {
        if (signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return undefined;
        patch(key, { status: "error", error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 });
        return undefined;
      }
    },
    [patch],
  );

  const persist = useCallback(() => {
    // read the newest state via functional update, then store it
    setRun((current) => {
      const d = dataRef.current;
      if (d.scrape) {
        const item: HistoryItem = {
          id: `${d.scrape.product.asin}-${Date.now()}`,
          title: d.info?.data.productInfo.nameZh ?? d.scrape.product.title,
          image: d.scrape.product.images[0],
          at: Date.now(),
          input: d.input,
          run: current,
        };
        const next = [item, ...loadHistory().filter((h) => h.run.scrape.data?.product.asin !== d.scrape!.product.asin)];
        saveHistory(next);
        setHistory(next.slice(0, 6));
      }
      return current;
    });
  }, []);

  const chainFromScript = useCallback(
    async (signal: AbortSignal) => {
      const { scrape, info } = dataRef.current;
      if (!scrape || !info) return;
      patch("review", { status: "blocked", data: undefined, error: undefined });
      const script = await stage("script", () => postJSON<ScriptResponse>("/api/script", { product: scrape.product, info: info.data }, signal), signal);
      if (!script) return;
      dataRef.current.script = script;
      await stage("review", () => postJSON<ReviewResponse>("/api/review", { product: scrape.product, script: script.data }, signal), signal);
    },
    [patch, stage],
  );

  const chainFromInfo = useCallback(
    async (signal: AbortSignal) => {
      const { scrape } = dataRef.current;
      if (!scrape) return;
      patch("script", { status: "blocked", data: undefined, error: undefined });
      patch("review", { status: "blocked", data: undefined, error: undefined });
      const info = await stage(
        "info",
        () => postJSON<InfoResponse>("/api/analyze", { part: "info", product: scrape.product, pageDigest: scrape.pageDigest }, signal),
        signal,
      );
      if (!info) return;
      dataRef.current.info = info;
      await chainFromScript(signal);
    },
    [chainFromScript, patch, stage],
  );

  const runInsight = useCallback(
    async (signal: AbortSignal) => {
      const { scrape } = dataRef.current;
      if (!scrape) return;
      await stage(
        "insight",
        () => postJSON<InsightResponse>("/api/analyze", { part: "insight", product: scrape.product, pageDigest: scrape.pageDigest }, signal),
        signal,
      );
    },
    [stage],
  );

  const newSignal = () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    return ac.signal;
  };

  const start = useCallback(
    async (getScrape: (signal: AbortSignal) => Promise<ScrapeResponse>, label: string) => {
      const signal = newSignal();
      dataRef.current = { input: label };
      setRun({ ...emptyRun(), info: { status: "blocked" }, insight: { status: "blocked" }, script: { status: "blocked" }, review: { status: "blocked" } });
      const scrape = await stage("scrape", () => getScrape(signal), signal);
      if (!scrape) {
        setRun((r) => ({ ...r, info: { status: "idle" }, insight: { status: "idle" }, script: { status: "idle" }, review: { status: "idle" } }));
        return;
      }
      dataRef.current.scrape = scrape;
      setManualOpen(false);
      if (health && !health.ai) {
        const msg = "服务器未配置 ANTHROPIC_API_KEY，AI 分析不可用（商品抓取结果已在左侧展示）";
        setRun((r) => ({ ...r, info: { status: "error", error: msg }, insight: { status: "error", error: msg }, script: { status: "blocked" }, review: { status: "blocked" } }));
        return;
      }
      await Promise.all([chainFromInfo(signal), runInsight(signal)]);
      if (!signal.aborted) persist();
    },
    [chainFromInfo, health, persist, runInsight, stage],
  );

  const analyzeUrl = (url: string) => {
    const v = url.trim();
    if (!v) return;
    setInput(v);
    void start((signal) => postJSON<ScrapeResponse>("/api/scrape", { input: v }, signal), v);
  };

  const analyzeManual = () => {
    void start((signal) => postJSON<ScrapeResponse>("/api/extract", { text: manualText, url: input }, signal), input || "手动粘贴");
  };

  const retry = (key: StageKey) => {
    const signal = abortRef.current?.signal && !abortRef.current.signal.aborted ? abortRef.current.signal : newSignal();
    if (key === "info") void chainFromInfo(signal);
    if (key === "insight") void runInsight(signal);
    if (key === "script") void chainFromScript(signal);
    if (key === "review" && dataRef.current.script && dataRef.current.scrape) {
      const { scrape, script } = dataRef.current;
      void stage("review", () => postJSON<ReviewResponse>("/api/review", { product: scrape!.product, script: script!.data }, signal), signal);
    }
  };

  const restore = (h: HistoryItem) => {
    abortRef.current?.abort();
    setInput(h.input);
    setRun(h.run);
    dataRef.current = { input: h.input, scrape: h.run.scrape.data, info: h.run.info.data, script: h.run.script.data };
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrapeFailedCode = run.scrape.status === "error";
  const hasAI = !!(run.info.data || run.insight.data || run.script.data);
  const md = hasAI ? buildMarkdown(run) : "";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-8 sm:pt-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" /> Powered by Claude
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">AI 产品分析助手</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
            粘贴一个 Amazon 商品链接，自动完成：产品信息整理 · 深度产品分析 · 短视频口播文案 · 事实与合规质检
          </p>
        </div>
        {health && (
          <span className={cx("chip", health.ai ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>
            {health.ai ? `模型 ${health.model}` : "未配置 API Key：仅抓取模式"}
          </span>
        )}
      </header>

      <div className="card p-4 sm:p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            analyzeUrl(input);
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="粘贴 Amazon 商品链接，例如 https://www.amazon.com/dp/B0CXT9RSGQ"
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-10 pr-10 text-[15px] outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
            />
            {input && (
              <button type="button" onClick={() => setInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="清空">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!input.trim() || run.scrape.status === "running"}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 text-[15px] font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {run.scrape.status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            开始分析
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-400">试试：</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => analyzeUrl(ex.url)}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
            >
              {ex.label}
            </button>
          ))}
          <button
            onClick={() => setManualOpen((v) => !v)}
            className="ml-auto inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
          >
            <ClipboardPaste className="h-3.5 w-3.5" /> 手动粘贴商品信息
          </button>
        </div>

        {(manualOpen || scrapeFailedCode) && run.scrape.status !== "running" && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            {scrapeFailedCode && <ErrorBox message={run.scrape.error ?? "抓取失败"} onRetry={() => analyzeUrl(input)} />}
            <p className="mb-2 mt-3 text-xs leading-5 text-slate-500">
              抓取被拦截时的兜底：在浏览器打开商品页，全选（⌘/Ctrl + A）复制整页文字粘贴到这里，AI 会从中抽取商品信息并继续完成全部分析。
            </p>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              rows={5}
              placeholder="粘贴商品详情页的文字（标题、价格、About this item、参数、评价……）"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
            />
            <button
              onClick={analyzeManual}
              disabled={manualText.trim().length < 80}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              <ClipboardPaste className="h-4 w-4" /> 用粘贴的内容分析
            </button>
          </div>
        )}
      </div>

      {run.scrape.status !== "idle" && <Progress run={run} now={now} />}

      {run.scrape.status === "running" && (
        <div className="card mt-6 flex items-center gap-3 p-6 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
          正在获取并解析商品页（直连失败时会自动切换到 Claude 联网获取）…
        </div>
      )}

      {run.scrape.data && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
            <ProductCard scrape={run.scrape.data} info={run.info.data?.data.productInfo} />
            {hasAI && (
              <div className="mt-4 flex gap-2">
                <CopyButton text={md} label="复制 Markdown 报告" className="flex-1 justify-center" />
                <button
                  onClick={() => {
                    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `${run.scrape.data!.product.asin}-分析报告.md`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" /> .md
                </button>
              </div>
            )}
          </aside>
          <div className="min-w-0 space-y-6">
            <InfoSection state={run.info} onRetry={() => retry("info")} />
            <AnalysisSection state={run.insight} onRetry={() => retry("insight")} />
            <ScriptSection state={run.script} review={run.review} onRetry={() => retry("script")} onRegenerate={() => retry("script")} />
            <ReviewSection state={run.review} script={run.script} onRetry={() => retry("review")} />
          </div>
        </div>
      )}

      {run.scrape.status === "idle" && (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["获取商品页", "直连抓取并解析 HTML，读取 Amazon 内嵌的「Customers say」评价洞察；被拦截时自动改用 Claude 联网获取，或手动粘贴兜底。"],
              ["理解产品", "中文产品档案 + 深度分析：定位、人群、场景、痛点、卖点证据、买家声音、顾虑、竞争、内容策略，并结合商品图片。"],
              ["口播文案", "按真实短视频结构生成：前 5 秒钩子 → 痛点 → 卖点 → 背书 → 行动，附分镜、备选钩子，可直接试听。"],
              ["质量检查", "规则引擎（字数 / 钩子 / 广告法用语 / 数字溯源）+ AI 逐条事实核查，自动修正夸大和无依据的表述。"],
            ].map(([t, d], i) => (
              <div key={t} className="card p-4">
                <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white">{i + 1}</div>
                <div className="text-sm font-semibold text-slate-900">{t}</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{d}</p>
              </div>
            ))}
          </div>
          {history.length > 0 && (
            <div className="mt-8">
              <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <History className="h-4 w-4" /> 最近分析
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {history.map((h) => (
                  <button key={h.id} onClick={() => restore(h)} className="card flex items-center gap-3 p-3 text-left transition hover:shadow-md">
                    {h.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.image} alt="" className="h-12 w-12 shrink-0 rounded-lg object-contain" />
                    ) : (
                      <div className="h-12 w-12 shrink-0 rounded-lg bg-slate-100" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-800">{h.title}</div>
                      <div className="text-xs text-slate-400">{new Date(h.at).toLocaleString("zh-CN")}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <footer className="mt-12 text-center text-xs leading-5 text-slate-400">
        商品信息来自公开的 Amazon 商品页；AI 生成内容已做事实核查，但发布前仍建议人工确认价格等关键信息。
      </footer>
    </main>
  );
}
