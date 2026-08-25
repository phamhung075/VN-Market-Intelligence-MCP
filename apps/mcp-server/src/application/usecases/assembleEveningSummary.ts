/**
 * Assemble Evening Summary — Task 105 (Application Layer)
 *
 * Orchestrates an end-of-day digest at 22:00 GMT+7, bookending the morning
 * briefing (task 101) with a look-back over the full trading day.
 * `_assembleEveningSummaryImpl` is a thin step sequencer — each step's
 * query/compute logic lives in its own module under `usecases/eveningSummary/`
 * (FACTORY-APP-split-assembleEveningSummary, mirroring the sibling
 * FACTORY-APP-split-assembleBriefing split). Public exports (EveningSummary,
 * VnIndexSnapshot, ForeignFlowMover, WatchlistMover, AssembleEveningSummaryOptions, ...)
 * are re-exported here verbatim so every existing import site is unaffected.
 *
 * Layer: application/usecases — may import from domain/, infrastructure/, and
 * its own usecases/eveningSummary/ step modules.
 * Mirrors assembleBriefing.ts structure for consistency.
 */

import type { Database } from "bun:sqlite";

// Re-use shared types from assembleBriefing to avoid duplication
import type { BriefingAlert, TopStory, TaSignal, GlobalSnapshot } from "./assembleBriefing.js";
import type { BriefingPredictionSignal } from "../../infrastructure/db/predictionStore.js";
import type { PortfolioPnlResult } from "../../domain/services/portfolioPnlCalculator.js";
// ── Centralized helpers (FACTORY-APP-dedup-date-freshness-helpers) ─────────
// midnightVietnamAsUtc/todayVietnam/parseAffectedCodes/isPriceFresh were
// duplicated verbatim from assembleBriefing.ts — now one home each; local
// copies removed below.
import { midnightVietnamAsUtc, todayVietnam } from "../../domain/services/timeHelpers.js";

import { queryVnIndexSnapshot } from "./eveningSummary/queryVnIndexSnapshot.js";
// Genuinely identical query (same SQL, same mapping) to morning briefing's own Step 3 —
// reused directly rather than duplicated (FACTORY-APP-split-assembleEveningSummary's
// stated intent). Every OTHER step below has verified behavioral differences from its
// briefing counterpart (documented in each eveningSummary/ module's own header) and is
// intentionally NOT shared.
import { queryTopStories } from "./briefing/queryTopStories.js";
import { queryNewsCount } from "./eveningSummary/queryNewsCount.js";
import { queryTopAlerts } from "./eveningSummary/queryTopAlerts.js";
import { queryWatchlistMovers } from "./eveningSummary/queryWatchlistMovers.js";
import { computeTaSummaryStep } from "./eveningSummary/computeTaSummaryStep.js";
import { queryForeignFlowMovers } from "./eveningSummary/queryForeignFlowMovers.js";
import { queryPredictionSignalsStep } from "./eveningSummary/queryPredictionSignalsStep.js";
import { computePortfolioPnlStep } from "./eveningSummary/computePortfolioPnlStep.js";
import { queryGlobalSnapshotStep } from "./eveningSummary/queryGlobalSnapshotStep.js";
import { queryDataTimestamps } from "./eveningSummary/queryDataTimestamps.js";
import { persistEveningSummary } from "./eveningSummary/persistEveningSummary.js";
import { checkFreshnessGate } from "./eveningSummary/checkFreshnessGate.js";

// ── Re-exports (backward compatibility — FACTORY-APP-split-assembleEveningSummary) ──
export type {
  VnIndexSnapshot,
  PredictionDiag,
  TaDiag,
  ForeignFlowMover,
  WatchlistMover,
} from "./eveningSummary/types.js";
import type {
  VnIndexSnapshot,
  PredictionDiag,
  TaDiag,
  ForeignFlowMover,
  WatchlistMover,
} from "./eveningSummary/types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

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
 * Internal implementation of assembleEveningSummary — thin step sequencer.
 *
 * Each step's query/compute logic lives in usecases/eveningSummary/; this
 * function only resolves shared inputs (db, midnight boundary), invokes each
 * step function in order, and assembles + persists the result. Per-step
 * error isolation is encapsulated INSIDE each step function (same
 * catch/log behavior as before the split — just co-located with the step's
 * own logic rather than centralized here).
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

  // ── Step 0: VN-Index snapshot (best-effort, front-loaded) ────────────────
  const vnIndex = await queryVnIndexSnapshot(db, options.fetchVnIndexFn);

  // ── Step 1: Top 5 stories since midnight ─────────────────────────────────
  const midnight = midnightVietnamAsUtc();
  const topStories = queryTopStories(db, midnight);

  // ── News count since midnight (diagnostic field) ──────────────────────────
  const newsCount = queryNewsCount(db, midnight, options.getNewsCountFn);

  // ── Step 2: Alerts from last 24 hours, sorted by severity DESC ────────────
  const topAlerts = queryTopAlerts(db);

  // ── Step 3: Watchlist movers (|changePct| >= 1.0) ─────────────────────────
  const watchlistMovers = queryWatchlistMovers(db);

  // ── Step 4: TA signals (mutates watchlistMovers[].rsi14 in place) ────────
  const { taSummary, taDiag } = await computeTaSummaryStep(
    db,
    watchlistMovers,
    options.computeTaFn,
    options.getOhlcvRowCountFn,
  );

  // ── Step 4b: Foreign flow movers (Task 1503) ─────────────────────────────
  const foreignFlowMovers = queryForeignFlowMovers(db, options.getForeignFlowMoversFn);

  // ── Step 5: Prediction market signals — medium fallback + diag ──────────
  const { predictionSignals, predictionDiag } = await queryPredictionSignalsStep(
    db,
    options.getPredictionSignalsFn,
  );

  // ── Step 5b: Portfolio P&L snapshot (best-effort) ────────────────────────
  const portfolioPnl = await computePortfolioPnlStep(db, options.getPnlFn);

  // ── Step 6b: Global snapshot (VIX / DXY / SP500 / Hang Seng) ─────────────
  const globalSnapshot = queryGlobalSnapshotStep(db);

  // ── Step 6c: Fetch data timestamps for FR-3 crisis detection ────────────
  const { lastPriceUpdate, lastNewsUpdate } = queryDataTimestamps(db);

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

  persistEveningSummary(summary, reportsDir);

  // ── Step 8: Freshness gate — check if market prices are stale ─────────────
  await checkFreshnessGate(db, options.sendTelegramFn);

  return summary;
}
