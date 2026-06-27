/**
 * TASK-FFT-L2 — data_asof contract tests for 5 freshness handlers
 *
 * Verifies that every handler covered by TASK-FFT-L2 exposes a top-level
 * `data_asof` field (ISO 8601 UTC string) in its 200 response.
 *
 * Anchor: FIX-L2-FRESHNESS-DATAASOF-FIELDS
 * Sprint: FRONTEND-FRESHNESS-TRANSPARENCY
 *
 * Test matrix (2 cases per handler):
 *   (a) With data — data_asof matches ISO 8601 regex; value comes from DB MAX column
 *   (b) Empty table / no DB — data_asof falls back to request time (also ISO 8601)
 *
 * Handlers tested:
 *   1. marketDigestHandler  → MAX(sent_at) FROM market_messages WHERE from_agent IN (...)
 *   2. alertsHandler        → MAX(triggered_at) FROM alerts
 *   3. qualityChecklistHandler → new Date().toISOString() (computed-on-read, no store)
 *   4. priceHistoryHandler  → MAX(updated_at) FROM daily_ohlcv WHERE code = ?
 *   5. vpsProxyHealthHandler → MAX(pushed_at) FROM vps_push_log
 *
 * DDD Layer: interface (handler/route) tested in isolation with in-memory SQLite.
 */

// Ensure in-memory DB before any imports that pull in schema
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  handleGetMarketDigest,
  queryMarketDigestAsof,
  CHEF_SYNTHESIS_AGENTS,
} from "../interface/mcp/routes/marketDigestHandler.js";
import {
  handleGetAlerts,
  queryAlertsAsof,
} from "../interface/mcp/routes/alertsHandler.js";
import { handleGetQualityChecklist } from "../interface/mcp/routes/qualityChecklistHandler.js";
import {
  handlePriceHistory,
  queryPriceHistoryAsof,
} from "../interface/mcp/routes/priceHistoryHandler.js";
import { handleVpsProxyHealth, queryVpsProxyHealthAsof } from "../interface/mcp/routes/vpsProxyHealthHandler.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ISO 8601 UTC regex per ARCH-RATIFY-FFT-4 spec:
 * "2026-06-27T14:30:45.123Z" — full datetime with milliseconds and Z suffix.
 */
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Frozen clock for deterministic fallback assertions. */
const FROZEN_NOW = new Date("2026-06-27T12:00:00.000Z");

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal mock ServerResponse that captures written output. */
function makeMockRes() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(status: number, hdrs?: Record<string, string>) {
      this.statusCode = status;
      if (hdrs) Object.assign(this.headers, hdrs);
    },
    end(data: string) {
      this.body = data;
    },
  };
}

function makeFakeReq(url = "/"): import("node:http").IncomingMessage {
  return { url } as import("node:http").IncomingMessage;
}

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
// 1. marketDigestHandler — data_asof via MAX(sent_at) FROM market_messages
// ─────────────────────────────────────────────────────────────────────────────

describe("marketDigestHandler — data_asof", () => {
  it("(a) with data: response has data_asof matching ISO 8601 derived from MAX(sent_at)", () => {
    const db = getDb();
    const knownTs = "2026-06-27T10:30:00.000Z";
    db.prepare(
      `INSERT INTO market_messages (from_agent, message_type, content, sent_at)
       VALUES (?, ?, ?, ?)`,
    ).run(CHEF_SYNTHESIS_AGENTS[0]!, "morning_briefing", "Test content", knownTs);

    const res = makeMockRes();
    handleGetMarketDigest(
      makeFakeReq("/api/market-digest"),
      res as unknown as import("node:http").ServerResponse,
      db,
      FROZEN_NOW,
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data_asof: string };
    expect(body.data_asof).toBe(knownTs);
    expect(ISO_8601_REGEX.test(body.data_asof)).toBe(true);
  });

  it("(b) empty table: data_asof falls back to request time (ISO 8601)", () => {
    const db = getDb();
    // market_messages table is empty — no inserts

    const res = makeMockRes();
    handleGetMarketDigest(
      makeFakeReq("/api/market-digest"),
      res as unknown as import("node:http").ServerResponse,
      db,
      FROZEN_NOW,
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data_asof: string };
    expect(body.data_asof).toBeDefined();
    expect(ISO_8601_REGEX.test(body.data_asof)).toBe(true);
    // Fallback = FROZEN_NOW (clock override)
    expect(body.data_asof).toBe(FROZEN_NOW.toISOString());
  });

  it("queryMarketDigestAsof returns null for empty table", () => {
    const db = getDb();
    expect(queryMarketDigestAsof(db)).toBeNull();
  });

  it("queryMarketDigestAsof returns freshest sent_at among CHEF agents only", () => {
    const db = getDb();
    // Insert 2 CHEF messages + 1 non-CHEF message with later sent_at
    db.prepare(
      `INSERT INTO market_messages (from_agent, message_type, content, sent_at)
       VALUES (?, ?, ?, ?)`,
    ).run(CHEF_SYNTHESIS_AGENTS[0]!, "morning_briefing", "c1", "2026-06-27T08:00:00.000Z");
    db.prepare(
      `INSERT INTO market_messages (from_agent, message_type, content, sent_at)
       VALUES (?, ?, ?, ?)`,
    ).run(CHEF_SYNTHESIS_AGENTS[1]!, "evening_summary", "c2", "2026-06-27T10:00:00.000Z");
    // Non-CHEF agent — must NOT affect data_asof
    db.prepare(
      `INSERT INTO market_messages (from_agent, message_type, content, sent_at)
       VALUES (?, ?, ?, ?)`,
    ).run("other-agent", "some_type", "c3", "2026-06-27T23:59:59.000Z");

    const asof = queryMarketDigestAsof(db);
    expect(asof).toBe("2026-06-27T10:00:00.000Z");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. alertsHandler — data_asof via MAX(triggered_at) FROM alerts
// ─────────────────────────────────────────────────────────────────────────────

describe("alertsHandler — data_asof", () => {
  it("(a) with data: response has data_asof matching ISO 8601 derived from MAX(triggered_at)", () => {
    const db = getDb();
    const knownTs = "2026-06-27T09:45:00.000Z";
    db.prepare(
      `INSERT INTO alerts (id, triggered_at, severity, sent_by)
       VALUES (?, ?, ?, ?)`,
    ).run("al-1", knownTs, "medium", "server");

    const res = makeMockRes();
    handleGetAlerts(
      makeFakeReq("/api/alerts"),
      res as unknown as import("node:http").ServerResponse,
      db,
      FROZEN_NOW,
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data_asof: string };
    expect(body.data_asof).toBe(knownTs);
    expect(ISO_8601_REGEX.test(body.data_asof)).toBe(true);
  });

  it("(b) empty table: data_asof falls back to request time (ISO 8601)", () => {
    const db = getDb();
    // alerts table is empty

    const res = makeMockRes();
    handleGetAlerts(
      makeFakeReq("/api/alerts"),
      res as unknown as import("node:http").ServerResponse,
      db,
      FROZEN_NOW,
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data_asof: string };
    expect(body.data_asof).toBeDefined();
    expect(ISO_8601_REGEX.test(body.data_asof)).toBe(true);
    expect(body.data_asof).toBe(FROZEN_NOW.toISOString());
  });

  it("queryAlertsAsof returns null for empty table", () => {
    const db = getDb();
    expect(queryAlertsAsof(db)).toBeNull();
  });

  it("queryAlertsAsof returns the freshest triggered_at among all alerts", () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO alerts (id, triggered_at, severity, sent_by) VALUES (?, ?, ?, ?)`,
    ).run("al-2", "2026-06-26T08:00:00.000Z", "low", "server");
    db.prepare(
      `INSERT INTO alerts (id, triggered_at, severity, sent_by) VALUES (?, ?, ?, ?)`,
    ).run("al-3", "2026-06-27T14:00:00.000Z", "high", "server");

    expect(queryAlertsAsof(db)).toBe("2026-06-27T14:00:00.000Z");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. qualityChecklistHandler — data_asof = compute time (no DB store)
// ─────────────────────────────────────────────────────────────────────────────

describe("qualityChecklistHandler — data_asof (computed-on-read)", () => {
  let tmpPath: string;

  beforeEach(() => {
    tmpPath = join(tmpdir(), `quality-checklist-test-${Date.now()}.json`);
    writeFileSync(
      tmpPath,
      JSON.stringify({
        _schema: "v1",
        overall: "HEALTHY",
        capabilities: [],
      }),
    );
  });

  afterEach(() => {
    try {
      unlinkSync(tmpPath);
    } catch {
      // ignore cleanup errors
    }
  });

  it("(a) with file: response has data_asof = request time (ISO 8601)", () => {
    const res = makeMockRes();
    handleGetQualityChecklist(
      makeFakeReq("/api/quality-checklist"),
      res as unknown as import("node:http").ServerResponse,
      tmpPath,
      FROZEN_NOW,
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data_asof: string; overall: string };
    expect(body.data_asof).toBeDefined();
    expect(ISO_8601_REGEX.test(body.data_asof)).toBe(true);
    // data_asof = FROZEN_NOW (compute time)
    expect(body.data_asof).toBe(FROZEN_NOW.toISOString());
    // Existing checklist fields preserved
    expect(body.overall).toBe("HEALTHY");
  });

  it("(b) no file (missing path): handler returns 500, no data_asof (error path)", () => {
    const res = makeMockRes();
    handleGetQualityChecklist(
      makeFakeReq("/api/quality-checklist"),
      res as unknown as import("node:http").ServerResponse,
      "/nonexistent/path/quality-checklist.json",
      FROZEN_NOW,
    );

    expect(res.statusCode).toBe(500);
    // Error path has no data_asof — that is correct (error case, not empty-table fallback)
  });

  it("data_asof is always ISO 8601 for any valid checklist file", () => {
    const res = makeMockRes();
    handleGetQualityChecklist(
      makeFakeReq("/api/quality-checklist"),
      res as unknown as import("node:http").ServerResponse,
      tmpPath,
      new Date("2026-01-15T03:00:00.000Z"),
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data_asof: string };
    expect(body.data_asof).toBe("2026-01-15T03:00:00.000Z");
    expect(ISO_8601_REGEX.test(body.data_asof)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. priceHistoryHandler — data_asof via MAX(updated_at) FROM daily_ohlcv
// ─────────────────────────────────────────────────────────────────────────────

describe("priceHistoryHandler — data_asof", () => {
  const TICKER = "FPT";

  it("(a) with data: 200 response has data_asof matching ISO 8601 derived from MAX(updated_at)", () => {
    const db = getDb();
    const knownTs = "2026-06-27T07:30:00.000Z";
    // Insert an OHLCV row within the default 30-day window
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, date('now'), 100, 110, 90, 105, 1000, ?)`,
    ).run(TICKER, knownTs);

    const res = makeMockRes();
    handlePriceHistory(
      makeFakeReq(`/api/price-history?code=${TICKER}`),
      res as unknown as import("node:http").ServerResponse,
      db,
      FROZEN_NOW,
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data_asof: string; code: string };
    expect(body.code).toBe(TICKER);
    expect(body.data_asof).toBe(knownTs);
    expect(ISO_8601_REGEX.test(body.data_asof)).toBe(true);
  });

  it("(b) empty table: 404 (no rows) — data_asof not present in 404 response", () => {
    const db = getDb();
    // daily_ohlcv empty for this ticker

    const res = makeMockRes();
    handlePriceHistory(
      makeFakeReq(`/api/price-history?code=${TICKER}`),
      res as unknown as import("node:http").ServerResponse,
      db,
      FROZEN_NOW,
    );

    // Empty table = 404, no data_asof (correct; data not served)
    expect(res.statusCode).toBe(404);
  });

  it("(c) data exists but updated_at is empty string: fallback to request time", () => {
    const db = getDb();
    // Insert with empty updated_at (default in schema = '')
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, date('now'), 100, 110, 90, 105, 1000, '')`,
    ).run(TICKER);

    const res = makeMockRes();
    handlePriceHistory(
      makeFakeReq(`/api/price-history?code=${TICKER}`),
      res as unknown as import("node:http").ServerResponse,
      db,
      FROZEN_NOW,
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data_asof: string };
    // MAX('') = '' → falsy → fallback to FROZEN_NOW
    expect(body.data_asof).toBeDefined();
    expect(ISO_8601_REGEX.test(body.data_asof)).toBe(true);
  });

  it("queryPriceHistoryAsof returns null for empty table", () => {
    const db = getDb();
    expect(queryPriceHistoryAsof(db, TICKER)).toBeNull();
  });

  it("queryPriceHistoryAsof returns MAX(updated_at) for a specific ticker only", () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, date('now', '-1 day'), 100, 110, 90, 105, 1000, ?)`,
    ).run(TICKER, "2026-06-26T07:00:00.000Z");
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, date('now'), 110, 120, 100, 115, 1200, ?)`,
    ).run(TICKER, "2026-06-27T07:30:00.000Z");
    // Different ticker — must NOT affect TICKER's asof
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, date('now'), 50, 55, 45, 52, 500, ?)`,
    ).run("VCB", "2026-06-27T23:59:59.000Z");

    expect(queryPriceHistoryAsof(db, TICKER)).toBe("2026-06-27T07:30:00.000Z");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. vpsProxyHealthHandler — data_asof via MAX(pushed_at) FROM vps_push_log
// ─────────────────────────────────────────────────────────────────────────────

describe("vpsProxyHealthHandler — data_asof", () => {
  it("(a) with data: response has data_asof matching ISO 8601 derived from MAX(pushed_at)", () => {
    const db = getDb();
    const knownTs = "2026-06-27T11:00:00.000Z";
    db.prepare(
      `INSERT INTO vps_push_log (service, items_count, status, pushed_at)
       VALUES (?, ?, ?, ?)`,
    ).run("prices", 42, "ok", knownTs);

    const res = makeMockRes();
    handleVpsProxyHealth(
      makeFakeReq("/api/vps-proxy-health"),
      res as unknown as import("node:http").ServerResponse,
      db,
      FROZEN_NOW,
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data_asof: string; ok: boolean };
    expect(body.ok).toBe(true);
    expect(body.data_asof).toBe(knownTs);
    expect(ISO_8601_REGEX.test(body.data_asof)).toBe(true);
  });

  it("(b) empty table: data_asof falls back to request time (ISO 8601)", () => {
    const db = getDb();
    // vps_push_log empty — no inserts

    const res = makeMockRes();
    handleVpsProxyHealth(
      makeFakeReq("/api/vps-proxy-health"),
      res as unknown as import("node:http").ServerResponse,
      db,
      FROZEN_NOW,
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data_asof: string };
    expect(body.data_asof).toBeDefined();
    expect(ISO_8601_REGEX.test(body.data_asof)).toBe(true);
    expect(body.data_asof).toBe(FROZEN_NOW.toISOString());
  });

  it("queryVpsProxyHealthAsof returns null for empty table", () => {
    const db = getDb();
    expect(queryVpsProxyHealthAsof(db)).toBeNull();
  });

  it("queryVpsProxyHealthAsof returns MAX(pushed_at) across all services", () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO vps_push_log (service, items_count, status, pushed_at)
       VALUES (?, ?, ?, ?)`,
    ).run("prices", 10, "ok", "2026-06-27T06:00:00.000Z");
    db.prepare(
      `INSERT INTO vps_push_log (service, items_count, status, pushed_at)
       VALUES (?, ?, ?, ?)`,
    ).run("news", 5, "ok", "2026-06-27T11:30:00.000Z");

    expect(queryVpsProxyHealthAsof(db)).toBe("2026-06-27T11:30:00.000Z");
  });
});
