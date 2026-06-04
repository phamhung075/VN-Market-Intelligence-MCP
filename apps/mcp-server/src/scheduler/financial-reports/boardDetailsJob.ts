/**
 * Board Details Ingest Job — RAPID-DATA-LAYER FIX-I-B
 *
 * Daily pull-based ingest: fetches board-member appointment_year data for the
 * full watchlist from the Vinahost VPS proxy and updates vnstock_officers rows.
 *
 * Watchlist source: docs/data/stock-classification.json (SSOT — not hardcoded).
 * VPS endpoint: GET http://125.212.251.27:8765/proxy/board-details?batch=T1,...
 * Schedule: daily 21:00 UTC (04:00 VN next day) via CRONS.boardDetailsRefresh.
 *
 * UPDATE-only guard: only existing vnstock_officers rows are updated; no fabrication.
 *
 * @module scheduler/financial-reports/boardDetailsJob
 */

import * as fs from "node:fs";
import { fetchBoardDetails } from "../../infrastructure/fetchers/boardDetailsFetcher.js";
import { upsertBoardDetails } from "../../infrastructure/db/boardDetailsStore.js";
import { getDb } from "../../infrastructure/db/schema.js";
import type { Database } from "bun:sqlite";
import type { BoardDetailsFetchResult } from "../../infrastructure/fetchers/boardDetailsFetcher.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BoardDetailsJobResult {
  success: boolean;
  rows_updated: number;
  tickers_ok: string[];
  tickers_error: string[];
  error?: string;
}

export interface BoardDetailsJobOptions {
  db?: Database;
  fetchFn?: typeof fetch;
}

// ─────────────────────────────────────────────────────────────────────────────
// Watchlist loader
// ─────────────────────────────────────────────────────────────────────────────

function loadWatchlistTickers(): string[] {
  try {
    const raw = fs.readFileSync("docs/data/stock-classification.json", "utf-8");
    const d = JSON.parse(raw) as { watchlist?: Array<{ ticker: string }> };
    return (d.watchlist ?? []).map((e) => e.ticker.toUpperCase().trim());
  } catch {
    console.warn("[boardDetailsJob] could not read stock-classification.json — empty watchlist");
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Job implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the board-details ingest job.
 *
 * Fetches all watchlist tickers in chunked requests, then updates
 * vnstock_officers.appointment_year for matched (code, name) rows.
 *
 * @param options Optional DI overrides (db, fetchFn) for unit testing
 */
export async function runBoardDetailsJob(
  options?: BoardDetailsJobOptions,
): Promise<BoardDetailsJobResult> {
  const db = options?.db ?? getDb();
  const fetchFn = options?.fetchFn ?? fetch;

  const tickers = loadWatchlistTickers();
  if (tickers.length === 0) {
    return {
      success: false,
      rows_updated: 0,
      tickers_ok: [],
      tickers_error: [],
      error: "empty watchlist",
    };
  }

  let result: BoardDetailsFetchResult | null = null;
  try {
    result = await fetchBoardDetails(tickers, fetchFn);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      rows_updated: 0,
      tickers_ok: [],
      tickers_error: tickers,
      error: msg,
    };
  }

  if (!result) {
    return {
      success: false,
      rows_updated: 0,
      tickers_ok: [],
      tickers_error: tickers,
      error: "VPS fetch returned null",
    };
  }

  const rowsUpdated = upsertBoardDetails(db, result.officers);

  return {
    success: true,
    rows_updated: rowsUpdated,
    tickers_ok: result.tickers_ok,
    tickers_error: result.tickers_error,
  };
}
