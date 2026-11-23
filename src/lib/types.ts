// Shared types between server (scraper / AI pipeline) and client (UI).

export interface PriceInfo {
  /** Price as shown on the page, e.g. "$39.99" or "$19.99 - $29.99" */
  display: string;
  amount?: number;
  currency?: string;
  /** Strike-through / list price, e.g. "$59.99" */
  listPrice?: string;
  /** e.g. "-33%" */
  savings?: string;
}

export interface ReviewAspect {
  label: string;
  sentiment: "positive" | "negative" | "mixed" | string;
  mentions?: number;
  /** how many of the mentions match the sentiment */
  sentimentMentions?: number;
  summary?: string;
  snippets: string[];
}

export interface ReviewInsights {
  /** Amazon's own "Customers say" AI summary of all reviews */
  summary?: string;
  aspects: ReviewAspect[];
}

export interface Spec {
  name: string;
  value: string;
}

export interface Variation {
  name: string;
  selected?: string;
  options: string[];
}

export interface ProductData {
  asin: string;
  url: string;
  marketplace: string;
  title: string;
  brand?: string;
  /** raw byline text, e.g. "Visit the Ninja Store" or "James Clear (Author)" */
  byline?: string;
  price?: PriceInfo;
  rating?: number;
  ratingCount?: number;
  /** percentage of reviews per star, index 0 = 5 stars ... index 4 = 1 star */
  ratingHistogram?: number[];
  boughtPastMonth?: string;
  categories: string[];
  bestSellersRank: string[];
  bullets: string[];
  description?: string;
  aplusText?: string;
  specs: Spec[];
  variations: Variation[];
  availability?: string;
  /** "Important information": ingredients, directions, safety notes … */
  importantInfo?: string;
  inTheBox?: string[];
  images: string[];
  reviewInsights?: ReviewInsights;
}

export type ScrapeSource = "direct" | "claude_web" | "manual" | "browser";

export interface ScrapeResult {
  product: ProductData;
  source: ScrapeSource;
  /** human readable explanation of how the data was obtained */
  sourceDetail: string;
  /** cleaned text of the key parts of the page, used as extra LLM context */
  pageDigest: string;
  completeness: { score: number; missing: string[] };
  warnings: string[];
  elapsedMs: number;
}

// ---------- AI outputs ----------
// The authoritative runtime schemas live in src/lib/ai/schemas.ts (zod);
// these are re-exported from there so the client can import plain types.
export type {
  ProductAnalysis,
  VideoScript,
  ReviewReport,
} from "./ai/schemas";
