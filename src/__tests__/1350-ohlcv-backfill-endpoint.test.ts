process.env["DB_PATH"] = ":memory:";

/**
 * Task 1350 — TDD test for POST /api/push-ohlcv-history endpoint
 *
 * Tests are written FIRST against an unimplemented endpoint (TDD).
 * All tests are expected to FAIL until Task 1351 implements the handler.
 *
 * TC-1: Valid bars insert — push 3 bars for one ticker, expect 200 + inserted count + DB rows
 * TC-2: Duplicate upsert idempotency — push same 3 bars twice, DB has same row count
 * TC-3: Missing API key → 401
 * TC-4: Empty bars array → 200 no-op, 0 rows in DB
 * TC-5: Malformed payload (missing required fields) → 400
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { createBunServer } from "../interface/mcp/server.js";

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_KEY = "test-vps-key-1350";

const THREE_BARS = [
  { date: "2025-01-15", open: 73500, high: 75000, low: 72800, close: 74200, volume: 1234567 },
  { date: "2025-01-16", open: 74200, high: 76000, low: 73900, close: 75500, volume: 987654 },
  { date: "2025-01-17", open: 75500, high: 77000, low: 75000, close: 76800, volume: 1100000 },
];

const VALID_PAYLOAD = { code: "VNM", bars: THREE_BARS };

// ── Server lifecycle ─────────────────────────────────────────────────────────

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
  // Clear daily_ohlcv rows between tests so they don't bleed into each other
  try {
    const db = getDb();
    db.exec("DELETE FROM daily_ohlcv");
  } catch { /* ignore — table may not exist if handler not yet implemented */ }
});

// ── TC-1: Valid bars insert ───────────────────────────────────────────────────

describe("Task 1350 — POST /api/push-ohlcv-history: TC-1 valid insert", () => {
  it("returns 200 { ok: true, inserted: 3, code: 'VNM' } for 3 valid bars", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; inserted: number; code: string };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(3);
    expect(body.code).toBe("VNM");
  });

  it("stores 3 rows in daily_ohlcv with correct close values", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    expect(res.status).toBe(200);

    const db = getDb();
    const rows = db.query<{ code: string; date: string; close: number }, [string]>(
      "SELECT code, date, close FROM daily_ohlcv WHERE code = ? ORDER BY date ASC"
    ).all("VNM");

    expect(rows).toHaveLength(3);
    expect(rows[0]!.date).toBe("2025-01-15");
    expect(rows[0]!.close).toBe(74200);
    expect(rows[1]!.date).toBe("2025-01-16");
    expect(rows[1]!.close).toBe(75500);
    expect(rows[2]!.date).toBe("2025-01-17");
    expect(rows[2]!.close).toBe(76800);
  });
});

// ── TC-2: Duplicate upsert idempotency ───────────────────────────────────────

describe("Task 1350 — POST /api/push-ohlcv-history: TC-2 duplicate upsert", () => {
  it("pushing same 3 bars twice leaves exactly 3 rows in DB (not 6)", async () => {
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": VALID_KEY,
    };

    // First push
    const res1 = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers,
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(res1.status).toBe(200);

    // Second push — same bars with different close to verify overwrite
    const modifiedBars = THREE_BARS.map((b) => ({ ...b, close: b.close + 100 }));
    const res2 = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers,
      body: JSON.stringify({ code: "VNM", bars: modifiedBars }),
    });
    expect(res2.status).toBe(200);

    const db = getDb();
    const count = db.query<{ n: number }, [string]>(
      "SELECT COUNT(*) AS n FROM daily_ohlcv WHERE code = ?"
    ).get("VNM");

    // Upsert must not create duplicate rows
    expect(count!.n).toBe(3);

    // Close prices reflect the SECOND push's values
    const rows = db.query<{ close: number }, [string]>(
      "SELECT close FROM daily_ohlcv WHERE code = ? ORDER BY date ASC"
    ).all("VNM");
    expect(rows[0]!.close).toBe(74300); // 74200 + 100
    expect(rows[1]!.close).toBe(75600); // 75500 + 100
    expect(rows[2]!.close).toBe(76900); // 76800 + 100
  });
});

// ── TC-3: Missing API key → 401 ───────────────────────────────────────────────

describe("Task 1350 — POST /api/push-ohlcv-history: TC-3 auth", () => {
  it("returns 401 { error: 'Unauthorized' } when x-api-key header is missing", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when x-api-key is wrong", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "wrong-key",
      },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 and writes no rows to DB when auth fails", async () => {
    await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    const db = getDb();
    const count = db.query<{ n: number }, [string]>(
      "SELECT COUNT(*) AS n FROM daily_ohlcv WHERE code = ?"
    ).get("VNM");
    expect(count!.n).toBe(0);
  });
});

// ── TC-4: Empty bars → 200 no-op ─────────────────────────────────────────────

describe("Task 1350 — POST /api/push-ohlcv-history: TC-4 empty bars", () => {
  it("returns 200 { ok: true, inserted: 0 } for empty bars array", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({ code: "VNM", bars: [] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; inserted: number };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(0);
  });

  it("writes no rows to DB when bars is empty", async () => {
    await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({ code: "VNM", bars: [] }),
    });

    const db = getDb();
    const count = db.query<{ n: number }, [string]>(
      "SELECT COUNT(*) AS n FROM daily_ohlcv WHERE code = ?"
    ).get("VNM");
    expect(count!.n).toBe(0);
  });
});

// ── TC-5: Malformed payload → 400 ────────────────────────────────────────────

describe("Task 1350 — POST /api/push-ohlcv-history: TC-5 malformed payload", () => {
  it("returns 400 when 'code' field is missing", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({ bars: THREE_BARS }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("returns 400 when 'bars' is not an array (object instead)", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({ code: "VNM", bars: { date: "2025-01-15", close: 74200 } }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("returns 400 when 'bars' is a string instead of array", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({ code: "VNM", bars: "not-an-array" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(typeof body.error).toBe("string");
  });

  it("returns 400 when entire body is missing 'code' and 'bars'", async () => {
    const res = await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(typeof body.error).toBe("string");
  });

  it("writes no rows to DB when payload is malformed", async () => {
    await fetch(`${base}/api/push-ohlcv-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({ bars: THREE_BARS }), // missing code
    });

    const db = getDb();
    const count = db.query<{ n: number }, []>(
      "SELECT COUNT(*) AS n FROM daily_ohlcv"
    ).get();
    expect(count!.n).toBe(0);
  });
});
