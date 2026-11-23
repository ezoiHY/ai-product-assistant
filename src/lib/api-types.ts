// Response shapes of the API routes, shared with the client.
import type { CallMeta } from "./ai/client";
import type { InfoStage, ProductAnalysis, ReviewReport, VideoScript } from "./ai/schemas";
import type { ScriptCheck } from "./quality/rules";
import type { ScrapeResult } from "./types";
import { llmHeaders } from "./llm-config";

export type ScrapeResponse = ScrapeResult & { cached?: boolean };
export type InfoResponse = { data: InfoStage; meta: CallMeta; cached?: boolean };
export type InsightResponse = { data: ProductAnalysis; meta: CallMeta; imagesUsed: number; cached?: boolean };
export type ScriptResponse = { data: VideoScript; meta: CallMeta; checks: ScriptCheck[]; shortened: boolean };
export type ReviewResponse = {
  data: ReviewReport;
  meta: CallMeta;
  checksBefore: ScriptCheck[];
  checksAfter: ScriptCheck[];
  finalScript: string;
};

export type StageKey = "scrape" | "info" | "insight" | "script" | "review";

export interface StageState<T> {
  status: "idle" | "running" | "done" | "error" | "blocked";
  data?: T;
  error?: string;
  /** server error code, e.g. "not_configured" / "auth" → the UI offers "API 设置" */
  errorCode?: string;
  startedAt?: number;
  ms?: number;
}

export interface AnalysisRun {
  scrape: StageState<ScrapeResponse>;
  info: StageState<InfoResponse>;
  insight: StageState<InsightResponse>;
  script: StageState<ScriptResponse>;
  review: StageState<ReviewResponse>;
}

export const emptyRun = (): AnalysisRun => ({
  scrape: { status: "idle" },
  info: { status: "idle" },
  insight: { status: "idle" },
  script: { status: "idle" },
  review: { status: "idle" },
});

/** POST JSON. The saved API settings travel as headers (`headers` overrides them,
 *  e.g. to test unsaved form values). */
export async function postJSON<T>(url: string, body: unknown, signal?: AbortSignal, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(headers ?? llmHeaders()) },
    body: JSON.stringify(body),
    signal,
  });
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(res.status === 504 ? "处理超时，请重试" : `服务器返回异常（HTTP ${res.status}），请重试`);
  }
  if (!res.ok) {
    const d = data as { error?: string; code?: string };
    const err = new Error(d?.error ?? `请求失败（HTTP ${res.status}）`) as Error & { code?: string };
    err.code = d?.code;
    throw err;
  }
  return data as T;
}
