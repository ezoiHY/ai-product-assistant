"use client";

import { Loader2, Pause, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReviewResponse, ScriptResponse, StageState } from "@/lib/api-types";
import { countChars, estimateSeconds, firstSentence, MAX_CHARS } from "@/lib/quality/rules";
import { ChecksList } from "./Checks";
import { Block, Chip, CopyButton, ErrorBox, Section, SkeletonLines, cx } from "./ui";

function useSpeech() {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

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
    <p className="text-[17px] leading-9 text-slate-900">
      <mark className="rounded-md bg-amber-200/70 px-1 py-0.5 text-slate-900">{h}</mark>
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

  return (
    <Section
      id="script"
      index="3"
      title="短视频口播文案"
      subtitle="≤150 字 · 前 5 秒钩子 · 已经过事实核查与合规质检"
      right={
        s && review.status !== "running" && state.status !== "running" ? (
          <button
            onClick={onRegenerate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 换一版
          </button>
        ) : null
      }
    >
      {state.status === "error" && <ErrorBox message={state.error ?? "失败"} onRetry={onRetry} />}
      {state.status === "blocked" && <p className="text-sm text-slate-400">等待“产品信息整理”完成后生成。</p>}
      {state.status === "running" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">正在按“钩子 → 痛点 → 卖点 → 背书 → 行动”的结构写口播…</p>
          <SkeletonLines lines={4} />
        </div>
      )}
      {s && (
        <>
          <div className="mb-5 rounded-2xl border border-amber-100 bg-gradient-to-b from-amber-50/60 to-white p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {final && !showDraft ? (
                <Chip tone="green">
                  <ShieldCheck className="h-3 w-3" /> 终稿 · 已质检
                </Chip>
              ) : review.status === "running" ? (
                <Chip tone="blue">
                  <Loader2 className="h-3 w-3 animate-spin" /> 初稿 · 质检中
                </Chip>
              ) : (
                <Chip>初稿</Chip>
              )}
              <Chip tone={n <= MAX_CHARS ? "slate" : "red"}>
                {n} / {MAX_CHARS} 字
              </Chip>
              <Chip>约 {estimateSeconds(shown)} 秒</Chip>
              <Chip tone="amber">钩子：{s.hookType}</Chip>
              {changed && (
                <button onClick={() => setShowDraft((v) => !v)} className="text-xs text-indigo-600 hover:underline">
                  {showDraft ? "看终稿" : "看初稿"}
                </button>
              )}
            </div>
            <ScriptText script={shown} hook={s.hook} />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <CopyButton text={shown} label="复制文案" />
              {speech.supported && (
                <button
                  onClick={() => (speech.playing ? speech.stop() : speech.play(shown))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {speech.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {speech.playing ? `${speech.elapsed.toFixed(1)}s` : "试听"}
                </button>
              )}
              {speech.playing && (
                <span className={cx("text-xs", speech.elapsed <= 5 ? "text-amber-600" : "text-slate-400")}>
                  {speech.elapsed <= 5 ? "前 5 秒：钩子阶段" : "钩子已说完"}
                </span>
              )}
            </div>
          </div>

          <Block title={`标题：${s.title}`}>
            <div className="flex flex-wrap gap-1.5">
              {s.hashtags.map((t) => (
                <span key={t} className="text-sm text-indigo-600">
                  #{t.replace(/^#/, "")}
                </span>
              ))}
            </div>
          </Block>

          <Block title="分镜脚本">
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="w-20 px-3 py-2 font-medium">时间</th>
                    <th className="px-3 py-2 font-medium">口播</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">画面</th>
                  </tr>
                </thead>
                <tbody>
                  {s.segments.map((seg, i) => (
                    <tr key={i} className={cx("border-t border-slate-100 align-top", i === 0 && "bg-amber-50/40")}>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{seg.time}</td>
                      <td className="px-3 py-2.5 leading-6 text-slate-800">
                        {seg.line}
                        <div className="mt-1 text-xs text-slate-400 sm:hidden">🎬 {seg.visual}</div>
                      </td>
                      <td className="hidden px-3 py-2.5 leading-6 text-slate-500 sm:table-cell">{seg.visual}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {changed && <p className="mt-2 text-xs text-slate-400">分镜对应初稿；终稿只做了质检修正，结构不变。</p>}
          </Block>

          <Block title="备选钩子">
            <ul className="space-y-1.5">
              {s.alternativeHooks.map((h, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                  <Chip>{h.type}</Chip>“{h.line}”
                </li>
              ))}
            </ul>
          </Block>

          <Block title="规则检查（初稿）">
            <ChecksList checks={state.data!.checks} />
          </Block>
        </>
      )}
    </Section>
  );
}
