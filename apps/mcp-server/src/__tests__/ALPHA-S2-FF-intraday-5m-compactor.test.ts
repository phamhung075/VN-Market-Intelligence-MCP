// src/__tests__/ALPHA-S2-FF-intraday-5m-compactor.test.ts
// ALPHA-S2-FF-SUB5-TESTS — feature test coverage for runIntradayForeignFlow5mCompactor
// (Sprint FLOW-PRICE-ALPHA-LOOP, epic ALPHA-S2-FOREIGN-FLOW-WRITE-RACE, subtask 5/5-6).
//
// Exercises the DI seam (IntradayForeignFlow5mCompactorDeps: db?, nowMsFn?) against an
// in-memory SQLite DB seeded via initMarketDataTables(). Covers:
//   1. 5-min UTC-aligned bucketing with LAST-value-in-bucket semantics (NOT OHLC — brief
//      §2.3/§6): every numeric column takes the chronologically LAST value in the bucket,
//      foreign_net_vol computed from the bucket's last-known buy/sell pair.
//   2. COALESCE-style null-preservation: a payload missing a field mid-bucket does not blank
//      out a previously-known value (mirrors ohlcvForeignFlowStore.ts's own COALESCE pattern).
//   3. INSERT OR REPLACE idempotency (AC#4 in brief §8, mirrors sibling's AC#3).
//   4. Gap-tolerance — ticks spanning multiple 5-min buckets incl. an empty gap are all
//      correctly compacted in ONE run (AC#4).
//   5. No-market-hours-dependence — empty foreign_flow_history is a natural no-op, no throw
//      (AC#5) — this job has NO market-hours gate by design.
//   6. Forward-preservation e2e regression (AC#8) — bars compacted BEFORE the existing
//      rolling-24h purge on foreign_flow_history (pushForeignFlowHandler.ts Step 6b) still
//      summarize the purged window correctly afterwards, ties both tables together end-to-end.
//
// Design SSOT: docs/architecture-briefs/2026-07-15-alpha-s2-foreign-flow-write-race-verdict.md

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { runIntradayForeignFlow5mCompactor } from "../scheduler/market-data/intradayForeignFlow5mCompactorJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface TickInput {
  foreignBuyVol?: number | null;
  foreignSellVol?: number | null;
  putThroughVol?: number | null;
  foreignBuyValue?: number | null;
  foreignSellValue?: number | null;
  foreignRoom?: number | null;
  holdingRatio?: number | null;
}

/** Insert one raw foreign-flow tick into foreign_flow_history. All params bound. */
function addTick(db: Database, code: string, fetchedAt: string, t: TickInput = {}): void {
  db.prepare(
    `INSERT OR IGNORE INTO foreign_flow_history
       (code, fetched_at, foreign_buy_vol, foreign_sell_vol, put_through_vol,
        foreign_buy_value, foreign_sell_value, foreign_room, holding_ratio)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    code,
    fetchedAt,
    t.foreignBuyVol ?? null,
    t.foreignSellVol ?? null,
    t.putThroughVol ?? null,
    t.foreignBuyValue ?? null,
    t.foreignSellValue ?? null,
    t.foreignRoom ?? null,
    t.holdingRatio ?? null,
  );
}

interface Bucket5m {
  code: string;
  bucket_ts: string;
  foreign_buy_vol: number | null;
  foreign_sell_vol: number | null;
  foreign_net_vol: number | null;
  put_through_vol: number | null;
  foreign_buy_value: number | null;
  foreign_sell_value: number | null;
  foreign_room: number | null;
  holding_ratio: number | null;
  tick_count: number;
  compacted_at: string;
}

function readBuckets(db: Database): Bucket5m[] {
  return db
    .prepare("SELECT * FROM intraday_foreign_flow_5m ORDER BY code ASC, bucket_ts ASC")
    .all() as Bucket5m[];
}

/**
 * Mirrors the EXISTING rolling-24h purge inline in pushForeignFlowHandler.ts (Step 6b):
 * `DELETE FROM foreign_flow_history WHERE fetched_at < cutoff`, cutoff = Date.now() - 24h.
 * That handler computes cutoff from the real wall clock (not DI'd) — this helper reproduces
 * the IDENTICAL SQL against a caller-supplied nowMs so the forward-preservation regression
 * test (AC#8) can pin a deterministic purge boundary instead of depending on wall-clock time.
 */
function purgeOlderThan24h(db: Database, nowMs: number): void {
  const cutoff = new Date(nowMs - 24 * 3600 * 1000).toISOString();
  db.prepare("DELETE FROM foreign_flow_history WHERE fetched_at < ?").run(cutoff);
}

describe("ALPHA-S2-FF-SUB5-TESTS — runIntradayForeignFlow5mCompactor", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initMarketDataTables(db);
  });

  afterEach(() => {
    db.close();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. 5-min UTC-aligned bucketing — LAST-value-in-bucket, NOT OHLC (brief §2.3/§6)
  // ───────────────────────────────────────────────────────────────────────────
  it("buckets ticks into 5-min UTC-aligned buckets using LAST-value-in-bucket semantics (not OHLC)", async () => {
    // Bucket A: [2026-07-15T02:30:00.000Z, 02:35:00.000Z)
    addTick(db, "VCB", "2026-07-15T02:30:05.000Z", {
      foreignBuyVol: 1000, foreignSellVol: 400, putThroughVol: 50,
      foreignBuyValue: 80_000_000, foreignSellValue: 32_000_000,
      foreignRoom: 12.5, holdingRatio: 8.1,
    });
    addTick(db, "VCB", "2026-07-15T02:32:00.000Z", {
      foreignBuyVol: 1500, foreignSellVol: 600, putThroughVol: 70,
      foreignBuyValue: 120_000_000, foreignSellValue: 48_000_000,
      foreignRoom: 12.3, holdingRatio: 8.05,
    });
    // LAST tick in bucket A — this is what the whole bucket must resolve to
    addTick(db, "VCB", "2026-07-15T02:34:55.000Z", {
      foreignBuyVol: 1800, foreignSellVol: 900, putThroughVol: 90,
      foreignBuyValue: 144_000_000, foreignSellValue: 72_000_000,
      foreignRoom: 12.1, holdingRatio: 8.0,
    });

    // Bucket B: [2026-07-15T02:35:00.000Z, 02:40:00.000Z) — single tick
    addTick(db, "VCB", "2026-07-15T02:37:00.000Z", {
      foreignBuyVol: 2000, foreignSellVol: 1000, putThroughVol: 100,
      foreignBuyValue: 160_000_000, foreignSellValue: 80_000_000,
      foreignRoom: 12.0, holdingRatio: 7.95,
    });

    const result = await runIntradayForeignFlow5mCompactor({
      db: () => db,
      nowMsFn: () => Date.parse("2026-07-15T02:40:00.000Z"),
    });

    expect(result).toEqual({ codesProcessed: 1, bucketsWritten: 2, ticksScanned: 4 });

    const buckets = readBuckets(db);
    expect(buckets).toHaveLength(2);

    const [bucketA, bucketB] = buckets;
    expect(bucketA!.bucket_ts).toBe("2026-07-15T02:30:00.000Z");
    // LAST value in bucket, NOT max/min — the middle tick's higher buy_vol (1500) is NOT the
    // answer; the chronologically LAST tick's value (1800) is.
    expect(bucketA!.foreign_buy_vol).toBe(1800);
    expect(bucketA!.foreign_sell_vol).toBe(900);
    expect(bucketA!.foreign_net_vol).toBe(900); // 1800 - 900, computed from LAST-known pair
    expect(bucketA!.put_through_vol).toBe(90);
    expect(bucketA!.foreign_buy_value).toBe(144_000_000);
    expect(bucketA!.foreign_sell_value).toBe(72_000_000);
    expect(bucketA!.foreign_room).toBe(12.1);
    expect(bucketA!.holding_ratio).toBe(8.0);
    expect(bucketA!.tick_count).toBe(3);
    expect(bucketA!.compacted_at).toBe("2026-07-15T02:40:00.000Z");

    expect(bucketB!.bucket_ts).toBe("2026-07-15T02:35:00.000Z");
    expect(bucketB!.foreign_buy_vol).toBe(2000);
    expect(bucketB!.foreign_net_vol).toBe(1000);
    expect(bucketB!.tick_count).toBe(1);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. COALESCE-style null-preservation (brief §2.3 hard constraint)
  // ───────────────────────────────────────────────────────────────────────────
  it("preserves a previously-known value when a LATER tick in the same bucket has a null field (COALESCE-style, not blanked)", async () => {
    addTick(db, "FPT", "2026-07-15T03:00:05.000Z", {
      foreignBuyVol: 500, foreignSellVol: 200, foreignBuyValue: 40_000_000, foreignSellValue: 16_000_000,
      foreignRoom: 20.0, holdingRatio: 15.0,
    });
    // Later tick in the SAME bucket: foreignBuyValue/foreignSellValue absent (null) —
    // e.g. bgapidatafeed omitted fBValue/fSValue this cycle. Must NOT blank the prior value.
    addTick(db, "FPT", "2026-07-15T03:02:00.000Z", {
      foreignBuyVol: 700, foreignSellVol: 300, foreignBuyValue: null, foreignSellValue: null,
      foreignRoom: 19.8, holdingRatio: 14.9,
    });

    const result = await runIntradayForeignFlow5mCompactor({
      db: () => db,
      nowMsFn: () => Date.parse("2026-07-15T03:05:00.000Z"),
    });
    expect(result.bucketsWritten).toBe(1);

    const [bucket] = readBuckets(db);
    // Volumes/room/ratio: plain LAST value (both ticks provided them)
    expect(bucket!.foreign_buy_vol).toBe(700);
    expect(bucket!.foreign_sell_vol).toBe(300);
    expect(bucket!.foreign_room).toBe(19.8);
    expect(bucket!.holding_ratio).toBe(14.9);
    // Values: LAST tick's nulls must NOT blank the earlier known values.
    expect(bucket!.foreign_buy_value).toBe(40_000_000);
    expect(bucket!.foreign_sell_value).toBe(16_000_000);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Idempotency (AC#4, brief §8 — mirrors price-plane sibling's AC#3)
  // ───────────────────────────────────────────────────────────────────────────
  it("AC#4: re-running against unchanged source ticks produces byte-identical intraday_foreign_flow_5m rows", async () => {
    addTick(db, "VCB", "2026-07-15T02:30:05.000Z", { foreignBuyVol: 1000, foreignSellVol: 400 });
    addTick(db, "VCB", "2026-07-15T02:32:00.000Z", { foreignBuyVol: 1500, foreignSellVol: 600 });
    addTick(db, "FPT", "2026-07-15T02:31:00.000Z", { foreignBuyVol: 300, foreignSellVol: 100 });

    const nowMsFn = () => Date.parse("2026-07-15T02:40:00.000Z");

    const run1 = await runIntradayForeignFlow5mCompactor({ db: () => db, nowMsFn });
    const rowsAfterRun1 = readBuckets(db);

    const run2 = await runIntradayForeignFlow5mCompactor({ db: () => db, nowMsFn });
    const rowsAfterRun2 = readBuckets(db);

    expect(run2).toEqual(run1);
    // byte-identical, including compacted_at — same fixed nowMsFn both runs
    expect(rowsAfterRun2).toEqual(rowsAfterRun1);
    // still exactly 2 rows — no duplicate growth / UNIQUE-constraint error
    expect(rowsAfterRun2).toHaveLength(2);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Gap-tolerance (AC#4)
  // ───────────────────────────────────────────────────────────────────────────
  it("AC#4: gap-tolerant — ticks spanning multiple 5-min buckets with an empty gap between them are all correctly compacted in ONE run", async () => {
    // Bucket 1: 02:00:00-02:05:00
    addTick(db, "VCB", "2026-07-15T02:00:10.000Z", { foreignBuyVol: 100, foreignSellVol: 50 });
    addTick(db, "VCB", "2026-07-15T02:04:00.000Z", { foreignBuyVol: 150, foreignSellVol: 60 });
    // Deliberate gap: 02:05:00-02:20:00 has ZERO ticks — 3 whole buckets skipped, simulating a
    // compactor cron outage / delayed cycle.
    // Bucket in the middle of the resumed span: 02:20:00-02:25:00
    addTick(db, "VCB", "2026-07-15T02:21:00.000Z", { foreignBuyVol: 200, foreignSellVol: 80 });
    // Bucket immediately after: 02:25:00-02:30:00
    addTick(db, "VCB", "2026-07-15T02:27:00.000Z", { foreignBuyVol: 220, foreignSellVol: 90 });
    addTick(db, "VCB", "2026-07-15T02:29:30.000Z", { foreignBuyVol: 250, foreignSellVol: 95 });

    const result = await runIntradayForeignFlow5mCompactor({
      db: () => db,
      nowMsFn: () => Date.parse("2026-07-15T02:30:00.000Z"),
    });

    // ONE single run catches up every populated bucket — no watermark/state needed.
    expect(result.ticksScanned).toBe(5);
    expect(result.bucketsWritten).toBe(3); // only populated buckets get a row — gaps are simply absent, not zero-filled

    const buckets = readBuckets(db);
    expect(buckets).toHaveLength(3);
    expect(buckets.map((b) => b.bucket_ts)).toEqual([
      "2026-07-15T02:00:00.000Z",
      "2026-07-15T02:20:00.000Z",
      "2026-07-15T02:25:00.000Z",
    ]);

    const bucket1 = buckets.find((b) => b.bucket_ts === "2026-07-15T02:00:00.000Z")!;
    expect(bucket1.foreign_buy_vol).toBe(150); // LAST value, not max
    expect(bucket1.tick_count).toBe(2);

    const bucket3 = buckets.find((b) => b.bucket_ts === "2026-07-15T02:20:00.000Z")!;
    expect(bucket3.tick_count).toBe(1);

    const bucket4 = buckets.find((b) => b.bucket_ts === "2026-07-15T02:25:00.000Z")!;
    expect(bucket4.foreign_buy_vol).toBe(250);
    expect(bucket4.tick_count).toBe(2);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. No-market-hours-dependence (AC#5)
  // ───────────────────────────────────────────────────────────────────────────
  it("AC#5: empty foreign_flow_history -> natural no-op, no throw, no market-hours gate", async () => {
    // No ticks seeded at all — simulates a weekend/holiday when the VPS never pushes and the
    // purge itself never fires either. The job must NOT special-case this — it just naturally
    // sees zero rows.
    const result = await runIntradayForeignFlow5mCompactor({
      db: () => db,
      nowMsFn: () => Date.parse("2026-07-19T02:00:00.000Z"), // a Sunday
    });

    expect(result).toEqual({ codesProcessed: 0, bucketsWritten: 0, ticksScanned: 0 });
    expect(readBuckets(db)).toHaveLength(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Forward-preservation e2e regression (AC#8)
  // ───────────────────────────────────────────────────────────────────────────
  it("AC#8: compacted 5m buckets survive the existing rolling-24h purge on foreign_flow_history end-to-end", async () => {
    const NOW_MS = Date.parse("2026-07-15T09:00:00.000Z");

    // A tick that will be >24h old relative to NOW_MS (the purge boundary) — represents
    // yesterday's session tick still sitting in foreign_flow_history.
    const OLD_TICK_AT = "2026-07-14T08:30:00.000Z"; // ~24.5h before NOW_MS
    // A tick that survives the purge (< 24h old relative to NOW_MS).
    const RECENT_TICK_AT = "2026-07-15T08:30:00.000Z";

    addTick(db, "VCB", OLD_TICK_AT, { foreignBuyVol: 1000, foreignSellVol: 400 });
    addTick(db, "VCB", RECENT_TICK_AT, { foreignBuyVol: 1200, foreignSellVol: 500 });

    // Step 1: compact BEFORE the purge — both ticks are still present.
    const compactResult = await runIntradayForeignFlow5mCompactor({
      db: () => db,
      nowMsFn: () => NOW_MS,
    });
    expect(compactResult.ticksScanned).toBe(2);
    expect(compactResult.bucketsWritten).toBe(2);

    const bucketsBeforePurge = readBuckets(db);
    const oldBucket = bucketsBeforePurge.find((b) => b.bucket_ts === "2026-07-14T08:30:00.000Z");
    expect(oldBucket).toBeDefined();
    expect(oldBucket!.foreign_buy_vol).toBe(1000);
    expect(oldBucket!.foreign_net_vol).toBe(600);

    // Step 2: apply the EXISTING rolling-24h purge (pushForeignFlowHandler.ts Step 6b SSOT
    // logic, mirrored here with a fixed nowMs instead of Date.now()).
    purgeOlderThan24h(db, NOW_MS);

    const remainingTicks = db
      .prepare("SELECT fetched_at FROM foreign_flow_history WHERE code = ? ORDER BY fetched_at ASC")
      .all("VCB") as Array<{ fetched_at: string }>;
    // The old (>24h) tick is gone from the source table ...
    expect(remainingTicks.map((r) => r.fetched_at)).not.toContain(OLD_TICK_AT);
    expect(remainingTicks).toHaveLength(1);
    expect(remainingTicks[0]!.fetched_at).toBe(RECENT_TICK_AT);

    // ... but the ARCHIVED 5m bucket for the purged window is untouched — the compactor never
    // deletes intraday_foreign_flow_5m rows, so the forward-preserved bucket still summarizes
    // the now-gone tick correctly.
    const bucketsAfterPurge = readBuckets(db);
    const oldBucketAfterPurge = bucketsAfterPurge.find((b) => b.bucket_ts === "2026-07-14T08:30:00.000Z");
    expect(oldBucketAfterPurge).toEqual(oldBucket);

    // Step 3: a SUBSEQUENT compactor run (e.g. the next 5-min cron tick) must not erase the
    // now-source-less historical bucket either — it only inserts/replaces buckets it currently
    // sees ticks for; buckets whose source ticks have since been purged are left alone (true
    // forward preservation, not merely "not yet deleted").
    const compactResultAfterPurge = await runIntradayForeignFlow5mCompactor({
      db: () => db,
      nowMsFn: () => NOW_MS + 5 * 60 * 1000,
    });
    expect(compactResultAfterPurge.ticksScanned).toBe(1); // only the surviving recent tick
    expect(compactResultAfterPurge.bucketsWritten).toBe(1); // only the recent bucket is (re)written

    const bucketsFinal = readBuckets(db);
    expect(bucketsFinal).toHaveLength(2); // old archived bucket + recent bucket — both present
    const oldBucketFinal = bucketsFinal.find((b) => b.bucket_ts === "2026-07-14T08:30:00.000Z");
    expect(oldBucketFinal).toEqual(oldBucket); // still byte-identical — genuinely untouched
  });
});
