// src/__tests__/1892a-health-vps-news.test.ts
// Task 1892a — GET /api/health/vps-news handler tests (AC-5 + AC-8)
//
// Tests:
//   (a) healthy state — lastPushAt recent, ageMs < 2h, healthy=true
//   (b) stale state — lastPushAt > 2h ago, healthy=false
//   (c) null state — no rows in vps_push_log for news/ok

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleVpsNewsHealth } from "../interface/mcp/routes/vpsNewsHealthHandler.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

// ─── Minimal HTTP mock helpers ───────────────────────────────────────────────

function makeRes() {
  const res = {
    statusCode: 0,
    body: "",
    headers: {} as Record<string, string>,
    writeHead(code: number, headers: Record<string, string> = {}) {
      res.statusCode = code;
      Object.assign(res.headers, headers);
    },
    end(data = "") {
      res.body += data;
    },
  };
  return res;
}

const fakeReq = {} as IncomingMessage;

// ─── Test setup ──────────────────────────────────────────────────────────────

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  const db = getDb();
  try { db.exec("DELETE FROM vps_push_log"); } catch { /* best effort */ }
});

afterAll(() => {
  closeDb();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("1892a — handleVpsNewsHealth (AC-5 + AC-8)", () => {
  it("(a) healthy state: recent push → healthy=true", () => {
    const db = getDb();
    // Insert a recent ok push (1 minute ago)
    const recentAt = new Date(Date.now() - 60_000).toISOString();
    db.prepare(
      "INSERT INTO vps_push_log (service, items_count, status, pushed_at) VALUES (?, ?, ?, ?)"
    ).run("news", 10, "ok", recentAt);

    const res = makeRes();
    handleVpsNewsHealth(fakeReq, res as unknown as ServerResponse, db);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { lastPushAt: string; ageMs: number; healthy: boolean };
    expect(body.healthy).toBe(true);
    expect(body.lastPushAt).toBe(recentAt);
    expect(body.ageMs).toBeGreaterThan(0);
    expect(body.ageMs).toBeLessThan(7_200_000);
  });

  it("(b) stale state: push > 2h ago → healthy=false", () => {
    const db = getDb();
    // Insert a stale ok push (3 hours ago)
    const staleAt = new Date(Date.now() - 3 * 3_600_000).toISOString();
    db.prepare(
      "INSERT INTO vps_push_log (service, items_count, status, pushed_at) VALUES (?, ?, ?, ?)"
    ).run("news", 5, "ok", staleAt);

    const res = makeRes();
    handleVpsNewsHealth(fakeReq, res as unknown as ServerResponse, db);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { lastPushAt: string; ageMs: number; healthy: boolean };
    expect(body.healthy).toBe(false);
    expect(body.ageMs).toBeGreaterThan(7_200_000);
  });

  it("(c) null state: no ok news rows → lastPushAt=null, ageMs=null, healthy=false", () => {
    const db = getDb();
    // Insert only an error row — should not count
    const errorAt = new Date(Date.now() - 30_000).toISOString();
    db.prepare(
      "INSERT INTO vps_push_log (service, items_count, status, pushed_at) VALUES (?, ?, ?, ?)"
    ).run("news", 0, "error", errorAt);

    const res = makeRes();
    handleVpsNewsHealth(fakeReq, res as unknown as ServerResponse, db);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { lastPushAt: null; ageMs: null; healthy: boolean };
    expect(body.lastPushAt).toBeNull();
    expect(body.ageMs).toBeNull();
    expect(body.healthy).toBe(false);
  });
});
