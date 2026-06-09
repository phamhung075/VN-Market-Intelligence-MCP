/**
 * Task 1403 — Two bug fixes
 *
 * Bug 1: CB OPEN→HALF_OPEN→OPEN cycle every 5 min
 *   Root cause: vnstock_trading_stats has UNIQUE(code) in DDL (autoindex) AND
 *   uq_vnstats_code_date explicit index. upsertForeignFlow uses
 *   ON CONFLICT(code, date) which does NOT cover the UNIQUE(code) autoindex.
 *   When VPS pushes a ticker that already exists (any date), the UNIQUE(code)
 *   fires → "UNIQUE constraint failed: vnstock_trading_stats.code" → CB trips.
 *   Fix: runVnstockMigrations must rebuild the table with ONLY UNIQUE(code, date).
 *
 * Bug 2: vps_service_health idle CHECK constraint not migrated
 *   Root cause: schema-system.ts migration guard uses db.exec(BEGIN/INSERT/ROLLBACK)
 *   — Bun's exec() silently swallows the inner CHECK error, so the guard never
 *   detects the old schema and the DROP+RECREATE never runs.
 *   Fix: detect old schema via sqlite_master DDL string check for 'idle' presence.
 *
 * Tests:
 *   B1-1 (RED before fix): upsertForeignFlow on table with UNIQUE(code) in DDL
 *         + uq_vnstats_code_date explicit index throws on second push of same code
 *         with different date entries — ON CONFLICT(code,date) cannot resolve UNIQUE(code).
 *   B1-2: After runVnstockMigrations rebuilds table, same push does NOT throw.
 *   B1-3: upsertForeignFlow with two items sharing code but different dates
 *         stores both rows (daily history preserved).
 *   B2-1 (RED before fix): exec-based migration guard does NOT detect old schema
 *         (documents the broken behaviour being replaced).
 *   B2-2: sqlite_master DDL check correctly detects absence of 'idle' in old schema.
 *   B2-3: After initSystemTables on old-schema DB, idle insert succeeds.
 *   B2-4: Migration preserves existing rows.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { upsertForeignFlow, runVnstockMigrations } from "../infrastructure/db/vnstockStore.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a DB that replicates the broken live state:
 *   - vnstock_trading_stats with UNIQUE(code) in DDL (autoindex)
 *   - uq_vnstats_code_date explicit index also present (migration ran partially)
 *   - date column present (ALTER TABLE was done)
 */
function buildBrokenVnstatsDb(): Database {
  const db = new Database(":memory:");
  // Replicate the live broken DDL: UNIQUE(code) in DDL body
  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT NOT NULL,
      foreign_room INTEGER,
      foreign_volume INTEGER,
      current_holding_ratio REAL,
      fetched_at   TEXT NOT NULL DEFAULT (datetime('now')),
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      date         TEXT NOT NULL DEFAULT '1970-01-01',
      UNIQUE(code)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_vnstats_code_date
      ON vnstock_trading_stats(code, date);
  `);
  return db;
}

/**
 * Build a DB with ONLY UNIQUE(code, date) — the target post-fix state.
 */
function buildFixedVnstatsDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT NOT NULL,
      foreign_room INTEGER,
      foreign_volume INTEGER,
      current_holding_ratio REAL,
      fetched_at   TEXT NOT NULL DEFAULT (datetime('now')),
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      date         TEXT NOT NULL DEFAULT '1970-01-01',
      UNIQUE(code, date)
    );
  `);
  return db;
}

/**
 * Build a DB simulating the old vps_service_health schema (no 'idle' in CHECK).
 */
function buildOldHealthDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE vps_service_health (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name        TEXT NOT NULL CHECK(
        service_name IN ('vn-price-fetch','vn-bctc-fetch','vn-news-fetch','vn-sbv-fetch','vn-foreign-flow')
      ),
      polled_at           TEXT NOT NULL DEFAULT (datetime('now')),
      health_status       TEXT NOT NULL CHECK(
        health_status IN ('healthy','unhealthy','unreachable')
      ),
      response_time_ms    INTEGER,
      last_successful_run TEXT,
      uptime_seconds      INTEGER,
      error_message       TEXT
    );
  `);
  return db;
}

const SAMPLE_ITEM_TODAY = {
  code: "FPT",
  date: "2026-04-28",
  foreign_volume: 1_000_000,
  foreign_room: 50_000_000,
  holding_ratio: 0.45,
  fetched_at: "2026-04-28T08:00:00Z",
};

const SAMPLE_ITEM_YESTERDAY = {
  code: "FPT",
  date: "2026-04-27",
  foreign_volume: 900_000,
  foreign_room: 50_000_000,
  holding_ratio: 0.44,
  fetched_at: "2026-04-27T08:00:00Z",
};

// ─────────────────────────────────────────────────────────────────────────────
// Bug 1 tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1403 Bug 1 — UNIQUE(code) autoindex vs ON CONFLICT(code,date)", () => {

  it("B1-1: broken table (UNIQUE code + UNIQUE code,date) — second push of same code throws", () => {
    // This documents the live failure: UNIQUE(code) autoindex fires before
    // ON CONFLICT(code,date) can handle it.
    const db = buildBrokenVnstatsDb();

    // Insert a row with the default date (matches live VPS push that sets date)
    db.exec(`
      INSERT INTO vnstock_trading_stats (code, date, foreign_volume, foreign_room, current_holding_ratio)
      VALUES ('FPT', '1970-01-01', 0, 0, 0)
    `);

    // Now push a new item with today's date — ON CONFLICT(code,date) should upsert
    // but UNIQUE(code) fires first and throws
    expect(() => upsertForeignFlow([SAMPLE_ITEM_TODAY], db)).toThrow(
      /UNIQUE constraint failed: vnstock_trading_stats\.code/
    );
  });

  it("B1-2: after migration removes UNIQUE(code), same scenario does NOT throw", () => {
    const db = buildBrokenVnstatsDb();

    // Pre-seed an existing row (simulates old data with default date)
    db.exec(`
      INSERT INTO vnstock_trading_stats (code, date, foreign_volume, foreign_room, current_holding_ratio)
      VALUES ('FPT', '1970-01-01', 0, 0, 0)
    `);

    // Migration should rebuild table with only UNIQUE(code, date)
    // We call a direct migration helper (to be implemented in runVnstockMigrations)
    runVnstockMigrations(db);

    // Now the push must NOT throw
    expect(() => upsertForeignFlow([SAMPLE_ITEM_TODAY], db)).not.toThrow();
  });

  it("B1-3: after fix, two items same code different dates both stored", () => {
    const db = buildFixedVnstatsDb();

    expect(() => upsertForeignFlow([SAMPLE_ITEM_TODAY, SAMPLE_ITEM_YESTERDAY], db)).not.toThrow();

    const rows = db
      .query<{ date: string }, []>("SELECT date FROM vnstock_trading_stats WHERE code='FPT' ORDER BY date")
      .all();
    expect(rows.length).toBe(2);
    expect(rows[0]!.date).toBe("2026-04-27");
    expect(rows[1]!.date).toBe("2026-04-28");
  });

  it("B1-4: after fix, repeated push of same code+date updates in place (no duplicate)", () => {
    const db = buildFixedVnstatsDb();

    upsertForeignFlow([SAMPLE_ITEM_TODAY], db);

    const updated = { ...SAMPLE_ITEM_TODAY, foreign_volume: 2_000_000 };
    expect(() => upsertForeignFlow([updated], db)).not.toThrow();

    const rows = db
      .query<{ foreign_volume: number }, []>(
        "SELECT foreign_volume FROM vnstock_trading_stats WHERE code='FPT' AND date='2026-04-28'"
      )
      .all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.foreign_volume).toBe(2_000_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 2 tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1403 Bug 2 — vps_service_health idle CHECK migration", () => {

  it("B2-1: exec(BEGIN/INSERT/ROLLBACK) does NOT throw on old schema — documents broken guard", () => {
    // This documents why the old guard never ran.
    // Bun's db.exec() swallows the inner CHECK constraint error from the INSERT.
    const db = buildOldHealthDb();

    let threw = false;
    try {
      db.exec(`
        BEGIN;
        INSERT INTO vps_service_health
          (service_name, polled_at, health_status, response_time_ms)
          VALUES ('vn-price-fetch', datetime('now'), 'idle', 0);
        ROLLBACK;
      `);
    } catch {
      threw = true;
    }
    // The exec does NOT throw — guard was always false → migration never ran
    expect(threw).toBe(false);
    // And the ROLLBACK means no row was inserted
    const n = db.query<{ n: number }, []>(
      "SELECT COUNT(*) as n FROM vps_service_health WHERE health_status='idle'"
    ).get()!;
    expect(n.n).toBe(0);
  });

  it("B2-2: sqlite_master DDL string check correctly detects absence of 'idle'", () => {
    const db = buildOldHealthDb();

    const row = db
      .query<{ sql: string }, []>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='vps_service_health'"
      )
      .get();

    expect(row).not.toBeNull();
    // Old schema does NOT contain 'idle' in the health_status CHECK
    expect(row!.sql).not.toContain("'idle'");
  });

  it("B2-3: initSystemTables on old-schema DB — idle insert succeeds after migration", () => {
    const db = buildOldHealthDb();

    // Seed an existing row to verify it survives migration
    db.exec(`
      INSERT INTO vps_service_health (service_name, polled_at, health_status, response_time_ms)
      VALUES ('vn-news-fetch', datetime('now'), 'healthy', 10)
    `);

    // Run migration
    initSystemTables(db);

    // Now idle must be accepted
    expect(() => {
      db.exec(`
        INSERT INTO vps_service_health (service_name, polled_at, health_status, response_time_ms)
        VALUES ('vn-price-fetch', datetime('now'), 'idle', 0)
      `);
    }).not.toThrow();

    const idleRow = db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) as n FROM vps_service_health WHERE health_status='idle'"
      )
      .get()!;
    expect(idleRow.n).toBe(1);
  });

  it("B2-4: initSystemTables migration preserves existing healthy/unhealthy rows", () => {
    const db = buildOldHealthDb();

    db.exec(`
      INSERT INTO vps_service_health (service_name, polled_at, health_status, response_time_ms)
      VALUES ('vn-news-fetch',    datetime('now'), 'healthy',   10),
             ('vn-sbv-fetch',     datetime('now'), 'unhealthy', 20),
             ('vn-bctc-fetch',    datetime('now'), 'unreachable', 0)
    `);

    initSystemTables(db);

    const rows = db
      .query<{ service_name: string; health_status: string }, []>(
        "SELECT service_name, health_status FROM vps_service_health ORDER BY service_name"
      )
      .all();

    expect(rows.length).toBe(3);
    expect(rows.find(r => r.service_name === "vn-news-fetch")?.health_status).toBe("healthy");
    expect(rows.find(r => r.service_name === "vn-sbv-fetch")?.health_status).toBe("unhealthy");
    expect(rows.find(r => r.service_name === "vn-bctc-fetch")?.health_status).toBe("unreachable");
  });

  it("B2-5: initSystemTables on already-migrated DB (idle in CHECK) — no-op, idle still works", () => {
    // Calling initSystemTables twice on an already-correct DB must be idempotent
    const db = new Database(":memory:");
    initSystemTables(db);       // first call — creates table with 'idle'
    initSystemTables(db);       // second call — must not fail

    expect(() => {
      db.exec(`
        INSERT INTO vps_service_health (service_name, polled_at, health_status, response_time_ms)
        VALUES ('vn-foreign-flow', datetime('now'), 'idle', 0)
      `);
    }).not.toThrow();
  });
});
