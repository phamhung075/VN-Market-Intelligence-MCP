// src/application/usecases/getOhlcvPipelineHealth.ts
// Stub — implementation in task 1367.

import type { Database } from "bun:sqlite";

export interface OhlcvPipelineHealthOptions {
  db: Database;
  /** List of tickers to check. Defaults to all codes in watchlist table. */
  tickers?: string[];
  /** Injectable TA computation fn — for TDD. Defaults to defaultComputeTa. */
  computeTaFn?: (code: string, db: Database) => { rsiStatus: string; rsi14: number | null } | null;
}

export interface TickerHealthStatus {
  code: string;
  ohlcvRows: number;
  taReady: boolean;
  taSignal?: string;
  rsi14?: number;
}

export interface BackfillQueueStatus {
  pending: boolean;
  lastRequestedAt?: string;
  lastCompletedAt?: string;
}

export interface OhlcvPipelineHealthResult {
  generatedAt: string;
  tickerStatus: TickerHealthStatus[];
  backfillQueue: BackfillQueueStatus;
  aggregatorLastRun?: string;
  taSummaryCount: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getOhlcvPipelineHealth(
  _options: OhlcvPipelineHealthOptions,
): Promise<OhlcvPipelineHealthResult> {
  throw new Error("Not implemented — task 1367");
}
