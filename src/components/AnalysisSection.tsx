"use client";

import { Camera, CircleAlert, Clapperboard, Crosshair, MessageSquareQuote, ShieldAlert, Swords, ThumbsDown, ThumbsUp, Users } from "lucide-react";
import type { InsightResponse, StageState } from "@/lib/api-types";
import { Block, Chip, ErrorBox, Evidence, Section, SkeletonLines } from "./ui";

export function AnalysisSection({ state, onRetry }: { state: StageState<InsightResponse>; onRetry: () => void }) {
  const a = state.data?.data;
  return (
    <Section
      id="analysis"
      index="2"
      title="产品分析"
      subtitle="谁会买、为什么买、买家怎么说、内容该怎么讲"
      right={
        <>
          {state.data && state.data.imagesUsed > 0 && (
            <Chip tone="violet">
              <Camera className="h-3 w-3" /> 结合 {state.data.imagesUsed} 张商品图
            </Chip>
          )}
          {state.ms ? <span className="text-xs text-slate-400">{(state.ms / 1000).toFixed(1)}s</span> : null}
        </>
      }
    >
      {state.status === "error" && <ErrorBox message={state.error ?? "失败"} onRetry={onRetry} />}
      {state.status === "running" && (
        <div className="space-y-6">
          <p className="text-sm text-slate-400">正在结合页面信息、买家评价和商品图片做深度分析，通常需要 30-60 秒…</p>
          <SkeletonLines lines={4} />
          <SkeletonLines lines={5} />
        </div>
      )}
      {a && (
        <>
          <div className="mb-6 rounded-xl bg-slate-900 px-5 py-4 text-white">
            <div className="label !text-slate-400">产品定位</div>
            <p className="mt-1 text-[15px] leading-7">{a.positioning.summary}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{a.positioning.priceBand}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {a.positioning.purchaseDrivers.map((d) => (
                <span key={d} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-slate-100">
                  {d}
                </span>
              ))}
            </div>
          </div>

          <Block title="目标用户">
            <div className="grid gap-3 sm:grid-cols-3">
              {a.targetUsers.map((u, i) => (
                <div key={i} className="rounded-xl border border-slate-100 p-3.5">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <Users className="h-4 w-4 text-indigo-500" />
                    {u.persona}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{u.need}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    <span className="font-medium text-slate-700">下单时刻：</span>
                    {u.trigger}
                  </p>
                </div>
              ))}
            </div>
          </Block>

          <Block title="使用场景">
            <div className="grid gap-2 sm:grid-cols-2">
              {a.scenarios.map((s, i) => (
                <div key={i} className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm leading-6">
                  <span className="font-medium text-slate-900">{s.scene}</span>
                  <span className="text-slate-600"> — {s.value}</span>
                </div>
              ))}
            </div>
          </Block>

          <Block title="痛点 → 解决方案">
            <div className="space-y-2.5">
              {a.painPoints.map((p, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-slate-100 p-3.5 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
                  <div className="text-sm leading-6 text-slate-800">
                    <CircleAlert className="mr-1 inline h-4 w-4 text-rose-400" />
                    {p.pain}
                  </div>
                  <div className="hidden pt-1 text-slate-300 sm:block">→</div>
                  <div>
                    <div className="text-sm leading-6 text-slate-800">{p.solution}</div>
                    <Evidence text={p.evidence} />
                  </div>
                </div>
              ))}
            </div>
          </Block>

          <Block title="核心卖点（按说服力排序）">
            <ol className="space-y-2.5">
              {a.sellingPoints.map((s, i) => (
                <li key={i} className="flex gap-3 rounded-xl border border-slate-100 p-3.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-600">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{s.point}</span>
                      <Chip tone={s.strength === "强" ? "green" : s.strength === "中" ? "blue" : "slate"}>证据{s.strength}</Chip>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{s.benefit}</p>
                    <Evidence text={s.evidence} />
                  </div>
                </li>
              ))}
            </ol>
          </Block>

          <Block title="买家声音">
            <div className="rounded-xl border border-slate-100 p-4">
              <p className="flex items-start gap-2 text-sm leading-6 text-slate-800">
                <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                {a.voiceOfCustomer.verdict}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <ul className="space-y-1.5">
                  {a.voiceOfCustomer.loves.map((x, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-6 text-slate-700">
                      <ThumbsUp className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      {x}
                    </li>
                  ))}
                </ul>
                <ul className="space-y-1.5">
                  {a.voiceOfCustomer.complaints.map((x, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-6 text-slate-700">
                      <ThumbsDown className="mt-1 h-3.5 w-3.5 shrink-0 text-rose-400" />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Block>

          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <Block title="购买顾虑与应对" className="!mb-0">
              <div className="space-y-2">
                {a.objections.map((o, i) => (
                  <div key={i} className="rounded-xl bg-amber-50/70 p-3 text-sm leading-6">
                    <div className="font-medium text-amber-900">“{o.concern}”</div>
                    <div className="mt-1 text-slate-700">{o.response}</div>
                  </div>
                ))}
              </div>
            </Block>
            <Block title="竞争格局（推断）" className="!mb-0">
              <div className="space-y-2 rounded-xl border border-slate-100 p-3 text-sm leading-6">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Swords className="h-4 w-4 text-slate-400" />
                  {a.competition.alternatives.map((x) => (
                    <Chip key={x}>{x}</Chip>
                  ))}
                </div>
                <p className="text-slate-700">
                  <span className="font-medium text-emerald-700">优势 </span>
                  {a.competition.advantage}
                </p>
                <p className="text-slate-700">
                  <span className="font-medium text-rose-600">劣势 </span>
                  {a.competition.weakness}
                </p>
              </div>
            </Block>
          </div>

          <Block title="内容策略">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
              <p className="flex items-start gap-2 text-sm leading-6 text-slate-800">
                <Crosshair className="mt-1 h-4 w-4 shrink-0 text-indigo-500" />
                <span>
                  <span className="font-semibold">首推角度：</span>
                  {a.contentStrategy.bestAngle}
                </span>
              </p>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                {a.contentStrategy.angles.map((x, i) => (
                  <div key={i} className="rounded-lg bg-white p-3 text-sm shadow-sm">
                    <div className="font-medium text-slate-900">{x.angle}</div>
                    <div className="mt-1 leading-6 text-slate-600">“{x.hook}”</div>
                    <div className="mt-1.5 text-xs text-slate-400">{x.platform}</div>
                  </div>
                ))}
              </div>
              {a.contentStrategy.avoid.length > 0 && (
                <div className="mt-3 flex flex-wrap items-start gap-1.5 text-xs">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 text-rose-500" />
                  <span className="text-slate-500">避免：</span>
                  {a.contentStrategy.avoid.map((x) => (
                    <Chip key={x} tone="red">
                      {x}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          </Block>

          {(a.visualInsights.observations.length > 0 || a.visualInsights.shotIdeas.length > 0) && (
            <Block title="商品图片洞察">
              <div className="grid gap-3 sm:grid-cols-2">
                <ul className="space-y-1.5 rounded-xl bg-slate-50 p-3.5">
                  {a.visualInsights.observations.map((x, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-6 text-slate-700">
                      <Camera className="mt-1 h-3.5 w-3.5 shrink-0 text-violet-500" />
                      {x}
                    </li>
                  ))}
                </ul>
                <ul className="space-y-1.5 rounded-xl bg-slate-50 p-3.5">
                  {a.visualInsights.shotIdeas.map((x, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-6 text-slate-700">
                      <Clapperboard className="mt-1 h-3.5 w-3.5 shrink-0 text-violet-500" />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            </Block>
          )}

          {a.dataGaps.length > 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 p-3 text-xs leading-5 text-slate-500">
              <span className="font-medium text-slate-600">待核实：</span>
              {a.dataGaps.join("；")}
            </div>
          )}
        </>
      )}
    </Section>
  );
}
