// Browser side of "API 设置": where the visitor's config is stored and how it is
// attached to requests. Storage access is wrapped because it can throw (private
// windows, blocked site data); the app works without it.
import { useSyncExternalStore } from "react";
import { LLM_HEADERS, type ClientLLMConfig } from "./llm-shared";

const STORAGE_KEY = "apa-llm-config-v1";
const CHANGE_EVENT = "apa-llm-config-change";

export const EMPTY_LLM_CONFIG: ClientLLMConfig = { apiKey: "", baseURL: "", model: "", fallbacks: true, remember: true };

let snapshot: ClientLLMConfig | null = null;

function readStorage(): ClientLLMConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_LLM_CONFIG;
    const v = JSON.parse(raw) as Partial<ClientLLMConfig>;
    return {
      apiKey: typeof v.apiKey === "string" ? v.apiKey : "",
      baseURL: typeof v.baseURL === "string" ? v.baseURL : "",
      model: typeof v.model === "string" ? v.model : "",
      fallbacks: v.fallbacks !== false,
      remember: v.remember !== false,
    };
  } catch {
    return EMPTY_LLM_CONFIG;
  }
}

export function loadLLMConfig(): ClientLLMConfig {
  snapshot ??= readStorage();
  return snapshot;
}

function notify(next: ClientLLMConfig) {
  snapshot = next;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function saveLLMConfig(cfg: ClientLLMConfig) {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    (cfg.remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* storage unavailable: keep it in memory for this page */
  }
  notify(cfg);
}

export function clearLLMConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  notify(EMPTY_LLM_CONFIG);
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      snapshot = null; // changed in another tab
      onChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Saved config; returns the empty config during server rendering and hydration. */
export function useLLMConfig(): ClientLLMConfig {
  return useSyncExternalStore(subscribe, loadLLMConfig, () => EMPTY_LLM_CONFIG);
}

/** Request headers for a config. The base URL is only sent together with a key. */
export function llmHeaders(cfg: ClientLLMConfig = loadLLMConfig()): Record<string, string> {
  const h: Record<string, string> = {};
  if (cfg.apiKey) {
    h[LLM_HEADERS.key] = cfg.apiKey;
    if (cfg.baseURL) h[LLM_HEADERS.baseURL] = cfg.baseURL;
  }
  if (cfg.model) h[LLM_HEADERS.model] = cfg.model;
  if (!cfg.fallbacks) h[LLM_HEADERS.fallbacks] = "off";
  return h;
}

export function maskKey(key: string): string {
  if (!key) return "";
  return key.length <= 12 ? "••••" : `${key.slice(0, 7)}…${key.slice(-4)}`;
}
