// src/__tests__/FACTORY-INTERFACE-debug-trigger-routes-smoke.test.ts
/**
 * FACTORY-INTERFACE-split-server-ts Stage 1 — HTTP-level smoke coverage
 *
 * Prior coverage (FIX-BCTC-DEBUG-TRIGGER.test.ts, FIX-VPS-DEBUG-TRIGGERS.test.ts)
 * only exercises the sibling *DebugTriggerHandler.ts modules directly — no test
 * previously drove these 5 routes over real HTTP against a live createBunServer
 * instance. This file closes that gap for the Stage 1 extraction
 * (docs/architecture-briefs/2026-07-04-server-ts-staged-extraction.md §4 Stage 1):
 *   - dry_run smoke check for all 5 debug-trigger endpoints (200 + unchanged JSON shape)
 *   - shared auth-guard behavior (x-api-key precedence over Bearer fallback, 401 body shape)
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { createBunServer } from "../interface/mcp/server.js";

const VALID_KEY = "test-vps-key-debug-trigger-smoke";

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

const ENDPOINTS: { path: string; extraProp: string; expectedValue: string }[] = [
  { path: "/api/trigger-bctc-debug", extraProp: "queued", expectedValue: "" },
  { path: "/api/trigger-price-debug", extraProp: "service", expectedValue: "vn-price-fetch" },
  { path: "/api/trigger-news-debug", extraProp: "service", expectedValue: "vn-news-fetch" },
  { path: "/api/trigger-sbv-debug", extraProp: "service", expectedValue: "vn-sbv-fetch" },
  { path: "/api/trigger-foreign-flow-debug", extraProp: "service", expectedValue: "vn-foreign-flow" },
];

describe("FACTORY-INTERFACE Stage 1 — debug-trigger routes dry_run smoke (live HTTP)", () => {
  for (const { path, extraProp, expectedValue } of ENDPOINTS) {
    it(`POST ${path} {dry_run:true} + x-api-key → 200 + unchanged JSON shape`, async () => {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
        body: JSON.stringify({ dry_run: true }),
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body["dry_run"]).toBe(true);
      expect(body).toHaveProperty("attempted");
      expect(body).toHaveProperty("success");
      expect(body).toHaveProperty("failed");
      expect(body).toHaveProperty("log_tail");
      expect(typeof body["log_tail"]).toBe("string");
      expect(body).toHaveProperty(extraProp);
      if (expectedValue) expect(body[extraProp]).toBe(expectedValue);
    });
  }
});

describe("FACTORY-INTERFACE Stage 1 — requireVpsApiKey guard (shared across all 5 routes)", () => {
  for (const { path } of ENDPOINTS) {
    it(`POST ${path} with no auth header → 401 {error:"Unauthorized"}`, async () => {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: true }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it(`POST ${path} with wrong x-api-key → 401`, async () => {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": "wrong-key" },
        body: JSON.stringify({ dry_run: true }),
      });
      expect(res.status).toBe(401);
    });
  }

  it("x-api-key header is honored even when authorization: Bearer is absent/wrong (precedence)", async () => {
    // x-api-key correct, authorization header wrong → must still authorize (x-api-key checked first).
    const res = await fetch(`${base}/api/trigger-sbv-debug`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VALID_KEY,
        authorization: "Bearer wrong-value",
      },
      body: JSON.stringify({ dry_run: true }),
    });
    expect(res.status).toBe(200);
  });

  it("authorization: Bearer <key> fallback authorizes when x-api-key header is absent", async () => {
    const res = await fetch(`${base}/api/trigger-sbv-debug`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${VALID_KEY}`,
      },
      body: JSON.stringify({ dry_run: true }),
    });
    expect(res.status).toBe(200);
  });
});

describe("FACTORY-INTERFACE Stage 1 — invalid JSON body → 400 (preserved across all 5 routes)", () => {
  for (const { path } of ENDPOINTS) {
    it(`POST ${path} with malformed JSON body → 400`, async () => {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
        body: "{not valid json",
      });
      expect(res.status).toBe(400);
    });
  }
});
