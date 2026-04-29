/**
 * Application Use Case — Compute Market Earning Yield
 *
 * Aggregates P/E data from the watchlist tickers in `vnstock_financials`,
 * calls the pure domain function, and writes results to `tracked_indicators`.
 *
 * Algorithm:
 *   1. Read all codes from `watchlist`.
 *   2. For each code: SELECT the latest vnstock_financials row (by year_report DESC,
 *      quarter DESC). Use stored `pe` when non-null and > 0. Fallback: compute
 *      pe = currentPrice * 1000 / eps (price is in 1000 VND, eps is in VND).
 *   3. Filter out tickers with null/zero/negative pe.
 *   4. Call computeMarketEarningYield(validTickers, watchlistTotal, dataAsOf).
 *   5. If refused: log WARN, return early — no DB write.
 *   6. Write two rows to tracked_indicators:
 *        - indicator='market_earning_yield', value=earningYield, unit='%', source='bau_phase2'
 *        - indicator='market_median_pe',     value=medianPE,    unit='ratio', source='bau_phase2'
 *
 * No Telegram alert on completion. Result is logged at INFO level.
 *
 * Sprint: 1426 — Báu Phase 2 (Dinh Gia)
 * Task: TASK-1426a
 *
 * @module application/usecases/computeMarketEarningYield
 */

import type { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";
import {
  computeMarketEarningYield,
  type TickerPE,
  type MarketEarningYieldResult,
  type MarketEarningYieldRefused,
} from "../../domain/services/macro/marketEarningYield.js";
import { logger } from "../../infrastructure/logger.js";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface WatchlistRow {
  code: string;
}

interface FinancialsRow {
  pe: number | null;
  eps: number | null;
  year_report: number;
  quarter: number;
}

interface PriceRow {
  price: number | null;
}

/** Source tag written to tracked_indicators. */
const SOURCE = "bau_phase2";

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

export interface ComputeMarketEarningYieldResult {
  /** True when a result was computed and stored */
  stored: boolean;
  /** Computation result when stored=true */
  result?: MarketEarningYieldResult;
  /** Refusal details when stored=false due to coverage */
  refused?: MarketEarningYieldRefused;
  /** Number of tickers with valid PE found */
  validCount: number;
  /** Total watchlist size */
  totalCount: number;
}

// ---------------------------------------------------------------------------
// Use-case implementation
// ---------------------------------------------------------------------------

/**
 * Computes market-wide earning yield and stores it in tracked_indicators.
 *
 * @param db - Optional Database instance (defaults to app singleton).
 * @returns  ComputeMarketEarningYieldResult with stored/refused details.
 */
export async function computeAndStoreMarketEarningYield(
  db?: Database,
): Promise<ComputeMarketEarningYieldResult> {
  const database = db ?? getDb();

  // ── Step 1: Read watchlist codes ──────────────────────────────────────────
  const watchlistRows = database
    .prepare<WatchlistRow, []>("SELECT code FROM watchlist")
    .all();

  const totalCount = watchlistRows.length;

  if (totalCount === 0) {
    logger.warn("[market-earning-yield] watchlist is empty — skipping computation");
    return { stored: false, validCount: 0, totalCount: 0 };
  }

  // ── Step 2: Fetch latest financials per ticker ────────────────────────────
  const validTickers: TickerPE[] = [];
  let latestYearReport = 0;
  let latestQuarter = 0;

  for (const { code } of watchlistRows) {
    // Query the single most-recent row per ticker
    const fin = database
      .prepare<FinancialsRow, [string]>(
        `SELECT pe, eps, year_report, quarter
         FROM vnstock_financials
         WHERE code = ?
         ORDER BY year_report DESC, quarter DESC
         LIMIT 1`,
      )
      .get(code);

    if (!fin) continue;

    // Track latest period for dataAsOf label
    if (
      fin.year_report > latestYearReport ||
      (fin.year_report === latestYearReport && fin.quarter > latestQuarter)
    ) {
      latestYearReport = fin.year_report;
      latestQuarter = fin.quarter;
    }

    // Prefer stored pe column (avoids unit-mismatch risk: RISK-1)
    if (fin.pe !== null && fin.pe > 0) {
      validTickers.push({ code, pe: fin.pe });
      continue;
    }

    // Fallback: compute pe from currentPrice and eps
    // RISK-1: price is in 1000 VND, eps is in VND → pe = price_k * 1000 / eps_vnd
    if (fin.eps !== null && fin.eps !== 0) {
      const priceRow = database
        .prepare<PriceRow, [string]>(
          `SELECT price FROM market_prices WHERE code = ? LIMIT 1`,
        )
        .get(code);

      if (priceRow?.price != null && priceRow.price > 0) {
        const computedPe = (priceRow.price * 1000) / fin.eps;
        if (computedPe > 0) {
          validTickers.push({ code, pe: computedPe });
        }
      }
    }
  }

  const validCount = validTickers.length;

  // Build dataAsOf label — "YYYY-QN"
  const dataAsOf =
    latestYearReport > 0
      ? `${latestYearReport}-Q${latestQuarter}`
      : "unknown";

  // ── Step 3-4: Call domain fn ──────────────────────────────────────────────
  const domainResult = computeMarketEarningYield(validTickers, totalCount, dataAsOf);

  // ── Step 5: Handle refusal ────────────────────────────────────────────────
  if ("refused" in domainResult) {
    logger.warn(
      `[market-earning-yield] coverage too low — ` +
      `${domainResult.coverageCount}/${totalCount} = ` +
      `${(domainResult.coverageRatio * 100).toFixed(1)}% (need 70%) — skipping DB write`,
    );
    return {
      stored: false,
      refused: domainResult,
      validCount,
      totalCount,
    };
  }

  // ── Step 6: Write to tracked_indicators ──────────────────────────────────
  const extractedAt = new Date().toISOString();
  const hourBucket = extractedAt.substring(0, 13) + ":00:00"; // "YYYY-MM-DDTHH:00:00"

  database
    .prepare<unknown, [number, string, string, string]>(
      `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at, hour_bucket)
       VALUES ('market_earning_yield', ?, '%', ?, ?, ?)`,
    )
    .run(domainResult.earningYield, SOURCE, extractedAt, hourBucket);

  database
    .prepare<unknown, [number, string, string, string]>(
      `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at, hour_bucket)
       VALUES ('market_median_pe', ?, 'ratio', ?, ?, ?)`,
    )
    .run(domainResult.medianPE, SOURCE, extractedAt, hourBucket);

  logger.info(
    `[market-earning-yield] stored — ` +
    `medianPE=${domainResult.medianPE.toFixed(2)} ` +
    `earningYield=${domainResult.earningYield.toFixed(4)}% ` +
    `coverage=${validCount}/${totalCount} ` +
    `dataAsOf=${dataAsOf}`,
  );

  return {
    stored: true,
    result: domainResult,
    validCount,
    totalCount,
  };
}
