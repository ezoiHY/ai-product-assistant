// Turn whatever the user pasted (full link, short link, bare ASIN) into
// { asin, domain, canonicalUrl }. No product-specific logic here.

export interface MarketplaceInfo {
  currency: string;
  /** native locale of the marketplace */
  locale: string;
  acceptLanguage: string;
  /** English locale the marketplace supports (?language=…), so pages parse the same everywhere */
  en?: string;
}

export const MARKETPLACES: Record<string, MarketplaceInfo> = {
  "amazon.com": { currency: "USD", locale: "en_US", acceptLanguage: "en-US,en;q=0.9", en: "en_US" },
  "amazon.ca": { currency: "CAD", locale: "en_CA", acceptLanguage: "en-CA,en;q=0.9", en: "en_CA" },
  "amazon.com.mx": { currency: "MXN", locale: "es_MX", acceptLanguage: "es-MX,es;q=0.9,en;q=0.8", en: "en_US" },
  "amazon.com.br": { currency: "BRL", locale: "pt_BR", acceptLanguage: "pt-BR,pt;q=0.9,en;q=0.8" },
  "amazon.co.uk": { currency: "GBP", locale: "en_GB", acceptLanguage: "en-GB,en;q=0.9", en: "en_GB" },
  "amazon.de": { currency: "EUR", locale: "de_DE", acceptLanguage: "de-DE,de;q=0.9,en;q=0.8", en: "en_GB" },
  "amazon.fr": { currency: "EUR", locale: "fr_FR", acceptLanguage: "fr-FR,fr;q=0.9,en;q=0.8", en: "en_GB" },
  "amazon.it": { currency: "EUR", locale: "it_IT", acceptLanguage: "it-IT,it;q=0.9,en;q=0.8", en: "en_GB" },
  "amazon.es": { currency: "EUR", locale: "es_ES", acceptLanguage: "es-ES,es;q=0.9,en;q=0.8", en: "en_GB" },
  "amazon.nl": { currency: "EUR", locale: "nl_NL", acceptLanguage: "nl-NL,nl;q=0.9,en;q=0.8", en: "en_GB" },
  "amazon.com.be": { currency: "EUR", locale: "fr_BE", acceptLanguage: "fr-BE,fr;q=0.9,en;q=0.8", en: "en_GB" },
  "amazon.se": { currency: "SEK", locale: "sv_SE", acceptLanguage: "sv-SE,sv;q=0.9,en;q=0.8", en: "en_GB" },
  "amazon.pl": { currency: "PLN", locale: "pl_PL", acceptLanguage: "pl-PL,pl;q=0.9,en;q=0.8", en: "en_GB" },
  "amazon.com.tr": { currency: "TRY", locale: "tr_TR", acceptLanguage: "tr-TR,tr;q=0.9,en;q=0.8" },
  "amazon.ae": { currency: "AED", locale: "en_AE", acceptLanguage: "en-AE,en;q=0.9", en: "en_AE" },
  "amazon.sa": { currency: "SAR", locale: "en_AE", acceptLanguage: "en,ar;q=0.8", en: "en_AE" },
  "amazon.eg": { currency: "EGP", locale: "en_AE", acceptLanguage: "en,ar;q=0.8", en: "en_AE" },
  "amazon.in": { currency: "INR", locale: "en_IN", acceptLanguage: "en-IN,en;q=0.9", en: "en_IN" },
  "amazon.co.jp": { currency: "JPY", locale: "ja_JP", acceptLanguage: "ja-JP,ja;q=0.9,en;q=0.8", en: "en_US" },
  "amazon.sg": { currency: "SGD", locale: "en_SG", acceptLanguage: "en-SG,en;q=0.9", en: "en_SG" },
  "amazon.com.au": { currency: "AUD", locale: "en_AU", acceptLanguage: "en-AU,en;q=0.9", en: "en_AU" },
};

const SHORT_LINK_HOSTS = new Set(["a.co", "amzn.to", "amzn.eu", "amzn.asia", "amzn.com"]);

const ASIN_RE = /^[A-Z0-9]{10}$/;
// /dp/ASIN, /gp/product/ASIN, /gp/aw/d/ASIN, /product/ASIN, /exec/obidos/ASIN/ASIN, /o/ASIN, /gp/offer-listing/ASIN
const PATH_ASIN_RE =
  /\/(?:dp|gp\/product|gp\/aw\/d|gp\/offer-listing|product|exec\/obidos\/(?:asin|ASIN)|o\/(?:asin|ASIN))\/(?:product\/)?([A-Za-z0-9]{10})(?=[/?#&]|$)/;

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

export interface ParsedAmazonUrl {
  asin: string;
  domain: string;
  canonicalUrl: string;
}

function normalizeDomain(host: string): string | null {
  const h = host.toLowerCase().replace(/^(www|smile|m|www2)\./, "");
  return MARKETPLACES[h] ? h : null;
}

export function extractAsinFromPath(pathAndQuery: string): string | null {
  const decoded = safeDecode(pathAndQuery);
  const m = decoded.match(PATH_ASIN_RE);
  if (m && ASIN_RE.test(m[1].toUpperCase())) return m[1].toUpperCase();
  const q = decoded.match(/[?&](?:asin|ASIN|pd_rd_i)=([A-Za-z0-9]{10})(?=&|$)/);
  if (q) return q[1].toUpperCase();
  // Last resort: any path segment that looks like a modern ASIN (B0xxxxxxxx)
  for (const seg of decoded.split(/[/?&#=]/)) {
    if (/^B0[A-Z0-9]{8}$/i.test(seg)) return seg.toUpperCase();
  }
  return null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function build(asin: string, domain: string): ParsedAmazonUrl {
  return { asin, domain, canonicalUrl: `https://www.${domain}/dp/${asin}` };
}

/** Follow redirects of a short link (a.co / amzn.to) without downloading pages. */
async function resolveShortLink(url: string): Promise<string> {
  let current = url;
  for (let i = 0; i < 6; i++) {
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ProductAssistant/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString();
      const host = new URL(current).hostname;
      if (normalizeDomain(host)) return current;
      continue;
    }
    return current;
  }
  return current;
}

export async function parseAmazonInput(input: string): Promise<ParsedAmazonUrl> {
  const raw = input.trim();
  if (!raw) throw new InputError("请粘贴一个 Amazon 商品链接");

  // Bare ASIN, e.g. "B0CXT9RSGQ"
  if (ASIN_RE.test(raw.toUpperCase()) && !raw.includes(".")) {
    return build(raw.toUpperCase(), "amazon.com");
  }

  // Find the first URL-looking token (users often paste "title + link" from share sheets)
  const urlMatch = raw.match(/https?:\/\/[^\s<>"']+/i) ?? raw.match(/(?:www\.)?(?:amazon\.[a-z.]+|a\.co|amzn\.[a-z]+)\/[^\s<>"']*/i);
  if (!urlMatch) throw new InputError("没有识别到链接，请粘贴完整的 Amazon 商品链接（如 https://www.amazon.com/dp/B0XXXXXXXX）");
  let urlStr = urlMatch[0];
  if (!/^https?:\/\//i.test(urlStr)) urlStr = "https://" + urlStr;

  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new InputError("链接格式不正确");
  }

  let host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (SHORT_LINK_HOSTS.has(host)) {
    // amzn.com/B0XXXX style needs no network
    const direct = host === "amzn.com" ? extractAsinFromPath(url.pathname) : null;
    if (direct) return build(direct, "amazon.com");
    try {
      url = new URL(await resolveShortLink(url.toString()));
      host = url.hostname.toLowerCase();
    } catch {
      throw new InputError("短链接解析失败，请在浏览器打开后复制完整的商品页链接");
    }
  }

  const domain = normalizeDomain(host);
  if (!domain) {
    throw new InputError(`“${host}” 不是支持的 Amazon 站点链接`);
  }
  const asin = extractAsinFromPath(url.pathname + url.search);
  if (!asin) {
    throw new InputError("这个链接里没有找到商品编号（ASIN），请打开具体的商品详情页再复制链接");
  }
  return build(asin, domain);
}
