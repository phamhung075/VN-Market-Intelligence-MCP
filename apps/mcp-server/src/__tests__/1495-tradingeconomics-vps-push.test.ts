// src/__tests__/1495-tradingeconomics-vps-push.test.ts
/**
 * Task 1495_a — TDD RED: tradingeconomics VPS push endpoint
 *
 * All assertions must FAIL before prod code is added (RED phase).
 * Task 1495_b will wire /api/push-tradingeconomics in server.ts to make them GREEN.
 *
 * AC-1: valid payload {country:"VN", indicators:[{name:"unemployment_rate",value:2.1,unit:"%",fetched_at:"..."}]}
 *       + correct X-API-Key → 200 + {ok:true, country:"VN", updated_cols:1}
 * AC-2: indicator name not in TE_COLUMN_MAP allowlist → col ignored, updated_cols excludes it
 * AC-3: wrong/missing X-API-Key → 401
 * AC-4: valid push with 3 known indicators → macro_indicators row updated with 3 cols, updated_cols:3
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { createBunServer } from "../interface/mcp/server.js";

// ── Config ───────────────────────────────────────────────────────────────────

const VALID_KEY = "test-vps-key-1495";
const ENDPOINT = "/api/push-tradingeconomics";

function makeIndicator(name: string, value: number, unit = "%") {
  return {
    name,
    value,
    unit,
    fetched_at: "2026-04-19T08:00:00Z",
  };
}

// ── Server lifecycle ─────────────────────────────────────────────────────────

type BunServerInstance = Awaited<ReturnType<typeof createBunServer>>;
let server: BunServerInstance;
let base: string;

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  process.env["VPS_PUSH_API_KEY"] = VALID_KEY;

  closeDb();
  await initDatabase();

  server = await createBunServer({ port: 0 });
  base = `http://localhost:${server.port}`;
});

afterAll(async () => {
  await server.close();
  closeDb();
  delete Bun.env["DB_PATH"];
  delete process.env["VPS_PUSH_API_KEY"];
});

beforeEach(() => {
  try {
    getDb().exec("DELETE FROM macro_indicators");
  } catch { /* table may not exist yet in RED phase */ }
});

// ── AC-1: valid payload → 200 + {ok:true, country, updated_cols:1} ───────────

describe("Task 1495 AC-1 — valid payload returns 200 with updated_cols", () => {
  it("returns status 200", async () => {
    const res = await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({
        country: "VN",
        indicators: [makeIndicator("unemployment_rate", 2.1)],
      }),
    });
    expect(res.status).toBe(200);
  });

  it("returns {ok:true, country:'VN', updated_cols:1}", async () => {
    const res = await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({
        country: "VN",
        indicators: [makeIndicator("unemployment_rate", 2.1)],
      }),
    });
    const body = await res.json() as { ok: boolean; country: string; updated_cols: number };
    expect(body.ok).toBe(true);
    expect(body.country).toBe("VN");
    expect(body.updated_cols).toBe(1);
  });
});

// ── AC-2: unknown indicator name → ignored, updated_cols excludes it ──────────

describe("Task 1495 AC-2 — unknown indicator name ignored", () => {
  it("unknown-only payload → 200 + updated_cols:0 (no SQL error)", async () => {
    const res = await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({
        country: "VN",
        indicators: [makeIndicator("not_in_allowlist", 99)],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; updated_cols: number };
    expect(body.ok).toBe(true);
    expect(body.updated_cols).toBe(0);
  });

  it("mixed payload: 1 known + 1 unknown → updated_cols:1", async () => {
    const res = await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({
        country: "VN",
        indicators: [
          makeIndicator("cpi", 3.2),
          makeIndicator("not_in_allowlist", 99),
        ],
      }),
    });
    const body = await res.json() as { ok: boolean; updated_cols: number };
    expect(body.ok).toBe(true);
    expect(body.updated_cols).toBe(1);
  });
});

// ── AC-3: wrong/missing X-API-Key → 401 ──────────────────────────────────────

describe("Task 1495 AC-3 — wrong or missing X-API-Key returns 401", () => {
  it("returns 401 when X-API-Key is wrong", async () => {
    const res = await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "wrong-key",
      },
      body: JSON.stringify({
        country: "VN",
        indicators: [makeIndicator("cpi", 3.2)],
      }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when X-API-Key header is absent", async () => {
    const res = await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        country: "VN",
        indicators: [makeIndicator("cpi", 3.2)],
      }),
    });
    expect(res.status).toBe(401);
  });
});

// ── AC-4: 3 known indicators → macro_indicators row updated with 3 cols ───────

describe("Task 1495 AC-4 — 3 known indicators → updated_cols:3", () => {
  it("returns updated_cols:3 when 3 known indicators pushed", async () => {
    const res = await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({
        country: "VN",
        indicators: [
          makeIndicator("cpi", 3.2),
          makeIndicator("gdp_growth", 6.5),
          makeIndicator("interest_rate", 4.5),
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; country: string; updated_cols: number };
    expect(body.ok).toBe(true);
    expect(body.updated_cols).toBe(3);
  });

  it("macro_indicators row has correct values after 3-col push", async () => {
    await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({
        country: "VN",
        indicators: [
          makeIndicator("cpi", 3.2),
          makeIndicator("gdp_growth", 6.5),
          makeIndicator("interest_rate", 4.5),
        ],
      }),
    });
    const row = getDb()
      .query<{ country: string; cpi: number; gdp_growth: number; interest_rate: number }, []>(
        "SELECT country, cpi, gdp_growth, interest_rate FROM macro_indicators WHERE country = 'VN'"
      )
      .get();
    expect(row).not.toBeNull();
    expect(row!.cpi).toBeCloseTo(3.2, 4);
    expect(row!.gdp_growth).toBeCloseTo(6.5, 4);
    expect(row!.interest_rate).toBeCloseTo(4.5, 4);
  });
});
