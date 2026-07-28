/**
 * Morning Briefing — shared public output types.
 *
 * <!-- size-justification: 172L — pure type declarations (12 interfaces), no
 * logic; not one of the 19 numbered "step modules" the <=120L step budget
 * targets (FACTORY-APP-split-assembleBriefing DoD) — this is the one
 * legitimately shared cross-step contract file (every other SQLite row type
 * moved to single-owner query-module co-location per the DoD). Splitting
 * further would fragment the DailyBriefing output contract across files
 * with no maintainability benefit. -->
 *
 * These shapes are consumed by multiple step modules under usecases/briefing/
 * AND re-assembled into DailyBriefing by assembleBriefing.ts. Per-query
 * internal SQLite row types (RagRow, AlertRow, WatchlistRow, ...) are NOT
 * here — they live alongside the one query module that owns them
 * (FACTORY-APP-split-assembleBriefing).
 *
 * Re-exported verbatim from assembleBriefing.ts for backward compatibility —
 * every existing `import type { X } from ".../assembleBriefing.js"` call
 * site continues to resolve unchanged.
 *
 * Layer: application/usecases/briefing — pure types, no imports.
 */

/** Global market snapshot from commodity_prices table (VIX, DXY, S&P500, Hang Seng). */
export interface GlobalSnapshot {
  vix: number;
  dxy: number;
  sp500: number;
  hangSeng: number;
  fetchedAt: string;
  /** Previous row's VIX — for delta arrow display. */
  prevVix?: number;
  /** Previous row's DXY — for delta arrow display. */
  prevDxy?: number;
  /** Previous row's S&P500 — for delta arrow display. */
  prevSp500?: number;
  /** Previous row's Hang Seng — for delta arrow display. */
  prevHangSeng?: number;
}

/** One top story from rag_analyses. */
export interface TopStory {
  title: string;
  level: string;
  sentiment: string;
  impactScore: number;
}

/** A condensed alert entry for the briefing. */
export interface BriefingAlert {
  severity: string;
  message: string;
  /** Stock codes affected by this alert */
  stocks: string[];
}

/** One watchlist entry for the briefing. */
export interface WatchlistEntry {
  code: string;
  domain: string;
  /** Current price in VND, if available */
  price?: number;
  /** Percentage change from previous close, if available */
  changePct?: number;
  /**
   * 5-character ASCII sparkline of the last 5 trading days.
   * Uses Unicode block characters ▁▂▃▄▅▆▇█ (low → high).
   * "—" when fewer than 2 historical data points are available.
   */
  sparkline?: string;
}

/** One new financial report since midnight. */
export interface NewReport {
  code: string;
  period: string;
}

/** VN-Index snapshot. */
export interface VnIndexSnapshot {
  price: number;
  /** Absolute point change from previous close (Math.round(price - previousPrice)). */
  change?: number;
  changePct: number;
  /** ISO 8601 timestamp when the price was fetched (from market_prices.fetched_at or hose fetch). Absent on legacy snapshots. */
  fetchedAt?: string;
}

/** Insider transaction row for the briefing enrichment (Step 14). */
export interface InsiderBriefingRow {
  /** Stock ticker, e.g. "VCB" */
  code: string;
  /** "buy" | "sell" | "other" */
  type: string;
  /** executed_volume from insider_transactions */
  executedVolume: number;
  /** insider_name from insider_transactions */
  insiderName: string;
  /** from_date (YYYY-MM-DD) from insider_transactions */
  fromDate: string;
}

/** Foreign flow row for the briefing enrichment (Step 15). */
export interface ForeignFlowBriefingRow {
  /** Stock ticker */
  code: string;
  /** "net_buy" | "net_sell" */
  direction: "net_buy" | "net_sell";
  /** foreign_volume for the queried date (raw signed value, abs in display) */
  foreignVolume: number;
  /** Date of the data point (YYYY-MM-DD, derived from fetched_at) */
  date: string;
}

/** TA signal for one watchlist ticker (Step 17). */
export interface TaSignal {
  /** Stock ticker, e.g. "VCB" */
  code: string;
  /** RSI(14) value, or null when fewer than 8 candles available (adaptive RSI period) */
  rsi14: number | null;
  /** RSI classification: strict > 70 = overbought, < 30 = oversold, else neutral */
  rsiStatus: "overbought" | "oversold" | "neutral";
  /** SMA20 value, or null when fewer than 8 candles available (adaptive MA period) */
  ma20: number | null;
  /** Price position relative to MA20: "above" | "below" | "neutral" (when ma20 null or equal) */
  priceVsMa20: "above" | "below" | "neutral";
  /** Last known price (last candle close), or null when no data */
  currentPrice: number | null;
}

/** One BCTC deadline row for watchlist stocks with SAP_DEN or QUA_HAN status. */
export interface BctcDeadlineRow {
  /** Watchlist ticker */
  code: string;
  /** Sector domain — drives extended deadline for banking/insurance */
  domain: string;
  /** Quarter number from DeadlineInfo.quarter */
  quarter: 1 | 2 | 3 | 4;
  /** Fiscal year from DeadlineInfo.year */
  year: number;
  /** ISO date string YYYY-MM-DD of statutory deadline */
  deadline: string;
  /** Negative = overdue; 0–14 = imminent */
  daysUntilDeadline: number;
  status: "SAP_DEN" | "QUA_HAN";
}

/** Evidence score row for the briefing enrichment (Step 16). */
export interface EvidenceScoreBriefingRow {
  /** Stock ticker */
  code: string;
  /** bullish_score - bearish_score */
  netScore: number;
  /** Raw bullish_score */
  bullishScore: number;
  /** Raw bearish_score */
  bearishScore: number;
  /** fragment_count for this score row */
  fragmentCount: number;
  /** score_date (YYYY-MM-DD) */
  scoreDate: string;
}

/** Macro indicator status for the briefing dashboard. */
export interface MacroIndicator {
  name: string;
  value: number;
  unit: string;
  /** σ-based status (e.g., "bình thường", "cao bất thường +2.3σ") */
  status: string;
}

/** Top conviction signal shape — cross-validated strongest signal for today. */
export interface TopConviction {
  code: string;
  score: number;
  direction: string;
  summary: string;
}
