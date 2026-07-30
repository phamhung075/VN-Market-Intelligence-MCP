/**
 * FIX-VNINDEX-CACHE-STARTUP-PURGE — Unit Tests
 *
 * Board hypothesis at mint time (2026-06-25 DB-sweep): vn_index_cache is
 * "purged on mcp-server startup" and the market-hours-only refresh window
 * strands it empty off-hours. LIVE RAW-verify (2026-07-30, this task) REFUTED
 * that hypothesis: there is no purge code anywhere in the repo (grep-confirmed,
 * incl. full git history). The real, and far worse, root cause is a NAME
 * COLLISION with a dead orphan table:
 *
 *   - Sprint 1922 / Task 1922b (commit b50ef1777, 2026-05-16) correctly retired
 *     an abandoned `vn_index_cache` table (id/snapshot_json/source/fetched_at/
 *     expires_at/created_at — an unimplemented 1842a backtesting-engine cache
 *     design) as a zero-writer zombie orphan, and left it un-dropped in the
 *     live DB with a "DO NOT add new writers. DO NOT query this table." note.
 *   - FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH (commit ac8ad6c78, 2026-06-20)
 *     re-used the SAME table name for a brand-new, unrelated "latest VNINDEX
 *     snapshot" cache (code TEXT PRIMARY KEY, price, prev_price, change_pct,
 *     volume, fetched_at) via `CREATE TABLE IF NOT EXISTS` — which silently
 *     no-ops against the pre-existing orphan (different columns entirely).
 *   - Every single upsertVnIndexCache() write since 2026-06-20 has therefore
 *     failed with `table vn_index_cache has no column named code`, swallowed
 *     as a "non-fatal" warning (vnIndexRefreshJob.ts's own comment assumed
 *     the only failure mode was "table absent on first boot" — never
 *     "table present with the WRONG shape"). Confirmed live via
 *     `docker logs mcp-server-1 | grep vn_index_cache` — the identical error
 *     on every 5-min tick, market-hours or not — and via `sqlite_sequence`
 *     showing the orphan table's AUTOINCREMENT counter has NEVER been used
 *     (zero rows, ever, since creation).
 *
 * This is why the prior "DONE" fix recurred: its own unit test suite
 * (FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH.test.ts) always exercises a FRESH
 * :memory: DB where CREATE TABLE IF NOT EXISTS creates the correct schema
 * from scratch — it never had a chance to catch a collision with a
 * pre-existing differently-shaped table, which only exists on the real,
 * long-lived named-volume market.db.
 *
 * Fix: initMarketDataTables() now detects the legacy/orphan shape (no `code`
 * column) before the CREATE TABLE IF NOT EXISTS statement and drops it —
 * safe because it is provably dead (zero rows, zero readers/writers in any
 * current code path, explicitly deprecated in the 1922b commit message).
 * This runs at DB-init time, i.e. on every mcp-server startup — exactly the
 * WRITER/startup path the board row's PO note pointed at, not the refresh
 * cron (left untouched).
 *
 * Cases:
 *   VSP-1: legacy orphan-shaped table -> migrated to the `code`-keyed schema
 *   VSP-2: upsertVnIndexCache no longer throws against a migrated table
 *   VSP-3: fresh DB (no pre-existing table) still gets the correct schema
 *   VSP-4: idempotent — re-running init against an already-correct table
 *          with live rows never drops/loses data
 *
 * @module __tests__/FIX-VNINDEX-CACHE-STARTUP-PURGE
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { upsertVnIndexCache, getVnIndexCache } from "../infrastructure/db/vnIndexCacheStore.js";
import type { MarketPrice } from "../infrastructure/fetchers/hose.js";

function buildMarketPrice(overrides: Partial<MarketPrice> = {}): MarketPrice {
  return {
    code: "VNINDEX",
    exchange: "HOSE",
    price: 1728.74,
    previousPrice: 1720.5,
    changePct: 0.48,
    volume: 812_000,
    avgVolume: 700_000,
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Reproduces the exact live orphan table from Sprint 1922b / commit b50ef1777. */
function seedLegacyOrphanTable(db: Database): void {
  db.exec(`
    CREATE TABLE vn_index_cache (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_json  TEXT NOT NULL,
      source         TEXT NOT NULL,
      fetched_at     TEXT NOT NULL,
      expires_at     TEXT NOT NULL,
      created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function tableColumns(db: Database, table: string): string[] {
  return db
    .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
    .all()
    .map((r) => r.name);
}

describe("FIX-VNINDEX-CACHE-STARTUP-PURGE — orphan-collision schema repair", () => {
  it("VSP-1: legacy 1922b orphan-shaped vn_index_cache is migrated to the code-keyed writer schema", () => {
    const db = new Database(":memory:");
    seedLegacyOrphanTable(db);
    expect(tableColumns(db, "vn_index_cache")).not.toContain("code");

    initMarketDataTables(db);

    expect(tableColumns(db, "vn_index_cache")).toContain("code");
  });

  it("VSP-2: upsertVnIndexCache no longer throws against a migrated (formerly orphan) table", () => {
    const db = new Database(":memory:");
    seedLegacyOrphanTable(db);
    initMarketDataTables(db);

    const price = buildMarketPrice();
    expect(() => upsertVnIndexCache(db, price)).not.toThrow();

    const row = getVnIndexCache(db, "VNINDEX");
    expect(row).not.toBeNull();
    expect(row!.price).toBeCloseTo(1728.74, 2);
  });

  it("VSP-3: a fresh DB with no pre-existing table still gets the correct schema (no regression)", () => {
    const db = new Database(":memory:");
    initMarketDataTables(db);

    expect(tableColumns(db, "vn_index_cache")).toContain("code");
    expect(() => upsertVnIndexCache(db, buildMarketPrice())).not.toThrow();
  });

  it("VSP-4: idempotent — re-running init against an already-migrated table with a live row never drops data", () => {
    const db = new Database(":memory:");
    seedLegacyOrphanTable(db);
    initMarketDataTables(db);
    upsertVnIndexCache(db, buildMarketPrice({ price: 1234.5 }));

    // Simulate a second container startup re-running the same migration.
    initMarketDataTables(db);

    const row = getVnIndexCache(db, "VNINDEX");
    expect(row).not.toBeNull();
    expect(row!.price).toBeCloseTo(1234.5, 2);
  });
});
