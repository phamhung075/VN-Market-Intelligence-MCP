/**
 * Public Contracts Scheduler Job — Task B
 *
 * Weekly cron: Monday 03:00 UTC (`0 3 * * 1`).
 * Fetches procurement contract results from muasamcong.mpi.gov.vn
 * and persists them to the public_contracts table.
 *
 * FR-1: Call fetchPublicContracts() — returns [] on any network error.
 * FR-2: Call storePublicContracts(db, contracts) — deduped INSERT batch.
 * FR-3: Fail-loud to WORK channel on store error (network failure is silent).
 * FR-4: Return { rowsWritten } for jobRunRepo.wrapRun observability.
 * FR-5: cronConfig.ts key: CRON_PUBLIC_CONTRACTS ?? '0 3 * * 1'
 * FR-6: Wired in startScheduler.ts.
 * FR-7: Geo-block: MUASAMCONG_VPS_PROXY_URL env var routes through Vinahost VPS.
 *
 * Design: mirrors sbvRatesJob DI pattern — all side-effectful functions are
 * injectable so the job is unit-testable without real HTTP or DB.
 *
 * @module scheduler/market-data/publicContractsJob
 */

import { fetchPublicContracts } from "../../infrastructure/fetchers/muasamcong.js";
import { storePublicContracts } from "../../infrastructure/db/publicContractsStore.js";
import { sendTelegramWork } from "../../infrastructure/notifiers/telegram.js";
import { logger } from "../../infrastructure/logger.js";
import { getDb } from "../../infrastructure/db/schema.js";
import type { PublicContract, HttpClient } from "../../infrastructure/fetchers/muasamcong.js";
import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const JOB_NAME = "publicContractsJob";

// ─────────────────────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────────────────────

export interface PublicContractsJobResult {
  success: boolean;
  /** Number of new rows inserted (deduped rows excluded). */
  rowsWritten: number;
  /** Total contracts fetched from source. */
  fetched: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DI options (injectable for tests)
// ─────────────────────────────────────────────────────────────────────────────

export interface PublicContractsJobOptions {
  /** Injectable fetcher — defaults to fetchPublicContracts. */
  fetchFn?: (httpClient?: HttpClient) => Promise<PublicContract[]>;
  /** Injectable store — defaults to storePublicContracts with real DB. */
  storeFn?: (db: Database, contracts: PublicContract[]) => { inserted: number; attempted: number };
  /** Injectable DB — defaults to getDb(). */
  db?: Database;
  /** Injectable WORK telegram sender — defaults to sendTelegramWork. */
  sendWorkFn?: (msg: string) => Promise<unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Job implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the public contracts refresh job.
 *
 * Fetches recent government procurement award results from muasamcong.mpi.gov.vn
 * (via VPS proxy if MUASAMCONG_VPS_PROXY_URL is set), then stores them.
 *
 * Network failure from fetchPublicContracts() produces an empty array (never throws).
 * An empty result is logged as a warning but NOT sent to Telegram — it may simply
 * mean no new contracts this week.
 *
 * Store-level errors ARE sent to Telegram (they indicate a DB problem).
 *
 * @param options - Optional DI overrides for fetch/store/db/send functions
 * @returns PublicContractsJobResult with success flag, rowsWritten, and fetched count
 */
export async function runPublicContractsJob(
  options?: PublicContractsJobOptions,
): Promise<PublicContractsJobResult> {
  const fetchFn    = options?.fetchFn    ?? fetchPublicContracts;
  const storeFn    = options?.storeFn    ?? storePublicContracts;
  const db         = options?.db         ?? getDb();
  const sendWorkFn = options?.sendWorkFn ?? sendTelegramWork;

  // FR-1: Fetch contracts — never throws, returns [] on error
  let contracts: PublicContract[] = [];
  try {
    contracts = await fetchFn();
  } catch (err) {
    // Defensive — fetchPublicContracts never throws, but guard anyway
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`[${JOB_NAME}] fetch returned error (silent): ${errorMsg}`);
    return { success: false, rowsWritten: 0, fetched: 0, error: errorMsg };
  }

  if (contracts.length === 0) {
    logger.warn(`[${JOB_NAME}] fetched 0 contracts — site may be geo-blocked or no new results`);
    return { success: false, rowsWritten: 0, fetched: 0 };
  }

  // FR-2 / FR-3: Store contracts — fail-loud on error
  try {
    const result = storeFn(db, contracts);

    logger.info(`[${JOB_NAME}] stored`, {
      fetched: contracts.length,
      inserted: result.inserted,
      deduped: result.attempted - result.inserted,
    });

    return { success: true, rowsWritten: result.inserted, fetched: contracts.length };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[${JOB_NAME}] store error: ${errorMsg}`);
    await sendWorkFn(`[${JOB_NAME}] store error — ${errorMsg}`);
    return { success: false, rowsWritten: 0, fetched: contracts.length, error: errorMsg };
  }
}
