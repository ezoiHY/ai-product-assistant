// Fetch an Amazon product page the way a normal browser would, and detect the
// common failure pages (CAPTCHA / robot check / 404 dog page).
//
// Amazon decides mostly by IP, and a cloud server's IP is shared with many other
// programs, so a block can't be undone from here. What we can do is not make it
// worse, so requests stay sparse:
//  - One request per lookup. A CAPTCHA or robot page ends it: asking again from
//    the same IP seconds later only deepens the flag (a retry once turned a 503
//    into two CAPTCHAs). Only a timeout, or a 404 that a second URL form should
//    confirm, gets one more try.
//  - After a block, no direct requests to that marketplace for 2 minutes,
//    doubling on repeated blocks up to 15; the visitor is pointed to 浏览器带回.
//  - Requests to one marketplace start at least 3 seconds apart.
// This state lives in memory, so it holds per server instance.
// Deliberately no CAPTCHA solving and no proxy rotation.

import { MARKETPLACES } from "./url";

export type PageVerdict = "ok" | "captcha" | "not_found" | "blocked";

export interface AttemptLog {
  url: string;
  status?: number;
  verdict: PageVerdict | "network_error";
  ms: number;
}

/** "cooldown" (paused after a recent block) and "busy" (too many lookups queued) never contacted Amazon. */
export type FailReason = "captcha" | "blocked" | "not_found" | "network" | "cooldown" | "busy";

export type FetchOutcome =
  | { ok: true; html: string; attempts: AttemptLog[] }
  | {
      ok: false;
      reason: FailReason;
      attempts: AttemptLog[];
      /** how much longer direct requests to this marketplace stay paused */
      pausedMs?: number;
    };

interface BrowserProfile {
  ua: string;
  secChUa?: string;
  platform?: string;
}

const PROFILE: BrowserProfile = {
  ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  secChUa: '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
  platform: '"macOS"',
};

export function classifyPage(html: string, status: number): PageVerdict {
  if (/id="productTitle"/.test(html) || (/id="dp-container"/.test(html) && html.length > 60_000)) return "ok";
  if (
    /validateCaptcha|Type the characters you see in this image|Enter the characters you see below|Click the button below to continue shopping|To continue shopping, please/i.test(
      html,
    )
  )
    return "captcha";
  if (status === 404 || /Sorry! We couldn't find that page|<title>\s*Page Not Found/i.test(html)) return "not_found";
  return "blocked";
}

function buildHeaders(profile: BrowserProfile, domain: string, cookie: string): Record<string, string> {
  const mk = MARKETPLACES[domain];
  const h: Record<string, string> = {
    "User-Agent": profile.ua,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": mk?.acceptLanguage ?? "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    Cookie: cookie,
  };
  if (profile.secChUa) {
    h["sec-ch-ua"] = profile.secChUa;
    h["sec-ch-ua-mobile"] = "?0";
    h["sec-ch-ua-platform"] = profile.platform ?? '"macOS"';
  }
  return h;
}

function mergeCookies(base: string, setCookies: string[]): string {
  const jar = new Map<string, string>();
  for (const part of base.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) jar.set(k, v.join("="));
  }
  for (const sc of setCookies) {
    const first = sc.split(";")[0];
    const [k, ...v] = first.trim().split("=");
    if (k && v.length) jar.set(k, v.join("="));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Session cookies from pages Amazon served normally, kept per marketplace for the
// life of this server instance, so consecutive requests look like one returning
// browser rather than a stream of brand-new visitors. A block drops them, so a
// flagged session isn't carried past the pause.
const SESSION_TTL_MS = 30 * 60_000;
const sessions = new Map<string, { cookie: string; exp: number }>();

function sessionCookie(domain: string, base: string): string {
  const s = sessions.get(domain);
  if (!s || Date.now() > s.exp) return base;
  return mergeCookies(base, s.cookie.split("; "));
}

// ---------- pacing, per marketplace ----------

const MIN_GAP_MS = 3000;
const MAX_QUEUE_MS = 9000; // more than ~3 lookups waiting: answer "busy" instead of queueing
const PAUSE_STEPS_MS = [2, 4, 8, 15].map((m) => m * 60_000);
const STRIKES_FORGOTTEN_MS = 30 * 60_000; // a block this long after the last pause starts over at 2 min

interface Pace {
  nextSlot: number;
  pausedUntil: number;
  strikes: number;
}
const paces = new Map<string, Pace>();

function paceFor(domain: string): Pace {
  let p = paces.get(domain);
  if (!p) paces.set(domain, (p = { nextSlot: 0, pausedUntil: 0, strikes: 0 }));
  return p;
}

function noteBlocked(p: Pace, domain: string): void {
  const now = Date.now();
  if (now < p.pausedUntil) return; // a parallel lookup was blocked a moment ago: same strike
  if (now - p.pausedUntil > STRIKES_FORGOTTEN_MS) p.strikes = 0;
  p.strikes++;
  p.pausedUntil = now + PAUSE_STEPS_MS[Math.min(p.strikes, PAUSE_STEPS_MS.length) - 1];
  sessions.delete(domain);
}

/** Claim the next start time for a request: ms to wait, or -1 when the queue is full. */
function claimSlot(p: Pace): number {
  const now = Date.now();
  const at = Math.max(now, p.nextSlot);
  if (at - now > MAX_QUEUE_MS) return -1;
  p.nextSlot = at + MIN_GAP_MS;
  return at - now;
}

export async function fetchProductPage(asin: string, domain: string, budgetMs = 25_000): Promise<FetchOutcome> {
  const started = Date.now();
  const pace = paceFor(domain);
  const attempts: AttemptLog[] = [];
  const paused = (): FetchOutcome | null => {
    const ms = pace.pausedUntil - Date.now();
    return ms > 0 ? { ok: false, reason: "cooldown", attempts, pausedMs: ms } : null;
  };
  const pausedAtStart = paused();
  if (pausedAtStart) return pausedAtStart;

  const mk = MARKETPLACES[domain];
  // Ask for English where the marketplace supports it; otherwise Amazon may
  // auto-translate the page based on the server's IP location.
  const lang = mk?.en ?? mk?.locale ?? "en_US";
  let cookie = sessionCookie(domain, `i18n-prefs=${mk?.currency ?? "USD"}; lc-main=${lang}`);
  // The second URL form is only for one more try after a timeout, or to confirm a 404.
  const variants = [`https://www.${domain}/dp/${asin}?language=${lang}`, `https://www.${domain}/gp/product/${asin}?language=${lang}`];

  for (const url of variants) {
    if (attempts.length) await sleep(1500 + Math.random() * 1000);
    const wait = claimSlot(pace);
    if (wait < 0) {
      if (attempts.length) break;
      return { ok: false, reason: "busy", attempts };
    }
    if (wait > 0) await sleep(wait);
    const blockedMeanwhile = paused(); // a parallel lookup may have been blocked while this one waited
    if (blockedMeanwhile) return blockedMeanwhile;
    const remaining = budgetMs - (Date.now() - started);
    if (remaining < 3000) break;
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        headers: buildHeaders(PROFILE, domain, cookie),
        redirect: "follow",
        signal: AbortSignal.timeout(Math.min(12_000, remaining)),
        cache: "no-store",
      });
      const html = await res.text();
      const verdict = classifyPage(html, res.status);
      attempts.push({ url, status: res.status, verdict, ms: Date.now() - t0 });
      if (verdict === "captcha" || verdict === "blocked") {
        noteBlocked(pace, domain);
        return { ok: false, reason: verdict, attempts, pausedMs: Math.max(0, pace.pausedUntil - Date.now()) };
      }
      cookie = mergeCookies(cookie, res.headers.getSetCookie?.() ?? []);
      if (verdict === "ok") {
        sessions.set(domain, { cookie, exp: Date.now() + SESSION_TTL_MS });
        pace.strikes = 0;
        return { ok: true, html, attempts };
      }
      // not_found: take one look at the other URL form before believing it
    } catch {
      attempts.push({ url, verdict: "network_error", ms: Date.now() - t0 });
    }
  }
  return { ok: false, reason: attempts.some((a) => a.verdict === "not_found") ? "not_found" : "network", attempts };
}
