"use client";

import {
  ArrowUp,
  Brain,
  ChevronRight,
  CircleCheck,
  CircleX,
  ClipboardPaste,
  Clock,
  Download,
  FileText,
  KeyRound,
  Link2,
  Loader2,
  Mic,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
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
import { AMAZON_ORIGIN_RE, slimAmazonHtml } from "@/lib/capture";
import { loadLLMConfig, useLLMConfig } from "@/lib/llm-config";
import { DEFAULT_MODEL } from "@/lib/llm-shared";
import { buildMarkdown } from "@/lib/report";
import { AnalysisSection } from "./AnalysisSection";
import { ApiSettingsSheet } from "./ApiSettings";
import { CaptureBookmarklet } from "./CaptureBookmarklet";
import { InfoSection } from "./InfoSection";
import { ProductCard } from "./ProductCard";
import { ReviewSection } from "./ReviewSection";
import { ScriptSection } from "./ScriptSection";
import { SettingsContext } from "./settings-context";
import { CopyButton, ErrorBox, ICON_STROKE, IconTile, cx, type TileColor } from "./ui";

const EXAMPLES = [
  { label: "露营遮阳椅", url: "https://www.amazon.com/VTOY-Chairs%EF%BC%8CCamping-Foldable-ShadeforCamping/dp/B0CXT9RSGQ" },
  { label: "空气炸锅", url: "https://www.amazon.com/dp/B07FDJMC9Q" },
  { label: "洞洞鞋", url: "https://www.amazon.com/dp/B0014C0LSY" },
  { label: "保湿霜", url: "https://www.amazon.com/dp/B00TTD9BRC" },
  { label: "畅销书", url: "https://www.amazon.com/dp/0735211299" },
  { label: "降噪耳机", url: "https://www.amazon.com/dp/B0D1XD1ZV3" },
];

const STEPS: Array<{ key: StageKey; label: string; icon: LucideIcon; anchor?: string }> = [
  { key: "scrape", label: "商品页", icon: ScanSearch },
  { key: "info", label: "信息整理", icon: FileText, anchor: "info" },
  { key: "insight", label: "深度分析", icon: Brain, anchor: "analysis" },
  { key: "script", label: "口播文案", icon: Mic, anchor: "script" },
  { key: "review", label: "质量检查", icon: ShieldCheck, anchor: "review" },
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

// Read ?capture=1 once per page load: the effect below cleans the URL, and React
// may run effects twice (dev Strict Mode), so the second run must still know.
let captureRequested: boolean | null = null;
function isCaptureRequest(): boolean {
  captureRequested ??= new URLSearchParams(window.location.search).get("capture") === "1";
  return captureRequested;
}

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
    /* storage full or blocked: history is only a convenience */
  }
}

function AppIcon() {
  return (
    <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] bg-linear-to-br from-tile-blue via-tile-indigo to-tile-purple text-white">
      <Sparkles className="h-4 w-4" strokeWidth={2} />
    </span>
  );
}

function StepPill({ step, s, now }: { step: (typeof STEPS)[number]; s: StageState<unknown>; now: number }) {
  const secs = s.status === "running" && s.startedAt ? Math.max(0, now - s.startedAt) / 1000 : s.ms ? s.ms / 1000 : undefined;
  const Icon = step.icon;
  const content = (
    <>
      {s.status === "running" ? (
        <Loader2 className="h-4 w-4 animate-spin text-info" strokeWidth={2} aria-hidden="true" />
      ) : s.status === "done" ? (
        <CircleCheck className="h-4 w-4 text-success" strokeWidth={2} aria-hidden="true" />
      ) : s.status === "error" ? (
        <CircleX className="h-4 w-4 text-danger" strokeWidth={2} aria-hidden="true" />
      ) : (
        <Icon className="h-4 w-4 text-label-3" strokeWidth={ICON_STROKE} aria-hidden="true" />
      )}
      <span>{step.label}</span>
      {secs !== undefined && <span className="num text-[11px] text-label-2">{secs.toFixed(0)}s</span>}
      <span className="sr-only">{{ idle: "未开始", blocked: "等待中", running: "进行中", done: "已完成", error: "失败" }[s.status]}</span>
    </>
  );
  const cls = cx(
    "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors duration-200",
    s.status === "running" ? "bg-info-tint text-label" : s.status === "done" || s.status === "error" ? "text-label hover:bg-fill" : "text-label-2",
  );
  return step.anchor ? (
    <a href={`#${step.anchor}`} className={cls}>
      {content}
    </a>
  ) : (
    <span className={cls}>{content}</span>
  );
}

const FEATURES: Array<{ icon: LucideIcon; color: TileColor; title: string; text: string; span: string; extra?: string[] }> = [
  {
    icon: ScanSearch,
    color: "blue",
    title: "拿到真实的商品数据",
    text: "解析商品页的价格、卖点、规格和图片，并读取 Amazon 汇总全部评价得出的「Customers say」洞察。",
    span: "lg:col-span-3",
    extra: ["直连解析", "Claude 联网兜底", "手动粘贴兜底"],
  },
  {
    icon: Brain,
    color: "purple",
    title: "理解产品，而不只是翻译",
    text: "回答谁会买、为什么买、买家怎么说、和什么比、内容该怎么讲。每条判断都标注依据，并结合商品图片。",
    span: "lg:col-span-3",
    extra: ["定位", "人群", "痛点", "卖点证据", "买家声音", "内容策略"],
  },
  {
    icon: Mic,
    color: "orange",
    title: "能直接拍的口播",
    text: "150 字以内，开头一句就是钩子，附分镜和备选钩子，可以直接试听。",
    span: "lg:col-span-2",
  },
  {
    icon: ShieldCheck,
    color: "green",
    title: "发布前先质检",
    text: "规则引擎加 AI 逐条核查事实、扫描广告法用语，自动改出终稿。",
    span: "lg:col-span-2",
  },
  {
    icon: Clock,
    color: "teal",
    title: "大约一分钟",
    text: "深度分析和文案链路并行运行，每一步完成就先显示出来。",
    span: "lg:col-span-2",
  },
];

export function Analyzer({ initialRun, initialInput = "" }: { initialRun?: AnalysisRun; initialInput?: string }) {
  const [input, setInput] = useState(initialInput);
  const [run, setRun] = useState<AnalysisRun>(initialRun ?? emptyRun());
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState("");
  const [health, setHealth] = useState<{ ai: boolean; model: string; modelFixed?: boolean } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captureWaiting, setCaptureWaiting] = useState(false);
  const userCfg = useLLMConfig();
  // AI works with either a visitor key (saved in this browser) or the server's key
  const aiReady = Boolean(userCfg.apiKey) || Boolean(health?.ai);
  const activeModel = userCfg.apiKey
    ? userCfg.model || DEFAULT_MODEL
    : (health?.modelFixed ? health.model : userCfg.model || health?.model) || DEFAULT_MODEL;
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [now, setNow] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  // latest finished data, used by chained / retried stages
  const dataRef = useRef<{ input: string; scrape?: ScrapeResponse; info?: InfoResponse; script?: ScriptResponse }>({
    input: initialInput,
    scrape: initialRun?.scrape.data,
    info: initialRun?.info.data,
    script: initialRun?.script.data,
  });

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
        const code = (e as { code?: string } | null)?.code;
        patch(key, { status: "error", error: e instanceof Error ? e.message : String(e), errorCode: code, ms: Date.now() - t0 });
        return undefined;
      }
    },
    [patch],
  );

  const persist = useCallback(() => {
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
      if (health && !health.ai && !loadLLMConfig().apiKey) {
        const msg = "还没有配置 API Key：在「API 设置」填写你的 Anthropic Key 后点重试（左侧是已抓取的商品信息）";
        const err = { status: "error" as const, error: msg, errorCode: "not_configured" };
        setRun((r) => ({ ...r, info: err, insight: err, script: { status: "blocked" }, review: { status: "blocked" } }));
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

  // "浏览器带回": a page the bookmarklet sent from the visitor's Amazon tab
  const analyzeCaptured = (url: string, html: string) => {
    setCaptureWaiting(false);
    setInput(url);
    const slim = slimAmazonHtml(html);
    void start((signal) => postJSON<ScrapeResponse>("/api/parse-html", { url, html: slim }, signal), url);
  };
  const captureRef = useRef(analyzeCaptured);
  useEffect(() => {
    captureRef.current = analyzeCaptured;
  });

  useEffect(() => {
    if (!isCaptureRequest()) return;
    window.history.replaceState(null, "", window.location.pathname);
    const opener = window.opener as Window | null;
    if (!opener) return;
    const onMessage = (e: MessageEvent) => {
      if (!AMAZON_ORIGIN_RE.test(e.origin)) return; // only accept pages from Amazon itself
      const d = e.data as { type?: string; url?: string; html?: string } | null;
      if (!d || d.type !== "apa-capture" || typeof d.url !== "string" || typeof d.html !== "string") return;
      window.removeEventListener("message", onMessage);
      captureRef.current(d.url, d.html);
    };
    window.addEventListener("message", onMessage);
    const show = setTimeout(() => setCaptureWaiting(true), 0);
    opener.postMessage("apa-ready", "*"); // carries no data; the reply is origin-checked above
    return () => {
      clearTimeout(show);
      window.removeEventListener("message", onMessage);
    };
  }, []);

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

  const idle = run.scrape.status === "idle";
  const scraping = run.scrape.status === "running";
  const scrapeFailed = run.scrape.status === "error";
  const hasAI = !!(run.info.data || run.insight.data || run.script.data);
  const md = hasAI ? buildMarkdown(run) : "";

  return (
    <SettingsContext value={openSettings}>
      {/* Global nav + local step bar, frosted glass */}
      <header className="glass sticky top-0 z-40 shadow-[0_1px_0_var(--separator)]">
        <div className="mx-auto flex h-[52px] max-w-[1180px] items-center justify-between px-5">
          <button
            onClick={() => {
              abortRef.current?.abort();
              setRun(emptyRun());
              setInput("");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg"
          >
            <AppIcon />
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-label">产品分析助手</span>
          </button>
          <button
            onClick={openSettings}
            aria-haspopup="dialog"
            className={cx("chip min-h-8 cursor-pointer gap-1.5 px-3 transition-colors", aiReady || !health ? "bg-fill text-label hover:bg-fill-2" : "bg-warning-tint text-warning hover:opacity-80")}
          >
            <span aria-hidden="true" className={cx("h-1.5 w-1.5 rounded-full", !health ? "bg-tile-gray" : aiReady ? "bg-tile-green" : "bg-tile-orange")} />
            <span className="max-w-[46vw] truncate">{!health ? "API 设置" : aiReady ? activeModel : "配置 API Key"}</span>
            <KeyRound className="h-3.5 w-3.5 shrink-0" strokeWidth={ICON_STROKE} aria-hidden="true" />
            <span className="sr-only">，打开 API 设置</span>
          </button>
        </div>
        {!idle && (
          <div className="border-t border-separator">
            {/* relative: keeps the absolutely-positioned sr-only labels inside this scroll container */}
            <nav aria-label="分析进度" className="relative mx-auto flex max-w-[1180px] items-center gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
              {STEPS.map((st, i) => (
                <div key={st.key} className="flex items-center">
                  <StepPill step={st} s={run[st.key] as StageState<unknown>} now={now} />
                  {i < STEPS.length - 1 && <ChevronRight className="mx-0.5 h-3.5 w-3.5 shrink-0 text-label-3" aria-hidden="true" />}
                </div>
              ))}
              <span className="ml-auto hidden shrink-0 pl-4 text-[12px] text-label-2 md:block">深度分析与文案链路并行运行</span>
            </nav>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 pb-20">
        {/* Hero */}
        <section className={cx("mx-auto max-w-[760px] text-center", idle ? "pt-16 sm:pt-24" : "pt-8")}>
          {idle && (
            <div className="rise">
              <p className="eyebrow mb-4 inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 shadow-[var(--shadow-card)]">
                <Sparkles className="h-3.5 w-3.5 text-violet" strokeWidth={2} aria-hidden="true" />
                由 Claude 驱动
              </p>
              <h1 className="title-xl text-[40px] sm:text-[60px]">
                {/* keep each phrase intact so small screens break at the comma */}
                <span className="inline-block">一个链接，</span>
                <span className="inline-block">看懂一个产品。</span>
              </h1>
              <p className="mx-auto mt-5 max-w-[600px] text-balance text-[17px] leading-relaxed text-label-2 sm:text-[19px]">
                粘贴 Amazon 商品链接，AI 帮你整理信息、分析卖点、写好短视频口播，并逐条核查事实。
              </p>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              analyzeUrl(input);
            }}
            className={cx("relative mx-auto text-left", idle ? "mt-10" : "mt-0")}
          >
            <label htmlFor="product-url" className="sr-only">
              Amazon 商品链接
            </label>
            <div className="group relative flex items-center rounded-full bg-surface shadow-[var(--shadow-float)] transition-shadow duration-300 focus-within:shadow-[0_0_0_4px_rgba(0,113,227,0.18),var(--shadow-float)]">
              <Link2 className="pointer-events-none absolute left-5 h-[18px] w-[18px] text-label-3" strokeWidth={ICON_STROKE} aria-hidden="true" />
              <input
                id="product-url"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="粘贴 Amazon 商品链接"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                className="h-14 w-full rounded-full bg-transparent pl-12 pr-28 text-[16px] text-label outline-none placeholder:text-label-3"
              />
              {input && (
                <button
                  type="button"
                  onClick={() => setInput("")}
                  aria-label="清空链接"
                  className="absolute right-[58px] flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-label-3 hover:bg-fill hover:text-label-2"
                >
                  <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </button>
              )}
              <button
                type="submit"
                disabled={!input.trim() || scraping}
                aria-label="开始分析"
                className="absolute right-2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-accent text-white transition duration-200 hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:bg-fill-2 disabled:text-label-3"
              >
                {scraping ? <Loader2 className="h-[18px] w-[18px] animate-spin" strokeWidth={2.25} aria-hidden="true" /> : <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden="true" />}
              </button>
            </div>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex.label} onClick={() => analyzeUrl(ex.url)} disabled={scraping} className="btn btn-surface min-h-8 px-3.5 text-[13px]">
                {ex.label}
              </button>
            ))}
            <button onClick={() => setManualOpen((v) => !v)} aria-expanded={manualOpen} className="btn btn-plain min-h-8 px-2 text-[13px]">
              <ClipboardPaste className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden="true" />
              手动粘贴商品信息
            </button>
          </div>

          {health && !aiReady && (
            <div className="rise mx-auto mt-6 flex max-w-[600px] items-center gap-3 rounded-[18px] bg-surface px-4 py-3 text-left shadow-[var(--shadow-card)]">
              <IconTile icon={KeyRound} color="orange" size="sm" />
              <p className="flex-1 text-[13px] leading-5 text-label-2">
                还没有配置 API Key，现在只能抓取商品信息。填写你的 Anthropic Key 后即可生成分析、口播文案和质检报告。
              </p>
              <button onClick={openSettings} className="btn btn-primary shrink-0">
                配置
              </button>
            </div>
          )}

          {(manualOpen || scrapeFailed) && !scraping && (
            <div className="card rise mx-auto mt-6 p-5 text-left sm:p-6">
              {scrapeFailed && (
                <div className="mb-4">
                  <ErrorBox message={run.scrape.error ?? "抓取失败"} code={run.scrape.errorCode} onRetry={() => analyzeUrl(input)} />
                </div>
              )}
              <div className="mb-5">
                <CaptureBookmarklet />
              </div>
              <label htmlFor="manual-text" className="text-[15px] font-semibold text-label">
                或者手动粘贴商品信息
              </label>
              <p className="mt-1 text-[13px] leading-6 text-label-2">
                在浏览器打开商品页，全选（⌘/Ctrl + A）复制整页文字粘贴到这里，AI 会抽取商品信息并完成全部分析。
              </p>
              <textarea
                id="manual-text"
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                rows={5}
                placeholder="标题、价格、About this item、参数、评价……"
                className="tile mt-3 w-full resize-y p-4 text-[14px] leading-6 text-label outline-none placeholder:text-label-3 focus:shadow-[0_0_0_4px_rgba(0,113,227,0.18)]"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="num text-[12px] text-label-2">{manualText.trim().length} 字符</span>
                <button onClick={analyzeManual} disabled={manualText.trim().length < 80} className="btn btn-primary min-h-10 px-5">
                  用粘贴的内容分析
                </button>
              </div>
            </div>
          )}
        </section>

        {captureWaiting && run.scrape.status === "idle" && (
          <div className="card rise mx-auto mt-8 flex max-w-[760px] items-center gap-3 px-6 py-5 text-[14px] text-label-2" role="status">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-info" strokeWidth={2} aria-hidden="true" />
            正在等待 Amazon 页面发来商品信息……没有反应的话，回到商品页再点一次书签。
          </div>
        )}

        {scraping && (
          <div className="card rise mx-auto mt-8 flex max-w-[760px] items-center gap-3 px-6 py-5 text-[14px] text-label-2" role="status">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-info" strokeWidth={2} aria-hidden="true" />
            正在获取并解析商品页，通常需要 3–10 秒…
          </div>
        )}

        {/* Results */}
        {run.scrape.data && (
          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-[124px] lg:max-h-[calc(100vh-140px)] lg:self-start lg:overflow-y-auto lg:rounded-[28px] lg:pb-2 [scrollbar-width:none]">
              <ProductCard scrape={run.scrape.data} info={run.info.data?.data.productInfo} />
              {hasAI && (
                <div className="mt-4 flex gap-2">
                  <CopyButton text={md} label="复制 Markdown 报告" className="btn-surface min-h-10 flex-1" />
                  <button
                    onClick={() => {
                      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = `${run.scrape.data!.product.asin}-分析报告.md`;
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }}
                    className="btn btn-surface min-h-10"
                  >
                    <Download className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden="true" /> 下载
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

        {/* Idle: bento feature grid + history */}
        {idle && (
          <>
            <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {FEATURES.map((f, i) => (
                <div key={f.title} className={cx("card rise flex flex-col p-6 sm:p-7", f.span)} style={{ animationDelay: `${120 + i * 50}ms` }}>
                  <IconTile icon={f.icon} color={f.color} size="lg" />
                  <h2 className="mt-5 text-[19px] font-semibold tracking-[-0.02em] text-label">{f.title}</h2>
                  <p className="mt-2 text-[14px] leading-6 text-label-2">{f.text}</p>
                  {f.extra && (
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-5">
                      {f.extra.map((x) => (
                        <span key={x} className="chip bg-fill text-label-2">
                          {x}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {history.length > 0 && (
              <section className="mt-14" aria-labelledby="history-title">
                <h2 id="history-title" className="mb-3 px-1 text-[13px] font-semibold text-label-2">
                  最近分析
                </h2>
                <div className="card overflow-hidden">
                  {history.map((h, i) => (
                    <button
                      key={h.id}
                      onClick={() => restore(h)}
                      className={cx("flex w-full cursor-pointer items-center gap-3.5 px-5 py-3 text-left transition-colors hover:bg-fill", i > 0 && "border-t border-separator")}
                    >
                      {h.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={h.image} alt="" className="h-11 w-11 shrink-0 rounded-[10px] bg-white object-contain p-1" />
                      ) : (
                        <span className="h-11 w-11 shrink-0 rounded-[10px] bg-fill" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-label">{h.title}</span>
                        <span className="num block text-[12px] text-label-2">{new Date(h.at).toLocaleString("zh-CN")}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-label-3" strokeWidth={ICON_STROKE} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <footer className="mt-16 text-center text-[12px] leading-5 text-label-2">
          商品信息来自公开的 Amazon 商品页。AI 生成的内容已做事实核查，发布前仍建议人工确认价格等关键信息。
        </footer>
      </main>

      <ApiSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} server={health} />
    </SettingsContext>
  );
}
