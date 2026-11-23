"use client";

import { FileText } from "lucide-react";
import type { InfoResponse, StageState } from "@/lib/api-types";
import { Block, ErrorBox, Section, Waiting, StageMeta } from "./ui";

export function InfoSection({ state, onRetry }: { state: StageState<InfoResponse>; onRetry: () => void }) {
  const info = state.data?.data.productInfo;
  const facts: Array<[string, string]> = info
    ? [
        ["产品名称", info.nameZh],
        ["品类", info.category],
        ["价格", info.price],
        ["口碑", info.socialProof],
        ...(info.variants ? ([["款式", info.variants]] as Array<[string, string]>) : []),
      ]
    : [];

  return (
    <Section
      id="info"
      icon={FileText}
      color="blue"
      title="产品信息整理"
      subtitle="从商品页提取关键信息，翻译并提炼成中文"
      right={<StageMeta ms={state.ms} model={state.data?.meta.model} />}
    >
      {state.status === "error" && <ErrorBox message={state.error ?? "失败"} code={state.errorCode} onRetry={onRetry} />}
      {state.status === "running" && <Waiting text="正在整理中文产品档案…" />}
      {info && (
        <>
          <p className="mb-7 text-balance text-[21px] font-semibold leading-snug tracking-[-0.02em] text-label">{info.oneLiner}</p>

          <div className="mb-8 grid gap-2.5 sm:grid-cols-2">
            {facts.map(([k, v]) => (
              <div key={k} className="tile px-4 py-3.5">
                <div className="eyebrow">{k}</div>
                <div className="mt-1 text-[14px] leading-6 text-label">{v}</div>
              </div>
            ))}
          </div>

          <Block title="核心功能">
            <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {info.coreFeatures.map((f, i) => (
                <li key={i} className="flex gap-3">
                  <span aria-hidden="true" className="num mt-0.5 w-5 shrink-0 text-[15px] font-semibold text-label-3">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <div className="text-[15px] font-semibold tracking-[-0.01em] text-label">{f.title}</div>
                    <div className="mt-1 text-[14px] leading-6 text-label-2">{f.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Block>

          <Block title="关键规格">
            <dl className="divide-y divide-separator border-y border-separator">
              {info.keySpecs.map((s, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 py-3 text-[14px]">
                  <dt className="text-label-2">{s.name}</dt>
                  <dd className="text-label [overflow-wrap:anywhere]">{s.value}</dd>
                </div>
              ))}
            </dl>
          </Block>
        </>
      )}
    </Section>
  );
}
