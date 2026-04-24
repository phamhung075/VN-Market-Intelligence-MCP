/**
 * Task 1310a — RED: Duplicate code rows in VPS batch → UNIQUE constraint crash
 *
 * Bug: VPS vn-foreign-flow service occasionally sends the same ticker code twice
 * in a single payload (e.g. [{code:"VNM",...}, {code:"VNM",...}]).
 * When the legacy path (no date column, UNIQUE(code)) is hit the second INSERT
 * throws "UNIQUE constraint failed: vnstock_trading_stats.code".
 * Even on the primary path (UNIQUE(code, date)), the same-date duplicate pair
 * within one transaction should be silently deduplicated to the last value.
 *
 * Fix location: upsertForeignFlow() in vnstockStore.ts — deduplicate items by
 * (code, date) key before entering the transaction, keeping the LAST occurrence.
 *
 * Acceptance criteria:
 *   AC-1: Primary path — batch with duplicate (code, date) does not throw, returns
 *         deduplicated upserted count, DB has exactly 1 row per unique (code, date).
 *   AC-2: Legacy path — batch with duplicate code (no date col) does not throw,
 *         DB has exactly 1 row per unique code with last-write value.
 *   AC-3: Server HTTP endpoint — POST /api/push-foreign-flow with duplicate codes
 *         returns 200 { ok: true, upserted: N } where N = unique code count.
 *   AC-4: Mixed batch — 5 items, 2 duplicates → 3 unique rows inserted.
 *   AC-5: Dedup preserves last-occurrence value (most recent data in batch).
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { upsertForeignFlow } from "../infrastructure/db/vnstockStore.js";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { createBunServer } from "../interface/mcp/server.js";
import type { ForeignFlowUpsertItem } from "../domain/models/shared-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb(withDateAndUniqueCodeDate = true, legacyUniqueCodeOnly = false): Database {
  const db = new Database(":memory:");
  if (withDateAndUniqueCodeDate) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        date TEXT NOT NULL DEFAULT '1970-01-01',
        foreign_room INTEGER,
        foreign_volume INTEGER,
        current_holding_ratio REAL,
        max_holding_ratio REAL,
        avg_volume_2w INTEGER,
        high_52w REAL,
        low_52w REAL,
        pct_from_high_52w REAL,
        pct_from_low_52w REAL,
        fetched_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(code, date)
      )
    `);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_vnstats_code_date ON vnstock_trading_stats(code, date)`);
  } else if (legacyUniqueCodeOnly) {
    // Legacy schema: date col exists but ONLY UNIQUE(code) — reproduces production crash
    db.exec(`
      CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        foreign_room INTEGER,
        foreign_volume INTEGER,
        current_holding_ratio REAL,
        fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }
  return db;
}

function getRowCount(db: Database): number {
  return db.prepare<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM vnstock_trading_stats").get()?.cnt ?? 0;
}

function getRow(db: Database, code: string, date?: string): Record<string, unknown> | null {
  if (date) {
    return db.prepare("SELECT * FROM vnstock_trading_stats WHERE code = ? AND date = ?").get(code, date) as Record<string, unknown> | null;
  }
  return db.prepare("SELECT * FROM vnstock_trading_stats WHERE code = ? ORDER BY rowid DESC LIMIT 1").get(code) as Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// AC-1: Primary path — duplicate (code, date) in same batch
// ---------------------------------------------------------------------------

describe("Task 1310a — AC-1: Primary path dedup (UNIQUE code+date)", () => {
  let db: Database;
  beforeEach(() => { db = makeDb(true); });
  afterEach(() => { db.close(); });

  it("batch with duplicate (code,date) does not throw", () => {
    const items: ForeignFlowUpsertItem[] = [
      { code: "VNM", date: "2026-04-24", foreign_volume: 100000, foreign_room: 500000, holding_ratio: 0.45, fetched_at: null },
      { code: "BID", date: "2026-04-24", foreign_volume: 200000, foreign_room: 600000, holding_ratio: 0.50, fetched_at: null },
      { code: "VNM", date: "2026-04-24", foreign_volume: 120000, foreign_room: 550000, holding_ratio: 0.48, fetched_at: null }, // dup
    ];
    expect(() => upsertForeignFlow(items, db)).not.toThrow();
  });

  it("duplicate (code,date) → exactly 1 row in DB per unique pair", () => {
    const items: ForeignFlowUpsertItem[] = [
      { code: "VNM", date: "2026-04-24", foreign_volume: 100000, foreign_room: 500000, holding_ratio: 0.45, fetched_at: null },
      { code: "VNM", date: "2026-04-24", foreign_volume: 120000, foreign_room: 550000, holding_ratio: 0.48, fetched_at: null }, // dup
    ];
    upsertForeignFlow(items, db);
    expect(getRowCount(db)).toBe(1); // exactly 1 row
  });

  it("returns upserted count = number of unique (code,date) pairs", () => {
    const items: ForeignFlowUpsertItem[] = [
      { code: "VNM", date: "2026-04-24", foreign_volume: 100000, foreign_room: 500000, holding_ratio: 0.45, fetched_at: null },
      { code: "BID", date: "2026-04-24", foreign_volume: 200000, foreign_room: 600000, holding_ratio: 0.50, fetched_at: null },
      { code: "VNM", date: "2026-04-24", foreign_volume: 120000, foreign_room: 550000, holding_ratio: 0.48, fetched_at: null }, // dup
    ];
    const count = upsertForeignFlow(items, db);
    expect(count).toBe(2); // 2 unique pairs: VNM+BID
  });
});

// ---------------------------------------------------------------------------
// AC-2: Legacy path — duplicate code (no date col, UNIQUE code only)
// ---------------------------------------------------------------------------

describe("Task 1310a — AC-2: Legacy path dedup (UNIQUE code only)", () => {
  let db: Database;
  beforeEach(() => { db = makeDb(false, true); });
  afterEach(() => { db.close(); });

  it("batch with duplicate code does not throw on legacy schema", () => {
    const items: ForeignFlowUpsertItem[] = [
      { code: "VNM", date: "2026-04-24", foreign_volume: 100000, foreign_room: 500000, holding_ratio: 0.45, fetched_at: null },
      { code: "VNM", date: "2026-04-24", foreign_volume: 120000, foreign_room: 550000, holding_ratio: 0.48, fetched_at: null }, // dup
    ];
    expect(() => upsertForeignFlow(items, db)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AC-4: Mixed batch — 5 items, 2 duplicates → 3 unique rows
// ---------------------------------------------------------------------------

describe("Task 1310a — AC-4: Mixed batch dedup", () => {
  let db: Database;
  beforeEach(() => { db = makeDb(true); });
  afterEach(() => { db.close(); });

  it("5 items with 2 duplicates → 3 unique rows", () => {
    const items: ForeignFlowUpsertItem[] = [
      { code: "VNM", date: "2026-04-24", foreign_volume: 100000, foreign_room: 500000, holding_ratio: 0.45, fetched_at: null },
      { code: "BID", date: "2026-04-24", foreign_volume: 200000, foreign_room: 600000, holding_ratio: 0.50, fetched_at: null },
      { code: "TCB", date: "2026-04-24", foreign_volume: 300000, foreign_room: 700000, holding_ratio: 0.55, fetched_at: null },
      { code: "VNM", date: "2026-04-24", foreign_volume: 120000, foreign_room: 550000, holding_ratio: 0.48, fetched_at: null }, // dup VNM
      { code: "BID", date: "2026-04-24", foreign_volume: 210000, foreign_room: 610000, holding_ratio: 0.51, fetched_at: null }, // dup BID
    ];
    upsertForeignFlow(items, db);
    expect(getRowCount(db)).toBe(3);
  });

  it("upserted count equals unique (code,date) count", () => {
    const items: ForeignFlowUpsertItem[] = [
      { code: "VNM", date: "2026-04-24", foreign_volume: 100000, foreign_room: 500000, holding_ratio: 0.45, fetched_at: null },
      { code: "BID", date: "2026-04-24", foreign_volume: 200000, foreign_room: 600000, holding_ratio: 0.50, fetched_at: null },
      { code: "TCB", date: "2026-04-24", foreign_volume: 300000, foreign_room: 700000, holding_ratio: 0.55, fetched_at: null },
      { code: "VNM", date: "2026-04-24", foreign_volume: 120000, foreign_room: 550000, holding_ratio: 0.48, fetched_at: null }, // dup
      { code: "BID", date: "2026-04-24", foreign_volume: 210000, foreign_room: 610000, holding_ratio: 0.51, fetched_at: null }, // dup
    ];
    const count = upsertForeignFlow(items, db);
    expect(count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// AC-5: Dedup preserves last-occurrence value
// ---------------------------------------------------------------------------

describe("Task 1310a — AC-5: Last-write wins on dedup", () => {
  let db: Database;
  beforeEach(() => { db = makeDb(true); });
  afterEach(() => { db.close(); });

  it("last duplicate value wins for foreign_volume", () => {
    const items: ForeignFlowUpsertItem[] = [
      { code: "VNM", date: "2026-04-24", foreign_volume: 100000, foreign_room: 500000, holding_ratio: 0.45, fetched_at: null }, // first
      { code: "VNM", date: "2026-04-24", foreign_volume: 999999, foreign_room: 600000, holding_ratio: 0.50, fetched_at: null }, // last — wins
    ];
    upsertForeignFlow(items, db);
    const row = getRow(db, "VNM", "2026-04-24");
    expect(row?.foreign_volume).toBe(999999);
    expect(row?.foreign_room).toBe(600000);
  });
});

// ---------------------------------------------------------------------------
// AC-3: HTTP endpoint — duplicate codes in batch → 200, correct upserted count
// ---------------------------------------------------------------------------

const VALID_KEY = "test-vps-key-1310a";

describe("Task 1310a — AC-3: HTTP endpoint dedup", () => {
  type BunServerInstance = Awaited<ReturnType<typeof createBunServer>>;
  let server: BunServerInstance;
  let base: string;

  beforeAll(async () => {
    Bun.env["DB_PATH"] = ":memory:";
    process.env["VPS_PUSH_API_KEY"] = VALID_KEY;
    closeDb();
    await initDatabase();
    server = await createBunServer({ port: 0 });
    base = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await server.close();
    closeDb();
    delete Bun.env["DB_PATH"];
    delete process.env["VPS_PUSH_API_KEY"];
  });

  beforeEach(() => {
    try {
      getDb().exec("DELETE FROM vnstock_trading_stats");
    } catch { /* ignore */ }
  });

  it("POST with duplicate codes returns 200 ok:true", async () => {
    const batch = [
      { code: "VNM", foreignBuyVol: 300000, foreignSellVol: 100000, foreignRoom: 5000000 },
      { code: "BID", foreignBuyVol: 100000, foreignSellVol:  50000, foreignRoom: 2000000 },
      { code: "VNM", foreignBuyVol: 350000, foreignSellVol: 120000, foreignRoom: 5100000 }, // dup VNM
    ];
    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
      body: JSON.stringify(batch),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; upserted: number };
    expect(body.ok).toBe(true);
  });

  it("POST with 3 items (1 dup) → DB has 2 unique rows", async () => {
    const batch = [
      { code: "SSI", foreignBuyVol: 300000, foreignSellVol: 100000, foreignRoom: 5000000 },
      { code: "VCI", foreignBuyVol:  50000, foreignSellVol:  20000, foreignRoom: 2000000 },
      { code: "SSI", foreignBuyVol: 350000, foreignSellVol: 110000, foreignRoom: 5100000 }, // dup
    ];
    await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
      body: JSON.stringify(batch),
    });
    const db = getDb();
    const { cnt } = db.prepare<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM vnstock_trading_stats"
    ).get()!;
    expect(cnt).toBe(2); // SSI + VCI, no duplicates
  });
});
