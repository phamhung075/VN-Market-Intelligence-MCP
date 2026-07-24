/**
 * Scheduler — Commodity Tracker + Shipping Index Daily Refresh Job (Task 1920c)
 *
 * Fires daily at 06:00 UTC (`commodityTrackerRefresh`).
 *
 * FR-1 — Calls fetchYahooFinancePrices() + storeCommoditySnapshot() to refresh
 *         commodity_prices (INSERT OR REPLACE) and commodity_prices_history (append).
 * FR-2 — Calls fetchShippingIndices() + storeShippingIndices() to refresh
 *         tracked_indicators (shipping source rows).
 * FR-3 — Fail-loud on WORK channel if either call throws. Each block has its own
 *         try/catch — failure of one does NOT prevent the other from running.
 * FR-4 — Returns { rowsWritten } for recordJobRun observability via jobRunRepo.wrapRun.
 * FR-5 — cronConfig.ts key: CRON_COMMODITY_TRACKER ?? '0 6 * * *'
 * FR-6 — Wired in startScheduler.ts.
 * FR-7 (FIX-DOWJONES-STALE-WRONG-VALUE) — Block 3: calls fetchDowJonesIndex() +
 *         storeDowJonesIndex() to refresh tracked_indicators('dow_jones',
 *         source='yahoo'), replacing the retired news-mined extraction path.
 *         Own try/catch — isolated from Block 1/2 like the others.
 *
 * NFR-2 note: commodityTracker.ts calls getDb() directly — that is existing technical
 * debt. This job does not change that pattern.
 * TODO(1920c): inject db instead of direct getDb() in commodityTracker.ts + yahooFinance.ts
 *
 * @module scheduler/macro/commodityTrackerRefreshJob
 */

import {
  fetchYahooFinancePrices,
  storeCommoditySnapshot,
  fetchDowJonesIndex,
  storeDowJonesIndex,
} from "../../infrastructure/fetchers/yahooFinance.js";
import { fetchShippingIndices, storeShippingIndices } from "../../infrastructure/fetchers/shippingIndex.js";
import { sendTelegramWork } from "../../infrastructure/notifiers/telegram.js";
import { logger } from "../../infrastructure/logger.js";
import type { CommoditySnapshot } from "../../infrastructure/fetchers/yahooFinance.js";
import type { ShippingIndex } from "../../infrastructure/fetchers/shippingIndex.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const JOB_NAME = "commodityTrackerRefresh";

// ─────────────────────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────────────────────

export interface CommodityTrackerRefreshResult {
  commoditySuccess: boolean;
  shippingSuccess: boolean;
  /** FIX-DOWJONES-STALE-WRONG-VALUE — Block 3 success flag. */
  dowJonesSuccess: boolean;
  /** Combined row count: 1 (commodity snapshot) + N shipping indices + 0/1 (dow_jones). */
  rowsWritten: number;
  commodityError?: string;
  shippingError?: string;
  dowJonesError?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DI options (injectable for tests)
// ─────────────────────────────────────────────────────────────────────────────

export interface CommodityTrackerRefreshOptions {
  /** Injectable commodity fetcher — defaults to fetchYahooFinancePrices. */
  fetchCommodityFn?: () => Promise<CommoditySnapshot | null>;
  /** Injectable commodity store — defaults to storeCommoditySnapshot. */
  storeCommodityFn?: (snapshot: CommoditySnapshot) => Promise<void> | void;
  /** Injectable shipping fetcher — defaults to fetchShippingIndices. */
  fetchShippingFn?: () => Promise<ShippingIndex[]>;
  /** Injectable shipping store — defaults to storeShippingIndices. */
  storeShippingFn?: (indices: ShippingIndex[]) => Promise<void> | void;
  /** FIX-DOWJONES-STALE-WRONG-VALUE — injectable dow_jones fetcher — defaults to fetchDowJonesIndex. */
  fetchDowJonesFn?: () => Promise<number | null>;
  /** FIX-DOWJONES-STALE-WRONG-VALUE — injectable dow_jones store — defaults to storeDowJonesIndex. */
  storeDowJonesFn?: (value: number | null, fetchedAt: string) => boolean;
  /** Injectable WORK telegram sender — defaults to sendTelegramWork. */
  sendWorkFn?: (msg: string) => Promise<unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Job implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the commodity tracker + shipping index refresh job.
 *
 * Block 1 (FR-1): fetch + store commodity prices (Yahoo Finance).
 * Block 2 (FR-2): fetch + store shipping indices (Yahoo Finance BDI/FBX).
 * Block 3 (FR-7, FIX-DOWJONES-STALE-WRONG-VALUE): fetch + store the live
 *          dow_jones index level (Yahoo Finance ^DJI) into tracked_indicators.
 *
 * Each block is wrapped in its own try/catch (FR-3 — error isolation).
 * A failure in Block 1 does NOT prevent Block 2 or Block 3 from running.
 *
 * @param options - Optional DI overrides for all fetch/store/send functions
 * @returns CommodityTrackerRefreshResult with per-block success flags and rowsWritten
 */
export async function runCommodityTrackerRefreshJob(
  options?: CommodityTrackerRefreshOptions,
): Promise<CommodityTrackerRefreshResult> {
  const fetchCommodityFn = options?.fetchCommodityFn ?? fetchYahooFinancePrices;
  const storeCommodityFn = options?.storeCommodityFn ?? storeCommoditySnapshot;
  const fetchShippingFn  = options?.fetchShippingFn  ?? fetchShippingIndices;
  const storeShippingFn  = options?.storeShippingFn  ?? storeShippingIndices;
  const fetchDowJonesFn  = options?.fetchDowJonesFn  ?? fetchDowJonesIndex;
  const storeDowJonesFn  = options?.storeDowJonesFn  ?? storeDowJonesIndex;
  const sendWorkFn       = options?.sendWorkFn        ?? sendTelegramWork;

  let commoditySuccess = false;
  let commodityRows = 0;
  let commodityError: string | undefined;

  let shippingSuccess = false;
  let shippingRows = 0;
  let shippingError: string | undefined;

  let dowJonesSuccess = false;
  let dowJonesRows = 0;
  let dowJonesError: string | undefined;

  // ── Block 1: Commodity prices ──────────────────────────────────────────────
  try {
    const snapshot = await fetchCommodityFn();
    if (snapshot !== null && snapshot !== undefined) {
      await storeCommodityFn(snapshot);
      // commodity_prices: 1 upserted row (INSERT OR REPLACE on source='yahoo')
      commodityRows = 1;
    } else {
      logger.warn(`[${JOB_NAME}] commodity fetch returned null — no data stored`);
    }
    commoditySuccess = true;
    logger.info(`[${JOB_NAME}] commodity prices refreshed`, { rowsWritten: commodityRows });
  } catch (err) {
    commodityError = err instanceof Error ? err.message : String(err);
    logger.error(`[${JOB_NAME}] commodity fetch/store error: ${commodityError}`);
    await sendWorkFn(
      `[${JOB_NAME}] commodity fetch error — ${commodityError}`,
    );
  }

  // ── Block 2: Shipping indices ──────────────────────────────────────────────
  try {
    const indices = await fetchShippingFn();
    await storeShippingFn(indices);
    shippingRows = indices.length;
    shippingSuccess = true;
    logger.info(`[${JOB_NAME}] shipping indices refreshed`, { count: shippingRows });
  } catch (err) {
    shippingError = err instanceof Error ? err.message : String(err);
    logger.error(`[${JOB_NAME}] shipping fetch/store error: ${shippingError}`);
    await sendWorkFn(
      `[${JOB_NAME}] shipping fetch error — ${shippingError}`,
    );
  }

  // ── Block 3: Dow Jones index (FIX-DOWJONES-STALE-WRONG-VALUE) ──────────────
  try {
    const dowValue = await fetchDowJonesFn();
    const fetchedAt = new Date().toISOString();
    const written = storeDowJonesFn(dowValue, fetchedAt);
    dowJonesRows = written ? 1 : 0;
    dowJonesSuccess = true;
    logger.info(`[${JOB_NAME}] dow_jones index refreshed`, { rowsWritten: dowJonesRows });
  } catch (err) {
    dowJonesError = err instanceof Error ? err.message : String(err);
    logger.error(`[${JOB_NAME}] dow_jones fetch/store error: ${dowJonesError}`);
    await sendWorkFn(
      `[${JOB_NAME}] dow_jones fetch error — ${dowJonesError}`,
    );
  }

  return {
    commoditySuccess,
    shippingSuccess,
    dowJonesSuccess,
    rowsWritten: commodityRows + shippingRows + dowJonesRows,
    ...(commodityError !== undefined ? { commodityError } : {}),
    ...(shippingError  !== undefined ? { shippingError }  : {}),
    ...(dowJonesError  !== undefined ? { dowJonesError }  : {}),
  };
}
