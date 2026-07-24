// src/__tests__/FACTORY-INTERFACE-vps-auth-guard-dedup.test.ts
/**
 * FACTORY-INTERFACE-vps-auth-guard-dedup
 *
 * Closes out the DRY refactor started by FACTORY-INTERFACE-split-server-ts
 * Stage 1 (bce8be44b, which extracted requireVpsApiKey and migrated the 5
 * debug-trigger routes + bctcVpsQueueHandler/bctcVpsIngestHandler/
 * macroPushHandler/ohlcvBackfillHandler — 15 call sites total). This task
 * migrated the last 5 raw copy-paste blocks onto the same shared guard:
 *   - pushPricesHandler.ts, pushSbvRatesHandler.ts, pushNewsHandler.ts,
 *     pushForeignFlowHandler.ts, and server.ts's inline GET /api/watchlist
 *     block.
 *
 * Coverage:
 *   1. Unit tests directly against requireVpsApiKey() — the shared guard
 *      itself (valid key → true/no write; missing/wrong key → false + exact
 *      401 {error:"Unauthorized"} body; x-api-key precedence over
 *      authorization: Bearer fallback).
 *   2. End-to-end HTTP tests against 2 of the newly migrated call sites
 *      (GET /api/watchlist — previously had ZERO auth test coverage of any
 *      kind; POST /api/push-sbv-rates) via a live createBunServer instance,
 *      confirming auth is still enforced after the refactor.
 *
 * NOT migrated (left as-is — see decision journal
 * docs/agent-memory/decisions/sprint-FACTORY-INTERFACE-vps-auth-guard-dedup-dev-mcp-server.md):
 *   - foreignFlowStatusHandler.ts's buildForeignFlowStatusResponse — a pure,
 *     independently-unit-tested function (1144-foreign-flow-status.test.ts)
 *     that takes apiKey/requestApiKey as plain values and RETURNS a
 *     {status,body} object rather than writing to `res` directly. Forcing
 *     it onto requireVpsApiKey(req,res) would collapse its HTTP-free
 *     testability contract and is out of scope for a behavior-preserving
 *     dedup.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { requireVpsApiKey } from "../interface/mcp/routes/_shared/requireVpsApiKey.js";
import { closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { createBunServer } from "../interface/mcp/server.js";

// ─── Part 1: shared guard unit tests ─────────────────────────────────────────

interface MockRes {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
  writeHead(code: number, headers?: Record<string, string>): void;
  end(data?: string): void;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body: "",
    headers: {},
    writeHead(code, headers = {}) {
      res.statusCode = code;
      Object.assign(res.headers, headers);
    },
    end(data = "") {
      res.body += data;
    },
  };
  return res;
}

function makeReq(headers: Record<string, string | undefined>): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

describe("FACTORY-INTERFACE-vps-auth-guard-dedup — requireVpsApiKey (shared guard, unit)", () => {
  const GUARD_KEY = "test-key-guard-dedup-unit";

  it("valid x-api-key → returns true, writes nothing to res", () => {
    Bun.env.VPS_PUSH_API_KEY = GUARD_KEY;
    const req = makeReq({ "x-api-key": GUARD_KEY });
    const res = makeRes();
    const ok = requireVpsApiKey(req, res as unknown as ServerResponse);
    expect(ok).toBe(true);
    expect(res.statusCode).toBe(0);
    expect(res.body).toBe("");
  });

  it("missing auth header → false + 401 + exact {error:\"Unauthorized\"} body", () => {
    Bun.env.VPS_PUSH_API_KEY = GUARD_KEY;
    const req = makeReq({});
    const res = makeRes();
    const ok = requireVpsApiKey(req, res as unknown as ServerResponse);
    expect(ok).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(res.body)).toEqual({ error: "Unauthorized" });
  });

  it("wrong x-api-key → false + 401 + exact body", () => {
    Bun.env.VPS_PUSH_API_KEY = GUARD_KEY;
    const req = makeReq({ "x-api-key": "wrong-value" });
    const res = makeRes();
    const ok = requireVpsApiKey(req, res as unknown as ServerResponse);
    expect(ok).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: "Unauthorized" });
  });

  it("x-api-key takes precedence over authorization: Bearer (both present, x-api-key correct)", () => {
    Bun.env.VPS_PUSH_API_KEY = GUARD_KEY;
    const req = makeReq({ "x-api-key": GUARD_KEY, authorization: "Bearer wrong-value" });
    const res = makeRes();
    const ok = requireVpsApiKey(req, res as unknown as ServerResponse);
    expect(ok).toBe(true);
  });

  it("authorization: Bearer <key> fallback authorizes when x-api-key absent", () => {
    Bun.env.VPS_PUSH_API_KEY = GUARD_KEY;
    const req = makeReq({ authorization: `Bearer ${GUARD_KEY}` });
    const res = makeRes();
    const ok = requireVpsApiKey(req, res as unknown as ServerResponse);
    expect(ok).toBe(true);
  });

  it("VPS_PUSH_API_KEY unset on server → always 401, even with a key sent", () => {
    delete Bun.env.VPS_PUSH_API_KEY;
    const req = makeReq({ "x-api-key": "anything" });
    const res = makeRes();
    const ok = requireVpsApiKey(req, res as unknown as ServerResponse);
    expect(ok).toBe(false);
    expect(res.statusCode).toBe(401);
    Bun.env.VPS_PUSH_API_KEY = GUARD_KEY; // restore for subsequent tests
  });
});

// ─── Part 2: end-to-end auth enforcement at 2 migrated call sites ───────────

const VALID_KEY = "test-key-guard-dedup-e2e";

type BunServerInstance = Awaited<ReturnType<typeof createBunServer>>;
let server: BunServerInstance;
let base: string;

describe("FACTORY-INTERFACE-vps-auth-guard-dedup — migrated call sites enforce auth end-to-end", () => {
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

  describe("GET /api/watchlist (server.ts inline block — previously had ZERO auth test coverage)", () => {
    it("no auth header → 401 {error:\"Unauthorized\"}", async () => {
      const res = await fetch(`${base}/api/watchlist`);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    it("wrong x-api-key → 401", async () => {
      const res = await fetch(`${base}/api/watchlist`, {
        headers: { "x-api-key": "wrong-key" },
      });
      expect(res.status).toBe(401);
    });

    it("valid x-api-key → 200 with codes/watchlist/globalIndices shape", async () => {
      const res = await fetch(`${base}/api/watchlist`, {
        headers: { "x-api-key": VALID_KEY },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty("codes");
      expect(body).toHaveProperty("watchlist");
      expect(body).toHaveProperty("globalIndices");
    });
  });

  describe("POST /api/push-sbv-rates (pushSbvRatesHandler.ts — migrated in this task)", () => {
    it("no auth header → 401 {error:\"Unauthorized\"}", async () => {
      const res = await fetch(`${base}/api/push-sbv-rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usdVndOfficial: 26000 }),
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    it("authorization: Bearer fallback with valid key → not 401 (auth passes)", async () => {
      const res = await fetch(`${base}/api/push-sbv-rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${VALID_KEY}` },
        body: JSON.stringify({ usdVndOfficial: 26000 }),
      });
      expect(res.status).not.toBe(401);
    });
  });
});
