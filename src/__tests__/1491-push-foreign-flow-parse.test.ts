// src/__tests__/1491-push-foreign-flow-parse.test.ts
/**
 * Task 1491_a — TDD RED: push-foreign-flow body parse guard
 *
 * All assertions must FAIL before prod code is changed (RED phase).
 * Task 1491_b will add the guard logic to make them GREEN.
 *
 * AC-1: empty body ("") → 400 + {error: "Empty or truncated body"}
 * AC-2: single-char body ("{") → 400
 * AC-3: valid JSON with items array → 200 + {ok: true}
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { createBunServer } from "../interface/mcp/server.js";

// ── Config ───────────────────────────────────────────────────────────────────

const VALID_KEY = "test-vps-key-1491";

const VALID_PAYLOAD = [
  {
    code: "VNM",
    date: "2026-04-19",
    foreign_volume: 100000,
    foreign_room: 500000,
    holding_ratio: 0.45,
    fetched_at: null,
  },
];

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
    getDb().exec("DELETE FROM vnstock_trading_stats");
  } catch { /* ignore */ }
});

// ── AC-1: empty body ─────────────────────────────────────────────────────────

describe("Task 1491 AC-1 — empty body returns 400 + 'Empty or truncated body'", () => {
  it("returns status 400", async () => {
    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: "",
    });
    expect(res.status).toBe(400);
  });

  it("returns JSON error 'Empty or truncated body'", async () => {
    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: "",
    });
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Empty or truncated body");
  });
});

// ── AC-2: single-char body ───────────────────────────────────────────────────

describe("Task 1491 AC-2 — body length 1 ('{') returns 400", () => {
  it("returns status 400 for single-char body", async () => {
    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: "{",
    });
    expect(res.status).toBe(400);
  });

  it("returns JSON error 'Empty or truncated body' for single-char body", async () => {
    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: "{",
    });
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Empty or truncated body");
  });
});

// ── AC-3: valid JSON with items array → 200 {ok: true} ───────────────────────

describe("Task 1491 AC-3 — valid JSON body returns 200 {ok: true}", () => {
  it("returns status 200", async () => {
    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(res.status).toBe(200);
  });

  it("returns {ok: true} in response body", async () => {
    const res = await fetch(`${base}/api/push-foreign-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify(VALID_PAYLOAD),
    });
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
