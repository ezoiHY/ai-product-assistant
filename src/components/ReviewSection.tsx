"use client";

import type { ReviewResponse, ScriptResponse, StageState } from "@/lib/api-types";
import { ChecksList, DiffView } from "./Checks";
import { Block, Chip, ErrorBox, Section, SkeletonLines, cx, type Tone } from "./ui";

const STATUS_TONE: Record<string, Tone> = { 有依据: "green", 无依据: "amber", 夸大: "red", 与资料不符: "red" };

function Score({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(10, value));
  const color = v >= 8 ? "bg-emerald-500" : v >= 6 ? "bg-amber-400" : "bg-rose-500";
  return (
    <div className="rounded-xl border border-slate-100 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-lg font-semibold text-slate-900">{v}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cx("h-full rounded-full", color)} style={{ width: `${v * 10}%` }} />
      </div>
    </div>
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
      index="4"
      title="质量检查"
      subtitle="规则引擎 + AI 逐条事实核查，降低错误信息和夸大描述"
      right={state.ms ? <span className="text-xs text-slate-400">{(state.ms / 1000).toFixed(1)}s</span> : null}
    >
      {state.status === "error" && <ErrorBox message={state.error ?? "失败"} onRetry={onRetry} />}
      {state.status === "blocked" && <p className="text-sm text-slate-400">文案生成后自动开始质检。</p>}
      {state.status === "running" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">正在把文案拆成一条条事实，逐条对照商品资料核查，并扫描广告法用语…</p>
          <SkeletonLines lines={5} />
        </div>
      )}
      {r && state.data && (
        <>
          <div className="mb-5 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800">
            <span className="font-semibold">{issues === 0 ? "✅ " : "🛠 "}结论：</span>
            {r.verdict}
          </div>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Score label="事实准确" value={r.scores.factuality} />
            <Score label="合规" value={r.scores.compliance} />
            <Score label="钩子吸引力" value={r.scores.hook} />
            <Score label="口语自然度" value={r.scores.naturalness} />
          </div>

          {final !== draft && (
            <Block title="修改对比（红删 / 绿增）">
              <div className="rounded-xl border border-slate-100 p-4">
                <DiffView before={draft} after={final} />
              </div>
              {r.changes.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-500">
                  {r.changes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
            </Block>
          )}

          <Block title={`事实核查（${r.claims.length} 条表述）`}>
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <table className="w-full text-sm">
                <tbody>
                  {r.claims.map((c, i) => (
                    <tr key={i} className="border-b border-slate-100 align-top last:border-0">
                      <td className="w-24 px-3 py-2.5">
                        <Chip tone={STATUS_TONE[c.status] ?? "slate"}>{c.status}</Chip>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="leading-6 text-slate-800">“{c.claim}”</div>
                        <div className="mt-0.5 text-xs leading-5 text-slate-500">{c.source}</div>
                        {c.fix && <div className="mt-0.5 text-xs leading-5 text-emerald-700">改为：{c.fix}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Block>

          {r.compliance.length > 0 && (
            <Block title="合规问题">
              <ul className="space-y-2">
                {r.compliance.map((c, i) => (
                  <li key={i} className="rounded-xl bg-rose-50/70 px-3.5 py-2.5 text-sm leading-6">
                    <span className="font-medium text-rose-800">“{c.text}”</span>
                    <span className="text-slate-700"> — {c.issue}</span>
                    {c.fix && <div className="text-xs text-emerald-700">改为：{c.fix}</div>}
                  </li>
                ))}
              </ul>
            </Block>
          )}

          <Block title="钩子点评">
            <p className="text-sm leading-6 text-slate-700">{r.hookFeedback}</p>
          </Block>

          <Block title="规则检查（终稿）">
            <ChecksList checks={state.data.checksAfter} />
          </Block>
        </>
      )}
    </Section>
  );
}
