// src/__tests__/1350-ohlcv-backfill-endpoint.test.ts
/**
 * Task 1350 — POST /api/push-ohlcv-history endpoint (TDD test — written FIRST)
 *
 * Tests the HTTP endpoint that accepts historical OHLCV bars pushed by the
 * one-time VPS backfill script and stores them in daily_ohlcv.
 *
 * Strategy: DB_PATH=:memory:, initDatabase() for schema, createBunServer on
 * port 0, then fetch() against the real handler. Mirrors 1132 pattern.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { createBunServer } from "../interface/mcp/server.js";

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_KEY = "test-vps-key-1350";

const SINGLE_BAR_PAYLOAD = {
  code: "VNM",
  bars: [
    { date: "2026-03-01", open: 78500, high: 79000, low: 78200, close: 78900, volume: 1234567 },
  ],
};

// ── Server lifecycle ─────────────────────────────────────────────────────────

type BunServerInstance = Awaited<ReturnType<typeof createBunServer>>;
let server: BunServerInstance;
let base: string;

beforeAll(async () => {
  process.env["DB_PATH"] = ":memory:";
  process.env["VPS_PUSH_API_KEY"] = VALID_KEY;

  closeDb();
  await initDatabase();

  server = await createBunServer({ port: 0 });
  base = `http://localhost:${server.port}`;
});

afterAll(async () => {
  await server.close();
  closeDb();
  delete process.env["DB_PATH"];
  delete process.env["VPS_PUSH_API_KEY"];
});

beforeEach(() => {
  try {
    const db = getDb();
    db.exec("DELETE FROM daily_ohlcv");
  } catch { /* table may not exist in some edge cases */ }
});

// ── Auth tests ───────────────────────────────────────────────────────────────

describe("Task 1350 — POST /api/push-ohlcv-history: auth", () => {
  it("returns 401 when x-api-key header is missing", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SINGLE_BAR_PAYLOAD),
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when x-api-key header has wrong value", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "wrong-key",
      },
      body: JSON.stringify(SINGLE_BAR_PAYLOAD),
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unauthorized");
  });
});

// ── Validation tests ─────────────────────────────────────────────────────────

describe("Task 1350 — POST /api/push-ohlcv-history: validation", () => {
  it("returns 400 when body.code is missing", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
      body: JSON.stringify({ bars: [{ date: "2026-03-01", open: 1, high: 2, low: 1, close: 2, volume: 100 }] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/code/i);
  });

  it("returns 400 when body.bars is missing", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
      body: JSON.stringify({ code: "VNM" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/bars/i);
  });

  it("returns 400 when body.bars is not an array", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
      body: JSON.stringify({ code: "VNM", bars: "not-an-array" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/bars/i);
  });
});

// ── Happy path tests ─────────────────────────────────────────────────────────

describe("Task 1350 — POST /api/push-ohlcv-history: happy path", () => {
  it("returns 200 { ok: true, inserted: 0, code: 'VNM' } for empty bars array", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
      body: JSON.stringify({ code: "VNM", bars: [] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; inserted: number; code: string };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(0);
    expect(body.code).toBe("VNM");
  });

  it("returns 200 { ok: true, inserted: 1, code: 'VNM' } for single bar", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
      body: JSON.stringify(SINGLE_BAR_PAYLOAD),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; inserted: number; code: string };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(1);
    expect(body.code).toBe("VNM");
  });

  it("stores bar values as-is (no x1000 conversion)", async () => {
    await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
      body: JSON.stringify({
        code: "VCB",
        bars: [{ date: "2026-03-15", open: 95000, high: 96500, low: 94800, close: 96000, volume: 2000000 }],
      }),
    });

    const db = getDb();
    const row = db.query<
      { open: number; high: number; low: number; close: number; volume: number },
      [string, string]
    >("SELECT open, high, low, close, volume FROM daily_ohlcv WHERE code = ? AND date = ?")
      .get("VCB", "2026-03-15");

    expect(row).not.toBeNull();
    expect(row!.open).toBe(95000);
    expect(row!.high).toBe(96500);
    expect(row!.low).toBe(94800);
    expect(row!.close).toBe(96000);
    expect(row!.volume).toBe(2000000);
  });

  it("skips bars where open <= 0 or close <= 0", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
      body: JSON.stringify({
        code: "HPG",
        bars: [
          { date: "2026-03-10", open: 0,     high: 1000, low: 500,  close: 800,  volume: 100 }, // skip: open=0
          { date: "2026-03-11", open: 25000,  high: 26000, low: 24000, close: 0,  volume: 200 }, // skip: close=0
          { date: "2026-03-12", open: 25000,  high: 26000, low: 24000, close: 25500, volume: 300 }, // valid
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; inserted: number; code: string };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(1);
  });

  it("inserts multiple bars for same ticker", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
      body: JSON.stringify({
        code: "FPT",
        bars: [
          { date: "2026-02-01", open: 120000, high: 122000, low: 119000, close: 121000, volume: 500000 },
          { date: "2026-02-02", open: 121000, high: 123000, low: 120000, close: 122500, volume: 450000 },
          { date: "2026-02-03", open: 122500, high: 124000, low: 121500, close: 123000, volume: 480000 },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; inserted: number; code: string };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(3);

    const db = getDb();
    const rows = db.query<{ date: string }, [string]>(
      "SELECT date FROM daily_ohlcv WHERE code = ? ORDER BY date"
    ).all("FPT");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.date).toBe("2026-02-01");
    expect(rows[2]!.date).toBe("2026-02-03");
  });

  it("upserts (INSERT OR REPLACE) — existing row is overwritten", async () => {
    const db = getDb();
    db.exec(`
      INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES ('MWG', '2026-03-20', 50000, 51000, 49000, 50500, 100000, datetime('now'))
    `);

    await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
      body: JSON.stringify({
        code: "MWG",
        bars: [{ date: "2026-03-20", open: 52000, high: 53000, low: 51000, close: 52500, volume: 200000 }],
      }),
    });

    const row = db.query<{ open: number; close: number; volume: number }, [string, string]>(
      "SELECT open, close, volume FROM daily_ohlcv WHERE code = ? AND date = ?"
    ).get("MWG", "2026-03-20");

    expect(row).not.toBeNull();
    expect(row!.open).toBe(52000);
    expect(row!.close).toBe(52500);
    expect(row!.volume).toBe(200000);
  });
});
