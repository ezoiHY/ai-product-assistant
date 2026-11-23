"use client";

import { ArrowUpRight, Check, CircleCheck, CircleX, Eye, EyeOff, KeyRound, Loader2, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { postJSON } from "@/lib/api-types";
import { clearLLMConfig, llmHeaders, loadLLMConfig, maskKey, saveLLMConfig, useLLMConfig } from "@/lib/llm-config";
import { DEFAULT_MODEL, KNOWN_MODELS, validateApiKey, validateBaseURL, validateModel, type ClientLLMConfig } from "@/lib/llm-shared";
import { ICON_STROKE, IconTile, cx } from "./ui";

export interface ServerStatus {
  ai: boolean;
  model: string;
}

// ---------- small iOS-style primitives ----------

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx("relative h-[31px] w-[51px] shrink-0 cursor-pointer rounded-full transition-colors duration-200", checked ? "bg-tile-green" : "bg-fill-2")}
    >
      <span
        aria-hidden="true"
        className={cx(
          "absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-transform duration-200 ease-[var(--ease-apple)]",
          checked && "translate-x-[20px]",
        )}
      />
    </button>
  );
}

function Group({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-7 last:mb-0">
      {title && <h3 className="mb-1.5 px-4 text-[13px] text-label-2">{title}</h3>}
      <div className="overflow-hidden rounded-[18px] bg-surface">{children}</div>
      {footer && <div className="mt-1.5 px-4 text-[12px] leading-5 text-label-2">{footer}</div>}
    </div>
  );
}

const ROW = "border-t border-separator first:border-t-0";

function FieldError({ id, msg }: { id: string; msg?: string | null }) {
  if (!msg) return null;
  return (
    <p id={id} className="mt-1.5 text-[12px] leading-5 text-danger">
      {msg}
    </p>
  );
}

// ---------- form ----------

const CUSTOM = "custom";

interface FormState {
  apiKey: string;
  baseURL: string;
  modelChoice: string;
  customModel: string;
  fallbacks: boolean;
  remember: boolean;
}

function toForm(saved: ClientLLMConfig, server: ServerStatus | null): FormState {
  const known = KNOWN_MODELS.some((m) => m.id === saved.model);
  const fallbackModel = !saved.apiKey && server && KNOWN_MODELS.some((m) => m.id === server.model) ? server.model : DEFAULT_MODEL;
  return {
    apiKey: saved.apiKey,
    baseURL: saved.baseURL,
    modelChoice: saved.model ? (known ? saved.model : CUSTOM) : fallbackModel,
    customModel: known ? "" : saved.model,
    fallbacks: saved.fallbacks,
    remember: saved.remember,
  };
}

function toConfig(f: FormState): ClientLLMConfig {
  return {
    apiKey: f.apiKey.trim(),
    baseURL: f.apiKey.trim() ? f.baseURL.trim().replace(/\/+$/, "") : "",
    model: f.modelChoice === CUSTOM ? f.customModel.trim() : f.modelChoice,
    fallbacks: f.fallbacks,
    remember: f.remember,
  };
}

function validate(f: FormState): { apiKey?: string; baseURL?: string; model?: string } {
  const key = f.apiKey.trim();
  const base = f.baseURL.trim();
  const errs: { apiKey?: string; baseURL?: string; model?: string } = {};
  const keyErr = validateApiKey(key);
  if (keyErr) errs.apiKey = keyErr;
  const baseErr = validateBaseURL(base);
  if (baseErr) errs.baseURL = baseErr;
  else if (base && !key) errs.baseURL = "填写接口地址时需要同时填写你自己的 API Key（服务器的 Key 不会发往自定义地址）";
  if (f.modelChoice === CUSTOM) {
    const m = f.customModel.trim();
    if (!m) errs.model = "请输入模型名称";
    else if (validateModel(m)) errs.model = validateModel(m)!;
    else if (!key) errs.model = "自定义模型需要使用你自己的 API Key";
  }
  return errs;
}

type TestState = { status: "idle" } | { status: "running" } | { status: "ok"; text: string } | { status: "error"; text: string };

function SettingsForm({ server, onDone }: { server: ServerStatus | null; onDone: () => void }) {
  const saved = useLLMConfig();
  const [form, setForm] = useState<FormState>(() => toForm(loadLLMConfig(), server));
  const [showKey, setShowKey] = useState(false);
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [notice, setNotice] = useState("");
  const ids = { key: useId(), base: useId(), model: useId(), keyErr: useId(), baseErr: useId(), modelErr: useId() };
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setTest({ status: "idle" });
    setNotice("");
  };

  const usingOwnKey = Boolean(form.apiKey.trim());

  const runTest = async () => {
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (!usingOwnKey && !server?.ai) {
      setTest({ status: "error", text: "请先填写 API Key" });
      return;
    }
    setTest({ status: "running" });
    try {
      const r = await postJSON<{ model: string; ms: number; keySource: string }>("/api/config/test", {}, undefined, llmHeaders(toConfig(form)));
      setTest({ status: "ok", text: `连接成功 · ${r.model} · ${(r.ms / 1000).toFixed(1)}s${r.keySource === "server" ? " · 服务器 Key" : ""}` });
    } catch (e) {
      setTest({ status: "error", text: e instanceof Error ? e.message : String(e) });
    }
  };

  const save = (e?: React.FormEvent) => {
    e?.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    saveLLMConfig(toConfig(form));
    onDone();
  };

  const clear = () => {
    clearLLMConfig();
    setForm(toForm(loadLLMConfig(), server));
    setErrors({});
    setTest({ status: "idle" });
    setNotice("已清除保存在此浏览器的配置");
  };

  const status = saved.apiKey
    ? { ok: true, text: `正在使用你的 API Key（${maskKey(saved.apiKey)}）`, model: saved.model || DEFAULT_MODEL }
    : server?.ai
      ? { ok: true, text: "正在使用服务器配置的 API Key", model: saved.model || server.model }
      : { ok: false, text: "还没有可用的 API Key，AI 分析暂不可用", model: "" };

  return (
    <form onSubmit={save} className="flex max-h-[inherit] flex-col">
      {/* iOS sheet navigation bar */}
      <div className="glass sticky top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-center px-4 py-3 shadow-[0_1px_0_var(--separator)]">
        <button type="button" onClick={onDone} className="btn btn-plain justify-self-start px-1 text-[15px] hover:no-underline">
          取消
        </button>
        <h2 id="api-settings-title" className="text-[16px] font-semibold text-label">
          API 设置
        </h2>
        <button type="submit" className="btn btn-plain justify-self-end px-1 text-[15px] font-semibold hover:no-underline">
          保存
        </button>
      </div>

      <div className="min-h-0 overflow-y-auto px-4 pb-6 pt-5 sm:px-5">
        <div className="mb-7 flex items-start gap-3.5 rounded-[18px] bg-surface p-4">
          <IconTile icon={KeyRound} color={status.ok ? "green" : "orange"} />
          <div className="min-w-0">
            <p className="text-[15px] font-medium leading-6 text-label">{status.text}</p>
            {status.model && <p className="num text-[13px] text-label-2">模型 {status.model}</p>}
            {!status.ok && <p className="text-[13px] leading-5 text-label-2">填写你的 Anthropic API Key 后即可使用全部 AI 功能。</p>}
          </div>
        </div>

        <Group
          title="ANTHROPIC API"
          footer={
            <>
              Key 只保存在这个浏览器里。分析时随请求发给本站服务器，仅用于调用 Claude，不会写入数据库或日志。
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center text-link hover:underline">
                创建 Key
                <ArrowUpRight className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              </a>
            </>
          }
        >
          <div className={cx(ROW, "px-4 py-3")}>
            <label htmlFor={ids.key} className="text-[13px] text-label-2">
              API Key
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id={ids.key}
                type={showKey ? "text" : "password"}
                value={form.apiKey}
                onChange={(e) => set("apiKey", e.target.value)}
                placeholder={server?.ai ? "留空则使用服务器的 Key" : "sk-ant-…"}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(errors.apiKey)}
                aria-describedby={errors.apiKey ? ids.keyErr : undefined}
                className="num min-w-0 flex-1 bg-transparent text-[15px] text-label outline-none placeholder:text-label-3"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? "隐藏 Key" : "显示 Key"}
                aria-pressed={showKey}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-label-3 hover:bg-fill hover:text-label-2"
              >
                {showKey ? <EyeOff className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden="true" /> : <Eye className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden="true" />}
              </button>
            </div>
            <FieldError id={ids.keyErr} msg={errors.apiKey} />
          </div>
          <div className={cx(ROW, "px-4 py-3")}>
            <label htmlFor={ids.base} className="text-[13px] text-label-2">
              接口地址 <span className="text-label-3">（可选，用中转服务时填写）</span>
            </label>
            <input
              id={ids.base}
              value={form.baseURL}
              onChange={(e) => set("baseURL", e.target.value)}
              placeholder="https://api.anthropic.com"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(errors.baseURL)}
              aria-describedby={errors.baseURL ? ids.baseErr : undefined}
              className="mt-1 w-full bg-transparent text-[15px] text-label outline-none placeholder:text-label-3"
            />
            <FieldError id={ids.baseErr} msg={errors.baseURL} />
          </div>
        </Group>

        <Group title="模型" footer="价格为每百万 token 的输入 / 输出费用（Anthropic 官方价）。">
          <div role="radiogroup" aria-label="模型">
            {KNOWN_MODELS.map((m) => {
              const on = form.modelChoice === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${m.name}，${m.note}`}
                  onClick={() => set("modelChoice", m.id)}
                  className={cx(ROW, "flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-fill/60")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] text-label">{m.name}</span>
                    <span className="num block text-[12px] text-label-2">
                      {m.note} · {m.price}
                    </span>
                  </span>
                  {on && <Check className="h-[18px] w-[18px] shrink-0 text-link" strokeWidth={2.5} aria-hidden="true" />}
                </button>
              );
            })}
            <div className={cx(ROW, "px-4 py-3")}>
              <button
                type="button"
                role="radio"
                aria-checked={form.modelChoice === CUSTOM}
                aria-label="自定义模型"
                onClick={() => set("modelChoice", CUSTOM)}
                className="flex w-full cursor-pointer items-center gap-3 text-left"
              >
                <span className="flex-1 text-[15px] text-label">自定义模型</span>
                {form.modelChoice === CUSTOM && <Check className="h-[18px] w-[18px] shrink-0 text-link" strokeWidth={2.5} aria-hidden="true" />}
              </button>
              {form.modelChoice === CUSTOM && (
                <>
                  <label htmlFor={ids.model} className="sr-only">
                    自定义模型名称
                  </label>
                  <input
                    id={ids.model}
                    value={form.customModel}
                    onChange={(e) => set("customModel", e.target.value)}
                    placeholder="例如 claude-opus-5"
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus
                    aria-invalid={Boolean(errors.model)}
                    aria-describedby={errors.model ? ids.modelErr : undefined}
                    className="tile mt-2 w-full px-3 py-2 text-[15px] text-label outline-none placeholder:text-label-3"
                  />
                </>
              )}
              <FieldError id={ids.modelErr} msg={errors.model} />
            </div>
          </div>
        </Group>

        <Group title="高级" footer="使用第三方中转时如果报错，可以关闭「拒答回退」再试。关闭「记住」后，Key 只在当前标签页有效。">
          <div className={cx(ROW, "flex items-center justify-between gap-4 px-4 py-2.5")}>
            <span className="text-[15px] text-label">拒答回退（beta）</span>
            <Switch checked={form.fallbacks} onChange={(v) => set("fallbacks", v)} label="拒答回退" />
          </div>
          <div className={cx(ROW, "flex items-center justify-between gap-4 px-4 py-2.5")}>
            <span className="text-[15px] text-label">在此设备上记住</span>
            <Switch checked={form.remember} onChange={(v) => set("remember", v)} label="在此设备上记住" />
          </div>
        </Group>

        <Group>
          <button type="button" onClick={runTest} disabled={test.status === "running"} className="flex w-full cursor-pointer items-center justify-center gap-2 px-4 py-3 text-[15px] font-medium text-link disabled:cursor-wait disabled:opacity-60">
            {test.status === "running" && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />}
            {test.status === "running" ? "正在测试…" : "测试连接"}
          </button>
        </Group>
        <div aria-live="polite" className="-mt-4 mb-6 min-h-5 px-4">
          {test.status === "ok" && (
            <p className="flex items-center gap-1.5 text-[13px] text-success">
              <CircleCheck className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              {test.text}
            </p>
          )}
          {test.status === "error" && (
            <p className="flex items-start gap-1.5 text-[13px] leading-5 text-danger">
              <CircleX className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              {test.text}
            </p>
          )}
          {notice && <p className="text-[13px] text-label-2">{notice}</p>}
        </div>

        {(saved.apiKey || saved.model || saved.baseURL) && (
          <Group>
            <button type="button" onClick={clear} className="flex w-full cursor-pointer items-center justify-center gap-2 px-4 py-3 text-[15px] text-danger">
              <Trash2 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden="true" />
              清除保存的配置
            </button>
          </Group>
        )}
      </div>
    </form>
  );
}

export function ApiSettingsSheet({ open, onClose, server }: { open: boolean; onClose: () => void; server: ServerStatus | null }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="api-settings-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
      className="sheet"
    >
      {open && <SettingsForm server={server} onDone={onClose} />}
    </dialog>
  );
}
