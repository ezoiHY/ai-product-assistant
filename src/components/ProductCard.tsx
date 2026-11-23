"use client";

import { ChevronDown, ExternalLink, Globe, ImageOff, Star, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { ScrapeResponse } from "@/lib/api-types";
import type { ProductInfo } from "@/lib/ai/schemas";
import { Chip, cx } from "./ui";

const SOURCE_LABEL: Record<string, { text: string; tone: "green" | "blue" | "violet" }> = {
  direct: { text: "直连抓取", tone: "green" },
  claude_web: { text: "Claude 联网获取", tone: "blue" },
  manual: { text: "手动粘贴", tone: "violet" },
};

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative inline-block h-4 w-4">
            <Star className="absolute h-4 w-4 text-slate-200" fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="h-4 w-4 text-amber-400" fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function ProductCard({ scrape, info }: { scrape: ScrapeResponse; info?: ProductInfo }) {
  const p = scrape.product;
  const [img, setImg] = useState(0);
  const [showRaw, setShowRaw] = useState(false);
  const src = SOURCE_LABEL[scrape.source] ?? SOURCE_LABEL.direct;

  return (
    <div className="card overflow-hidden">
      <div className="relative bg-white p-4">
        {p.images.length ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.images[img]} alt={p.title} className="mx-auto h-56 w-full object-contain" referrerPolicy="no-referrer" />
            {p.images.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {p.images.map((u, i) => (
                  <button
                    key={u}
                    onClick={() => setImg(i)}
                    className={cx("h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-white p-0.5", i === img ? "border-slate-900" : "border-slate-200")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" className="h-full w-full object-contain" referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex h-40 items-center justify-center text-slate-300">
            <ImageOff className="h-10 w-10" />
          </div>
        )}
      </div>

      <div className="space-y-4 border-t border-slate-100 p-5">
        <div>
          {info?.nameZh && <div className="text-base font-semibold leading-6 text-slate-900">{info.nameZh}</div>}
          <div className={cx("leading-5", info?.nameZh ? "mt-1 text-xs text-slate-500" : "text-sm font-medium text-slate-800")}>{p.title}</div>
          <div className="mt-1.5 text-xs text-slate-400">
            {p.brand && <span>{p.brand} · </span>}
            ASIN {p.asin} · {p.marketplace}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          {p.price ? (
            <>
              <span className="text-2xl font-semibold tracking-tight text-slate-900">{p.price.display}</span>
              {p.price.listPrice && <span className="text-sm text-slate-400 line-through">{p.price.listPrice}</span>}
              {p.price.savings && <Chip tone="red">{p.price.savings}</Chip>}
            </>
          ) : (
            <span className="text-sm text-slate-400">页面未显示价格</span>
          )}
        </div>

        {p.rating !== undefined && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Stars value={p.rating} />
              <span className="font-semibold text-slate-800">{p.rating}</span>
              {p.ratingCount && <span className="text-slate-500">{p.ratingCount.toLocaleString()} 个评分</span>}
            </div>
            {p.ratingHistogram && (
              <div className="space-y-1">
                {p.ratingHistogram.map((pct, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="w-6">{5 - i}★</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className={cx("h-full rounded-full", i < 3 ? "bg-amber-400" : "bg-rose-400")} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 text-right">{pct}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {p.boughtPastMonth && <Chip tone="green">{p.boughtPastMonth}</Chip>}
          {p.bestSellersRank.slice(0, 2).map((r) => (
            <Chip key={r} tone="amber">
              {r}
            </Chip>
          ))}
        </div>

        {p.categories.length > 0 && <div className="text-xs leading-5 text-slate-500">{p.categories.join(" › ")}</div>}

        <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={src.tone}>
              <Globe className="h-3 w-3" />
              {src.text}
            </Chip>
            <span>信息完整度 {scrape.completeness.score}%</span>
            <span className="text-slate-400">· {(scrape.elapsedMs / 1000).toFixed(1)}s{scrape.cached ? " · 缓存" : ""}</span>
          </div>
          {scrape.completeness.missing.length > 0 && <div className="text-slate-500">缺少：{scrape.completeness.missing.join("、")}</div>}
          {scrape.warnings.map((w) => (
            <div key={w} className="flex items-start gap-1.5 text-amber-700">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {w}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          {p.url && (
            <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
              在 Amazon 打开 <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <button onClick={() => setShowRaw((v) => !v)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
            页面原始数据 <ChevronDown className={cx("h-3.5 w-3.5 transition", showRaw && "rotate-180")} />
          </button>
        </div>

        {showRaw && (
          <div className="space-y-4 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-600">
            {p.bullets.length > 0 && (
              <div>
                <div className="label mb-1">About this item</div>
                <ul className="list-disc space-y-1 pl-4">
                  {p.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            {p.specs.length > 0 && (
              <div>
                <div className="label mb-1">Specs</div>
                <table className="w-full">
                  <tbody>
                    {p.specs.map((s) => (
                      <tr key={s.name} className="border-b border-slate-100 last:border-0">
                        <td className="py-1 pr-2 align-top text-slate-400">{s.name}</td>
                        <td className="py-1">{s.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {p.reviewInsights && (
              <div>
                <div className="label mb-1">Customers say</div>
                {p.reviewInsights.summary && <p className="mb-2">{p.reviewInsights.summary}</p>}
                <div className="flex flex-wrap gap-1">
                  {p.reviewInsights.aspects.map((a) => (
                    <Chip key={a.label} tone={a.sentiment === "positive" ? "green" : a.sentiment === "negative" ? "red" : a.sentiment === "mixed" ? "amber" : "slate"}>
                      {a.label}
                      {a.mentions ? ` ${a.mentions.toLocaleString()}` : ""}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
