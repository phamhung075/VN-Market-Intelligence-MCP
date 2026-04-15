// src/__tests__/1132-push-foreign-flow.test.ts
/**
 * Task 1132 — POST /api/push-foreign-flow endpoint
 *
 * Tests the HTTP endpoint that accepts foreign flow data pushed by the VPS
 * proxy and stores it via upsertForeignFlow.
 *
 * Strategy: set DB_PATH=:memory: so getDb() inside the server handler returns
 * an in-memory database, then call initDatabase() to create the schema, start
 * the real createBunServer on port 0, and hit it with fetch().
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { createBunServer } from "../interface/mcp/server.js";

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_KEY = "test-vps-key-1132";

const SINGLE_ITEM_PAYLOAD = [
  {
    code: "VNM",
    date: "2026-04-12",
    foreign_volume: 123456,
    foreign_room: 500000,
    holding_ratio: 48.87,
    fetched_at: null,
  },
];

// ── Server lifecycle ─────────────────────────────────────────────────────────

type BunServerInstance = Awaited<ReturnType<typeof createBunServer>>;
let server: BunServerInstance;
let base: string;

beforeAll(async () => {
  // Route all DB calls to an in-memory database for this test suite
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
  // Clear foreign flow rows between tests so they don't bleed into each other
  try {
    const db = getDb();
    db.exec("DELETE FROM vnstock_trading_stats");
  } catch { /* table may not exist in some edge cases */ }
});

// ── Auth tests ───────────────────────────────────────────────────────────────

describe("Task 1132 — POST /api/push-foreign-flow: auth", () => {
  it("returns 401 when x-api-key header is missing", async () => {
    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SINGLE_ITEM_PAYLOAD),
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when x-api-key header has wrong value", async () => {
    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "wrong-key",
      },
      body: JSON.stringify(SINGLE_ITEM_PAYLOAD),
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("accepts valid key in Authorization: Bearer format", async () => {
    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${VALID_KEY}`,
      },
      body: JSON.stringify(SINGLE_ITEM_PAYLOAD),
    });
    expect(res.status).toBe(200);
  });
});

// ── Validation tests ─────────────────────────────────────────────────────────

describe("Task 1132 — POST /api/push-foreign-flow: validation", () => {
  it("returns 400 with 'Empty request body' on empty body", async () => {
    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: "",
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Empty request body");
  });

  it("returns 400 with 'Invalid JSON' on malformed JSON", async () => {
    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: "{ not valid json }",
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Invalid JSON");
  });

  it("returns 400 with 'Expected non-empty array' on non-array JSON", async () => {
    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({ code: "VNM" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Expected non-empty array");
  });

  it("returns 400 with 'Expected non-empty array' on empty array", async () => {
    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify([]),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Expected non-empty array");
  });
});

// ── Happy path tests ─────────────────────────────────────────────────────────

describe("Task 1132 — POST /api/push-foreign-flow: happy path", () => {
  it("returns 200 { ok: true, upserted: 1 } for single valid item", async () => {
    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify(SINGLE_ITEM_PAYLOAD),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; upserted: number };
    expect(body.ok).toBe(true);
    expect(body.upserted).toBe(1);
  });

  it("stores foreign_volume in DB correctly", async () => {
    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify([{
        code: "VCB",
        date: "2026-04-12",
        foreign_volume: 987654,
        foreign_room: 1000000,
        holding_ratio: 0.3456,
        fetched_at: null,
      }]),
    });
    expect(res.status).toBe(200);

    const db = getDb();
    const row = db.query<{ foreign_volume: number; current_holding_ratio: number }, [string, string]>(
      "SELECT foreign_volume, current_holding_ratio FROM vnstock_trading_stats WHERE code = ? AND date = ?"
    ).get("VCB", "2026-04-12");

    expect(row).not.toBeNull();
    expect(row!.foreign_volume).toBe(987654);
    expect(row!.current_holding_ratio).toBeCloseTo(0.3456, 4);
  });

  it("normalises holding_ratio > 1.0 (percentage form 48.87 → 0.4887)", async () => {
    await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify([{
        code: "HPG",
        date: "2026-04-12",
        foreign_volume: 5000,
        foreign_room: 10000,
        holding_ratio: 48.87,
        fetched_at: null,
      }]),
    });

    const db = getDb();
    const row = db.query<{ current_holding_ratio: number }, [string, string]>(
      "SELECT current_holding_ratio FROM vnstock_trading_stats WHERE code = ? AND date = ?"
    ).get("HPG", "2026-04-12");

    expect(row).not.toBeNull();
    expect(row!.current_holding_ratio).toBeCloseTo(0.4887, 4);
  });

  it("does NOT overwrite avg_volume_2w / high_52w / low_52w on existing row", async () => {
    // Pre-seed row with price data
    const db = getDb();
    db.exec(`
      INSERT OR REPLACE INTO vnstock_trading_stats
        (code, date, avg_volume_2w, high_52w, low_52w, foreign_volume, fetched_at)
      VALUES ('MSN', '2026-04-12', 999, 120.5, 80.0, 0, datetime('now'))
    `);

    await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify([{
        code: "MSN",
        date: "2026-04-12",
        foreign_volume: 777000,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      }]),
    });

    const row = db.query<{
      avg_volume_2w: number;
      high_52w: number;
      low_52w: number;
      foreign_volume: number;
    }, [string, string]>(
      "SELECT avg_volume_2w, high_52w, low_52w, foreign_volume FROM vnstock_trading_stats WHERE code = ? AND date = ?"
    ).get("MSN", "2026-04-12");

    expect(row).not.toBeNull();
    expect(row!.avg_volume_2w).toBe(999);     // must not be zeroed
    expect(row!.high_52w).toBe(120.5);        // must not be zeroed
    expect(row!.low_52w).toBe(80.0);          // must not be zeroed
    expect(row!.foreign_volume).toBe(777000); // updated
  });

  it("returns correct upserted count for a multi-item batch", async () => {
    const batch = [
      { code: "FPT", date: "2026-04-12", foreign_volume: 1, foreign_room: 2, holding_ratio: 0.1, fetched_at: null },
      { code: "MWG", date: "2026-04-12", foreign_volume: 2, foreign_room: 4, holding_ratio: 0.2, fetched_at: null },
      { code: "VHM", date: "2026-04-12", foreign_volume: 3, foreign_room: 6, holding_ratio: 0.3, fetched_at: null },
    ];

    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify(batch),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; upserted: number };
    expect(body.ok).toBe(true);
    expect(body.upserted).toBe(3);
  });

  // ── Task 1271/1273 regression: VPS camelCase payload (no date field) ────────
  it("accepts VPS-format payload (camelCase, no date) and stores net volume", async () => {
    // VPS script sends: { code, foreignBuyVol, foreignSellVol, foreignRoom }
    // Missing: date, foreign_volume, foreign_room (snake_case), holding_ratio
    const vpsBatch = [
      { code: "SSI", foreignBuyVol: 300000, foreignSellVol: 100000, foreignRoom: 5000000 },
      { code: "VCI", foreignBuyVol: 50000,  foreignSellVol: 20000,  foreignRoom: 2000000 },
    ];

    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify(vpsBatch),
    });
    expect(res.status).toBe(200);
    const resBody = await res.json() as { ok: boolean; upserted: number };
    expect(resBody.ok).toBe(true);
    expect(resBody.upserted).toBe(2);

    // Verify net volume stored correctly: buyVol - sellVol
    const db = getDb();
    const ssi = db.query<{ foreign_volume: number; foreign_room: number }, [string]>(
      "SELECT foreign_volume, foreign_room FROM vnstock_trading_stats WHERE code = ? ORDER BY date DESC LIMIT 1"
    ).get("SSI");
    expect(ssi).not.toBeNull();
    expect(ssi!.foreign_volume).toBe(200000); // 300000 - 100000
    expect(ssi!.foreign_room).toBe(5000000);
  });

  it("accepts mixed payload (some items have date, others do not)", async () => {
    const mixed = [
      { code: "BID", date: "2026-04-14", foreign_volume: 100, foreign_room: 1000, holding_ratio: 0.1, fetched_at: null },
      { code: "CTG", foreignBuyVol: 80, foreignSellVol: 30, foreignRoom: 800 }, // no date
    ];

    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify(mixed),
    });
    expect(res.status).toBe(200);
    const resBody = await res.json() as { ok: boolean; upserted: number };
    expect(resBody.ok).toBe(true);
    expect(resBody.upserted).toBe(2);

    const db = getDb();
    const ctg = db.query<{ foreign_volume: number }, [string]>(
      "SELECT foreign_volume FROM vnstock_trading_stats WHERE code = ? ORDER BY date DESC LIMIT 1"
    ).get("CTG");
    expect(ctg).not.toBeNull();
    expect(ctg!.foreign_volume).toBe(50); // 80 - 30
  });
});
