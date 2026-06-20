// src/application/usecases/getOhlcvPipelineHealth.ts
// Task 1367 — implementation of getOhlcvPipelineHealth use case (Sprint 126)

import type { Database } from "bun:sqlite";

export interface OhlcvPipelineHealthOptions {
  db: Database;
  /** List of tickers to check. Defaults to all codes in watchlist table. */
  tickers?: string[];
  /** Injectable TA computation fn — for TDD. Defaults to defaultComputeTa.
   *  Accepts both sync and async implementations (default is async Go engine). */
  computeTaFn?: (code: string, db: Database) => { rsiStatus: string; rsi14: number | null } | null | Promise<{ rsiStatus: string; rsi14: number | null } | null>;
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

export async function getOhlcvPipelineHealth(
  options: OhlcvPipelineHealthOptions,
): Promise<OhlcvPipelineHealthResult> {
  const { db } = options;

  // ── Resolve tickers ───────────────────────────────────────────────────────
  let tickers: string[];
  if (options.tickers !== undefined) {
    tickers = options.tickers;
  } else {
    const rows = db.query<{ code: string }, []>(
      "SELECT code FROM watchlist",
    ).all();
    tickers = rows.map((r) => r.code);
  }

  // ── Resolve computeTaFn ───────────────────────────────────────────────────
  let computeTaFn: (code: string, db: Database) => { rsiStatus: string; rsi14: number | null } | null | Promise<{ rsiStatus: string; rsi14: number | null } | null>;
  if (options.computeTaFn) {
    computeTaFn = options.computeTaFn;
  } else {
    // Lazy-import to avoid pulling infra into non-test paths without side effects
    const { defaultComputeTa } = await import("./assembleBriefing.js");
    computeTaFn = defaultComputeTa;
  }

  // ── Per-ticker health ─────────────────────────────────────────────────────
  const tickerStatus: TickerHealthStatus[] = [];
  let taSummaryCount = 0;

  for (const code of tickers) {
    const row = db.query<{ cnt: number }, [string]>(
      "SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code = ?",
    ).get(code);

    const ohlcvRows = row?.cnt ?? 0;
    const taReady = ohlcvRows >= 8;

    const status: TickerHealthStatus = { code, ohlcvRows, taReady };

    if (taReady) {
      try {
        const ta = await Promise.resolve(computeTaFn(code, db));
        if (ta !== null) {
          status.taSignal = ta.rsiStatus;
          if (ta.rsi14 !== null) {
            status.rsi14 = ta.rsi14;
          }
          if (ta.rsiStatus === "overbought" || ta.rsiStatus === "oversold") {
            taSummaryCount++;
          }
        }
      } catch {
        status.taSignal = "error";
      }
    }

    tickerStatus.push(status);
  }

  // ── Backfill queue ────────────────────────────────────────────────────────
  let backfillQueue: BackfillQueueStatus = { pending: false };

  try {
    const pendingRow = db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) AS cnt FROM ohlcv_backfill_queue WHERE done = 0",
    ).get();
    const pendingCount = pendingRow?.cnt ?? 0;
    backfillQueue.pending = pendingCount > 0;

    if (backfillQueue.pending) {
      const lastReqRow = db.query<{ ts: string | null }, []>(
        "SELECT MAX(queued_at) AS ts FROM ohlcv_backfill_queue WHERE done = 0",
      ).get();
      if (lastReqRow?.ts) {
        backfillQueue.lastRequestedAt = lastReqRow.ts;
      }
    }

    const lastDoneRow = db.query<{ ts: string | null }, []>(
      "SELECT MAX(queued_at) AS ts FROM ohlcv_backfill_queue WHERE done = 1",
    ).get();
    if (lastDoneRow?.ts) {
      backfillQueue.lastCompletedAt = lastDoneRow.ts;
    }
  } catch {
    // Table may not exist — treat as no pending items
    backfillQueue = { pending: false };
  }

  // ── Aggregator last run ───────────────────────────────────────────────────
  let aggregatorLastRun: string | undefined;
  try {
    const lastRunRow = db.query<{ last: string | null }, []>(
      "SELECT MAX(date) AS last FROM daily_ohlcv",
    ).get();
    if (lastRunRow?.last) {
      aggregatorLastRun = lastRunRow.last;
    }
  } catch {
    // Ignore — daily_ohlcv may not exist in edge cases
  }

  return {
    generatedAt: new Date().toISOString(),
    tickerStatus,
    backfillQueue,
    ...(aggregatorLastRun !== undefined ? { aggregatorLastRun } : {}),
    taSummaryCount,
  };
}
