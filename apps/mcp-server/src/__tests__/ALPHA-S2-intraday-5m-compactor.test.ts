// src/__tests__/ALPHA-S2-intraday-5m-compactor.test.ts
// ALPHA-S2-SUB4-TESTS — feature test coverage for runIntraday5mCompactor
// (Sprint FLOW-PRICE-ALPHA-LOOP, epic ALPHA-S2-TICK-DOWNSAMPLE-5MIN, subtask 4/5).
//
// Exercises the DI seam (Intraday5mCompactorDeps: db?, nowMsFn?) against an
// in-memory SQLite DB seeded via initMarketDataTables(). Covers:
//   1. 5-min UTC-aligned bucketing (open/high/low/close/volume/tick_count rules).
//   2. INSERT OR REPLACE idempotency (AC#3).
//   3. Gap-tolerance — ticks spanning multiple 5-min buckets incl. an empty gap
//      are all correctly compacted in ONE run (AC#4).
//   4. No-market-hours-dependence — empty market_prices_history is a natural
//      no-op, no throw (AC#5) — this job has NO market-hours gate by design.
//   5. All-codes scope — every distinct code is compacted, no watchlist filter
//      (brief §6, deliberate deviation from ohlcvDailyAggregatorJob.ts).
//   6. Forward-preservation e2e regression (AC#8) — bars compacted BEFORE the
//      existing rolling-24h purge on market_prices_history (pushPricesHandler.ts)
//      still summarize the purged window correctly afterwards, ties both tables
//      together end-to-end.
//
// Design SSOT: docs/architecture-briefs/2026-07-14-alpha-s2-tick-downsample-5min.md

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { runIntraday5mCompactor } from "../scheduler/market-data/intraday5mCompactorJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Insert one price tick into market_prices_history. All params bound. */
function addTick(
  db: Database,
  code: string,
  price: number,
  fetchedAt: string,
  volume: number,
): void {
  db.prepare(
    "INSERT OR IGNORE INTO market_prices_history (code, price, volume, exchange, fetched_at) VALUES (?, ?, ?, ?, ?)"
  ).run(code, price, volume, "HOSE", fetchedAt);
}

interface Bar5m {
  code: string;
  bucket_ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tick_count: number;
  compacted_at: string;
}

function readBars(db: Database): Bar5m[] {
  return db
    .prepare("SELECT * FROM intraday_ohlcv_5m ORDER BY code ASC, bucket_ts ASC")
    .all() as Bar5m[];
}

/**
 * Mirrors the EXISTING rolling-24h purge inline in pushPricesHandler.ts
 * (lines ~238-243): `DELETE FROM market_prices_history WHERE fetched_at < cutoff`,
 * cutoff = Date.now() - 24h. That handler computes cutoff from the real wall
 * clock (not DI'd) — this helper reproduces the IDENTICAL SQL against a
 * caller-supplied nowMs so the forward-preservation regression test (AC#8) can
 * pin a deterministic purge boundary instead of depending on wall-clock time.
 * Not a reimplementation of new logic — same DELETE statement, same semantics.
 */
function purgeOlderThan24h(db: Database, nowMs: number): void {
  const cutoff = new Date(nowMs - 24 * 3600 * 1000).toISOString();
  db.prepare("DELETE FROM market_prices_history WHERE fetched_at < ?").run(cutoff);
}

describe("ALPHA-S2-SUB4-TESTS — runIntraday5mCompactor", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initMarketDataTables(db);
  });

  afterEach(() => {
    db.close();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. 5-min UTC-aligned bucketing
  // ───────────────────────────────────────────────────────────────────────────
  it("buckets ticks into 5-min UTC-aligned bars: open=first, high=max, low=min, close=last, volume=MAX(cumulative), tick_count=count", async () => {
    // Bucket A: [2026-07-14T02:30:00.000Z, 02:35:00.000Z)
    addTick(db, "VCB", 80000, "2026-07-14T02:30:05.000Z", 1000); // open
    addTick(db, "VCB", 85000, "2026-07-14T02:32:00.000Z", 2000); // high
    addTick(db, "VCB", 77000, "2026-07-14T02:34:55.000Z", 1800); // close + low

    // Bucket B: [2026-07-14T02:35:00.000Z, 02:40:00.000Z) — single tick
    addTick(db, "VCB", 90000, "2026-07-14T02:37:00.000Z", 2200);

    const result = await runIntraday5mCompactor({
      db: () => db,
      nowMsFn: () => Date.parse("2026-07-14T02:40:00.000Z"),
    });

    expect(result).toEqual({ codesProcessed: 1, bucketsWritten: 2, ticksScanned: 4 });

    const bars = readBars(db);
    expect(bars).toHaveLength(2);

    const [barA, barB] = bars;
    expect(barA!.bucket_ts).toBe("2026-07-14T02:30:00.000Z");
    expect(barA!.open).toBe(80000);
    expect(barA!.high).toBe(85000);
    expect(barA!.low).toBe(77000);
    expect(barA!.close).toBe(77000);
    expect(barA!.volume).toBe(2000); // MAX(1000, 2000, 1800)
    expect(barA!.tick_count).toBe(3);
    expect(barA!.compacted_at).toBe("2026-07-14T02:40:00.000Z");

    expect(barB!.bucket_ts).toBe("2026-07-14T02:35:00.000Z");
    expect(barB!.open).toBe(90000);
    expect(barB!.high).toBe(90000);
    expect(barB!.low).toBe(90000);
    expect(barB!.close).toBe(90000);
    expect(barB!.volume).toBe(2200);
    expect(barB!.tick_count).toBe(1);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Idempotency (AC#3)
  // ───────────────────────────────────────────────────────────────────────────
  it("AC#3: re-running against unchanged source ticks produces byte-identical intraday_ohlcv_5m rows", async () => {
    addTick(db, "VCB", 80000, "2026-07-14T02:30:05.000Z", 1000);
    addTick(db, "VCB", 85000, "2026-07-14T02:32:00.000Z", 2000);
    addTick(db, "FPT", 40000, "2026-07-14T02:31:00.000Z", 500);

    const nowMsFn = () => Date.parse("2026-07-14T02:40:00.000Z");

    const run1 = await runIntraday5mCompactor({ db: () => db, nowMsFn });
    const rowsAfterRun1 = readBars(db);

    const run2 = await runIntraday5mCompactor({ db: () => db, nowMsFn });
    const rowsAfterRun2 = readBars(db);

    expect(run2).toEqual(run1);
    // byte-identical, including compacted_at — same fixed nowMsFn both runs
    expect(rowsAfterRun2).toEqual(rowsAfterRun1);
    // still exactly 2 rows — no duplicate growth / UNIQUE-constraint error
    expect(rowsAfterRun2).toHaveLength(2);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Gap-tolerance (AC#4)
  // ───────────────────────────────────────────────────────────────────────────
  it("AC#4: gap-tolerant — ticks spanning multiple 5-min buckets with an empty gap between them are all correctly compacted in ONE run", async () => {
    // Bucket 1: 02:00:00-02:05:00
    addTick(db, "VCB", 100000, "2026-07-14T02:00:10.000Z", 500);
    addTick(db, "VCB", 102000, "2026-07-14T02:04:00.000Z", 600);
    // Deliberate gap: 02:05:00-02:20:00 has ZERO ticks — 3 whole buckets
    // skipped, simulating a compactor cron outage / delayed cycle.
    // Bucket in the middle of the resumed span: 02:20:00-02:25:00
    addTick(db, "VCB", 98000, "2026-07-14T02:21:00.000Z", 700);
    // Bucket immediately after: 02:25:00-02:30:00
    addTick(db, "VCB", 99500, "2026-07-14T02:27:00.000Z", 750);
    addTick(db, "VCB", 101000, "2026-07-14T02:29:30.000Z", 800);

    const result = await runIntraday5mCompactor({
      db: () => db,
      nowMsFn: () => Date.parse("2026-07-14T02:30:00.000Z"),
    });

    // ONE single run catches up every populated bucket — no watermark/state needed.
    expect(result.ticksScanned).toBe(5);
    expect(result.bucketsWritten).toBe(3); // only populated buckets get a row — gaps are simply absent, not zero-filled

    const bars = readBars(db);
    expect(bars).toHaveLength(3);
    expect(bars.map((b) => b.bucket_ts)).toEqual([
      "2026-07-14T02:00:00.000Z",
      "2026-07-14T02:20:00.000Z",
      "2026-07-14T02:25:00.000Z",
    ]);

    const bucket1 = bars.find((b) => b.bucket_ts === "2026-07-14T02:00:00.000Z")!;
    expect(bucket1.open).toBe(100000);
    expect(bucket1.close).toBe(102000);
    expect(bucket1.tick_count).toBe(2);

    const bucket3 = bars.find((b) => b.bucket_ts === "2026-07-14T02:20:00.000Z")!;
    expect(bucket3.tick_count).toBe(1);

    const bucket4 = bars.find((b) => b.bucket_ts === "2026-07-14T02:25:00.000Z")!;
    expect(bucket4.open).toBe(99500);
    expect(bucket4.close).toBe(101000);
    expect(bucket4.tick_count).toBe(2);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. No-market-hours-dependence (AC#5)
  // ───────────────────────────────────────────────────────────────────────────
  it("AC#5: empty market_prices_history -> natural no-op, no throw, no market-hours gate", async () => {
    // No ticks seeded at all — simulates a weekend/holiday when the VPS never
    // pushes and the purge itself never fires either (brief §1.1). The job
    // must NOT call isVnTradingWindowUtc()/isVnMarketHoursUtc() or otherwise
    // special-case this — it just naturally sees zero rows.
    const result = await runIntraday5mCompactor({
      db: () => db,
      nowMsFn: () => Date.parse("2026-07-19T02:00:00.000Z"), // a Sunday
    });

    expect(result).toEqual({ codesProcessed: 0, bucketsWritten: 0, ticksScanned: 0 });
    expect(readBars(db)).toHaveLength(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. All-codes — no watchlist filter (brief §6)
  // ───────────────────────────────────────────────────────────────────────────
  it("compacts EVERY distinct code present in market_prices_history, including codes absent from watchlist", async () => {
    // Only VCB is on the watchlist ...
    db.prepare(
      "INSERT INTO watchlist (code, exchange, added_at) VALUES (?, ?, ?)"
    ).run("VCB", "HOSE", "2026-01-01T00:00:00.000Z");

    // ... but ticks exist for a non-watchlisted stock AND a global index.
    addTick(db, "VCB", 80000, "2026-07-14T02:30:00.000Z", 1000);
    addTick(db, "ACB", 25000, "2026-07-14T02:30:00.000Z", 500); // not on watchlist
    addTick(db, "VNINDEX", 1200, "2026-07-14T02:30:00.000Z", 0); // global index, not a "stock"

    const result = await runIntraday5mCompactor({
      db: () => db,
      nowMsFn: () => Date.parse("2026-07-14T02:35:00.000Z"),
    });

    expect(result.codesProcessed).toBe(3);
    const bars = readBars(db);
    expect(bars.map((b) => b.code).sort()).toEqual(["ACB", "VCB", "VNINDEX"]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Forward-preservation e2e regression (AC#8)
  // ───────────────────────────────────────────────────────────────────────────
  it("AC#8: compacted 5m bars survive the existing rolling-24h purge on market_prices_history end-to-end", async () => {
    const NOW_MS = Date.parse("2026-07-14T09:00:00.000Z");

    // A tick that will be >24h old relative to NOW_MS (the purge boundary) —
    // represents yesterday's session tick still sitting in market_prices_history.
    const OLD_TICK_AT = "2026-07-13T08:30:00.000Z"; // ~24.5h before NOW_MS
    // A tick that survives the purge (< 24h old relative to NOW_MS).
    const RECENT_TICK_AT = "2026-07-14T08:30:00.000Z";

    addTick(db, "VCB", 80000, OLD_TICK_AT, 1000);
    addTick(db, "VCB", 82000, RECENT_TICK_AT, 1500);

    // Step 1: compact BEFORE the purge — both ticks are still present.
    const compactResult = await runIntraday5mCompactor({
      db: () => db,
      nowMsFn: () => NOW_MS,
    });
    expect(compactResult.ticksScanned).toBe(2);
    expect(compactResult.bucketsWritten).toBe(2);

    const barsBeforePurge = readBars(db);
    const oldBucket = barsBeforePurge.find(
      (b) => b.bucket_ts === "2026-07-13T08:30:00.000Z"
    );
    expect(oldBucket).toBeDefined();
    expect(oldBucket!.open).toBe(80000);
    expect(oldBucket!.close).toBe(80000);

    // Step 2: apply the EXISTING rolling-24h purge (pushPricesHandler.ts SSOT
    // logic, mirrored here with a fixed nowMs instead of Date.now()).
    purgeOlderThan24h(db, NOW_MS);

    const remainingTicks = db
      .prepare(
        "SELECT fetched_at FROM market_prices_history WHERE code = ? ORDER BY fetched_at ASC"
      )
      .all("VCB") as Array<{ fetched_at: string }>;
    // The old (>24h) tick is gone from the source table ...
    expect(remainingTicks.map((r) => r.fetched_at)).not.toContain(OLD_TICK_AT);
    expect(remainingTicks).toHaveLength(1);
    expect(remainingTicks[0]!.fetched_at).toBe(RECENT_TICK_AT);

    // ... but the ARCHIVED 5m bar for the purged window is untouched — the
    // compactor never deletes intraday_ohlcv_5m rows, so the forward-preserved
    // bar still summarizes the now-gone tick correctly.
    const barsAfterPurge = readBars(db);
    const oldBucketAfterPurge = barsAfterPurge.find(
      (b) => b.bucket_ts === "2026-07-13T08:30:00.000Z"
    );
    expect(oldBucketAfterPurge).toEqual(oldBucket);

    // Step 3: a SUBSEQUENT compactor run (e.g. the next 5-min cron tick) must
    // not erase the now-source-less historical bar either — it only
    // inserts/replaces buckets it currently sees ticks for; buckets whose
    // source ticks have since been purged are left alone (true forward
    // preservation, not merely "not yet deleted").
    const compactResultAfterPurge = await runIntraday5mCompactor({
      db: () => db,
      nowMsFn: () => NOW_MS + 5 * 60 * 1000,
    });
    expect(compactResultAfterPurge.ticksScanned).toBe(1); // only the surviving recent tick
    expect(compactResultAfterPurge.bucketsWritten).toBe(1); // only the recent bucket is (re)written

    const barsFinal = readBars(db);
    expect(barsFinal).toHaveLength(2); // old archived bar + recent bar — both present
    const oldBucketFinal = barsFinal.find(
      (b) => b.bucket_ts === "2026-07-13T08:30:00.000Z"
    );
    expect(oldBucketFinal).toEqual(oldBucket); // still byte-identical — genuinely untouched
  });
});
