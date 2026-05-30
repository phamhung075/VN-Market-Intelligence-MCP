/**
 * Scheduler — SBV Rates Dedicated Refresh Job
 *
 * Fires every 4 hours (`sbvRatesRefresh`).
 *
 * FR-1 — Calls fetchSbvRates() to get the current VCB USD/VND rate and SBV
 *         interest rate fallbacks.
 * FR-2 — Calls storeSbvSnapshot() to upsert sbv_rates (INSERT OR REPLACE)
 *         and append to sbv_rates_history (hourly dedup guard inside store).
 * FR-3 — Fail-loud on WORK channel if fetch or store throws.
 * FR-4 — Returns { rowsWritten: 1 } for recordJobRun observability via jobRunRepo.wrapRun.
 * FR-5 — cronConfig.ts key: CRON_SBV_RATES_REFRESH ?? '0 *\/4 * * *'
 * FR-6 — Wired in startScheduler.ts.
 *
 * Design: mirrors commodityTrackerRefreshJob DI pattern — all side-effectful
 * functions are injectable, keeping the job unit-testable without real HTTP or DB.
 *
 * @module scheduler/macro/sbvRatesJob
 */

import { fetchSbvRates, storeSbvSnapshot } from "../../infrastructure/fetchers/sbv.js";
import { sendTelegramWork } from "../../infrastructure/notifiers/telegram.js";
import { logger } from "../../infrastructure/logger.js";
import type { SbvMacroSnapshot } from "../../infrastructure/fetchers/sbv.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const JOB_NAME = "sbvRatesRefresh";

// ─────────────────────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────────────────────

export interface SbvRatesRefreshResult {
  success: boolean;
  /** 1 when snapshot was stored; 0 when fetch returned null or zero-rate guard fired. */
  rowsWritten: number;
  error?: string;
  /**
   * true when the snapshot was skipped because one or more sentinel-for-missing rate
   * columns were ≤0 and a good prior row existed (zero-overwrite guard fired).
   */
  zeroRateSkipped?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sentinel columns — 0 is not a valid value; signals upstream parse miss
// ─────────────────────────────────────────────────────────────────────────────

/** Snapshot fields where ≤0 means "upstream parse missed the value, not a real zero". */
const SENTINEL_FIELDS: Array<{
  field: keyof SbvMacroSnapshot;
  label: string;
}> = [
  { field: "maxDepositRatePct",  label: "max_deposit_rate_pct"  },
  { field: "usdVndOfficial",     label: "usd_vnd_official"      },
  { field: "overnightRatePct",   label: "overnight_rate_pct"    },
  { field: "refinancingRatePct", label: "refinancing_rate_pct"  },
  { field: "maxLendingRatePct",  label: "max_lending_rate_pct"  },
];

/**
 * Returns the list of sentinel field labels whose value is ≤0 in this snapshot.
 * An empty array means all sentinel fields are positive (safe to persist).
 */
function detectZeroSentinelFields(snapshot: SbvMacroSnapshot): string[] {
  return SENTINEL_FIELDS
    .filter(({ field }) => (snapshot[field] as number) <= 0)
    .map(({ label }) => label);
}

// ─────────────────────────────────────────────────────────────────────────────
// DI options (injectable for tests)
// ─────────────────────────────────────────────────────────────────────────────

export interface SbvRatesRefreshOptions {
  /** Injectable SBV fetcher — defaults to fetchSbvRates. */
  fetchFn?: () => Promise<SbvMacroSnapshot | null>;
  /** Injectable SBV store — defaults to storeSbvSnapshot. */
  storeFn?: (snapshot: SbvMacroSnapshot) => unknown;
  /** Injectable WORK telegram sender — defaults to sendTelegramWork. */
  sendWorkFn?: (msg: string) => Promise<unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Job implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the SBV rates refresh job.
 *
 * Fetches the current VCB USD/VND rate and SBV interest-rate fallbacks, then
 * persists them via storeSbvSnapshot(). Fail-loud to WORK channel on error.
 * Returns null-fetch as a silent no-op (rowsWritten=0, success=false) since
 * fetchSbvRates() only returns null when BOTH FX fetch AND rate fallbacks are 0.
 *
 * Zero-rate guard (DPI-FU-D): if the fetched snapshot contains ≤0 for any
 * sentinel-for-missing field (max_deposit_rate_pct, usd_vnd_official,
 * overnight_rate_pct, refinancing_rate_pct, max_lending_rate_pct), the job
 * alerts WORK channel and skips the store entirely. The persistence layer
 * (storeSbvSnapshot) carries a second independent guard for defence-in-depth.
 *
 * @param options - Optional DI overrides for fetch/store/send functions
 * @returns SbvRatesRefreshResult with success flag and rowsWritten
 */
export async function runSbvRatesRefreshJob(
  options?: SbvRatesRefreshOptions,
): Promise<SbvRatesRefreshResult> {
  const fetchFn   = options?.fetchFn   ?? fetchSbvRates;
  const storeFn   = options?.storeFn   ?? storeSbvSnapshot;
  const sendWorkFn = options?.sendWorkFn ?? sendTelegramWork;

  try {
    const snapshot = await fetchFn();

    if (snapshot === null) {
      logger.warn(`[${JOB_NAME}] fetch returned null — no usable data, skipping store`);
      return { success: false, rowsWritten: 0 };
    }

    // Pre-flight zero-rate guard — fail-loud before writing to DB.
    // Any sentinel field ≤0 means the upstream scrape missed the value;
    // persisting it would silently overwrite a good prior row.
    const zeroFields = detectZeroSentinelFields(snapshot);
    if (zeroFields.length > 0) {
      const alertMsg = `[${JOB_NAME}] SKIPPED — zero/non-positive value in sentinel fields: ${zeroFields.join(", ")}. Prior good row preserved. fetchedAt=${snapshot.fetchedAt}`;
      logger.error(`[${JOB_NAME}] zero-rate guard fired`, { zeroFields, fetchedAt: snapshot.fetchedAt });
      await sendWorkFn(alertMsg);
      return { success: false, rowsWritten: 0, zeroRateSkipped: true };
    }

    storeFn(snapshot);

    logger.info(`[${JOB_NAME}] snapshot stored`, {
      usdVndOfficial: snapshot.usdVndOfficial,
      overnightRatePct: snapshot.overnightRatePct,
      refinancingRatePct: snapshot.refinancingRatePct,
      fetchedAt: snapshot.fetchedAt,
    });

    return { success: true, rowsWritten: 1 };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[${JOB_NAME}] fetch/store error: ${errorMsg}`);
    await sendWorkFn(`[${JOB_NAME}] error — ${errorMsg}`);
    return { success: false, rowsWritten: 0, error: errorMsg };
  }
}
