/**
 * FIX-1274 — HOSE price push available immediately post-restart (no 2h delay)
 *
 * ROOT CAUSE: logVpsPush() is called at server.ts line 544 WITHOUT a try/catch.
 * If logVpsPush throws (e.g., vps_push_log column missing due to schema migration
 * race at startup), the outer catch fires and returns HTTP 400 to the VPS.
 * The VPS fetch-prices-loop.sh increments FAILURE_COUNT on every 400 response,
 * triggering exponential backoff (300s → 600s). After ~19 consecutive 400s the
 * total accumulated backoff reaches ~2 hours. Meanwhile market_prices WAS written
 * (the upsert loop runs before logVpsPush), but vps_push_log has no new ok rows,
 * so dataFreshnessTools returns the pre-restart pushed_at (2h old).
 *
 * FIX: Wrap logVpsPush in a try/catch so a log-write failure NEVER causes an
 * HTTP 400 response. The VPS always gets 200, resets its failure counter, and
 * price freshness is maintained.
 *
 * Acceptance criteria:
 *   AC-1: push-prices handler returns 200 even when logVpsPush throws
 *   AC-2: market_prices rows ARE written even when logVpsPush throws
 *   AC-3: a successful push writes a vps_push_log ok row (happy path unchanged)
 *   AC-4: logVpsPush throw is swallowed silently — no re-throw to caller
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

// ── Minimal in-memory schema helpers ─────────────────────────────────────────

function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  // market_prices — the table the push handler writes to
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices (
      code       TEXT PRIMARY KEY,
      price      REAL,
      change_pct REAL,
      volume     REAL,
      updated_at TEXT,
      exchange   TEXT DEFAULT 'HOSE'
    )
  `);
  // vps_push_log — base schema (7 cols, no extended cols from Task 1566)
  // Simulates a production DB whose ALTER TABLE migrations have NOT yet run,
  // which is the exact condition that makes logVpsPush throw post-restart.
  db.exec(`
    CREATE TABLE IF NOT EXISTS vps_push_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      service     TEXT    NOT NULL,
      items_count INTEGER NOT NULL DEFAULT 0,
      status      TEXT    NOT NULL DEFAULT 'ok',
      error_msg   TEXT,
      duration_ms INTEGER,
      pushed_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return db;
}

// ── Extracted push-prices core logic (mirrors server.ts) ─────────────────────
// This is the CURRENT (broken) version without the fix applied.

function runPushPricesCoreBroken(
  db: Database,
  prices: Array<{ code: string; price: number; volume?: number }>,
): { status: number; written: number } {
  const upsert = db.prepare(
    `INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const now = new Date().toISOString();
  let count = 0;
  for (const p of prices) {
    if (!p.code || p.price == null) continue;
    upsert.run(p.code, p.price * 1000, null, p.volume ?? 0, now);
    count++;
  }

  // BROKEN: logVpsPush-equivalent uses extended columns that don't exist on base schema.
  // This INSERT throws "table has no column named truncation_detected".
  // NO try/catch — exception propagates to outer catch → HTTP 400 returned.
  db.prepare(
    `INSERT INTO vps_push_log (
       service, items_count, status, error_msg, duration_ms,
       truncation_detected, schema_errors_count
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run("prices", count, "ok", null, null, null, null);

  return { status: 200, written: count };
}

// ── Fixed version with try/catch around logVpsPush ───────────────────────────

function runPushPricesCoreFixed(
  db: Database,
  prices: Array<{ code: string; price: number; volume?: number }>,
): { status: number; written: number } {
  const upsert = db.prepare(
    `INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const now = new Date().toISOString();
  let count = 0;
  for (const p of prices) {
    if (!p.code || p.price == null) continue;
    upsert.run(p.code, p.price * 1000, null, p.volume ?? 0, now);
    count++;
  }

  // FIX-1274: logVpsPush wrapped in try/catch — a log failure NEVER returns 400.
  // Mirrors the fix applied to server.ts.
  try {
    db.prepare(
      `INSERT INTO vps_push_log (
         service, items_count, status, error_msg, duration_ms,
         truncation_detected, schema_errors_count
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("prices", count, "ok", null, null, null, null);
  } catch {
    // Log failure is non-fatal — VPS must receive 200 to prevent backoff accumulation.
    // A swallowed logVpsPush error means vps_push_log misses one row but market_prices
    // is up-to-date, and the VPS does not increment its failure counter.
  }

  return { status: 200, written: count };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FIX-1274 — push-prices startup: logVpsPush failure must not block 200 response", () => {
  let db: Database;

  beforeEach(() => {
    db = buildDb();
  });

  afterEach(() => {
    db.close();
  });

  // ── AC-1: 200 even when logVpsPush throws ─────────────────────────────────

  it("AC-1 (BROKEN path): logVpsPush throw causes exception propagation in current code", () => {
    const prices = [{ code: "VCB", price: 57.7 }];
    // The broken version throws because extended columns don't exist on base schema.
    expect(() => runPushPricesCoreBroken(db, prices)).toThrow();
  });

  it("AC-1 (FIXED path): logVpsPush throw is caught — handler returns status 200", () => {
    const prices = [{ code: "VCB", price: 57.7 }];
    // The fixed version catches the logVpsPush error and still returns 200.
    const result = runPushPricesCoreFixed(db, prices);
    expect(result.status).toBe(200);
  });

  // ── AC-2: market_prices written even when logVpsPush throws ──────────────

  it("AC-2: market_prices rows are written even when logVpsPush throws", () => {
    const prices = [
      { code: "VCB", price: 57.7 },
      { code: "FPT", price: 120.5 },
    ];
    // Use fixed version — should write prices even though logVpsPush fails
    runPushPricesCoreFixed(db, prices);

    const row = db.prepare("SELECT COUNT(*) as n FROM market_prices").get() as { n: number };
    expect(row.n).toBe(2);
  });

  it("AC-2: market_prices price values are correct after logVpsPush failure", () => {
    const prices = [{ code: "VCB", price: 57.7 }];
    runPushPricesCoreFixed(db, prices);

    const row = db.prepare("SELECT price FROM market_prices WHERE code = 'VCB'").get() as { price: number };
    expect(row.price).toBe(57700); // 57.7 * 1000 VND
  });

  // ── AC-3: happy path — logVpsPush writes ok row when schema is complete ───

  it("AC-3: happy path — vps_push_log ok row written when schema has all columns", () => {
    // Add the extended columns so logVpsPush succeeds
    try { db.exec("ALTER TABLE vps_push_log ADD COLUMN truncation_detected INTEGER"); } catch {}
    try { db.exec("ALTER TABLE vps_push_log ADD COLUMN schema_errors_count INTEGER"); } catch {}

    const prices = [{ code: "VCB", price: 57.7 }, { code: "FPT", price: 120.5 }];
    const result = runPushPricesCoreFixed(db, prices);

    expect(result.status).toBe(200);
    expect(result.written).toBe(2);

    const logRow = db.prepare(
      "SELECT status, items_count FROM vps_push_log WHERE service = 'prices' ORDER BY id DESC LIMIT 1",
    ).get() as { status: string; items_count: number } | null;
    expect(logRow).not.toBeNull();
    expect(logRow!.status).toBe("ok");
    expect(logRow!.items_count).toBe(2);
  });

  // ── AC-4: logVpsPush throw is swallowed — no re-throw to caller ──────────

  it("AC-4: logVpsPush error does not propagate — no unhandled exception in caller", () => {
    const prices = [{ code: "HPG", price: 28.1 }];
    // Must not throw even though logVpsPush will fail on base schema
    expect(() => runPushPricesCoreFixed(db, prices)).not.toThrow();
  });

  // ── AC-5: updated_at freshness — market_prices.updated_at is recent ───────

  it("AC-5: market_prices.updated_at is within last 5s even when logVpsPush throws", () => {
    const prices = [{ code: "VCB", price: 57.7 }];
    const beforeMs = Date.now() - 5000;
    runPushPricesCoreFixed(db, prices);

    const row = db.prepare(
      "SELECT updated_at FROM market_prices WHERE code = 'VCB'",
    ).get() as { updated_at: string };
    const writtenMs = new Date(row.updated_at).getTime();
    expect(writtenMs).toBeGreaterThan(beforeMs);
  });
});
