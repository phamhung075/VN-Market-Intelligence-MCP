/**
 * Scheduler — Breadth History Persister Job (BREADTH-TIME-SERIES)
 *
 * Cron: `37 8 * * 1-5` (08:37 UTC = 15:37 VN, ~50 min after HOSE close at 14:45 VN).
 * Slot verified free: between reputationCompute (08:33) and alertOutcomeJob (08:45).
 *
 * Purpose:
 *   Fetch today's HOSE market breadth (advancing/declining/unchanged/ceiling/floor)
 *   from the VnDirect vnmarket_prices endpoint (same source as get_market_breadth)
 *   and persist one row per session to market_breadth_history.
 *
 * HARD CONSTRAINTS (NFR-BR-1):
 *   - FORWARD-ACCRUING ONLY — no backfill.
 *   - NFR-BR-1: log the live-fetch source; reject/raise on synthetic rows.
 *     This job ONLY writes rows derived from fetchVnIndexBreadthAndLiquidity().
 *     If the fetch returns null (network failure, VnDirect outage), the job
 *     logs a WARN and skips — no fallback, no fabrication.
 *   - NFR-BR-2: ON CONFLICT(session_date) IGNORE → idempotent, double-fire safe.
 *
 * DDD layer: scheduler — may import from domain, infrastructure, and application.
 *   Imports the fetcher directly (not the MCP tool) for lower overhead.
 *
 * @module scheduler/market-data/breadthHistoryPersisterJob
 */

import { logger } from "../../infrastructure/logger.js";
import { recordJobRun } from "../../infrastructure/db/cronJobRunStore.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { fetchVnIndexBreadthAndLiquidity } from "../../infrastructure/fetchers/hose.js";
import { upsertBreadthRow } from "../../infrastructure/db/breadthHistoryStore.js";
import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const JOB_NAME_BREADTH_PERSISTER = "breadthHistoryPersisterJob";

/**
 * Source label logged with every persisted row (NFR-BR-1: log live-fetch source).
 * This makes it auditable that no row originated from synthetic data.
 */
const LIVE_FETCH_SOURCE = "vndirect:api-finfo.vndirect.com.vn/v4/vnmarket_prices (VNINDEX)";

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

let _isRunning = false;

// ─────────────────────────────────────────────────────────────────────────────
// Main job function
// ─────────────────────────────────────────────────────────────────────────────

export interface BreadthPersisterResult {
  inserted:    boolean;
  session_date: string | null;
  skipped_reason?: string;
}

/**
 * Fetch today's HOSE breadth and persist to market_breadth_history.
 *
 * @param db - Optional DB injection for testing; defaults to production singleton.
 * @returns Result describing whether a new row was inserted or skipped.
 */
export async function runBreadthHistoryPersisterJob(
  db?: Database,
): Promise<BreadthPersisterResult> {
  if (_isRunning) {
    logger.warn(`[${JOB_NAME_BREADTH_PERSISTER}] already running — skipping concurrent fire`);
    return { inserted: false, session_date: null, skipped_reason: 'already_running' };
  }
  _isRunning = true;

  const resolvedDb = db ?? getDb();

  try {
    // ── Live fetch (NFR-BR-1: only real data from live source) ────────────────
    logger.info(`[${JOB_NAME_BREADTH_PERSISTER}] fetching breadth from ${LIVE_FETCH_SOURCE}`);

    const data = await fetchVnIndexBreadthAndLiquidity("VNINDEX");

    if (!data) {
      logger.warn(
        `[${JOB_NAME_BREADTH_PERSISTER}] live fetch returned null — skipping persist. ` +
        `Source: ${LIVE_FETCH_SOURCE}. This is a real market data gap, not synthetic.`
      );
      return { inserted: false, session_date: null, skipped_reason: 'live_fetch_null' };
    }

    const session_date = data.date;

    // ── Validate: reject zero-total rows (thin/halt day is acceptable, but
    //    a row with advancing=0, declining=0, unchanged=0 is suspicious).
    //    Halt days with floor > 0 are still valid — persist them.
    //    Only reject if ALL breadth counters are zero (no market data at all).
    const total = data.advances + data.declines + data.noChange;
    if (total === 0 && data.ceilingStocks === 0 && data.floorStocks === 0) {
      logger.warn(
        `[${JOB_NAME_BREADTH_PERSISTER}] all counters zero — skipping. ` +
        `date=${session_date} advances=${data.advances} declines=${data.declines} ` +
        `noChange=${data.noChange}. Source: ${LIVE_FETCH_SOURCE}`
      );
      return { inserted: false, session_date, skipped_reason: 'all_counters_zero' };
    }

    // ── NFR-BR-1: log source before persisting ─────────────────────────────
    logger.info(
      `[${JOB_NAME_BREADTH_PERSISTER}] persisting session_date=${session_date} ` +
      `adv=${data.advances} decl=${data.declines} unchanged=${data.noChange} ` +
      `ceiling=${data.ceilingStocks} floor=${data.floorStocks} total=${total} ` +
      `source=${LIVE_FETCH_SOURCE}`
    );

    // ── Persist (NFR-BR-2: ON CONFLICT IGNORE = idempotent) ──────────────────
    const inserted = upsertBreadthRow(resolvedDb, {
      session_date,
      advancing:  data.advances,
      declining:  data.declines,
      unchanged:  data.noChange,
      ceiling:    data.ceilingStocks,
      floor:      data.floorStocks,
      total,
    });

    if (inserted) {
      logger.info(`[${JOB_NAME_BREADTH_PERSISTER}] inserted new row for ${session_date}`);
    } else {
      logger.info(`[${JOB_NAME_BREADTH_PERSISTER}] row for ${session_date} already exists — skipped (idempotent)`);
    }

    return { inserted, session_date };
  } finally {
    _isRunning = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron entry point (wraps with recordJobRun)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cron-callable entry point.
 * Wraps runBreadthHistoryPersisterJob with recordJobRun observability.
 */
export async function runBreadthHistoryPersisterJobCron(): Promise<void> {
  const db = getDb();
  await recordJobRun(db, JOB_NAME_BREADTH_PERSISTER, async () => {
    const result = await runBreadthHistoryPersisterJob(db);
    return { rowsWritten: result.inserted ? 1 : 0 };
  });
}
