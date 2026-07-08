/**
 * Infrastructure — vnstock Python Bridge Fetcher
 *
 * Calls vnstock Python library via subprocess to fetch VN stock data.
 * vnstock handles session cookies, WAF bypass, and API auth internally.
 *
 * Data sources (all via vnstock VCI backend):
 *   - Prices: OHLCV daily, intraday ticks
 *   - Finance: Income statement, balance sheet, cash flow, ratios (quarterly)
 *   - Company: Officers, shareholders, trading stats, events, news
 *
 * Strategy: vnstock = fast first look (available same day as BCTC filing)
 *           PDF = authoritative deep analysis (available when uploaded to SSC)
 *           Both feed the same pipeline. vnstock data is tagged source="vnstock".
 *
 * API key registered in: ~/.vnstock (managed by vnstock register_user)
 *
 * FACTORY-INFRA-split-vnstockBridge: the 11 inline Python *_SCRIPT templates
 * (each re-embedding the FIX-FUNDAMENTALS-REFRESH-CRON-DEAD stdout-suppression
 * preamble) moved to `vnstock/scripts/*.ts`; the rate limiter, backoff,
 * junk-detection, and runPython subprocess helpers moved to `vnstock/runtime.ts`.
 * This file now owns only: public types + the thin fetch* wrapper functions
 * that call a script-builder and hand the result to runPython(WithBackoff).
 * Re-exports the tested runtime helpers so existing import paths
 * (`../infrastructure/fetchers/vnstockBridge.js`) keep working unchanged.
 *
 * size-justification: 330L — the approach explicitly keeps the 11 public
 * fetch* wrapper functions + their JSDoc + the public/domain type surface
 * consolidated here ("keep TS fetch wrappers in vnstockBridge.ts importing
 * their script"); this is the one canonical import path every consumer
 * (application/usecases, hose.ts, 15+ test files, some via mock.module)
 * already depends on. Splitting the 11 one-liner wrappers into 11 more
 * files would fragment a single coherent public API surface for no benefit.
 *
 * Layer: infrastructure/fetchers
 */

import { logger } from "../logger.js";
import {
  runPython,
  runPythonWithBackoff,
  stripAnsiAndDetectJunk,
  isRateLimitResponse,
  calcBackoffMs,
  VnstockRateLimiter,
  GLOBAL_RATE_LIMIT_RPM,
  SUPPRESS_BANNER,
  RESTORE_STDOUT,
  type JunkCheckResult,
  type BackoffOptions,
} from "./vnstock/index.js";
import { buildPricesScript } from "./vnstock/scripts/prices.js";
import { buildFinancialsScript } from "./vnstock/scripts/financials.js";
import { buildTradingStatsScript } from "./vnstock/scripts/tradingStats.js";
import { buildOfficersScript } from "./vnstock/scripts/officers.js";
import { buildShareholdersScript } from "./vnstock/scripts/shareholders.js";
import { buildIntradayScript } from "./vnstock/scripts/intraday.js";
import { buildOrderBookScript } from "./vnstock/scripts/orderBook.js";
import { buildEventsScript } from "./vnstock/scripts/events.js";
import { buildBalanceSheetScript } from "./vnstock/scripts/balanceSheet.js";
import { buildCashFlowScript } from "./vnstock/scripts/cashFlow.js";
import { buildNewsScript } from "./vnstock/scripts/news.js";

// ---------------------------------------------------------------------------
// Re-exports — tested runtime helpers + preamble constants (backward compat:
// several tests import these directly from vnstockBridge.js, see
// docs/agent-memory/decisions for FACTORY-INFRA-split-vnstockBridge)
// ---------------------------------------------------------------------------
export {
  stripAnsiAndDetectJunk,
  isRateLimitResponse,
  calcBackoffMs,
  VnstockRateLimiter,
  GLOBAL_RATE_LIMIT_RPM,
  SUPPRESS_BANNER,
  RESTORE_STDOUT,
};
export type { JunkCheckResult, BackoffOptions };

// ---------------------------------------------------------------------------
// Types — re-exported from domain (DDD fix Task 1871f)
// ---------------------------------------------------------------------------

// Infrastructure-only type (price shape used only in fetcher layer)
export interface VnstockPrice {
  code: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  date: string;
  changePct: number;
}

// Domain types: canonical definitions live in domain/models/vnstockTypes.ts
// Imported locally for use in function signatures + re-exported for backward compat.
import type {
  VnstockFinancials,
  VnstockTradingStats,
  VnstockOfficer,
  VnstockShareholder,
  VnstockBalanceSheet,
  VnstockCashFlow,
} from "../../domain/models/vnstockTypes.js";
export type {
  VnstockFinancials,
  VnstockTradingStats,
  VnstockOfficer,
  VnstockShareholder,
  VnstockBalanceSheet,
  VnstockCashFlow,
};

// Re-export shared types from domain (DDD fix — Task 1320)
import type {
  VnstockIntradayTick,
  VnstockEvent,
  VnstockOrderBook,
} from "../../domain/models/shared-types.js";
export type { VnstockIntradayTick, VnstockEvent, VnstockOrderBook };

export interface VnstockNewsItem {
  code: string;
  title: string;
  /** ISO date string, e.g. "2026-04-03" */
  date: string;
  source: string;
  url: string;
}

export interface VnstockRatioSummary {
  code: string;
  pe: number;
  pb: number;
  roe: number;
  eps: number;
  marketCap: number;  // billion VND
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// 1. Prices
// ---------------------------------------------------------------------------

export async function fetchVnstockPrices(
  codes: string[],
  days = 3,
): Promise<VnstockPrice[]> {
  if (codes.length === 0) return [];
  const result = await runPythonWithBackoff<VnstockPrice[]>(buildPricesScript(codes, days), "prices");
  if (result) {
    logger.info("[vnstock] fetched prices", { requested: codes.length, received: result.length });
  }
  return result ?? [];
}

// ---------------------------------------------------------------------------
// 2. Financials (Income + Ratios) — the "fast BCTC"
// ---------------------------------------------------------------------------

export async function fetchVnstockFinancials(code: string): Promise<VnstockFinancials | null> {
  const result = await runPythonWithBackoff<VnstockFinancials>(buildFinancialsScript(code), `finance:${code}`);
  if (result) {
    logger.info("[vnstock] fetched financials", {
      code, year: result.yearReport, quarter: result.quarter,
      revenue: result.revenue, eps: result.eps,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// 3. Trading Stats (foreign room, 52-week range)
// ---------------------------------------------------------------------------

export async function fetchVnstockTradingStats(code: string): Promise<VnstockTradingStats | null> {
  const result = await runPythonWithBackoff<VnstockTradingStats>(buildTradingStatsScript(code), `stats:${code}`);
  if (result) {
    logger.info("[vnstock] fetched trading stats", {
      code, foreignRoom: result.foreignRoom, high52w: result.high52w, marketCapBn: result.marketCapBn,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// 4. Officers (for insider tracking)
// ---------------------------------------------------------------------------

export async function fetchVnstockOfficers(code: string): Promise<VnstockOfficer[]> {
  const result = await runPython<VnstockOfficer[]>(buildOfficersScript(code), `officers:${code}`);
  return result ?? [];
}

// ---------------------------------------------------------------------------
// 5. Shareholders
// ---------------------------------------------------------------------------

export async function fetchVnstockShareholders(code: string): Promise<VnstockShareholder[]> {
  const result = await runPython<VnstockShareholder[]>(buildShareholdersScript(code), `shareholders:${code}`);
  return result ?? [];
}

// ---------------------------------------------------------------------------
// 6. Intraday ticks — last 100 ticks
// ---------------------------------------------------------------------------

export async function fetchVnstockIntraday(code: string): Promise<VnstockIntradayTick[]> {
  const result = await runPython<VnstockIntradayTick[]>(buildIntradayScript(code), `intraday:${code}`);
  if (result && result.length > 0) {
    logger.info("[vnstock] fetched intraday ticks", { code, count: result.length });
  }
  return result ?? [];
}

// ---------------------------------------------------------------------------
// 7. Order book (price depth)
// ---------------------------------------------------------------------------

export async function fetchVnstockOrderBook(code: string): Promise<VnstockOrderBook | null> {
  const result = await runPython<VnstockOrderBook>(buildOrderBookScript(code), `orderbook:${code}`);
  if (result) {
    logger.info("[vnstock] fetched order book", {
      code, bids: result.bids.length, asks: result.asks.length,
      imbalanceRatio: result.imbalanceRatio,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// 8. Corporate Events
//
// vnstock v4.0.3 broke the Vnstock().stock() path: importing
// vnstock.common.viz raises ImportError when neither vnstock_chart nor
// vnstock_ezchart is installed. The fix bypasses the Vnstock wrapper by
// importing vnstock.explorer.vci.company.Company directly — see
// vnstock/scripts/events.ts for the full script + column-mapping notes.
// ---------------------------------------------------------------------------

export async function fetchVnstockEvents(code: string): Promise<VnstockEvent[]> {
  const result = await runPython<VnstockEvent[]>(buildEventsScript(code), `events:${code}`);
  if (result && result.length > 0) {
    logger.info("[vnstock] fetched events", { code, count: result.length });
  }
  return result ?? [];
}

// ---------------------------------------------------------------------------
// 9. Balance Sheet (Gap 5)
// ---------------------------------------------------------------------------

export async function fetchVnstockBalanceSheet(code: string): Promise<VnstockBalanceSheet | null> {
  const result = await runPythonWithBackoff<VnstockBalanceSheet>(buildBalanceSheetScript(code), `balance_sheet:${code}`);
  if (result) {
    logger.info("[vnstock] fetched balance sheet", {
      code, year: result.yearReport, quarter: result.quarter,
      totalAssets: result.totalAssets, totalEquity: result.totalEquity,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// 10. Cash Flow (Gap 5)
// ---------------------------------------------------------------------------

export async function fetchVnstockCashFlow(code: string): Promise<VnstockCashFlow | null> {
  const result = await runPythonWithBackoff<VnstockCashFlow>(buildCashFlowScript(code), `cash_flow:${code}`);
  if (result) {
    logger.info("[vnstock] fetched cash flow", {
      code, year: result.yearReport, quarter: result.quarter,
      operatingCF: result.operatingCashFlow, netCF: result.netCashFlow,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// 11. Company News (Gap 6) — 6th news source
// ---------------------------------------------------------------------------

/**
 * Fetch recent company news items from vnstock.
 * @param code - Stock ticker symbol
 * @param limit - Maximum number of news items to return (default 20)
 */
export async function fetchVnstockNews(code: string, limit = 20): Promise<VnstockNewsItem[]> {
  const result = await runPython<VnstockNewsItem[]>(buildNewsScript(code, limit), `news:${code}`);
  if (result && result.length > 0) {
    logger.info("[vnstock] fetched company news", { code, count: result.length });
  }
  return result ?? [];
}

// ---------------------------------------------------------------------------
// 12. Batch: all data for one stock (for morning briefing / on-demand)
// ---------------------------------------------------------------------------

export interface VnstockFullSnapshot {
  price: VnstockPrice | null;
  financials: VnstockFinancials | null;
  tradingStats: VnstockTradingStats | null;
  officers: VnstockOfficer[];
  shareholders: VnstockShareholder[];
  balanceSheet: VnstockBalanceSheet | null;
  cashFlow: VnstockCashFlow | null;
}

/**
 * Fetch all data for one stock sequentially to avoid concurrent rate-limit floods.
 *
 * The old Promise.all([7 calls]) fired 7 Python subprocesses simultaneously.
 * With 30 watchlist tickers that became up to 210 concurrent VCI requests,
 * causing the RATE_LIMITED WARNs observed on D2D, VCB, CTG.
 * Sequential execution keeps the per-ticker cost at 7 serial calls but
 * eliminates the burst. Latency is acceptable — this runs in a background job.
 */
export async function fetchVnstockSnapshot(code: string): Promise<VnstockFullSnapshot> {
  const prices = await fetchVnstockPrices([code]);
  const financials = await fetchVnstockFinancials(code);
  const tradingStats = await fetchVnstockTradingStats(code);
  const officers = await fetchVnstockOfficers(code);
  const shareholders = await fetchVnstockShareholders(code);
  const balanceSheet = await fetchVnstockBalanceSheet(code);
  const cashFlow = await fetchVnstockCashFlow(code);

  return {
    price: prices[0] ?? null,
    financials,
    tradingStats,
    officers,
    shareholders,
    balanceSheet,
    cashFlow,
  };
}
