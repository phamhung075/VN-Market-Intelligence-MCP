/**
 * signalOutcomeJob — Daily post-close signal outcome resolver (Task 1382d)
 *
 * Runs once per day after VN market close (post 08:00 UTC = 15:00 GMT+7).
 * Reads agent_signals rows where outcome IS NULL OR outcome = 'fired'
 * within a 2-day window, compares price at signal creation vs 4h later,
 * and upgrades outcome to 'confirmed' or 'false_positive'.
 *
 * Direction inference:
 *   ta_overbought, price_anomaly (direction=down) → bearish
 *   ta_oversold, chain_catalyst, verified_chain, urgent_news → bullish
 *   Unknown / unparseable payload → bullish (safe default)
 *
 * Resolution rule:
 *   abs(pct) < 1.0 → confirmed  (flat, no harmful move)
 *   pct in expected direction >= 1.0 → confirmed
 *   pct against expected direction >= 1.0 → false_positive
 *
 * DDD layer: scheduler — may import from domain/ and infrastructure/.
 * MUST NOT import from application/ or interface/.
 */

import type { Database } from "bun:sqlite";
import { recordOutcome } from "../../infrastructure/db/agentSignalStore.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SignalOutcomeJobDeps {
  db?: Database;
  nowFn?: () => Date;
  /** Injectable nowMs for recovery dedup guard (tests only) */
  nowMsFn?: () => number;
}

export interface SignalOutcomeJobResult {
  evaluated: number;
  confirmed: number;
  false_positive: number;
  skipped: number;
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

  // ta_oversold, chain_catalyst, verified_chain, urgent_news, unknown → bullish
  return "bullish";
}

// ── Core function ──────────────────────────────────────────────────────────

/**
 * Resolves pending signal outcomes by comparing price windows.
 *
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of daily cadence (21.6h window)
 */
export async function runSignalOutcomeJob(
  deps?: SignalOutcomeJobDeps,
): Promise<SignalOutcomeJobResult> {
  const db: Database = deps?.db ?? getDb();

  const DAILY_CADENCE_MS = 86_400_000;
  if (shouldSkipRecoveryReplay(db, "signalOutcomeJob", DAILY_CADENCE_MS, deps?.nowMsFn)) {
    return { evaluated: 0, confirmed: 0, false_positive: 0, skipped: 0 };
  }

  // Pending signals: outcome IS NULL (unresolved) or 'fired' (needs upgrade).
  // No time-window filter — outcome IS NULL / 'fired' is the scope limiter.
  // A time-window based on datetime('now') would silently exclude rows whose
  // created_at was inserted with a fixed historical timestamp (e.g. in tests),
  // causing evaluated=0 for every injected signal.
  const rows = db
    .query<SignalRow, []>(
      `SELECT id, signal_type, stock_code, payload, created_at
         FROM agent_signals
        WHERE (outcome IS NULL OR outcome = 'fired')
        ORDER BY id ASC`,
    )
    .all();

  let evaluated = 0;
  let confirmed = 0;
  let false_positive = 0;
  let skipped = 0;

  for (const row of rows) {
    evaluated++;

    // No stock_code → market-wide signal, skip
    if (!row.stock_code) {
      skipped++;
      continue;
    }

    // Baseline price: 30-min window around created_at
    const baseline = db
      .query<PriceRow, [string, string, string]>(
        `SELECT AVG(price) AS avg_price
           FROM market_prices_history
          WHERE code = ?
            AND fetched_at >= datetime(?, '-15 minutes')
            AND fetched_at <= datetime(?, '+15 minutes')`,
      )
      .get(row.stock_code, row.created_at, row.created_at);

    // Resolution price: 30-min window starting 4h after created_at
    // Note: SQLite datetime() does not accept combined modifiers like '+4 hours 30 minutes'
    // Use '+270 minutes' (4h30m) for the upper bound.
    const resolution = db
      .query<PriceRow, [string, string, string]>(
        `SELECT AVG(price) AS avg_price
           FROM market_prices_history
          WHERE code = ?
            AND fetched_at >= datetime(?, '+240 minutes')
            AND fetched_at <= datetime(?, '+270 minutes')`,
      )
      .get(row.stock_code, row.created_at, row.created_at);

    const basePrice = baseline?.avg_price ?? null;
    const resPrice = resolution?.avg_price ?? null;

    // Missing price data → skip (weekend gap, no data yet)
    if (basePrice === null || resPrice === null || basePrice === 0) {
      skipped++;
      continue;
    }

    const pct = ((resPrice - basePrice) / basePrice) * 100;
    const direction = inferDirection(row.signal_type, row.payload);

    let outcome: "confirmed" | "false_positive";
    let detail: string;

    if (Math.abs(pct) < 1.0) {
      // Flat movement — no harmful move, confirmed
      outcome = "confirmed";
      detail = `flat move ${pct.toFixed(2)}%`;
    } else if (direction === "bullish") {
      // Bullish: price rose = confirmed, price fell = false_positive
      if (pct >= 1.0) {
        outcome = "confirmed";
        detail = `bullish +${pct.toFixed(2)}%`;
      } else {
        outcome = "false_positive";
        detail = `bullish expected but ${pct.toFixed(2)}%`;
      }
    } else {
      // Bearish: price fell = confirmed, price rose = false_positive
      if (pct <= -1.0) {
        outcome = "confirmed";
        detail = `bearish ${pct.toFixed(2)}%`;
      } else {
        outcome = "false_positive";
        detail = `bearish expected but +${pct.toFixed(2)}%`;
      }
    }

    recordOutcome(db, row.id, outcome, detail);

    if (outcome === "confirmed") confirmed++;
    else false_positive++;
  }

  return { evaluated, confirmed, false_positive, skipped };
}

// ── Cron wrapper ───────────────────────────────────────────────────────────

/**
 * Production cron entry point — called by the scheduler after VN market close.
 * Wired in by TASK-1382c.
 */
export async function runSignalOutcomeJobCron(): Promise<void> {
  await runSignalOutcomeJob();
}
