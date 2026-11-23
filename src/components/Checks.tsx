"use client";

import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import type { ScriptCheck } from "@/lib/quality/rules";

const STATUS_TEXT = { pass: "通过", warn: "注意", fail: "未通过" } as const;

export function ChecksList({ checks }: { checks: ScriptCheck[] }) {
  return (
    <ul className="tile divide-y divide-separator">
      {checks.map((c) => (
        <li key={c.id} className="flex items-start gap-3 px-4 py-3">
          {c.status === "pass" ? (
            <CircleCheck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-success" strokeWidth={2} aria-hidden="true" />
          ) : c.status === "warn" ? (
            <TriangleAlert className="mt-0.5 h-[18px] w-[18px] shrink-0 text-warning" strokeWidth={2} aria-hidden="true" />
          ) : (
            <CircleX className="mt-0.5 h-[18px] w-[18px] shrink-0 text-danger" strokeWidth={2} aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-medium text-label">{c.label}</span>
              <span className={c.status === "pass" ? "text-[12px] text-success" : c.status === "warn" ? "text-[12px] text-warning" : "text-[12px] text-danger"}>
                {STATUS_TEXT[c.status]}
              </span>
            </div>
            <div className="mt-0.5 text-[12px] leading-5 text-label-2 [overflow-wrap:anywhere]">{c.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Character-level diff (LCS); scripts are ≤ ~160 chars so O(n·m) is fine. */
export function diffChars(a: string, b: string): Array<{ t: "same" | "add" | "del"; s: string }> {
  const A = [...a];
  const B = [...b];
  const n = A.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Array<{ t: "same" | "add" | "del"; s: string }> = [];
  const push = (t: "same" | "add" | "del", ch: string) => {
    const last = out[out.length - 1];
    if (last && last.t === t) last.s += ch;
    else out.push({ t, s: ch });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      push("same", A[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push("del", A[i++]);
    else push("add", B[j++]);
  }
  while (i < n) push("del", A[i++]);
  while (j < m) push("add", B[j++]);
  return out;
}

export function DiffView({ before, after }: { before: string; after: string }) {
  const parts = diffChars(before, after);
  return (
    <p className="text-[15px] leading-8 text-label">
      {parts.map((p, i) =>
        p.t === "same" ? (
          <span key={i}>{p.s}</span>
        ) : p.t === "del" ? (
          <del key={i} className="rounded-[4px] bg-danger-tint px-0.5 text-danger decoration-1">
            <span className="sr-only">删除：</span>
            {p.s}
          </del>
        ) : (
          <ins key={i} className="rounded-[4px] bg-success-tint px-0.5 text-success no-underline">
            <span className="sr-only">新增：</span>
            {p.s}
          </ins>
        ),
      )}
    </p>
  );
}
