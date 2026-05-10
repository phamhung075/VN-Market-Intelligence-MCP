/**
 * verdictResolutionJob — Signal verdict resolver (Task 1863)
 *
 * Resolves pending agent_signals verdicts by comparing price at signal
 * creation vs. price 4 hours later. Runs as an hourly cron job.
 *
 * Resolution rules:
 *   abs(pct) < 1.0  → confirmed   (flat, no harmful move)
 *   bullish + pct ≥  1.0  → confirmed
 *   bullish + pct ≤ -1.0  → false_positive
 *   bearish + pct ≤ -1.0  → confirmed
 *   bearish + pct ≥  1.0  → false_positive   ← known gap covered by 1863f
 *
 * 24h window guard:
 *   Signals created within the last 24 hours are NOT resolved by the
 *   hour-cron pass. Only signals older than 24h enter verdict logic.
 *   This prevents premature resolution on fresh signals with incomplete
 *   price windows.
 *
 * TTL pruning:
 *   Signals older than 30 days with outcome still NULL are pruned (deleted)
 *   at the end of each run to prevent unbounded table growth.
 *
 * Fail-loud:
 *   If the price fetch query throws, the error is sent to the BUG Telegram
 *   channel once per job run (not per signal), and that signal is skipped.
 *
 * DDD layer: scheduler — may import from domain/ and infrastructure/.
 * MUST NOT import from application/ or interface/.
 *
 * @module scheduler/alerts/verdictResolutionJob
 * Task: 1863
 */

import type { Database } from "bun:sqlite";
import { recordOutcome } from "../../infrastructure/db/agentSignalStore.js";
import { getDb } from "../../infrastructure/db/schema.js";

// ── Constants ──────────────────────────────────────────────────────────────

/** Signals created within this window (hours) are skipped by the hour-cron. */
export const VERDICT_GUARD_HOURS = 24;

/** Signals older than this (days) with no verdict are pruned. */
export const VERDICT_TTL_DAYS = 30;

/** Price movement threshold for flat/directional classification. */
const FLAT_THRESHOLD_PCT = 1.0;

// ── Types ──────────────────────────────────────────────────────────────────

export interface VerdictResolutionDeps {
  db?: Database;
  nowFn?: () => Date;
  /** Injectable bug reporter — defaults to sendTelegramBug. */
  bugReporter?: (message: string) => Promise<void>;
}

export interface VerdictResolutionResult {
  evaluated: number;
  confirmed: number;
  false_positive: number;
  skipped: number;
  pruned: number;
}

// ── Internal types ─────────────────────────────────────────────────────────

interface SignalRow {
  id: number;
  signal_type: string;
  stock_code: string | null;
  payload: string;
  created_at: string;
}

interface PriceRow {
  avg_price: number;
}

// ── Direction inference ────────────────────────────────────────────────────

type Direction = "bullish" | "bearish";

/**
 * Infer signal direction from signal_type and payload JSON.
 * Matches the signalOutcomeJob inference rules for consistency.
 */
function inferDirection(signalType: string, payloadJson: string): Direction {
  if (signalType === "ta_overbought") return "bearish";

  if (signalType === "price_anomaly") {
    try {
      const p = JSON.parse(payloadJson) as Record<string, unknown>;
      if (p.direction === "down") return "bearish";
    } catch {
      // unparseable → bullish
    }
    return "bullish";
  }

  // ta_oversold, chain_catalyst, verified_chain, urgent_news → bullish
  return "bullish";
}

// ── Core function ──────────────────────────────────────────────────────────

/**
 * Run verdict resolution on pending agent_signals.
 *
 * Skips signals created within VERDICT_GUARD_HOURS (24h).
 * Prunes unresolved signals older than VERDICT_TTL_DAYS (30 days).
 * Sends one BUG alert if any price fetch fails.
 *
 * @param deps - Injectable deps for testability (db, nowFn, bugReporter)
 * @returns    Summary counts
 */
export async function runVerdictResolutionJob(
  deps?: VerdictResolutionDeps,
): Promise<VerdictResolutionResult> {
  const db: Database = deps?.db ?? getDb();
  const now = deps?.nowFn?.() ?? new Date();
  const bugReporter = deps?.bugReporter ?? defaultBugReporter;

  const result: VerdictResolutionResult = {
    evaluated: 0,
    confirmed: 0,
    false_positive: 0,
    skipped: 0,
    pruned: 0,
  };

  // 1. Compute 24h guard cutoff (signals created after this are too fresh)
  const guardCutoff = new Date(now.getTime() - VERDICT_GUARD_HOURS * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");

  // 2. Read pending signals older than 24h (outcome IS NULL or 'fired')
  const rows = db
    .query<SignalRow, [string]>(
      `SELECT id, signal_type, stock_code, payload, created_at
         FROM agent_signals
        WHERE (outcome IS NULL OR outcome = 'fired')
          AND created_at <= ?
        ORDER BY id ASC`,
    )
    .all(guardCutoff);

  let priceFetchErrorSent = false;

  for (const row of rows) {
    result.evaluated++;

    // No stock_code → market-wide signal, skip
    if (!row.stock_code) {
      result.skipped++;
      continue;
    }

    // Baseline price: 30-min window around created_at
    let baseline: PriceRow | null = null;
    try {
      baseline = db
        .query<PriceRow, [string, string, string]>(
          `SELECT AVG(price) AS avg_price
             FROM market_prices_history
            WHERE code = ?
              AND fetched_at >= datetime(?, '-15 minutes')
              AND fetched_at <= datetime(?, '+15 minutes')`,
        )
        .get(row.stock_code, row.created_at, row.created_at);
    } catch (err) {
      if (!priceFetchErrorSent) {
        priceFetchErrorSent = true;
        await bugReporter(
          `[verdictResolutionJob] price fetch error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      result.skipped++;
      continue;
    }

    // Resolution price: 30-min window starting 4h after created_at
    let resolution: PriceRow | null = null;
    try {
      resolution = db
        .query<PriceRow, [string, string, string]>(
          `SELECT AVG(price) AS avg_price
             FROM market_prices_history
            WHERE code = ?
              AND fetched_at >= datetime(?, '+240 minutes')
              AND fetched_at <= datetime(?, '+270 minutes')`,
        )
        .get(row.stock_code, row.created_at, row.created_at);
    } catch (err) {
      if (!priceFetchErrorSent) {
        priceFetchErrorSent = true;
        await bugReporter(
          `[verdictResolutionJob] price fetch error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      result.skipped++;
      continue;
    }

    const basePrice = baseline?.avg_price ?? null;
    const resPrice = resolution?.avg_price ?? null;

    // Missing price data → skip (weekend gap, no data yet)
    if (basePrice === null || resPrice === null || basePrice === 0) {
      result.skipped++;
      continue;
    }

    const pct = ((resPrice - basePrice) / basePrice) * 100;
    const direction = inferDirection(row.signal_type, row.payload);

    let outcome: "confirmed" | "false_positive";
    let detail: string;

    if (Math.abs(pct) < FLAT_THRESHOLD_PCT) {
      // Flat movement — no harmful move → confirmed
      outcome = "confirmed";
      detail = `flat move ${pct.toFixed(2)}%`;
    } else if (direction === "bullish") {
      if (pct >= FLAT_THRESHOLD_PCT) {
        outcome = "confirmed";
        detail = `bullish +${pct.toFixed(2)}%`;
      } else {
        outcome = "false_positive";
        detail = `bullish expected but ${pct.toFixed(2)}%`;
      }
    } else {
      // bearish
      if (pct <= -FLAT_THRESHOLD_PCT) {
        outcome = "confirmed";
        detail = `bearish ${pct.toFixed(2)}%`;
      } else {
        // bearish signal but price went up → false_positive
        outcome = "false_positive";
        detail = `bearish expected but +${pct.toFixed(2)}%`;
      }
    }

    recordOutcome(db, row.id, outcome, detail);

    if (outcome === "confirmed") result.confirmed++;
    else result.false_positive++;
  }

  // 3. TTL pruning: delete unresolved signals older than VERDICT_TTL_DAYS
  const pruneResult = pruneStaleVerdicts(db, now);
  result.pruned = pruneResult;

  return result;
}

// ── TTL pruning ────────────────────────────────────────────────────────────

/**
 * Delete agent_signals rows where outcome IS NULL and
 * created_at is older than VERDICT_TTL_DAYS (30 days).
 *
 * @param db  - Active SQLite connection
 * @param now - Current time reference (injectable for tests)
 * @returns   Number of rows deleted
 */
export function pruneStaleVerdicts(db: Database, now: Date): number {
  const cutoff = new Date(now.getTime() - VERDICT_TTL_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");

  const result = db
    .prepare(
      `DELETE FROM agent_signals
        WHERE outcome IS NULL
          AND created_at < ?`,
    )
    .run(cutoff);

  return result.changes;
}

// ── Default bug reporter ───────────────────────────────────────────────────

/**
 * Default BUG channel reporter — lazy-imports to avoid load cost in tests.
 */
async function defaultBugReporter(message: string): Promise<void> {
  const { sendTelegramBug } = await import(
    "../../infrastructure/notifiers/telegram.js"
  );
  await sendTelegramBug(message);
}

// ── Cron wrapper ───────────────────────────────────────────────────────────

/**
 * Production cron entry point.
 * Called by the scheduler hourly (or post-close daily catch-up).
 */
export async function runVerdictResolutionJobCron(): Promise<void> {
  try {
    const result = await runVerdictResolutionJob();
    console.log(
      `[verdictResolutionJob] evaluated=${result.evaluated} confirmed=${result.confirmed} ` +
      `false_positive=${result.false_positive} skipped=${result.skipped} pruned=${result.pruned}`,
    );
  } catch (error) {
    console.error("[verdictResolutionJob] cron failed:", error);
    throw error;
  }
}
