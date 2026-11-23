"use client";

import type { InfoResponse, StageState } from "@/lib/api-types";
import { Block, ErrorBox, Section, SkeletonLines } from "./ui";

export function InfoSection({ state, onRetry }: { state: StageState<InfoResponse>; onRetry: () => void }) {
  const info = state.data?.data.productInfo;
  return (
    <Section
      id="info"
      index="1"
      title="产品信息整理"
      subtitle="从商品页提取的关键信息，翻译并提炼为中文"
      right={state.ms ? <span className="text-xs text-slate-400">{(state.ms / 1000).toFixed(1)}s</span> : null}
    >
      {state.status === "error" && <ErrorBox message={state.error ?? "失败"} onRetry={onRetry} />}
      {state.status === "running" && <SkeletonLines lines={6} />}
      {info && (
        <>
          <p className="mb-5 rounded-xl bg-indigo-50/70 px-4 py-3 text-[15px] leading-7 text-slate-800">{info.oneLiner}</p>
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            {[
              ["产品名称", info.nameZh],
              ["品类", info.category],
              ["价格", info.price],
              ["口碑", info.socialProof],
              ...(info.variants ? [["款式", info.variants]] : []),
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                <div className="label">{k}</div>
                <div className="mt-1 text-sm leading-6 text-slate-800">{v}</div>
              </div>
            ))}
          </div>
          <Block title="核心功能">
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {info.coreFeatures.map((f, i) => (
                <li key={i} className="rounded-xl border border-slate-100 p-3">
                  <div className="text-sm font-medium text-slate-900">{f.title}</div>
                  <div className="mt-1 text-sm leading-6 text-slate-600">{f.detail}</div>
                </li>
              ))}
            </ul>
          </Block>
          <Block title="关键规格">
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <table className="w-full text-sm">
                <tbody>
                  {info.keySpecs.map((s, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="w-1/3 bg-slate-50/70 px-4 py-2 text-slate-500">{s.name}</td>
                      <td className="px-4 py-2 text-slate-800">{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Block>
        </>
      )}
    </Section>
  );
}
