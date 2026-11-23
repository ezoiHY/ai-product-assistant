// Fetch an Amazon product page the way a normal browser would, detect the
// common failure pages (CAPTCHA / robot check / 404 dog page) and retry a couple
// of times like a returning visitor (same browser, keeping session cookies).
// Deliberately no CAPTCHA solving, no proxy rotation: when Amazon blocks us we
// fall back to Claude's web tools or the user's pasted page text instead.

import { MARKETPLACES } from "./url";

export type PageVerdict = "ok" | "captcha" | "not_found" | "blocked";

export interface AttemptLog {
  url: string;
  status?: number;
  verdict: PageVerdict | "network_error";
  ms: number;
}

export type FetchOutcome =
  | { ok: true; html: string; attempts: AttemptLog[] }
  | { ok: false; reason: "captcha" | "blocked" | "not_found" | "network"; attempts: AttemptLog[] };

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

export async function fetchProductPage(asin: string, domain: string, budgetMs = 25_000): Promise<FetchOutcome> {
  const started = Date.now();
  const mk = MARKETPLACES[domain];
  // Ask for English where the marketplace supports it; otherwise Amazon may
  // auto-translate the page based on the server's IP location.
  const lang = mk?.en ?? mk?.locale ?? "en_US";
  let cookie = `i18n-prefs=${mk?.currency ?? "USD"}; lc-main=${lang}`;
  const variants = [
    `https://www.${domain}/dp/${asin}?language=${lang}`,
    `https://www.${domain}/dp/${asin}?th=1&psc=1&language=${lang}`,
    `https://www.${domain}/gp/product/${asin}?language=${lang}`,
  ];
  const attempts: AttemptLog[] = [];
  let notFoundCount = 0;

  for (let i = 0; i < variants.length; i++) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining < 3000) break;
    const url = variants[i];
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
      if (verdict === "ok") return { ok: true, html, attempts };
      // keep the session cookies Amazon hands out; a returning "browser" is less suspicious
      cookie = mergeCookies(cookie, res.headers.getSetCookie?.() ?? []);
      if (verdict === "not_found") {
        notFoundCount++;
        if (notFoundCount >= 2) break; // two different URL variants agree: the product page is gone
      }
    } catch {
      attempts.push({ url, verdict: "network_error", ms: Date.now() - t0 });
    }
    await sleep(800 + Math.random() * 700);
  }

  const verdicts = attempts.map((a) => a.verdict);
  const reason = verdicts.includes("not_found") && !verdicts.includes("ok") && notFoundCount >= 2
    ? "not_found"
    : verdicts.includes("captcha")
      ? "captcha"
      : verdicts.every((v) => v === "network_error")
        ? "network"
        : verdicts.includes("not_found") ? "not_found" : "blocked";
  return { ok: false, reason, attempts };
}
