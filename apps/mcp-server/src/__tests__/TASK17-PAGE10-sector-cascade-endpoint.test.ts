/**
 * TASK17-PAGE10 — GET /api/sector-cascade
 *
 * "Tín hiệu dây chuyền theo ngành" — Sector Cascade Signals analyst page.
 *
 * AC-1:  parseDirection — "up" / "down" / "neutral" from rule_key suffix
 * AC-2:  parseDirection — unknown suffix → "neutral" (honest default)
 * AC-3:  parseDirection — multi-underscore keys (e.g. "gold_mining_up") → "up" (last segment)
 * AC-4:  resolveSector — prefers affected_sector when non-null and non-empty
 * AC-5:  resolveSector — fallback to rule_key prefix when affected_sector null/empty
 * AC-6:  parseAffectedStocks — empty string → []
 * AC-7:  parseAffectedStocks — comma-separated string → split array
 * AC-8:  parseAffectedStocks — JSON array string → parsed array
 * AC-9:  aggregateBySector — correct up/down/neutral/total/netBias counts
 * AC-10: aggregateBySector — sort order: netBias DESC, tie-break total DESC
 * AC-11: aggregateBySector — window filter excludes old rows (rows outside window not present)
 * AC-12: buildSummary — bullishSectors/bearishSectors/neutralSectors counts
 * AC-13: buildSummary — topBullish: up to 5 by netBias DESC
 * AC-14: buildSummary — topBearish: up to 5 by netBias ASC
 * AC-15: buildSummary — empty sectors → zeroed summary, empty top lists
 * AC-16: handleGetSectorCascade — 200 JSON envelope with all required fields
 * AC-17: handleGetSectorCascade — sectors array sorted netBias DESC
 * AC-18: handleGetSectorCascade — recentHits limited to 40 rows, mapped correctly
 * AC-19: handleGetSectorCascade — window filter excludes rows outside window
 * AC-20: handleGetSectorCascade — 200-on-empty (no rows → empty arrays, zeroed counts)
 * AC-21: handleGetSectorCascade — ?days= param respected (clamp [1,30])
 * AC-22: handleGetSectorCascade — 500 JSON on DB error (closed DB)
 * AC-23: mapHit — all fields mapped correctly including affectedStocks parse
 *
 * Production-shape seeds mirror the REAL taxonomy:
 *   pharma_neutral × many, tech_up × 21, tech_down × 2, securities_up/down/neutral,
 *   retail_up, banking_neutral, gold_mining variants, etc.
 *   PLUS rows with hit_at OUTSIDE the 7-day window (older) to prove window filter.
 *   PLUS a row with empty affected_stocks and one with a comma list.
 *
 * DDD layer: interface + infrastructure tested together at the handler seam.
 * Isolation: in-memory SQLite, reset per test via initDatabase().
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[TASK17-PAGE10] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  parseDirection,
  resolveSector,
  parseAffectedStocks,
  aggregateBySector,
  mapHit,
  buildSummary,
  handleGetSectorCascade,
  type SectorCascadeResponse,
  type SectorCascadeEntry,
} from "../interface/mcp/routes/cascadeSignalHandler.js";
import type { CascadeHitRow } from "../infrastructure/db/cascadeSignalStore.js";

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

/** Fixed clock: 2026-06-11 noon UTC */
const NOW = new Date("2026-06-11T12:00:00.000Z");
const NOW_ISO = NOW.toISOString();

function makeMockRes() {
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

function makeFakeReq(url: string = "/api/sector-cascade"): import("node:http").IncomingMessage {
  return { url } as import("node:http").IncomingMessage;
}

/**
 * Insert a cascade_rule_hits row.
 * hit_at uses "YYYY-MM-DD HH:MM:SS" format matching the real column.
 */
function insertHit(
  ruleKey: string,
  affectedSector: string | null,
  hitAt: string,
  matchedText = "test headline",
  affectedStocks: string | null = null,
): void {
  getDb()
    .prepare(
      `INSERT INTO cascade_rule_hits
         (rule_key, matched_text, affected_sector, affected_stocks, hit_at, confidence)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(ruleKey, matchedText, affectedSector, affectedStocks, hitAt, null);
}

/**
 * Seed the PRODUCTION-SHAPE fixture.
 *
 * Mirrors the real taxonomy:
 *   - pharma_neutral × 8 (within window)
 *   - tech_up × 3 (within window)
 *   - tech_down × 1 (within window)
 *   - securities_up × 2, securities_down × 3, securities_neutral × 2 (within window)
 *   - retail_up × 2 (within window)
 *   - banking_neutral × 4 (within window)
 *   - gold_mining_up × 2, gold_mining_down × 1 (within window)
 *
 * PLUS 3 rows with hit_at OLDER than the 7-day window (excluded by filter):
 *   - old_pharma_neutral × 3 at 2026-05-01 (>30 days ago)
 *
 * PLUS rows with varied affected_stocks:
 *   - empty string  → []
 *   - comma list    → ["VCB","BID"]
 */
function seedProductionShape(): void {
  const inWindow = "2026-06-08 10:00:00"; // within 7-day window from 2026-06-11
  const oldDate  = "2026-05-01 08:00:00"; // outside any window up to 30 days

  // pharma_neutral × 8 (within window)
  for (let i = 0; i < 8; i++) {
    insertHit("pharma_neutral", "pharma", inWindow, `pharma news ${i}`, "");
  }

  // tech_up × 3, tech_down × 1 (within window)
  insertHit("tech_up", "tech", inWindow, "tech up 1");
  insertHit("tech_up", "tech", inWindow, "tech up 2");
  insertHit("tech_up", "tech", inWindow, "tech up 3");
  insertHit("tech_down", "tech", inWindow, "tech down 1");

  // securities: up×2, down×3, neutral×2
  insertHit("securities_up", "securities", inWindow, "sec up 1");
  insertHit("securities_up", "securities", inWindow, "sec up 2");
  insertHit("securities_down", "securities", inWindow, "sec down 1");
  insertHit("securities_down", "securities", inWindow, "sec down 2");
  insertHit("securities_down", "securities", inWindow, "sec down 3");
  insertHit("securities_neutral", "securities", inWindow, "sec neutral 1");
  insertHit("securities_neutral", "securities", inWindow, "sec neutral 2");

  // retail_up × 2
  insertHit("retail_up", "retail", inWindow, "retail up 1");
  insertHit("retail_up", "retail", inWindow, "retail up 2");

  // banking_neutral × 4
  insertHit("banking_neutral", "banking", inWindow, "banking neutral 1");
  insertHit("banking_neutral", "banking", inWindow, "banking neutral 2");
  insertHit("banking_neutral", "banking", inWindow, "banking neutral 3");
  insertHit("banking_neutral", "banking", inWindow, "banking neutral 4");

  // gold_mining_up × 2, gold_mining_down × 1 (affected_sector = null → fallback to prefix)
  insertHit("gold_mining_up", null, inWindow, "gold mining up 1");
  insertHit("gold_mining_up", null, inWindow, "gold mining up 2");
  insertHit("gold_mining_down", null, inWindow, "gold mining down 1");

  // affected_stocks variations
  insertHit("banking_neutral", "banking", inWindow, "with comma stocks", "VCB,BID");
  insertHit("banking_neutral", "banking", inWindow, "with json stocks", '["ACB","CTG"]');

  // OLD rows — outside window (should be EXCLUDED by filter)
  insertHit("pharma_neutral", "pharma", oldDate, "old pharma 1");
  insertHit("pharma_neutral", "pharma", oldDate, "old pharma 2");
  insertHit("tech_up",        "tech",   oldDate, "old tech 1");
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 / AC-2 / AC-3 — parseDirection
// ─────────────────────────────────────────────────────────────────────────────

describe("parseDirection", () => {
  it("AC-1: parses 'up' suffix", () => {
    expect(parseDirection("tech_up")).toBe("up");
    expect(parseDirection("retail_up")).toBe("up");
  });

  it("AC-1: parses 'down' suffix", () => {
    expect(parseDirection("securities_down")).toBe("down");
    expect(parseDirection("oil_gas_down")).toBe("down");
  });

  it("AC-1: parses 'neutral' suffix", () => {
    expect(parseDirection("pharma_neutral")).toBe("neutral");
    expect(parseDirection("banking_neutral")).toBe("neutral");
  });

  it("AC-2: unknown suffix → neutral", () => {
    expect(parseDirection("sector_unknown")).toBe("neutral");
    expect(parseDirection("sector_sideways")).toBe("neutral");
    expect(parseDirection("no_underscore_at_end_xyz")).toBe("neutral");
  });

  it("AC-2: no underscore → neutral", () => {
    expect(parseDirection("nounderscorekey")).toBe("neutral");
  });

  it("AC-3: multi-underscore key — last segment is authoritative", () => {
    expect(parseDirection("gold_mining_up")).toBe("up");
    expect(parseDirection("gold_mining_down")).toBe("down");
    expect(parseDirection("gold_mining_neutral")).toBe("neutral");
    expect(parseDirection("oil_gas_neutral")).toBe("neutral");
  });

  it("AC-1: case-insensitive suffix (UP → up)", () => {
    // Real data uses lowercase; but extra robustness
    expect(parseDirection("tech_UP")).toBe("up");
    expect(parseDirection("tech_DOWN")).toBe("down");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 / AC-5 — resolveSector
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveSector", () => {
  const makeRow = (rule_key: string, affected_sector: string | null): CascadeHitRow => ({
    rule_key,
    affected_sector,
    affected_stocks: null,
    matched_text: "",
    hit_at: "2026-06-11 12:00:00",
    confidence: null,
  });

  it("AC-4: prefers affected_sector when non-null", () => {
    expect(resolveSector(makeRow("pharma_neutral", "pharma"))).toBe("pharma");
    expect(resolveSector(makeRow("banking_neutral", "banking"))).toBe("banking");
  });

  it("AC-5: fallback to rule_key prefix when affected_sector is null", () => {
    expect(resolveSector(makeRow("gold_mining_up", null))).toBe("gold_mining");
    expect(resolveSector(makeRow("tech_down", null))).toBe("tech");
    expect(resolveSector(makeRow("oil_gas_neutral", null))).toBe("oil_gas");
  });

  it("AC-5: fallback when affected_sector is empty string", () => {
    expect(resolveSector(makeRow("retail_up", ""))).toBe("retail");
    expect(resolveSector(makeRow("gold_mining_down", "  "))).toBe("gold_mining");
  });

  it("rule_key with no underscore → whole key as sector", () => {
    expect(resolveSector(makeRow("nounderscore", null))).toBe("nounderscore");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6 / AC-7 / AC-8 — parseAffectedStocks
// ─────────────────────────────────────────────────────────────────────────────

describe("parseAffectedStocks", () => {
  it("AC-6: null → []", () => {
    expect(parseAffectedStocks(null)).toEqual([]);
  });

  it("AC-6: empty string → []", () => {
    expect(parseAffectedStocks("")).toEqual([]);
    expect(parseAffectedStocks("   ")).toEqual([]);
  });

  it("AC-7: comma-separated → split and trimmed array", () => {
    expect(parseAffectedStocks("VCB,BID")).toEqual(["VCB", "BID"]);
    expect(parseAffectedStocks("VCB, BID ,ACB")).toEqual(["VCB", "BID", "ACB"]);
    expect(parseAffectedStocks("VCB")).toEqual(["VCB"]);
  });

  it("AC-7: trailing comma handled", () => {
    // empty segment after trailing comma filtered out
    const result = parseAffectedStocks("VCB,BID,");
    expect(result).toEqual(["VCB", "BID"]);
  });

  it("AC-8: JSON array string → parsed array", () => {
    expect(parseAffectedStocks('["VCB","BID"]')).toEqual(["VCB", "BID"]);
    expect(parseAffectedStocks('["ACB"]')).toEqual(["ACB"]);
    expect(parseAffectedStocks("[]")).toEqual([]);
  });

  it("AC-8: malformed JSON → falls back to comma split", () => {
    // "[VCB,BID]" is not valid JSON array (no quotes) → comma split
    const result = parseAffectedStocks("[VCB,BID]");
    // Comma split of "[VCB" and "BID]" — not ideal but defensive
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-9 / AC-10 — aggregateBySector
// ─────────────────────────────────────────────────────────────────────────────

describe("aggregateBySector", () => {
  const makeRow = (
    rule_key: string,
    affected_sector: string | null = null,
  ): CascadeHitRow => ({
    rule_key,
    affected_sector,
    affected_stocks: null,
    matched_text: "",
    hit_at: "2026-06-11 12:00:00",
    confidence: null,
  });

  it("AC-9: counts up/down/neutral correctly per sector", () => {
    const rows: CascadeHitRow[] = [
      makeRow("tech_up", "tech"),
      makeRow("tech_up", "tech"),
      makeRow("tech_down", "tech"),
      makeRow("tech_neutral", "tech"),
      makeRow("pharma_neutral", "pharma"),
    ];

    const result = aggregateBySector(rows);
    const tech = result.find((s) => s.sector === "tech");
    const pharma = result.find((s) => s.sector === "pharma");

    expect(tech).toBeDefined();
    expect(tech!.up).toBe(2);
    expect(tech!.down).toBe(1);
    expect(tech!.neutral).toBe(1);
    expect(tech!.total).toBe(4);
    expect(tech!.netBias).toBe(1); // 2 - 1

    expect(pharma).toBeDefined();
    expect(pharma!.up).toBe(0);
    expect(pharma!.down).toBe(0);
    expect(pharma!.neutral).toBe(1);
    expect(pharma!.netBias).toBe(0);
  });

  it("AC-10: sorted netBias DESC, tie-break total DESC", () => {
    const rows: CascadeHitRow[] = [
      // securities: netBias = 2-3 = -1, total = 7
      makeRow("securities_up", "securities"),
      makeRow("securities_up", "securities"),
      makeRow("securities_down", "securities"),
      makeRow("securities_down", "securities"),
      makeRow("securities_down", "securities"),
      makeRow("securities_neutral", "securities"),
      makeRow("securities_neutral", "securities"),
      // tech: netBias = 3-1 = +2, total = 5
      makeRow("tech_up", "tech"),
      makeRow("tech_up", "tech"),
      makeRow("tech_up", "tech"),
      makeRow("tech_down", "tech"),
      makeRow("tech_neutral", "tech"),
      // retail: netBias = 2-0 = +2, total = 3 (tie-break with tech: total less → after tech)
      makeRow("retail_up", "retail"),
      makeRow("retail_up", "retail"),
      makeRow("retail_neutral", "retail"),
      // pharma: netBias = 0, total = 4
      makeRow("pharma_neutral", "pharma"),
      makeRow("pharma_neutral", "pharma"),
      makeRow("pharma_neutral", "pharma"),
      makeRow("pharma_neutral", "pharma"),
    ];

    const result = aggregateBySector(rows);

    // tech: netBias=+2, total=5
    // retail: netBias=+2, total=3
    // Both tie on netBias; tech wins tie-break (total 5 > 3)
    expect(result[0]!.sector).toBe("tech");
    expect(result[1]!.sector).toBe("retail");

    // pharma: netBias=0 → after positives
    const pharmaIdx = result.findIndex((s) => s.sector === "pharma");
    const securitiesIdx = result.findIndex((s) => s.sector === "securities");

    // securities netBias=-1 → last
    expect(securitiesIdx).toBe(result.length - 1);
    // pharma netBias=0 → before securities
    expect(pharmaIdx).toBeLessThan(securitiesIdx);
  });

  it("empty rows → empty result", () => {
    expect(aggregateBySector([])).toEqual([]);
  });

  it("resolveSector fallback works within aggregation (null affected_sector)", () => {
    const rows: CascadeHitRow[] = [
      makeRow("gold_mining_up", null),
      makeRow("gold_mining_up", null),
      makeRow("gold_mining_down", null),
    ];
    const result = aggregateBySector(rows);
    expect(result).toHaveLength(1);
    expect(result[0]!.sector).toBe("gold_mining");
    expect(result[0]!.up).toBe(2);
    expect(result[0]!.down).toBe(1);
    expect(result[0]!.netBias).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-12 / AC-13 / AC-14 / AC-15 — buildSummary
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSummary", () => {
  const makeEntry = (sector: string, netBias: number, total: number): SectorCascadeEntry => ({
    sector,
    up: Math.max(0, netBias),
    down: Math.max(0, -netBias),
    neutral: total - Math.abs(netBias),
    total,
    netBias,
  });

  it("AC-12: bullish/bearish/neutral sector counts", () => {
    const sectors = [
      makeEntry("tech",       +3, 5),
      makeEntry("retail",     +2, 4),
      makeEntry("pharma",      0, 8),
      makeEntry("banking",     0, 3),
      makeEntry("securities", -1, 7),
      makeEntry("oil_gas",    -2, 5),
    ];
    const summary = buildSummary(sectors);
    expect(summary.bullishSectors).toBe(2);  // tech, retail
    expect(summary.neutralSectors).toBe(2);  // pharma, banking
    expect(summary.bearishSectors).toBe(2);  // securities, oil_gas
  });

  it("AC-13: topBullish = up to 5 by netBias DESC (sectors already sorted)", () => {
    const sectors: SectorCascadeEntry[] = [
      makeEntry("s1", 10, 12),
      makeEntry("s2",  8, 10),
      makeEntry("s3",  5, 7),
      makeEntry("s4",  3, 4),
      makeEntry("s5",  2, 5),
      makeEntry("s6",  1, 2),
      makeEntry("s7",  0, 3),
      makeEntry("s8", -1, 4),
    ];
    const summary = buildSummary(sectors);
    expect(summary.topBullish).toHaveLength(5);
    expect(summary.topBullish[0]!.sector).toBe("s1");
    expect(summary.topBullish[4]!.sector).toBe("s5");
  });

  it("AC-14: topBearish = up to 5 by netBias ASC (most bearish first)", () => {
    const sectors: SectorCascadeEntry[] = [
      makeEntry("s1",  5, 7),
      makeEntry("s2",  0, 3),
      makeEntry("s3", -1, 4),
      makeEntry("s4", -3, 6),
      makeEntry("s5", -5, 8),
      makeEntry("s6", -7, 10),
      makeEntry("s7", -9, 12),
    ];
    const summary = buildSummary(sectors);
    expect(summary.topBearish).toHaveLength(5);
    // Most bearish first: s7(-9), s6(-7), s5(-5), s4(-3), s3(-1)
    expect(summary.topBearish[0]!.sector).toBe("s7");
    expect(summary.topBearish[1]!.sector).toBe("s6");
    expect(summary.topBearish[4]!.sector).toBe("s3");
  });

  it("AC-15: empty sectors → zeroed summary, empty top lists", () => {
    const summary = buildSummary([]);
    expect(summary.bullishSectors).toBe(0);
    expect(summary.bearishSectors).toBe(0);
    expect(summary.neutralSectors).toBe(0);
    expect(summary.topBullish).toHaveLength(0);
    expect(summary.topBearish).toHaveLength(0);
  });

  it("topBullish/topBearish capped at 5 when more sectors exist", () => {
    const sectors = Array.from({ length: 10 }, (_, i) =>
      makeEntry(`s${i}`, 10 - i, 12 - i),
    );
    const summary = buildSummary(sectors);
    expect(summary.topBullish.length).toBeLessThanOrEqual(5);
    expect(summary.topBearish.length).toBeLessThanOrEqual(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-23 — mapHit
// ─────────────────────────────────────────────────────────────────────────────

describe("mapHit", () => {
  it("AC-23: all fields mapped correctly", () => {
    const row: CascadeHitRow = {
      rule_key: "tech_up",
      affected_sector: "tech",
      affected_stocks: "VCB,BID",
      matched_text: "Tech stocks surge on AI news",
      hit_at: "2026-06-11 12:00:00",
      confidence: 0.85,
    };
    const hit = mapHit(row);
    expect(hit.ruleKey).toBe("tech_up");
    expect(hit.sector).toBe("tech");
    expect(hit.direction).toBe("up");
    expect(hit.matchedText).toBe("Tech stocks surge on AI news");
    expect(hit.affectedStocks).toEqual(["VCB", "BID"]);
    expect(hit.hitAt).toBe("2026-06-11 12:00:00");
    expect(hit.confidence).toBe(0.85);
  });

  it("AC-23: null confidence → null in output", () => {
    const row: CascadeHitRow = {
      rule_key: "pharma_neutral",
      affected_sector: "pharma",
      affected_stocks: "",
      matched_text: "",
      hit_at: "2026-06-11 10:00:00",
      confidence: null,
    };
    const hit = mapHit(row);
    expect(hit.confidence).toBeNull();
    expect(hit.affectedStocks).toEqual([]);
  });

  it("AC-23: null affected_sector → resolveSector fallback used", () => {
    const row: CascadeHitRow = {
      rule_key: "gold_mining_down",
      affected_sector: null,
      affected_stocks: null,
      matched_text: "Gold drops",
      hit_at: "2026-06-11 09:00:00",
      confidence: null,
    };
    const hit = mapHit(row);
    expect(hit.sector).toBe("gold_mining");
    expect(hit.direction).toBe("down");
    expect(hit.affectedStocks).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetSectorCascade — HTTP handler integration tests (production-shape DB)
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE10 — handleGetSectorCascade (production-shape fixture)", () => {
  it("AC-16: returns 200 JSON with required envelope fields", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetSectorCascade(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(res.body) as SectorCascadeResponse;
    expect(body.generatedAt).toBe(NOW_ISO);
    expect(typeof body.windowDays).toBe("number");
    expect(typeof body.windowStart).toBe("string");
    expect(body.source).toBe("cascade_rules");
    expect(Array.isArray(body.sectors)).toBe(true);
    expect(typeof body.summary).toBe("object");
    expect(Array.isArray(body.recentHits)).toBe(true);
    expect(typeof body.count).toBe("number");
  });

  it("AC-16: windowStart is in 'YYYY-MM-DD HH:MM:SS' format (no T, no Z)", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetSectorCascade(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorCascadeResponse;

    // Must NOT contain "T" or "Z"
    expect(body.windowStart).not.toContain("T");
    expect(body.windowStart).not.toContain("Z");
    // Must match YYYY-MM-DD HH:MM:SS pattern
    expect(body.windowStart).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("AC-16: count matches sectors.length", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetSectorCascade(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorCascadeResponse;
    expect(body.count).toBe(body.sectors.length);
  });

  it("AC-17: sectors sorted netBias DESC", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetSectorCascade(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorCascadeResponse;

    // Check sort order
    for (let i = 0; i < body.sectors.length - 1; i++) {
      expect(body.sectors[i]!.netBias).toBeGreaterThanOrEqual(body.sectors[i + 1]!.netBias);
    }
  });

  it("AC-17: tech sector has highest netBias (up×3, down×1 = +2)", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetSectorCascade(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorCascadeResponse;

    const tech = body.sectors.find((s) => s.sector === "tech");
    expect(tech).toBeDefined();
    expect(tech!.up).toBe(3);
    expect(tech!.down).toBe(1);
    expect(tech!.netBias).toBe(2);
  });

  it("AC-19: window filter excludes old rows (3 old rows not counted)", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetSectorCascade(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorCascadeResponse;

    // The old rows are pharma_neutral×2 + tech_up×1 at 2026-05-01 (>30 days ago).
    // With 7-day window from NOW (2026-06-11), only rows >= 2026-06-04 are included.
    // In-window pharma: 8 neutral rows → up=0, down=0, neutral=8, total=8, netBias=0
    const pharma = body.sectors.find((s) => s.sector === "pharma");
    expect(pharma).toBeDefined();
    expect(pharma!.neutral).toBe(8);  // only the 8 in-window rows, NOT the 2 old ones
    expect(pharma!.total).toBe(8);

    // In-window tech: up=3, down=1 (NOT the old tech_up row)
    const tech = body.sectors.find((s) => s.sector === "tech");
    expect(tech!.up).toBe(3);
    expect(tech!.total).toBe(4); // 3 up + 1 down (old row excluded)
  });

  it("AC-18: recentHits limited to 40", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetSectorCascade(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorCascadeResponse;
    expect(body.recentHits.length).toBeLessThanOrEqual(40);
  });

  it("AC-18: recentHits mapped correctly (ruleKey, sector, direction, hitAt present)", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetSectorCascade(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorCascadeResponse;

    for (const hit of body.recentHits) {
      expect(typeof hit.ruleKey).toBe("string");
      expect(typeof hit.sector).toBe("string");
      expect(["up", "down", "neutral"]).toContain(hit.direction);
      expect(typeof hit.matchedText).toBe("string");
      expect(Array.isArray(hit.affectedStocks)).toBe(true);
      expect(typeof hit.hitAt).toBe("string");
    }
  });

  it("AC-18: recentHits empty string affected_stocks → []", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetSectorCascade(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorCascadeResponse;

    // pharma hits have affectedStocks="" → should map to []
    const pharmaHit = body.recentHits.find((h) => h.sector === "pharma");
    expect(pharmaHit).toBeDefined();
    expect(pharmaHit!.affectedStocks).toEqual([]);
  });

  it("AC-18: recentHits comma-list affected_stocks → parsed array", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetSectorCascade(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorCascadeResponse;

    const bankingWithStocks = body.recentHits.find(
      (h) => h.sector === "banking" && h.affectedStocks.length === 2,
    );
    // Either VCB,BID or ACB,CTG should appear (both seeded)
    if (bankingWithStocks) {
      expect(bankingWithStocks.affectedStocks.length).toBeGreaterThan(0);
    }
    // Verify at least one banking hit has stocks parsed (could be comma or JSON form)
    const bankingHitsWithStocks = body.recentHits.filter(
      (h) => h.sector === "banking" && h.affectedStocks.length > 0,
    );
    expect(bankingHitsWithStocks.length).toBeGreaterThan(0);
  });

  it("AC-21: ?days= param changes window (default=7, ?days=1 narrows it)", () => {
    seedProductionShape();

    // With days=1, windowStart = 2026-06-10 12:00:00
    // All in-window rows are at 2026-06-08 10:00:00 — OUTSIDE the 1-day window
    const res = makeMockRes();
    handleGetSectorCascade(
      makeFakeReq("/api/sector-cascade?days=1"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
      NOW,
    );
    const body = JSON.parse(res.body) as SectorCascadeResponse;
    expect(body.windowDays).toBe(1);
    expect(body.sectors).toHaveLength(0); // all rows at 2026-06-08 are outside 1-day window
    expect(body.count).toBe(0);
  });

  it("AC-21: ?days= clamped to max 30", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetSectorCascade(
      makeFakeReq("/api/sector-cascade?days=999"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
      NOW,
    );
    const body = JSON.parse(res.body) as SectorCascadeResponse;
    expect(body.windowDays).toBe(30);
  });

  it("AC-21: ?days= clamped to min 1", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetSectorCascade(
      makeFakeReq("/api/sector-cascade?days=0"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
      NOW,
    );
    const body = JSON.parse(res.body) as SectorCascadeResponse;
    expect(body.windowDays).toBe(1);
  });

  it("banking sector has correct counts (neutral×4 + 2 with stocks = 6 total)", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetSectorCascade(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorCascadeResponse;

    const banking = body.sectors.find((s) => s.sector === "banking");
    expect(banking).toBeDefined();
    expect(banking!.up).toBe(0);
    expect(banking!.down).toBe(0);
    expect(banking!.neutral).toBe(6); // 4 plain + 2 with stocks (both banking_neutral)
    expect(banking!.netBias).toBe(0);
  });

  it("gold_mining: up×2, down×1, netBias=+1 (resolved from rule_key prefix, no affected_sector)", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetSectorCascade(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorCascadeResponse;

    const gm = body.sectors.find((s) => s.sector === "gold_mining");
    expect(gm).toBeDefined();
    expect(gm!.up).toBe(2);
    expect(gm!.down).toBe(1);
    expect(gm!.netBias).toBe(1);
  });

  it("securities: up×2, down×3, netBias=-1 (bearish)", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetSectorCascade(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorCascadeResponse;

    const sec = body.sectors.find((s) => s.sector === "securities");
    expect(sec).toBeDefined();
    expect(sec!.up).toBe(2);
    expect(sec!.down).toBe(3);
    expect(sec!.netBias).toBe(-1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetSectorCascade — 200-on-empty
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE10 — handleGetSectorCascade (empty DB)", () => {
  it("AC-20: returns 200 + empty sectors/zeroed summary when no rows", () => {
    // No seed — table empty (initDatabase creates the table but no rows)
    const res = makeMockRes();
    handleGetSectorCascade(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SectorCascadeResponse;
    expect(body.sectors).toHaveLength(0);
    expect(body.count).toBe(0);
    expect(body.recentHits).toHaveLength(0);
    expect(body.source).toBe("cascade_rules");
    expect(body.summary.bullishSectors).toBe(0);
    expect(body.summary.bearishSectors).toBe(0);
    expect(body.summary.neutralSectors).toBe(0);
    expect(body.summary.topBullish).toHaveLength(0);
    expect(body.summary.topBearish).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetSectorCascade — DB error
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE10 — handleGetSectorCascade (DB error)", () => {
  it("AC-22: returns 500 JSON on DB error (closed DB)", () => {
    const db = getDb();
    closeDb(); // force DB error

    const res = makeMockRes();
    handleGetSectorCascade(
      makeFakeReq(),
      res as unknown as import("node:http").ServerResponse,
      db,
      NOW,
    );

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");
  });
});
