// src/__tests__/1493-reuters-vps-push.test.ts
/**
 * Task 1493_a — TDD RED: reuters VPS push endpoint
 *
 * All assertions must FAIL before prod code is added (RED phase).
 * Task 1493_b will wire /api/push-reuters in server.ts to make them GREEN.
 *
 * AC-1: valid payload + correct X-API-Key → 200 + {ok:true, inserted:N, duplicate:M}
 * AC-2: wrong/missing X-API-Key → 401
 * AC-3: same item pushed twice → duplicate count increments (dedup enforced)
 * AC-4: empty items array → 200 + {ok:true, inserted:0, duplicate:0}
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { createBunServer } from "../interface/mcp/server.js";

// ── Config ───────────────────────────────────────────────────────────────────

const VALID_KEY = "test-vps-key-1493";

function makeItem(suffix: string) {
  return {
    title: `Reuters article ${suffix}`,
    url: `https://reuters.com/markets/test-${suffix}`,
    source: "reuters",
    published_at: "2026-04-19T08:00:00Z",
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
  // Clear rag_analyses between tests to isolate dedup state
  try {
    getDb().exec("DELETE FROM rag_analyses");
  } catch { /* table may not exist yet in RED phase */ }
});

// ── AC-1: valid payload + correct key → 200 + inserted/duplicate fields ──────

describe("Task 1493 AC-1 — valid payload returns 200 with inserted + duplicate", () => {
  it("returns status 200", async () => {
    const res = await fetch(`${base}/api/push-reuters`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({ items: [makeItem("ac1-a"), makeItem("ac1-b")] }),
    });
    expect(res.status).toBe(200);
  });

  it("returns {ok:true} with inserted and duplicate numeric fields", async () => {
    const res = await fetch(`${base}/api/push-reuters`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({ items: [makeItem("ac1-c")] }),
    });
    const body = await res.json() as { ok: boolean; inserted: number; duplicate: number };
    expect(body.ok).toBe(true);
    expect(typeof body.inserted).toBe("number");
    expect(typeof body.duplicate).toBe("number");
  });

  it("reports inserted count matching items length when all are new", async () => {
    const res = await fetch(`${base}/api/push-reuters`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
      },
      body: JSON.stringify({ items: [makeItem("ac1-d"), makeItem("ac1-e")] }),
    });
    const body = await res.json() as { ok: boolean; inserted: number; duplicate: number };
    expect(body.inserted).toBe(2);
    expect(body.duplicate).toBe(0);
  });
});

// ── AC-2: wrong/missing key → 401 ────────────────────────────────────────────

describe("Task 1493 AC-2 — wrong or missing X-API-Key returns 401", () => {
  it("returns 401 when X-API-Key is wrong", async () => {
    const res = await fetch(`${base}/api/push-reuters`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "wrong-key",
      },
      body: JSON.stringify({ items: [makeItem("ac2-a")] }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when X-API-Key header is absent", async () => {
    const res = await fetch(`${base}/api/push-reuters`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: [makeItem("ac2-b")] }),
    });
    expect(res.status).toBe(401);
  });
});

// ── AC-3: same item pushed twice → duplicate increments ──────────────────────

describe("Task 1493 AC-3 — dedup: second push of same item increments duplicate", () => {
  it("second push of same URL returns duplicate:1, inserted:0", async () => {
    const item = makeItem("ac3-dedup");

    // First push
    await fetch(`${base}/api/push-reuters`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
      body: JSON.stringify({ items: [item] }),
    });

    // Second push of identical item
    const res2 = await fetch(`${base}/api/push-reuters`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
      body: JSON.stringify({ items: [item] }),
    });

    const body = await res2.json() as { ok: boolean; inserted: number; duplicate: number };
    expect(body.ok).toBe(true);
    expect(body.duplicate).toBe(1);
    expect(body.inserted).toBe(0);
  });
});

// ── AC-4: empty items array → 200 + inserted:0 duplicate:0 ───────────────────

describe("Task 1493 AC-4 — empty items array returns 200 with zeros", () => {
  it("returns status 200", async () => {
    const res = await fetch(`${base}/api/push-reuters`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
      body: JSON.stringify({ items: [] }),
    });
    expect(res.status).toBe(200);
  });

  it("returns {ok:true, inserted:0, duplicate:0}", async () => {
    const res = await fetch(`${base}/api/push-reuters`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
      body: JSON.stringify({ items: [] }),
    });
    const body = await res.json() as { ok: boolean; inserted: number; duplicate: number };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(0);
    expect(body.duplicate).toBe(0);
  });
});
