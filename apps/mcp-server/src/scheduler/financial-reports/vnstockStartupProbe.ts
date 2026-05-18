/**
 * vnstockStartupProbe.ts — Task 1942a
 *
 * Startup backfill probe for vnstock fundamentals data.
 *
 * Fires runVnstockFundamentalsJob() after a 90-second delay when the
 * vnstock_fetch_log table indicates an empty or stale DB (cold Docker restart).
 *
 * Guard conditions (FR-2):
 *   - COUNT(DISTINCT code WHERE data_type='financials') < 10  → cold DB
 *   - last fetched_at > 7 days ago                           → stale data
 *   - Otherwise                                              → warm, skip
 *
 * Design:
 *   - Pure function with injectable deps — enables unit testing without mocks
 *     on module imports (no global state, no real DB calls in tests).
 *   - All errors are caught and logged — probe is non-fatal (FR-6).
 *   - On DB query failure: catch, log at ERROR, fire job anyway (safe: idempotent).
 *   - _isFundamentalsRunning in vnstockFundamentalsJob handles overlap with
 *     Monday cron — no second lock needed here (AC-7).
 *
 * @module scheduler/financial-reports/vnstockStartupProbe
 */

import type { Database } from "bun:sqlite";
import type { VnstockJobResult } from "./vnstockFundamentalsJob.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const DELAY_MS = 90_000;
const COLD_THRESHOLD = 10;
const STALE_DAYS = 7;

// ── Deps interface (injectable for tests) ────────────────────────────────────

export interface VnstockStartupProbeDeps {
  /** Returns the live DB handle */
  getDb: () => Database;
  /** Runs the fundamentals job — defaults to production runVnstockFundamentalsJob */
  runJob: () => Promise<VnstockJobResult>;
  /**
   * Wraps the startup delay.
   * In production: `(ms) => new Promise(res => setTimeout(res, ms))`.
   * In tests: stub to assert ms=90000 or skip waiting.
   */
  scheduleDelay: (ms: number) => Promise<void>;
  /** Log function — defaults to console.log in production wiring */
  log: (msg: string) => void;
}

// ── Probe row types ───────────────────────────────────────────────────────────

interface FetchLogStats {
  cnt: number;
  lastFetch: string | null;
}

// ── Core probe ────────────────────────────────────────────────────────────────

/**
 * Run the vnstock startup backfill probe.
 *
 * Checks vnstock_fetch_log for cold/stale data and conditionally fires
 * runVnstockFundamentalsJob after a 90-second delay.
 *
 * All errors are caught — server startup is never blocked.
 */
export async function runVnstockStartupProbe(
  deps: VnstockStartupProbeDeps,
): Promise<void> {
  const { getDb, runJob, scheduleDelay, log } = deps;

  let shouldFire = false;
  let reason = "";

  try {
    const db = getDb();
    const row = db
      .prepare<FetchLogStats, []>(
        `SELECT
           COUNT(DISTINCT code)  AS cnt,
           MAX(fetched_at)       AS lastFetch
         FROM vnstock_fetch_log
         WHERE data_type = 'financials'`,
      )
      .get();

    const count = row?.cnt ?? 0;

    if (count < COLD_THRESHOLD) {
      shouldFire = true;
      reason = `cold DB detected (${count} distinct financials entries < ${COLD_THRESHOLD} threshold)`;
    } else {
      // Check staleness
      const lastFetch = row?.lastFetch ?? null;
      if (!lastFetch) {
        shouldFire = true;
        reason = `cold DB detected (no fetch timestamp found)`;
      } else {
        const ageMs = Date.now() - new Date(lastFetch).getTime();
        const ageDays = ageMs / 86_400_000;
        if (ageDays > STALE_DAYS) {
          shouldFire = true;
          reason = `stale data detected (last fetch > ${STALE_DAYS} days)`;
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[vnstock-startup] startup probe error: ${msg} — scheduling sweep anyway`);
    shouldFire = true;
    reason = "DB query error (safe fallback)";
  }

  if (!shouldFire) {
    const db = deps.getDb();
    const row = db
      .prepare<FetchLogStats, []>(
        `SELECT COUNT(DISTINCT code) AS cnt, MAX(fetched_at) AS lastFetch
         FROM vnstock_fetch_log WHERE data_type = 'financials'`,
      )
      .get();
    log(
      `[vnstock-startup] DB warm (${row?.cnt ?? 0} distinct financials entries >= ${COLD_THRESHOLD}, age < ${STALE_DAYS}d) — skipping startup sweep`,
    );
    return;
  }

  log(`[vnstock-startup] ${reason} — scheduling sweep in 90s`);
  await scheduleDelay(DELAY_MS);
  log(`[vnstock-startup] firing runVnstockFundamentalsJob after 90s delay`);
  await runJob();
}
