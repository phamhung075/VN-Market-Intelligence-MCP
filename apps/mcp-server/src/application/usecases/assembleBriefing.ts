/**
 * Assemble Morning Briefing — Task 101 (Application Layer)
 *
 * Orchestrates a complete daily digest before Vietnamese market open (08:00 GMT+7).
 * `_assembleBriefingImpl` is a thin 19-step sequencer — each step's query/compute
 * logic lives in its own module under `usecases/briefing/`
 * (FACTORY-APP-split-assembleBriefing). Public exports (DailyBriefing,
 * defaultComputeTa, queryForeignFlowSummary_TEST, BEARISH_WARNING_THRESHOLD, ...)
 * are re-exported here verbatim so every existing import site is unaffected.
 *
 * Layer: application/usecases — may import from domain/, infrastructure/, and
 * its own usecases/briefing/ step modules.
 */

import type { Database } from "bun:sqlite";
import { midnightVietnamAsUtc, todayVietnam } from "../../domain/services/timeHelpers.js";
import type { BriefingPredictionSignal } from "../../infrastructure/db/predictionStore.js";
import type { PortfolioPnlResult } from "../../domain/services/portfolioPnlCalculator.js";

import { runPollNewsStep } from "./briefing/runPollNewsStep.js";
import { runVnIndexStep } from "./briefing/runVnIndexStep.js";
import { queryTopStories } from "./briefing/queryTopStories.js";
import { queryUnreadAlerts } from "./briefing/queryUnreadAlerts.js";
import { queryWatchlistSummary } from "./briefing/queryWatchlistSummary.js";
import { queryNewReports } from "./briefing/queryNewReports.js";
import { queryMacroSnapshot } from "./briefing/queryMacroSnapshot.js";
import { querySensitiveWarnings } from "./briefing/querySensitiveWarnings.js";
import { queryTrackedCommodities } from "./briefing/queryTrackedCommodities.js";
import { autoResolveStaleAlerts } from "./briefing/autoResolveStaleAlerts.js";
import { queryUnresolvedAlerts } from "./briefing/queryUnresolvedAlerts.js";
import { computeTopConviction } from "./briefing/computeTopConviction.js";
import { queryPredictionSignals } from "./briefing/queryPredictionSignals.js";
import { computePortfolioPnlStep } from "./briefing/computePortfolioPnlStep.js";
import { queryInsiderRecent } from "./briefing/queryInsiderRecent.js";
import { queryForeignFlowSummaryStep, queryForeignFlowSummary } from "./briefing/queryForeignFlowSummary.js";
import { queryEvidenceTopScores } from "./briefing/queryEvidenceTopScores.js";
import { computeTaSummary } from "./briefing/computeTaSummary.js";
import { queryUpcomingDeadlines } from "./briefing/queryUpcomingDeadlines.js";
import { queryGlobalSnapshot } from "./briefing/queryGlobalSnapshot.js";
import { persistBriefing } from "./briefing/persistBriefing.js";
import { checkFreshnessGate } from "./briefing/checkFreshnessGate.js";

// ── Re-exports (backward compatibility — FACTORY-APP-split-assembleBriefing) ──
export { BEARISH_WARNING_THRESHOLD } from "./briefing/queryEvidenceTopScores.js";
export { defaultComputeTa } from "./briefing/defaultComputeTa.js";
/**
 * Test-only export: exposes the raw (throwing) queryForeignFlowSummary for
 * unit tests that need to exercise the SQL filter logic with an injected
 * in-memory DB.
 * @internal
 */
export const queryForeignFlowSummary_TEST = queryForeignFlowSummary;
export type {
  GlobalSnapshot,
  TopStory,
  BriefingAlert,
  WatchlistEntry,
  NewReport,
  VnIndexSnapshot,
  InsiderBriefingRow,
  ForeignFlowBriefingRow,
  TaSignal,
  BctcDeadlineRow,
  EvidenceScoreBriefingRow,
  MacroIndicator,
} from "./briefing/types.js";
import type {
  GlobalSnapshot,
  TopStory,
  BriefingAlert,
  WatchlistEntry,
  NewReport,
  VnIndexSnapshot,
  InsiderBriefingRow,
  ForeignFlowBriefingRow,
  TaSignal,
  BctcDeadlineRow,
  EvidenceScoreBriefingRow,
  MacroIndicator,
  TopConviction,
} from "./briefing/types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

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
  trackedCommodities: { indicator: string; value: number; unit: string; dataPoints: number; previousValue?: number; isStale?: boolean }[];
  /** Unresolved HIGH/CRITICAL alerts from previous session (not yet read) */
  unresolvedAlerts: BriefingAlert[];
  /** Top conviction signal — cross-validated strongest signal for today */
  topConviction: TopConviction | null;
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
  /** BCTC filing deadlines within 14 days for unfiled watchlist stocks; absent on error */
  upcomingDeadlines?: BctcDeadlineRow[];
  /** Global market snapshot (VIX, DXY, S&P500, Hang Seng); absent when commodity_prices empty */
  globalSnapshot?: GlobalSnapshot;
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
 * @param sendTelegramFn  - Override for Telegram sending (for testing freshness gate)
 */
export interface AssembleBriefingOptions {
  db?: Database;
  pollNewsFn?: () => Promise<unknown>;
  fetchVnIndexFn?: () => Promise<VnIndexSnapshot | null>;
  briefingsDir?: string;
  /**
   * Override TA computation per ticker for test injection.
   * Receives the ticker code and the active DB.
   * Returns null when data is insufficient (< 35 candles).
   * Accepts both sync and async implementations (default is async Go engine).
   */
  computeTaFn?: (code: string, db: Database) => TaSignal | null | Promise<TaSignal | null>;
  /**
   * Injectable clock for Step 18 date computation.
   * Tests always set this. Production leaves it undefined — defaults to new Date().
   */
  nowFn?: () => Date;
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
 * Overloads for assembleBriefing function to support both calling patterns.
 * Pattern 1: assembleBriefing(options: AssembleBriefingOptions)
 * Pattern 2: assembleBriefing(db: Database, sendTelegramFn: (channel, message) => Promise<void>) [for tests]
 */
export async function assembleBriefing(
  dbOrOptions: Database | AssembleBriefingOptions = {},
  sendTelegramFn?: (channel: string, message: string) => Promise<void>,
): Promise<DailyBriefing> {
  // Normalize arguments: handle both calling patterns
  let options: AssembleBriefingOptions;
  if (dbOrOptions && "prepare" in dbOrOptions) {
    // It's a Database instance (has prepare method)
    options = { db: dbOrOptions, sendTelegramFn };
  } else {
    // It's an options object
    options = (dbOrOptions as AssembleBriefingOptions) ?? {};
  }

  return _assembleBriefingImpl(options);
}

/**
 * Internal implementation of assembleBriefing — thin 19-step sequencer.
 *
 * Each step's query/compute logic lives in usecases/briefing/; this function
 * only resolves shared inputs (db, midnight boundary, watchlist rows),
 * invokes each step function in order, and assembles + persists the result.
 * Per-step error isolation is now encapsulated INSIDE each step function
 * (same catch/log behavior as before the split — just co-located with the
 * step's own logic rather than centralized here).
 *
 * @param options - Injectable dependencies; all are optional for production use.
 * @returns       - Structured DailyBriefing object.
 */
async function _assembleBriefingImpl(
  options: AssembleBriefingOptions = {},
): Promise<DailyBriefing> {
  const db =
    options.db ??
    (await (async () => {
      const { getDb } = await import("../../infrastructure/db/schema.js");
      return getDb();
    })());

  const briefingsDir = options.briefingsDir ?? "./data/briefings";
  const midnight = midnightVietnamAsUtc();

  await runPollNewsStep(db, options.pollNewsFn);
  const vnIndex = await runVnIndexStep(options.fetchVnIndexFn);

  const topStories = queryTopStories(db, midnight);
  const alerts = queryUnreadAlerts(db);
  const { watchlistRows, watchlistSummary } = queryWatchlistSummary(db);
  const newReports = queryNewReports(db, midnight);
  const macroSnapshot = await queryMacroSnapshot();
  const sensitiveWarnings = await querySensitiveWarnings();
  const trackedCommodities = await queryTrackedCommodities(db);

  autoResolveStaleAlerts(db);
  const unresolvedAlerts = queryUnresolvedAlerts(db);

  const topConviction = await computeTopConviction(db, watchlistRows);
  const predictionSignals = await queryPredictionSignals(db);
  const portfolioPnl = await computePortfolioPnlStep(db);

  const watchlistCodes = watchlistRows.map((r) => r.code);
  const insiderRecent = queryInsiderRecent(db, watchlistCodes);
  const foreignFlowSummary = queryForeignFlowSummaryStep(db, watchlistCodes);
  const evidenceTopScores = queryEvidenceTopScores(db, watchlistCodes);
  const taSummary = await computeTaSummary(db, watchlistRows, options.computeTaFn);

  const today = (options.nowFn ?? (() => new Date()))();
  const upcomingDeadlines = queryUpcomingDeadlines(db, watchlistRows, today);
  const globalSnapshot = queryGlobalSnapshot(db);

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
    upcomingDeadlines,
    ...(globalSnapshot !== undefined ? { globalSnapshot } : {}),
    generatedAt,
  };

  persistBriefing(briefing, briefingsDir);
  await checkFreshnessGate(db, options.sendTelegramFn);

  return briefing;
}
