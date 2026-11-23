"use client";

import { ShieldCheck } from "lucide-react";
import type { ReviewResponse, ScriptResponse, StageState } from "@/lib/api-types";
import { ChecksList, DiffView } from "./Checks";
import { Block, Chip, ErrorBox, Section, Waiting, type Tone } from "./ui";

const STATUS_TONE: Record<string, Tone> = { 有依据: "green", 无依据: "amber", 夸大: "red", 与资料不符: "red" };

const RING_COLORS = ["var(--color-tile-red)", "var(--color-tile-green)", "var(--color-tile-blue)", "var(--color-tile-purple)"];

/** Apple Watch–style activity ring. */
function Ring({ label, value, color }: { label: string; value: number; color: string }) {
  const v = Math.max(0, Math.min(10, value));
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <figure className="flex flex-col items-center gap-2">
      <div className="relative h-[72px] w-[72px]">
        <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth="7" />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v / 10)}
            className="transition-[stroke-dashoffset] duration-1000 ease-[var(--ease-apple)]"
          />
        </svg>
        <span className="num absolute inset-0 flex items-center justify-center text-[20px] font-semibold tracking-[-0.02em] text-label">{v}</span>
      </div>
      <figcaption className="text-[12px] text-label-2">
        {label}
        <span className="sr-only">：{v} 分（满分 10）</span>
      </figcaption>
    </figure>
  );
}

export function ReviewSection({
  state,
  script,
  onRetry,
}: {
  state: StageState<ReviewResponse>;
  script: StageState<ScriptResponse>;
  onRetry: () => void;
}) {
  const r = state.data?.data;
  const draft = script.data?.data.script ?? "";
  const final = state.data?.finalScript ?? "";
  const issues = r ? r.claims.filter((c) => c.status !== "有依据").length + r.compliance.length : 0;

  return (
    <Section
      id="review"
      icon={ShieldCheck}
      color="green"
      title="质量检查"
      subtitle="规则引擎 + AI 逐条核查事实，降低错误信息和夸大描述"
      right={state.ms ? <span className="num text-[12px] text-label-2">{(state.ms / 1000).toFixed(1)}s</span> : null}
    >
      {state.status === "error" && <ErrorBox message={state.error ?? "失败"} onRetry={onRetry} />}
      {state.status === "blocked" && <p className="text-[14px] text-label-2">文案写好后自动开始质检。</p>}
      {state.status === "running" && <Waiting text="正在把文案拆成一条条事实，逐条对照商品资料核查，并扫描广告法用语…" />}
      {r && state.data && (
        <>
          <div className="mb-9 grid items-center gap-6 rounded-[24px] bg-fill p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <div className="eyebrow">{issues === 0 ? "未发现问题" : `发现并修正 ${issues} 处问题`}</div>
              <p className="mt-2 text-balance text-[17px] font-semibold leading-snug tracking-[-0.02em] text-label">{r.verdict}</p>
            </div>
            <div className="grid grid-cols-2 justify-items-center gap-5 sm:grid-cols-4 sm:gap-6">
              <Ring label="事实准确" value={r.scores.factuality} color={RING_COLORS[0]} />
              <Ring label="合规" value={r.scores.compliance} color={RING_COLORS[1]} />
              <Ring label="钩子" value={r.scores.hook} color={RING_COLORS[2]} />
              <Ring label="自然度" value={r.scores.naturalness} color={RING_COLORS[3]} />
            </div>
          </div>

          {final !== draft && (
            <Block title="修改对比" aside={<span className="text-[12px] text-label-2">红色为删除，绿色为新增</span>}>
              <div className="tile p-5">
                <DiffView before={draft} after={final} />
              </div>
              {r.changes.length > 0 && (
                <ul className="mt-3 space-y-1 pl-1 text-[13px] leading-6 text-label-2">
                  {r.changes.map((c, i) => (
                    <li key={i}>· {c}</li>
                  ))}
                </ul>
              )}
            </Block>
          )}

          <Block title="事实核查" aside={<span className="num text-[12px] text-label-2">{r.claims.length} 条表述</span>}>
            <ul className="divide-y divide-separator border-y border-separator">
              {r.claims.map((c, i) => (
                <li key={i} className="grid gap-2 py-3.5 sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-4">
                  <span>
                    <Chip tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</Chip>
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] leading-6 text-label">“{c.claim}”</p>
                    <p className="mt-0.5 text-[12px] leading-5 text-label-2">{c.source}</p>
                    {c.fix && <p className="mt-0.5 text-[12px] leading-5 text-success">改为：{c.fix}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Block>

          {r.compliance.length > 0 && (
            <Block title="合规问题">
              <ul className="space-y-2">
                {r.compliance.map((c, i) => (
                  <li key={i} className="rounded-[16px] bg-danger-tint px-4 py-3 text-[14px] leading-6">
                    <span className="font-medium text-danger">“{c.text}”</span>
                    <span className="text-label"> — {c.issue}</span>
                    {c.fix && <div className="text-[12px] text-success">改为：{c.fix}</div>}
                  </li>
                ))}
              </ul>
            </Block>
          )}

          <Block title="钩子点评">
            <p className="text-[14px] leading-7 text-label">{r.hookFeedback}</p>
          </Block>

          <Block title="规则检查" aside={<span className="text-[12px] text-label-2">终稿</span>}>
            <ChecksList checks={state.data.checksAfter} />
          </Block>
        </>
      )}
    </Section>
  );
}
