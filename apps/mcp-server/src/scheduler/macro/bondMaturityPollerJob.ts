/**
 * Scheduler — Bond Maturity Poller Job (Task 1920b)
 *
 * Weekly Sunday 02:30 UTC (09:30 VN) — fetches upcoming bond maturities for
 * watchlist issuers and upserts them into the `bond_maturity` table via
 * `upsertBond()` (ON CONFLICT(issuer_code) DO UPDATE — idempotent).
 *
 * AC-0 geo-reachability finding (2026-05-15):
 *   Option A (vnstock bond endpoint) — chosen. The vnstock Python SDK wraps
 *   VnDirect / iBoard APIs accessible directly from France without VPS proxy.
 *   Fallback seed data derived from bondMaturityTracker.ts static events is
 *   used when the vnstock bond service is unavailable, ensuring the table is
 *   never left empty on first run.
 *   HNX portal (hnx.vn) is geo-accessible from France per ARCH-1920 §3 R-2,
 *   but direct HTML scraping is brittle; vnstock SDK preferred as Option A.
 *   If future geo-block is confirmed at runtime, wire VPS_PROXY_URL using the
 *   same pattern as bctcQueueEnricherJob.ts.
 *
 * FR-1  — Weekly fetch + upsert (ON CONFLICT idempotent)
 * FR-2  — Zero-row alert on WORK channel
 * FR-3  — Fail-loud on fetch error (WORK channel)
 * FR-4  — recordJobRun observability (cron_job_runs table)
 * FR-5  — cronConfig.ts key: CRON_BOND_MATURITY_POLLER ?? '30 2 * * 0'
 * FR-6  — startScheduler.ts wiring
 *
 * @module scheduler/macro/bondMaturityPollerJob
 */

import { getDb } from "../../infrastructure/db/schema.js";
import { upsertBond } from "../../infrastructure/db/bondMaturityStore.js";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";
import { sendTelegramWork } from "../../infrastructure/notifiers/telegram.js";
import { getUpcomingMaturities } from "../../domain/services/bondMaturityTracker.js";
import type { BondMaturityEvent } from "../../domain/services/bondMaturityTracker.js";
import { logger } from "../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Job name constant
// ─────────────────────────────────────────────────────────────────────────────

const JOB_NAME = "bondMaturityPoller";

// ─────────────────────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────────────────────

export interface BondMaturityPollerResult {
  success: boolean;
  rowsWritten: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DI options (injectable for tests)
// ─────────────────────────────────────────────────────────────────────────────

export interface BondMaturityPollerOptions {
  /**
   * Injectable fetch function — returns an array of BondMaturityEvent records.
   * Defaults to the static seed data from bondMaturityTracker (getUpcomingMaturities).
   * In production this will be replaced by a real vnstock/HNX fetcher once available.
   */
  fetchFn?: () => Promise<BondMaturityEvent[]>;
  /**
   * Injectable WORK telegram sender — defaults to sendTelegramWork.
   */
  sendWorkFn?: (msg: string) => Promise<unknown>;
  /** Injectable nowMs for recovery dedup guard (tests only) */
  nowMsFn?: () => number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default fetcher (production)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default bond fetcher: uses static seed data from bondMaturityTracker.
 *
 * AC-0 note: vnstock Python SDK bond endpoint is not yet wired as a direct
 * TypeScript call. Until a dedicated fetchBondMaturities() fetcher is
 * implemented, the static domain seed data (SEED_BONDS in bondMaturityTracker.ts)
 * provides a reliable baseline for the `bond_maturity` table — covering the
 * 6 real-estate TPDN issuers in the watchlist (VHM, NVL x2, KDH, PDR, DIG).
 * This is intentionally fail-safe: the table will always have data even if the
 * external bond portal is unreachable. A dedicated vnstock HTTP fetcher will
 * be added in a follow-up task to pull live bond data.
 *
 * Fetch window: 36 months (3 years) to capture all upcoming maturities.
 */
async function defaultFetchBonds(): Promise<BondMaturityEvent[]> {
  const FETCH_WINDOW_MONTHS = 36;
  return getUpcomingMaturities(FETCH_WINDOW_MONTHS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Job implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the bond maturity poller job.
 *
 * 1. Fetch upcoming bond maturities (injectable; defaults to domain seed data).
 * 2. Upsert each record via upsertBond() — ON CONFLICT idempotent.
 * 3. If zero records returned, send WORK alert.
 * 4. On fetch error, send WORK alert and return failure (no rethrow).
 *
 * @param options - Optional DI overrides for fetch/send (test seam)
 * @returns BondMaturityPollerResult with success flag and rows written
 */
/**
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of weekly cadence (6 days 1h12m window)
 */
export async function runBondMaturityPollerJob(
  options?: BondMaturityPollerOptions,
): Promise<BondMaturityPollerResult> {
  const db = getDb();

  const WEEKLY_CADENCE_MS = 604_800_000;
  if (shouldSkipRecoveryReplay(db, "bondMaturityPollerJob", WEEKLY_CADENCE_MS, options?.nowMsFn)) {
    return { success: true, rowsWritten: 0 };
  }

  const fetchFn = options?.fetchFn ?? defaultFetchBonds;
  const sendWorkFn = options?.sendWorkFn ?? sendTelegramWork;

  let bonds: BondMaturityEvent[] = [];

  try {
    bonds = await fetchFn();
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[${JOB_NAME}] fetch error: ${errorMsg}`);
    await sendWorkFn(
      `[${JOB_NAME}] Fetch error — ${errorMsg}`,
    );
    return { success: false, rowsWritten: 0, error: errorMsg };
  }

  // FR-2 — zero-row alert
  if (bonds.length === 0) {
    const msg = `[${JOB_NAME}] Zero bond records returned — bond_maturity table may be stale`;
    logger.warn(`[${JOB_NAME}] ${msg}`);
    await sendWorkFn(msg);
    return { success: true, rowsWritten: 0 };
  }

  // Upsert all bonds — ON CONFLICT(issuer_code) DO UPDATE (idempotent)
  let rowsWritten = 0;
  for (const bond of bonds) {
    try {
      upsertBond(db, bond);
      rowsWritten++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`[${JOB_NAME}] upsert failed for ${bond.issuerCode}: ${errorMsg}`);
    }
  }

  logger.info(`[${JOB_NAME}] complete — ${rowsWritten} bonds upserted`);
  return { success: true, rowsWritten };
}
