/**
 * Task TASK-17 Alerts ENDPOINT WAVE — GET /api/alerts
 *
 * AC-1: queryAlerts returns rows ordered newest triggered_at first
 * AC-2: null signals_json → signals: []
 * AC-3: null affected_actions_json → affectedActions: []
 * AC-4: ?limit= is respected (default 50, clamp 200)
 * AC-5: handleGetAlerts returns 200 JSON with {items, count, fetchedAt}
 * AC-6: handleGetAlerts returns 200 + empty items[] when no rows
 * AC-7: handleGetAlerts returns 500 on DB error
 * AC-8: count matches items.length
 * AC-9: signals_json string[] parsed to string[]
 * AC-10: ?severity= filter works
 *
 * DDD layer: interface + infrastructure tested together at the handler seam.
 * Isolation: in-memory SQLite, reset per test via initDatabase().
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[1985] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  queryAlerts,
  handleGetAlerts,
  parseSignalsJson,
  parseAffectedActionsJson,
  type AlertItem,
  type AlertsResponse,
} from "../interface/mcp/routes/alertsHandler.js";

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

type AlertInsertParams = {
  id: string;
  triggered_at: string;
  severity: string;
  signals_json?: string | null;
  affected_actions_json?: string | null;
  message?: string | null;
  read?: number;
  sent_by?: string;
};

function insertAlert(db: Database, params: AlertInsertParams): void {
  db.prepare(
    `INSERT INTO alerts (id, triggered_at, severity, signals_json, affected_actions_json, message, read, sent_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.id,
    params.triggered_at,
    params.severity,
    params.signals_json ?? null,
    params.affected_actions_json ?? null,
    params.message ?? null,
    params.read ?? 0,
    params.sent_by ?? "server",
  );
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

function makeFakeReq(url: string = "/api/alerts"): import("node:http").IncomingMessage {
  return { url } as import("node:http").IncomingMessage;
}

// ─────────────────────────────────────────────────────────────────────────────
// parseSignalsJson unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("parseSignalsJson", () => {
  it("returns [] for null", () => {
    expect(parseSignalsJson(null)).toEqual([]);
  });

  it("returns [] for empty string", () => {
    expect(parseSignalsJson("")).toEqual([]);
  });

  it("returns [] for malformed JSON", () => {
    expect(parseSignalsJson("{not valid")).toEqual([]);
  });

  it("returns [] when JSON is not an array", () => {
    expect(parseSignalsJson('{"key": "value"}')).toEqual([]);
  });

  it("parses valid string[] correctly", () => {
    const result = parseSignalsJson('["signal-A", "signal-B"]');
    expect(result).toEqual(["signal-A", "signal-B"]);
  });

  it("filters non-string elements from array", () => {
    const result = parseSignalsJson('["ok", 123, null, "also-ok"]');
    expect(result).toEqual(["ok", "also-ok"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseAffectedActionsJson unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("parseAffectedActionsJson", () => {
  it("returns [] for null", () => {
    expect(parseAffectedActionsJson(null)).toEqual([]);
  });

  it("returns [] for malformed JSON", () => {
    expect(parseAffectedActionsJson("bad")).toEqual([]);
  });

  it("parses valid AffectedAction[]", () => {
    const raw = JSON.stringify([{ code: "VCB", expectedImpact: "bearish", confidence: 0.85 }]);
    const result = parseAffectedActionsJson(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ code: "VCB", expectedImpact: "bearish", confidence: 0.85 });
  });

  it("returns [] when JSON is not an array", () => {
    expect(parseAffectedActionsJson('{"code":"X"}')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// queryAlerts unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-17 — queryAlerts", () => {
  it("AC-1: returns rows ordered newest triggered_at first", () => {
    const db = getDb();
    insertAlert(db, { id: "a1", triggered_at: "2026-06-10T08:00:00Z", severity: "low" });
    insertAlert(db, { id: "a2", triggered_at: "2026-06-11T09:00:00Z", severity: "high" });
    insertAlert(db, { id: "a3", triggered_at: "2026-06-11T07:00:00Z", severity: "medium" });

    const items = queryAlerts(db);
    expect(items).toHaveLength(3);
    expect(items[0]!.id).toBe("a2");
    expect(items[1]!.id).toBe("a3");
    expect(items[2]!.id).toBe("a1");
  });

  it("AC-2: null signals_json → signals: []", () => {
    const db = getDb();
    insertAlert(db, { id: "b1", triggered_at: "2026-06-11T10:00:00Z", severity: "medium", signals_json: null });

    const items = queryAlerts(db);
    expect(items[0]!.signals).toEqual([]);
  });

  it("AC-3: null affected_actions_json → affectedActions: []", () => {
    const db = getDb();
    insertAlert(db, { id: "c1", triggered_at: "2026-06-11T10:00:00Z", severity: "critical", affected_actions_json: null });

    const items = queryAlerts(db);
    expect(items[0]!.affectedActions).toEqual([]);
  });

  it("AC-4: limit param is respected", () => {
    const db = getDb();
    for (let i = 0; i < 10; i++) {
      insertAlert(db, {
        id: `d${i}`,
        triggered_at: `2026-06-11T${String(i).padStart(2, "0")}:00:00Z`,
        severity: "low",
      });
    }

    const items = queryAlerts(db, 3);
    expect(items).toHaveLength(3);
  });

  it("AC-4: limit clamped to MAX (200)", () => {
    // Just verify it doesn't throw on large limit
    const db = getDb();
    insertAlert(db, { id: "e1", triggered_at: "2026-06-11T10:00:00Z", severity: "low" });
    const items = queryAlerts(db, 999);
    expect(items).toHaveLength(1); // only 1 row in DB
  });

  it("AC-9: signals_json parsed to string[]", () => {
    const db = getDb();
    const signals = JSON.stringify(["bullish-momentum", "vcp-breakout"]);
    insertAlert(db, { id: "f1", triggered_at: "2026-06-11T10:00:00Z", severity: "high", signals_json: signals });

    const items = queryAlerts(db);
    expect(items[0]!.signals).toEqual(["bullish-momentum", "vcp-breakout"]);
  });

  it("AC-10: ?severity= filter returns only matching rows", () => {
    const db = getDb();
    insertAlert(db, { id: "g1", triggered_at: "2026-06-11T10:00:00Z", severity: "critical" });
    insertAlert(db, { id: "g2", triggered_at: "2026-06-11T09:00:00Z", severity: "low" });
    insertAlert(db, { id: "g3", triggered_at: "2026-06-11T08:00:00Z", severity: "critical" });

    const items = queryAlerts(db, 50, "critical");
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.severity === "critical")).toBe(true);
  });

  it("returns empty array when no rows exist", () => {
    const db = getDb();
    const items = queryAlerts(db);
    expect(items).toHaveLength(0);
    expect(Array.isArray(items)).toBe(true);
  });

  it("each item has the expected camelCase shape", () => {
    const db = getDb();
    const signals = JSON.stringify(["sig1"]);
    const actions = JSON.stringify([{ code: "FPT", expectedImpact: "bullish", confidence: 0.9 }]);
    insertAlert(db, {
      id: "h1",
      triggered_at: "2026-06-11T10:00:00Z",
      severity: "high",
      signals_json: signals,
      affected_actions_json: actions,
      message: "test alert",
      read: 0,
      sent_by: "alert-commander",
    });

    const items = queryAlerts(db);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(typeof item.id).toBe("string");
    expect(typeof item.triggeredAt).toBe("string");
    expect(typeof item.severity).toBe("string");
    expect(Array.isArray(item.signals)).toBe(true);
    expect(Array.isArray(item.affectedActions)).toBe(true);
    expect(item.message).toBe("test alert");
    expect(item.read).toBe(0);
    expect(item.sentBy).toBe("alert-commander");
    // confidenceScore and outcome may be null (columns absent in fresh schema)
    expect(item.confidenceScore === null || typeof item.confidenceScore === "number").toBe(true);
    expect(item.outcome === null || typeof item.outcome === "string").toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetAlerts HTTP handler tests
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-17 — handleGetAlerts HTTP handler", () => {
  it("AC-5: returns 200 JSON with {items, count, fetchedAt}", () => {
    const db = getDb();
    insertAlert(db, { id: "i1", triggered_at: "2026-06-11T10:00:00Z", severity: "medium" });

    const res = makeMockRes();
    const fakeNow = new Date("2026-06-11T12:00:00.000Z");
    handleGetAlerts(
      makeFakeReq("/api/alerts"),
      res as unknown as import("node:http").ServerResponse,
      db,
      fakeNow,
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(res.body) as AlertsResponse;
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(typeof body.count).toBe("number");
    expect(body.count).toBe(1);
    expect(body.fetchedAt).toBe("2026-06-11T12:00:00.000Z");
  });

  it("AC-6: returns 200 with empty items[] when no rows exist", () => {
    const db = getDb();
    const res = makeMockRes();
    handleGetAlerts(
      makeFakeReq("/api/alerts"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as AlertsResponse;
    expect(body.items).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it("AC-8: count matches items.length", () => {
    const db = getDb();
    insertAlert(db, { id: "j1", triggered_at: "2026-06-11T10:00:00Z", severity: "high" });
    insertAlert(db, { id: "j2", triggered_at: "2026-06-11T09:00:00Z", severity: "low" });

    const res = makeMockRes();
    handleGetAlerts(
      makeFakeReq("/api/alerts"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    const body = JSON.parse(res.body) as AlertsResponse;
    expect(body.count).toBe(body.items.length);
  });

  it("respects ?limit= query param", () => {
    const db = getDb();
    for (let i = 0; i < 5; i++) {
      insertAlert(db, {
        id: `k${i}`,
        triggered_at: `2026-06-11T0${i}:00:00Z`,
        severity: "low",
      });
    }

    const res = makeMockRes();
    handleGetAlerts(
      makeFakeReq("/api/alerts?limit=2"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    const body = JSON.parse(res.body) as AlertsResponse;
    expect(body.items).toHaveLength(2);
    expect(body.count).toBe(2);
  });

  it("AC-7: returns 500 JSON on DB error (closed DB)", () => {
    const db = getDb();
    closeDb();

    const res = makeMockRes();
    handleGetAlerts(
      makeFakeReq("/api/alerts"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");
  });
});
