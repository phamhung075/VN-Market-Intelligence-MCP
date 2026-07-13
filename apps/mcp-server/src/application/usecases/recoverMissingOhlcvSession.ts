/**
 * Application Use Case — Recover a Missing Daily OHLCV Session
 *
 * ALPHA-S1-STARTUP-CANDLE-GUARD (2026-07-13): net-new. `ALPHA-S1-CANDLE-RECOVER` (the sibling
 * row this function was originally designed under) closed as a WEEKEND-BLIND FALSE-POSITIVE
 * (2026-07-11 was a Saturday — no candle to recover) and shipped NO code, so this shared
 * primitive was never written. Building it here because `ohlcvCandleGuard.ts`
 * (`runOhlcvCandlePresenceGuard`) depends on it. Design: docs/handoffs/ALPHA-S1-architect-design.md §1.
 *
 * Orchestrates: infra read (`market_prices_history` tick survival check) + the existing
 * `ohlcvDailyAggregatorJob` (re-aggregation, zero changes to that file — reuses its injectable
 * `nowMsFn` extension point) + the `ohlcv_backfill_queue` VPS-relay trigger (same INSERT idiom
 * already used by `ohlcvStartupProbe.ts`). "Orchestrating multiple services" → application/usecases
 * per docs/policies/dev-standards.md § DDD Layer Rules.
 *
 * Idempotent by construction:
 *   - already-present guard (branch 1) — safe to call twice for the same date.
 *   - pending-queue dedup (branch 3b) — never inserts a second `done=0` queue row while one
 *     is still outstanding.
 *
 * @module application/usecases/recoverMissingOhlcvSession
 */

import type { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";
import {
  runOhlcvDailyAggregator,
  type OhlcvAggregatorResult,
} from "../../scheduler/market-data/ohlcvDailyAggregatorJob.js";

export interface RecoverMissingOhlcvSessionDeps {
  db?: Database;
}

export type RecoverMissingOhlcvSessionAction =
  | "none"
  | "reaggregated"
  | "vps-relay-triggered"
  | "vps-relay-already-pending";

export interface RecoverMissingOhlcvSessionResult {
  date: string;
  alreadyPresent: boolean;
  ticksFound: number;
  action: RecoverMissingOhlcvSessionAction;
  aggregatorResult?: OhlcvAggregatorResult;
}

/**
 * Attempt to recover a missing daily_ohlcv session for `date` (YYYY-MM-DD, VN calendar date).
 *
 * Branches (evaluated in order):
 *   1. `daily_ohlcv` already has >=1 row for `date` → no-op (`action: "none"`).
 *   2. Surviving intraday ticks exist in `market_prices_history` for the VN trading window
 *      of `date` → re-aggregate via the EXISTING aggregator's injectable `nowMsFn` (watchlist
 *      only — does NOT cover VNINDEX; caller must check VNINDEX separately).
 *   3. No ticks survived → force the VPS-relay pipeline by inserting a fresh
 *      `ohlcv_backfill_queue` row (dedup: skip insert if a `done=0` row is already pending).
 */
export async function recoverMissingOhlcvSession(
  date: string,
  deps?: RecoverMissingOhlcvSessionDeps,
): Promise<RecoverMissingOhlcvSessionResult> {
  const db = deps?.db ?? getDb();

  // 1. Idempotent no-op guard.
  const already = db
    .prepare<{ n: number }, [string]>("SELECT COUNT(*) as n FROM daily_ohlcv WHERE date = ?")
    .get(date);
  if ((already?.n ?? 0) > 0) {
    return { date, alreadyPresent: true, ticksFound: 0, action: "none" };
  }

  // 2. Probe surviving ticks for the VN trading window of `date`.
  //    VN midnight(date) in UTC = date T00:00 − 7h.
  const vnMidnightUtcMs = new Date(`${date}T00:00:00Z`).getTime() - 7 * 3_600_000;
  const vnNextMidnightUtcMs = vnMidnightUtcMs + 24 * 3_600_000;
  const tickRow = db
    .prepare<{ n: number }, [string, string]>(
      "SELECT COUNT(*) as n FROM market_prices_history WHERE fetched_at >= ? AND fetched_at < ?",
    )
    .get(new Date(vnMidnightUtcMs).toISOString(), new Date(vnNextMidnightUtcMs).toISOString());
  const ticksFound = tickRow?.n ?? 0;

  // 3a. Ticks survive — re-aggregate via the EXISTING aggregator's injectable `nowMsFn`
  //     (zero change to ohlcvDailyAggregatorJob.ts). NOTE: watchlist-scoped only — does
  //     NOT cover VNINDEX; caller must not assume this branch alone is a complete recovery
  //     when VNINDEX is also missing.
  //
  //     nowMs passed to the aggregator MUST be the END of the VN session window (one ms
  //     before vnNextMidnightUtcMs), not merely "any timestamp inside the session" —
  //     runOhlcvDailyAggregator's own window is [vnMidnightUtcMs(nowMs), nowMs), so nowMs
  //     doubles as the window's upper bound. Anything earlier (e.g. VN-midnight + a few
  //     hours) truncates the capture to only the pre-market/early-session ticks and misses
  //     the actual afternoon-session close — corrupting the recovered candle's close/high/
  //     low. Using vnNextMidnightUtcMs − 1 reuses the exact same full-day window already
  //     computed for the tick-survival probe above, so the FULL day's ticks are captured.
  if (ticksFound > 0) {
    const windowEndMs = vnNextMidnightUtcMs - 1;
    const aggregatorResult = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => windowEndMs,
      sendWorkFn: async () => {}, // suppress duplicate WORK alert — caller alerts once
    });
    return { date, alreadyPresent: false, ticksFound, action: "reaggregated", aggregatorResult };
  }

  // 3b. No ticks survived — force the VPS-relay pipeline (fail-loud caller decides alerting).
  //     Dedup: a pending row already covers the next poll cycle regardless of why it was queued.
  const pending = db
    .prepare<{ id: number }, []>("SELECT id FROM ohlcv_backfill_queue WHERE done = 0 LIMIT 1")
    .get();
  if (pending) {
    return { date, alreadyPresent: false, ticksFound: 0, action: "vps-relay-already-pending" };
  }
  db.prepare("INSERT INTO ohlcv_backfill_queue (queued_at, done) VALUES (datetime('now'), 0)").run();
  return { date, alreadyPresent: false, ticksFound: 0, action: "vps-relay-triggered" };
}
