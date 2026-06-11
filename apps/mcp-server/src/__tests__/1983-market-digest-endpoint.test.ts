/**
 * Task 1983 — GET /api/market-digest endpoint (MAW-P0-2)
 *
 * AC-1: queryMarketDigest returns last 3 CHEF synthesis messages ordered newest first
 * AC-2: queryMarketDigest excludes non-synthesis agents (alert-commander, calibration-report)
 * AC-3: queryMarketDigest returns empty array when no rows exist
 * AC-4: queryMarketDigest respects LIMIT 3 when more rows exist
 * AC-5: handleGetMarketDigest returns 200 JSON with {items, count, fetchedAt}
 * AC-6: handleGetMarketDigest returns 200 with empty items[] when no rows exist (no error)
 * AC-7: handleGetMarketDigest returns 500 on DB error
 * AC-8: count matches items.length
 *
 * DDD layer: interface + infrastructure tested together at the handler seam.
 * Isolation: in-memory SQLite, reset per test.
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[1983] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  queryMarketDigest,
  handleGetMarketDigest,
  CHEF_SYNTHESIS_AGENTS,
  type MarketDigestItem,
  type MarketDigestResponse,
} from "../interface/mcp/routes/marketDigestHandler.js";

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  closeDb();
  await initDatabase();
});
afterEach(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function insertMsg(
  db: Database,
  params: { from_agent: string; message_type: string; content: string; sent_at: string },
): void {
  db.prepare(
    `INSERT INTO market_messages (from_agent, message_type, ticker, content, sent_at)
     VALUES (?, ?, NULL, ?, ?)`,
  ).run(params.from_agent, params.message_type, params.content, params.sent_at);
}

/** Minimal mock ServerResponse that captures the written response. */
function makeMockRes(): {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writeHead: (status: number, headers?: Record<string, string>) => void;
  end: (data: string) => void;
} {
  const mock = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      if (headers) Object.assign(this.headers, headers);
    },
    end(data: string) {
      this.body = data;
    },
  };
  return mock;
}

const FAKE_REQ = {} as import("node:http").IncomingMessage;

// ─────────────────────────────────────────────────────────────────────────────
// queryMarketDigest unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1983 — queryMarketDigest", () => {
  it("AC-1: returns newest messages first from CHEF agents", () => {
    const db = getDb();
    insertMsg(db, { from_agent: "morning-briefing",  message_type: "morning_briefing", content: "Morning",  sent_at: "2026-06-11 05:23:00" });
    insertMsg(db, { from_agent: "evening-summary",   message_type: "evening_summary",  content: "Evening",  sent_at: "2026-06-11 08:37:00" });
    insertMsg(db, { from_agent: "france-summary",    message_type: "france_summary",   content: "France",   sent_at: "2026-06-10 19:37:00" });

    const items = queryMarketDigest(db, 3);

    expect(items).toHaveLength(3);
    // Newest first: 08:37 > 05:23 > previous day 19:37
    expect(items[0]!.from_agent).toBe("evening-summary");
    expect(items[1]!.from_agent).toBe("morning-briefing");
    expect(items[2]!.from_agent).toBe("france-summary");
  });

  it("AC-2: excludes non-synthesis agents (alert-commander, calibration-report)", () => {
    const db = getDb();
    insertMsg(db, { from_agent: "alert-commander",    message_type: "alert",              content: "Alert!",      sent_at: "2026-06-11 10:00:00" });
    insertMsg(db, { from_agent: "calibration-report", message_type: "calibration_report", content: "Calibration", sent_at: "2026-06-11 09:00:00" });
    insertMsg(db, { from_agent: "morning-briefing",   message_type: "morning_briefing",   content: "Morning",     sent_at: "2026-06-11 05:23:00" });

    const items = queryMarketDigest(db, 3);

    expect(items).toHaveLength(1);
    expect(items[0]!.from_agent).toBe("morning-briefing");
  });

  it("AC-3: returns empty array when no rows exist", () => {
    const db = getDb();
    const items = queryMarketDigest(db, 3);
    expect(items).toHaveLength(0);
    expect(Array.isArray(items)).toBe(true);
  });

  it("AC-4: respects LIMIT 3 when more than 3 rows exist", () => {
    const db = getDb();
    for (let i = 0; i < 5; i++) {
      insertMsg(db, {
        from_agent: "morning-briefing",
        message_type: "morning_briefing",
        content: `Morning ${i}`,
        sent_at: `2026-06-0${i + 1} 05:23:00`,
      });
    }

    const items = queryMarketDigest(db, 3);
    expect(items).toHaveLength(3);
  });

  it("each item has the expected shape: {id, text, ts, type, from_agent}", () => {
    const db = getDb();
    insertMsg(db, { from_agent: "france-summary", message_type: "france_summary", content: "Test", sent_at: "2026-06-11 19:37:00" });

    const items = queryMarketDigest(db, 1);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(typeof item.id).toBe("number");
    expect(item.text).toBe("Test");
    expect(item.ts).toBe("2026-06-11 19:37:00");
    expect(item.type).toBe("france_summary");
    expect(item.from_agent).toBe("france-summary");
  });

  it("CHEF_SYNTHESIS_AGENTS includes morning-briefing, evening-summary, france-summary", () => {
    expect(CHEF_SYNTHESIS_AGENTS).toContain("morning-briefing");
    expect(CHEF_SYNTHESIS_AGENTS).toContain("evening-summary");
    expect(CHEF_SYNTHESIS_AGENTS).toContain("france-summary");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetMarketDigest HTTP handler tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1983 — handleGetMarketDigest HTTP handler", () => {
  it("AC-5: returns 200 JSON with {items, count, fetchedAt}", () => {
    const db = getDb();
    insertMsg(db, { from_agent: "morning-briefing", message_type: "morning_briefing", content: "Hi", sent_at: "2026-06-11 05:23:00" });

    const res = makeMockRes();
    const fakeNow = new Date("2026-06-11T12:00:00.000Z");
    handleGetMarketDigest(FAKE_REQ, res as unknown as import("node:http").ServerResponse, db, fakeNow);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(res.body) as MarketDigestResponse;
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(typeof body.count).toBe("number");
    expect(body.count).toBe(1);
    expect(body.fetchedAt).toBe("2026-06-11T12:00:00.000Z");
  });

  it("AC-6: returns 200 with empty items[] when no rows exist", () => {
    const db = getDb();
    const res = makeMockRes();
    handleGetMarketDigest(FAKE_REQ, res as unknown as import("node:http").ServerResponse, db);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as MarketDigestResponse;
    expect(body.items).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it("AC-8: count matches items.length", () => {
    const db = getDb();
    insertMsg(db, { from_agent: "morning-briefing", message_type: "morning_briefing", content: "A", sent_at: "2026-06-11 05:00:00" });
    insertMsg(db, { from_agent: "evening-summary",  message_type: "evening_summary",  content: "B", sent_at: "2026-06-11 08:00:00" });

    const res = makeMockRes();
    handleGetMarketDigest(FAKE_REQ, res as unknown as import("node:http").ServerResponse, db);

    const body = JSON.parse(res.body) as MarketDigestResponse;
    expect(body.count).toBe(body.items.length);
  });

  it("AC-7: returns 500 JSON on DB error (closed DB)", () => {
    const db = getDb();
    closeDb(); // close the DB to trigger error on query

    const res = makeMockRes();
    handleGetMarketDigest(FAKE_REQ, res as unknown as import("node:http").ServerResponse, db);

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");
  });
});
