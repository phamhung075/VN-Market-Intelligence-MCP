/**
 * Assemble Evening Summary — Task 105 (Application Layer)
 *
 * Orchestrates an end-of-day digest at 22:00 GMT+7, bookending the morning
 * briefing (task 101) with a look-back over the full trading day:
 *   1. Query rag_analyses for top 5 stories since midnight GMT+7
 *   2. Query alerts for the last 24 hours, sorted by severity DESC
 *   3. Query watchlist + market_prices for movers (|changePct| >= 1.0)
 *   4. Persist summary to reportsDir/YYYY-MM-DD-evening.json
 *   5. Return the structured EveningSummary object
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 * Mirrors assembleBriefing.ts structure for consistency.
 */

import type { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../../infrastructure/logger.js";

// Re-use shared types from assembleBriefing to avoid duplication
import type { BriefingAlert, TopStory, TaSignal, GlobalSnapshot } from "./assembleBriefing.js";
import { defaultComputeTa } from "./assembleBriefing.js";
import type { BriefingPredictionSignal } from "../../infrastructure/db/predictionStore.js";
import { getRecentPredictionSignals as _getRecentPredictionSignals } from "../../infrastructure/db/predictionStore.js";
import type { PortfolioPnlResult } from "../../domain/services/portfolioPnlCalculator.js";
// ── Centralized helpers (FACTORY-APP-dedup-date-freshness-helpers) ─────────
// midnightVietnamAsUtc/todayVietnam/parseAffectedCodes/isPriceFresh were
// duplicated verbatim from assembleBriefing.ts — now one home each; local
// copies removed below.
import { midnightVietnamAsUtc, todayVietnam } from "../../domain/services/timeHelpers.js";
import { parseAffectedCodes } from "../../domain/utils/affectedCodesParser.js";
import { isPriceFresh } from "../utils/priceFreshnessGate.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** VN-Index snapshot captured at market close. */
export interface VnIndexSnapshot {
  /** Closing price (MarketPrice.price) */
  close: number;
  /** Signed integer change: Math.round(price - previousPrice) */
  change: number;
  /** Percentage change rounded to 2 dp (MarketPrice.changePct) */
  changePct: number;
  /** ISO 8601 timestamp from MarketPrice.fetchedAt */
  fetchedAt: string;
}

/** Diagnostic counts for prediction pipeline observability — JSON report only, NOT sent to Telegram */
export interface PredictionDiag {
  /** Total prediction_signals rows fetched in last 24h, any severity */
  stored: number;
}

/** Diagnostic counts for TA pipeline observability — JSON report only, NOT sent to Telegram */
export interface TaDiag {
  /** Watchlist tickers where computeTaFn returned a non-null TaSignal */
  tickersWithSignal: number;
  /** Watchlist tickers where daily_ohlcv row count < 8 (defaultComputeTa guard threshold) */
  tickersBelowThreshold: number;
  /** Minimum daily_ohlcv row count across all watchlist tickers (0 if empty watchlist) */
  ohlcvRowsMin: number;
  /** Maximum daily_ohlcv row count across all watchlist tickers (0 if empty watchlist) */
  ohlcvRowsMax: number;
}

/** A stock with notable foreign investor net flow at market close (Task 1503). */
export interface ForeignFlowMover {
  /** Stock ticker, e.g. "VCB" */
  code: string;
  /** Net foreign volume (buy - sell), positive = net buy, negative = net sell */
  foreignNetVol: number;
  /** Raw foreign buy volume */
  foreignBuyVol: number;
  /** Raw foreign sell volume */
  foreignSellVol: number;
}

/** A watchlist stock that moved >= 1% during the day. */
export interface WatchlistMover {
  /** Stock ticker, e.g. "VCB" */
  code: string;
  /** Signed percentage change from previous close */
  changePct: number;
  /** Current price in VND */
  price: number;
  /** Exchange: HOSE | HNX | UPCOM */
  exchange: string;
  /** Trading volume for the day — from market_prices.volume or daily_ohlcv.volume. undefined when unavailable. */
  volume?: number;
  /** RSI(14) value — threaded from taSummary after TA computation. null when insufficient candles, undefined when not yet computed. */
  rsi14?: number | null;
}

/**
 * End-of-day digest.
 *
 * Produced by `assembleEveningSummary()` and persisted to
 * `reports/YYYY-MM-DD-evening.json` (overwrites on re-run).
 */
export interface EveningSummary {
  /** Date of the summary in Vietnam timezone, YYYY-MM-DD */
  date: string;
  /** Up to 5 most impactful alerts from the last 24 hours, severity DESC */
  topAlerts: BriefingAlert[];
  /** Up to 5 top stories from rag_analyses since midnight, impact_score DESC */
  topStories: TopStory[];
  /** Watchlist stocks with |changePct| >= 1.0, sorted by |changePct| DESC */
  watchlistMovers: WatchlistMover[];
  /** HIGH/CRITICAL prediction market signals from the last 24h (crowd-sourced early warnings) */
  predictionSignals: BriefingPredictionSignal[];
  /** Diagnostic counts for prediction pipeline observability — JSON report only, NOT sent to Telegram */
  predictionDiag: PredictionDiag;
  /** Diagnostic counts for TA pipeline observability — JSON report only, NOT sent to Telegram */
  taDiag: TaDiag;
  /** RSI(14) + MA20 signals for all watchlist tickers at market close. Empty array when
   *  watchlist is empty or all signals are null (< 15 candles). Includes neutral signals — the
   *  display filter (non-neutral only) is applied in eveningSummaryJob.ts. */
  taSummary: TaSignal[];
  /** Count of rag_analyses rows created since midnight Vietnam time — diagnostic field */
  newsCount: number;
  /** ISO 8601 timestamp when this summary was generated */
  generatedAt: string;
  /** VN-Index close snapshot. Present on success; undefined when fetch fails or returns null. */
  vnIndex?: VnIndexSnapshot;
  /**
   * Portfolio P&L snapshot — per-position and aggregate unrealized P&L at market close.
   * null when there are no open positions or getPnlFn returns null.
   * undefined on summaries generated before task 1441.
   */
  portfolioPnl?: PortfolioPnlResult | null;
  /**
   * Top stocks by absolute foreign net flow volume at market close (Task 1503).
   * Up to 5 entries, ordered by |foreignNetVol| DESC.
   * Empty array when no foreign flow data is available.
   * undefined on summaries generated before task 1503.
   */
  foreignFlowMovers?: ForeignFlowMover[];
  /**
   * VIX / DXY / SP500 / Hang Seng snapshot at market close (Task 1512).
   * undefined when commodity_prices table is empty or all values are zero.
   */
  globalSnapshot?: GlobalSnapshot;
  /**
   * ISO timestamp of MAX(market_prices.updated_at) — used by FR-3 evening summary
   * data crisis detection. Used to flag stale price data in evening report.
   */
  lastPriceUpdate?: string;
  /**
   * ISO timestamp of MAX(rag_analyses.created_at) — used by FR-3 evening summary
   * data crisis detection. Used to flag stale news data in evening report.
   */
  lastNewsUpdate?: string;
}

/**
 * Injectable dependencies for testability.
 *
 * @param db              - SQLite Database (defaults to getDb())
 * @param reportsDir      - Override output directory (defaults to ./reports)
 * @param computeTaFn     - Override TA computation function (defaults to defaultComputeTa).
 *                          Inject a mock in tests to avoid market_prices_history dependency.
 * @param getNewsCountFn  - Optional override for the news COUNT query (for tests)
 */
export interface AssembleEveningSummaryOptions {
  db?: Database;
  reportsDir?: string;
  computeTaFn?: (code: string, db: Database) => TaSignal | null | Promise<TaSignal | null>;
  getNewsCountFn?: (midnight: string) => number;
  /** Override prediction signals fetch for tests — avoids mock.module in unit tests */
  getPredictionSignalsFn?: (db: Database, hoursBack: number) => BriefingPredictionSignal[] | Promise<BriefingPredictionSignal[]>;
  /** Override OHLCV row count query for tests — avoids real DB dependency */
  getOhlcvRowCountFn?: (code: string, db: Database) => number;
  /** Override VN-Index fetch for tests — avoids real HTTP calls */
  fetchVnIndexFn?: () => Promise<import("../../infrastructure/fetchers/hose.js").MarketPrice | null>;
  /**
   * Injectable P&L computation — avoids real DB positions table in tests.
   * When provided, called instead of the default DB-backed implementation.
   * Return null to signal "no open positions" (section skipped).
   * Throw to signal error (portfolioPnl set to null, no crash).
   */
  getPnlFn?: () => Promise<PortfolioPnlResult | null>;
  /**
   * Injectable foreign flow movers query for tests — avoids real DB dependency.
   * When provided, called instead of the default daily_ohlcv query.
   */
  getForeignFlowMoversFn?: (db: Database) => ForeignFlowMover[];
  /**
   * Injectable Telegram sender for test verification of freshness gate.
   * Receives (channel, message) and logs calls.
   */
  sendTelegramFn?: ((channel: string, message: string) => Promise<void>) | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Severity sort rank
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

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

interface WatchlistMoverRow {
  code: string;
  exchange: string | null;
  price: number | null;
  change_pct: number | null;
  volume: number | null;
}

interface WatchlistCodeRow {
  code: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default production implementation: COUNT(*) of daily_ohlcv rows for a ticker.
 * Returns 0 if the table does not exist yet (graceful degradation during DB migrations).
 */
function defaultGetOhlcvRowCount(code: string, db: Database): number {
  try {
    const row = db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code = ?",
      )
      .get(code);
    return row?.cnt ?? 0;
  } catch {
    // Table may not exist in older DB schemas — treat as 0 rows
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Overloads for assembleEveningSummary function to support both calling patterns.
 * Pattern 1: assembleEveningSummary(options: AssembleEveningSummaryOptions)
 * Pattern 2: assembleEveningSummary(db: Database, sendTelegramFn: (channel, message) => Promise<void>) [for tests]
 */
export async function assembleEveningSummary(
  dbOrOptions: Database | AssembleEveningSummaryOptions = {},
  sendTelegramFn?: (channel: string, message: string) => Promise<void>,
): Promise<EveningSummary> {
  // Normalize arguments: handle both calling patterns
  let options: AssembleEveningSummaryOptions;
  if (dbOrOptions && "prepare" in dbOrOptions) {
    // It's a Database instance (has prepare method)
    options = { db: dbOrOptions, sendTelegramFn };
  } else {
    // It's an options object
    options = (dbOrOptions as AssembleEveningSummaryOptions) ?? {};
  }

  return _assembleEveningSummaryImpl(options);
}

/**
 * Internal implementation of assembleEveningSummary.
 *
 * Assembles a structured evening summary for the end of the Vietnamese trading day.
 *
 * Steps (all DB queries run against the injected `db`; file write failures are
 * caught and logged so they never abort the summary):
 *
 *   1. Query top 5 rag_analyses since midnight GMT+7 sorted by impact_score
 *   2. Query alerts from the last 24 hours, client-sorted by severity DESC
 *   3. Query watchlist stocks with |changePct| >= 1.0 via LEFT JOIN market_prices
 *   4. Persist summary JSON to reportsDir/YYYY-MM-DD-evening.json
 *   5. Return EveningSummary
 *
 * @param options - Injectable dependencies; all are optional for production use.
 * @returns       - Structured EveningSummary object.
 */
async function _assembleEveningSummaryImpl(
  options: AssembleEveningSummaryOptions = {},
): Promise<EveningSummary> {
  // Resolve DB lazily to avoid importing getDb at module level (testability)
  const db =
    options.db ??
    (await (async () => {
      const { getDb } = await import("../../infrastructure/db/schema.js");
      return getDb();
    })());

  const reportsDir = options.reportsDir ?? "./reports";
  const getNewsCountFn = options.getNewsCountFn;

  // ── Step 0: VN-Index snapshot (best-effort, front-loaded) ────────────────
  // Default: read from market_prices DB (code="VNINDEX", updated within 3 days).
  // VN-Index is pushed by VPS every 60s — avoids geo-blocked live fetch from France.
  // fetchVnIndexFn option overrides default for test injection.
  let vnIndex: VnIndexSnapshot | undefined;
  try {
    if (options.fetchVnIndexFn) {
      // Test-injected or custom fetch path (e.g. hose.ts for local dev)
      const mp = await options.fetchVnIndexFn();
      if (mp !== null) {
        vnIndex = {
          close: mp.price,
          change: Math.round(mp.price - mp.previousPrice),
          changePct: Math.round(mp.changePct * 100) / 100,
          fetchedAt: mp.fetchedAt,
        };
      }
    } else {
      // Default: read VNINDEX from market_prices (VPS-pushed every 60s)
      // Compute cutoff date dynamically to handle date-driven tests properly
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const cutoffDateStr = threeDaysAgo.toISOString().split('T')[0]!;
      const row = db
        .prepare<{ price: number; change_pct: number; updated_at: string }, [string]>(
          `SELECT price, change_pct, updated_at
           FROM market_prices
           WHERE code = 'VNINDEX'
             AND date(updated_at) >= ?
           LIMIT 1`,
        )
        .get(cutoffDateStr);
      if (row !== null && row !== undefined) {
        vnIndex = {
          close: row.price,
          change: Math.round(row.price * row.change_pct / 100),
          changePct: Math.round(row.change_pct * 100) / 100,
          fetchedAt: row.updated_at,
        };
      }
    }
  } catch (err) {
    logger.warn("[assembleEveningSummary] vnIndex step failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Step 1: Top 5 stories since midnight ─────────────────────────────────
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

  // ── News count since midnight (diagnostic field) ──────────────────────────
  // Uses injected getNewsCountFn for testability; falls back to direct DB query.
  // Midnight VN = today 00:00 UTC+7 = yesterday 17:00 UTC.
  let newsCount = 0;
  try {
    if (getNewsCountFn) {
      newsCount = getNewsCountFn(midnight);
    } else {
      const countRow = db
        .prepare<{ cnt: number }, [string]>(
          `SELECT COUNT(*) AS cnt FROM rag_analyses WHERE created_at >= ?`,
        )
        .get(midnight);
      newsCount = countRow?.cnt ?? 0;
    }
  } catch {
    newsCount = 0;
  }

  // ── Step 2: Alerts from last 24 hours, sorted by severity DESC ────────────
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();

  const alertRows = db
    .prepare<AlertRow, [string]>(`
      SELECT severity, message, affected_actions_json
      FROM alerts
      WHERE triggered_at >= ?
      ORDER BY triggered_at DESC
    `)
    .all(since24h);

  // Client-side severity sort (critical > warning > info)
  alertRows.sort(
    (a, b) =>
      (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
  );

  // Cap at 5
  const topAlerts: BriefingAlert[] = alertRows.slice(0, 5).map((row) => ({
    severity: row.severity,
    message: row.message ?? "",
    stocks: parseAffectedCodes(row.affected_actions_json),
  }));

  // ── Step 3: Watchlist movers (|changePct| >= 1.0) ─────────────────────────
  // Determine whether market_prices has an exchange column (added by task 027).
  // Gracefully fall back to w.exchange when the column doesn't exist yet.
  const mpCols = db
    .prepare<{ name: string }, []>("PRAGMA table_info(market_prices)")
    .all()
    .map((c) => c.name);

  const exchangeExpr = mpCols.includes("exchange")
    ? "COALESCE(mp.exchange, w.exchange)"
    : "w.exchange";

  // Check whether daily_ohlcv table exists (may be absent on older DB schemas).
  const ohlcvExists =
    db
      .prepare<{ cnt: number }, []>(
        `SELECT COUNT(*) AS cnt FROM sqlite_master
         WHERE type='table' AND name='daily_ohlcv'`,
      )
      .get()?.cnt ?? 0;

  // Build watchlist movers query.
  // When daily_ohlcv exists: use a CTE to compute change_pct from today vs yesterday
  // close as fallback when market_prices lacks a fresh row for a ticker.
  // When daily_ohlcv is absent: fall back to simple LEFT JOIN on market_prices only.
  const moverSql = ohlcvExists
    ? `
      WITH ohlcv_change AS (
        SELECT
          t.code,
          t.close AS today_close,
          t.volume AS today_volume,
          CASE
            WHEN y.close IS NOT NULL AND y.close <> 0
            THEN (t.close - y.close) * 100.0 / y.close
            ELSE NULL
          END AS computed_pct
        FROM daily_ohlcv t
        JOIN daily_ohlcv y
          ON y.code = t.code
         AND y.date = (SELECT MAX(date) FROM daily_ohlcv WHERE date < t.date)
        WHERE t.date = (SELECT MAX(date) FROM daily_ohlcv)
      )
      SELECT w.code,
             ${exchangeExpr} AS exchange,
             COALESCE(mp.price, oc.today_close) AS price,
             COALESCE(mp.change_pct, oc.computed_pct) AS change_pct,
             COALESCE(mp.volume, oc.today_volume) AS volume
      FROM watchlist w
      LEFT JOIN market_prices mp ON mp.code = w.code
                                 AND mp.updated_at >= datetime('now', '-3 days')
      LEFT JOIN ohlcv_change oc ON oc.code = w.code
      WHERE ABS(COALESCE(mp.change_pct, oc.computed_pct, 0)) >= 1.0
      ORDER BY ABS(COALESCE(mp.change_pct, oc.computed_pct, 0)) DESC
    `
    : `
      SELECT w.code,
             ${exchangeExpr} AS exchange,
             mp.price,
             mp.change_pct,
             mp.volume
      FROM watchlist w
      LEFT JOIN market_prices mp ON mp.code = w.code
                                 AND mp.updated_at >= datetime('now', '-3 days')
      WHERE ABS(COALESCE(mp.change_pct, 0)) >= 1.0
      ORDER BY ABS(COALESCE(mp.change_pct, 0)) DESC
    `;

  const moverRows = db.prepare<WatchlistMoverRow, []>(moverSql).all();

  // Build initial movers — volume threaded from query; rsi14 will be patched after TA step
  const watchlistMovers: WatchlistMover[] = moverRows.map((row) => ({
    code: row.code,
    changePct: row.change_pct ?? 0,
    price: row.price ?? 0,
    exchange: row.exchange ?? "HOSE",
    ...(row.volume != null ? { volume: row.volume } : {}),
    rsi14: null, // populated after taSummary is computed below
  }));

  // ── Step 4: TA signals ────────────────────────────────────────────────────
  const taFn = options.computeTaFn ?? defaultComputeTa;
  const rowCountFn = options.getOhlcvRowCountFn ?? defaultGetOhlcvRowCount;
  let taSummary: TaSignal[] = [];
  let taDiag: TaDiag = { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 };
  try {
    const watchlistRows = db
      .prepare<WatchlistCodeRow, []>("SELECT code FROM watchlist")
      .all();
    const signals: TaSignal[] = [];
    const rowCounts: number[] = [];
    let withSignal = 0;
    let belowThreshold = 0;
    for (const { code } of watchlistRows) {
      try {
        const cnt = rowCountFn(code, db);
        rowCounts.push(cnt);
        if (cnt < 8) belowThreshold++;
        const sig = await Promise.resolve(taFn(code, db));
        if (sig !== null) { signals.push(sig); withSignal++; }
      } catch {
        rowCounts.push(0);
        /* per-ticker: swallow, continue */
      }
    }
    taSummary = signals;
    taDiag = {
      tickersWithSignal: withSignal,
      tickersBelowThreshold: belowThreshold,
      ohlcvRowsMin: rowCounts.length > 0 ? Math.min(...rowCounts) : 0,
      ohlcvRowsMax: rowCounts.length > 0 ? Math.max(...rowCounts) : 0,
    };

    // ── Thread RSI-14 from taSummary into watchlistMovers ────────────────
    // taSummary is keyed by code; movers default to rsi14=null (set above).
    // When a signal exists for a mover's code, copy its rsi14 value.
    if (signals.length > 0) {
      const rsiMap = new Map<string, number | null>(
        signals.map((s) => [s.code, s.rsi14]),
      );
      for (const mover of watchlistMovers) {
        if (rsiMap.has(mover.code)) {
          mover.rsi14 = rsiMap.get(mover.code) ?? null;
        }
      }
    }
  } catch (err) {
    logger.warn("[assembleEveningSummary] TA step failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    // taDiag stays at zero-default — no crash
  }

  // ── Step 4b: Foreign flow movers (Task 1503) ─────────────────────────────────
  let foreignFlowMovers: ForeignFlowMover[] = [];
  try {
    if (options.getForeignFlowMoversFn) {
      foreignFlowMovers = options.getForeignFlowMoversFn(db);
    } else {
      interface OhlcvFlowRow {
        code: string;
        foreign_net_vol: number;
        foreign_buy_vol: number;
        foreign_sell_vol: number;
      }
      const flowRows = db
        .prepare<OhlcvFlowRow, []>(
          `SELECT code, foreign_net_vol, foreign_buy_vol, foreign_sell_vol
             FROM daily_ohlcv_with_flow
            -- TASK_2003 (SUBTASK-DAILY-FF-4): daily_ohlcv_with_flow compat view
            -- (COALESCE new daily_foreign_flow, then legacy daily_ohlcv.foreign_*).
            WHERE date = (SELECT MAX(date) FROM daily_ohlcv)
              AND foreign_net_vol IS NOT NULL
              AND foreign_net_vol <> 0
            ORDER BY ABS(foreign_net_vol) DESC
            LIMIT 5`,
        )
        .all();
      foreignFlowMovers = flowRows.map((r) => ({
        code: r.code,
        foreignNetVol: r.foreign_net_vol,
        foreignBuyVol: r.foreign_buy_vol,
        foreignSellVol: r.foreign_sell_vol,
      }));
    }
  } catch (err) {
    logger.warn("[assembleEveningSummary] foreignFlowMovers step failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    foreignFlowMovers = [];
  }

  // ── Step 5: Prediction market signals — medium fallback + diag ──────────────
  let predictionSignals: BriefingPredictionSignal[] = [];
  let predictionDiag: PredictionDiag = { stored: 0 };
  try {
    const signalsFn =
      options.getPredictionSignalsFn ??
      _getRecentPredictionSignals;
    const allSignals = await signalsFn(db, 24);
    const stored = allSignals.length;
    predictionDiag = { stored };

    const highCritical = allSignals.filter(
      (s) => s.severity === "high" || s.severity === "critical",
    );
    if (highCritical.length > 0) {
      predictionSignals = highCritical;
    } else {
      predictionSignals = allSignals
        .filter((s) => s.severity === "medium")
        .slice(0, 3);
    }
  } catch (err) {
    logger.warn("[assembleEveningSummary] prediction signals query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Step 5b: Portfolio P&L snapshot (best-effort) ────────────────────────
  let portfolioPnl: PortfolioPnlResult | null = null;
  try {
    if (options.getPnlFn) {
      portfolioPnl = await options.getPnlFn();
    } else {
      // Default: query positions table + market_prices (mirrors assembleBriefing pattern)
      interface OpenPositionRow { code: string; shares: number; avg_price: number }
      const openPositions = db
        .prepare<OpenPositionRow, []>(
          `SELECT code, shares, avg_price FROM positions WHERE closed_at IS NULL`,
        )
        .all();

      if (openPositions.length > 0) {
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

        const { computePortfolioPnl } = await import(
          "../../domain/services/portfolioPnlCalculator.js"
        );
        portfolioPnl = computePortfolioPnl(
          openPositions.map((p) => ({
            code: p.code,
            shares: p.shares,
            avgPrice: p.avg_price,
          })),
          priceMap,
        );
      }
    }
  } catch (pnlErr) {
    logger.warn("[assembleEveningSummary] portfolioPnl step failed", {
      error: pnlErr instanceof Error ? pnlErr.message : String(pnlErr),
    });
    portfolioPnl = null;
  }

  // ── Step 6b: Global snapshot (VIX / DXY / SP500 / Hang Seng) ─────────────
  let globalSnapshot: GlobalSnapshot | undefined;
  try {
    const gsRow = db
      .query<
        { vix: number; dxy: number; sp500: number; hang_seng: number; fetched_at: string },
        []
      >("SELECT vix, dxy, sp500, hang_seng, fetched_at FROM commodity_prices LIMIT 1")
      .get();
    if (gsRow && (gsRow.vix !== 0 || gsRow.dxy !== 0 || gsRow.sp500 !== 0)) {
      globalSnapshot = {
        vix: gsRow.vix,
        dxy: gsRow.dxy,
        sp500: gsRow.sp500,
        hangSeng: gsRow.hang_seng,
        fetchedAt: gsRow.fetched_at,
      };
    }
  } catch (gsErr) {
    logger.warn("[assembleEveningSummary] globalSnapshot step failed", {
      error: gsErr instanceof Error ? gsErr.message : String(gsErr),
    });
  }

  // ── Step 6c: Fetch data timestamps for FR-3 crisis detection ────────────────
  let lastPriceUpdate: string | undefined;
  let lastNewsUpdate: string | undefined;
  try {
    const priceRow = db
      .query<{ ts: string | null }, []>(
        "SELECT MAX(updated_at) AS ts FROM market_prices WHERE code NOT IN ('TEST','PROBE')",
      )
      .get();
    if (priceRow?.ts) {
      lastPriceUpdate = priceRow.ts;
    }

    const newsRow = db
      .query<{ ts: string | null }, []>(
        "SELECT MAX(created_at) AS ts FROM rag_analyses",
      )
      .get();
    if (newsRow?.ts) {
      lastNewsUpdate = newsRow.ts;
    }
  } catch (tsErr) {
    logger.warn("[assembleEveningSummary] data timestamp fetch failed", {
      error: tsErr instanceof Error ? tsErr.message : String(tsErr),
    });
  }

  // ── Step 7: Persist summary ───────────────────────────────────────────────
  const date = todayVietnam();
  const generatedAt = new Date().toISOString();

  const summary: EveningSummary = {
    date,
    topAlerts,
    topStories,
    watchlistMovers,
    predictionSignals,
    predictionDiag,
    taDiag,
    taSummary,
    newsCount,
    generatedAt,
    ...(vnIndex !== undefined ? { vnIndex } : {}),
    portfolioPnl,
    foreignFlowMovers,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    ...(globalSnapshot !== undefined ? { globalSnapshot } : { globalSnapshot: undefined as unknown as GlobalSnapshot }),
    ...(lastPriceUpdate !== undefined ? { lastPriceUpdate } : {}),
    ...(lastNewsUpdate !== undefined ? { lastNewsUpdate } : {}),
  };

  try {
    mkdirSync(reportsDir, { recursive: true });
    const filePath = join(reportsDir, `${date}-evening.json`);
    writeFileSync(filePath, JSON.stringify(summary, null, 2), "utf-8");
    logger.info("[assembleEveningSummary] summary persisted", { filePath });
  } catch (err) {
    logger.warn("[assembleEveningSummary] failed to persist summary", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Step 8: Freshness gate — check if market prices are stale ─────────────
  const isFresh = await isPriceFresh(db, "evening summary");
  const sendTelegramFn = options.sendTelegramFn;

  if (!isFresh && sendTelegramFn) {
    // Prices are stale — suppress MARKET send and alert WORK team
    logger.warn("[assembleEveningSummary] freshness gate: prices >24h stale, suppressing MARKET send");
    const row = db
      .prepare<{ latest: string | null }, []>("SELECT MAX(updated_at) as latest FROM daily_ohlcv")
      .get();
    await sendTelegramFn(
      "work",
      `[FRESHNESS GATE] Evening summary suppressed. Last price update: ${row?.latest ?? "unknown"}`
    );
  }

  return summary;
}
