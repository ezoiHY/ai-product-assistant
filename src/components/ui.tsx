"use client";

import { Check, Copy, KeyRound, RotateCcw, TriangleAlert, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { CONFIG_ERROR_CODES, useOpenSettings } from "./settings-context";

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

export const ICON_STROKE = 1.75;

const TILE_BG = {
  blue: "bg-tile-blue",
  green: "bg-tile-green",
  orange: "bg-tile-orange",
  purple: "bg-tile-purple",
  pink: "bg-tile-pink",
  indigo: "bg-tile-indigo",
  teal: "bg-tile-teal",
  red: "bg-tile-red",
  gray: "bg-tile-gray",
} as const;
export type TileColor = keyof typeof TILE_BG;

/** iOS Settings-style rounded icon tile. Decorative: always next to a text label. */
export function IconTile({ icon: Icon, color, size = "md" }: { icon: LucideIcon; color: TileColor; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "h-11 w-11 rounded-[13px]" : size === "sm" ? "h-7 w-7 rounded-[8px]" : "h-9 w-9 rounded-[10px]";
  const glyph = size === "lg" ? "h-[22px] w-[22px]" : size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]";
  return (
    <span aria-hidden="true" className={cx("inline-flex shrink-0 items-center justify-center text-white", box, TILE_BG[color])}>
      <Icon className={glyph} strokeWidth={2} />
    </span>
  );
}

export function Section({
  id,
  icon,
  color,
  title,
  subtitle,
  right,
  children,
}: {
  id: string;
  icon: LucideIcon;
  color: TileColor;
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="card rise scroll-mt-28 p-5 sm:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <IconTile icon={icon} color={color} size="lg" />
          <div>
            <h2 id={`${id}-title`} className="text-[21px] font-semibold leading-tight tracking-[-0.02em] text-label">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-label-2">{subtitle}</p>}
          </div>
        </div>
        {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
      </header>
      {children}
    </section>
  );
}

export function Block({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-8 last:mb-0", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-label">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  );
}

export function SkeletonLines({ lines = 5 }: { lines?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${94 - ((i * 17) % 38)}%` }} />
      ))}
    </div>
  );
}

export function Waiting({ text }: { text: string }) {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <p className="text-[13px] text-label-2">{text}</p>
      <SkeletonLines lines={4} />
      <SkeletonLines lines={3} />
    </div>
  );
}

export function ErrorBox({ message, code, onRetry }: { message: string; code?: string; onRetry?: () => void }) {
  const openSettings = useOpenSettings();
  const configIssue = code ? CONFIG_ERROR_CODES.has(code) : false;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-danger-tint px-4 py-3.5 text-[14px] text-danger">
      <div className="flex items-start gap-2.5">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden="true" />
        <span className="leading-6">{message}</span>
      </div>
      <div className="flex gap-2">
        {configIssue && (
          <button onClick={openSettings} className="btn btn-primary">
            <KeyRound className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden="true" /> API 设置
          </button>
        )}
        {onRetry && (
          <button onClick={onRetry} className="btn bg-surface text-danger hover:opacity-80">
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden="true" /> 重试
          </button>
        )}
      </div>
    </div>
  );
}

export function CopyButton({ text, label = "复制", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className={cx("btn btn-secondary", className)}
    >
      {done ? (
        <Check className="h-3.5 w-3.5 text-success" strokeWidth={2.25} aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden="true" />
      )}
      <span aria-live="polite">{done ? "已复制" : label}</span>
    </button>
  );
}

const TONES = {
  neutral: "bg-fill text-label-2",
  green: "bg-success-tint text-success",
  amber: "bg-warning-tint text-warning",
  red: "bg-danger-tint text-danger",
  blue: "bg-info-tint text-info",
  violet: "bg-violet-tint text-violet",
} as const;
export type Tone = keyof typeof TONES;

export function Chip({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={cx("chip", TONES[tone])} title={title}>
      {children}
    </span>
  );
}

export function Evidence({ text }: { text: string }) {
  if (!text) return null;
  const inferred = /\[推断\]/.test(text);
  return (
    <p className={cx("mt-1.5 text-[12px] leading-5", inferred ? "text-warning" : "text-label-2")}>
      <span className="mr-1.5 font-medium">{inferred ? "推断" : "依据"}</span>
      {text.replace(/\[推断\]\s*/, "")}
    </p>
  );
}

/** "model · 12.3s" shown in a section header: which model actually answered. */
export function StageMeta({ ms, model }: { ms?: number; model?: string }) {
  if (!ms && !model) return null;
  return (
    <span className="num max-w-[240px] truncate text-[12px] text-label-2" title={model ? `由 ${model} 生成` : undefined}>
      {model}
      {model && ms ? " · " : ""}
      {ms ? `${(ms / 1000).toFixed(1)}s` : ""}
    </span>
  );
}
