// src/scheduler/cascadeBacktestJob.ts
// Task 1505 — cascade-backtest (Sprint 192)
//
// Fires 20:30 UTC daily. Queries cascade_rule_hits where outcome_correct IS NULL
// and price_impact_3d IS NULL and hit_at <= datetime('now', '-3 days').
// Fills price_impact_3d / price_impact_7d / outcome_correct using daily_ohlcv closes.
// Sends WORK summary on completion.

import { Database } from "bun:sqlite";
import { updateOutcome } from "../../infrastructure/db/cascadeHitStore.js";
import type { IBacktestResultRepository } from "../../domain/repositories/IBacktestResultRepository.js";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";

export interface CascadeBacktestDeps {
  db?: Database;
  nowMsFn?: () => number;
  sendWorkFn?: (msg: string) => Promise<boolean>;
  backtestResultRepo?: IBacktestResultRepository;
  /** Injectable nowMs for recovery dedup guard (tests only — reuses nowMsFn field) */
  dedupNowMsFn?: () => number;
}

export interface CascadeBacktestResult {
  processed: number;
  skipped: number;
  noData: number;
}

interface PendingHitRow {
  id: number;
  rule_key: string;
  hit_at: string;
  affected_stocks: string | null;
}

function lookupClose(db: Database, code: string, date: string): number | null {
  const row = db
    .prepare("SELECT close FROM daily_ohlcv WHERE code = ? AND date = ? LIMIT 1")
    .get(code, date) as { close: number } | undefined;
  return row ? row.close : null;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export async function runCascadeBacktest(
  deps?: CascadeBacktestDeps
): Promise<CascadeBacktestResult> {
  let db: Database;
  let sendWorkFn: (msg: string) => Promise<boolean>;

  if (deps?.db) {
    db = deps.db;
  } else {
    const { getDb } = await import("../../infrastructure/db/schema.js");
    db = getDb();
  }

  // T4 dedup guard: skip if already ran within daily cadence window
  // @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of daily cadence (21.6h window)
  const DAILY_CADENCE_MS = 86_400_000;
  if (shouldSkipRecoveryReplay(db, "cascadeBacktestJob", DAILY_CADENCE_MS, deps?.dedupNowMsFn)) {
    return { processed: 0, skipped: 0, noData: 0 };
  }

  if (deps?.sendWorkFn) {
    sendWorkFn = deps.sendWorkFn;
  } else {
    const { sendTelegramWork } = await import(
      "../../infrastructure/notifiers/telegram.js"
    );
    sendWorkFn = (msg: string) => sendTelegramWork(msg, { parseMode: "" });
  }

  let backtestResultRepo: IBacktestResultRepository;
  if (deps?.backtestResultRepo) {
    backtestResultRepo = deps.backtestResultRepo;
  } else {
    const { SqliteBacktestResultRepository } = await import(
      "../../infrastructure/db/backtestResultRepo.js"
    );
    backtestResultRepo = new SqliteBacktestResultRepository(db);
  }

  let processed = 0;
  let noData = 0;

  // Aggregate accumulators for backtest run record
  const allImpacts3d: number[] = [];
  let winCount = 0;
  let earliestHitAt: string | null = null;

  // Batch fetch all pending hits older than 3 days
  const pendingRows = db
    .prepare(
      `SELECT id, rule_key, hit_at, affected_stocks
       FROM cascade_rule_hits
       WHERE outcome_correct IS NULL
         AND price_impact_3d IS NULL
         AND hit_at <= datetime('now', '-3 days')`
    )
    .all() as PendingHitRow[];

  for (const hit of pendingRows) {
    try {
      // Parse affected_stocks
      const stocks = hit.affected_stocks
        ? hit.affected_stocks
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : [];

      if (stocks.length === 0) {
        noData++;
        continue;
      }

      // Base date from hit_at (handles "YYYY-MM-DD HH:MM:SS" format)
      const baseDate = hit.hit_at.slice(0, 10);

      // Compute D+3 and D+7 dates via SQLite (handles month/year rollover)
      const d3Row = db
        .prepare("SELECT date(?, '+3 days') AS d3")
        .get(baseDate) as { d3: string };
      const d7Row = db
        .prepare("SELECT date(?, '+7 days') AS d7")
        .get(baseDate) as { d7: string };
      const d3Date = d3Row.d3;
      const d7Date = d7Row.d7;

      // Per-code close lookups
      const impacts3d: number[] = [];
      const impacts7d: number[] = [];

      for (const code of stocks) {
        const closeD0 = lookupClose(db, code, baseDate);
        if (closeD0 === null || closeD0 === 0) continue;

        const closeD3 = lookupClose(db, code, d3Date);
        if (closeD3 === null) continue; // no d3 data for this code

        impacts3d.push(((closeD3 - closeD0) / closeD0) * 100);

        const closeD7 = lookupClose(db, code, d7Date);
        if (closeD7 !== null) {
          impacts7d.push(((closeD7 - closeD0) / closeD0) * 100);
        }
      }

      // All codes missing d0 or d3 → noData
      if (impacts3d.length === 0) {
        noData++;
        continue;
      }

      // Average across codes with data
      const avgImpact3d = round4(
        impacts3d.reduce((a, b) => a + b, 0) / impacts3d.length
      );
      const avgImpact7d =
        impacts7d.length > 0
          ? round4(impacts7d.reduce((a, b) => a + b, 0) / impacts7d.length)
          : null;

      // outcome_correct: strictly > 1.0 → 1, strictly < -1.0 → 0, else null
      let outcomeCorrect: 0 | 1 | null = null;
      if (avgImpact3d > 1.0) outcomeCorrect = 1;
      else if (avgImpact3d < -1.0) outcomeCorrect = 0;

      updateOutcome(db, hit.id, {
        priceImpact3d: avgImpact3d,
        priceImpact7d: avgImpact7d,
        outcomeCorrect,
      });

      // Accumulate for backtest run record
      allImpacts3d.push(avgImpact3d);
      if (outcomeCorrect === 1) winCount++;
      const hitAtDate = hit.hit_at.slice(0, 10);
      if (earliestHitAt === null || hitAtDate < earliestHitAt) {
        earliestHitAt = hitAtDate;
      }

      processed++;
    } catch (err) {
      console.warn(
        `[cascade-backtest] row id=${hit.id} error: ${err instanceof Error ? err.message : String(err)}`
      );
      noData++;
    }
  }

  const skipped = 0; // WHERE clause pre-filters; no in-process age check

  // Persist backtest run record (FR-1). Fail-silent per FR-3.
  const today = new Date().toISOString().slice(0, 10);
  const totalReturn =
    allImpacts3d.length > 0
      ? round4(allImpacts3d.reduce((a, b) => a + b, 0) / allImpacts3d.length)
      : 0.0;
  const maxDrawdown =
    allImpacts3d.length > 0 ? round4(Math.min(...allImpacts3d)) : 0.0;
  const winRate = processed > 0 ? round4(winCount / processed) : 0.0;

  try {
    backtestResultRepo.saveRun({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      strategy: "cascade-backtest",
      startDate: earliestHitAt ?? today,
      endDate: today,
      runAt: new Date().toISOString(),
      totalReturn,
      benchmarkReturn: null,
      maxDrawdown,
      sharpeRatio: null,
      winRate,
      tradeCount: processed,
      resultJson: JSON.stringify({
        processed,
        skipped,
        noData,
        mean3dImpact: totalReturn,
        minImpact: maxDrawdown,
      }),
    });
  } catch (err) {
    console.warn(
      `[cascade-backtest] saveRun failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  await sendWorkFn(
    `[cascade-backtest] processed=${processed} skipped=${skipped} noData=${noData}`
  );

  return { processed, skipped, noData };
}
