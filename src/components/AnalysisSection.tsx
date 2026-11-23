"use client";

import { ArrowRight, Brain, Camera, Clapperboard, Clock, Crosshair, Minus, Plus, ShieldAlert } from "lucide-react";
import type { InsightResponse, StageState } from "@/lib/api-types";
import { Block, Chip, ErrorBox, Evidence, ICON_STROKE, Section, Waiting } from "./ui";

export function AnalysisSection({ state, onRetry }: { state: StageState<InsightResponse>; onRetry: () => void }) {
  const a = state.data?.data;
  return (
    <Section
      id="analysis"
      icon={Brain}
      color="purple"
      title="产品分析"
      subtitle="谁会买、为什么买、买家怎么说、内容该怎么讲"
      right={
        <>
          {state.data && state.data.imagesUsed > 0 && (
            <Chip tone="violet">
              <Camera className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              结合 {state.data.imagesUsed} 张商品图
            </Chip>
          )}
          {state.ms ? <span className="num text-[12px] text-label-2">{(state.ms / 1000).toFixed(1)}s</span> : null}
        </>
      }
    >
      {state.status === "error" && <ErrorBox message={state.error ?? "失败"} code={state.errorCode} onRetry={onRetry} />}
      {state.status === "running" && <Waiting text="正在结合页面信息、买家评价和商品图片做深度分析，通常需要 30-60 秒…" />}
      {a && (
        <>
          {/* Positioning statement */}
          <div className="mb-9 rounded-[22px] bg-linear-to-br from-violet-tint to-info-tint p-6 sm:p-7">
            <div className="eyebrow">产品定位</div>
            <p className="mt-2 text-balance text-[22px] font-semibold leading-snug tracking-[-0.02em] text-label">{a.positioning.summary}</p>
            <p className="mt-3 text-[14px] leading-6 text-label-2">{a.positioning.priceBand}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {a.positioning.purchaseDrivers.map((d) => (
                <span key={d} className="chip bg-surface text-label">
                  {d}
                </span>
              ))}
            </div>
          </div>

          <Block title="目标用户">
            <div className="grid gap-2.5 md:grid-cols-3">
              {a.targetUsers.map((u, i) => (
                <div key={i} className="tile flex flex-col p-4">
                  <div className="text-[15px] font-semibold tracking-[-0.01em] text-label">{u.persona}</div>
                  <p className="mt-1.5 text-[14px] leading-6 text-label-2">{u.need}</p>
                  <p className="mt-auto flex items-start gap-1.5 pt-3 text-[12px] leading-5 text-label-2">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tile-indigo" strokeWidth={ICON_STROKE} aria-hidden="true" />
                    <span>
                      <span className="font-medium text-label">下单时刻 </span>
                      {u.trigger}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </Block>

          <Block title="使用场景">
            <ul className="tile divide-y divide-separator">
              {a.scenarios.map((s, i) => (
                <li key={i} className="flex flex-col gap-0.5 px-4 py-3 text-[14px] leading-6 sm:flex-row sm:gap-4">
                  <span className="shrink-0 font-medium text-label sm:w-40">{s.scene}</span>
                  <span className="text-label-2">{s.value}</span>
                </li>
              ))}
            </ul>
          </Block>

          <Block title="痛点 → 解决方案">
            <div className="space-y-2.5">
              {a.painPoints.map((p, i) => (
                <div key={i} className="tile grid gap-2 p-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.2fr)] md:items-start md:gap-4">
                  <p className="text-[14px] leading-6 text-label">“{p.pain}”</p>
                  <ArrowRight className="hidden h-4 w-4 translate-y-1 text-label-3 md:block" strokeWidth={ICON_STROKE} aria-hidden="true" />
                  <div>
                    <p className="text-[14px] leading-6 text-label">{p.solution}</p>
                    <Evidence text={p.evidence} />
                  </div>
                </div>
              ))}
            </div>
          </Block>

          <Block title="核心卖点" aside={<span className="text-[12px] text-label-2">按说服力排序</span>}>
            <ol className="divide-y divide-separator border-y border-separator">
              {a.sellingPoints.map((s, i) => (
                <li key={i} className="flex gap-4 py-4">
                  <span aria-hidden="true" className="num w-7 shrink-0 text-[28px] font-semibold leading-none tracking-[-0.03em] text-label-3">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[16px] font-semibold tracking-[-0.01em] text-label">{s.point}</span>
                      <Chip tone={s.strength === "强" ? "green" : s.strength === "中" ? "blue" : "neutral"}>证据{s.strength}</Chip>
                    </div>
                    <p className="mt-1 text-[14px] leading-6 text-label-2">{s.benefit}</p>
                    <Evidence text={s.evidence} />
                  </div>
                </li>
              ))}
            </ol>
          </Block>

          <Block title="买家声音">
            <p className="mb-4 text-[16px] leading-7 text-label">{a.voiceOfCustomer.verdict}</p>
            <div className="grid gap-2.5 md:grid-cols-2">
              <ul className="tile space-y-2.5 p-4">
                <li className="eyebrow !text-success">认可</li>
                {a.voiceOfCustomer.loves.map((x, i) => (
                  <li key={i} className="flex gap-2.5 text-[14px] leading-6 text-label">
                    <Plus className="mt-1 h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2.5} aria-hidden="true" />
                    {x}
                  </li>
                ))}
              </ul>
              <ul className="tile space-y-2.5 p-4">
                <li className="eyebrow !text-danger">不满与分歧</li>
                {a.voiceOfCustomer.complaints.map((x, i) => (
                  <li key={i} className="flex gap-2.5 text-[14px] leading-6 text-label">
                    <Minus className="mt-1 h-3.5 w-3.5 shrink-0 text-danger" strokeWidth={2.5} aria-hidden="true" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </Block>

          <div className="mb-8 grid gap-8 md:grid-cols-2 md:gap-6">
            <Block title="购买顾虑与应对" className="!mb-0">
              <div className="space-y-2.5">
                {a.objections.map((o, i) => (
                  <div key={i} className="tile p-4 text-[14px] leading-6">
                    <div className="font-medium text-label">“{o.concern}”</div>
                    <div className="mt-1 text-label-2">{o.response}</div>
                  </div>
                ))}
              </div>
            </Block>
            <Block title="竞争格局" aside={<span className="text-[12px] text-warning">推断</span>} className="!mb-0">
              <div className="tile space-y-3 p-4 text-[14px] leading-6">
                <div className="flex flex-wrap gap-1.5">
                  {a.competition.alternatives.map((x) => (
                    <span key={x} className="chip bg-surface text-label">
                      {x}
                    </span>
                  ))}
                </div>
                <p className="text-label">
                  <span className="mr-1.5 font-semibold text-success">优势</span>
                  {a.competition.advantage}
                </p>
                <p className="text-label">
                  <span className="mr-1.5 font-semibold text-danger">劣势</span>
                  {a.competition.weakness}
                </p>
              </div>
            </Block>
          </div>

          <Block title="内容策略">
            <div className="flex items-start gap-3 rounded-[18px] bg-info-tint p-4">
              <Crosshair className="mt-0.5 h-[18px] w-[18px] shrink-0 text-info" strokeWidth={ICON_STROKE} aria-hidden="true" />
              <p className="text-[14px] leading-6 text-label">
                <span className="font-semibold">首推角度　</span>
                {a.contentStrategy.bestAngle}
              </p>
            </div>
            <div className="mt-2.5 grid gap-2.5 md:grid-cols-3">
              {a.contentStrategy.angles.map((x, i) => (
                <div key={i} className="tile flex flex-col p-4">
                  <div className="text-[14px] font-semibold text-label">{x.angle}</div>
                  <p className="mt-1.5 text-[14px] leading-6 text-label-2">“{x.hook}”</p>
                  <p className="mt-auto pt-3 text-[12px] text-label-3">{x.platform}</p>
                </div>
              ))}
            </div>
            {a.contentStrategy.avoid.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 text-[12px] font-medium text-danger">
                  <ShieldAlert className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden="true" />
                  避免
                </span>
                {a.contentStrategy.avoid.map((x) => (
                  <Chip key={x} tone="red">
                    {x}
                  </Chip>
                ))}
              </div>
            )}
          </Block>

          {(a.visualInsights.observations.length > 0 || a.visualInsights.shotIdeas.length > 0) && (
            <Block title="商品图片洞察">
              <div className="grid gap-2.5 md:grid-cols-2">
                <ul className="tile space-y-2.5 p-4">
                  <li className="eyebrow">图中看到</li>
                  {a.visualInsights.observations.map((x, i) => (
                    <li key={i} className="flex gap-2.5 text-[14px] leading-6 text-label">
                      <Camera className="mt-1 h-3.5 w-3.5 shrink-0 text-violet" strokeWidth={ICON_STROKE} aria-hidden="true" />
                      {x}
                    </li>
                  ))}
                </ul>
                <ul className="tile space-y-2.5 p-4">
                  <li className="eyebrow">拍摄建议</li>
                  {a.visualInsights.shotIdeas.map((x, i) => (
                    <li key={i} className="flex gap-2.5 text-[14px] leading-6 text-label">
                      <Clapperboard className="mt-1 h-3.5 w-3.5 shrink-0 text-violet" strokeWidth={ICON_STROKE} aria-hidden="true" />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            </Block>
          )}

          {a.dataGaps.length > 0 && (
            <p className="rounded-[18px] px-4 py-3 text-[12px] leading-5 text-label-2 hairline">
              <span className="font-medium text-label">待人工核实　</span>
              {a.dataGaps.join("；")}
            </p>
          )}
        </>
      )}
    </Section>
  );
}
