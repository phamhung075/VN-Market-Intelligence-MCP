// src/scheduler/ohlcvStartupProbe.ts
// STUB — task 1352 TDD placeholder. Real implementation in task 1353.
import { Database } from "bun:sqlite";

export interface OhlcvStartupProbeDeps {
  db?: Database;
  sendWorkFn?: (msg: string) => Promise<boolean>;
}

export interface OhlcvStartupProbeResult {
  sparseTickers: Array<{ code: string; count: number }>;
  sent: boolean;
}

export async function runOhlcvStartupProbe(
  _deps?: OhlcvStartupProbeDeps
): Promise<OhlcvStartupProbeResult> {
  throw new Error("NOT_IMPLEMENTED — task 1353 will provide the real implementation");
}
