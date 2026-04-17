// src/scheduler/ohlcvDailyAggregatorJob.ts
// Task 1359 — implementation stub (Sprint 122)
// This file is a type-only stub so task 1358 tests compile.
// Full implementation ships in task 1359.

import { Database } from "bun:sqlite";

export interface OhlcvAggregatorDeps {
  db?: () => Database;
  nowMsFn?: () => number;
  sendWorkFn?: (msg: string) => Promise<boolean>;
}

export interface OhlcvAggregatorResult {
  tickersProcessed: number;
  rowsWritten: number;
  tickersSkipped: number;
  sent: boolean;
}

/** Stub — implemented in task 1359. */
export async function runOhlcvDailyAggregator(
  _deps?: OhlcvAggregatorDeps
): Promise<OhlcvAggregatorResult> {
  throw new Error("runOhlcvDailyAggregator: not yet implemented (task 1359)");
}
