/**
 * bctc-eval-integration.test.ts — G2 anti-false-green integration smoke
 *
 * Boots the ACTUAL express/fastify app from server.ts (createBunServer) and
 * issues real HTTP requests against the live listener. This proves:
 *   1. Routes are REACHABLE through the real handleRequest dispatch
 *   2. Responses flow through the actual middleware stack (CORS, path-strip, etc.)
 *   3. Non-vacuous: with route wiring commented out, tests FAIL with 404
 *
 * Anti-false-green design (feedback_fence_false_green):
 *   - We boot createBunServer with port=0 (ephemeral) and fetch against it
 *   - We do NOT hand-roll isolated handler tests — those already exist in
 *     bctc-eval-routes.test.ts. This file proves the server wiring layer.
 *   - Deliberate-violation evidence: see comment block at bottom of file.
 *
 * DB: uses in-memory DB (setup.ts sets DB_PATH=:memory: preload).
 * Network: real TCP on loopback (127.0.0.1 + ephemeral port).
 * Credentials: none required.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

// Type import only — we use fetch against real TCP
import type { BunServerInstance } from "../interface/mcp/server.js";

// ─── Server lifecycle ─────────────────────────────────────────────────────────

let server: BunServerInstance;
let baseUrl: string;

beforeAll(async () => {
  // Initialize schema BEFORE starting the server so all tables (including
  // bctc_eval_results) exist in the in-memory DB that server.ts will use.
  // DB_PATH=:memory: is set by setup.ts preload.
  const { initDatabase } = await import("../infrastructure/db/schema.js");
  await initDatabase();

  const { createBunServer } = await import("../interface/mcp/server.js");
  // port=0 → OS assigns ephemeral port (no conflict with running prod server)
  server = await createBunServer({ port: 0, host: "127.0.0.1" });
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterAll(async () => {
  if (server) await server.close();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getJson(path: string): Promise<{ status: number; body: unknown }> {
  const resp = await fetch(`${baseUrl}${path}`);
  const body = await resp.json();
  return { status: resp.status, body };
}

async function postJson(path: string, payload: unknown): Promise<{ status: number; body: unknown; headers: Headers }> {
  const resp = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await resp.json();
  return { status: resp.status, body, headers: resp.headers };
}

// ─── Integration smoke tests ──────────────────────────────────────────────────

describe("BCTC-EVAL integration — real server wiring", () => {
  // T1: GET /api/bctc-eval is REACHABLE and returns correct shape
  it("GET /api/bctc-eval → 200 with schema_version=1 and reports array", async () => {
    const { status, body } = await getJson("/api/bctc-eval");
    expect(status).toBe(200);
    const b = body as Record<string, unknown>;
    expect(b["schema_version"]).toBe("1");
    expect(b["sort"]).toBe("trust_ascending");
    expect(Array.isArray(b["reports"])).toBe(true);
  });

  // T2: GET /api/bctc-eval/thresholds is REACHABLE
  // May 500 if thresholds file absent in test env — that is correct: route IS wired
  it("GET /api/bctc-eval/thresholds → route is wired (200 or 500, never 404)", async () => {
    const { status } = await getJson("/api/bctc-eval/thresholds");
    // 200 = file present, 500 = file absent (non-Docker env) — both mean route IS wired
    // 404 would mean the route is NOT registered, which is the failure we are guarding against
    expect([200, 500]).toContain(status);
  });

  // T3: GET /api/bctc-eval/{uuid} returns correct error codes per brief §7
  it("GET /api/bctc-eval/not-a-uuid → 400 INVALID_UUID", async () => {
    const { status, body } = await getJson("/api/bctc-eval/not-a-uuid");
    expect(status).toBe(400);
    const b = body as Record<string, unknown>;
    expect(b["code"]).toBe("INVALID_UUID");
  });

  it("GET /api/bctc-eval/00000000-0000-0000-0000-000000000000 → 404 REPORT_NOT_FOUND", async () => {
    const { status, body } = await getJson(
      "/api/bctc-eval/00000000-0000-0000-0000-000000000000",
    );
    expect(status).toBe(404);
    const b = body as Record<string, unknown>;
    expect(b["code"]).toBe("REPORT_NOT_FOUND");
  });

  // T4: POST /api/bctc-eval/recompute/{uuid} — route IS wired
  // May 503 (extraction window), 404 (report missing), or 400 (invalid UUID)
  // Never 404 at the SERVER level (that would mean route not registered)
  it("POST /api/bctc-eval/recompute/not-a-uuid → 400 INVALID_UUID (route wired)", async () => {
    const { status, body } = await postJson(
      "/api/bctc-eval/recompute/not-a-uuid",
      {},
    );
    expect(status).toBe(400);
    const b = body as Record<string, unknown>;
    expect(b["code"]).toBe("INVALID_UUID");
  });

  // T5: POST /api/bctc-eval/push-stage — route is wired
  it("POST /api/bctc-eval/push-stage with invalid body → 400 (route wired)", async () => {
    const { status, body } = await postJson("/api/bctc-eval/push-stage", {});
    // Missing report_id → 400 INVALID_UUID
    expect(status).toBe(400);
    const b = body as Record<string, unknown>;
    expect(typeof b["code"]).toBe("string");
  });

  // T6: Middleware stack traversal — CORS headers present on eval routes
  it("GET /api/bctc-eval returns CORS headers from real middleware", async () => {
    const resp = await fetch(`${baseUrl}/api/bctc-eval`);
    expect(resp.headers.get("access-control-allow-origin")).toBe("*");
  });

  // T7: /health still works — proves no route-collision regression
  it("GET /health still returns 200 after bctc-eval routes added", async () => {
    const { status, body } = await getJson("/health");
    expect(status).toBe(200);
    const b = body as Record<string, unknown>;
    expect(b["status"]).toBe("ok");
  });

  // T8: thresholds route MUST be registered before the dynamic /:id route
  // (if order is wrong, "thresholds" would be treated as a report_id UUID and return 400)
  it("GET /api/bctc-eval/thresholds is NOT treated as a UUID (:id route not matched first)", async () => {
    const { status } = await getJson("/api/bctc-eval/thresholds");
    // If thresholds were mistakenly matched by /:id route, it would return 400 INVALID_UUID
    // because "thresholds" is not a valid UUID. That would be a routing order bug.
    // Correct: 200 (file present) or 500 (file absent) — never 400.
    expect(status).not.toBe(400);
    expect([200, 500]).toContain(status);
  });
});

/*
 * ── DELIBERATE-VIOLATION EVIDENCE ────────────────────────────────────────────
 *
 * Anti-false-green hardening per feedback_fence_false_green:
 *
 * To prove these tests are non-vacuous, the following deliberate violation was
 * performed during development:
 *
 *   1. In server.ts, the bctcEvalList route registration was temporarily
 *      commented out:
 *        // if (method === "GET" && pathname === "/api/bctc-eval") {
 *        //   handleBctcEvalList(req, res, db);
 *        //   return;
 *        // }
 *
 *   2. Test T1 ("GET /api/bctc-eval → 200") FAILED with:
 *        Expected: 200
 *        Received: 404
 *
 *   3. Test T7 ("GET /health still returns 200") PASSED — proving the failure
 *      is isolated to the route registration, not a server startup issue.
 *
 *   4. The route was restored. All tests now PASS.
 *
 * This confirms: passing tests = routes ARE wired; failing tests = routes NOT wired.
 * The test suite is not vacuous.
 *
 * For the thresholds routing-order violation (T8):
 *   - Temporarily swapping the thresholds block AFTER the /:id block would
 *     cause T8 to fail with 400 (INVALID_UUID) because "thresholds" is not a UUID.
 *   - This was verified by inspection — the route order in server.ts has
 *     thresholds registered before the generic /:id pattern.
 */
