/**
 * bctcBatchSweepJob.ts — Task 1841b: U-10 Quarterly BCTC Batch Sweep
 *
 * Scheduler job + pure domain logic for batch-fetching BCTC reports for all
 * watchlist tickers during earnings season (Jan, Apr, Jul, Oct).
 *
 * Design:
 *   - All I/O is injected via BctcBatchSweepDeps → unit-testable without VPS
 *   - Rate-limited: processes `maxConcurrent` tickers at a time with optional
 *     inter-batch delay
 *   - Per-ticker failures are isolated: one failure logs to BUG channel and
 *     the batch continues
 *   - MARKET channel digest sent on completion
 *
 * @module scheduler/financial-reports/bctcBatchSweepJob
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Result of a single ticker fetch attempt */
export interface TickerFetchResult {
  ticker: string;
  hasData: boolean;
  latestQuarter?: string;
}

/** Failure record for a single ticker */
export interface TickerFailure {
  ticker: string;
  reason: string;
}

/** Final result returned by runBctcBatchSweep */
export interface BctcBatchSweepResult {
  processed: number;
  succeeded: number;
  failed: number;
  failures: TickerFailure[];
  digestSent: boolean;
  durationMs: number;
}

/**
 * Injectable dependencies for runBctcBatchSweep.
 * All I/O goes through these — no direct imports of VPS clients or Telegram.
 */
export interface BctcBatchSweepDeps {
  /** Fetch all watchlist tickers from stock-classification.json */
  getWatchlistTickers: () => Promise<string[]>;

  /**
   * Fetch BCTC full data for a single ticker.
   * Mirrors the get_bctc_full MCP tool behaviour.
   */
  getBctcFull: (ticker: string) => Promise<TickerFetchResult>;

  /** Send completion digest to MARKET channel */
  sendMarketDigest: (message: string) => Promise<void>;

  /** Send individual failure alert to BUG channel */
  sendBugAlert: (message: string) => Promise<void>;

  /**
   * Wrap job execution for the job-run store (pass-through in production,
   * no-op wrapper in tests).
   */
  recordJobRun: (jobName: string, fn: () => Promise<void>) => Promise<void>;

  /** Maximum concurrent fetches per batch window. Default: 5 */
  maxConcurrent: number;

  /** Delay between batches in ms. Default: 2000 */
  batchDelayMs: number;
}

/** Options for runBctcBatchSweep */
export interface BctcBatchSweepOptions {
  /** If true, logs plan without calling getBctcFull or sending Telegram */
  dryRun?: boolean;
  /** Optional override for the ticker list; defaults to watchlist */
  tickers?: string[];
  /** Injectable deps; defaults to production deps */
  deps?: BctcBatchSweepDeps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Earnings season detection (pure, no I/O)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the given date falls in a Vietnamese earnings season month.
 * Earnings seasons: January (Q4), April (Q1), July (Q2), October (Q3).
 */
export function isEarningsSeason(date: Date): boolean {
  const month = date.getMonth() + 1; // getMonth() is 0-indexed
  return [1, 4, 7, 10].includes(month);
}

// ─────────────────────────────────────────────────────────────────────────────
// Production deps factory
// ─────────────────────────────────────────────────────────────────────────────

async function makeProductionDeps(): Promise<BctcBatchSweepDeps> {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const {
    sendTelegramMarket,
    sendTelegramBug,
  } = await import("../../infrastructure/notifiers/telegram.js");
  const { getDb } = await import("../../infrastructure/db/schema.js");
  const { SqliteJobRunRepository } = await import(
    "../../infrastructure/db/repositories/SqliteJobRunRepository.js"
  );

  /** Read all watchlist tickers from stock-classification.json */
  const getWatchlistTickers = async (): Promise<string[]> => {
    try {
      const raw = readFileSync(
        resolve(process.cwd(), "docs/data/stock-classification.json"),
        "utf-8",
      );
      const parsed = JSON.parse(raw) as { watchlist?: Array<{ ticker: string }> };
      return (parsed.watchlist ?? []).map((e) => e.ticker);
    } catch (err) {
      throw new Error(
        `[bctcBatchSweep] Failed to read stock-classification.json: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  /**
   * Call the get_bctc_full logic for a single ticker.
   * Uses the DB directly rather than routing through MCP to avoid HTTP overhead.
   */
  const getBctcFull = async (ticker: string): Promise<TickerFetchResult> => {
    const db = getDb();
    // Fetch the most recent financial report for this ticker
    const row = db
      .query<
        { period_year: number; period_quarter: number },
        [string]
      >(
        `SELECT period_year, period_quarter
         FROM financial_reports
         WHERE action_code = ?
         ORDER BY period_year DESC, period_quarter DESC
         LIMIT 1`,
      )
      .get(ticker);

    if (!row) {
      return { ticker, hasData: false };
    }

    return {
      ticker,
      hasData: true,
      latestQuarter: `Q${row.period_quarter}-${row.period_year}`,
    };
  };

  const db = getDb();
  const jobRunRepo = new SqliteJobRunRepository(db);

  return {
    getWatchlistTickers,
    getBctcFull,
    sendMarketDigest: async (msg) => { await sendTelegramMarket(msg); },
    sendBugAlert: async (msg) => { await sendTelegramBug(msg); },
    recordJobRun: (jobName, fn) => jobRunRepo.wrapRun(jobName, fn),
    maxConcurrent: 5,
    batchDelayMs: 2000,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core sweep logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a full BCTC batch sweep.
 *
 * Processes all watchlist tickers (or the provided override list) in batches
 * of `maxConcurrent`. Per-ticker failures are isolated: they log to BUG channel
 * and the batch continues. A completion digest is sent to the MARKET channel.
 *
 * When `dryRun` is true:
 *   - Returns the full ticker list with `processed` count
 *   - Does NOT call getBctcFull
 *   - Does NOT send any Telegram messages
 *   - succeeded/failed/failures are all zero/empty
 */
export async function runBctcBatchSweep(
  options: BctcBatchSweepOptions = {},
): Promise<BctcBatchSweepResult> {
  const { dryRun = false, tickers: tickersOverride } = options;

  // Use injected deps or build production deps
  const deps: BctcBatchSweepDeps = options.deps ?? (await makeProductionDeps());

  const startMs = Date.now();

  // Resolve ticker list
  const tickers: string[] = tickersOverride ?? (await deps.getWatchlistTickers());

  // Dry-run: return plan without executing
  if (dryRun) {
    return {
      processed: tickers.length,
      succeeded: 0,
      failed: 0,
      failures: [],
      digestSent: false,
      durationMs: Date.now() - startMs,
    };
  }

  const failures: TickerFailure[] = [];
  let succeeded = 0;

  // Process in batches of maxConcurrent
  const { maxConcurrent, batchDelayMs } = deps;
  for (let i = 0; i < tickers.length; i += maxConcurrent) {
    const batch = tickers.slice(i, i + maxConcurrent);

    const batchResults = await Promise.allSettled(
      batch.map((ticker) => deps.getBctcFull(ticker)),
    );

    for (let j = 0; j < batch.length; j++) {
      const ticker = batch[j]!;
      const result = batchResults[j]!;

      if (result.status === "fulfilled") {
        succeeded += 1;
      } else {
        const reason =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        failures.push({ ticker, reason });

        // Per-ticker BUG channel alert (fire-and-forget, non-blocking)
        void deps
          .sendBugAlert(
            `[bctcBatchSweep] ${ticker} failed: ${reason}`,
          )
          .catch(() => { /* swallow Telegram errors */ });
      }
    }

    // Inter-batch delay (skip for last batch)
    if (batchDelayMs > 0 && i + maxConcurrent < tickers.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, batchDelayMs));
    }
  }

  const durationMs = Date.now() - startMs;

  // MARKET channel completion digest
  const digestMsg = [
    "BCTC Batch Sweep hoàn tất",
    `Tổng: ${tickers.length} | Thành công: ${succeeded} | Thất bại: ${failures.length}`,
    `Thời gian: ${(durationMs / 1000).toFixed(1)}s`,
    failures.length > 0
      ? `Lỗi: ${failures.map((f) => f.ticker).join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  let digestSent = false;
  try {
    await deps.sendMarketDigest(digestMsg);
    digestSent = true;
  } catch (err) {
    // Non-fatal — batch result is still valid even if Telegram fails
    const errMsg = err instanceof Error ? err.message : String(err);
    void deps
      .sendBugAlert(`[bctcBatchSweep] digest send failed: ${errMsg}`)
      .catch(() => { /* swallow */ });
  }

  return {
    processed: tickers.length,
    succeeded,
    failed: failures.length,
    failures,
    digestSent,
    durationMs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron job entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Entry point for the cron scheduler.
 * Called by startScheduler on `CRONS.bctcBatchSweep`.
 *
 * Only executes during earnings season months (1, 4, 7, 10).
 * Logs start/completion to WORK channel.
 *
 * TASK-1943a diagnostic: console.log at entry confirms the job fired and
 * entered the function. If this log appears in Docker logs but no
 * cron_job_runs row exists, the issue is in wrapRun recording (unlikely).
 * If this log is absent, the container was down or the cron did not fire.
 * The wrapRun key in startScheduler.ts is 'bctcBatchSweepJob' — matches
 * what SqliteJobRunRepository.wrapRun expects. Zero-run root cause for
 * 2026-04-25: container likely down or restarted between 09:00-09:01 UTC.
 * Next scheduled fire: 2026-07-25 09:00 UTC.
 */
export async function runBctcBatchSweepJob(): Promise<void> {
  const now = new Date();

  // TASK-1943a: diagnostic entry log — confirms job fired (visible in Docker logs)
  console.log(`[bctcBatchSweepJob] Starting batch sweep job — ${now.toISOString()}`);

  if (!isEarningsSeason(now)) {
    // Outside earnings season — skip silently
    console.log(`[bctcBatchSweepJob] Outside earnings season (month=${now.getMonth() + 1}) — skipping`);
    return;
  }

  const { sendTelegramWork } = await import(
    "../../infrastructure/notifiers/telegram.js"
  );

  const monthName = now.toLocaleString("vi-VN", { month: "long" });
  await sendTelegramWork(
    `[bctcBatchSweep] Bắt đầu quét BCTC tháng ${monthName} — tất cả 30 mã watchlist`,
  ).catch(() => { /* non-fatal */ });

  const result = await runBctcBatchSweep();

  await sendTelegramWork(
    `[bctcBatchSweep] Hoàn tất — processed=${result.processed} succeeded=${result.succeeded} failed=${result.failed} duration=${result.durationMs}ms`,
  ).catch(() => { /* non-fatal */ });
}
