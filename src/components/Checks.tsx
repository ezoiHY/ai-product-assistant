"use client";

import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import type { ScriptCheck } from "@/lib/quality/rules";

export function ChecksList({ checks }: { checks: ScriptCheck[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {checks.map((c) => (
        <li key={c.id} className="flex items-start gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-sm">
          {c.status === "pass" ? (
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          ) : c.status === "warn" ? (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          )}
          <div>
            <div className="font-medium text-slate-800">{c.label}</div>
            <div className="text-xs leading-5 text-slate-500">{c.detail}</div>
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
    <p className="text-sm leading-7 text-slate-700">
      {parts.map((p, i) =>
        p.t === "same" ? (
          <span key={i}>{p.s}</span>
        ) : p.t === "del" ? (
          <del key={i} className="bg-rose-100 text-rose-700 decoration-rose-400">
            {p.s}
          </del>
        ) : (
          <ins key={i} className="bg-emerald-100 text-emerald-800 no-underline">
            {p.s}
          </ins>
        ),
      )}
    </p>
  );
}
