/**
 * Assemble Morning Briefing — Task 101 (Application Layer)
 *
 * Orchestrates a complete daily digest before Vietnamese market open (08:00 GMT+7):
 *   1. Best-effort pollNews() — fresh data, failure does not abort
 *   2. Best-effort fetchVnIndex() — VN-Index snapshot, null on failure
 *   3. Query rag_analyses for top 5 stories since midnight GMT+7
 *   4. Query alerts for unread alerts from the last 12 hours
 *   5. Query watchlist for tracked stocks (with market_prices join)
 *   6. Query financial_reports for new reports since midnight GMT+7
 *   7. Persist briefing to ./data/briefings/YYYY-MM-DD.json
 *   8. Return the structured DailyBriefing object
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../../infrastructure/logger.js";
import type { BriefingPredictionSignal } from "../../infrastructure/db/predictionStore.js";
import { generateSparkline } from "../../domain/services/sparkline.js";
import {
  computePortfolioPnl,
  type PortfolioPnlResult,
} from "../../domain/services/portfolioPnlCalculator.js";
import {
  computeRSI,
  computeMA,
} from "../../domain/services/technicalIndicators.js";

// ─────────────────────────────────────────────────────────────────────────────
// Named constants
// ─────────────────────────────────────────────────────────────────────────────

/** Net bearish weight threshold below which a stock is flagged as a bearish warning. */
export const BEARISH_WARNING_THRESHOLD = -2.0;

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

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
  changePct: number;
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
  /** RSI(14) value, or null when fewer than 15 candles available */
  rsi14: number | null;
  /** RSI classification: strict > 70 = overbought, < 30 = oversold, else neutral */
  rsiStatus: "overbought" | "oversold" | "neutral";
  /** SMA20 value, or null when fewer than 20 candles available */
  ma20: number | null;
  /** Price position relative to MA20: "above" | "below" | "neutral" (when ma20 null or equal) */
  priceVsMa20: "above" | "below" | "neutral";
  /** Last known price (last candle close), or null when no data */
  currentPrice: number | null;
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

/**
 * Structured daily market digest.
 *
 * Produced by `assembleBriefing()` and persisted to
 * `./data/briefings/YYYY-MM-DD.json` (overwrites on re-run).
 */
export interface DailyBriefing {
  /** Date of the briefing in Vietnam timezone, YYYY-MM-DD */
  date: string;
  /** VN-Index snapshot; undefined if fetch failed */
  vnIndex?: VnIndexSnapshot;
  /** Top 5 stories from rag_analyses since midnight, sorted by impact_score DESC */
  topStories: TopStory[];
  /** Unread alerts from the last 12 hours */
  alerts: BriefingAlert[];
  /** All watchlist stocks with last-known price */
  watchlistSummary: WatchlistEntry[];
  /** Stock codes with new financial_reports since midnight */
  newReports: NewReport[];
  /** Macro dashboard: key indicators with σ-based status */
  macroSnapshot: MacroIndicator[];
  /** Sensitive dates / upcoming events affecting the market */
  sensitiveWarnings: string[];
  /** Auto-tracked commodity indicators discovered from news */
  trackedCommodities: { indicator: string; value: number; unit: string; dataPoints: number }[];
  /** Unresolved HIGH/CRITICAL alerts from previous session (not yet read) */
  unresolvedAlerts: BriefingAlert[];
  /** Top conviction signal — cross-validated strongest signal for today */
  topConviction: { code: string; score: number; direction: string; summary: string } | null;
  /** HIGH/CRITICAL prediction market signals from the last 24h (crowd-sourced early warnings) */
  predictionSignals: BriefingPredictionSignal[];
  /**
   * Portfolio P&L snapshot — per-position and aggregate unrealized P&L.
   * null when the positions table is empty or no open positions exist.
   * Absent (undefined) on briefings generated before task 209.
   */
  portfolioPnl?: PortfolioPnlResult | null;
  /** Insider transactions fetched_at in the last 24h, up to 3, for watchlist stocks */
  insiderRecent?: InsiderBriefingRow[];
  /** Foreign flow summary for the previous trading day, watchlist stocks only */
  foreignFlowSummary?: ForeignFlowBriefingRow[];
  /** Top evidence scores (bullish leaders + bearish warnings), latest score_date per stock */
  evidenceTopScores?: EvidenceScoreBriefingRow[];
  /** TA signals for watchlist tickers with at least one non-neutral signal */
  taSummary?: TaSignal[];
  /** ISO 8601 timestamp when this briefing was generated */
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Injectable options
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Injectable dependencies for testability.
 *
 * @param db              - SQLite Database (defaults to getDb())
 * @param pollNewsFn      - Override for pollNews (best-effort, errors are caught)
 * @param fetchVnIndexFn  - Override for VN-Index fetch (best-effort, errors are caught)
 * @param briefingsDir    - Override output directory (defaults to ./data/briefings)
 */
export interface AssembleBriefingOptions {
  db?: Database;
  pollNewsFn?: () => Promise<unknown>;
  fetchVnIndexFn?: () => Promise<VnIndexSnapshot | null>;
  briefingsDir?: string;
  /**
   * Override TA computation per ticker for test injection.
   * Receives the ticker code and the active DB.
   * Returns null when data is insufficient (< 15 candles).
   */
  computeTaFn?: (code: string, db: Database) => TaSignal | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SQLite row types (internal)
// ─────────────────────────────────────────────────────────────────────────────

interface RagRow {
  source_title: string | null;
  level: string;
  sentiment: string | null;
  impact_score: number | null;
}

interface AlertRow {
  severity: string;
  message: string | null;
  affected_actions_json: string | null;
}

interface WatchlistRow {
  code: string;
  domain: string;
  price: number | null;
  change_pct: number | null;
}

interface FinancialReportRow {
  action_code: string;
  period_type: string | null;
  period_year: number | null;
}

interface PriceHistoryRow {
  price: number;
}

interface InsiderTransactionRow {
  code: string;
  type: string;
  executed_volume: number;
  insider_name: string;
  from_date: string;
}

interface VnstatsRow {
  code: string;
  date: string;
  foreign_volume: number;
}

interface EvidenceScoreRow {
  code: string;
  score_date: string;
  bullish_score: number;
  bearish_score: number;
  fragment_count: number;
}

interface OpenPositionRow {
  code: string;
  shares: number;
  avg_price: number;
}

/** Internal: one daily price row — day TEXT, close_price REAL. */
interface CandleRow {
  day: string;
  close_price: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns midnight today in Vietnam timezone (UTC+7) as an ISO 8601 string
 * (in UTC, so e.g. "2026-03-27T17:00:00.000Z" for Vietnam date 2026-03-28).
 */
function midnightVietnamAsUtc(): string {
  const now = new Date();
  // Shift to Vietnam clock
  const vnNow = new Date(now.getTime() + 7 * 3600_000);
  // Construct midnight in Vietnam as UTC
  const midnight = new Date(
    Date.UTC(
      vnNow.getUTCFullYear(),
      vnNow.getUTCMonth(),
      vnNow.getUTCDate(),
      0,
      0,
      0,
      0,
    ) -
      7 * 3600_000,
  );
  return midnight.toISOString();
}

/**
 * Returns today's date in Vietnam timezone as a YYYY-MM-DD string.
 */
function todayVietnam(): string {
  const vnNow = new Date(new Date().getTime() + 7 * 3600_000);
  const y = vnNow.getUTCFullYear();
  const m = String(vnNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vnNow.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Query insider_transactions for watchlist stocks active in the last 24h.
 * Returns at most 3 rows ordered by executed_volume DESC.
 * Returns [] when watchlist is empty or no rows match.
 */
function queryInsiderRecent(
  db: Database,
  watchlistCodes: string[],
): InsiderBriefingRow[] {
  if (watchlistCodes.length === 0) return [];
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
  const placeholders = watchlistCodes.map(() => "?").join(", ");
  const rows = db
    .prepare<InsiderTransactionRow, (string | number)[]>(`
      SELECT code, type, executed_volume, insider_name, from_date
      FROM insider_transactions
      WHERE fetched_at >= ?
        AND code IN (${placeholders})
      ORDER BY executed_volume DESC
      LIMIT 3
    `)
    .all(since24h, ...watchlistCodes);
  return rows.map((r) => ({
    code: r.code,
    type: r.type,
    executedVolume: r.executed_volume,
    insiderName: r.insider_name,
    fromDate: r.from_date,
  }));
}

/**
 * Query vnstock_trading_stats for the most-recent foreign_volume per watchlist stock.
 * Returns top 3 net-buy + top 3 net-sell rows (up to 6 total).
 * Excludes rows where foreign_volume = 0 or NULL.
 * Returns [] when watchlist is empty or no qualifying rows exist.
 */
function queryForeignFlowSummary(
  db: Database,
  watchlistCodes: string[],
): ForeignFlowBriefingRow[] {
  if (watchlistCodes.length === 0) return [];
  const placeholders = watchlistCodes.map(() => "?").join(", ");
  const rows = db
    .prepare<VnstatsRow, (string | number)[]>(`
      SELECT code,
             substr(fetched_at, 1, 10) AS date,
             foreign_volume
      FROM vnstock_trading_stats
      WHERE code IN (${placeholders})
        AND foreign_volume IS NOT NULL
        AND foreign_volume != 0
        AND (code, fetched_at) IN (
              SELECT code, MAX(fetched_at)
              FROM vnstock_trading_stats
              WHERE code IN (${placeholders})
              GROUP BY code
            )
      ORDER BY foreign_volume DESC
    `)
    .all(...watchlistCodes, ...watchlistCodes);

  const netBuyRows = rows
    .filter((r) => r.foreign_volume > 0)
    .slice(0, 3)
    .map((r): ForeignFlowBriefingRow => ({
      code: r.code,
      direction: "net_buy",
      foreignVolume: r.foreign_volume,
      date: r.date,
    }));

  // rows is ordered DESC so most-negative values are at the end
  const netSellRows = rows
    .filter((r) => r.foreign_volume < 0)
    .slice(-3)
    .map((r): ForeignFlowBriefingRow => ({
      code: r.code,
      direction: "net_sell",
      foreignVolume: r.foreign_volume,
      date: r.date,
    }));

  return [...netBuyRows, ...netSellRows];
}

/**
 * Query evidence_scores for the most-recent score per watchlist stock.
 * Returns top 3 bullish leaders (netScore > 0, fragment_count >= 1) +
 * all bearish warnings (netScore < BEARISH_WARNING_THRESHOLD, fragment_count >= 1).
 * Deduplicates: bearish takes priority if a stock qualifies for both.
 * Returns [] when watchlist is empty or no qualifying rows exist.
 */
function queryEvidenceTopScores(
  db: Database,
  watchlistCodes: string[],
): EvidenceScoreBriefingRow[] {
  if (watchlistCodes.length === 0) return [];
  const placeholders = watchlistCodes.map(() => "?").join(", ");
  const rows = db
    .prepare<EvidenceScoreRow, (string | number)[]>(`
      SELECT stock AS code,
             score_date,
             bullish_score,
             bearish_score,
             fragment_count
      FROM evidence_scores
      WHERE stock IN (${placeholders})
        AND (stock, score_date) IN (
              SELECT stock, MAX(score_date)
              FROM evidence_scores
              WHERE stock IN (${placeholders})
              GROUP BY stock
            )
    `)
    .all(...watchlistCodes, ...watchlistCodes);

  const enriched = rows
    .filter((r) => r.fragment_count >= 1)
    .map((r) => ({
      code: r.code,
      netScore: r.bullish_score - r.bearish_score,
      bullishScore: r.bullish_score,
      bearishScore: r.bearish_score,
      fragmentCount: r.fragment_count,
      scoreDate: r.score_date,
    }));

  const bearishWarnings = enriched.filter(
    (r) => r.netScore < BEARISH_WARNING_THRESHOLD,
  );
  const bearishCodes = new Set(bearishWarnings.map((r) => r.code));

  const bullishLeaders = enriched
    .filter((r) => r.netScore > 0 && !bearishCodes.has(r.code))
    .sort((a, b) => b.netScore - a.netScore)
    .slice(0, 3);

  return [...bullishLeaders, ...bearishWarnings];
}

/**
 * Parse affected_actions_json to extract stock code strings.
 * Handles both `[{ code: "VCB" }]` and `["VCB"]` formats.
 */
function parseAffectedCodes(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: unknown) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "code" in item) {
          return String((item as { code: unknown }).code);
        }
        return null;
      })
      .filter((v): v is string => v !== null);
  } catch {
    return [];
  }
}

/**
 * Default TA computation for one ticker: queries daily_ohlcv for the last 60
 * candles, computes RSI(14) and MA(20), and classifies signals.
 * Returns null when fewer than 15 candles are available (RSI minimum).
 */
export function defaultComputeTa(code: string, db: Database): TaSignal | null {
  const rows = db.query<CandleRow, [string]>(
    `SELECT date AS day, close AS close_price
       FROM daily_ohlcv
      WHERE code = ?
      ORDER BY date ASC
      LIMIT 60`,
  ).all(code);

  if (rows.length < 15) return null; // RSI minimum

  const prices = rows.map((r) => r.close_price);
  const currentPrice = prices.at(-1) ?? null;

  const rsi14 = computeRSI(prices, 14);
  const ma20 = computeMA(prices, 20);

  const rsiStatus: TaSignal["rsiStatus"] =
    rsi14 === null ? "neutral"
    : rsi14 > 70   ? "overbought"
    : rsi14 < 30   ? "oversold"
    :                "neutral";

  const priceVsMa20: TaSignal["priceVsMa20"] =
    ma20 === null || currentPrice === null ? "neutral"
    : currentPrice > ma20                  ? "above"
    : currentPrice < ma20                  ? "below"
    :                                        "neutral";

  return { code, rsi14, rsiStatus, ma20, priceVsMa20, currentPrice };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assembles a structured morning briefing for the Vietnamese market day.
 *
 * Steps (all DB queries run against the injected `db`; best-effort calls
 * are wrapped in try/catch so a single failure never aborts the briefing):
 *
 *   1. pollNews() — best-effort pre-fetch of fresh news
 *   2. fetchVnIndex() — best-effort VN-Index snapshot
 *   3. Query top 5 rag_analyses since midnight GMT+7 sorted by impact_score
 *   4. Query unread alerts from the last 12 hours
 *   5. Query all watchlist stocks joined with latest market_prices
 *   6. Query new financial_reports since midnight GMT+7
 *   7. Persist briefing JSON to briefingsDir/YYYY-MM-DD.json
 *   8. Return DailyBriefing
 *
 * @param options - Injectable dependencies; all are optional for production use.
 * @returns       - Structured DailyBriefing object.
 */
export async function assembleBriefing(
  options: AssembleBriefingOptions = {},
): Promise<DailyBriefing> {
  // Resolve DB lazily (avoid importing getDb at module level for testability)
  const db =
    options.db ??
    (await (async () => {
      const { getDb } = await import("../../infrastructure/db/schema.js");
      return getDb();
    })());

  const briefingsDir = options.briefingsDir ?? "./data/briefings";

  // ── Step 1: Best-effort pollNews ─────────────────────────────────────────
  const pollFn =
    options.pollNewsFn ??
    (async () => {
      const { pollNews } = await import("./pollNews.js");
      return pollNews({ db });
    });

  try {
    await pollFn();
  } catch (err) {
    logger.warn("[assembleBriefing] pollNews failed — continuing without fresh data", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Step 2: Best-effort VN-Index ─────────────────────────────────────────
  const vnIndexFn =
    options.fetchVnIndexFn ??
    (async () => {
      try {
        const { fetchVnIndex } = await import(
          "../../infrastructure/fetchers/hose.js"
        );
        const result = await fetchVnIndex();
        if (result) {
          return {
            price: result.price,
            changePct: result.changePct,
          };
        }
        return null;
      } catch (err) {
        logger.warn("[assembleBriefing] fetchVnIndex failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    });

  let vnIndex: VnIndexSnapshot | undefined;
  try {
    const result = await vnIndexFn();
    if (result !== null && result !== undefined) {
      vnIndex = result;
    }
  } catch (err) {
    logger.warn("[assembleBriefing] fetchVnIndex failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    vnIndex = undefined;
  }

  // ── Step 3: Top 5 stories since midnight ─────────────────────────────────
  const midnight = midnightVietnamAsUtc();

  const ragRows = db
    .prepare<RagRow, [string]>(`
      SELECT source_title, level, sentiment, impact_score
      FROM rag_analyses
      WHERE created_at >= ?
      ORDER BY impact_score DESC
      LIMIT 5
    `)
    .all(midnight);

  const topStories: TopStory[] = ragRows.map((row) => ({
    title: row.source_title ?? "(no title)",
    level: row.level,
    sentiment: row.sentiment ?? "neutral",
    impactScore: row.impact_score ?? 0,
  }));

  // ── Step 4: Unread alerts from last 12 hours ─────────────────────────────
  const since12h = new Date(Date.now() - 12 * 3600_000).toISOString();

  const alertRows = db
    .prepare<AlertRow, [string]>(`
      SELECT severity, message, affected_actions_json
      FROM alerts
      WHERE triggered_at >= ?
      ORDER BY triggered_at DESC
    `)
    .all(since12h);

  const alerts: BriefingAlert[] = alertRows.map((row) => ({
    severity: row.severity,
    message: row.message ?? "",
    stocks: parseAffectedCodes(row.affected_actions_json),
  }));

  // ── Step 5: Watchlist with latest prices ─────────────────────────────────
  const watchlistRows = db
    .prepare<WatchlistRow, []>(`
      SELECT w.code, w.domain,
             COALESCE(
               (SELECT mp.price FROM market_prices mp WHERE mp.code = w.code AND mp.price IS NOT NULL AND mp.price > 0),
               (SELECT d.close FROM daily_ohlcv d WHERE d.code = w.code ORDER BY d.date DESC LIMIT 1)
             ) AS price,
             (SELECT mp2.change_pct FROM market_prices mp2 WHERE mp2.code = w.code AND mp2.price IS NOT NULL AND mp2.price > 0) AS change_pct
      FROM watchlist w
      ORDER BY w.code
    `)
    .all();

  // Check whether the history table exists before querying it
  const historyTableExists = (() => {
    try {
      const row = db
        .query<{ name: string }, [string]>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        )
        .get("market_prices_history");
      return row !== null;
    } catch {
      return false;
    }
  })();

  // Pre-fetch 5-day price history for every watchlist stock (oldest first).
  // The result is a Map<code, number[]> for efficient lookup below.
  const historyMap = new Map<string, number[]>();
  if (historyTableExists) {
    const histStmt = db.prepare<PriceHistoryRow, [string]>(`
      SELECT price
      FROM (
        SELECT price, fetched_at
        FROM market_prices_history
        WHERE code = ?
        ORDER BY fetched_at DESC
        LIMIT 5
      )
      ORDER BY fetched_at ASC
    `);
    for (const row of watchlistRows) {
      try {
        const rows = histStmt.all(row.code);
        historyMap.set(row.code, rows.map((r) => r.price));
      } catch {
        // history table may exist without required columns — skip silently
      }
    }
  }

  const watchlistSummary: WatchlistEntry[] = watchlistRows.map((row) => {
    const entry: WatchlistEntry = {
      code: row.code,
      domain: row.domain,
    };
    if (row.price != null) entry.price = row.price;
    if (row.change_pct != null) entry.changePct = row.change_pct;

    const history = historyMap.get(row.code) ?? [];
    entry.sparkline = generateSparkline(history, 5);

    return entry;
  });

  // ── Step 6: New financial reports since midnight ──────────────────────────
  const reportRows = db
    .prepare<FinancialReportRow, [string]>(`
      SELECT action_code, period_type, period_year
      FROM financial_reports
      WHERE parsed_at >= ?
      ORDER BY parsed_at DESC
    `)
    .all(midnight);

  const newReports: NewReport[] = reportRows.map((row) => ({
    code: row.action_code,
    period:
      row.period_type && row.period_year
        ? `${row.period_year}-${row.period_type}`
        : String(row.period_year ?? "unknown"),
  }));

  // ── Step 7: Macro dashboard (σ-based) ──────────────────────────────────────
  let macroSnapshot: MacroIndicator[] = [];
  try {
    const { getAllMacroStats } = await import("../../infrastructure/db/macroStatsStore.js");
    const { classifyDeviation } = await import("../../domain/services/macroThresholds.js");

    const stats = getAllMacroStats();
    macroSnapshot = stats.map((s) => {
      const dev = classifyDeviation(s);
      return {
        name: s.name,
        value: s.current,
        unit: s.name.includes("Pct") ? "%" : s.name.includes("usd") ? "USD" : "",
        status: dev.summary,
      };
    });
  } catch { /* best-effort */ }

  // ── Step 8: Sensitive date warnings ─────────────────────────────────────────
  let sensitiveWarnings: string[] = [];
  try {
    const { detectSensitiveDates } = await import("../../domain/services/priceNewsValidator.js");
    sensitiveWarnings = detectSensitiveDates();
  } catch { /* best-effort */ }

  // ── Step 9: Auto-tracked commodities ────────────────────────────────────────
  let trackedCommodities: { indicator: string; value: number; unit: string; dataPoints: number }[] = [];
  try {
    const { listTrackedIndicators } = await import("../../infrastructure/db/commodityTracker.js");
    trackedCommodities = listTrackedIndicators().map((t) => ({
      indicator: t.indicator,
      value: t.value,
      unit: t.unit,
      dataPoints: t.dataPoints,
    }));
  } catch { /* best-effort */ }

  // ── Step 10: Auto-resolve stale low/medium alerts (72h) ──────────────────
  try {
    db.exec(`
      UPDATE alerts
      SET resolved_at = datetime('now'), resolution_notes = 'Auto-resolved: stale >72h'
      WHERE severity IN ('low', 'medium')
        AND resolved_at IS NULL
        AND triggered_at < datetime('now', '-72 hours')
    `);
  } catch { /* resolved_at column may not exist */ }

  // ── Step 10b: Unresolved HIGH/CRITICAL alerts ─────────────────────────────
  let unresolvedAlerts: BriefingAlert[] = [];
  try {
    const unresolvedRows = db
      .prepare<AlertRow, []>(`
        SELECT severity, message, affected_actions_json
        FROM alerts
        WHERE severity IN ('high', 'critical')
          AND resolved_at IS NULL
        ORDER BY triggered_at DESC
        LIMIT 5
      `)
      .all();
    unresolvedAlerts = unresolvedRows.map((row) => ({
      severity: row.severity,
      message: row.message ?? "",
      stocks: parseAffectedCodes(row.affected_actions_json),
    }));
  } catch { /* best-effort */ }

  // ── Step 11: Top conviction signal from watchlist ──────────────────────────
  let topConviction: DailyBriefing["topConviction"] = null;
  try {
    const { computeConviction } = await import("../../domain/services/convictionScorer.js");
    let bestScore = 0;

    for (const stock of watchlistRows) {
      if (stock.price == null || stock.change_pct == null) continue;
      const result = computeConviction({
        code: stock.code,
        changePct: stock.change_pct,
      });
      if (result.score > bestScore && result.level !== "weak") {
        bestScore = result.score;
        topConviction = {
          code: result.code,
          score: result.score,
          direction: result.direction,
          summary: result.summary,
        };
      }
    }
  } catch { /* best-effort */ }

  // ── Step 12: Prediction market signals (HIGH/CRITICAL only, last 24h) ────────
  let predictionSignals: BriefingPredictionSignal[] = [];
  try {
    const { getRecentPredictionSignals } = await import("../../infrastructure/db/predictionStore.js");
    const allSignals = getRecentPredictionSignals(db, 24);
    predictionSignals = allSignals.filter(
      (s) => s.severity === "high" || s.severity === "critical",
    );
  } catch { /* best-effort */ }

  // ── Step 13a: Portfolio P&L snapshot ─────────────────────────────────────
  let portfolioPnl: PortfolioPnlResult | null = null;
  try {
    const openPositions = db
      .prepare<OpenPositionRow, []>(
        `SELECT code, shares, avg_price FROM positions WHERE closed_at IS NULL`,
      )
      .all();

    if (openPositions.length > 0) {
      // Build a price map — market_prices preferred, daily_ohlcv fallback
      const priceRows = db
        .prepare<{ code: string; price: number }, []>(
          `SELECT code, price FROM market_prices WHERE price IS NOT NULL AND price > 0
           UNION ALL
           SELECT code, close AS price FROM daily_ohlcv
           WHERE (code, date) IN (SELECT code, MAX(date) FROM daily_ohlcv GROUP BY code)
             AND code NOT IN (SELECT code FROM market_prices WHERE price IS NOT NULL AND price > 0)`,
        )
        .all();
      const priceMap = new Map(priceRows.map((r) => [r.code, r.price]));

      const result = computePortfolioPnl(
        openPositions.map((p) => ({
          code: p.code,
          shares: p.shares,
          avgPrice: p.avg_price,
        })),
        priceMap,
      );

      portfolioPnl = result;

      // Persist snapshot (best-effort)
      try {
        const { savePnlSnapshot } = await import("../../infrastructure/db/pnlSnapshotStore.js");
        const snapshotDate = todayVietnam();
        savePnlSnapshot(db, snapshotDate, result.items);
      } catch (snapErr) {
        logger.warn("[assembleBriefing] savePnlSnapshot failed", {
          error: snapErr instanceof Error ? snapErr.message : String(snapErr),
        });
      }
    }
  } catch (pnlErr) {
    logger.warn("[assembleBriefing] portfolioPnl step failed", {
      error: pnlErr instanceof Error ? pnlErr.message : String(pnlErr),
    });
  }

  // ── Step 14: Insider transactions (last 24h, watchlist only) ─────────────────
  let insiderRecent: InsiderBriefingRow[] = [];
  try {
    insiderRecent = queryInsiderRecent(
      db,
      watchlistRows.map((r) => r.code),
    );
  } catch (insiderErr) {
    logger.warn("[assembleBriefing] insiderRecent step failed", {
      error: insiderErr instanceof Error ? insiderErr.message : String(insiderErr),
    });
  }

  // ── Step 15: Foreign flow summary (previous trading day, watchlist only) ──────
  let foreignFlowSummary: ForeignFlowBriefingRow[] = [];
  try {
    foreignFlowSummary = queryForeignFlowSummary(
      db,
      watchlistRows.map((r) => r.code),
    );
  } catch (ffErr) {
    logger.warn("[assembleBriefing] foreignFlowSummary step failed", {
      error: ffErr instanceof Error ? ffErr.message : String(ffErr),
    });
  }

  // ── Step 16: Evidence top scores (bullish leaders + bearish warnings) ─────────
  let evidenceTopScores: EvidenceScoreBriefingRow[] = [];
  try {
    evidenceTopScores = queryEvidenceTopScores(
      db,
      watchlistRows.map((r) => r.code),
    );
  } catch (esErr) {
    logger.warn("[assembleBriefing] evidenceTopScores step failed", {
      error: esErr instanceof Error ? esErr.message : String(esErr),
    });
  }

  // ── Step 17: TA signals (non-neutral only) ─────────────────────────────────
  let taSummary: TaSignal[] = [];
  try {
    const taFn = options.computeTaFn ?? defaultComputeTa;
    const signals: TaSignal[] = [];
    for (const row of watchlistRows) {
      try {
        const sig = taFn(row.code, db);
        if (sig !== null) signals.push(sig);
      } catch { /* per-ticker failure — skip silently */ }
    }
    taSummary = signals.filter(
      (s) => s.rsiStatus !== "neutral" || s.priceVsMa20 !== "neutral",
    );
  } catch (taErr) {
    logger.warn("[assembleBriefing] taSummary step failed", {
      error: taErr instanceof Error ? taErr.message : String(taErr),
    });
  }

  // ── Step 13: Persist briefing ─────────────────────────────────────────────
  const date = todayVietnam();
  const generatedAt = new Date().toISOString();

  const briefing: DailyBriefing = {
    date,
    ...(vnIndex !== undefined ? { vnIndex } : {}),
    topStories,
    alerts,
    watchlistSummary,
    newReports,
    macroSnapshot,
    sensitiveWarnings,
    trackedCommodities,
    unresolvedAlerts,
    topConviction,
    predictionSignals,
    portfolioPnl,
    insiderRecent,
    foreignFlowSummary,
    evidenceTopScores,
    taSummary,
    generatedAt,
  };

  try {
    mkdirSync(briefingsDir, { recursive: true });
    const filePath = join(briefingsDir, `${date}.json`);
    writeFileSync(filePath, JSON.stringify(briefing, null, 2), "utf-8");
    logger.info("[assembleBriefing] briefing persisted", { filePath });
  } catch (err) {
    logger.warn("[assembleBriefing] failed to persist briefing", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return briefing;
}
