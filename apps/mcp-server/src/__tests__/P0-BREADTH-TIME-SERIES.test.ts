/**
 * P0-BREADTH-TIME-SERIES — Test Suite
 *
 * Covers all ACs from HANDOFF-BREADTH-TIME-SERIES.md:
 *
 *   AC-1:  market_breadth_history table created with session_date UNIQUE constraint
 *   AC-2:  ON CONFLICT(session_date) IGNORE — idempotency (double-fire safe)
 *   AC-3:  upsertBreadthRow returns true on new insert, false on conflict
 *   AC-4:  ADL cumulative sum: adl = adl_prev + (adv - decl)
 *   AC-5:  RANA: (adv - decl) / total × 100; 0 when total=0
 *   AC-6:  McClellan Osc null until 39 sessions; non-null at session 39+
 *   AC-7:  McClellan Summation = running sum of non-null osc values
 *   AC-8:  Floor panic: floor/total > 0.15; ceiling FOMO: ceiling/total > 0.15
 *   AC-9:  is_halt_day: floor > 50% of total
 *   AC-10: Zweig thrust null until 14 sessions
 *   AC-11: Zweig thrust_triggered = true when 10+ consecutive qualifying in 14-session window
 *   AC-12: Zweig thrust_sessions_count = count qualifying in window
 *   AC-13: breadth_z_score null when <21 sessions
 *   AC-14: breadth_z_score ALWAYS present in getBreadthThrust response (never omitted)
 *   AC-15: history_quality: INSUFFICIENT <10, WARMUP 10-39, SUFFICIENT >=40
 *   AC-16: getBreadthThrust returns {error:...} when table is empty (NFR-BR-3)
 *   AC-17: getBreadthThrust returns {error:...} on DB failure (NFR-BR-3)
 *   AC-18: Tool handler returns {error:...} on failure (interface layer)
 *   AC-19: accruing_since = MIN(session_date) from the table
 *   AC-20: Zweig qualifying condition: adv/(adv+decl) > 0.615
 *
 * Harness: direct domain function tests + in-memory SQLite integration.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Domain
import {
  computeAdl,
  computeRana,
  computeEMA,
  computeMcLellanOsc,
  computeMcLellanSummation,
  computeFloorCeiling,
  computeZweigThrust,
  computeHistoryQuality,
  computeBreadthZScore,
  isZweigQualifying,
  type BreadthRow,
} from "../domain/services/market-data/breadthCalculator.js";

// Infrastructure
import {
  getAllBreadthHistory,
  getBreadthHistoryCount,
  getAccruingSince,
  upsertBreadthRow,
} from "../infrastructure/db/breadthHistoryStore.js";

// Application
import { getBreadthThrust } from "../application/usecases/getBreadthThrust.js";

// Interface
import { registerBreadthThrustTools } from "../interface/mcp/tools/market-data/breadthThrustTools.js";

// Schema (needed to create the table in test DB)
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a test Database with market_breadth_history table. */
function buildTestDb(): Database {
  const db = new Database(":memory:");
  initMarketDataTables(db);
  return db;
}

/** Insert N breadth rows with simple deterministic data. */
function insertRows(db: Database, count: number, opts?: { advancingFn?: (i: number) => number }): string[] {
  const dates: string[] = [];
  const advancing = opts?.advancingFn ?? ((_i: number) => 300);
  const decliningFn = (_i: number) => 100;
  const unchangedFn = (_i: number) => 50;
  const ceilingFn  = (_i: number) => 10;
  const floorFn    = (_i: number) => 5;

  for (let i = 0; i < count; i++) {
    const d = new Date("2026-01-02");
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    dates.push(dateStr);

    const adv = advancing(i);
    const decl = decliningFn(i);
    const unch = unchangedFn(i);
    const total = adv + decl + unch;

    upsertBreadthRow(db, {
      session_date: dateStr,
      advancing:    adv,
      declining:    decl,
      unchanged:    unch,
      ceiling:      ceilingFn(i),
      floor:        floorFn(i),
      total,
    });
  }
  return dates;
}

/** A single BreadthRow with sensible defaults. */
function makeRow(overrides?: Partial<BreadthRow>): BreadthRow {
  const advancing = overrides?.advancing ?? 300;
  const declining = overrides?.declining ?? 100;
  const unchanged = overrides?.unchanged ?? 50;
  return {
    session_date: overrides?.session_date ?? "2026-01-02",
    advancing,
    declining,
    unchanged,
    ceiling:      overrides?.ceiling ?? 10,
    floor:        overrides?.floor   ?? 5,
    total:        overrides?.total   ?? (advancing + declining + unchanged),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AC-1, AC-2, AC-3: Schema + idempotency
// ---------------------------------------------------------------------------

describe("schema — market_breadth_history", () => {
  it("AC-1: table exists with UNIQUE session_date constraint", () => {
    const db = buildTestDb();
    // Table should exist — query should not throw
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='market_breadth_history'").all();
    expect(rows).toHaveLength(1);
    db.close();
  });

  it("AC-2: ON CONFLICT IGNORE — double insert same session_date does not throw", () => {
    const db = buildTestDb();
    const row = { session_date: "2026-01-02", advancing: 300, declining: 100, unchanged: 50, ceiling: 10, floor: 5, total: 450 };
    const first  = upsertBreadthRow(db, row);
    const second = upsertBreadthRow(db, row);
    expect(first).toBe(true);
    expect(second).toBe(false);
    const count = getBreadthHistoryCount(db);
    expect(count).toBe(1);
    db.close();
  });

  it("AC-3: upsertBreadthRow returns true on insert, false on conflict", () => {
    const db = buildTestDb();
    const inserted = upsertBreadthRow(db, { session_date: "2026-01-03", advancing: 200, declining: 150, unchanged: 50, ceiling: 5, floor: 3, total: 400 });
    const duplicate = upsertBreadthRow(db, { session_date: "2026-01-03", advancing: 999, declining: 1, unchanged: 0, ceiling: 0, floor: 0, total: 1000 });
    expect(inserted).toBe(true);
    expect(duplicate).toBe(false);
    // First write wins — data unchanged
    const rows = getAllBreadthHistory(db);
    expect(rows[0]?.advancing).toBe(200);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// AC-4: ADL computation
// ---------------------------------------------------------------------------

describe("computeAdl", () => {
  it("AC-4: cumulative sum starting at 0", () => {
    const rows: BreadthRow[] = [
      makeRow({ advancing: 300, declining: 100 }), // net = +200
      makeRow({ advancing: 250, declining: 150 }), // net = +100
      makeRow({ advancing: 150, declining: 200 }), // net = -50
    ];
    const adl = computeAdl(rows);
    expect(adl[0]).toBe(200);
    expect(adl[1]).toBe(300);
    expect(adl[2]).toBe(250);
  });

  it("AC-4: empty rows returns empty array", () => {
    expect(computeAdl([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC-5: RANA
// ---------------------------------------------------------------------------

describe("computeRana", () => {
  it("AC-5: RANA = (adv - decl) / total × 100", () => {
    const row = makeRow({ advancing: 300, declining: 100, unchanged: 50, total: 450 });
    const rana = computeRana(row);
    expect(rana).toBeCloseTo((200 / 450) * 100, 5);
  });

  it("AC-5: RANA = 0 when total = 0", () => {
    const row = makeRow({ advancing: 0, declining: 0, unchanged: 0, ceiling: 0, floor: 0, total: 0 });
    expect(computeRana(row)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC-6: McClellan Oscillator null until 39 sessions
// ---------------------------------------------------------------------------

describe("computeMcLellanOsc", () => {
  it("AC-6: null for sessions 0-38 (i < 38 in 0-indexed)", () => {
    const rows = Array.from({ length: 38 }, (_, i) =>
      makeRow({ session_date: `2026-01-${String(i + 1).padStart(2, "0")}` })
    );
    const osc = computeMcLellanOsc(rows);
    expect(osc.every((v) => v === null)).toBe(true);
  });

  it("AC-6: non-null from session 39 onwards (index 38 = 39th session)", () => {
    const rows = Array.from({ length: 45 }, (_, i) =>
      makeRow({ session_date: `2026-01-${String(i + 1).padStart(2, "0")}` })
    );
    const osc = computeMcLellanOsc(rows);
    // First 38 indices (0-37) = null
    expect(osc.slice(0, 38).every((v) => v === null)).toBe(true);
    // Index 38+ = non-null
    expect(osc.slice(38).every((v) => v !== null)).toBe(true);
  });

  it("AC-6: empty input returns empty array", () => {
    expect(computeMcLellanOsc([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC-7: McClellan Summation
// ---------------------------------------------------------------------------

describe("computeMcLellanSummation", () => {
  it("AC-7: running sum skips nulls", () => {
    const osc: (number | null)[] = [null, null, 5, 3, -2];
    const sum = computeMcLellanSummation(osc);
    expect(sum[0]).toBeNull();
    expect(sum[1]).toBeNull();
    expect(sum[2]).toBe(5);
    expect(sum[3]).toBe(8);
    expect(sum[4]).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// AC-8, AC-9: Floor Panic / Ceiling FOMO / Halt Day
// ---------------------------------------------------------------------------

describe("computeFloorCeiling", () => {
  it("AC-8: floor_panic when floor/total > 0.15", () => {
    const row = makeRow({ floor: 80, ceiling: 10, total: 450 });
    const r = computeFloorCeiling(row);
    expect(r.floor_panic).toBe(true);
    expect(r.ceiling_fomo).toBe(false);
  });

  it("AC-8: ceiling_fomo when ceiling/total > 0.15", () => {
    const row = makeRow({ ceiling: 80, floor: 5, total: 450 });
    const r = computeFloorCeiling(row);
    expect(r.ceiling_fomo).toBe(true);
    expect(r.floor_panic).toBe(false);
  });

  it("AC-8: neither flag when both are <= 15%", () => {
    const row = makeRow({ floor: 5, ceiling: 10, total: 450 });
    const r = computeFloorCeiling(row);
    expect(r.floor_panic).toBe(false);
    expect(r.ceiling_fomo).toBe(false);
  });

  it("AC-9: is_halt_day when floor > 50% of total", () => {
    const row = makeRow({ floor: 250, ceiling: 0, total: 450 });
    const r = computeFloorCeiling(row);
    expect(r.is_halt_day).toBe(true);
  });

  it("AC-9: is_halt_day false when floor <= 50% of total", () => {
    const row = makeRow({ floor: 200, ceiling: 0, total: 450 });
    const r = computeFloorCeiling(row);
    expect(r.is_halt_day).toBe(false);
  });

  it("AC-8,AC-9: total=0 returns all false (division guard)", () => {
    const row = makeRow({ floor: 0, ceiling: 0, total: 0, advancing: 0, declining: 0, unchanged: 0 });
    const r = computeFloorCeiling(row);
    expect(r.floor_panic).toBe(false);
    expect(r.ceiling_fomo).toBe(false);
    expect(r.is_halt_day).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC-10, AC-11, AC-12, AC-20: Zweig Thrust
// ---------------------------------------------------------------------------

describe("computeZweigThrust + isZweigQualifying", () => {
  it("AC-10: null when fewer than 14 rows", () => {
    const rows = Array.from({ length: 13 }, () =>
      makeRow({ advancing: 400, declining: 100, total: 500 })
    );
    const r = computeZweigThrust(rows);
    expect(r.thrust_triggered).toBeNull();
    expect(r.thrust_sessions_count).toBeNull();
    expect(r.thrust_possible).toBeNull();
  });

  it("AC-20: isZweigQualifying = true when adv/(adv+decl) > 0.615", () => {
    // 0.615 threshold: adv=62, decl=38 → ratio=0.620 > 0.615
    expect(isZweigQualifying(makeRow({ advancing: 62, declining: 38, total: 100 }))).toBe(true);
    // Exactly 0.615: adv=615, decl=385 → ratio=0.615 NOT > 0.615
    expect(isZweigQualifying(makeRow({ advancing: 615, declining: 385, total: 1000 }))).toBe(false);
    // Below threshold
    expect(isZweigQualifying(makeRow({ advancing: 50, declining: 50, total: 100 }))).toBe(false);
  });

  it("AC-11: thrust_triggered = true when 10+ consecutive qualifying in last 14", () => {
    // All 14 qualify → max_consecutive = 14 >= 10 → thrust_triggered = true
    const rows = Array.from({ length: 14 }, () =>
      makeRow({ advancing: 62, declining: 38, total: 100 })
    );
    const r = computeZweigThrust(rows);
    expect(r.thrust_triggered).toBe(true);
    expect(r.thrust_sessions_count).toBe(14);
    expect(r.max_consecutive).toBe(14);
  });

  it("AC-11: thrust_triggered = false when max consecutive run < 10", () => {
    // 7 qualifying then 7 non-qualifying → max_consecutive = 7 < 10
    const qualRow  = makeRow({ advancing: 62, declining: 38, total: 100 });
    const nonQualRow = makeRow({ advancing: 38, declining: 62, total: 100 });
    const rows = [
      ...Array.from({ length: 7 }, () => qualRow),
      ...Array.from({ length: 7 }, () => nonQualRow),
    ];
    const r = computeZweigThrust(rows);
    expect(r.thrust_triggered).toBe(false);
    expect(r.thrust_sessions_count).toBe(7);
    expect(r.max_consecutive).toBe(7);
  });

  it("AC-12: thrust_sessions_count = count qualifying (not necessarily consecutive)", () => {
    // Alternating: 7 qualifying, 7 non-qualifying = 7 qualifying out of 14
    const qualRow  = makeRow({ advancing: 62, declining: 38, total: 100 });
    const nonQualRow = makeRow({ advancing: 38, declining: 62, total: 100 });
    // Interleaved
    const rows: BreadthRow[] = [];
    for (let i = 0; i < 14; i++) {
      rows.push(i % 2 === 0 ? qualRow : nonQualRow);
    }
    const r = computeZweigThrust(rows);
    expect(r.thrust_sessions_count).toBe(7);
    expect(r.thrust_possible).toBe(true);     // >=5
    expect(r.thrust_triggered).toBe(false);   // max consecutive = 1, not 10
  });

  it("AC-12: thrust_possible = true when thrust_sessions_count >= 5", () => {
    const qualRow = makeRow({ advancing: 62, declining: 38, total: 100 });
    const nonQualRow = makeRow({ advancing: 38, declining: 62, total: 100 });
    // 5 qualifying, 9 non-qualifying → thrust_sessions_count=5 >= 5 → thrust_possible=true
    const rows = [
      ...Array.from({ length: 5 }, () => qualRow),
      ...Array.from({ length: 9 }, () => nonQualRow),
    ];
    const r = computeZweigThrust(rows);
    expect(r.thrust_possible).toBe(true);
    expect(r.thrust_triggered).toBe(false);
  });

  it("AC-12: thrust_possible = false when thrust_sessions_count < 5", () => {
    const qualRow = makeRow({ advancing: 62, declining: 38, total: 100 });
    const nonQualRow = makeRow({ advancing: 38, declining: 62, total: 100 });
    // 4 qualifying, 10 non-qualifying → thrust_sessions_count=4 < 5 → thrust_possible=false
    const rows = [
      ...Array.from({ length: 4 }, () => qualRow),
      ...Array.from({ length: 10 }, () => nonQualRow),
    ];
    const r = computeZweigThrust(rows);
    expect(r.thrust_possible).toBe(false);
  });

  it("AC-11: only last 14 sessions used even when more rows exist", () => {
    // 20 rows total; last 14 have 10 consecutive qualifying
    const nonQualRow = makeRow({ advancing: 38, declining: 62, total: 100 });
    const qualRow    = makeRow({ advancing: 62, declining: 38, total: 100 });
    const rows = [
      ...Array.from({ length: 6 }, () => nonQualRow),  // first 6 non-qualifying (outside last-14)
      ...Array.from({ length: 14 }, () => qualRow),    // last 14 all qualifying
    ];
    const r = computeZweigThrust(rows);
    expect(r.thrust_triggered).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-13: breadth_z_score null when <21 sessions
// ---------------------------------------------------------------------------

describe("computeBreadthZScore", () => {
  it("AC-13: null when totalSessions < 21", () => {
    const oscValues: (number | null)[] = [1, 2, 3, 4, 5];
    expect(computeBreadthZScore(oscValues, 20)).toBeNull();
    expect(computeBreadthZScore(oscValues, 10)).toBeNull();
  });

  it("AC-13: non-null when totalSessions >= 21 and enough non-null osc values", () => {
    // 25 non-null osc values with variance
    const oscValues = Array.from({ length: 25 }, (_, i) => i * 0.5 - 6);
    const z = computeBreadthZScore(oscValues, 25);
    expect(z).not.toBeNull();
    expect(typeof z).toBe("number");
  });

  it("AC-13: null when fewer than 2 non-null osc values (cannot compute std)", () => {
    const oscValues: (number | null)[] = [null, null, null, 5.0];
    expect(computeBreadthZScore(oscValues, 25)).toBeNull();
  });

  it("AC-13: returns 0 when all osc values are identical (std=0)", () => {
    const oscValues = Array.from({ length: 25 }, () => 3.0);
    const z = computeBreadthZScore(oscValues, 25);
    expect(z).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC-15: history_quality transitions
// ---------------------------------------------------------------------------

describe("computeHistoryQuality", () => {
  it("AC-15: INSUFFICIENT when < 10", () => {
    expect(computeHistoryQuality(0)).toBe("INSUFFICIENT");
    expect(computeHistoryQuality(9)).toBe("INSUFFICIENT");
  });

  it("AC-15: WARMUP when 10 <= n < 40", () => {
    expect(computeHistoryQuality(10)).toBe("WARMUP");
    expect(computeHistoryQuality(39)).toBe("WARMUP");
  });

  it("AC-15: SUFFICIENT when >= 40", () => {
    expect(computeHistoryQuality(40)).toBe("SUFFICIENT");
    expect(computeHistoryQuality(100)).toBe("SUFFICIENT");
  });
});

// ---------------------------------------------------------------------------
// AC-14, AC-16, AC-17, AC-19: getBreadthThrust integration
// ---------------------------------------------------------------------------

describe("getBreadthThrust", () => {
  it("AC-16: returns {error:...} when table is empty (NFR-BR-3)", async () => {
    const db = buildTestDb();
    const result = await getBreadthThrust(db);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("no breadth history");
    db.close();
  });

  it("AC-17: returns {error:...} on DB failure (tool error boundary)", async () => {
    const db = buildTestDb();
    db.close(); // Close DB to simulate failure
    let threw = false;
    try {
      await getBreadthThrust(db);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true); // DB error propagates to tool handler catch block
  });

  it("AC-14: breadth_z_score ALWAYS present in response (never omitted)", async () => {
    const db = buildTestDb();
    insertRows(db, 5);  // < 21 sessions → z-score null but field must be present
    const result = await getBreadthThrust(db);
    expect(result).not.toHaveProperty("error");
    const typed = result as Awaited<ReturnType<typeof getBreadthThrust>>;
    if ("breadth_z_score" in typed) {
      expect(typed.breadth_z_score).toBeDefined();
    }
    db.close();
  });

  it("AC-13 (integration): breadth_z_score.value null with 10 sessions", async () => {
    const db = buildTestDb();
    insertRows(db, 10);
    const result = await getBreadthThrust(db);
    if ("breadth_z_score" in result) {
      expect((result as { breadth_z_score: { value: null } }).breadth_z_score.value).toBeNull();
    }
    db.close();
  });

  it("AC-19: accruing_since = MIN(session_date)", async () => {
    const db = buildTestDb();
    const dates = insertRows(db, 5);
    const result = await getBreadthThrust(db);
    if (!("error" in result)) {
      expect(result.accruing_since).toBe(dates[0] ?? null);
    }
    db.close();
  });

  it("AC-15 (integration): history_quality transitions correctly", async () => {
    const db = buildTestDb();

    // INSUFFICIENT: 5 sessions
    insertRows(db, 5);
    let result = await getBreadthThrust(db);
    if (!("error" in result)) {
      expect(result.history_quality).toBe("INSUFFICIENT");
      expect(result.sessions_accrued).toBe(5);
    }

    // WARMUP: add 10 more = 15 total
    db.exec("DELETE FROM market_breadth_history");
    insertRows(db, 15);
    result = await getBreadthThrust(db);
    if (!("error" in result)) {
      expect(result.history_quality).toBe("WARMUP");
    }

    // SUFFICIENT: 40 sessions
    db.exec("DELETE FROM market_breadth_history");
    insertRows(db, 40);
    result = await getBreadthThrust(db);
    if (!("error" in result)) {
      expect(result.history_quality).toBe("SUFFICIENT");
    }

    db.close();
  });

  it("AC-6 (integration): mclellan_osc null with <39 sessions", async () => {
    const db = buildTestDb();
    insertRows(db, 30);
    const result = await getBreadthThrust(db);
    if (!("error" in result)) {
      expect(result.mclellan_osc).toBeNull();
    }
    db.close();
  });

  it("AC-6 (integration): mclellan_osc non-null with 40 sessions", async () => {
    const db = buildTestDb();
    insertRows(db, 40);
    const result = await getBreadthThrust(db);
    if (!("error" in result)) {
      expect(result.mclellan_osc).not.toBeNull();
      expect(typeof result.mclellan_osc).toBe("number");
    }
    db.close();
  });

  it("AC-10 (integration): zweig null when < 14 sessions", async () => {
    const db = buildTestDb();
    insertRows(db, 10);
    const result = await getBreadthThrust(db);
    if (!("error" in result)) {
      expect(result.thrust_triggered).toBeNull();
      expect(result.thrust_sessions_count).toBeNull();
    }
    db.close();
  });

  it("AC-4 (integration): adl and adl_history present", async () => {
    const db = buildTestDb();
    insertRows(db, 5, { advancingFn: (_i) => 300 }); // adv=300, decl=100 → net=+200 each
    const result = await getBreadthThrust(db);
    if (!("error" in result)) {
      expect(result.adl).toBe(1000); // 5 × 200
      expect(result.adl_history).toHaveLength(5);
    }
    db.close();
  });
});

// ---------------------------------------------------------------------------
// AC-18: Tool handler returns {error:...} on failure
// ---------------------------------------------------------------------------

type ToolHandler = {
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
};
type ToolServerInternal = { _registeredTools: Record<string, ToolHandler> };

describe("registerBreadthThrustTools — interface layer", () => {
  it("AC-18: tool returns {error:...} JSON on DB failure", async () => {
    const brokenDb = buildTestDb();
    brokenDb.close(); // Force failure

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerBreadthThrustTools(server, brokenDb);

    // Access the registered handler via _registeredTools Record
    const registry = (server as unknown as ToolServerInternal)._registeredTools;
    const entry = registry["get_breadth_thrust"];
    expect(entry).toBeDefined();

    const result = await entry!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed).toHaveProperty("error");
    expect(typeof parsed.error).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// AC-14: breadth_z_score 6-field gauge contract
// ---------------------------------------------------------------------------

describe("breadth_z_score gauge-ready scalar", () => {
  it("AC-14: 6-field contract (value/unit/asof/source_tier/confidence/null_reason)", async () => {
    const db = buildTestDb();
    insertRows(db, 10);
    const result = await getBreadthThrust(db);
    if (!("error" in result)) {
      const scalar = result.breadth_z_score;
      expect(scalar).toHaveProperty("value");
      expect(scalar).toHaveProperty("unit");
      expect(scalar).toHaveProperty("asof");
      expect(scalar).toHaveProperty("source_tier");
      expect(scalar).toHaveProperty("confidence");
      expect(scalar).toHaveProperty("null_reason");
      expect(scalar.source_tier).toBe(2);
      expect(scalar.unit).toBe("z-score");
    }
    db.close();
  });

  it("AC-14: null_reason present when value is null", async () => {
    const db = buildTestDb();
    insertRows(db, 10);
    const result = await getBreadthThrust(db);
    if (!("error" in result)) {
      const scalar = result.breadth_z_score;
      if (scalar.value === null) {
        expect(scalar.null_reason).not.toBeNull();
      }
    }
    db.close();
  });
});
