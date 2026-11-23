"use client";

import { AlertTriangle, Check, Copy, RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

export function Section({
  id,
  index,
  title,
  subtitle,
  right,
  children,
}: {
  id: string;
  index: string;
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="card scroll-mt-24 p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white">
            {index}
          </span>
          <div>
            <h2 className="text-lg font-semibold leading-7 text-slate-900">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
          </div>
        </div>
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>
      {children}
    </section>
  );
}

export function Block({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-6 last:mb-0", className)}>
      <h3 className="mb-2.5 text-sm font-semibold text-slate-800">{title}</h3>
      {children}
    </div>
  );
}

export function SkeletonLines({ lines = 5 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
        >
          <RotateCcw className="h-3.5 w-3.5" /> 重试
        </button>
      )}
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
        setTimeout(() => setDone(false), 1500);
      }}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50",
        className,
      )}
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "已复制" : label}
    </button>
  );
}

const TONES = {
  slate: "border-slate-200 bg-slate-50 text-slate-600",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-rose-200 bg-rose-50 text-rose-700",
  blue: "border-sky-200 bg-sky-50 text-sky-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
} as const;
export type Tone = keyof typeof TONES;

export function Chip({ tone = "slate", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
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
    <p className={cx("mt-1 text-xs leading-5", inferred ? "text-amber-700/80" : "text-slate-400")}>
      <span className="mr-1">{inferred ? "推断" : "依据"}</span>
      {text}
    </p>
  );
}
