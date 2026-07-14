// src/scheduler/market-data/intraday5mCompactorJob.ts
// ALPHA-S2-SUB2-JOB-CRON — 5-min OHLCV bar compactor (Sprint FLOW-PRICE-ALPHA-LOOP).
//
// Standalone 24/7 cron (*/5 * * * *), NO market-hours gate (brief §4). Every run
// re-aggregates the ENTIRE current content of market_prices_history (bounded by the
// table's own rolling ~24h purge in pushPricesHandler.ts, see brief §1.1/§2) into
// 5-min UTC-aligned bars and UPSERTs every bucket unconditionally into
// intraday_ohlcv_5m. Idempotent + gap-tolerant by construction (brief §2) — no
// per-code watermark, no external state table: re-running with unchanged source
// ticks reproduces byte-identical rows; a delayed/missed run simply sees more
// accumulated ticks next time and catches every bucket up in one pass.
//
// The first invocation of this job (cron tick OR the startScheduler.ts one-shot
// call, see brief §5) IS the backfill of whatever ticks currently survive at
// deploy time — no separate migration script needed.
//
// Design SSOT: docs/architecture-briefs/2026-07-14-alpha-s2-tick-downsample-5min.md §3-6
//
// Deliberately does NOT route through writeOhlcvBatch / any scale-detection path
// (brief §3): market_prices_history.price is already VND-normalized once at write
// time by pushPricesHandler.ts, so a plain prepared-statement full-row
// `INSERT OR REPLACE` is the correct, simpler tool here — every run recomputes the
// COMPLETE bucket from all currently-surviving source ticks (not an incremental
// partial push), unlike daily_ohlcv's partial-merge ON CONFLICT rules.
//
// Scope: ALL codes present in market_prices_history (brief §6) — NOT just the
// watchlist (contrast with ohlcvDailyAggregatorJob.ts, which scopes to
// `SELECT code FROM watchlist`). Deliberate deviation, called out in the brief so
// it is not "corrected" back to watchlist-only under a mistaken consistency
// assumption — the source rows already exist in the one table being scanned
// regardless of watchlist membership, so there is zero extra fetch cost.

import { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";

const FIVE_MIN_MS = 5 * 60 * 1000;

export interface Intraday5mCompactorDeps {
  db?: () => Database;
  nowMsFn?: () => number;
}

export interface Intraday5mCompactorResult {
  codesProcessed: number;
  bucketsWritten: number;
  ticksScanned: number;
}

interface TickRow {
  code: string;
  price: number;
  volume: number;
  fetched_at: string;
}

interface BucketAccumulator {
  code: string;
  bucketStartMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tick_count: number;
}

/**
 * Aggregate ALL market_prices_history ticks into 5-min UTC-aligned OHLCV bars,
 * UPSERTing every bucket into intraday_ohlcv_5m. See module header for design
 * rationale (brief §2-6).
 *
 * Hard constraint: NO market-hours gate anywhere in this job. An empty
 * market_prices_history table on a weekend/holiday makes the query below return
 * zero rows — the job naturally no-ops at negligible cost; that is correct
 * behavior, not a bug to guard against with an explicit skip (brief §4).
 */
export async function runIntraday5mCompactor(
  deps?: Intraday5mCompactorDeps
): Promise<Intraday5mCompactorResult> {
  const db = deps?.db ? deps.db() : getDb();
  const nowMs = deps?.nowMsFn ? deps.nowMsFn() : Date.now();

  // Single bounded scan — market_prices_history cannot hold more than ~24h of
  // data (the existing rolling purge in pushPricesHandler.ts guarantees this),
  // so a full-table scan is never unbounded (brief §2).
  const rows = db
    .prepare(
      "SELECT code, price, volume, fetched_at FROM market_prices_history ORDER BY code ASC, fetched_at ASC"
    )
    .all() as TickRow[];

  // Group into 5-min buckets per code, in JS (brief §4 algorithm — reuses the
  // ohlcvDailyAggregatorJob.ts per-window style rather than a SQL window-function
  // pass, the more directly analogous precedent for this exact source table).
  const buckets = new Map<string, BucketAccumulator>();
  const codesSeen = new Set<string>();

  for (const row of rows) {
    codesSeen.add(row.code);
    const tickMs = new Date(row.fetched_at).getTime();
    const bucketStartMs = Math.floor(tickMs / FIVE_MIN_MS) * FIVE_MIN_MS;
    const key = `${row.code}|${bucketStartMs}`;

    const existing = buckets.get(key);
    if (existing === undefined) {
      buckets.set(key, {
        code: row.code,
        bucketStartMs,
        open: row.price,
        high: row.price,
        low: row.price,
        close: row.price,
        volume: row.volume,
        tick_count: 1,
      });
      continue;
    }

    // Rows arrive time-ordered (fetched_at ASC) within each code, so the LAST
    // row seen for a bucket is always its close — no separate ORDER BY DESC
    // query needed (brief §4 step 3).
    existing.close = row.price;
    existing.high = Math.max(existing.high, row.price);
    existing.low = Math.min(existing.low, row.price);
    // volume: MAX(volume) across ticks in the bucket — SAME cumulative-to-date
    // convention as daily_ohlcv.volume (NOT a per-bar delta), per brief §1.2/§3.
    // market_prices_history.volume is the cumulative session volume reported by
    // the exchange at each snapshot, not a per-interval delta.
    existing.volume = Math.max(existing.volume, row.volume);
    existing.tick_count += 1;
  }

  const compactedAt = new Date(nowMs).toISOString();
  const upsertStmt = db.prepare(
    `INSERT OR REPLACE INTO intraday_ohlcv_5m
       (code, bucket_ts, open, high, low, close, volume, tick_count, compacted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const entries = Array.from(buckets.values());
  const writeMany = db.transaction((rowsToWrite: BucketAccumulator[]) => {
    for (const b of rowsToWrite) {
      upsertStmt.run(
        b.code,
        new Date(b.bucketStartMs).toISOString(),
        b.open,
        b.high,
        b.low,
        b.close,
        b.volume,
        b.tick_count,
        compactedAt,
      );
    }
  });
  writeMany(entries);

  return {
    codesProcessed: codesSeen.size,
    bucketsWritten: entries.length,
    ticksScanned: rows.length,
  };
}
