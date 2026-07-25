// scripts/migrations/__tests__/backfill-predclaim-creation-price.test.ts
//
// FIX-PREDCLAIM-BACKFILL-NULL-CREATIONPRICE — unit tests for the
// creation_price backfill migration script's pure functions
// (toTradingDate / findNullCreationPriceCandidates / findSourceBar /
// resolveCandidates / applyBackfill). All DB ops use :memory: — no
// live/named-volume DB touched.

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  toTradingDate,
  findNullCreationPriceCandidates,
  findSourceBar,
  resolveCandidates,
  applyBackfill,
} from "../backfill-predclaim-creation-price.ts";

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_claims (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      stock              TEXT    NOT NULL,
      agent_id           TEXT    NOT NULL,
      claim_text         TEXT    NOT NULL,
      direction          TEXT    NOT NULL,
      target_price       REAL,
      resolution_date    TEXT    NOT NULL,
      confidence         REAL    NOT NULL,
      resolution_outcome INTEGER,
      actual_price       REAL,
      brier_score        REAL,
      created_at         TEXT    NOT NULL,
      resolved_at        TEXT,
      creation_price     REAL,
      is_excluded        INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code   TEXT NOT NULL,
      date   TEXT NOT NULL,
      open   REAL NOT NULL DEFAULT 0,
      high   REAL NOT NULL DEFAULT 0,
      low    REAL NOT NULL DEFAULT 0,
      close  REAL NOT NULL,
      volume REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (code, date)
    );
  `);
  return db;
}

function seedClaim(
  db: Database,
  opts: {
    stock: string;
    created_at: string;
    creation_price?: number | null;
    is_excluded?: number;
    resolution_outcome?: number | null;
  },
): number {
  const result = db
    .prepare(
      `INSERT INTO prediction_claims
         (stock, agent_id, claim_text, direction, resolution_date, confidence,
          created_at, creation_price, is_excluded, resolution_outcome)
       VALUES (?, 'test-agent', 'test claim', 'neutral', '2026-08-01', 0.7, ?, ?, ?, ?)`,
    )
    .run(
      opts.stock,
      opts.created_at,
      opts.creation_price ?? null,
      opts.is_excluded ?? 0,
      opts.resolution_outcome ?? null,
    );
  return Number(result.lastInsertRowid);
}

function seedBar(db: Database, code: string, date: string, close: number): void {
  db.prepare(
    `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, 1000)`,
  ).run(code, date, close, close, close, close);
}

describe("backfill-predclaim-creation-price — toTradingDate", () => {
  it("extracts the YYYY-MM-DD date portion from a datetime('now')-style timestamp", () => {
    expect(toTradingDate("2026-07-24 17:40:18")).toBe("2026-07-24");
  });
});

describe("backfill-predclaim-creation-price — findNullCreationPriceCandidates", () => {
  it("selects a pending row with NULL creation_price", () => {
    const db = makeDb();
    const id = seedClaim(db, { stock: "VIC", created_at: "2026-07-21 17:43:27" });

    const candidates = findNullCreationPriceCandidates(db);

    expect(candidates.length).toBe(1);
    expect(candidates[0]!.id).toBe(id);
    expect(candidates[0]!.stock).toBe("VIC");
  });

  it("excludes a row that already has a non-null creation_price", () => {
    const db = makeDb();
    seedClaim(db, { stock: "VIC", created_at: "2026-07-21 17:43:27", creation_price: 217300 });

    expect(findNullCreationPriceCandidates(db).length).toBe(0);
  });

  it("excludes an already-excluded (is_excluded=1) row — deliverable (b) out of scope for this script's default query", () => {
    const db = makeDb();
    seedClaim(db, { stock: "FPT", created_at: "2026-04-26 10:00:00", is_excluded: 1 });

    expect(findNullCreationPriceCandidates(db).length).toBe(0);
  });

  it("filters to the given ids when provided", () => {
    const db = makeDb();
    const id1 = seedClaim(db, { stock: "VIC", created_at: "2026-07-21 17:43:27" });
    const id2 = seedClaim(db, { stock: "VNM", created_at: "2026-07-24 17:40:18" });

    const candidates = findNullCreationPriceCandidates(db, [id1]);

    expect(candidates.length).toBe(1);
    expect(candidates[0]!.id).toBe(id1);
    expect(candidates.map((c) => c.id)).not.toContain(id2);
  });
});

describe("backfill-predclaim-creation-price — findSourceBar", () => {
  it("finds the exact-date daily_ohlcv close for a ticker", () => {
    const db = makeDb();
    seedBar(db, "VIC", "2026-07-21", 217300);

    const bar = findSourceBar(db, "VIC", "2026-07-21");

    expect(bar).not.toBeNull();
    expect(bar!.close).toBe(217300);
    expect(bar!.date).toBe("2026-07-21");
  });

  it("NEGATIVE CONTROL — returns null (no bar), never interpolates, when no exact-date row exists", () => {
    const db = makeDb();
    // A bar exists the day before and after, but NOT on the exact requested date.
    seedBar(db, "VIC", "2026-07-20", 220000);
    seedBar(db, "VIC", "2026-07-22", 202100);

    const bar = findSourceBar(db, "VIC", "2026-07-21");

    expect(bar).toBeNull();
  });

  it("excludes ALLZERO stub rows (close=0) — same guard as get_price_history", () => {
    const db = makeDb();
    seedBar(db, "VIC", "2026-07-21", 0);

    expect(findSourceBar(db, "VIC", "2026-07-21")).toBeNull();
  });
});

describe("backfill-predclaim-creation-price — resolveCandidates", () => {
  it("maps a candidate with a real bar to disposition 'backfilled' carrying the source bar", () => {
    const db = makeDb();
    seedBar(db, "VIC", "2026-07-21", 217300);
    const id = seedClaim(db, { stock: "VIC", created_at: "2026-07-21 17:43:27" });

    const results = resolveCandidates(db, findNullCreationPriceCandidates(db));

    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe(id);
    expect(results[0]!.disposition).toBe("backfilled");
    expect(results[0]!.sourceBar).toEqual({ code: "VIC", date: "2026-07-21", close: 217300 });
  });

  it("NEGATIVE CONTROL — maps a candidate with no bar to disposition 'no_bar', sourceBar null (never fabricated)", () => {
    const db = makeDb();
    // No daily_ohlcv row at all for this ticker/date.
    const id = seedClaim(db, { stock: "ZZZ", created_at: "2026-07-21 17:43:27" });

    const results = resolveCandidates(db, findNullCreationPriceCandidates(db));

    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe(id);
    expect(results[0]!.disposition).toBe("no_bar");
    expect(results[0]!.sourceBar).toBeNull();
  });
});

describe("backfill-predclaim-creation-price — applyBackfill", () => {
  it("writes creation_price only for 'backfilled' dispositions and returns the change count", () => {
    const db = makeDb();
    seedBar(db, "VIC", "2026-07-21", 217300);
    const backfillId = seedClaim(db, { stock: "VIC", created_at: "2026-07-21 17:43:27" });
    const noBarId = seedClaim(db, { stock: "ZZZ", created_at: "2026-07-21 17:43:27" });

    const results = resolveCandidates(db, findNullCreationPriceCandidates(db));
    const changed = applyBackfill(db, results);

    expect(changed).toBe(1);

    const backfilledRow = db
      .query<{ creation_price: number | null }, [number]>(
        "SELECT creation_price FROM prediction_claims WHERE id = ?",
      )
      .get(backfillId);
    expect(backfilledRow?.creation_price).toBe(217300);

    const noBarRow = db
      .query<{ creation_price: number | null }, [number]>(
        "SELECT creation_price FROM prediction_claims WHERE id = ?",
      )
      .get(noBarId);
    expect(noBarRow?.creation_price).toBeNull();
  });

  it("is idempotent — a second apply on the same results finds nothing left to change (WHERE creation_price IS NULL guard)", () => {
    const db = makeDb();
    seedBar(db, "VIC", "2026-07-21", 217300);
    seedClaim(db, { stock: "VIC", created_at: "2026-07-21 17:43:27" });

    const results = resolveCandidates(db, findNullCreationPriceCandidates(db));
    expect(applyBackfill(db, results)).toBe(1);
    expect(applyBackfill(db, results)).toBe(0); // creation_price no longer NULL — guard excludes it
  });

  it("returns 0 for an empty results list without touching the DB", () => {
    const db = makeDb();
    expect(applyBackfill(db, [])).toBe(0);
  });
});

describe("backfill-predclaim-creation-price — end-to-end cross-check against real 2026-07-25 live values", () => {
  it("reproduces the exact 5 pending-id source bars observed on the live DB (regression pin)", () => {
    const db = makeDb();
    seedBar(db, "VIC", "2026-07-21", 217300);
    seedBar(db, "VIC", "2026-07-22", 202100);
    seedBar(db, "VIC", "2026-07-23", 214000);
    seedBar(db, "VIC", "2026-07-24", 213100);
    seedBar(db, "VNM", "2026-07-24", 58900);

    seedClaim(db, { stock: "VIC", created_at: "2026-07-21 17:43:27" }); // id 13
    seedClaim(db, { stock: "VIC", created_at: "2026-07-22 17:40:14" }); // id 14
    seedClaim(db, { stock: "VIC", created_at: "2026-07-23 17:35:58" }); // id 15
    seedClaim(db, { stock: "VIC", created_at: "2026-07-24 17:40:14" }); // id 16
    seedClaim(db, { stock: "VNM", created_at: "2026-07-24 17:40:18" }); // id 17

    const results = resolveCandidates(db, findNullCreationPriceCandidates(db));

    expect(results.every((r) => r.disposition === "backfilled")).toBe(true);
    expect(results.map((r) => r.sourceBar?.close)).toEqual([217300, 202100, 214000, 213100, 58900]);

    const changed = applyBackfill(db, results);
    expect(changed).toBe(5);
  });
});
