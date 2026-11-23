"use client";

import { ArrowUpRight, ChevronDown, ImageOff, Star, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { ScrapeResponse } from "@/lib/api-types";
import type { ProductInfo } from "@/lib/ai/schemas";
import { Chip, ICON_STROKE, cx, type Tone } from "./ui";

const SOURCE: Record<string, { text: string; tone: Tone }> = {
  direct: { text: "直连解析商品页", tone: "green" },
  claude_web: { text: "Claude 联网获取", tone: "blue" },
  manual: { text: "手动粘贴", tone: "violet" },
  browser: { text: "浏览器带回", tone: "green" },
};

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-px" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative inline-block h-3.5 w-3.5">
            <Star className="absolute h-3.5 w-3.5 text-fill-2" fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="h-3.5 w-3.5 text-tile-orange" fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
      <span className="text-label-2">{label}</span>
      <span className="text-right text-label">{children}</span>
    </div>
  );
}

export function ProductCard({ scrape, info }: { scrape: ScrapeResponse; info?: ProductInfo }) {
  const p = scrape.product;
  const [img, setImg] = useState(0);
  const [showRaw, setShowRaw] = useState(false);
  const src = SOURCE[scrape.source] ?? SOURCE.direct;

  return (
    <div className="card rise overflow-hidden">
      <div className="p-3 pb-0">
        <div className="flex h-64 items-center justify-center rounded-[22px] bg-white p-5">
          {p.images.length ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.images[img]} alt={p.title} className="max-h-full max-w-full object-contain" />
          ) : (
            <ImageOff className="h-10 w-10 text-tile-gray" strokeWidth={ICON_STROKE} aria-label="没有图片" />
          )}
        </div>
        {p.images.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {p.images.map((u, i) => (
              <button
                key={u}
                onClick={() => setImg(i)}
                aria-label={`查看第 ${i + 1} 张图`}
                aria-pressed={i === img}
                className={cx(
                  "h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-[12px] bg-white p-1 transition",
                  i === img ? "ring-2 ring-accent" : "opacity-70 ring-1 ring-separator hover:opacity-100",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-5 p-5 pt-4">
        <div>
          {info?.nameZh && <h2 className="text-[19px] font-semibold leading-snug tracking-[-0.02em] text-label">{info.nameZh}</h2>}
          <p className={cx("leading-snug", info?.nameZh ? "mt-1.5 text-[13px] text-label-2" : "text-[15px] font-medium text-label")}>{p.title}</p>
          <p className="num mt-2 text-[12px] text-label-2">
            {p.brand && <span>{p.brand} · </span>}
            {p.asin} · {p.marketplace}
          </p>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          {p.price ? (
            <>
              <span className="num text-[32px] font-semibold leading-none tracking-[-0.03em] text-label">{p.price.display}</span>
              {p.price.listPrice && <span className="num text-[14px] text-label-2 line-through">{p.price.listPrice}</span>}
              {p.price.savings && <Chip tone="red">{p.price.savings}</Chip>}
            </>
          ) : (
            <span className="text-[14px] text-label-2">页面未显示价格</span>
          )}
        </div>

        {p.rating !== undefined && (
          <div>
            <div className="flex items-center gap-2 text-[13px]">
              <Stars value={p.rating} />
              <span className="num font-semibold text-label">{p.rating}</span>
              {p.ratingCount && <span className="num text-label-2">{p.ratingCount.toLocaleString()} 个评分</span>}
            </div>
            {p.ratingHistogram && (
              <div className="mt-3 space-y-1.5" aria-label="星级分布">
                {p.ratingHistogram.map((pct, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-[11px] text-label-2">
                    <span className="num w-5">{5 - i}星</span>
                    <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-fill-2">
                      <div className={cx("h-full rounded-full", i < 3 ? "bg-tile-orange" : "bg-tile-red")} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="num w-8 text-right">{pct}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(p.boughtPastMonth || p.bestSellersRank.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {p.boughtPastMonth && <Chip tone="green">{p.boughtPastMonth}</Chip>}
            {p.bestSellersRank.slice(0, 2).map((r) => (
              <Chip key={r} tone="amber">
                {r}
              </Chip>
            ))}
          </div>
        )}

        {p.categories.length > 0 && <p className="text-[12px] leading-5 text-label-2">{p.categories.join(" › ")}</p>}

        <div className="tile divide-y divide-separator">
          <Row label="数据来源">
            <Chip tone={src.tone}>{src.text}</Chip>
          </Row>
          <Row label="信息完整度">
            <span className="num">{scrape.completeness.score}%</span>
          </Row>
          <Row label="耗时">
            <span className="num">
              {(scrape.elapsedMs / 1000).toFixed(1)}s{scrape.cached ? " · 缓存" : ""}
            </span>
          </Row>
          {scrape.completeness.missing.length > 0 && <Row label="缺少">{scrape.completeness.missing.join("、")}</Row>}
        </div>

        {scrape.warnings.map((w) => (
          <p key={w} className="flex items-start gap-2 text-[12px] leading-5 text-warning">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={ICON_STROKE} aria-hidden="true" />
            {w}
          </p>
        ))}

        <div className="flex items-center justify-between">
          {p.url ? (
            <a href={p.url} target="_blank" rel="noreferrer" className="btn btn-plain min-h-8 px-0 text-[13px]">
              在 Amazon 查看
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </a>
          ) : (
            <span />
          )}
          <button onClick={() => setShowRaw((v) => !v)} aria-expanded={showRaw} className="btn min-h-8 px-2 text-[13px] text-label-2 hover:text-label">
            页面原始数据
            <ChevronDown className={cx("h-3.5 w-3.5 transition-transform duration-300", showRaw && "rotate-180")} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {showRaw && (
          <div className="rise space-y-5 border-t border-separator pt-5 text-[12px] leading-5 text-label-2">
            {p.bullets.length > 0 && (
              <div>
                <h3 className="eyebrow mb-1.5">About this item</h3>
                <ul className="list-disc space-y-1 pl-4">
                  {p.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            {p.specs.length > 0 && (
              <div>
                <h3 className="eyebrow mb-1.5">Specs</h3>
                <dl className="divide-y divide-separator">
                  {p.specs.map((s) => (
                    <div key={s.name} className="grid grid-cols-[40%_1fr] gap-2 py-1.5">
                      <dt className="text-label-3">{s.name}</dt>
                      <dd className="text-label-2 [overflow-wrap:anywhere]">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {p.reviewInsights && (
              <div>
                <h3 className="eyebrow mb-1.5">Customers say</h3>
                {p.reviewInsights.summary && <p className="mb-2">{p.reviewInsights.summary}</p>}
                <div className="flex flex-wrap gap-1">
                  {p.reviewInsights.aspects.map((a) => (
                    <Chip key={a.label} tone={a.sentiment === "positive" ? "green" : a.sentiment === "negative" ? "red" : a.sentiment === "mixed" ? "amber" : "neutral"}>
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
