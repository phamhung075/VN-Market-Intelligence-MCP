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
import type { BriefingAlert, TopStory, TaSignal } from "./assembleBriefing.js";
import { defaultComputeTa } from "./assembleBriefing.js";
import type { BriefingPredictionSignal } from "../../infrastructure/db/predictionStore.js";

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
  computeTaFn?: (code: string, db: Database) => TaSignal | null;
  getNewsCountFn?: (midnight: string) => number;
  /** Override prediction signals fetch for tests — avoids mock.module in unit tests */
  getPredictionSignalsFn?: (db: Database, hoursBack: number) => BriefingPredictionSignal[] | Promise<BriefingPredictionSignal[]>;
  /** Override OHLCV row count query for tests — avoids real DB dependency */
  getOhlcvRowCountFn?: (code: string, db: Database) => number;
  /** Override VN-Index fetch for tests — avoids real HTTP calls */
  fetchVnIndexFn?: () => Promise<import("../../infrastructure/fetchers/hose.js").MarketPrice | null>;
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
}

interface WatchlistCodeRow {
  code: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns midnight today in Vietnam timezone (UTC+7) as an ISO 8601 string.
 * E.g. "2026-03-27T17:00:00.000Z" for Vietnam date 2026-03-28.
 */
function midnightVietnamAsUtc(): string {
  const now = new Date();
  const vnNow = new Date(now.getTime() + 7 * 3600_000);
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
export async function assembleEveningSummary(
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
  let vnIndex: VnIndexSnapshot | undefined;
  try {
    const fetchFn =
      options.fetchVnIndexFn ??
      (await import("../../infrastructure/fetchers/hose.js")).fetchVnIndex;
    const mp = await fetchFn();
    if (mp !== null) {
      vnIndex = {
        close: mp.price,
        change: Math.round(mp.price - mp.previousPrice),
        changePct: Math.round(mp.changePct * 100) / 100,
        fetchedAt: mp.fetchedAt,
      };
    }
  } catch (err) {
    logger.warn("[assembleEveningSummary] fetchVnIndex failed", {
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

  const moverRows = db
    .prepare<WatchlistMoverRow, []>(`
      SELECT w.code,
             ${exchangeExpr} AS exchange,
             mp.price,
             mp.change_pct
      FROM watchlist w
      LEFT JOIN market_prices mp ON mp.code = w.code
      WHERE ABS(COALESCE(mp.change_pct, 0)) >= 1.0
      ORDER BY ABS(COALESCE(mp.change_pct, 0)) DESC
    `)
    .all();

  const watchlistMovers: WatchlistMover[] = moverRows.map((row) => ({
    code: row.code,
    changePct: row.change_pct ?? 0,
    price: row.price ?? 0,
    exchange: row.exchange ?? "HOSE",
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
        const sig = taFn(code, db);
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
  } catch (err) {
    logger.warn("[assembleEveningSummary] TA step failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    // taDiag stays at zero-default — no crash
  }

  // ── Step 5: Prediction market signals — medium fallback + diag ──────────────
  let predictionSignals: BriefingPredictionSignal[] = [];
  let predictionDiag: PredictionDiag = { stored: 0 };
  try {
    const signalsFn =
      options.getPredictionSignalsFn ??
      (await import("../../infrastructure/db/predictionStore.js")).getRecentPredictionSignals;
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

  // ── Step 6: Persist summary ───────────────────────────────────────────────
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

  return summary;
}
