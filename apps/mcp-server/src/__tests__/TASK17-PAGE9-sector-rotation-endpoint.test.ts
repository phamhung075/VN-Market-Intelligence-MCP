/**
 * TASK17-PAGE9 — GET /api/sector-rotation
 *
 * "Dòng tiền theo ngành" — Sector Money Flow analyst page.
 *
 * AC-1:  response envelope: {generatedAt, tradingDate, priceSource:"stored",
 *         only1dAvailable, sectors[], summary, count}
 * AC-2:  14 sectors aggregate from the 41-watchlist + market_prices corpus
 * AC-3:  avg1dReturn matches ground-truth spread (agriculture tops, retail bottoms)
 * AC-4:  only1dAvailable=true when no 5d baseline exists (today's real shape)
 * AC-5:  classification=NEUTRAL under 1d-only mode (no stock has both 1d+5d data)
 * AC-6:  display sorted by avg1dReturn DESC when only1dAvailable=true
 *         → agriculture first / retail last (matches ground truth)
 * AC-7:  topInflow: up to 5 by avg1dReturn DESC; topOutflow: up to 5 by avg1dReturn ASC
 * AC-8:  summary.inflow/outflow/neutral counts correct
 * AC-9:  200-on-empty (empty sectors[], zeroed summary) when no price data
 * AC-10: 500 JSON on DB error (closed DB)
 * AC-11: priceSource always "stored" (no live fan-out)
 * AC-12: WITH 5d baseline → classification upgrades (DONG_TIEN_VAO/RA possible)
 *         AND display sorted by avg5dReturn DESC (NOT avg1dReturn)
 *
 * PRODUCTION-SHAPE SEEDS (Fixture A — TODAY's 2-day history shape):
 *   - 14 sectors from ground-truth contract (2026-06-11 live probe)
 *   - market_prices: 1 representative stock per sector with ground-truth avg change_pct
 *   - market_prices_history: 2 rows per code (2026-06-10 + 2026-06-11) — NO 5d window data
 *
 * FIXTURE B — WITH 5d baseline (proves auto-upgrade path):
 *   - 2 sectors: one with 5d inflow (all stocks +3% over 5d + +1% 1d),
 *     one with 5d outflow (all stocks -3% over 5d + -1% 1d)
 *   - market_prices_history: adds rows in the [now-8d, now-2d] window
 *   - Asserts: only1dAvailable=false, DONG_TIEN_VAO / DONG_TIEN_RA classifications,
 *     sort by avg5dReturn DESC (inflow sector first)
 *
 * DDD layer: interface + infrastructure + domain tested together at the handler seam.
 * Isolation: in-memory SQLite, reset per test via initDatabase().
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[TASK17-PAGE9] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  mapEntry,
  applySortOrder,
  buildSummary,
  handleGetSectorRotation,
  type SectorRotationResponse,
  type SectorRotationResponseEntry,
} from "../interface/mcp/routes/sectorRotationHandler.js";
import type { SectorRotationEntry } from "../domain/services/sectorRotationDetector.js";

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

function makeFakeReq(url: string = "/api/sector-rotation"): import("node:http").IncomingMessage {
  return { url } as import("node:http").IncomingMessage;
}

/** Insert a watchlist row */
function insertWatchlist(code: string, domain: string, exchange = "HOSE"): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO watchlist (code, domain, exchange, added_at) VALUES (?, ?, ?, ?)`,
    )
    .run(code, domain, exchange, "2026-06-01T00:00:00.000Z");
}

/** Insert a market_prices row */
function insertMarketPrice(
  code: string,
  price: number,
  changePct: number | null,
  updatedAt = "2026-06-11T12:00:00.000Z",
): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO market_prices (code, price, change_pct, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(code, price, changePct, updatedAt);
}

/** Insert a market_prices_history row */
function insertPriceHistory(
  code: string,
  price: number,
  fetchedAt: string,
  exchange = "HOSE",
): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at, exchange)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(code, price, 0, fetchedAt, exchange);
}

/**
 * Seed FIXTURE A — Production-shape corpus (2-day history only).
 *
 * Ground-truth avg change_pct per sector (router-computed 2026-06-11):
 *   agriculture +2.13, chemicals +1.24, other +0.40, utilities +0.18,
 *   machinery 0.0, real_estate -0.06, pharma -0.11, oil_gas -0.25,
 *   banking -0.34, aviation -0.46, steel -0.69, securities -0.88,
 *   tech -1.48, retail -1.66
 *
 * We seed one representative stock per sector for simplicity (n=1 per sector).
 * avg1dReturn for n=1 equals the change_pct value directly.
 * The ground truth includes multi-stock sectors; we use single stocks here to
 * keep the test deterministic — the focus is on the sort order and only1dAvailable flag.
 */
function seedFixtureA(): void {
  // Sectors in ground-truth order (avg 1d DESC)
  const sectors: Array<{ code: string; domain: string; changePct: number }> = [
    { code: "LT1", domain: "agriculture",  changePct: 2.13 },
    { code: "CH1", domain: "chemicals",    changePct: 1.24 },
    { code: "OT1", domain: "other",        changePct: 0.40 },
    { code: "UT1", domain: "utilities",    changePct: 0.18 },
    { code: "MC1", domain: "machinery",    changePct: 0.0  },
    { code: "RE1", domain: "real_estate",  changePct: -0.06 },
    { code: "PH1", domain: "pharma",       changePct: -0.11 },
    { code: "OG1", domain: "oil_gas",      changePct: -0.25 },
    { code: "BK1", domain: "banking",      changePct: -0.34 },
    { code: "AV1", domain: "aviation",     changePct: -0.46 },
    { code: "ST1", domain: "steel",        changePct: -0.69 },
    { code: "SC1", domain: "securities",   changePct: -0.88 },
    { code: "TC1", domain: "tech",         changePct: -1.48 },
    { code: "RT1", domain: "retail",       changePct: -1.66 },
  ];

  const basePrice = 10000;
  const updatedAt = "2026-06-11T12:00:00.000Z";

  for (const s of sectors) {
    insertWatchlist(s.code, s.domain);
    insertMarketPrice(s.code, basePrice, s.changePct, updatedAt);
    // 2-day history — both rows in the [now-2d, now] range, NOT in the [now-8d, now-2d] window
    insertPriceHistory(s.code, basePrice - 10, "2026-06-10T08:00:00.000Z");
    insertPriceHistory(s.code, basePrice,      "2026-06-11T08:00:00.000Z");
  }
}

/**
 * Seed FIXTURE B — 5d baseline available (proves auto-upgrade path).
 *
 * Two sectors:
 *   "banking" stock BKA: priceNow=12000, price5dAgo=10000 → +20% 5d, changePct=+3% 1d
 *     → ALL inflow: 5d>+2%, 1d>+0.5% → DONG_TIEN_VAO
 *   "steel" stock STA: priceNow=8000, price5dAgo=10000 → -20% 5d, changePct=-3% 1d
 *     → ALL outflow: 5d<-2%, 1d<-0.5% → DONG_TIEN_RA
 *
 * History rows placed at 2026-06-04T08:00Z (7 days before 2026-06-11), inside
 * the [now-8d, now-2d] window used by getHistoricalBaseline with lookbackDays=5.
 */
function seedFixtureB(now: Date): void {
  // Banking — inflow stock
  insertWatchlist("BKA", "banking");
  insertMarketPrice("BKA", 12000, 3.0, "2026-06-11T12:00:00.000Z");
  // 5d-ago row: 7 days before now → 2026-06-04T08:00Z — within [now-8d, now-2d] window
  const d7ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  insertPriceHistory("BKA", 10000, d7ago.toISOString());

  // Steel — outflow stock
  insertWatchlist("STA", "steel");
  insertMarketPrice("STA", 8000, -3.0, "2026-06-11T12:00:00.000Z");
  insertPriceHistory("STA", 10000, d7ago.toISOString());
}

// ─────────────────────────────────────────────────────────────────────────────
// mapEntry unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("mapEntry", () => {
  it("maps all fields from SectorRotationEntry to response shape", () => {
    const entry: SectorRotationEntry = {
      sector: "banking",
      sectorNameVi: "Ngân hàng",
      classification: "DONG_TIEN_VAO",
      avg5dReturn: 5.2,
      avg1dReturn: 1.1,
      stocks: ["VCB", "BID"],
      watchlistWarning: false,
    };
    const mapped = mapEntry(entry);
    expect(mapped.sector).toBe("banking");
    expect(mapped.sectorNameVi).toBe("Ngân hàng");
    expect(mapped.classification).toBe("DONG_TIEN_VAO");
    expect(mapped.avg5dReturn).toBe(5.2);
    expect(mapped.avg1dReturn).toBe(1.1);
    expect(mapped.stockCount).toBe(2);
    expect(mapped.stocks).toEqual(["VCB", "BID"]);
    expect(mapped.watchlistWarning).toBe(false);
  });

  it("stockCount = stocks.length (including empty)", () => {
    const entry: SectorRotationEntry = {
      sector: "tech",
      sectorNameVi: "Công nghệ",
      classification: "NEUTRAL",
      avg5dReturn: null,
      avg1dReturn: null,
      stocks: [],
      watchlistWarning: false,
    };
    const mapped = mapEntry(entry);
    expect(mapped.stockCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applySortOrder unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("applySortOrder", () => {
  const makeEntry = (sector: string, avg1d: number | null, avg5d: number | null): SectorRotationResponseEntry => ({
    sector,
    sectorNameVi: sector,
    classification: "NEUTRAL",
    avg1dReturn: avg1d,
    avg5dReturn: avg5d,
    stockCount: 1,
    stocks: [],
    watchlistWarning: false,
  });

  it("only1dAvailable=true → sorts by avg1dReturn DESC (nulls last)", () => {
    const sectors = [
      makeEntry("steel",  -0.69, null),
      makeEntry("agri",    2.13, null),
      makeEntry("banking", -0.34, null),
    ];
    const sorted = applySortOrder(sectors, true);
    expect(sorted[0]!.sector).toBe("agri");
    expect(sorted[1]!.sector).toBe("banking");
    expect(sorted[2]!.sector).toBe("steel");
  });

  it("only1dAvailable=false with 5d data → sorts by avg5dReturn DESC (nulls last)", () => {
    const sectors = [
      makeEntry("steel",   -0.69, -2.5),
      makeEntry("agri",     2.13,  8.0),
      makeEntry("banking", -0.34,  1.5),
    ];
    const sorted = applySortOrder(sectors, false);
    expect(sorted[0]!.sector).toBe("agri");   // avg5d=8.0
    expect(sorted[1]!.sector).toBe("banking");// avg5d=1.5
    expect(sorted[2]!.sector).toBe("steel");  // avg5d=-2.5
  });

  it("all avg5dReturn null → sorts by avg1dReturn DESC regardless of flag", () => {
    const sectors = [
      makeEntry("c", 0.5, null),
      makeEntry("a", 2.0, null),
      makeEntry("b", 1.0, null),
    ];
    const sorted = applySortOrder(sectors, false);
    expect(sorted[0]!.sector).toBe("a");
    expect(sorted[1]!.sector).toBe("b");
    expect(sorted[2]!.sector).toBe("c");
  });

  it("null avg1dReturn sorts last when sorting by 1d", () => {
    const sectors = [
      makeEntry("nullSector", null, null),
      makeEntry("posSector",  1.5,  null),
    ];
    const sorted = applySortOrder(sectors, true);
    expect(sorted[0]!.sector).toBe("posSector");
    expect(sorted[1]!.sector).toBe("nullSector");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSummary unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSummary", () => {
  const makeEntry = (
    sector: string,
    classification: string,
    avg1d: number | null,
  ): SectorRotationResponseEntry => ({
    sector,
    sectorNameVi: sector,
    classification,
    avg1dReturn: avg1d,
    avg5dReturn: null,
    stockCount: 1,
    stocks: [],
    watchlistWarning: false,
  });

  it("AC-8: counts inflow/outflow/neutral correctly", () => {
    const sectors = [
      makeEntry("a", "DONG_TIEN_VAO",  2.0),
      makeEntry("b", "DONG_TIEN_VAO",  1.5),
      makeEntry("c", "DONG_TIEN_RA",  -2.5),
      makeEntry("d", "NEUTRAL",         0.3),
      makeEntry("e", "NEUTRAL",        -0.1),
    ];
    const summary = buildSummary(sectors);
    expect(summary.inflow).toBe(2);
    expect(summary.outflow).toBe(1);
    expect(summary.neutral).toBe(2);
  });

  it("AC-7: topInflow = up to 5 by avg1dReturn DESC", () => {
    const sectors: SectorRotationResponseEntry[] = Array.from({ length: 8 }, (_, i) =>
      makeEntry(`s${i}`, "NEUTRAL", 8 - i),
    );
    const summary = buildSummary(sectors);
    expect(summary.topInflow).toHaveLength(5);
    expect(summary.topInflow[0]!.avg1dReturn).toBe(8);
    expect(summary.topInflow[4]!.avg1dReturn).toBe(4);
  });

  it("AC-7: topOutflow = up to 5 by avg1dReturn ASC (worst performers)", () => {
    const sectors: SectorRotationResponseEntry[] = Array.from({ length: 8 }, (_, i) =>
      makeEntry(`s${i}`, "NEUTRAL", 8 - i),
    );
    const summary = buildSummary(sectors);
    expect(summary.topOutflow).toHaveLength(5);
    // Sorted ASC: lowest avg1dReturn first
    expect(summary.topOutflow[0]!.avg1dReturn).toBe(1); // s7 (8-7=1)
    expect(summary.topOutflow[4]!.avg1dReturn).toBe(5); // s3 (8-3=5)
  });

  it("empty sectors → zeroed summary", () => {
    const summary = buildSummary([]);
    expect(summary.inflow).toBe(0);
    expect(summary.outflow).toBe(0);
    expect(summary.neutral).toBe(0);
    expect(summary.topInflow).toHaveLength(0);
    expect(summary.topOutflow).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetSectorRotation HTTP handler — FIXTURE A (2-day history / today shape)
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE9 — handleGetSectorRotation HTTP handler (Fixture A: 2-day history)", () => {
  it("AC-1: returns 200 JSON with required envelope fields", () => {
    seedFixtureA();
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(res.body) as SectorRotationResponse;
    expect(body.generatedAt).toBe(NOW_ISO);
    expect(typeof body.tradingDate).toBe("string");
    expect(body.priceSource).toBe("stored");
    expect(typeof body.only1dAvailable).toBe("boolean");
    expect(Array.isArray(body.sectors)).toBe(true);
    expect(typeof body.summary).toBe("object");
    expect(typeof body.count).toBe("number");
  });

  it("AC-11: priceSource is always 'stored'", () => {
    seedFixtureA();
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorRotationResponse;
    expect(body.priceSource).toBe("stored");
  });

  it("AC-2: 14 sectors aggregate from the 14-stock corpus", () => {
    seedFixtureA();
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorRotationResponse;
    expect(body.sectors).toHaveLength(14);
    expect(body.count).toBe(14);
  });

  it("AC-4: only1dAvailable=true when no 5d baseline", () => {
    seedFixtureA();
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorRotationResponse;
    expect(body.only1dAvailable).toBe(true);
  });

  it("AC-5: all sectors classified NEUTRAL under 1d-only mode", () => {
    seedFixtureA();
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorRotationResponse;
    // Under 1d-only: no stock has both 1d+5d data → all NEUTRAL
    const allNeutral = body.sectors.every((s) => s.classification === "NEUTRAL");
    expect(allNeutral).toBe(true);
    expect(body.summary.inflow).toBe(0);
    expect(body.summary.outflow).toBe(0);
    expect(body.summary.neutral).toBe(14);
  });

  it("AC-6: sorted by avg1dReturn DESC when only1dAvailable=true → agriculture first, retail last", () => {
    seedFixtureA();
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorRotationResponse;

    expect(body.only1dAvailable).toBe(true);
    // First sector = highest avg1dReturn = agriculture (+2.13)
    expect(body.sectors[0]!.sector).toBe("agriculture");
    // Last sector = lowest avg1dReturn = retail (-1.66)
    expect(body.sectors[body.sectors.length - 1]!.sector).toBe("retail");
  });

  it("AC-3: avg1dReturn values match ground-truth spread", () => {
    seedFixtureA();
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorRotationResponse;

    const byDomain = Object.fromEntries(
      body.sectors.map((s) => [s.sector, s.avg1dReturn]),
    ) as Record<string, number | null>;

    // Ground-truth values (single stock per sector → avg = that stock's changePct)
    expect(byDomain["agriculture"]).toBeCloseTo(2.13, 5);
    expect(byDomain["chemicals"]).toBeCloseTo(1.24, 5);
    expect(byDomain["other"]).toBeCloseTo(0.40, 5);
    expect(byDomain["utilities"]).toBeCloseTo(0.18, 5);
    expect(byDomain["machinery"]).toBeCloseTo(0.0, 5);
    expect(byDomain["real_estate"]).toBeCloseTo(-0.06, 5);
    expect(byDomain["pharma"]).toBeCloseTo(-0.11, 5);
    expect(byDomain["oil_gas"]).toBeCloseTo(-0.25, 5);
    expect(byDomain["banking"]).toBeCloseTo(-0.34, 5);
    expect(byDomain["aviation"]).toBeCloseTo(-0.46, 5);
    expect(byDomain["steel"]).toBeCloseTo(-0.69, 5);
    expect(byDomain["securities"]).toBeCloseTo(-0.88, 5);
    expect(byDomain["tech"]).toBeCloseTo(-1.48, 5);
    expect(byDomain["retail"]).toBeCloseTo(-1.66, 5);
  });

  it("AC-7: topInflow = top 5 by avg1dReturn DESC (agriculture first)", () => {
    seedFixtureA();
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorRotationResponse;

    expect(body.summary.topInflow).toHaveLength(5);
    expect(body.summary.topInflow[0]!.sector).toBe("agriculture");
    expect(body.summary.topInflow[1]!.sector).toBe("chemicals");
    // topInflow sorted DESC by avg1dReturn
    for (let i = 0; i < body.summary.topInflow.length - 1; i++) {
      const a = body.summary.topInflow[i]!.avg1dReturn ?? -Infinity;
      const b = body.summary.topInflow[i + 1]!.avg1dReturn ?? -Infinity;
      expect(a).toBeGreaterThanOrEqual(b);
    }
  });

  it("AC-7: topOutflow = top 5 by avg1dReturn ASC (retail first)", () => {
    seedFixtureA();
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorRotationResponse;

    expect(body.summary.topOutflow).toHaveLength(5);
    expect(body.summary.topOutflow[0]!.sector).toBe("retail");
    expect(body.summary.topOutflow[1]!.sector).toBe("tech");
    // topOutflow sorted ASC by avg1dReturn
    for (let i = 0; i < body.summary.topOutflow.length - 1; i++) {
      const a = body.summary.topOutflow[i]!.avg1dReturn ?? Infinity;
      const b = body.summary.topOutflow[i + 1]!.avg1dReturn ?? Infinity;
      expect(a).toBeLessThanOrEqual(b);
    }
  });

  it("count matches sectors.length", () => {
    seedFixtureA();
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorRotationResponse;
    expect(body.count).toBe(body.sectors.length);
  });

  it("each sector has stockCount matching stocks.length", () => {
    seedFixtureA();
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorRotationResponse;
    for (const s of body.sectors) {
      expect(s.stockCount).toBe(s.stocks.length);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetSectorRotation HTTP handler — Empty DB
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE9 — handleGetSectorRotation HTTP handler (empty DB)", () => {
  it("AC-9: returns 200 + empty sectors/zeroed summary when no price data", () => {
    // No seed — tables empty
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SectorRotationResponse;
    expect(body.sectors).toHaveLength(0);
    expect(body.count).toBe(0);
    expect(body.tradingDate).toBe("");
    expect(body.priceSource).toBe("stored");
    expect(body.summary.inflow).toBe(0);
    expect(body.summary.outflow).toBe(0);
    expect(body.summary.neutral).toBe(0);
    expect(body.summary.topInflow).toHaveLength(0);
    expect(body.summary.topOutflow).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetSectorRotation HTTP handler — DB error
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE9 — handleGetSectorRotation HTTP handler (DB error)", () => {
  it("AC-10: returns 500 JSON on DB error (closed DB)", () => {
    const db = getDb();
    closeDb(); // Force DB error

    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, db, NOW);

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetSectorRotation HTTP handler — FIXTURE B (5d baseline → auto-upgrade)
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE9 — handleGetSectorRotation HTTP handler (Fixture B: 5d baseline)", () => {
  it("AC-12: only1dAvailable=false when 5d baseline exists", () => {
    seedFixtureB(NOW);
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorRotationResponse;
    expect(body.only1dAvailable).toBe(false);
  });

  it("AC-12: banking sector classifies DONG_TIEN_VAO (+20% 5d, +3% 1d)", () => {
    seedFixtureB(NOW);
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorRotationResponse;

    const banking = body.sectors.find((s) => s.sector === "banking");
    expect(banking).toBeDefined();
    expect(banking!.classification).toBe("DONG_TIEN_VAO");
  });

  it("AC-12: steel sector classifies DONG_TIEN_RA (-20% 5d, -3% 1d)", () => {
    seedFixtureB(NOW);
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorRotationResponse;

    const steel = body.sectors.find((s) => s.sector === "steel");
    expect(steel).toBeDefined();
    expect(steel!.classification).toBe("DONG_TIEN_RA");
  });

  it("AC-12: display sorted by avg5dReturn DESC (banking first, steel last)", () => {
    seedFixtureB(NOW);
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorRotationResponse;

    expect(body.only1dAvailable).toBe(false);
    // banking has +20% 5d, steel has -20% 5d → banking first
    expect(body.sectors[0]!.sector).toBe("banking");
    expect(body.sectors[body.sectors.length - 1]!.sector).toBe("steel");
  });

  it("AC-12: summary.inflow=1 (banking), outflow=1 (steel)", () => {
    seedFixtureB(NOW);
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorRotationResponse;
    expect(body.summary.inflow).toBe(1);
    expect(body.summary.outflow).toBe(1);
    expect(body.summary.neutral).toBe(0);
  });

  it("avg5dReturn is non-null when 5d baseline exists", () => {
    seedFixtureB(NOW);
    const res = makeMockRes();
    handleGetSectorRotation(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb(), NOW);
    const body = JSON.parse(res.body) as SectorRotationResponse;

    for (const s of body.sectors) {
      expect(s.avg5dReturn).not.toBeNull();
    }
  });
});
