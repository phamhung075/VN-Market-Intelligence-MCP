/**
 * TASK-OHLCV-WIC-2 — Writer H High/Low Coercion Fix
 *
 * Verifies that POST /api/push-ohlcv-history uses parse-and-reject for bar.high
 * and bar.low instead of defaulting to open on type mismatch. Guard receives the
 * REAL parsed values so Rule 5 enforcement is not bypassed.
 *
 * Test cases:
 *  TC-1: String high/low parsing — bar.high="100500", bar.low="99200" → accepted
 *  TC-2: String high/low NaN rejection — bar.high="abc" → bar skipped, skipped++
 *  TC-3: String high/low zero/negative rejection — bar.high="0", bar.low="-5" → skipped
 *  TC-4: Number high/low still works — bar.high=100500 (number) → accepted
 *  TC-5: Mixed type — bar.high=100500 (number), bar.low="99200" (string) → accepted
 *  TC-6: Guard still rejects Rule 5 violation after parsing — high < low → skipped
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { createBunServer } from "../interface/mcp/server.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_KEY = "test-vps-key-wic2";

// A base bar with valid full-VND prices used across most test cases
const BASE_BAR = {
  date: "2026-06-16",
  open: 100000,
  close: 100500,
  volume: 500000,
};

// ─── Server lifecycle ─────────────────────────────────────────────────────────

type BunServerInstance = Awaited<ReturnType<typeof createBunServer>>;
let server: BunServerInstance;
let base: string;

beforeAll(async () => {
  process.env["VPS_PUSH_API_KEY"] = VALID_KEY;
  closeDb();
  await initDatabase();
  server = await createBunServer({ port: 0 });
  base = `http://localhost:${server.port}`;
});

afterAll(async () => {
  await server.close();
  closeDb();
  delete process.env["VPS_PUSH_API_KEY"];
});

beforeEach(() => {
  try {
    getDb().exec("DELETE FROM daily_ohlcv");
  } catch { /* ignore */ }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function pushBars(bars: unknown[]) {
  return fetch(`${base}/api/push-ohlcv-history`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": VALID_KEY,
    },
    body: JSON.stringify({ code: "WIC2", bars }),
  });
}

// ─── TC-1: String high/low parsing ───────────────────────────────────────────

describe("TASK-OHLCV-WIC-2 TC-1: string high/low parsed as number", () => {
  it("accepts bar.high and bar.low as numeric strings, inserts row", async () => {
    const bar = { ...BASE_BAR, high: "101000", low: "99500" };
    const res = await pushBars([bar]);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; inserted: number; skipped: number };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(1);
    expect(body.skipped).toBe(0);

    const db = getDb();
    const row = db.prepare("SELECT high, low FROM daily_ohlcv WHERE code = ? AND date = ?")
      .get("WIC2", "2026-06-16") as { high: number; low: number } | null;
    expect(row).not.toBeNull();
    expect(row!.high).toBe(101000);
    expect(row!.low).toBe(99500);
  });
});

// ─── TC-2: String high/low NaN rejection ─────────────────────────────────────

describe("TASK-OHLCV-WIC-2 TC-2: NaN string high rejected — bar skipped", () => {
  it("bar.high='abc' (NaN) → parseFloat=NaN → bar skipped, inserted=0, skipped=1", async () => {
    const bar = { ...BASE_BAR, high: "abc", low: 99500 };
    const res = await pushBars([bar]);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; inserted: number; skipped: number };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(0);
    expect(body.skipped).toBe(1);

    // No row in DB
    const db = getDb();
    const count = db.prepare("SELECT COUNT(*) AS n FROM daily_ohlcv WHERE code = ?")
      .get("WIC2") as { n: number };
    expect(count.n).toBe(0);
  });

  it("bar.low='xyz' (NaN) → bar skipped, no row inserted", async () => {
    const bar = { ...BASE_BAR, high: 101000, low: "xyz" };
    const res = await pushBars([bar]);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; inserted: number; skipped: number };
    expect(body.inserted).toBe(0);
    expect(body.skipped).toBe(1);
  });
});

// ─── TC-3: String high/low zero/negative rejection ───────────────────────────

describe("TASK-OHLCV-WIC-2 TC-3: zero/negative high or low rejected", () => {
  it("bar.high='0' → parse 0 → ≤0 → bar skipped", async () => {
    const bar = { ...BASE_BAR, high: "0", low: 99500 };
    const res = await pushBars([bar]);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; inserted: number; skipped: number };
    expect(body.inserted).toBe(0);
    expect(body.skipped).toBe(1);
  });

  it("bar.low='-5' (numeric string negative) → parse -5 → ≤0 → bar skipped", async () => {
    const bar = { ...BASE_BAR, high: 101000, low: "-5" };
    const res = await pushBars([bar]);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; inserted: number; skipped: number };
    expect(body.inserted).toBe(0);
    expect(body.skipped).toBe(1);
  });

  it("bar.high=0 (number zero) → ≤0 → bar skipped", async () => {
    const bar = { ...BASE_BAR, high: 0, low: 99500 };
    const res = await pushBars([bar]);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; inserted: number; skipped: number };
    expect(body.inserted).toBe(0);
    expect(body.skipped).toBe(1);
  });
});

// ─── TC-4: Number high/low still works ───────────────────────────────────────

describe("TASK-OHLCV-WIC-2 TC-4: number-typed high/low accepted as before", () => {
  it("bar.high=101000 (number), bar.low=99500 (number) → inserted=1", async () => {
    const bar = { ...BASE_BAR, high: 101000, low: 99500 };
    const res = await pushBars([bar]);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; inserted: number };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(1);
  });
});

// ─── TC-5: Mixed type ────────────────────────────────────────────────────────

describe("TASK-OHLCV-WIC-2 TC-5: mixed types (number high, string low)", () => {
  it("bar.high=101000 (number), bar.low='99500' (string) → both parse → inserted=1", async () => {
    const bar = { ...BASE_BAR, high: 101000, low: "99500" };
    const res = await pushBars([bar]);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; inserted: number; skipped: number };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(1);
    expect(body.skipped).toBe(0);

    const db = getDb();
    const row = db.prepare("SELECT high, low FROM daily_ohlcv WHERE code = ? AND date = ?")
      .get("WIC2", "2026-06-16") as { high: number; low: number } | null;
    expect(row).not.toBeNull();
    expect(row!.low).toBe(99500);
  });
});

// ─── TC-6: Guard still rejects Rule 5 violation after parsing ────────────────

describe("TASK-OHLCV-WIC-2 TC-6: guard rejects Rule 5 after parse (high < low)", () => {
  it("parsed high=99000 < parsed low=101000 → guard rejects → skipped++", async () => {
    // high < low violates Rule 5 (implausible ohlc: low > high)
    // Ensure open and close are also valid for the test to isolate Rule 5
    const bar = { date: "2026-06-16", open: 100000, close: 100000, high: 99000, low: 101000, volume: 500000 };
    const res = await pushBars([bar]);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; inserted: number; skipped: number };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(0);
    expect(body.skipped).toBe(1); // guard rejected, not parse-rejected

    // No row in DB
    const db = getDb();
    const count = db.prepare("SELECT COUNT(*) AS n FROM daily_ohlcv WHERE code = ?")
      .get("WIC2") as { n: number };
    expect(count.n).toBe(0);
  });
});

// ─── Response integrity: HTTP 200 always returned ────────────────────────────

describe("TASK-OHLCV-WIC-2 response integrity: HTTP 200 preserved on parse failure", () => {
  it("mixed valid + invalid bars: 200 returned, counts correct", async () => {
    const bars = [
      { ...BASE_BAR, high: 101000, low: 99500 },                    // valid → inserted
      { ...BASE_BAR, date: "2026-06-17", high: "abc", low: 99500 }, // NaN high → skipped
      { ...BASE_BAR, date: "2026-06-18", high: 101000, low: "xyz" }, // NaN low → skipped
    ];
    const res = await pushBars(bars);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; inserted: number; skipped: number };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(1);
    expect(body.skipped).toBe(2);
  });
});
