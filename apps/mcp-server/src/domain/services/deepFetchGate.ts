/**
 * deepFetchGate.ts — DFR-P2-MCP (Sprint DEEPFETCH-RAG-REDESIGN)
 *
 * Pure domain function: determines whether a news article warrants a
 * deep-fetch (full body extraction) based on three signals:
 *   1. Ticker match  — article mentions a watchlist ticker
 *   2. Sector keyword — title/snippet contains a sector keyword from system-map.json
 *   3. High impact + non-neutral sentiment (impactScore >= 7 AND sentiment != "neutral")
 *
 * Layer: domain — ZERO infrastructure imports. No I/O, no side effects.
 */

import { detectStocksInText } from "./stockAliases.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DeepFetchGateInput {
  /** Article headline / title */
  title: string;
  /** Short summary / snippet */
  snippet: string;
  /** Impact score 0–10 from normalizeNews() */
  impactScore: number;
  /** Sentiment string from sentimentClassifier: "bullish" | "bearish" | "neutral" */
  sentiment: string;
  /** Full article URL */
  sourceUrl: string;
  /** Tickers already extracted by normalizeNews() */
  affectedActions: string[];
  /** Active watchlist ticker codes (uppercase), loaded once per pollNews cycle */
  watchlistTickers: string[];
  /**
   * Sector → keyword-list map derived from system-map.json at startup.
   * Keys are sector names; values are arrays of lowercase keywords.
   * Never hardcoded here — caller provides this from loadSectorKeywordMap().
   */
  sectorKeywords: Map<string, string[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate — pure predicate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when ANY of the three deep-fetch signals fires:
 *
 *   Signal 1 — Ticker match:
 *     detectStocksInText(title+snippet, watchlistTickers).length > 0
 *     OR affectedActions contains a watchlist ticker (case-insensitive)
 *
 *   Signal 2 — Sector keyword:
 *     Lowercase title+snippet contains any keyword from sectorKeywords values
 *
 *   Signal 3 — High impact + non-neutral sentiment:
 *     impactScore >= 7 AND sentiment !== "neutral"
 */
export function shouldDeepFetch(input: DeepFetchGateInput): boolean {
  const {
    title,
    snippet,
    impactScore,
    sentiment,
    affectedActions,
    watchlistTickers,
    sectorKeywords,
  } = input;

  const combinedText = `${title} ${snippet}`;

  // ── Signal 1: ticker match ──────────────────────────────────────────────
  // detectStocksInText uses the domain catalog (stockAliases.ts) — no infra import
  if (watchlistTickers.length > 0) {
    const detected = detectStocksInText(combinedText, watchlistTickers);
    if (detected.length > 0) return true;

    const upperWatchlist = new Set(watchlistTickers.map((t) => t.toUpperCase()));
    if (affectedActions.some((t) => upperWatchlist.has(t.toUpperCase()))) return true;
  }

  // ── Signal 2: sector keyword ────────────────────────────────────────────
  const lowerText = combinedText.toLowerCase();
  for (const keywords of sectorKeywords.values()) {
    for (const kw of keywords) {
      if (lowerText.includes(kw.toLowerCase())) return true;
    }
  }

  // ── Signal 3: high impact + non-neutral sentiment ───────────────────────
  if (impactScore >= 7 && sentiment !== "neutral") return true;

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sector keyword map builder (pure — no I/O, takes parsed JSON as input)
// ─────────────────────────────────────────────────────────────────────────────

export interface WatchlistEntry {
  ticker: string;
  sector: string;
  active?: boolean;
}

/**
 * Builds a sector → keyword[] map from the watchlist entries in system-map.json.
 *
 * Sector names are used as keywords verbatim (lowercased, split on "/" and spaces).
 * Ticker codes are added as keywords so the sector map also catches bare tickers.
 *
 * Called once at startup by the pollNews.ts cycle; result cached and passed to gate.
 */
export function buildSectorKeywordMap(
  watchlist: WatchlistEntry[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const entry of watchlist) {
    if (entry.active === false) continue;
    const sector = entry.sector ?? "";
    if (!map.has(sector)) {
      // Derive keywords: sector parts + ticker code
      const parts = sector
        .split(/[/\s]+/)
        .map((p) => p.trim().toLowerCase())
        .filter((p) => p.length >= 3);
      map.set(sector, [...parts]);
    }
    // Always add the ticker itself as a keyword under its sector
    const existing = map.get(sector)!;
    const ticker = entry.ticker.toLowerCase();
    if (!existing.includes(ticker)) {
      existing.push(ticker);
    }
  }

  return map;
}
