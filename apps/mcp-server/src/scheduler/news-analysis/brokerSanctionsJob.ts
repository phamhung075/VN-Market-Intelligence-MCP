/**
 * Scheduler — Broker Sanctions Quarterly Sweep Job (Task 1920d)
 *
 * Cron: `0 8 25-31 * 5` — last Friday of each month at 08:00 UTC.
 * The job body applies a quarter-guard so only quarter-end months
 * (March=3, June=6, September=9, December=12) execute the SSC fetch.
 * Non-quarter Fridays record `status='skipped'` and return early.
 *
 * Source: SSC enforcement page (congbothongtin.ssc.gov.vn).
 * ARCH-1920 §3 R-2 confirms this source is geo-accessible from France
 * without VPS proxy. Pattern confirmed by sscCheckerJob.ts in the same zone.
 *
 * CRITICAL PRE-CONDITION (R-3):
 *   The `broker_sanctions` table MUST have UNIQUE(broker_name, sanction_start)
 *   before this job is deployed. The schema migration in schema-alerts.ts
 *   (Task 1920d) adds the constraint idempotently on both fresh and legacy DBs.
 *   `insertBrokerSanction()` uses INSERT OR IGNORE — a second run with the same
 *   (broker_name, sanction_start) is a safe no-op.
 *
 * FR-1  — Schema migration in schema-alerts.ts (ships in same PR)
 * FR-2  — Quarter-guard (skip non-quarter months)
 * FR-3  — Fail-loud WORK channel on fetch error or zero records in quarter month
 * FR-4  — recordJobRun observability via jobRunRepo.wrapRun
 * FR-5  — cronConfig.ts key: CRON_BROKER_SANCTIONS ?? '0 8 25-31 * 5'
 * FR-6  — startScheduler.ts wiring (news-analysis/ zone)
 *
 * @module scheduler/news-analysis/brokerSanctionsJob
 */

import { getDb } from "../../infrastructure/db/schema.js";
import {
  insertBrokerSanction,
  type InsertBrokerSanctionInput,
} from "../../infrastructure/db/brokerSanctionStore.js";
import { sendTelegramWork } from "../../infrastructure/notifiers/telegram.js";
import { logger } from "../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const JOB_NAME = "brokerSanctionsSweep";

/** Quarter-end months: March, June, September, December */
const QUARTER_MONTHS = [3, 6, 9, 12] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BrokerSanctionsJobResult {
  success: boolean;
  skipped: boolean;
  rowsWritten: number;
  error?: string;
}

/** Injectable options for testing and DI */
export interface BrokerSanctionsJobOptions {
  /**
   * Returns current calendar month (1-12).
   * Defaults to `new Date().getMonth() + 1`.
   * Injectable so tests can force quarter/non-quarter scenarios.
   */
  getCurrentMonthFn?: () => number;
  /**
   * Async SSC sanctions fetcher.
   * Returns an array of InsertBrokerSanctionInput records parsed from the
   * SSC enforcement page (congbothongtin.ssc.gov.vn).
   * Defaults to the production SSC fetcher.
   */
  fetchFn?: () => Promise<InsertBrokerSanctionInput[]>;
  /**
   * WORK channel Telegram sender — defaults to sendTelegramWork.
   */
  sendWorkFn?: (msg: string) => Promise<unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default fetcher (production)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default SSC broker sanctions fetcher.
 *
 * Fetches the SSC enforcement list from congbothongtin.ssc.gov.vn and
 * parses broker sanction records. The SSC portal is geo-accessible from
 * France without VPS proxy (confirmed ARCH-1920 §3 R-2).
 *
 * Note: The SSC enforcement page HTML structure may change. If parsing
 * yields zero records in a quarter month, the job sends a WORK alert so
 * the operator can update the parser. This is an operational concern.
 *
 * For Sprint 1920d initial deployment, this returns an empty array as a
 * safe stub — the real HTML parser will be implemented in a follow-up task
 * once the SSC page structure is confirmed stable. The zero-result WORK
 * alert ensures operators are notified on the first quarterly run.
 */
async function defaultFetchSanctions(): Promise<InsertBrokerSanctionInput[]> {
  // TODO(1920d-fetcher): implement real SSC enforcement page scraper.
  // URL: https://congbothongtin.ssc.gov.vn/faces/NewsDetailPage.xhtml (enforcement list)
  // Pattern: same HTTP approach as sscCheckerJob.ts which already calls this portal.
  // Until the scraper is implemented, this stub returns [] and the zero-result
  // WORK alert fires — prompting operator awareness on first quarterly run.
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Job implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the broker sanctions quarterly sweep.
 *
 * Quarter-guard: if the current calendar month is not in [3, 6, 9, 12],
 * the job returns early with `skipped=true`. Non-quarter skips do NOT
 * send a WORK alert.
 *
 * Active run (quarter month):
 *   1. Fetch SSC sanctions list (injectable; defaults to SSC scraper stub).
 *   2. For each record, call `insertBrokerSanction()` (INSERT OR IGNORE).
 *   3. If zero records returned, send WORK alert (3-month data gap risk).
 *   4. On fetch error, send WORK alert; return `success=false` (no rethrow).
 *
 * @param options - Optional DI overrides (getCurrentMonthFn, fetchFn, sendWorkFn)
 * @returns BrokerSanctionsJobResult with success/skipped/rowsWritten
 */
export async function runBrokerSanctionsJob(
  options?: BrokerSanctionsJobOptions,
): Promise<BrokerSanctionsJobResult> {
  const db = getDb();
  const getCurrentMonthFn = options?.getCurrentMonthFn ?? (() => new Date().getMonth() + 1);
  const fetchFn = options?.fetchFn ?? defaultFetchSanctions;
  const sendWorkFn = options?.sendWorkFn ?? sendTelegramWork;

  // ── Quarter-guard ──────────────────────────────────────────────────────────
  const currentMonth = getCurrentMonthFn();
  const isQuarterMonth = (QUARTER_MONTHS as readonly number[]).includes(currentMonth);

  if (!isQuarterMonth) {
    logger.debug(
      `[${JOB_NAME}] month=${currentMonth} — not a quarter-end month, skipping`,
    );
    return { success: true, skipped: true, rowsWritten: 0 };
  }

  // ── Fetch sanctions ────────────────────────────────────────────────────────
  let sanctions: InsertBrokerSanctionInput[] = [];

  try {
    sanctions = await fetchFn();
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[${JOB_NAME}] fetch error: ${errorMsg}`);
    await sendWorkFn(
      `[${JOB_NAME}] Fetch error — SSC enforcement page unreachable: ${errorMsg}`,
    );
    return { success: false, skipped: false, rowsWritten: 0, error: errorMsg };
  }

  // ── Zero-result alert (quarter month — 3-month data gap risk) ─────────────
  if (sanctions.length === 0) {
    const msg =
      `[${JOB_NAME}] zero sanctions returned from SSC enforcement page ` +
      `(month=${currentMonth}) — broker_sanctions table may be stale. ` +
      `Check SSC page structure or confirm no new sanctions this quarter.`;
    logger.warn(`[${JOB_NAME}] ${msg}`);
    await sendWorkFn(msg);
    return { success: true, skipped: false, rowsWritten: 0 };
  }

  // ── Reject null sanction_start (cannot dedup on null key) ─────────────────
  const valid = sanctions.filter((s) => {
    if (!s.sanctionStart) {
      logger.warn(
        `[${JOB_NAME}] rejecting sanction with null sanction_start for broker: ${s.brokerName}`,
      );
      return false;
    }
    return true;
  });

  // ── Insert OR IGNORE (UNIQUE constraint handles duplicates) ───────────────
  let rowsWritten = 0;
  for (const sanction of valid) {
    try {
      const rowId = insertBrokerSanction(db, sanction);
      if (rowId > 0) rowsWritten++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.warn(
        `[${JOB_NAME}] insert failed for ${sanction.brokerName}: ${errorMsg}`,
      );
    }
  }

  logger.info(
    `[${JOB_NAME}] complete — month=${currentMonth} fetched=${sanctions.length} valid=${valid.length} inserted=${rowsWritten}`,
  );

  return { success: true, skipped: false, rowsWritten };
}
