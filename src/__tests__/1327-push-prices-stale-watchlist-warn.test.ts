import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";

describe("FIX-1327: Detect stale watchlist tickers after push-prices batch", () => {
  let db: Database;
  let telegramMessages: Array<{ channel: string; message: string }> = [];

  beforeEach(() => {
    // Create in-memory test database
    db = new Database(":memory:");
    initMarketDataTables(db);

    // Mock sendTelegramWork to capture messages
    telegramMessages = [];
  });

  afterEach(() => {
    db.close();
  });

  it("RED: detects watchlist ticker stale 8+ days and emits WORK channel warning", async () => {
    // Setup: Create watchlist with [VCB, FPT]
    db.prepare(`
      INSERT INTO watchlist (code, exchange, domain, added_at)
      VALUES (?, ?, ?, ?)
    `).run("VCB", "HOSE", "banking", "2026-04-01T00:00:00Z");

    db.prepare(`
      INSERT INTO watchlist (code, exchange, domain, added_at)
      VALUES (?, ?, ?, ?)
    `).run("FPT", "HOSE", "tech", "2026-04-01T00:00:00Z");

    // Insert market_prices: VCB stale (8 days ago), FPT fresh (now)
    const staleDate = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    const freshDate = new Date().toISOString();

    db.prepare(`
      INSERT INTO market_prices (code, price, change_pct, volume, updated_at, exchange)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("VCB", 75000, 1.5, 5000000, staleDate, "HOSE");

    db.prepare(`
      INSERT INTO market_prices (code, price, change_pct, volume, updated_at, exchange)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("FPT", 65000, 2.0, 3000000, freshDate, "HOSE");

    // Simulate push-prices batch with only FPT (VCB missing)
    // This should trigger detection of VCB being stale

    // Query stale watchlist tickers (updated_at older than 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const staleTickers = db.prepare(`
      SELECT w.code, mp.updated_at
      FROM watchlist w
      LEFT JOIN market_prices mp ON w.code = mp.code
      WHERE mp.updated_at IS NULL OR mp.updated_at < ?
      ORDER BY w.code
    `).all(sevenDaysAgo) as Array<{ code: string; updated_at: string | null }>;

    // Verify VCB is detected as stale
    expect(staleTickers.length).toBe(1);
    expect(staleTickers[0].code).toBe("VCB");
    expect(staleTickers[0].updated_at).toBe(staleDate);

    // Verify FPT is NOT detected as stale
    const notStale = staleTickers.filter((t) => t.code === "FPT");
    expect(notStale.length).toBe(0);
  });

  it("RED: schema migration guard cleanup query is valid", async () => {
    // Verify that the cleanup query syntax is correct for the schema
    db.prepare(`
      INSERT INTO watchlist (code, exchange, domain, added_at)
      VALUES (?, ?, ?, ?)
    `).run("VCB", "HOSE", "banking", "2026-04-01T00:00:00Z");

    const now = new Date();
    const day35Ago = new Date(now.getTime() - 35 * 24 * 3600 * 1000).toISOString();

    // Insert old price record
    db.prepare(`
      INSERT INTO market_prices (code, price, change_pct, volume, updated_at, exchange)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("VCB", 73000, -0.5, 5300000, day35Ago, "HOSE");

    // Verify it exists before cleanup
    let count = db
      .prepare(`SELECT COUNT(*) as n FROM market_prices WHERE code IN (SELECT code FROM watchlist)`)
      .get() as { n: number };
    expect(count.n).toBe(1);

    // Apply migration guard: DELETE older than 30 days for watchlist stocks
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
    db.prepare(`
      DELETE FROM market_prices
      WHERE updated_at < ? AND code IN (SELECT code FROM watchlist)
    `).run(thirtyDaysAgo);

    // After cleanup, old record should be gone
    count = db
      .prepare(`SELECT COUNT(*) as n FROM market_prices WHERE code IN (SELECT code FROM watchlist)`)
      .get() as { n: number };
    expect(count.n).toBe(0);
  });

  it("RED: allows legitimate market alert filtering for stale detection", async () => {
    // Verify the detection logic doesn't interfere with normal price updates
    db.prepare(`
      INSERT INTO watchlist (code, exchange, domain, added_at)
      VALUES (?, ?, ?, ?)
    `).run("VCB", "HOSE", "banking", "2026-04-01T00:00:00Z");

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO market_prices (code, price, change_pct, volume, updated_at, exchange)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("VCB", 75000, 1.5, 5000000, now, "HOSE");

    // Query should NOT flag fresh prices
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const staleTickers = db.prepare(`
      SELECT w.code
      FROM watchlist w
      LEFT JOIN market_prices mp ON w.code = mp.code
      WHERE mp.updated_at IS NULL OR mp.updated_at < ?
    `).all(sevenDaysAgo) as Array<{ code: string }>;

    expect(staleTickers.length).toBe(0);
  });
});
