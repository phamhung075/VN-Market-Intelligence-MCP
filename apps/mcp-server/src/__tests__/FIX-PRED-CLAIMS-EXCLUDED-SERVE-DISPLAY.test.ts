/**
 * FIX-PRED-CLAIMS-EXCLUDED-SERVE-DISPLAY
 *
 * Tests for the "excluded" outcome support in prediction-claims serve layer.
 *
 * AC-EX-1:  is_excluded=1 row → mapOutcome returns "excluded" (NOT "pending")
 * AC-EX-2:  is_excluded=0 row with null resolution_outcome → "pending" (unchanged)
 * AC-EX-3:  computeCalibration — is_excluded=1 row goes into `excluded` bucket,
 *           NOT into `pending`; total still counts it
 * AC-EX-4:  computeCalibration.excluded field exists and equals count of is_excluded=1 rows
 * AC-EX-5:  hitRate unchanged — excluded does NOT enter correct+wrong denominator
 * AC-EX-6:  ?outcome=excluded filter returns only is_excluded=1 rows via HTTP handler
 * AC-EX-7:  ?outcome=pending filter excludes is_excluded=1 rows (they are NOT pending)
 * AC-EX-8:  calibration.excluded=3, pending=0 when 3 excluded rows in DB + 0 true pending
 * AC-EX-9:  getAllClaimsForTracker(db, limit, "excluded") returns only is_excluded=1 rows
 * AC-EX-10: getAllClaimsForTracker(db, limit, "pending") excludes is_excluded=1 rows
 *
 * Shared contract confirmed:
 *   - outcome field literal: "excluded"
 *   - calibration.excluded: number
 *   - pending does NOT count excluded rows
 *
 * DDD layer: interface + infrastructure tested together at handler + store seam.
 * Isolation: in-memory SQLite, reset per test.
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[FIX-PRED-EXCL] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  insertPredictionClaim,
  resolveClaim,
  excludeClaim,
  getAllClaimsForTracker,
} from "../infrastructure/db/predictionClaimStore.js";
import type { PredictionClaimRow } from "../infrastructure/db/predictionClaimStore.js";
import {
  mapOutcome,
  computeCalibration,
  handleGetPredictionClaims,
  type PredictionClaimsResponse,
} from "../interface/mcp/routes/predictionClaimsHandler.js";

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

function makeFakeReq(url: string): import("node:http").IncomingMessage {
  return { url } as import("node:http").IncomingMessage;
}

/**
 * Seed an excluded claim (is_excluded=1, resolution_outcome NULL — mirrors live FPT/VNINDEX/GAS).
 *
 * FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT: insertPredictionClaim() now
 * REFUSES any insert with a null/missing creation_price (store-boundary Zod
 * contract) — these excluded rows deliberately simulate the LEGACY (pre-fix)
 * no-baseline-price shape (see claim_text), so they must be seeded via a
 * direct raw SQL INSERT that bypasses the store's write-door, same pattern as
 * TASK17-PRED-prediction-claims-endpoint.test.ts's seedNeutralNullClaim().
 */
function seedExcludedClaim(stock: string, resolutionDate: string): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO prediction_claims
         (stock, agent_id, claim_text, direction, target_price, creation_price,
          resolution_date, confidence)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)`,
    )
    .run(
      stock,
      "08-prediction-synthesizer",
      `${stock} đi ngang (legacy, không có giá tạo)`,
      "neutral",
      resolutionDate,
      0.5,
    );
  const id = result.lastInsertRowid as number;
  if (id > 0) {
    excludeClaim(db, id);
  }
  return id;
}

/** Seed a genuine pending claim (resolution_outcome NULL, is_excluded=0). */
function seedPendingClaim(stock: string, resolutionDate: string): number {
  const db = getDb();
  return insertPredictionClaim(db, {
    stock,
    agent_id: "08-prediction-synthesizer",
    claim_text: `${stock} tăng trong tháng tới`,
    direction: "bullish",
    target_price: 95000,
    creation_price: 88000,
    resolution_date: resolutionDate,
    confidence: 0.7,
  });
}

/** Seed a correct resolved claim. */
function seedCorrectClaim(stock: string, resolutionDate: string): number {
  const db = getDb();
  const id = insertPredictionClaim(db, {
    stock,
    agent_id: "08-prediction-synthesizer",
    claim_text: `${stock} tăng`,
    direction: "bullish",
    target_price: 100000,
    creation_price: 90000,
    resolution_date: resolutionDate,
    confidence: 0.76,
  });
  if (id > 0) {
    resolveClaim(db, id, 1, 105000);
  }
  return id;
}

/** Build a minimal PredictionClaimRow with is_excluded set. */
function makeExcludedRow(overrides: Partial<PredictionClaimRow> = {}): PredictionClaimRow {
  return {
    id: 1,
    stock: "FPT",
    agent_id: "08-prediction-synthesizer",
    claim_text: "FPT đi ngang (legacy)",
    direction: "neutral",
    target_price: null,
    creation_price: null,
    resolution_date: "2026-01-01",
    confidence: 0.5,
    resolution_outcome: null,
    actual_price: null,
    brier_score: null,
    is_excluded: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    resolved_at: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

/** Build a minimal PredictionClaimRow that is genuinely pending (not excluded). */
function makePendingRow(overrides: Partial<PredictionClaimRow> = {}): PredictionClaimRow {
  return {
    id: 2,
    stock: "HPG",
    agent_id: "08-prediction-synthesizer",
    claim_text: "HPG tăng",
    direction: "bullish",
    target_price: 30000,
    creation_price: 28000,
    resolution_date: "2026-07-01",
    confidence: 0.65,
    resolution_outcome: null,
    actual_price: null,
    brier_score: null,
    is_excluded: 0,
    created_at: "2026-06-01T00:00:00.000Z",
    resolved_at: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-EX-1 + AC-EX-2: mapOutcome with is_excluded flag
// ─────────────────────────────────────────────────────────────────────────────

describe("mapOutcome — excluded awareness", () => {
  it("AC-EX-1: is_excluded=1 + resolution_outcome null → 'excluded'", () => {
    expect(mapOutcome(null, 1)).toBe("excluded");
  });

  it("AC-EX-1: is_excluded=1 takes PRECEDENCE over resolution_outcome (even if null)", () => {
    // is_excluded=1 should always win
    expect(mapOutcome(null, 1)).toBe("excluded");
  });

  it("AC-EX-2: is_excluded=0 + resolution_outcome null → 'pending' (unchanged)", () => {
    expect(mapOutcome(null, 0)).toBe("pending");
  });

  it("AC-EX-2: is_excluded=undefined (old call site) + null → 'pending' (backward compat)", () => {
    expect(mapOutcome(null, undefined)).toBe("pending");
  });

  it("correct claim (outcome=1) always stays 'correct' regardless of is_excluded", () => {
    expect(mapOutcome(1, 0)).toBe("correct");
  });

  it("wrong claim (outcome=0) always stays 'wrong' regardless of is_excluded", () => {
    expect(mapOutcome(0, 0)).toBe("wrong");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-EX-3..AC-EX-5: computeCalibration with excluded rows
// ─────────────────────────────────────────────────────────────────────────────

describe("computeCalibration — excluded bucket", () => {
  it("AC-EX-3: excluded row goes into excluded bucket, NOT pending", () => {
    const rows: PredictionClaimRow[] = [makeExcludedRow()];
    const cal = computeCalibration(rows);
    expect(cal.excluded).toBe(1);
    expect(cal.pending).toBe(0);
    expect(cal.total).toBe(1);
  });

  it("AC-EX-4: calibration object has excluded field", () => {
    const cal = computeCalibration([]);
    expect("excluded" in cal).toBe(true);
    expect(cal.excluded).toBe(0);
  });

  it("AC-EX-5: hitRate unchanged — excluded NOT in denominator", () => {
    // 1 correct + 1 excluded → hitRate = 1/1 = 1.0 (not 1/2)
    const rows: PredictionClaimRow[] = [
      {
        id: 1, stock: "VCB", agent_id: "a", claim_text: "t", direction: "bullish",
        target_price: 100000, creation_price: 90000, resolution_date: "2026-04-01",
        confidence: 0.76, resolution_outcome: 1, actual_price: 105000, brier_score: 0.0576,
        is_excluded: 0,
        created_at: "2026-03-01T00:00:00.000Z", resolved_at: "2026-04-02T00:00:00.000Z",
      },
      makeExcludedRow({ id: 2 }),
    ];
    const cal = computeCalibration(rows);
    expect(cal.correct).toBe(1);
    expect(cal.wrong).toBe(0);
    expect(cal.excluded).toBe(1);
    expect(cal.pending).toBe(0);
    expect(cal.resolved).toBe(1); // only correct+wrong
    expect(cal.hitRate).toBe(1.0);
  });

  it("3 excluded + 0 pending → excluded=3, pending=0", () => {
    const rows: PredictionClaimRow[] = [
      makeExcludedRow({ id: 1, stock: "FPT" }),
      makeExcludedRow({ id: 8, stock: "VNINDEX" }),
      makeExcludedRow({ id: 9, stock: "GAS" }),
    ];
    const cal = computeCalibration(rows);
    expect(cal.excluded).toBe(3);
    expect(cal.pending).toBe(0);
    expect(cal.total).toBe(3);
    expect(cal.resolved).toBe(0);
    expect(cal.hitRate).toBeNull();
  });

  it("mixed: 3 correct + 1 wrong + 3 excluded + 0 pending → correct stats", () => {
    const rows: PredictionClaimRow[] = [
      // correct x3
      { id: 1, stock: "FPT", agent_id: "a", claim_text: "c1", direction: "bullish", target_price: 100000, creation_price: 90000, resolution_date: "2026-04-01", confidence: 0.76, resolution_outcome: 1, actual_price: 105000, brier_score: 0.0576, is_excluded: 0, created_at: "2026-03-01T00:00:00.000Z", resolved_at: "2026-04-02T00:00:00.000Z" },
      { id: 2, stock: "BID", agent_id: "a", claim_text: "c2", direction: "bullish", target_price: 50000, creation_price: 46000, resolution_date: "2026-04-15", confidence: 0.77, resolution_outcome: 1, actual_price: 52000, brier_score: 0.0529, is_excluded: 0, created_at: "2026-03-15T00:00:00.000Z", resolved_at: "2026-04-16T00:00:00.000Z" },
      { id: 3, stock: "VIC", agent_id: "a", claim_text: "c3", direction: "bullish", target_price: 60000, creation_price: 55000, resolution_date: "2026-05-01", confidence: 0.79, resolution_outcome: 1, actual_price: 63000, brier_score: 0.0441, is_excluded: 0, created_at: "2026-04-01T00:00:00.000Z", resolved_at: "2026-05-02T00:00:00.000Z" },
      // wrong x1
      { id: 4, stock: "HPG", agent_id: "a", claim_text: "c4", direction: "bearish", target_price: 30000, creation_price: 35000, resolution_date: "2026-05-15", confidence: 0.37, resolution_outcome: 0, actual_price: 38000, brier_score: 0.1369, is_excluded: 0, created_at: "2026-04-15T00:00:00.000Z", resolved_at: "2026-05-16T00:00:00.000Z" },
      // excluded x3 (legacy: ids 1,8,9 from live DB)
      makeExcludedRow({ id: 5, stock: "FPT_LEGACY" }),
      makeExcludedRow({ id: 8, stock: "VNINDEX" }),
      makeExcludedRow({ id: 9, stock: "GAS" }),
    ];
    const cal = computeCalibration(rows);
    expect(cal.total).toBe(7);
    expect(cal.correct).toBe(3);
    expect(cal.wrong).toBe(1);
    expect(cal.excluded).toBe(3);
    expect(cal.pending).toBe(0);
    expect(cal.resolved).toBe(4); // correct + wrong only
    expect(cal.hitRate).toBe(0.75); // 3/4
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-EX-6..AC-EX-8: HTTP handler integration tests
// ─────────────────────────────────────────────────────────────────────────────

describe("handleGetPredictionClaims — excluded outcome", () => {
  it("AC-EX-6: ?outcome=excluded returns only excluded rows", () => {
    seedExcludedClaim("FPT", "2026-01-01");
    seedPendingClaim("HPG", "2026-07-01");
    seedCorrectClaim("VCB", "2026-04-01");

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims?outcome=excluded"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    expect(res.statusCode).toBe(200);
    expect(body.claims.length).toBe(1);
    expect(body.claims[0]!.outcome).toBe("excluded");
    expect(body.claims[0]!.stock).toBe("FPT");
  });

  it("AC-EX-7: ?outcome=pending excludes is_excluded=1 rows", () => {
    seedExcludedClaim("FPT", "2026-01-01");
    seedExcludedClaim("VNINDEX", "2026-01-02");
    seedPendingClaim("HPG", "2026-07-01");

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims?outcome=pending"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    expect(body.claims.every((c) => c.outcome === "pending")).toBe(true);
    // Only HPG is genuinely pending — FPT/VNINDEX are excluded
    expect(body.claims).toHaveLength(1);
    expect(body.claims[0]!.stock).toBe("HPG");
  });

  it("AC-EX-8: 3 excluded rows → calibration.excluded=3, calibration.pending=0", () => {
    seedExcludedClaim("FPT", "2026-01-01");
    seedExcludedClaim("VNINDEX", "2026-01-02");
    seedExcludedClaim("GAS", "2026-01-03");

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    const cal = body.calibration;
    expect(cal.excluded).toBe(3);
    expect(cal.pending).toBe(0);
    expect(cal.total).toBe(3);
    expect(cal.resolved).toBe(0);
    expect(cal.hitRate).toBeNull();
  });

  it("excluded rows appear in unfiltered claim list with outcome='excluded'", () => {
    seedExcludedClaim("FPT", "2026-01-01");
    seedCorrectClaim("VCB", "2026-04-01");

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    const outcomes = body.claims.map((c) => c.outcome);
    expect(outcomes).toContain("excluded");
    expect(outcomes).toContain("correct");
    // excluded row must NOT appear as "pending"
    const fptClaim = body.claims.find((c) => c.stock === "FPT");
    expect(fptClaim).toBeDefined();
    expect(fptClaim!.outcome).toBe("excluded");
    expect(fptClaim!.outcome).not.toBe("pending");
  });

  it("calibration is unfiltered — excluded count correct even when ?outcome=correct", () => {
    seedExcludedClaim("FPT", "2026-01-01");
    seedCorrectClaim("VCB", "2026-04-01");

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims?outcome=correct"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    // claims[] filtered to correct only
    expect(body.claims).toHaveLength(1);
    expect(body.claims[0]!.outcome).toBe("correct");
    // calibration still covers ALL rows
    expect(body.calibration.excluded).toBe(1);
    expect(body.calibration.total).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-EX-9 + AC-EX-10: getAllClaimsForTracker store-level tests
// ─────────────────────────────────────────────────────────────────────────────

describe("getAllClaimsForTracker — excluded filter", () => {
  it("AC-EX-9: outcome='excluded' returns only is_excluded=1 rows", () => {
    seedExcludedClaim("FPT", "2026-01-01");
    seedExcludedClaim("VNINDEX", "2026-01-02");
    seedPendingClaim("HPG", "2026-07-01");
    seedCorrectClaim("VCB", "2026-04-01");

    const db = getDb();
    const rows = getAllClaimsForTracker(db, 100, "excluded");
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.is_excluded === 1)).toBe(true);
  });

  it("AC-EX-10: outcome='pending' does NOT return is_excluded=1 rows", () => {
    seedExcludedClaim("FPT", "2026-01-01");
    seedExcludedClaim("GAS", "2026-01-03");
    seedPendingClaim("HPG", "2026-07-01");

    const db = getDb();
    const rows = getAllClaimsForTracker(db, 100, "pending");
    // Only HPG should be returned
    expect(rows.length).toBe(1);
    expect(rows[0]!.stock).toBe("HPG");
    expect(rows.every((r) => (r.is_excluded ?? 0) === 0)).toBe(true);
  });

  it("outcome='excluded' returns empty array when no excluded rows", () => {
    seedPendingClaim("HPG", "2026-07-01");
    seedCorrectClaim("VCB", "2026-04-01");

    const db = getDb();
    const rows = getAllClaimsForTracker(db, 100, "excluded");
    expect(rows).toHaveLength(0);
  });

  it("no filter — unfiltered list includes excluded rows", () => {
    seedExcludedClaim("FPT", "2026-01-01");
    seedPendingClaim("HPG", "2026-07-01");

    const db = getDb();
    const rows = getAllClaimsForTracker(db, 100);
    expect(rows.length).toBe(2);
    const excludedRow = rows.find((r) => r.stock === "FPT");
    expect(excludedRow).toBeDefined();
    expect(excludedRow!.is_excluded).toBe(1);
  });
});
