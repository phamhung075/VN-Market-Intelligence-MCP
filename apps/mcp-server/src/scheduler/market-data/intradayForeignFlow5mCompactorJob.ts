// src/scheduler/market-data/intradayForeignFlow5mCompactorJob.ts
// ALPHA-S2-FF-SUB3-JOB-CRON — 5-min foreign-flow bucket compactor (Sprint FLOW-PRICE-ALPHA-LOOP).
//
// STANDALONE from the price plane (intraday5mCompactorJob.ts) — distinct bounded context,
// distinct aggregation semantics. Standalone 24/7 cron (*/5 * * * *), NO market-hours gate
// (same rationale as the price-plane sibling: an empty foreign_flow_history table on a
// weekend/holiday no-ops for free). Every run re-aggregates the ENTIRE current content of
// foreign_flow_history (bounded by its own rolling ~24h purge inline in
// pushForeignFlowHandler.ts Step 6b) into 5-min UTC-aligned buckets and UPSERTs every bucket
// unconditionally into intraday_foreign_flow_5m. Idempotent + gap-tolerant by construction —
// no per-code watermark, no external state table.
//
// AGGREGATION SEMANTICS — LAST-value-in-bucket, NOT OHLC (architect brief §2.3/§6):
// foreignBuyVol/foreignSellVol/foreignBuyValue/foreignSellValue are CUMULATIVE counters for
// the trading day (same convention as daily_ohlcv.volume); foreign_room/holding_ratio are
// point-in-time gauges. There is no open/high/low concept for either — the correct per-bucket
// aggregate for every column is the chronologically LAST non-null snapshot value
// (COALESCE-style: a payload missing a field mid-bucket does not blank out a previously-known
// value — mirrors ohlcvForeignFlowStore.ts's own COALESCE(excluded.x, x) pattern).
// foreign_net_vol is computed at write time from the bucket's LAST-known buy/sell pair.
//
// The first invocation of this job (cron tick OR the startScheduler.ts one-shot call) IS the
// backfill of whatever ticks currently survive at deploy time — no separate migration script.
//
// Design SSOT: docs/architecture-briefs/2026-07-15-alpha-s2-foreign-flow-write-race-verdict.md §6

import { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";

const FIVE_MIN_MS = 5 * 60 * 1000;

export interface IntradayForeignFlow5mCompactorDeps {
  db?: () => Database;
  nowMsFn?: () => number;
}

export interface IntradayForeignFlow5mCompactorResult {
  codesProcessed: number;
  bucketsWritten: number;
  ticksScanned: number;
}

interface HistoryTickRow {
  code: string;
  fetched_at: string;
  foreign_buy_vol: number | null;
  foreign_sell_vol: number | null;
  put_through_vol: number | null;
  foreign_buy_value: number | null;
  foreign_sell_value: number | null;
  foreign_room: number | null;
  holding_ratio: number | null;
}

interface BucketAccumulator {
  code: string;
  bucketStartMs: number;
  foreignBuyVol: number | null;
  foreignSellVol: number | null;
  putThroughVol: number | null;
  foreignBuyValue: number | null;
  foreignSellValue: number | null;
  foreignRoom: number | null;
  holdingRatio: number | null;
  tickCount: number;
}

/** COALESCE-style last-non-null-wins fold — a null in the newer row must NOT blank a
 *  previously-known value (brief §2.3). */
function lastNonNull(prev: number | null, next: number | null): number | null {
  return next !== null && next !== undefined ? next : prev;
}

/**
 * Aggregate ALL foreign_flow_history ticks into 5-min UTC-aligned buckets, UPSERTing every
 * bucket into intraday_foreign_flow_5m. See module header for design rationale.
 *
 * Hard constraint: NO market-hours gate anywhere in this job (brief §6, mirrors the price-plane
 * sibling's §4). An empty foreign_flow_history table naturally makes the query below return
 * zero rows — the job no-ops at negligible cost.
 */
export async function runIntradayForeignFlow5mCompactor(
  deps?: IntradayForeignFlow5mCompactorDeps,
): Promise<IntradayForeignFlow5mCompactorResult> {
  const db = deps?.db ? deps.db() : getDb();
  const nowMs = deps?.nowMsFn ? deps.nowMsFn() : Date.now();

  // Single bounded scan — foreign_flow_history cannot hold more than ~24h of data (the
  // rolling purge inline in pushForeignFlowHandler.ts Step 6b guarantees this), so a full-table
  // scan is never unbounded.
  const rows = db
    .prepare(
      `SELECT code, fetched_at, foreign_buy_vol, foreign_sell_vol, put_through_vol,
              foreign_buy_value, foreign_sell_value, foreign_room, holding_ratio
       FROM foreign_flow_history
       ORDER BY code ASC, fetched_at ASC`,
    )
    .all() as HistoryTickRow[];

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
        foreignBuyVol: row.foreign_buy_vol,
        foreignSellVol: row.foreign_sell_vol,
        putThroughVol: row.put_through_vol,
        foreignBuyValue: row.foreign_buy_value,
        foreignSellValue: row.foreign_sell_value,
        foreignRoom: row.foreign_room,
        holdingRatio: row.holding_ratio,
        tickCount: 1,
      });
      continue;
    }

    // Rows arrive time-ordered (fetched_at ASC) within each code, so folding forward with
    // lastNonNull naturally converges on the chronologically LAST non-null value per column —
    // no separate ORDER BY DESC query needed (mirrors intraday5mCompactorJob.ts's close-tracking
    // idiom, but LAST-value-in-bucket for every column, not just one).
    existing.foreignBuyVol = lastNonNull(existing.foreignBuyVol, row.foreign_buy_vol);
    existing.foreignSellVol = lastNonNull(existing.foreignSellVol, row.foreign_sell_vol);
    existing.putThroughVol = lastNonNull(existing.putThroughVol, row.put_through_vol);
    existing.foreignBuyValue = lastNonNull(existing.foreignBuyValue, row.foreign_buy_value);
    existing.foreignSellValue = lastNonNull(existing.foreignSellValue, row.foreign_sell_value);
    existing.foreignRoom = lastNonNull(existing.foreignRoom, row.foreign_room);
    existing.holdingRatio = lastNonNull(existing.holdingRatio, row.holding_ratio);
    existing.tickCount += 1;
  }

  const compactedAt = new Date(nowMs).toISOString();
  const upsertStmt = db.prepare(
    `INSERT OR REPLACE INTO intraday_foreign_flow_5m
       (code, bucket_ts, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol,
        foreign_buy_value, foreign_sell_value, foreign_room, holding_ratio, tick_count, compacted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const entries = Array.from(buckets.values());
  const writeMany = db.transaction((rowsToWrite: BucketAccumulator[]) => {
    for (const b of rowsToWrite) {
      // foreign_net_vol computed from the bucket's LAST-known buy/sell pair — brief §2.3/§6.
      const netVol =
        b.foreignBuyVol !== null && b.foreignSellVol !== null ? b.foreignBuyVol - b.foreignSellVol : null;
      upsertStmt.run(
        b.code,
        new Date(b.bucketStartMs).toISOString(),
        b.foreignBuyVol,
        b.foreignSellVol,
        netVol,
        b.putThroughVol,
        b.foreignBuyValue,
        b.foreignSellValue,
        b.foreignRoom,
        b.holdingRatio,
        b.tickCount,
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
