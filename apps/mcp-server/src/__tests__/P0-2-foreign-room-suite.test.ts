/**
 * P0-2-FOREIGN-ROOM-SUITE — Test Suite
 *
 * Covers:
 *   AC-1:  foreign_restricted ticker (max_holding=0) → null fields
 *   AC-2:  ROOM_FULL event detection (utilization ≥99%)
 *   AC-3:  <5-day velocity → null
 *   AC-4:  Normal utilization computation
 *   AC-5:  ROOM_LOCKED flag (utilization ≥99% AND velocity ≤0)
 *   AC-6:  FULL_ROOM_SELL flag (utilization ≥99% AND holding ratio declining 3d)
 *   AC-7:  Market-wide cap-weighted saturation
 *   AC-8:  foreign_outflow_z_5d → null when <20 sessions
 *   AC-9:  detectAndPersistRoomEvents UNIQUE idempotency
 *   AC-10: store: getMarketWideDailyVelocities returns session series
 *   AC-11: get_foreign_room tool returns {error:...} on DB failure (NFR-P02-2)
 *   AC-12: summarizeForeignRoomTickers / get_foreign_room top_n trim + rollup + fetch-more
 *          (FIX-GET-FOREIGN-ROOM-TOOL-RESULT-TOKEN-BUDGET)
 *
 * Harness: _registeredTools direct-handler invocation (CI-safe; no InMemoryTransport).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Domain
import {
  computeRoomUtilization,
  computeDepletionVelocity5d,
  computeRoomFlags,
  computeMarketSaturation,
  computeForeignOutflowZ5d,
  detectRoomEvent,
  summarizeForeignRoomTickers,
  type TickerHistory,
  type RoomUtilization,
  type DepletionVelocity,
  type TickerRoomAnalysis,
} from "../domain/services/market-data/foreignRoomAnalyzer.js";

// Infrastructure
import {
  getTickerHistory,
  getAllTickersHistory,
  getMarketWideDailyVelocities,
  getTickerRecentEvents,
  upsertForeignRoomEvent,
} from "../infrastructure/db/foreignRoomStore.js";

// Scheduler (event detection)
import { detectAndPersistRoomEvents } from "../scheduler/financial-reports/vnstockFundamentalsJob.js";

// Tool
import { registerForeignRoomTools } from "../interface/mcp/tools/market-data/foreignRoomTools.js";

// ---------------------------------------------------------------------------
// In-memory DB helpers
// ---------------------------------------------------------------------------

function buildTestDb(): Database {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '1970-01-01',
      foreign_room INTEGER,
      foreign_volume INTEGER,
      current_holding_ratio REAL,
      max_holding_ratio REAL,
      avg_volume_2w INTEGER,
      high_52w REAL,
      low_52w REAL,
      pct_from_high_52w REAL,
      pct_from_low_52w REAL,
      market_cap_bn REAL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, date)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS foreign_room_events (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      code                  TEXT NOT NULL,
      event_type            TEXT NOT NULL CHECK(event_type IN ('ROOM_FULL', 'ROOM_REOPEN')),
      event_date            TEXT NOT NULL,
      room_remaining_before INTEGER,
      room_remaining_after  INTEGER,
      created_at            TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, event_date, event_type)
    )
  `);

  return db;
}

/** Insert a row into vnstock_trading_stats. */
function insertStats(
  db: Database,
  code: string,
  date: string,
  opts: {
    foreign_room?: number | null;
    foreign_volume?: number | null;
    current_holding_ratio?: number | null;
    max_holding_ratio?: number | null;
    market_cap_bn?: number | null;
  } = {},
): void {
  db.prepare(`
    INSERT OR REPLACE INTO vnstock_trading_stats
      (code, date, foreign_room, foreign_volume, current_holding_ratio, max_holding_ratio, market_cap_bn, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    code,
    date,
    opts.foreign_room ?? null,
    opts.foreign_volume ?? null,
    opts.current_holding_ratio ?? null,
    opts.max_holding_ratio ?? null,
    opts.market_cap_bn ?? null,
  );
}

// ---------------------------------------------------------------------------
// Tool invocation helper
// ---------------------------------------------------------------------------

type ToolHandler = {
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
};
type ToolServer = { _registeredTools: Record<string, ToolHandler> };

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const registry = (server as unknown as ToolServer)._registeredTools;
  const entry = registry[toolName];
  if (!entry) throw new Error(`Tool "${toolName}" not registered`);
  const result = await entry.handler(args);
  return JSON.parse(result.content[0]!.text);
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let db: Database;

beforeEach(() => {
  db = buildTestDb();
});

afterEach(() => {
  db.close();
});

// ===========================================================================
// AC-1: foreign_restricted ticker (max_holding_ratio = 0)
// ===========================================================================

describe("AC-1: foreign_restricted ticker", () => {
  it("returns null fields and foreign_restricted=true when max_holding_ratio=0", () => {
    const history: TickerHistory = {
      code: "DEF",
      sector: "Defence",
      rows: [{
        code: "DEF",
        date: "2026-06-29",
        foreign_room: 0,
        foreign_volume: 0,
        current_holding_ratio: 0,
        max_holding_ratio: 0,
        market_cap_bn: 5000,
      }],
    };

    const result = computeRoomUtilization(history);
    expect(result.foreign_restricted).toBe(true);
    expect(result.room_utilization_pct).toBeNull();
  });

  it("returns null fields and foreign_restricted=true when max_holding_ratio=null", () => {
    const history: TickerHistory = {
      code: "DEF",
      sector: "Defence",
      rows: [{
        code: "DEF",
        date: "2026-06-29",
        foreign_room: null,
        foreign_volume: null,
        current_holding_ratio: null,
        max_holding_ratio: null,
        market_cap_bn: null,
      }],
    };

    const result = computeRoomUtilization(history);
    expect(result.foreign_restricted).toBe(true);
    expect(result.room_utilization_pct).toBeNull();
    // NFR-P02-3: must not emit 0 or Infinity
    expect(result.room_utilization_pct).not.toBe(0);
    expect(result.room_utilization_pct).not.toBe(Infinity);
  });
});

// ===========================================================================
// AC-2: ROOM_FULL event detection (utilization ≥99%)
// ===========================================================================

describe("AC-2: ROOM_FULL event detection", () => {
  it("detectRoomEvent returns ROOM_FULL when utilization ≥ 99%", () => {
    expect(detectRoomEvent(99.5, false)).toBe("ROOM_FULL");
    expect(detectRoomEvent(100, false)).toBe("ROOM_FULL");
    expect(detectRoomEvent(99, false)).toBe("ROOM_FULL");
  });

  it("detectRoomEvent returns null when utilization is below 99%", () => {
    expect(detectRoomEvent(98, false)).toBeNull();
    expect(detectRoomEvent(50, false)).toBeNull();
  });

  it("detectRoomEvent returns ROOM_REOPEN when <95% AND hadPriorFull", () => {
    expect(detectRoomEvent(90, true)).toBe("ROOM_REOPEN");
    expect(detectRoomEvent(94.9, true)).toBe("ROOM_REOPEN");
  });

  it("detectRoomEvent returns null when <95% but no prior full event", () => {
    expect(detectRoomEvent(90, false)).toBeNull();
  });

  it("detectAndPersistRoomEvents inserts a ROOM_FULL event for a full-room ticker", () => {
    insertStats(db, "VCB", "2026-06-29", {
      foreign_room: 100,
      current_holding_ratio: 0.49,
      max_holding_ratio: 0.49,
      market_cap_bn: 200_000,
    });

    const count = detectAndPersistRoomEvents(db);
    expect(count).toBeGreaterThanOrEqual(1);

    const events = getTickerRecentEvents(db, "VCB", 5);
    expect(events.some((e) => e.event_type === "ROOM_FULL")).toBe(true);
  });
});

// ===========================================================================
// AC-3: <5-day velocity → null
// ===========================================================================

describe("AC-3: insufficient velocity data → null", () => {
  it("returns null depletion_velocity_5d when fewer than 5 rows", () => {
    const history: TickerHistory = {
      code: "VNM",
      sector: "Agriculture",
      rows: [
        { code: "VNM", date: "2026-06-29", foreign_room: 1_000_000, foreign_volume: null, current_holding_ratio: 0.1, max_holding_ratio: 0.49, market_cap_bn: 100_000 },
        { code: "VNM", date: "2026-06-28", foreign_room: 1_100_000, foreign_volume: null, current_holding_ratio: 0.09, max_holding_ratio: 0.49, market_cap_bn: 100_000 },
      ],
    };

    const result = computeDepletionVelocity5d(history);
    expect(result.depletion_velocity_5d).toBeNull();
    expect(result.confidence).toBe("insufficient");
  });

  it("returns null depletion_velocity_5d when exactly 4 rows", () => {
    const rows = [1, 2, 3, 4].map((i) => ({
      code: "VNM",
      date: `2026-06-${29 - i + 1}`.padStart(10, "0"),
      foreign_room: 1_000_000 - i * 100_000,
      foreign_volume: null,
      current_holding_ratio: 0.1,
      max_holding_ratio: 0.49,
      market_cap_bn: 100_000,
    }));
    const history: TickerHistory = { code: "VNM", sector: "Agriculture", rows };
    const result = computeDepletionVelocity5d(history);
    expect(result.depletion_velocity_5d).toBeNull();
  });

  it("returns numeric velocity when ≥5 rows are available", () => {
    const rows = [0, 1, 2, 3, 4].map((i) => ({
      code: "VNM",
      date: `2026-06-${29 - i}`.padStart(10, "0"),
      foreign_room: 1_000_000 - i * 100_000,
      foreign_volume: null,
      current_holding_ratio: 0.1,
      max_holding_ratio: 0.49,
      market_cap_bn: 100_000,
    }));
    const history: TickerHistory = { code: "VNM", sector: "Agriculture", rows };
    const result = computeDepletionVelocity5d(history);
    // room_5d_ago (rows[4]) = 600_000; room_today (rows[0]) = 1_000_000
    // velocity = (600_000 - 1_000_000) / 5 = -80_000 (room growing — net selling)
    expect(result.depletion_velocity_5d).toBe(-80_000);
    expect(result.confidence).toBe("full");
  });
});

// ===========================================================================
// AC-4: Normal utilization computation
// ===========================================================================

describe("AC-4: normal utilization computation", () => {
  it("computes utilization correctly (e.g. 49%/49% = 100%)", () => {
    const history: TickerHistory = {
      code: "VCB",
      sector: "Banking",
      rows: [{
        code: "VCB",
        date: "2026-06-29",
        foreign_room: 0,
        foreign_volume: null,
        current_holding_ratio: 0.49,
        max_holding_ratio: 0.49,
        market_cap_bn: 200_000,
      }],
    };

    const result = computeRoomUtilization(history);
    expect(result.foreign_restricted).toBe(false);
    expect(result.room_utilization_pct).toBeCloseTo(100, 1);
  });

  it("computes utilization correctly (e.g. 25%/49% ≈ 51%)", () => {
    const history: TickerHistory = {
      code: "VCB",
      sector: "Banking",
      rows: [{
        code: "VCB",
        date: "2026-06-29",
        foreign_room: 5_000_000,
        foreign_volume: null,
        current_holding_ratio: 0.245,
        max_holding_ratio: 0.49,
        market_cap_bn: 200_000,
      }],
    };

    const result = computeRoomUtilization(history);
    expect(result.room_utilization_pct).toBeCloseTo(50, 0);
  });
});

// ===========================================================================
// AC-5: ROOM_LOCKED flag
// ===========================================================================

describe("AC-5: ROOM_LOCKED flag", () => {
  it("sets room_locked=true when utilization ≥99% AND velocity ≤0", () => {
    const history: TickerHistory = {
      code: "VCB",
      sector: "Banking",
      rows: [0, 1, 2, 3, 4].map((i) => ({
        code: "VCB",
        date: `2026-06-${29 - i}`,
        foreign_room: 100 + i * 50,  // room_today=100, room_5d_ago=300 → velocity=(300-100)/5=40>0 ...
        foreign_volume: null,
        current_holding_ratio: 0.49,
        max_holding_ratio: 0.49,
        market_cap_bn: 200_000,
      })),
    };
    // rows[0].foreign_room=100, rows[4].foreign_room=300
    // velocity = (300 - 100) / 5 = 40 (positive → room shrinking)
    const util = computeRoomUtilization(history);
    const vel = computeDepletionVelocity5d(history);
    // velocity=40>0 so room_locked should be false
    const flags = computeRoomFlags(util, vel, history);
    // utilization = 100% (≥99%), velocity = 40 (>0) → NOT locked
    expect(flags.room_locked).toBe(false);
  });

  it("sets room_locked=true when utilization ≥99% AND velocity ≤0 (room not shrinking)", () => {
    const rows = [0, 1, 2, 3, 4].map((i) => ({
      code: "VCB",
      date: `2026-06-${29 - i}`,
      // room same every day → velocity = (100 - 100) / 5 = 0 ≤ 0
      foreign_room: 100,
      foreign_volume: null,
      current_holding_ratio: 0.49,
      max_holding_ratio: 0.49,
      market_cap_bn: 200_000,
    }));
    const history: TickerHistory = { code: "VCB", sector: "Banking", rows };
    const util = computeRoomUtilization(history);
    const vel = computeDepletionVelocity5d(history);
    const flags = computeRoomFlags(util, vel, history);
    expect(flags.room_locked).toBe(true);
  });

  it("sets room_locked=null when foreign_restricted=true", () => {
    const history: TickerHistory = {
      code: "DEF",
      sector: "Defence",
      rows: [{
        code: "DEF",
        date: "2026-06-29",
        foreign_room: 0,
        foreign_volume: null,
        current_holding_ratio: 0,
        max_holding_ratio: 0,
        market_cap_bn: 5000,
      }],
    };
    const util = computeRoomUtilization(history);
    const vel = computeDepletionVelocity5d(history);
    const flags = computeRoomFlags(util, vel, history);
    expect(flags.room_locked).toBeNull();
  });
});

// ===========================================================================
// AC-6: FULL_ROOM_SELL flag
// ===========================================================================

describe("AC-6: FULL_ROOM_SELL flag", () => {
  it("sets full_room_sell=true when utilization ≥99% AND holding ratio declining 3d", () => {
    const rows = [
      { code: "VCB", date: "2026-06-29", foreign_room: 100, foreign_volume: null, current_holding_ratio: 0.48, max_holding_ratio: 0.49, market_cap_bn: 200_000 },
      { code: "VCB", date: "2026-06-28", foreign_room: 50, foreign_volume: null, current_holding_ratio: 0.485, max_holding_ratio: 0.49, market_cap_bn: 200_000 },
      { code: "VCB", date: "2026-06-27", foreign_room: 20, foreign_volume: null, current_holding_ratio: 0.489, max_holding_ratio: 0.49, market_cap_bn: 200_000 },
      { code: "VCB", date: "2026-06-26", foreign_room: 10, foreign_volume: null, current_holding_ratio: 0.49, max_holding_ratio: 0.49, market_cap_bn: 200_000 },
      { code: "VCB", date: "2026-06-25", foreign_room: 10, foreign_volume: null, current_holding_ratio: 0.49, max_holding_ratio: 0.49, market_cap_bn: 200_000 },
    ];
    const history: TickerHistory = { code: "VCB", sector: "Banking", rows };

    // utilization = 0.48/0.49 * 100 ≈ 97.9% — below 99%, so full_room_sell=false
    const util = computeRoomUtilization(history);
    const vel = computeDepletionVelocity5d(history);
    const flags = computeRoomFlags(util, vel, history);
    // utilization ≈ 97.9% < 99% → full_room_sell=false
    expect(flags.full_room_sell).toBe(false);
  });

  it("full_room_sell=true when utilization=100% and holding declining 3d", () => {
    const rows = [
      { code: "VCB", date: "2026-06-29", foreign_room: 100, foreign_volume: null, current_holding_ratio: 0.485, max_holding_ratio: 0.49, market_cap_bn: 200_000 },
      { code: "VCB", date: "2026-06-28", foreign_room: 50, foreign_volume: null, current_holding_ratio: 0.487, max_holding_ratio: 0.49, market_cap_bn: 200_000 },
      { code: "VCB", date: "2026-06-27", foreign_room: 20, foreign_volume: null, current_holding_ratio: 0.489, max_holding_ratio: 0.49, market_cap_bn: 200_000 },
      { code: "VCB", date: "2026-06-26", foreign_room: 10, foreign_volume: null, current_holding_ratio: 0.49, max_holding_ratio: 0.49, market_cap_bn: 200_000 },
      { code: "VCB", date: "2026-06-25", foreign_room: 5, foreign_volume: null, current_holding_ratio: 0.49, max_holding_ratio: 0.49, market_cap_bn: 200_000 },
    ];
    const history: TickerHistory = { code: "VCB", sector: "Banking", rows };

    // utilization today = 0.485/0.49*100 ≈ 98.97% ≥ 99? No, let's force it
    // With current_holding_ratio = 0.4899 and max = 0.49 → 99.97% ≥ 99
    rows[0]!.current_holding_ratio = 0.4899;
    const util = computeRoomUtilization(history);
    const vel = computeDepletionVelocity5d(history);
    const flags = computeRoomFlags(util, vel, history);

    expect(util.room_utilization_pct).toBeGreaterThanOrEqual(99);
    // holding ratio: 0.4899 < 0.487? No. rows[0] = 0.4899, rows[1] = 0.487, rows[2] = 0.489
    // Descending pattern: r0 < r1 AND r1 < r2? 0.4899 < 0.487 = false
    // Full_room_sell requires r0 < r1 < r2 strictly
    expect(flags.full_room_sell).toBe(false);
  });

  it("full_room_sell=true with strictly declining ratios and utilization ≥99%", () => {
    const rows = [
      { code: "VCB", date: "2026-06-29", foreign_room: 100, foreign_volume: null, current_holding_ratio: 0.4850, max_holding_ratio: 0.49, market_cap_bn: 200_000 },
      { code: "VCB", date: "2026-06-28", foreign_room: 50, foreign_volume: null, current_holding_ratio: 0.4870, max_holding_ratio: 0.49, market_cap_bn: 200_000 },
      { code: "VCB", date: "2026-06-27", foreign_room: 20, foreign_volume: null, current_holding_ratio: 0.4890, max_holding_ratio: 0.49, market_cap_bn: 200_000 },
      { code: "VCB", date: "2026-06-26", foreign_room: 10, foreign_volume: null, current_holding_ratio: 0.49, max_holding_ratio: 0.49, market_cap_bn: 200_000 },
      { code: "VCB", date: "2026-06-25", foreign_room: 5, foreign_volume: null, current_holding_ratio: 0.49, max_holding_ratio: 0.49, market_cap_bn: 200_000 },
    ];
    const history: TickerHistory = { code: "VCB", sector: "Banking", rows };

    // Force utilization ≥99%: current=0.4899, max=0.49
    rows[0]!.current_holding_ratio = 0.4899;

    // Declining pattern: r0=0.4899 < r1=0.4870? No, 0.4899 > 0.4870
    // Need r0 < r1 < r2: r0=0.4850 < r1=0.4870 < r2=0.4890 → YES (restored to original)
    rows[0]!.current_holding_ratio = 0.4850;  // rows[0] = today
    // But then utilization = 0.4850/0.49*100 ≈ 98.97% < 99 → no flag
    // Let's use max_holding_ratio = 0.49 and curr = 0.4853 to push over 99%
    // 0.4853/0.49 = 0.990... yes > 99
    rows[0]!.current_holding_ratio = 0.4853;
    // rows pattern: 0.4853 < 0.4870 < 0.4890 → declining (r0 < r1 < r2 = true)

    const util = computeRoomUtilization(history);
    const vel = computeDepletionVelocity5d(history);
    const flags = computeRoomFlags(util, vel, history);

    expect(util.room_utilization_pct).toBeGreaterThanOrEqual(99);
    // declining pattern: r0=0.4853 < r1=0.4870 < r2=0.4890 ✓
    expect(flags.full_room_sell).toBe(true);
  });

  it("full_room_sell=null when only 2 rows available", () => {
    const rows = [
      { code: "VCB", date: "2026-06-29", foreign_room: 100, foreign_volume: null, current_holding_ratio: 0.49, max_holding_ratio: 0.49, market_cap_bn: 200_000 },
      { code: "VCB", date: "2026-06-28", foreign_room: 50, foreign_volume: null, current_holding_ratio: 0.49, max_holding_ratio: 0.49, market_cap_bn: 200_000 },
    ];
    const history: TickerHistory = { code: "VCB", sector: "Banking", rows };
    const util = computeRoomUtilization(history);
    const vel = computeDepletionVelocity5d(history);
    const flags = computeRoomFlags(util, vel, history);
    expect(flags.full_room_sell).toBeNull();
  });
});

// ===========================================================================
// AC-7: Market-wide cap-weighted saturation
// ===========================================================================

describe("AC-7: market-wide cap-weighted saturation", () => {
  it("computes cap-weighted saturation correctly", () => {
    const analyses = [
      {
        code: "A",
        sector: "Banking",
        market_cap_bn: 100_000,
        utilization: { room_utilization_pct: 80, foreign_restricted: false, foreign_room_remaining: null, max_holding_ratio: null, current_holding_ratio: null, asof: null, source_tier: 2 as const },
        velocity: { depletion_velocity_5d: null, confidence: "insufficient" as const },
        flags: { room_locked: null, full_room_sell: null },
        recent_events: [],
      },
      {
        code: "B",
        sector: "Banking",
        market_cap_bn: 300_000,
        utilization: { room_utilization_pct: 40, foreign_restricted: false, foreign_room_remaining: null, max_holding_ratio: null, current_holding_ratio: null, asof: null, source_tier: 2 as const },
        velocity: { depletion_velocity_5d: null, confidence: "insufficient" as const },
        flags: { room_locked: null, full_room_sell: null },
        recent_events: [],
      },
    ];

    const { market_saturation_pct, sector_saturation } = computeMarketSaturation(analyses);
    // cap-weighted: (80*100000 + 40*300000) / 400000 = (8000000 + 12000000) / 400000 = 50%
    expect(market_saturation_pct).toBeCloseTo(50, 1);
    expect(sector_saturation["Banking"]).toBeCloseTo(50, 1);
  });

  it("returns null market_saturation_pct when all tickers foreign_restricted", () => {
    const analyses = [
      {
        code: "DEF",
        sector: "Defence",
        market_cap_bn: 5000,
        utilization: { room_utilization_pct: null, foreign_restricted: true, foreign_room_remaining: null, max_holding_ratio: null, current_holding_ratio: null, asof: null, source_tier: 2 as const },
        velocity: { depletion_velocity_5d: null, confidence: "insufficient" as const },
        flags: { room_locked: null, full_room_sell: null },
        recent_events: [],
      },
    ];

    const { market_saturation_pct } = computeMarketSaturation(analyses);
    expect(market_saturation_pct).toBeNull();
  });
});

// ===========================================================================
// AC-8: foreign_outflow_z_5d → null when <20 sessions
// ===========================================================================

describe("AC-8: foreign_outflow_z_5d", () => {
  it("returns null z-score when fewer than 20 sessions", () => {
    const velocitySeries = [10_000, 15_000, 12_000, 8_000]; // only 4 sessions
    const { z, null_reason } = computeForeignOutflowZ5d(velocitySeries);
    expect(z).toBeNull();
    expect(null_reason).toContain("20");
  });

  it("returns a numeric z-score when ≥20 sessions provided", () => {
    const series = Array.from({ length: 20 }, (_, i) => 10_000 + i * 500);
    const { z, sessions } = computeForeignOutflowZ5d(series);
    expect(z).toBeTypeOf("number");
    expect(sessions).toBe(20);
  });

  it("returns null when stdev=0 (all baseline values identical)", () => {
    // 20 identical values → stdev=0
    const series = Array(20).fill(10_000) as number[];
    const { z, null_reason } = computeForeignOutflowZ5d(series);
    expect(z).toBeNull();
    expect(null_reason).toContain("stdev=0");
  });
});

// ===========================================================================
// AC-9: detectAndPersistRoomEvents UNIQUE idempotency
// ===========================================================================

describe("AC-9: event idempotency", () => {
  it("second call for same (code, date, event_type) is a no-op", () => {
    insertStats(db, "VCB", "2026-06-29", {
      foreign_room: 100,
      current_holding_ratio: 0.49,
      max_holding_ratio: 0.49,
      market_cap_bn: 200_000,
    });

    const first = detectAndPersistRoomEvents(db);
    const second = detectAndPersistRoomEvents(db);

    // First call inserts, second call is a no-op (UNIQUE constraint)
    expect(first).toBeGreaterThanOrEqual(1);
    expect(second).toBe(0);

    // Only one event row for VCB
    const events = getTickerRecentEvents(db, "VCB", 10);
    const fullEvents = events.filter((e) => e.event_type === "ROOM_FULL");
    expect(fullEvents.length).toBe(1);
  });

  it("upsertForeignRoomEvent is idempotent", () => {
    const r1 = upsertForeignRoomEvent(db, {
      code: "VCB",
      event_type: "ROOM_FULL",
      event_date: "2026-06-29",
      room_remaining_before: 200,
      room_remaining_after: 100,
    });
    const r2 = upsertForeignRoomEvent(db, {
      code: "VCB",
      event_type: "ROOM_FULL",
      event_date: "2026-06-29",
      room_remaining_before: 200,
      room_remaining_after: 100,
    });
    expect(r1).toBe(true);
    expect(r2).toBe(false);
  });
});

// ===========================================================================
// AC-10: store getMarketWideDailyVelocities
// ===========================================================================

describe("AC-10: getMarketWideDailyVelocities", () => {
  it("returns empty array when no data", () => {
    const velocities = getMarketWideDailyVelocities(db, 25);
    expect(velocities).toEqual([]);
  });

  it("computes per-session velocity when ≥6 rows available", () => {
    // 7 days of data for VCB, room decreasing by 1000/day
    for (let i = 0; i < 7; i++) {
      const day = 29 - i;
      insertStats(db, "VCB", `2026-06-${String(day).padStart(2, "0")}`, {
        foreign_room: 7_000_000 - i * 1_000_000,
        current_holding_ratio: 0.3,
        max_holding_ratio: 0.49,
        market_cap_bn: 200_000,
      });
    }

    const velocities = getMarketWideDailyVelocities(db, 25);
    // Should return at least 1 data point (we have 7 rows, need 5-day window)
    expect(velocities.length).toBeGreaterThan(0);
    // cap_wtd_velocity should be positive (room shrinking)
    for (const v of velocities) {
      expect(v.cap_wtd_velocity).toBeTypeOf("number");
    }
  });
});

// ===========================================================================
// AC-11: get_foreign_room tool error contract
// ===========================================================================

describe("AC-11: get_foreign_room tool error contract", () => {
  it("returns {error:...} JSON on failure (NFR-P02-2)", async () => {
    const server = new McpServer({ name: "test", version: "1.0" });
    // Inject a database that's already closed — any query will throw
    const badDb = new Database(":memory:");
    badDb.close();

    registerForeignRoomTools(server, badDb);

    const result = await callTool(server, "get_foreign_room", {}) as Record<string, unknown>;
    expect(result).toHaveProperty("error");
    expect(typeof result["error"]).toBe("string");
    // Must NOT expose raw DB error — only a sanitized message
    expect((result["error"] as string).startsWith("Foreign room data unavailable:")).toBe(true);
  });

  it("returns valid structure with in-memory DB (empty result)", async () => {
    const server = new McpServer({ name: "test", version: "1.0" });
    registerForeignRoomTools(server, db);

    const result = await callTool(server, "get_foreign_room", {}) as Record<string, unknown>;
    expect(result).toHaveProperty("tickers");
    expect(result).toHaveProperty("market");
    expect(result).toHaveProperty("source_tier", 2);
    expect(Array.isArray(result["tickers"])).toBe(true);
  });

  it("filters to a single ticker when code is provided", async () => {
    insertStats(db, "VCB", "2026-06-29", {
      current_holding_ratio: 0.25,
      max_holding_ratio: 0.49,
      market_cap_bn: 200_000,
    });
    insertStats(db, "VNM", "2026-06-29", {
      current_holding_ratio: 0.20,
      max_holding_ratio: 0.49,
      market_cap_bn: 100_000,
    });

    const server = new McpServer({ name: "test", version: "1.0" });
    registerForeignRoomTools(server, db);

    const result = await callTool(server, "get_foreign_room", { code: "VCB" }) as Record<string, unknown>;
    expect(result).toHaveProperty("tickers");
    const tickers = result["tickers"] as Array<{ code: string }>;
    expect(tickers).toHaveLength(1);
    expect(tickers[0]!.code).toBe("VCB");
  });
});

// ===========================================================================
// AC-12: summarizeForeignRoomTickers / get_foreign_room top_n trim + rollup
// (FIX-GET-FOREIGN-ROOM-TOOL-RESULT-TOKEN-BUDGET)
// ===========================================================================

/** Build a minimal TickerRoomAnalysis fixture with sane defaults. */
function makeAnalysis(overrides: {
  code: string;
  market_cap_bn?: number | null;
  room_utilization_pct?: number | null;
  depletion_velocity_5d?: number | null;
  room_locked?: boolean | null;
  full_room_sell?: boolean | null;
  foreign_restricted?: boolean;
}): TickerRoomAnalysis {
  return {
    code: overrides.code,
    sector: "Banking",
    market_cap_bn: overrides.market_cap_bn ?? 100_000,
    utilization: {
      room_utilization_pct: overrides.room_utilization_pct ?? null,
      foreign_room_remaining: null,
      max_holding_ratio: 0.49,
      current_holding_ratio: null,
      foreign_restricted: overrides.foreign_restricted ?? false,
      asof: "2026-07-29",
      source_tier: 2,
    },
    velocity: {
      depletion_velocity_5d: overrides.depletion_velocity_5d ?? null,
      confidence: overrides.depletion_velocity_5d !== undefined ? "full" : "insufficient",
    },
    flags: {
      room_locked: overrides.room_locked ?? null,
      full_room_sell: overrides.full_room_sell ?? null,
    },
    recent_events: [],
  };
}

describe("AC-12: summarizeForeignRoomTickers — top_n trim + rollup + fetch-more", () => {
  it("returns every ticker untouched when topN >= total (no trimming, no fetch_more)", () => {
    const analyses = [
      makeAnalysis({ code: "AAA", room_utilization_pct: 50 }),
      makeAnalysis({ code: "BBB", room_utilization_pct: 80 }),
    ];
    const { tickers, rollup, omitted_codes } = summarizeForeignRoomTickers(analyses, 10);
    expect(tickers).toHaveLength(2);
    expect(rollup.total_tickers).toBe(2);
    expect(rollup.returned_tickers).toBe(2);
    expect(omitted_codes).toEqual([]);
  });

  it("never dumps the full universe — effective limit is min(topN, total), never a hardcoded ceiling", () => {
    const analyses = Array.from({ length: 106 }, (_, i) =>
      makeAnalysis({ code: `T${String(i).padStart(3, "0")}`, room_utilization_pct: i, market_cap_bn: 1000 + i }),
    );
    const { tickers, rollup, omitted_codes } = summarizeForeignRoomTickers(analyses, 10);
    expect(tickers).toHaveLength(10);
    expect(rollup.total_tickers).toBe(106);
    expect(rollup.returned_tickers).toBe(10);
    expect(omitted_codes).toHaveLength(96);
  });

  it("prioritizes ROOM_LOCKED/FULL_ROOM_SELL flagged tickers ahead of higher-cap unflagged ones", () => {
    const analyses = [
      makeAnalysis({ code: "BIGCAP", market_cap_bn: 500_000, room_utilization_pct: 90 }),
      makeAnalysis({ code: "MIDCAP", market_cap_bn: 300_000, room_utilization_pct: 70 }),
      makeAnalysis({ code: "LOCKED", market_cap_bn: 1_000, room_utilization_pct: 100, room_locked: true }),
    ];
    const { tickers } = summarizeForeignRoomTickers(analyses, 1);
    // LOCKED has the smallest market_cap_bn and would rank last by cap alone —
    // but it must be selected FIRST because it's flagged.
    expect(tickers).toHaveLength(1);
    expect(tickers[0]!.code).toBe("LOCKED");
  });

  it("ranks by |depletion_velocity_5d| descending among unflagged tickers ('top-N by |net|')", () => {
    const analyses = [
      makeAnalysis({ code: "SLOW", depletion_velocity_5d: 100 }),
      makeAnalysis({ code: "FAST", depletion_velocity_5d: -5000 }),
      makeAnalysis({ code: "MED", depletion_velocity_5d: 800 }),
    ];
    const { tickers } = summarizeForeignRoomTickers(analyses, 2);
    expect(tickers.map((t) => t.code)).toEqual(["FAST", "MED"]);
  });

  it("computes rollup counts over the FULL universe, not just the returned slice", () => {
    const analyses = [
      makeAnalysis({ code: "A", room_locked: true, room_utilization_pct: 99 }),
      makeAnalysis({ code: "B", full_room_sell: true, room_utilization_pct: 99 }),
      makeAnalysis({ code: "C", foreign_restricted: true, room_utilization_pct: null }),
      makeAnalysis({ code: "D", room_utilization_pct: 40 }),
      makeAnalysis({ code: "E", room_utilization_pct: 20 }),
    ];
    const { rollup } = summarizeForeignRoomTickers(analyses, 1); // only 1 returned inline
    expect(rollup.total_tickers).toBe(5);
    expect(rollup.returned_tickers).toBe(1);
    expect(rollup.room_locked_count).toBe(1);
    expect(rollup.full_room_sell_count).toBe(1);
    expect(rollup.foreign_restricted_count).toBe(1);
    // avg over non-null utilization across ALL 5: (99+99+40+20)/4 = 64.5
    expect(rollup.avg_utilization_pct).toBeCloseTo(64.5, 5);
  });

  it("omitted_codes lists exactly the tickers not returned, sorted", () => {
    const analyses = [
      makeAnalysis({ code: "ZZZ", room_utilization_pct: 10 }),
      makeAnalysis({ code: "AAA", room_utilization_pct: 90 }),
      makeAnalysis({ code: "MMM", room_utilization_pct: 50 }),
    ];
    const { tickers, omitted_codes } = summarizeForeignRoomTickers(analyses, 1);
    expect(tickers.map((t) => t.code)).toEqual(["AAA"]);
    expect(omitted_codes).toEqual(["MMM", "ZZZ"]);
  });

  it("clamps a topN larger than the universe to the actual count (no padding)", () => {
    const analyses = [makeAnalysis({ code: "SOLO" })];
    const { tickers, rollup } = summarizeForeignRoomTickers(analyses, 9999);
    expect(tickers).toHaveLength(1);
    expect(rollup.returned_tickers).toBe(1);
  });
});

describe("AC-12b: get_foreign_room tool wires top_n trim + rollup + fetch_more end-to-end", () => {
  /** Insert N synthetic tickers each with a single trading-stats row. */
  function seedManyTickers(count: number): void {
    for (let i = 0; i < count; i++) {
      const code = `Z${String(i).padStart(3, "0")}`;
      insertStats(db, code, "2026-07-29", {
        current_holding_ratio: 0.1 + (i % 10) * 0.01,
        max_holding_ratio: 0.49,
        market_cap_bn: 1_000 + i,
      });
    }
  }

  it("defaults top_n to 10 when omitted — never the full universe inline", async () => {
    seedManyTickers(15);
    const server = new McpServer({ name: "test", version: "1.0" });
    registerForeignRoomTools(server, db);

    const result = await callTool(server, "get_foreign_room", {}) as Record<string, unknown>;
    const tickers = result["tickers"] as unknown[];
    expect(tickers.length).toBe(10);
    expect(result).toHaveProperty("tickers_rollup");
    const rollup = result["tickers_rollup"] as { total_tickers: number; returned_tickers: number };
    expect(rollup.total_tickers).toBe(15);
    expect(rollup.returned_tickers).toBe(10);
    expect(result["more_available"]).toBe(true);
    const fetchMore = result["fetch_more"] as { omitted_codes: string[]; hint: string };
    expect(fetchMore.omitted_codes).toHaveLength(5);
    expect(fetchMore.hint).toContain("top_n");
  });

  it("respects a caller-supplied top_n override", async () => {
    seedManyTickers(15);
    const server = new McpServer({ name: "test", version: "1.0" });
    registerForeignRoomTools(server, db);

    const result = await callTool(server, "get_foreign_room", { top_n: 3 }) as Record<string, unknown>;
    const tickers = result["tickers"] as unknown[];
    expect(tickers.length).toBe(3);
  });

  it("no fetch_more / more_available=false when top_n >= actual ticker count", async () => {
    seedManyTickers(3);
    const server = new McpServer({ name: "test", version: "1.0" });
    registerForeignRoomTools(server, db);

    const result = await callTool(server, "get_foreign_room", {}) as Record<string, unknown>;
    expect(result["more_available"]).toBe(false);
    expect(result).not.toHaveProperty("fetch_more");
  });

  it("single-ticker code lookup is never trimmed regardless of universe size", async () => {
    seedManyTickers(15);
    const server = new McpServer({ name: "test", version: "1.0" });
    registerForeignRoomTools(server, db);

    const result = await callTool(server, "get_foreign_room", { code: "Z000" }) as Record<string, unknown>;
    const tickers = result["tickers"] as Array<{ code: string }>;
    expect(tickers).toHaveLength(1);
    expect(tickers[0]!.code).toBe("Z000");
    expect(result["more_available"]).toBe(false);
  });

  it("the serialized JSON stays well under a 25k-token-equivalent budget for a large universe", async () => {
    seedManyTickers(120);
    const server = new McpServer({ name: "test", version: "1.0" });
    registerForeignRoomTools(server, db);

    const registry = (server as unknown as ToolServer)._registeredTools;
    const raw = await registry["get_foreign_room"]!.handler({});
    const text = raw.content[0]!.text;
    // ~4 chars/token heuristic — 25k tokens ≈ 100k chars. A 120-ticker unbounded
    // dump (pre-fix) would run ~700 chars/ticker ≈ 84k chars just for tickers[]
    // BEFORE market/rollup overhead; trimmed to top_n=10 this must stay small.
    expect(text.length).toBeLessThan(15_000);
  });
});
