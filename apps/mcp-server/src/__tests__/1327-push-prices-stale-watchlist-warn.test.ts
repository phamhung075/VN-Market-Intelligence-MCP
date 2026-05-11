import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers — simulate the FIX-1327 logic extracted from server.ts
// ──────────────────────────────────────────────────────────────────────────────

interface StaleTicker { code: string; updated_at: string | null }

/**
 * Runs the FIX-1327 stale-ticker check against `db`.
 * Returns the message that would have been sent to the WORK channel, or null
 * if nothing was sent (either no stale tickers, or already notified today).
 */
async function runStaleTicker(
  db: Database,
  lastNotifiedDate: string,
  todayUtc: string,
): Promise<{ sent: string | null; nextLastNotifiedDate: string }> {
  if (lastNotifiedDate === todayUtc) {
    return { sent: null, nextLastNotifiedDate: lastNotifiedDate };
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const staleTickers = db.prepare(`
    SELECT w.code, mp.updated_at
    FROM watchlist w
    LEFT JOIN market_prices mp ON w.code = mp.code
    WHERE mp.updated_at IS NULL OR mp.updated_at < ?
    ORDER BY w.code
  `).all(sevenDaysAgo) as StaleTicker[];

  if (staleTickers.length === 0) {
    return { sent: null, nextLastNotifiedDate: lastNotifiedDate };
  }

  const lines = staleTickers.map((t) => {
    const lastUpdate = t.updated_at ? new Date(t.updated_at).toLocaleDateString() : "never";
    return `  • ${t.code} (last update: ${lastUpdate})`;
  });
  const msg = `[push-prices] ${staleTickers.length} stale watchlist tickers (>7d no update):\n${lines.join("\n")}`;

  return { sent: msg, nextLastNotifiedDate: todayUtc };
}

// ──────────────────────────────────────────────────────────────────────────────

describe("FIX-1327: Detect stale watchlist tickers after push-prices batch", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initMarketDataTables(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Original DB-query tests (unchanged behaviour) ──────────────────────────

  it("RED: detects watchlist ticker stale 8+ days and emits WORK channel warning", async () => {
    db.prepare(`
      INSERT INTO watchlist (code, exchange, domain, added_at)
      VALUES (?, ?, ?, ?)
    `).run("VCB", "HOSE", "banking", "2026-04-01T00:00:00Z");

    db.prepare(`
      INSERT INTO watchlist (code, exchange, domain, added_at)
      VALUES (?, ?, ?, ?)
    `).run("FPT", "HOSE", "tech", "2026-04-01T00:00:00Z");

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

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const staleTickers = db.prepare(`
      SELECT w.code, mp.updated_at
      FROM watchlist w
      LEFT JOIN market_prices mp ON w.code = mp.code
      WHERE mp.updated_at IS NULL OR mp.updated_at < ?
      ORDER BY w.code
    `).all(sevenDaysAgo) as StaleTicker[];

    expect(staleTickers.length).toBe(1);
    expect(staleTickers[0]!.code).toBe("VCB");
    expect(staleTickers[0]!.updated_at).toBe(staleDate);

    const notStale = staleTickers.filter((t) => t.code === "FPT");
    expect(notStale.length).toBe(0);
  });

  it("RED: schema migration guard cleanup query is valid", async () => {
    db.prepare(`
      INSERT INTO watchlist (code, exchange, domain, added_at)
      VALUES (?, ?, ?, ?)
    `).run("VCB", "HOSE", "banking", "2026-04-01T00:00:00Z");

    const now = new Date();
    const day35Ago = new Date(now.getTime() - 35 * 24 * 3600 * 1000).toISOString();

    db.prepare(`
      INSERT INTO market_prices (code, price, change_pct, volume, updated_at, exchange)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("VCB", 73000, -0.5, 5300000, day35Ago, "HOSE");

    let count = db
      .prepare(`SELECT COUNT(*) as n FROM market_prices WHERE code IN (SELECT code FROM watchlist)`)
      .get() as { n: number };
    expect(count.n).toBe(1);

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
    db.prepare(`
      DELETE FROM market_prices
      WHERE updated_at < ? AND code IN (SELECT code FROM watchlist)
    `).run(thirtyDaysAgo);

    count = db
      .prepare(`SELECT COUNT(*) as n FROM market_prices WHERE code IN (SELECT code FROM watchlist)`)
      .get() as { n: number };
    expect(count.n).toBe(0);
  });

  it("RED: allows legitimate market alert filtering for stale detection", async () => {
    db.prepare(`
      INSERT INTO watchlist (code, exchange, domain, added_at)
      VALUES (?, ?, ?, ?)
    `).run("VCB", "HOSE", "banking", "2026-04-01T00:00:00Z");

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO market_prices (code, price, change_pct, volume, updated_at, exchange)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("VCB", 75000, 1.5, 5000000, now, "HOSE");

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const staleTickers = db.prepare(`
      SELECT w.code
      FROM watchlist w
      LEFT JOIN market_prices mp ON w.code = mp.code
      WHERE mp.updated_at IS NULL OR mp.updated_at < ?
    `).all(sevenDaysAgo) as Array<{ code: string }>;

    expect(staleTickers.length).toBe(0);
  });

  // ── New behaviour tests — aggregated message + daily cooldown ──────────────

  it("sends ONE aggregated message listing all stale tickers (not N individual messages)", async () => {
    // Insert two stale tickers
    for (const code of ["VCB", "HPG"]) {
      db.prepare(`INSERT INTO watchlist (code, exchange, domain, added_at) VALUES (?, ?, ?, ?)`)
        .run(code, "HOSE", "test", "2026-01-01T00:00:00Z");
    }
    const staleDate = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    for (const code of ["VCB", "HPG"]) {
      db.prepare(`INSERT INTO market_prices (code, price, change_pct, volume, updated_at, exchange) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(code, 50000, 0, 1000000, staleDate, "HOSE");
    }

    const today = new Date().toISOString().slice(0, 10);
    const { sent, nextLastNotifiedDate } = await runStaleTicker(db, "", today);

    // Exactly one message, not two separate ones
    expect(sent).not.toBeNull();
    expect(sent).toContain("2 stale watchlist tickers");
    expect(sent).toContain("VCB");
    expect(sent).toContain("HPG");
    expect(nextLastNotifiedDate).toBe(today);
  });

  it("does NOT send a message when lastNotifiedDate already equals today", async () => {
    db.prepare(`INSERT INTO watchlist (code, exchange, domain, added_at) VALUES (?, ?, ?, ?)`)
      .run("VCB", "HOSE", "test", "2026-01-01T00:00:00Z");
    const staleDate = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    db.prepare(`INSERT INTO market_prices (code, price, change_pct, volume, updated_at, exchange) VALUES (?, ?, ?, ?, ?, ?)`)
      .run("VCB", 50000, 0, 1000000, staleDate, "HOSE");

    const today = new Date().toISOString().slice(0, 10);
    // Simulate: already notified today
    const { sent, nextLastNotifiedDate } = await runStaleTicker(db, today, today);

    expect(sent).toBeNull();
    expect(nextLastNotifiedDate).toBe(today);
  });

  it("sends again the next day (different date key resets cooldown)", async () => {
    db.prepare(`INSERT INTO watchlist (code, exchange, domain, added_at) VALUES (?, ?, ?, ?)`)
      .run("VCB", "HOSE", "test", "2026-01-01T00:00:00Z");
    const staleDate = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    db.prepare(`INSERT INTO market_prices (code, price, change_pct, volume, updated_at, exchange) VALUES (?, ?, ?, ?, ?, ?)`)
      .run("VCB", 50000, 0, 1000000, staleDate, "HOSE");

    const yesterday = "2026-04-27";
    const today = "2026-04-28";

    // lastNotifiedDate = yesterday → new day → should send
    const { sent, nextLastNotifiedDate } = await runStaleTicker(db, yesterday, today);

    expect(sent).not.toBeNull();
    expect(sent).toContain("1 stale watchlist tickers");
    expect(nextLastNotifiedDate).toBe(today);
  });

  it("does NOT send when there are no stale tickers (even if cooldown not set)", async () => {
    db.prepare(`INSERT INTO watchlist (code, exchange, domain, added_at) VALUES (?, ?, ?, ?)`)
      .run("VCB", "HOSE", "test", "2026-01-01T00:00:00Z");
    // Fresh price
    db.prepare(`INSERT INTO market_prices (code, price, change_pct, volume, updated_at, exchange) VALUES (?, ?, ?, ?, ?, ?)`)
      .run("VCB", 50000, 0, 1000000, new Date().toISOString(), "HOSE");

    const today = new Date().toISOString().slice(0, 10);
    const { sent, nextLastNotifiedDate } = await runStaleTicker(db, "", today);

    expect(sent).toBeNull();
    // cooldown date should NOT be updated when nothing was sent
    expect(nextLastNotifiedDate).toBe("");
  });
});
