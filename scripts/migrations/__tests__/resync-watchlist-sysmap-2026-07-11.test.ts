// scripts/migrations/__tests__/resync-watchlist-sysmap-2026-07-11.test.ts
//
// WATCHLIST-DB-SYSMAP-DRIFT-FIX — unit tests for the one-time watchlist
// resync migration script's pure functions (mapSectorToDomain /
// deriveSsotWatchlist / computeWatchlistDiff / deleteOrphanedWatchlistRows /
// upsertSsotWatchlistRows). All DB ops use :memory: — no live/named-volume
// DB touched.

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  mapSectorToDomain,
  deriveSsotWatchlist,
  computeWatchlistDiff,
  deleteOrphanedWatchlistRows,
  upsertSsotWatchlistRows,
  type SystemMapWatchlistEntry,
} from "../resync-watchlist-sysmap-2026-07-11.ts";

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code              TEXT PRIMARY KEY,
      company_name      TEXT,
      exchange          TEXT NOT NULL,
      domain            TEXT NOT NULL DEFAULT 'other',
      notes             TEXT,
      added_at          TEXT NOT NULL,
      alert_drop_pct    REAL NOT NULL DEFAULT -3,
      alert_rise_pct    REAL NOT NULL DEFAULT 5,
      alert_impact_min  REAL NOT NULL DEFAULT 7,
      alert_report_new  INTEGER NOT NULL DEFAULT 1
    )
  `);
  return db;
}

describe("resync-watchlist-sysmap — mapSectorToDomain", () => {
  it("maps banking sector text", () => {
    expect(mapSectorToDomain("Banking")).toBe("banking");
  });

  it("maps real-estate variants using only the first '/' segment", () => {
    expect(mapSectorToDomain("Real estate / Retail REIT")).toBe("real_estate");
  });

  it("falls back to 'other' for unrecognized sector text", () => {
    expect(mapSectorToDomain("Zzz Unknown Sector")).toBe("other");
  });
});

describe("resync-watchlist-sysmap — deriveSsotWatchlist", () => {
  const fixture: SystemMapWatchlistEntry[] = [
    { ticker: "vnm", sector: "Agriculture / Dairy", exchange: "HOSE", active: true },
    { ticker: "VEA", sector: "Automotive", exchange: "UPCOM", active: false },
  ];

  it("excludes inactive entries and uppercases codes", () => {
    const seed = deriveSsotWatchlist(fixture);
    expect(seed).toEqual([{ code: "VNM", exchange: "HOSE", domain: "agriculture" }]);
  });
});

describe("resync-watchlist-sysmap — computeWatchlistDiff", () => {
  it("computes orphans (live-only) and missing (ssot-only)", () => {
    const diff = computeWatchlistDiff(["VNM", "VEA", "VNH"], ["VNM", "FPT"]);
    expect(diff.orphans).toEqual(["VEA", "VNH"]);
    expect(diff.missing).toEqual(["FPT"]);
  });

  it("returns empty orphans/missing when live already equals ssot", () => {
    const diff = computeWatchlistDiff(["VNM", "FPT"], ["FPT", "VNM"]);
    expect(diff.orphans).toEqual([]);
    expect(diff.missing).toEqual([]);
  });
});

describe("resync-watchlist-sysmap — deleteOrphanedWatchlistRows", () => {
  it("deletes only the given orphan codes (parameterized)", () => {
    const db = makeDb();
    db.exec(`
      INSERT INTO watchlist (code, exchange, domain, added_at) VALUES
        ('VNM', 'HOSE', 'agriculture', datetime('now')),
        ('VEA', 'UPCOM', 'automotive', datetime('now')),
        ('VNH', 'HNX', 'real_estate', datetime('now'))
    `);

    const deleted = deleteOrphanedWatchlistRows(db, ["VEA", "VNH"]);
    expect(deleted).toBe(2);

    const remaining = (db.prepare("SELECT code FROM watchlist").all() as { code: string }[]).map(
      (r) => r.code,
    );
    expect(remaining).toEqual(["VNM"]);
  });

  it("is a no-op (0 changes) when orphans is empty", () => {
    const db = makeDb();
    db.exec(`INSERT INTO watchlist (code, exchange, domain, added_at) VALUES ('VNM', 'HOSE', 'agriculture', datetime('now'))`);
    const deleted = deleteOrphanedWatchlistRows(db, []);
    expect(deleted).toBe(0);
  });
});

describe("resync-watchlist-sysmap — upsertSsotWatchlistRows", () => {
  it("inserts missing rows and updates existing rows (idempotent)", () => {
    const db = makeDb();
    db.exec(`INSERT INTO watchlist (code, exchange, domain, added_at, alert_drop_pct) VALUES ('VNM', 'HNX', 'other', datetime('now'), -9)`);

    const ssot = [
      { code: "VNM", exchange: "HOSE" as const, domain: "agriculture" },
      { code: "FPT", exchange: "HOSE" as const, domain: "tech" },
    ];

    upsertSsotWatchlistRows(db, ssot);

    const rows = db
      .prepare("SELECT code, exchange, domain, alert_drop_pct FROM watchlist ORDER BY code")
      .all() as { code: string; exchange: string; domain: string; alert_drop_pct: number }[];

    expect(rows).toEqual([
      { code: "FPT", exchange: "HOSE", domain: "tech", alert_drop_pct: -3 },
      { code: "VNM", exchange: "HOSE", domain: "agriculture", alert_drop_pct: -3 },
    ]);

    // Idempotent — second call yields the same state
    upsertSsotWatchlistRows(db, ssot);
    const rows2 = db.prepare("SELECT COUNT(*) AS cnt FROM watchlist").get() as { cnt: number };
    expect(rows2.cnt).toBe(2);
  });
});

describe("resync-watchlist-sysmap — full DELETE+UPSERT resync round-trip", () => {
  it("live table exactly equals SSOT after delete+upsert", () => {
    const db = makeDb();
    db.exec(`
      INSERT INTO watchlist (code, exchange, domain, added_at) VALUES
        ('VNM', 'HOSE', 'agriculture', datetime('now')),
        ('VEA', 'UPCOM', 'automotive', datetime('now')),
        ('VNH', 'HNX', 'real_estate', datetime('now'))
    `);

    const ssot = [
      { code: "VNM", exchange: "HOSE" as const, domain: "agriculture" },
      { code: "FPT", exchange: "HOSE" as const, domain: "tech" },
    ];
    const ssotCodes = ssot.map((e) => e.code);

    const liveBefore = (db.prepare("SELECT code FROM watchlist").all() as { code: string }[]).map((r) => r.code);
    const diff = computeWatchlistDiff(liveBefore, ssotCodes);

    deleteOrphanedWatchlistRows(db, diff.orphans);
    upsertSsotWatchlistRows(db, ssot);

    const liveAfter = (db.prepare("SELECT code FROM watchlist").all() as { code: string }[]).map((r) => r.code);
    const diffAfter = computeWatchlistDiff(liveAfter, ssotCodes);

    expect(diffAfter.orphans).toEqual([]);
    expect(diffAfter.missing).toEqual([]);
    expect(new Set(liveAfter)).toEqual(new Set(ssotCodes));
  });
});
