/**
 * TASK-FFT-L4 — Coverage-Map Freshness Checker Tests
 *
 * Anchor: FIX-L4-FRESHNESS-SLA-MONITOR-SELF-POLICING
 * Sprint: FRONTEND-FRESHNESS-TRANSPARENCY
 *
 * Test matrix:
 *   Domain service (pure — no I/O in tests):
 *     CM-1: checkCoverageMapFreshness — STATIC/GAP rows are skipped
 *     CM-2: checkCoverageMapFreshness — empty table sentinel (-1 / null MAX) → skip (EC-7)
 *     CM-3: checkCoverageMapFreshness — fresh data (age < threshold) → no breach
 *     CM-4: checkCoverageMapFreshness — stale non-STALE_RISK row → breach returned
 *     CM-5: checkCoverageMapFreshness — STALE_RISK outside market hours → NO breach (suppressed)
 *     CM-6: checkCoverageMapFreshness — STALE_RISK inside market hours → breach returned
 *     CM-7: checkCoverageMapFreshness — injectedRows override wins over rows parameter
 *     CM-8: checkCoverageMapFreshness — unmapped endpoint rows skipped
 *     CM-9: checkCoverageMapFreshness — always_fresh endpoint (quality-checklist) → no breach
 *     CM-10: FreshnessBreachReport shape: pageId, elementId, ageMinutes, maxStalenessMin, endpoint, timestamp
 *
 *   Scheduler integration (runFreshnessSlaMonitor second pass):
 *     SC-1: existing 12-signal path: breaches=0, recoveries=0, escalations=0 (additive, not modified)
 *     SC-2: coverage-map breach → postSignal called → agent_signals row with fromAgent="freshness-sla-monitor"
 *     SC-3: STALE_RISK row outside market hours → NO postSignal → NO agent_signals row
 *     SC-4: empty coverage-map injected → no extra escalations from second pass
 *
 * DDD Layer:
 *   - Domain service tests: pure — inject mock rows and in-memory DB; no fs access
 *   - Scheduler integration tests: use initDatabase() for real in-memory schema
 *
 * @module __tests__/freshness-coverage-map-checker
 */

// In-memory DB before any schema imports
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { getDb, initDatabase, closeDb } from "../infrastructure/db/schema.js";
import {
  checkCoverageMapFreshness,
  type CoverageMapRow,
  SLA_MAX_STALENESS_MIN,
} from "../domain/services/coverageMapFreshnessChecker.js";
import {
  runFreshnessSlaMonitor,
  resetSummaryGate,
  type EscalationCallback,
} from "../scheduler/system/freshnessSlaMonitorJob.js";
import type { SignalType } from "../domain/services/freshnessSlaChecker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Opens a fresh in-memory DB with all schema migrations applied. */
async function openFreshDb(): Promise<Database> {
  Bun.env["DB_PATH"] = ":memory:";
  closeDb();
  await initDatabase();
  return getDb();
}

/** Returns a UTC ISO string for N minutes ago. */
function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 1000).toISOString();
}

/** Returns a UTC ISO string for N hours ago. */
function hoursAgo(n: number): string {
  return minutesAgo(n * 60);
}

/** No-op escalation callback (Pass 1 only). */
function makeEscalateSpy(): {
  spy: EscalationCallback;
  calls: Array<{ signalType: SignalType; ageMinutes: number }>;
} {
  const calls: Array<{ signalType: SignalType; ageMinutes: number }> = [];
  const spy: EscalationCallback = async (signalType, ageMinutes) => {
    calls.push({ signalType, ageMinutes });
  };
  return { spy, calls };
}

/** No-op WORK channel sender (avoids Telegram calls). */
const noopSendWork = async (_msg: string): Promise<void> => { /* no-op */ };

/**
 * A "now" value that is definitely OUTSIDE VN market hours
 * (Saturday UTC → outside Mon-Fri 02:00-08:59 UTC window).
 */
const OUTSIDE_MARKET_HOURS = new Date("2026-04-25T12:00:00.000Z"); // Saturday

/**
 * A "now" value that is INSIDE VN market hours
 * (Wednesday 04:00 UTC = 11:00 VN time, in 02:00-08:59 UTC window).
 */
const INSIDE_MARKET_HOURS = new Date("2026-04-22T04:00:00.000Z"); // Wednesday

// ─────────────────────────────────────────────────────────────────────────────
// Domain service — creates its own minimal in-memory DB (no initDatabase needed)
// ─────────────────────────────────────────────────────────────────────────────

/** Creates a minimal in-memory DB with only the tables the domain service queries. */
function makeMinimalDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      message_type TEXT NOT NULL,
      content TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT,
      sent_by TEXT
    );
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      open REAL DEFAULT 0, high REAL DEFAULT 0,
      low REAL DEFAULT 0, close REAL DEFAULT 0,
      volume INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS vps_push_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service TEXT NOT NULL,
      items_count INTEGER DEFAULT 0,
      status TEXT,
      pushed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sample coverage-map rows for tests
// ─────────────────────────────────────────────────────────────────────────────

const LIVE_MARKET_DIGEST_ROW: CoverageMapRow = {
  page: "_index",
  elem: "market digest",
  endpoint: "/api/market-digest",
  status: "LIVE",
  sla: "daily",
  asof: "sent_at",
};

const STALE_RISK_ALERTS_ROW: CoverageMapRow = {
  page: "alerts",
  elem: "TA/BB price alerts",
  endpoint: "/api/alerts",
  status: "STALE_RISK",
  sla: "realtime",
  asof: "triggered_at",
};

const STATIC_ROW: CoverageMapRow = {
  page: "kinh-dich-reference",
  elem: "hexagram methodology",
  endpoint: null,
  status: "STATIC",
  sla: "static",
  asof: null,
};

const GAP_ROW: CoverageMapRow = {
  page: "(NEW) cheb-synthesis",
  elem: "CHEF TNB 6-layer",
  endpoint: null,
  status: "GAP",
  sla: "daily",
  asof: null,
};

const QUALITY_CHECKLIST_ROW: CoverageMapRow = {
  page: "quality-audit",
  elem: "capability checklist",
  endpoint: "/api/quality-checklist",
  status: "LIVE",
  sla: "realtime",
  asof: "request_time",
};

const UNMAPPED_ENDPOINT_ROW: CoverageMapRow = {
  page: "sector-rotation",
  elem: "sector money-flow",
  endpoint: "/api/sector-rotation",
  status: "DEPTH_THIN",
  sla: "realtime",
  asof: "tradingDate",
};

const VPS_HEALTH_ROW: CoverageMapRow = {
  page: "vps",
  elem: "VPS proxy health",
  endpoint: "/api/vps-proxy-health",
  status: "LIVE",
  sla: "realtime",
  asof: "pushed_at",
};

// ─────────────────────────────────────────────────────────────────────────────
// CM-1: STATIC and GAP rows are skipped
// ─────────────────────────────────────────────────────────────────────────────

describe("CM-1: STATIC and GAP rows are always skipped", () => {
  it("CM-1a: STATIC row → no breach", async () => {
    const db = makeMinimalDb();
    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      OUTSIDE_MARKET_HOURS,
      [STATIC_ROW]
    );
    expect(breaches).toHaveLength(0);
  });

  it("CM-1b: GAP row → no breach", async () => {
    const db = makeMinimalDb();
    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      OUTSIDE_MARKET_HOURS,
      [GAP_ROW]
    );
    expect(breaches).toHaveLength(0);
  });

  it("CM-1c: STATIC + GAP together → 0 breaches", async () => {
    const db = makeMinimalDb();
    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      OUTSIDE_MARKET_HOURS,
      [STATIC_ROW, GAP_ROW]
    );
    expect(breaches).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CM-2: Empty table sentinel — EC-7
// ─────────────────────────────────────────────────────────────────────────────

describe("CM-2: Empty table sentinel (EC-7) — skip if MAX() returns null", () => {
  it("CM-2a: market_messages empty → no breach (not seeded)", async () => {
    const db = makeMinimalDb(); // empty tables
    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      INSIDE_MARKET_HOURS,
      [LIVE_MARKET_DIGEST_ROW]
    );
    expect(breaches).toHaveLength(0);
  });

  it("CM-2b: alerts empty → no breach (not seeded)", async () => {
    const db = makeMinimalDb();
    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      INSIDE_MARKET_HOURS,
      [STALE_RISK_ALERTS_ROW]
    );
    expect(breaches).toHaveLength(0);
  });

  it("CM-2c: vps_push_log empty → no breach (not seeded)", async () => {
    const db = makeMinimalDb();
    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      INSIDE_MARKET_HOURS,
      [VPS_HEALTH_ROW]
    );
    expect(breaches).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CM-3: Fresh data — no breach
// ─────────────────────────────────────────────────────────────────────────────

describe("CM-3: Fresh data within SLA threshold → no breach", () => {
  it("CM-3a: market-digest sent 1 minute ago (daily SLA=1560min) → no breach", async () => {
    const db = makeMinimalDb();
    db.prepare(
      `INSERT INTO market_messages (from_agent, message_type, content, sent_at)
       VALUES (?, ?, ?, ?)`
    ).run("morning-briefing", "morning_briefing", "test", minutesAgo(1));

    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      new Date(), // live now
      [LIVE_MARKET_DIGEST_ROW]
    );
    expect(breaches).toHaveLength(0);
  });

  it("CM-3b: vps health pushed 5 minutes ago (realtime SLA=15min) → no breach", async () => {
    const db = makeMinimalDb();
    db.prepare(
      `INSERT INTO vps_push_log (service, items_count, status, pushed_at)
       VALUES (?, ?, ?, ?)`
    ).run("prices", 10, "ok", minutesAgo(5));

    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      new Date(),
      [VPS_HEALTH_ROW]
    );
    expect(breaches).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CM-4: Stale non-STALE_RISK row → breach
// ─────────────────────────────────────────────────────────────────────────────

describe("CM-4: Stale non-STALE_RISK row → breach returned", () => {
  it("CM-4a: market-digest 2000min old (daily SLA=1560min) → 1 breach", async () => {
    const db = makeMinimalDb();
    const staleTs = minutesAgo(2000);
    db.prepare(
      `INSERT INTO market_messages (from_agent, message_type, content, sent_at)
       VALUES (?, ?, ?, ?)`
    ).run("morning-briefing", "morning_briefing", "old", staleTs);

    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      new Date(),
      [LIVE_MARKET_DIGEST_ROW]
    );

    expect(breaches).toHaveLength(1);
    const b = breaches[0]!;
    expect(b.pageId).toBe("_index");
    expect(b.endpoint).toBe("/api/market-digest");
    expect(b.maxStalenessMin).toBe(SLA_MAX_STALENESS_MIN.daily!); // daily is non-null (1560 min)
    expect(b.ageMinutes).toBeGreaterThanOrEqual(1999);
  });

  it("CM-4b: VPS health 30min old (realtime SLA=15min) → 1 breach", async () => {
    const db = makeMinimalDb();
    db.prepare(
      `INSERT INTO vps_push_log (service, items_count, status, pushed_at)
       VALUES (?, ?, ?, ?)`
    ).run("prices", 5, "ok", minutesAgo(30));

    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      new Date(),
      [VPS_HEALTH_ROW]
    );

    expect(breaches).toHaveLength(1);
    const b = breaches[0]!;
    expect(b.pageId).toBe("vps");
    expect(b.maxStalenessMin).toBe(15); // realtime SLA
    expect(b.ageMinutes).toBeGreaterThanOrEqual(29);
  });

  it("CM-4c: DEPTH_THIN row with stale data → breach returned (DEPTH_THIN != STALE_RISK)", async () => {
    const db = makeMinimalDb();
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("VNM", "2026-04-15", 100, 110, 90, 105, 1000, hoursAgo(48));

    const depthThinRow: CoverageMapRow = {
      page: "technical",
      elem: "OHLCV candles",
      endpoint: "/api/price-history/:ticker",
      status: "DEPTH_THIN",
      sla: "intraday",
      asof: "updated_at",
    };

    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      new Date(),
      [depthThinRow]
    );

    expect(breaches).toHaveLength(1);
    expect(breaches[0]!.pageId).toBe("technical");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CM-5: STALE_RISK outside market hours → NO breach (suppressed)
// ─────────────────────────────────────────────────────────────────────────────

describe("CM-5: STALE_RISK outside market hours → breach suppressed", () => {
  it("CM-5a: alerts stale 60min (realtime SLA=15min) + off-hours → no breach", async () => {
    const db = makeMinimalDb();
    // Insert stale alert
    db.prepare(
      `INSERT INTO alerts (id, triggered_at, severity, sent_by)
       VALUES (?, ?, ?, ?)`
    ).run("al-1", minutesAgo(60), "medium", "server");

    // OUTSIDE_MARKET_HOURS = Saturday
    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      OUTSIDE_MARKET_HOURS,
      [STALE_RISK_ALERTS_ROW]
    );

    expect(breaches).toHaveLength(0);
  });

  it("CM-5b: STALE_RISK row on a weekday but after market close → no breach", async () => {
    const db = makeMinimalDb();
    db.prepare(
      `INSERT INTO alerts (id, triggered_at, severity, sent_by)
       VALUES (?, ?, ?, ?)`
    ).run("al-2", minutesAgo(90), "low", "server");

    // Wednesday at 20:00 UTC = 03:00 VN next day — after market close (outside 02:00-08:59 UTC)
    const afterMarketClose = new Date("2026-04-22T20:00:00.000Z");

    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      afterMarketClose,
      [STALE_RISK_ALERTS_ROW]
    );

    expect(breaches).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CM-6: STALE_RISK inside market hours → breach returned
// ─────────────────────────────────────────────────────────────────────────────

describe("CM-6: STALE_RISK inside market hours → breach returned", () => {
  it("CM-6a: alerts stale 60min (SLA=15min) during market hours → 1 breach", async () => {
    const db = makeMinimalDb();
    // Insert alert 60 minutes BEFORE INSIDE_MARKET_HOURS so that
    // age = 60min relative to the frozen now passed to the checker.
    const staleAlertTs = new Date(
      INSIDE_MARKET_HOURS.getTime() - 60 * 60 * 1000
    ).toISOString();
    db.prepare(
      `INSERT INTO alerts (id, triggered_at, severity, sent_by)
       VALUES (?, ?, ?, ?)`
    ).run("al-3", staleAlertTs, "high", "server");

    // INSIDE_MARKET_HOURS = Wednesday 04:00 UTC (VN market open)
    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      INSIDE_MARKET_HOURS,
      [STALE_RISK_ALERTS_ROW]
    );

    expect(breaches).toHaveLength(1);
    const b = breaches[0]!;
    expect(b.pageId).toBe("alerts");
    expect(b.endpoint).toBe("/api/alerts");
    expect(b.ageMinutes).toBeGreaterThanOrEqual(59);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CM-7: injectedRows override
// ─────────────────────────────────────────────────────────────────────────────

describe("CM-7: injectedRows parameter wins over rows argument", () => {
  it("CM-7a: rows param has stale data, injectedRows is empty → 0 breaches", async () => {
    const db = makeMinimalDb();
    db.prepare(
      `INSERT INTO market_messages (from_agent, message_type, content, sent_at)
       VALUES (?, ?, ?, ?)`
    ).run("morning-briefing", "morning_briefing", "old", minutesAgo(5000));

    const breaches = await checkCoverageMapFreshness(
      [LIVE_MARKET_DIGEST_ROW], // rows param — has stale data in DB
      db,
      new Date(),
      [] // injectedRows = empty → overrides; nothing to check
    );

    expect(breaches).toHaveLength(0);
  });

  it("CM-7b: rows param is empty, injectedRows has stale LIVE row → 1 breach", async () => {
    const db = makeMinimalDb();
    db.prepare(
      `INSERT INTO market_messages (from_agent, message_type, content, sent_at)
       VALUES (?, ?, ?, ?)`
    ).run("morning-briefing", "morning_briefing", "old", minutesAgo(2000));

    const breaches = await checkCoverageMapFreshness(
      [], // rows param is empty
      db,
      new Date(),
      [LIVE_MARKET_DIGEST_ROW] // injectedRows drives the check
    );

    expect(breaches).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CM-8: Unmapped endpoint rows are skipped
// ─────────────────────────────────────────────────────────────────────────────

describe("CM-8: Unmapped endpoint rows are skipped silently", () => {
  it("CM-8a: /api/sector-rotation has no mapping → no breach even if DB is empty", async () => {
    const db = makeMinimalDb();
    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      new Date(),
      [UNMAPPED_ENDPOINT_ROW]
    );
    expect(breaches).toHaveLength(0);
  });

  it("CM-8b: null endpoint → skipped", async () => {
    const db = makeMinimalDb();
    const noEndpointRow: CoverageMapRow = {
      page: "orchestration",
      elem: "orch state",
      endpoint: null,
      status: "LIVE",
      sla: "event",
    };
    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      new Date(),
      [noEndpointRow]
    );
    expect(breaches).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CM-9: always_fresh endpoint (quality-checklist) — no breach
// ─────────────────────────────────────────────────────────────────────────────

describe("CM-9: always_fresh endpoint (quality-checklist) → never breaches", () => {
  it("CM-9a: quality-checklist with realtime SLA → no breach (computed-on-read age=0)", async () => {
    const db = makeMinimalDb();
    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      new Date(),
      [QUALITY_CHECKLIST_ROW]
    );
    expect(breaches).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CM-10: FreshnessBreachReport shape
// ─────────────────────────────────────────────────────────────────────────────

describe("CM-10: FreshnessBreachReport shape is complete", () => {
  it("CM-10a: breach report has all required fields with correct types", async () => {
    const db = makeMinimalDb();
    const staleTs = minutesAgo(2000);
    db.prepare(
      `INSERT INTO market_messages (from_agent, message_type, content, sent_at)
       VALUES (?, ?, ?, ?)`
    ).run("morning-briefing", "morning_briefing", "old", staleTs);

    const now = new Date();
    const breaches = await checkCoverageMapFreshness(
      [],
      db,
      now,
      [LIVE_MARKET_DIGEST_ROW]
    );

    expect(breaches).toHaveLength(1);
    const b = breaches[0]!;

    // All required fields present with correct types
    expect(typeof b.pageId).toBe("string");
    expect(typeof b.elementId).toBe("string");
    expect(typeof b.ageMinutes).toBe("number");
    expect(typeof b.maxStalenessMin).toBe("number");
    expect(typeof b.endpoint).toBe("string");
    expect(typeof b.timestamp).toBe("string");

    // Correct values
    expect(b.pageId).toBe("_index");
    expect(b.elementId).toBe("market digest");
    expect(b.maxStalenessMin).toBe(1560); // daily SLA
    expect(b.endpoint).toBe("/api/market-digest");
    expect(b.timestamp).toBe(now.toISOString());
  });

  it("CM-10b: elementId falls back to page when elem is missing", async () => {
    const db = makeMinimalDb();
    db.prepare(
      `INSERT INTO market_messages (from_agent, message_type, content, sent_at)
       VALUES (?, ?, ?, ?)`
    ).run("morning-briefing", "morning_briefing", "old", minutesAgo(2000));

    const rowNoElem: CoverageMapRow = {
      page: "_index",
      endpoint: "/api/market-digest",
      status: "LIVE",
      sla: "daily",
      // no elem field
    };

    const breaches = await checkCoverageMapFreshness([], db, new Date(), [rowNoElem]);
    expect(breaches).toHaveLength(1);
    expect(breaches[0]!.elementId).toBe("_index"); // fallback to page
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SC-1: Existing 12-signal path — additive; not modified
// ─────────────────────────────────────────────────────────────────────────────

describe("SC-1: Existing 12-signal path: additive only (not modified)", () => {
  let db: Database;

  beforeEach(async () => {
    db = await openFreshDb();
    resetSummaryGate();
  });

  afterEach(() => {
    closeDb();
  });

  it("SC-1a: with empty injectedCoverageMapRows and fresh 12-signal ages → breaches=0, recoveries=0, escalations=0", async () => {
    const { spy, calls } = makeEscalateSpy();

    // Pass fresh signal ages for all 12 signals (no breach)
    const freshAges: Record<string, number> = {
      price: 5,
      bctc: 30,
      news: 10,
      sbv_fx: 15,
      foreign_flow: 5,
      vnstock_fundamentals: -1,
      bond_maturity: -1,
      commodity_prices: -1,
      broker_sanctions: -1,
      backtest_runs: -1,
      signal_quality_audit: -1,
      prediction_claims: -1,
    };

    const result = await runFreshnessSlaMonitor(
      db,
      spy,
      freshAges as Record<import("../domain/services/freshnessSlaChecker.js").SignalType, number>,
      new Date(),
      noopSendWork,
      [] // empty injected coverage-map rows → second pass finds nothing
    );

    // Existing path: no breaches (fresh ages)
    expect(result.breaches).toBe(0);
    expect(result.recoveries).toBe(0);
    // escalations could be 0 from first pass; second pass empty → still 0
    expect(calls).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SC-2: Coverage-map breach → postSignal called
// ─────────────────────────────────────────────────────────────────────────────

describe("SC-2: Coverage-map breach → agent_signals row created", () => {
  let db: Database;

  beforeEach(async () => {
    db = await openFreshDb();
    resetSummaryGate();
  });

  afterEach(() => {
    closeDb();
  });

  it("SC-2a: stale vps_push_log + VPS row injected → agent_signals row with fromAgent='freshness-sla-monitor'", async () => {
    // Seed stale VPS push log (30min old vs realtime SLA=15min)
    db.prepare(
      `INSERT INTO vps_push_log (service, items_count, status, pushed_at)
       VALUES (?, ?, ?, ?)`
    ).run("prices", 10, "ok", minutesAgo(30));

    const { spy } = makeEscalateSpy();

    // Fresh signal ages so Pass 1 produces no escalations
    const freshAges: Record<string, number> = {
      price: 5, bctc: 30, news: 10, sbv_fx: 15, foreign_flow: 5,
      vnstock_fundamentals: -1, bond_maturity: -1, commodity_prices: -1,
      broker_sanctions: -1, backtest_runs: -1, signal_quality_audit: -1, prediction_claims: -1,
    };

    await runFreshnessSlaMonitor(
      db,
      spy,
      freshAges as Record<SignalType, number>,
      new Date(), // not market-hours-specific; VPS_HEALTH_ROW is LIVE (not STALE_RISK)
      noopSendWork,
      [VPS_HEALTH_ROW]
    );

    // Verify agent_signals row was inserted
    interface SignalRow {
      from_agent: string;
      to_agent: string;
      signal_type: string;
      payload: string;
    }
    const signalRows = db
      .query<SignalRow, []>(
        `SELECT from_agent, to_agent, signal_type, payload
         FROM agent_signals
         WHERE from_agent = 'freshness-sla-monitor'`
      )
      .all();

    expect(signalRows.length).toBeGreaterThanOrEqual(1);
    const row = signalRows[0]!;
    expect(row.from_agent).toBe("freshness-sla-monitor");
    expect(row.to_agent).toBe("alert-commander");
    expect(row.signal_type).toBe("urgent_news");

    const payload = JSON.parse(row.payload) as { title: string; endpoint: string };
    expect(payload.title).toContain("SLA BREACH");
    expect(payload.endpoint).toBe("/api/vps-proxy-health");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SC-3: STALE_RISK outside market hours → NO escalation
// ─────────────────────────────────────────────────────────────────────────────

describe("SC-3: STALE_RISK row outside market hours → NO postSignal", () => {
  let db: Database;

  beforeEach(async () => {
    db = await openFreshDb();
    resetSummaryGate();
  });

  afterEach(() => {
    closeDb();
  });

  it("SC-3a: stale alerts (60min old) injected on Saturday → no agent_signals row", async () => {
    // Seed stale alert
    db.prepare(
      `INSERT INTO alerts (id, triggered_at, severity, sent_by)
       VALUES (?, ?, ?, ?)`
    ).run("al-test-1", minutesAgo(60), "medium", "server");

    const { spy } = makeEscalateSpy();
    const freshAges: Record<string, number> = {
      price: 5, bctc: 30, news: 10, sbv_fx: 15, foreign_flow: 5,
      vnstock_fundamentals: -1, bond_maturity: -1, commodity_prices: -1,
      broker_sanctions: -1, backtest_runs: -1, signal_quality_audit: -1, prediction_claims: -1,
    };

    // OUTSIDE_MARKET_HOURS = Saturday → suppression kicks in
    await runFreshnessSlaMonitor(
      db,
      spy,
      freshAges as Record<SignalType, number>,
      OUTSIDE_MARKET_HOURS,
      noopSendWork,
      [STALE_RISK_ALERTS_ROW]
    );

    interface SignalRow { from_agent: string }
    const signalRows = db
      .query<SignalRow, []>(
        `SELECT from_agent FROM agent_signals WHERE from_agent = 'freshness-sla-monitor'`
      )
      .all();

    // No escalation: STALE_RISK outside market hours is suppressed
    expect(signalRows).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SC-4: Empty injected rows → no extra escalations
// ─────────────────────────────────────────────────────────────────────────────

describe("SC-4: Empty injectedCoverageMapRows → second pass is a no-op", () => {
  let db: Database;

  beforeEach(async () => {
    db = await openFreshDb();
    resetSummaryGate();
  });

  afterEach(() => {
    closeDb();
  });

  it("SC-4a: empty injected rows + fresh Pass 1 → escalations unchanged", async () => {
    const { spy, calls } = makeEscalateSpy();
    const freshAges: Record<string, number> = {
      price: 5, bctc: 30, news: 10, sbv_fx: 15, foreign_flow: 5,
      vnstock_fundamentals: -1, bond_maturity: -1, commodity_prices: -1,
      broker_sanctions: -1, backtest_runs: -1, signal_quality_audit: -1, prediction_claims: -1,
    };

    const result = await runFreshnessSlaMonitor(
      db,
      spy,
      freshAges as Record<SignalType, number>,
      new Date(),
      noopSendWork,
      [] // empty coverage map rows
    );

    expect(result.breaches).toBe(0);
    expect(calls).toHaveLength(0);

    interface SignalRow { id: number }
    const signalRows = db.query<SignalRow, []>("SELECT id FROM agent_signals").all();
    expect(signalRows).toHaveLength(0);
  });
});
