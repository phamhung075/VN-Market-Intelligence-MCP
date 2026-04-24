// src/__tests__/1499-gso-macro-vps-push.test.ts
/**
 * Task 1499 — TDD RED: GSO macro VPS push endpoint
 *
 * All assertions must FAIL before prod code is added (RED phase).
 * Task 1500 will add /api/push-gso handler in server.ts + 9 GSO columns in schema.
 *
 * AC-1: valid payload {country:"VN", indicators:[{name:"population",value:99.4,...}]}
 *       + correct X-API-Key → 200 + {ok:true, country:"VN", upserted:true}
 * AC-2: wrong/missing X-API-Key → 401
 * AC-3: malformed payload (not JSON / missing indicators array) → 400
 * AC-4: after valid push, macro_indicators row has fetched_at within last 10 seconds (non-stale)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { createBunServer } from "../interface/mcp/server.js";

// ── Config ────────────────────────────────────────────────────────────────────

const VALID_KEY = "test-vps-key-1499";
const ENDPOINT = "/api/push-gso";

function makeIndicator(name: string, value: number, unit = "") {
  return {
    name,
    value,
    unit,
    fetched_at: new Date().toISOString(),
  };
}

// ── Server lifecycle ──────────────────────────────────────────────────────────

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

// ── AC-1: valid payload → 200 + {ok:true, country, upserted:true} ─────────────

describe("Task 1499 AC-1 — valid GSO payload returns 200 with upserted:true", () => {
  it("returns status 200", async () => {
    const res = await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({
        country: "VN",
        indicators: [makeIndicator("population", 99.4, "million")],
      }),
    });
    expect(res.status).toBe(200);
  });

  it("returns {ok:true, country:'VN', upserted:true}", async () => {
    const res = await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({
        country: "VN",
        indicators: [makeIndicator("population", 99.4, "million")],
      }),
    });
    const body = await res.json() as { ok: boolean; country: string; upserted: boolean };
    expect(body.ok).toBe(true);
    expect(body.country).toBe("VN");
    expect(body.upserted).toBe(true);
  });

  it("unknown-only indicator names → 200 + upserted:true (row still upserted with new fetched_at)", async () => {
    const res = await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({
        country: "VN",
        indicators: [makeIndicator("not_in_allowlist", 0)],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; upserted: boolean };
    expect(body.ok).toBe(true);
    expect(body.upserted).toBe(true);
  });
});

// ── AC-2: wrong/missing X-API-Key → 401 ──────────────────────────────────────

describe("Task 1499 AC-2 — wrong or missing X-API-Key returns 401", () => {
  it("returns 401 when X-API-Key is wrong", async () => {
    const res = await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "wrong-key",
      },
      body: JSON.stringify({
        country: "VN",
        indicators: [makeIndicator("population", 99.4)],
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
        indicators: [makeIndicator("population", 99.4)],
      }),
    });
    expect(res.status).toBe(401);
  });
});

// ── AC-3: malformed payload → 400 ────────────────────────────────────────────

describe("Task 1499 AC-3 — malformed payload returns 400", () => {
  it("returns 400 for non-JSON body", async () => {
    const res = await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: "not-json{{",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 + {error} when indicators field is missing", async () => {
    const res = await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({ country: "VN" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("returns 400 when indicators is not an array", async () => {
    const res = await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({ country: "VN", indicators: "bad" }),
    });
    expect(res.status).toBe(400);
  });
});

// ── AC-4: macro_indicators row has non-stale fetched_at after push ────────────

describe("Task 1499 AC-4 — macro_indicators row fetched_at is non-stale after push", () => {
  it("fetched_at is within last 10 seconds", async () => {
    const beforePush = Date.now();

    await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({
        country: "VN",
        indicators: [makeIndicator("population", 99.4, "million")],
      }),
    });

    const row = getDb()
      .query<{ fetched_at: string }, []>(
        "SELECT fetched_at FROM macro_indicators WHERE country = 'VN'"
      )
      .get();

    expect(row).not.toBeNull();
    const fetchedAt = new Date(row!.fetched_at).getTime();
    expect(fetchedAt).toBeGreaterThanOrEqual(beforePush - 1000); // allow 1s clock skew
    expect(fetchedAt).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("second push updates fetched_at to be more recent than first push", async () => {
    // First push
    await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({
        country: "VN",
        indicators: [makeIndicator("population", 99.4)],
      }),
    });

    const row1 = getDb()
      .query<{ fetched_at: string }, []>(
        "SELECT fetched_at FROM macro_indicators WHERE country = 'VN'"
      )
      .get();
    const firstFetchedAt = new Date(row1!.fetched_at).getTime();

    // Wait 10ms so timestamps differ
    await new Promise((r) => setTimeout(r, 10));

    // Second push
    await fetch(`${base}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({
        country: "VN",
        indicators: [makeIndicator("population", 99.9)],
      }),
    });

    const row2 = getDb()
      .query<{ fetched_at: string }, []>(
        "SELECT fetched_at FROM macro_indicators WHERE country = 'VN'"
      )
      .get();
    const secondFetchedAt = new Date(row2!.fetched_at).getTime();

    expect(secondFetchedAt).toBeGreaterThanOrEqual(firstFetchedAt);
  });
});
