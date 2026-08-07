// scripts/migrations/__tests__/backfill-foreign-flow-gap-2026-08-06.test.ts
//
// FIX-FOREIGN-FLOW-MISSING-TRADING-DAY-2026-08-06-NO-BACKFILL — AC-2 unit
// tests for the gap-day status reporter + live-upstream-probe pure
// functions. All DB ops use :memory: and the upstream probe is fully
// dependency-injected — no live network call, no live/named-volume DB
// touched by this suite.

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  checkGapDayStatus,
  probeUpstreamHistoricalCapability,
  TARGET_GAP_DATE,
  TARGET_TAIL_DATE,
  TAIL_CUTOFF_ISO,
} from "../backfill-foreign-flow-gap-2026-08-06.ts";

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_foreign_flow (
      code               TEXT NOT NULL,
      date               TEXT NOT NULL,
      foreign_buy_vol    REAL,
      foreign_sell_vol   REAL,
      foreign_net_vol    REAL,
      put_through_vol    REAL,
      updated_at         TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (code, date)
    );
  `);
  return db;
}

function seedRow(db: Database, code: string, date: string, updatedAt: string) {
  db.exec(
    `INSERT OR REPLACE INTO daily_foreign_flow (code, date, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol, updated_at)
     VALUES ('${code}', '${date}', 1000, 800, 200, 0, '${updatedAt}')`,
  );
}

describe("FIX-FOREIGN-FLOW-MISSING-TRADING-DAY-2026-08-06-NO-BACKFILL — checkGapDayStatus", () => {
  it("reports a zero-row day as isZeroRowGap=true (never fabricates a row to check)", () => {
    const db = makeDb();
    const status = checkGapDayStatus(db, TARGET_GAP_DATE);
    expect(status.rowCount).toBe(0);
    expect(status.isZeroRowGap).toBe(true);
    expect(status.maxUpdatedAt).toBeNull();
  });

  it("reports a present day as isZeroRowGap=false", () => {
    const db = makeDb();
    seedRow(db, "FPT", TARGET_GAP_DATE, "2026-08-06T08:59:00.000Z");
    const status = checkGapDayStatus(db, TARGET_GAP_DATE);
    expect(status.rowCount).toBe(1);
    expect(status.isZeroRowGap).toBe(false);
  });

  it("detects the truncated-tail pattern: last write well before the ~09:00Z session close", () => {
    const db = makeDb();
    seedRow(db, "FPT", TARGET_TAIL_DATE, TAIL_CUTOFF_ISO);
    const status = checkGapDayStatus(db, TARGET_TAIL_DATE, TAIL_CUTOFF_ISO);
    expect(status.isTruncatedTail).toBe(true);
  });

  it("does NOT flag a truncated tail when the session actually closed normally (~09:00Z)", () => {
    const db = makeDb();
    seedRow(db, "FPT", TARGET_TAIL_DATE, "2026-08-05T08:59:40.192Z");
    const status = checkGapDayStatus(db, TARGET_TAIL_DATE, TAIL_CUTOFF_ISO);
    expect(status.isTruncatedTail).toBe(false);
  });
});

describe("FIX-FOREIGN-FLOW-MISSING-TRADING-DAY-2026-08-06-NO-BACKFILL — probeUpstreamHistoricalCapability", () => {
  it("verdict=UNRECOVERABLE on a reachable current-tick-only response (matches the real bgapidatafeed shape)", async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify([
          { sym: "FPT", lastPrice: 71, lastVolume: 10, g1: "70.9|2220|i", changePc: "0.42" },
        ]),
        { status: 200 },
      )) as unknown as typeof fetch;

    const result = await probeUpstreamHistoricalCapability(fakeFetch, "FPT");
    expect(result.reachable).toBe(true);
    expect(result.verdict).toBe("UNRECOVERABLE");
    expect(result.hasDateOrRangeParam).toBe(false);
    expect(result.sampleKeys).toContain("sym");
  });

  it("verdict=PROBE_FAILED on a non-OK HTTP response — never guesses when ambiguous", async () => {
    const fakeFetch = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    const result = await probeUpstreamHistoricalCapability(fakeFetch, "FPT");
    expect(result.reachable).toBe(false);
    expect(result.verdict).toBe("PROBE_FAILED");
  });

  it("verdict=PROBE_FAILED on a network error", async () => {
    const fakeFetch = (async () => {
      throw new Error("network unreachable");
    }) as unknown as typeof fetch;
    const result = await probeUpstreamHistoricalCapability(fakeFetch, "FPT");
    expect(result.verdict).toBe("PROBE_FAILED");
  });

  it("would report hasDateOrRangeParam=true IF the upstream ever added a date-scoped field (never observed live)", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify([{ sym: "FPT", tradeDate: "2026-08-06", lastPrice: 71 }]), { status: 200 })) as unknown as typeof fetch;
    const result = await probeUpstreamHistoricalCapability(fakeFetch, "FPT");
    expect(result.hasDateOrRangeParam).toBe(true);
    // NOTE: hasDateOrRangeParam is transparency-only (see file header) — the
    // verdict stays UNRECOVERABLE either way because the URL shape itself
    // takes no date/range argument; a future script revision would need to
    // actually exercise a date-scoped request before ever flipping this.
    expect(result.verdict).toBe("UNRECOVERABLE");
  });
});
