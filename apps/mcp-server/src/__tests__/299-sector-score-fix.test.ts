/**
 * Task 299 — computeSectorScore fix
 *
 * Root cause: peers resolved only from watchlist (1 stock per domain → 0 peers).
 * Fix: use getSectorPeers() from sectorPeers.ts to get real sector peers,
 * then intersect with codes present in market_prices.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { computeSectorScore } from "../application/services/kinhDich/kinhDichScoring.js";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM watchlist");
  db.exec("DELETE FROM market_prices");
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: insert a watchlist row with required columns
// ─────────────────────────────────────────────────────────────────────────────
function insertWatchlist(code: string, domain: string, exchange = "HOSE"): void {
  getDb().exec(
    `INSERT INTO watchlist (code, exchange, domain, added_at)
     VALUES ('${code}', '${exchange}', '${domain}', datetime('now'))`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 299 — computeSectorScore fix", () => {
  it("returns non-zero when banking sector peers have prices in market_prices", () => {
    const db = getDb();
    insertWatchlist("VCB", "banking");

    // Seed market_prices: VCB + 2 known banking peers (BID, CTG)
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, volume, updated_at)
      VALUES
        ('VCB', 95000, 0.5, 3000000, datetime('now')),
        ('BID', 45000, 1.2, 4000000, datetime('now')),
        ('CTG', 33000, 0.9, 5000000, datetime('now'))
    `);

    const score = computeSectorScore("VCB");
    // VCB change=0.5, peers avg=(1.2+0.9)/2=1.05; relative = 0.5-1.05=-0.55 → non-zero
    expect(score).not.toBe(0.0);
  });

  it("returns negative when VCB underperforms peers", () => {
    const db = getDb();
    insertWatchlist("VCB", "banking");
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, volume, updated_at)
      VALUES
        ('VCB', 95000, 0.5, 3000000, datetime('now')),
        ('BID', 45000, 3.0, 4000000, datetime('now')),
        ('CTG', 33000, 3.0, 5000000, datetime('now'))
    `);

    const score = computeSectorScore("VCB");
    // VCB=0.5 vs peers avg=3.0 → relative=-2.5 → negative score
    expect(score).toBeLessThan(0);
  });

  it("returns positive when VCB outperforms peers", () => {
    const db = getDb();
    insertWatchlist("VCB", "banking");
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, volume, updated_at)
      VALUES
        ('VCB', 95000, 4.0, 3000000, datetime('now')),
        ('BID', 45000, 1.0, 4000000, datetime('now')),
        ('CTG', 33000, 1.0, 5000000, datetime('now'))
    `);

    const score = computeSectorScore("VCB");
    // VCB=4.0 vs peers avg=1.0 → relative=+3.0 → positive score
    expect(score).toBeGreaterThan(0);
  });

  it("returns 0.0 when no peers have prices in market_prices (only the stock itself)", () => {
    const db = getDb();
    insertWatchlist("VCB", "banking");
    // Only VCB has prices, no peer stocks
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, volume, updated_at)
      VALUES ('VCB', 95000, 0.5, 3000000, datetime('now'))
    `);

    // Fallback selects "all codes != VCB" — 0 rows → returns 0.0
    const score = computeSectorScore("VCB");
    expect(score).toBe(0.0);
  });

  it("returns 0.0 when stock not in watchlist", () => {
    const score = computeSectorScore("ZZZNONE");
    expect(score).toBe(0.0);
  });

  it("score is clamped to [-1, +1]", () => {
    const db = getDb();
    insertWatchlist("VCB", "banking");
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, volume, updated_at)
      VALUES
        ('VCB', 95000, 20.0, 3000000, datetime('now')),
        ('BID', 45000, -20.0, 4000000, datetime('now')),
        ('CTG', 33000, -20.0, 5000000, datetime('now'))
    `);

    const score = computeSectorScore("VCB");
    expect(score).toBeGreaterThanOrEqual(-1);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("works for tech sector (FPT + CMG, ELC peers)", () => {
    const db = getDb();
    insertWatchlist("FPT", "tech");
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, volume, updated_at)
      VALUES
        ('FPT', 120000, 3.1, 2000000, datetime('now')),
        ('CMG', 25000, 1.5, 800000, datetime('now')),
        ('ELC', 18000, 1.0, 700000, datetime('now'))
    `);

    const score = computeSectorScore("FPT");
    // FPT=3.1 vs peers avg=1.25 → outperforms → positive
    expect(score).toBeGreaterThan(0);
  });
});
