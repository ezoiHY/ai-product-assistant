"use client";

import { Loader2, Mic, Pause, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReviewResponse, ScriptResponse, StageState } from "@/lib/api-types";
import { countChars, estimateSeconds, firstSentence, MAX_CHARS } from "@/lib/quality/rules";
import { ChecksList } from "./Checks";
import { Block, Chip, CopyButton, ErrorBox, ICON_STROKE, Section, Waiting, cx } from "./ui";

function useSpeech() {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // false on the server and during hydration, real value afterwards (no hydration mismatch)
  const supported = useSyncExternalStore(
    () => () => {},
    () => "speechSynthesis" in window,
    () => false,
  );

  const stop = () => {
    if (supported) window.speechSynthesis.cancel();
    if (timer.current) clearInterval(timer.current);
    setPlaying(false);
  };
  const play = (text: string) => {
    if (!supported) return;
    stop();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = 1.15;
    const voice = window.speechSynthesis.getVoices().find((v) => /zh[-_](CN|Hans)/i.test(v.lang));
    if (voice) u.voice = voice;
    u.onend = () => stop();
    u.onerror = () => stop();
    const t0 = Date.now();
    setElapsed(0);
    timer.current = setInterval(() => setElapsed((Date.now() - t0) / 1000), 100);
    setPlaying(true);
    window.speechSynthesis.speak(u);
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return { supported, playing, elapsed, play, stop };
}

function ScriptText({ script, hook }: { script: string; hook: string }) {
  const h = hook && script.startsWith(hook) ? hook : firstSentence(script);
  return (
    <p className="text-[18px] leading-[1.85] tracking-[-0.01em] text-label sm:text-[22px]">
      <mark className="rounded-[6px] bg-highlight px-1 py-0.5 text-label [box-decoration-break:clone]">{h}</mark>
      {script.slice(h.length)}
    </p>
  );
}

export function ScriptSection({
  state,
  review,
  onRetry,
  onRegenerate,
}: {
  state: StageState<ScriptResponse>;
  review: StageState<ReviewResponse>;
  onRetry: () => void;
  onRegenerate: () => void;
}) {
  const s = state.data?.data;
  const final = review.data?.finalScript;
  const changed = !!final && !!s && final !== s.script;
  const [showDraft, setShowDraft] = useState(false);
  const speech = useSpeech();
  const shown = s ? (final && !showDraft ? final : s.script) : "";
  const n = countChars(shown);
  const busy = review.status === "running" || state.status === "running";

  return (
    <Section
      id="script"
      icon={Mic}
      color="orange"
      title="短视频口播文案"
      subtitle="150 字以内 · 开头 5 秒是钩子 · 已经过事实与合规质检"
      right={
        s && !busy ? (
          <button onClick={onRegenerate} className="btn btn-secondary">
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden="true" /> 换一版
          </button>
        ) : null
      }
    >
      {state.status === "error" && <ErrorBox message={state.error ?? "失败"} code={state.errorCode} onRetry={onRetry} />}
      {state.status === "blocked" && <p className="text-[14px] text-label-2">等“产品信息整理”完成后开始写。</p>}
      {state.status === "running" && <Waiting text="正在按“钩子 → 痛点 → 卖点 → 背书 → 行动”的结构写口播…" />}
      {s && (
        <>
          {/* Teleprompter card */}
          <div className="mb-9 rounded-[24px] bg-fill p-5 sm:p-8">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {final && !showDraft ? (
                <Chip tone="green">
                  <ShieldCheck className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" /> 终稿 · 已质检
                </Chip>
              ) : review.status === "running" ? (
                <Chip tone="blue">
                  <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.25} aria-hidden="true" /> 初稿 · 质检中
                </Chip>
              ) : (
                <Chip>初稿</Chip>
              )}
              <span className={cx("chip num bg-surface", n <= MAX_CHARS ? "text-label" : "text-danger")}>
                {n} / {MAX_CHARS} 字
              </span>
              <span className="chip num bg-surface text-label">约 {estimateSeconds(shown)} 秒</span>
              <span className="chip bg-surface text-label">钩子 · {s.hookType}</span>
              {changed && (
                <button onClick={() => setShowDraft((v) => !v)} className="btn btn-plain ml-auto min-h-7 px-1 text-[12px]">
                  {showDraft ? "看终稿" : "看初稿"}
                </button>
              )}
            </div>
            <ScriptText script={shown} hook={s.hook} />
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <CopyButton text={shown} label="复制文案" className="bg-surface hover:bg-surface hover:opacity-80" />
              {speech.supported && (
                <button
                  onClick={() => (speech.playing ? speech.stop() : speech.play(shown))}
                  aria-pressed={speech.playing}
                  className="btn bg-surface text-label hover:opacity-80"
                >
                  {speech.playing ? (
                    <Pause className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <Play className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  )}
                  {speech.playing ? <span className="num">{speech.elapsed.toFixed(1)}s</span> : "试听"}
                </button>
              )}
              {speech.playing && (
                <span className={cx("text-[12px]", speech.elapsed <= 5 ? "text-warning" : "text-label-2")} aria-live="polite">
                  {speech.elapsed <= 5 ? "前 5 秒 · 钩子" : "钩子已说完"}
                </span>
              )}
            </div>
          </div>

          <Block title={s.title}>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {s.hashtags.map((t) => (
                <span key={t} className="text-[14px] text-link">
                  #{t.replace(/^#/, "")}
                </span>
              ))}
            </div>
          </Block>

          <Block title="分镜脚本" aside={changed ? <span className="text-[12px] text-label-2">对应初稿；终稿只做了质检修正</span> : undefined}>
            <ol className="divide-y divide-separator border-y border-separator">
              {s.segments.map((seg, i) => (
                <li key={i} className="grid gap-1 py-3.5 sm:grid-cols-[72px_minmax(0,1.3fr)_minmax(0,1fr)] sm:gap-4">
                  <span className={cx("num text-[12px] font-medium", i === 0 ? "text-warning" : "text-label-2")}>{seg.time}</span>
                  <span className="text-[14px] leading-6 text-label">{seg.line}</span>
                  <span className="text-[13px] leading-6 text-label-2">{seg.visual}</span>
                </li>
              ))}
            </ol>
          </Block>

          <Block title="备选钩子">
            <ul className="space-y-2">
              {s.alternativeHooks.map((h, i) => (
                <li key={i} className="tile flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <Chip tone="amber">{h.type}</Chip>
                  <span className="text-[14px] text-label">“{h.line}”</span>
                </li>
              ))}
            </ul>
          </Block>

          <Block title="规则检查" aside={<span className="text-[12px] text-label-2">初稿</span>}>
            <ChecksList checks={state.data!.checks} />
          </Block>
        </>
      )}
    </Section>
  );
}
