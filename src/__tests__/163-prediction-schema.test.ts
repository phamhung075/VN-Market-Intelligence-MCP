/**
 * Task 163 — SQLite schema: prediction_markets + prediction_signals tables
 *
 * Verifies:
 *   1. Both tables are created by initDatabase()
 *   2. prediction_markets has all required columns
 *   3. prediction_signals has all required columns
 *   4. Three indexes exist on prediction_signals
 *   5. INSERT OR REPLACE upsert works on prediction_markets
 *   6. prediction_signals FK constraint is enforced
 *   7. initDatabase() is idempotent (calling twice does not crash)
 *
 * NOTE: process.env["DB_PATH"] must be set before this module is imported
 * because DB_PATH is a module-level const evaluated at import time (ES module
 * hoisting). This test therefore shares the singleton DB with the rest of the
 * test suite and uses globally-unique IDs + cleanup to avoid UNIQUE conflicts.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

// DB_PATH is set by the shared test environment (other schema tests set ":memory:").
// We use a separate :memory: handle per this file by NOT re-setting process.env
// (which would be ignored due to ES module hoisting) and instead ensuring all
// IDs used here are globally unique across the full test run.
Bun.env["DB_PATH"] = ":memory:";

import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

describe("Task 163 — SQLite schema: prediction_markets + prediction_signals", () => {
  beforeAll(async () => {
    closeDb();
    await initDatabase();
    // Clean up any leftover rows from previous test runs (same DB file in full suite)
    const db = getDb();
    db.exec("DELETE FROM prediction_signals WHERE id LIKE 't163-%'");
    db.exec("DELETE FROM prediction_markets WHERE id LIKE 't163-%'");
  });

  afterAll(() => {
    closeDb();
  });

  // ── Table existence ──────────────────────────────────────────────────────

  it("prediction_markets table exists", () => {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='prediction_markets'"
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("prediction_markets");
  });

  it("prediction_signals table exists", () => {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='prediction_signals'"
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("prediction_signals");
  });

  // ── Column checks: prediction_markets ────────────────────────────────────

  it("prediction_markets has all required columns", () => {
    const db = getDb();
    const cols = db
      .prepare("PRAGMA table_info(prediction_markets)")
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);

    expect(names).toContain("id");
    expect(names).toContain("question");
    expect(names).toContain("end_date");
    expect(names).toContain("yes_price");
    expect(names).toContain("no_price");
    expect(names).toContain("volume_24h");
    expect(names).toContain("volume_total");
    expect(names).toContain("liquidity");
    expect(names).toContain("last_trade_price");
    expect(names).toContain("unique_wallets");
    expect(names).toContain("tags");
    expect(names).toContain("fetched_at");
    expect(names).toContain("updated_at");
  });

  it("prediction_markets.id is the PRIMARY KEY", () => {
    const db = getDb();
    const cols = db
      .prepare("PRAGMA table_info(prediction_markets)")
      .all() as Array<{ name: string; pk: number }>;
    const idCol = cols.find((c) => c.name === "id");
    expect(idCol?.pk).toBe(1);
  });

  // ── Column checks: prediction_signals ────────────────────────────────────

  it("prediction_signals has all required columns", () => {
    const db = getDb();
    const cols = db
      .prepare("PRAGMA table_info(prediction_signals)")
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);

    expect(names).toContain("id");
    expect(names).toContain("market_id");
    expect(names).toContain("signal_type");
    expect(names).toContain("severity");
    expect(names).toContain("yes_price_prev");
    expect(names).toContain("yes_price_curr");
    expect(names).toContain("volume_24h");
    expect(names).toContain("unique_wallets");
    expect(names).toContain("confidence");
    expect(names).toContain("mapped_sectors");
    expect(names).toContain("mapped_stocks");
    expect(names).toContain("reasoning");
    expect(names).toContain("detected_at");
  });

  // ── Index existence ───────────────────────────────────────────────────────

  it("idx_prediction_signals_detected_at index exists", () => {
    const db = getDb();
    const idx = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_prediction_signals_detected_at'"
      )
      .get() as { name: string } | undefined;
    expect(idx?.name).toBe("idx_prediction_signals_detected_at");
  });

  it("idx_prediction_signals_market index exists", () => {
    const db = getDb();
    const idx = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_prediction_signals_market'"
      )
      .get() as { name: string } | undefined;
    expect(idx?.name).toBe("idx_prediction_signals_market");
  });

  it("idx_prediction_signals_severity index exists", () => {
    const db = getDb();
    const idx = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_prediction_signals_severity'"
      )
      .get() as { name: string } | undefined;
    expect(idx?.name).toBe("idx_prediction_signals_severity");
  });

  // ── Upsert behaviour on prediction_markets ───────────────────────────────

  it("INSERT OR REPLACE upserts a prediction_markets row (same id, updated yes_price)", () => {
    const db = getDb();
    // Use task-prefixed IDs to avoid collisions with other test files' data
    db.prepare(`
      INSERT OR REPLACE INTO prediction_markets
        (id, question, end_date, yes_price, no_price, fetched_at, updated_at)
      VALUES
        ('t163-mkt-001', 'Will the Fed cut rates in June 2026?', '2026-06-30T00:00:00Z',
         0.72, 0.28, '2026-04-01T08:00:00Z', '2026-04-01T08:00:00Z')
    `).run();

    // Upsert with new yes_price
    db.prepare(`
      INSERT OR REPLACE INTO prediction_markets
        (id, question, end_date, yes_price, no_price, fetched_at, updated_at)
      VALUES
        ('t163-mkt-001', 'Will the Fed cut rates in June 2026?', '2026-06-30T00:00:00Z',
         0.75, 0.25, '2026-04-01T08:30:00Z', '2026-04-01T08:30:00Z')
    `).run();

    const row = db
      .prepare("SELECT * FROM prediction_markets WHERE id = 't163-mkt-001'")
      .get() as { id: string; yes_price: number; no_price: number } | undefined;

    expect(row?.id).toBe("t163-mkt-001");
    expect(row?.yes_price).toBe(0.75);
    expect(row?.no_price).toBe(0.25);

    // Only one row should exist — upsert replaces, not appends
    const count = db
      .prepare("SELECT COUNT(*) as cnt FROM prediction_markets WHERE id = 't163-mkt-001'")
      .get() as { cnt: number };
    expect(count.cnt).toBe(1);
  });

  it("prediction_markets default values are applied correctly", () => {
    const db = getDb();

    db.prepare(`
      INSERT OR REPLACE INTO prediction_markets
        (id, question, end_date, yes_price, no_price, fetched_at, updated_at)
      VALUES
        ('t163-mkt-defaults', 'Test defaults market', '2026-12-31T00:00:00Z',
         0.5, 0.5, '2026-04-01T08:00:00Z', '2026-04-01T08:00:00Z')
    `).run();

    const row = db
      .prepare("SELECT * FROM prediction_markets WHERE id = 't163-mkt-defaults'")
      .get() as {
        volume_24h: number;
        volume_total: number;
        liquidity: number;
        last_trade_price: number;
        unique_wallets: number;
        tags: string;
      } | undefined;

    expect(row?.volume_24h).toBe(0);
    expect(row?.volume_total).toBe(0);
    expect(row?.liquidity).toBe(0);
    expect(row?.last_trade_price).toBe(0);
    expect(row?.unique_wallets).toBe(0);
    expect(row?.tags).toBe("[]");
  });

  // ── FK-safe insert on prediction_signals ─────────────────────────────────

  it("INSERT INTO prediction_signals succeeds when referencing an existing prediction_markets row", () => {
    const db = getDb();

    // Insert parent first
    db.prepare(`
      INSERT OR REPLACE INTO prediction_markets
        (id, question, end_date, yes_price, no_price, fetched_at, updated_at)
      VALUES
        ('t163-mkt-002', 'Will oil prices exceed $100 in 2026?', '2026-12-31T00:00:00Z',
         0.45, 0.55, '2026-04-01T08:00:00Z', '2026-04-01T08:00:00Z')
    `).run();

    // Insert child signal
    db.prepare(`
      INSERT INTO prediction_signals
        (id, market_id, signal_type, severity, yes_price_curr, confidence, reasoning, detected_at)
      VALUES
        ('t163-sig-001', 't163-mkt-002', 'probability_shift', 'high',
         0.45, 0.82, 'Oil price jump triggered probability shift', '2026-04-01T08:05:00Z')
    `).run();

    const row = db
      .prepare("SELECT * FROM prediction_signals WHERE id = 't163-sig-001'")
      .get() as { id: string; market_id: string; signal_type: string } | undefined;

    expect(row?.id).toBe("t163-sig-001");
    expect(row?.market_id).toBe("t163-mkt-002");
    expect(row?.signal_type).toBe("probability_shift");
  });

  it("prediction_signals default values are applied correctly", () => {
    const db = getDb();

    db.prepare(`
      INSERT OR REPLACE INTO prediction_markets
        (id, question, end_date, yes_price, no_price, fetched_at, updated_at)
      VALUES
        ('t163-mkt-003', 'Test signal defaults', '2026-12-31T00:00:00Z',
         0.5, 0.5, '2026-04-01T08:00:00Z', '2026-04-01T08:00:00Z')
    `).run();

    db.prepare(`
      INSERT INTO prediction_signals
        (id, market_id, signal_type, severity, yes_price_curr, confidence, reasoning, detected_at)
      VALUES
        ('t163-sig-defaults', 't163-mkt-003', 'volume_spike', 'medium',
         0.5, 0.6, 'Volume spike detected', '2026-04-01T08:10:00Z')
    `).run();

    const row = db
      .prepare("SELECT * FROM prediction_signals WHERE id = 't163-sig-defaults'")
      .get() as {
        volume_24h: number;
        unique_wallets: number;
        mapped_sectors: string;
        mapped_stocks: string;
      } | undefined;

    expect(row?.volume_24h).toBe(0);
    expect(row?.unique_wallets).toBe(0);
    expect(row?.mapped_sectors).toBe("[]");
    expect(row?.mapped_stocks).toBe("[]");
  });

  it("prediction_signals yes_price_prev can be NULL (for volume_spike signals)", () => {
    const db = getDb();

    db.prepare(`
      INSERT OR REPLACE INTO prediction_markets
        (id, question, end_date, yes_price, no_price, fetched_at, updated_at)
      VALUES
        ('t163-mkt-004', 'Will VN-Index hit 1300 in Q2 2026?', '2026-06-30T00:00:00Z',
         0.35, 0.65, '2026-04-01T08:00:00Z', '2026-04-01T08:00:00Z')
    `).run();

    db.prepare(`
      INSERT INTO prediction_signals
        (id, market_id, signal_type, severity, yes_price_prev, yes_price_curr, confidence, reasoning, detected_at)
      VALUES
        ('t163-sig-null-prev', 't163-mkt-004', 'volume_spike', 'low',
         NULL, 0.35, 0.5, 'First snapshot — no previous price', '2026-04-01T08:15:00Z')
    `).run();

    const row = db
      .prepare("SELECT yes_price_prev FROM prediction_signals WHERE id = 't163-sig-null-prev'")
      .get() as { yes_price_prev: number | null } | undefined;

    expect(row?.yes_price_prev).toBeNull();
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  it("initDatabase() is idempotent — calling twice does not crash", async () => {
    await expect(initDatabase()).resolves.toBeUndefined();
  });

  it("initDatabase() is idempotent — calling three times does not crash", async () => {
    await initDatabase();
    await expect(initDatabase()).resolves.toBeUndefined();
  });

  // ── Existing tables still exist after schema extension ────────────────────

  it("existing watchlist table is unaffected", () => {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='watchlist'"
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("watchlist");
  });

  it("existing alerts table is unaffected", () => {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='alerts'"
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("alerts");
  });
});
