Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/FIX-FOREIGN-FLOW-COVERAGE.test.ts
// FIX-FOREIGN-FLOW-COVERAGE — TDD: GET /api/ohlcv-codes endpoint
//
// Root cause (docs/handoffs/AUDIT-FC-FOREIGN-FLOW-recon.md): the CODES list submitted to
// bgapidatafeed.vps.com.vn is built only from watchlist DB + mcp.config.json referenceStocks
// (~111 codes) -> ~1457 of the ~1569 daily_ohlcv traded tickers carry foreign_net_vol=NULL
// permanently. Fix: a new GET /api/ohlcv-codes endpoint sources the code list from the FULL
// daily_ohlcv traded-code universe (SELECT DISTINCT code) instead of the 111-code subset.
//
// This endpoint was ALREADY expected by vps-scripts/fetch-ohlcv-backfill.sh's R-2 fallback
// chain (comment: "Try /api/ohlcv-codes first ... fall back to /api/watchlist") but had never
// been implemented server-side (confirmed 404/unreachable in docs/vps-sources/
// ohlcv-backfill-pipeline-stall/recon.md) — this fix closes that dormant gap too.
//
// 5 test cases:
//   TC-1: no auth → 401
//   TC-2: valid auth, empty daily_ohlcv → { codes: [], count: 0 }
//   TC-3: valid auth, seeded codes → returns ALL distinct codes (not just watchlist), sorted
//   TC-4: duplicate (code, date) rows collapse to one distinct code (DISTINCT semantics)
//   TC-5: a non-watchlist code IS included — proves coverage is not bounded to the
//         watchlist+referenceStocks subset (the exact bug this task fixes)

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { createBunServer } from "../interface/mcp/server.js";

const VALID_KEY = "test-vps-key-ffc";

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
  const db = getDb();
  db.exec("DELETE FROM daily_ohlcv");
  db.exec("DELETE FROM watchlist");
});

function seedOhlcvRow(code: string, date: string): void {
  const db = getDb();
  db.run(
    "INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES (?, ?, 10, 11, 9, 10, 1000, datetime('now'))",
    [code, date],
  );
}

describe("FIX-FOREIGN-FLOW-COVERAGE — GET /api/ohlcv-codes: auth", () => {
  it("TC-1: no X-API-Key header → 401 Unauthorized", async () => {
    const res = await fetch(`${base}/api/ohlcv-codes`, { method: "GET" });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });
});

describe("FIX-FOREIGN-FLOW-COVERAGE — GET /api/ohlcv-codes: coverage", () => {
  it("TC-2: valid auth, empty daily_ohlcv → { codes: [], count: 0 }", async () => {
    const res = await fetch(`${base}/api/ohlcv-codes`, {
      method: "GET",
      headers: { "x-api-key": VALID_KEY },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { codes: string[]; count: number };
    expect(body.codes).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("TC-3: returns ALL distinct daily_ohlcv codes, sorted — not bounded to a fixed subset", async () => {
    seedOhlcvRow("VCB", "2026-07-08");
    seedOhlcvRow("HPG", "2026-07-08");
    seedOhlcvRow("A32", "2026-07-08"); // non-watchlist, low-cap ticker — see TC-5

    const res = await fetch(`${base}/api/ohlcv-codes`, {
      method: "GET",
      headers: { "x-api-key": VALID_KEY },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { codes: string[]; count: number };
    expect(body.codes).toEqual(["A32", "HPG", "VCB"]);
    expect(body.count).toBe(3);
  });

  it("TC-4: duplicate (code, date) rows across multiple dates collapse to one distinct code", async () => {
    seedOhlcvRow("VCB", "2026-07-07");
    seedOhlcvRow("VCB", "2026-07-08");
    seedOhlcvRow("VCB", "2026-07-09");

    const res = await fetch(`${base}/api/ohlcv-codes`, {
      method: "GET",
      headers: { "x-api-key": VALID_KEY },
    });
    const body = (await res.json()) as { codes: string[]; count: number };
    expect(body.codes).toEqual(["VCB"]);
    expect(body.count).toBe(1);
  });

  it("TC-5: a code NOT present in watchlist is still returned — proves the fix (root cause was watchlist-scoping)", async () => {
    // Seed watchlist with only VCB — DPR is a daily_ohlcv-traded code that is NOT
    // in the watchlist and NOT a referenceStock. Pre-fix, /api/watchlist would
    // omit it entirely; /api/ohlcv-codes must include it.
    const db = getDb();
    db.run("INSERT INTO watchlist (code, exchange, added_at) VALUES ('VCB', 'HOSE', datetime('now'))");
    seedOhlcvRow("VCB", "2026-07-09");
    seedOhlcvRow("DPR", "2026-07-09");

    const res = await fetch(`${base}/api/ohlcv-codes`, {
      method: "GET",
      headers: { "x-api-key": VALID_KEY },
    });
    const body = (await res.json()) as { codes: string[]; count: number };
    expect(body.codes).toContain("DPR");
    expect(body.codes).toContain("VCB");
  });
});
