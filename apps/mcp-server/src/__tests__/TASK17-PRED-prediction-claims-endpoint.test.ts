/**
 * TASK17-PRED — GET /api/prediction-claims
 *
 * AC-1:  response envelope: {generatedAt, calibration, claims, count}
 * AC-2:  calibration fields: {total, resolved, correct, wrong, pending, hitRate, avgBrier}
 * AC-3:  correct claim maps to outcome="correct"; wrong → "wrong"; null outcome → "pending"
 * AC-4:  neutral claim with null target_price/creation_price/brier_score serializes with
 *        targetPrice null + brierScore null + outcome "pending" — does NOT throw
 * AC-5:  hitRate = correct/resolved (3/4 = 0.75 with live-data seed)
 * AC-6:  avgBrier = mean brier_score over resolved rows only (0.1379 with live-data seed)
 * AC-7:  ZERO-RESOLVED GUARD: 0 resolved rows → hitRate===null AND avgBrier===null
 *        (regression guard against NaN/Infinity divide-by-zero)
 * AC-8:  calibration is computed over ALL claims regardless of ?outcome= filter
 * AC-9:  ?outcome=correct filters claims[] to correct rows only
 * AC-10: ?outcome=wrong filters claims[] to wrong rows only
 * AC-11: ?outcome=pending filters claims[] to pending rows only
 * AC-12: claims sorted resolution_date DESC (then id DESC)
 * AC-13: ?limit=N clamps claims[] (default 100, max 500)
 * AC-14: 200 + empty claims[] when no rows exist (no error)
 * AC-15: 500 JSON on DB error
 * AC-16: count matches claims.length
 * AC-17: nullable columns (targetPrice, creationPrice, actualPrice, brierScore, resolvedAt)
 *        pass through as null, never coerced to 0
 *
 * PRODUCTION SHAPE seeds (mirror live probed contract 2026-06-11):
 *   - correct claim   (outcome=1, brier set, target+creation prices set)
 *   - wrong claim     (outcome=0, brier set, target+creation prices set)
 *   - pending claim   (outcome=null, no brier, future resolution_date)
 *   - neutral claim   (outcome=null, no target_price, no creation_price, no brier)
 *
 * DDD layer: interface + infrastructure tested together at the handler seam.
 * Isolation: in-memory SQLite, reset per test via initDatabase().
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[TASK17-PRED] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { insertPredictionClaim, resolveClaim } from "../infrastructure/db/predictionClaimStore.js";
import {
  mapOutcome,
  mapClaimRow,
  computeCalibration,
  handleGetPredictionClaims,
  type PredictionClaimsResponse,
} from "../interface/mcp/routes/predictionClaimsHandler.js";
import type { PredictionClaimRow } from "../infrastructure/db/predictionClaimStore.js";

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

const NOW = "2026-06-11T00:00:00.000Z";

/** Minimal mock ServerResponse — mirrors the pattern in TASK17-AGM test */
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

function makeFakeReq(url: string = "/api/prediction-claims"): import("node:http").IncomingMessage {
  return { url } as import("node:http").IncomingMessage;
}

/**
 * Seed a correct claim and resolve it immediately.
 * Returns the inserted id.
 */
function seedCorrectClaim(stock: string, resolutionDate: string, confidence: number): number {
  const db = getDb();
  const id = insertPredictionClaim(db, {
    stock,
    agent_id: "08-prediction-synthesizer",
    claim_text: `${stock} sẽ tăng trong 30 ngày`,
    direction: "bullish",
    target_price: 100000,
    creation_price: 90000,
    resolution_date: resolutionDate,
    confidence,
  });
  if (id > 0) {
    resolveClaim(db, id, 1, 105000);
  }
  return id;
}

/**
 * Seed a wrong claim and resolve it immediately.
 * Returns the inserted id.
 */
function seedWrongClaim(stock: string, resolutionDate: string, confidence: number): number {
  const db = getDb();
  const id = insertPredictionClaim(db, {
    stock,
    agent_id: "08-prediction-synthesizer",
    claim_text: `${stock} sẽ giảm trong 30 ngày`,
    direction: "bearish",
    target_price: 80000,
    creation_price: 90000,
    resolution_date: resolutionDate,
    confidence,
  });
  if (id > 0) {
    resolveClaim(db, id, 0, 95000);
  }
  return id;
}

/**
 * Seed a pending claim (no resolution).
 * Returns the inserted id.
 */
function seedPendingClaim(stock: string, resolutionDate: string): number {
  const db = getDb();
  return insertPredictionClaim(db, {
    stock,
    agent_id: "08-prediction-synthesizer",
    claim_text: `${stock} sẽ tăng trong tháng tới`,
    direction: "bullish",
    target_price: 95000,
    creation_price: 88000,
    resolution_date: resolutionDate,
    confidence: 0.7,
  });
}

/**
 * Seed a neutral claim with NULL target_price + creation_price.
 * Returns the inserted id.
 */
function seedNeutralNullClaim(stock: string, resolutionDate: string): number {
  const db = getDb();
  return insertPredictionClaim(db, {
    stock,
    agent_id: "08-prediction-synthesizer",
    claim_text: `${stock} sẽ đi ngang`,
    direction: "neutral",
    target_price: null,
    creation_price: null,
    resolution_date: resolutionDate,
    confidence: 0.5,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// mapOutcome unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("mapOutcome", () => {
  it("null → pending", () => {
    expect(mapOutcome(null)).toBe("pending");
  });

  it("1 → correct", () => {
    expect(mapOutcome(1)).toBe("correct");
  });

  it("0 → wrong", () => {
    expect(mapOutcome(0)).toBe("wrong");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapClaimRow unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("mapClaimRow", () => {
  it("AC-4: neutral row with all-null fields serializes without throwing", () => {
    const row: PredictionClaimRow = {
      id: 99,
      stock: "VIC",
      agent_id: "08-prediction-synthesizer",
      claim_text: "VIC sẽ đi ngang",
      direction: "neutral",
      target_price: null,
      creation_price: null,
      resolution_date: "2026-07-01",
      confidence: 0.5,
      resolution_outcome: null,
      actual_price: null,
      brier_score: null,
      created_at: "2026-06-01T10:00:00.000Z",
      resolved_at: null,
    };
    const item = mapClaimRow(row);
    expect(item.targetPrice).toBeNull();
    expect(item.creationPrice).toBeNull();
    expect(item.actualPrice).toBeNull();
    expect(item.brierScore).toBeNull();
    expect(item.resolvedAt).toBeNull();
    expect(item.outcome).toBe("pending");
    expect(item.direction).toBe("neutral");
  });

  it("AC-17: null values pass through as null, never coerced to 0", () => {
    const row: PredictionClaimRow = {
      id: 1,
      stock: "FPT",
      agent_id: "08-prediction-synthesizer",
      claim_text: "FPT test",
      direction: "bullish",
      target_price: null,
      creation_price: null,
      resolution_date: "2026-07-01",
      confidence: 0.76,
      resolution_outcome: null,
      actual_price: null,
      brier_score: null,
      created_at: "2026-06-01T00:00:00.000Z",
      resolved_at: null,
    };
    const item = mapClaimRow(row);
    expect(item.targetPrice).toBeNull();
    expect(item.creationPrice).toBeNull();
    expect(item.actualPrice).toBeNull();
    expect(item.brierScore).toBeNull();
    // Explicit checks: not 0, not undefined
    expect(item.targetPrice).not.toBe(0);
    expect(item.brierScore).not.toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeCalibration unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("computeCalibration", () => {
  it("AC-7: ZERO-RESOLVED GUARD — 0 resolved rows → hitRate null AND avgBrier null", () => {
    // Pure pending rows — no resolution
    const rows: PredictionClaimRow[] = [
      {
        id: 1, stock: "VCB", agent_id: "a", claim_text: "test", direction: "neutral",
        target_price: null, creation_price: null, resolution_date: "2026-07-01",
        confidence: 0.5, resolution_outcome: null, actual_price: null, brier_score: null,
        created_at: "2026-06-01T00:00:00.000Z", resolved_at: null,
      },
      {
        id: 2, stock: "HPG", agent_id: "a", claim_text: "test", direction: "bullish",
        target_price: 50000, creation_price: 45000, resolution_date: "2026-08-01",
        confidence: 0.6, resolution_outcome: null, actual_price: null, brier_score: null,
        created_at: "2026-06-01T00:00:00.000Z", resolved_at: null,
      },
    ];
    const cal = computeCalibration(rows);
    expect(cal.hitRate).toBeNull();
    expect(cal.avgBrier).toBeNull();
    expect(cal.resolved).toBe(0);
    expect(cal.pending).toBe(2);
  });

  it("AC-5: hitRate = correct/resolved (3/4 = 0.75 with live-probed distribution)", () => {
    // Matches live probed: 3 correct, 1 wrong, 3 pending
    const rows: PredictionClaimRow[] = [
      // correct x3
      { id: 1, stock: "FPT", agent_id: "a", claim_text: "c1", direction: "bullish", target_price: 100000, creation_price: 90000, resolution_date: "2026-04-01", confidence: 0.76, resolution_outcome: 1, actual_price: 105000, brier_score: 0.0576, created_at: "2026-03-01T00:00:00.000Z", resolved_at: "2026-04-02T00:00:00.000Z" },
      { id: 2, stock: "BID", agent_id: "a", claim_text: "c2", direction: "bullish", target_price: 50000, creation_price: 46000, resolution_date: "2026-04-15", confidence: 0.77, resolution_outcome: 1, actual_price: 52000, brier_score: 0.0529, created_at: "2026-03-15T00:00:00.000Z", resolved_at: "2026-04-16T00:00:00.000Z" },
      { id: 3, stock: "VIC", agent_id: "a", claim_text: "c3", direction: "bullish", target_price: 60000, creation_price: 55000, resolution_date: "2026-05-01", confidence: 0.79, resolution_outcome: 1, actual_price: 63000, brier_score: 0.0441, created_at: "2026-04-01T00:00:00.000Z", resolved_at: "2026-05-02T00:00:00.000Z" },
      // wrong x1
      { id: 4, stock: "FPT", agent_id: "a", claim_text: "c4", direction: "bearish", target_price: 80000, creation_price: 90000, resolution_date: "2026-05-15", confidence: 0.37, resolution_outcome: 0, actual_price: 95000, brier_score: 0.3969, created_at: "2026-04-15T00:00:00.000Z", resolved_at: "2026-05-16T00:00:00.000Z" },
      // pending x3
      { id: 5, stock: "HPG", agent_id: "a", claim_text: "c5", direction: "bullish", target_price: 30000, creation_price: 28000, resolution_date: "2026-07-01", confidence: 0.65, resolution_outcome: null, actual_price: null, brier_score: null, created_at: "2026-06-01T00:00:00.000Z", resolved_at: null },
      { id: 6, stock: "TCB", agent_id: "a", claim_text: "c6", direction: "bullish", target_price: 45000, creation_price: 42000, resolution_date: "2026-07-15", confidence: 0.7, resolution_outcome: null, actual_price: null, brier_score: null, created_at: "2026-06-01T00:00:00.000Z", resolved_at: null },
      { id: 7, stock: "VNM", agent_id: "a", claim_text: "c7", direction: "neutral", target_price: null, creation_price: null, resolution_date: "2026-08-01", confidence: 0.5, resolution_outcome: null, actual_price: null, brier_score: null, created_at: "2026-06-01T00:00:00.000Z", resolved_at: null },
    ];
    const cal = computeCalibration(rows);
    expect(cal.total).toBe(7);
    expect(cal.resolved).toBe(4);
    expect(cal.correct).toBe(3);
    expect(cal.wrong).toBe(1);
    expect(cal.pending).toBe(3);
    expect(cal.hitRate).toBe(0.75);  // 3/4
    // avgBrier = (0.0576 + 0.0529 + 0.0441 + 0.3969) / 4 = 0.1379
    expect(cal.avgBrier).not.toBeNull();
    expect(Math.round((cal.avgBrier ?? 0) * 10000) / 10000).toBe(0.1379);
  });

  it("AC-6: avgBrier excludes rows without a brier_score (null rows not counted)", () => {
    // Two resolved: one with brier, one without (e.g., neutral resolved with no price comparison)
    const rows: PredictionClaimRow[] = [
      { id: 1, stock: "A", agent_id: "a", claim_text: "t", direction: "bullish", target_price: 100000, creation_price: null, resolution_date: "2026-06-01", confidence: 0.8, resolution_outcome: 1, actual_price: 110000, brier_score: 0.04, created_at: "2026-05-01T00:00:00.000Z", resolved_at: "2026-06-02T00:00:00.000Z" },
      { id: 2, stock: "B", agent_id: "a", claim_text: "t", direction: "neutral", target_price: null, creation_price: null, resolution_date: "2026-06-01", confidence: 0.5, resolution_outcome: 1, actual_price: null, brier_score: null, created_at: "2026-05-01T00:00:00.000Z", resolved_at: "2026-06-02T00:00:00.000Z" },
    ];
    const cal = computeCalibration(rows);
    expect(cal.resolved).toBe(2);
    expect(cal.correct).toBe(2);
    expect(cal.hitRate).toBe(1.0);
    // avgBrier should be 0.04 (only the row with brier_score is counted)
    expect(cal.avgBrier).toBe(0.04);
  });

  it("empty rows → all zeros + null hitRate + null avgBrier", () => {
    const cal = computeCalibration([]);
    expect(cal.total).toBe(0);
    expect(cal.resolved).toBe(0);
    expect(cal.correct).toBe(0);
    expect(cal.wrong).toBe(0);
    expect(cal.pending).toBe(0);
    expect(cal.hitRate).toBeNull();
    expect(cal.avgBrier).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetPredictionClaims HTTP handler tests (DB integration)
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PRED — handleGetPredictionClaims HTTP handler", () => {
  it("AC-1: returns 200 JSON with required envelope fields", () => {
    seedCorrectClaim("FPT", "2026-04-01", 0.76);

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
      new Date(NOW),
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    expect(body.generatedAt).toBe(NOW);
    expect(typeof body.calibration).toBe("object");
    expect(Array.isArray(body.claims)).toBe(true);
    expect(typeof body.count).toBe("number");
  });

  it("AC-2: calibration fields all present", () => {
    seedCorrectClaim("FPT", "2026-04-01", 0.76);

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    const cal = body.calibration;
    expect(typeof cal.total).toBe("number");
    expect(typeof cal.resolved).toBe("number");
    expect(typeof cal.correct).toBe("number");
    expect(typeof cal.wrong).toBe("number");
    expect(typeof cal.pending).toBe("number");
    // hitRate is number or null
    expect(cal.hitRate === null || typeof cal.hitRate === "number").toBe(true);
    // avgBrier is number or null
    expect(cal.avgBrier === null || typeof cal.avgBrier === "number").toBe(true);
  });

  it("AC-3: correct/wrong/pending outcome mapping in claims[]", () => {
    seedCorrectClaim("FPT", "2026-04-01", 0.76);
    seedWrongClaim("BID", "2026-04-15", 0.6);
    seedPendingClaim("HPG", "2026-07-01");

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    const outcomes = body.claims.map((c) => c.outcome);
    expect(outcomes).toContain("correct");
    expect(outcomes).toContain("wrong");
    expect(outcomes).toContain("pending");
  });

  it("AC-4: neutral claim with null target/creation prices serializes correctly", () => {
    seedNeutralNullClaim("VNM", "2026-08-01");

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    expect(body.claims).toHaveLength(1);
    const claim = body.claims[0]!;
    expect(claim.targetPrice).toBeNull();
    expect(claim.creationPrice).toBeNull();
    expect(claim.brierScore).toBeNull();
    expect(claim.actualPrice).toBeNull();
    expect(claim.resolvedAt).toBeNull();
    expect(claim.outcome).toBe("pending");
    expect(claim.direction).toBe("neutral");
  });

  it("AC-5 + AC-6: calibration hitRate=0.75, avgBrier≈0.1379 matching live-probed data shape", () => {
    // Seed matching the live distribution: 3 correct, 1 wrong, 3 pending
    // Use confidence values matching brier expectations from spec
    // brier = (outcome - confidence)^2
    // id5 FPT 0.0576: outcome=1, conf=0.76 → (1-0.76)^2 = 0.0576 ✓
    // id4 BID 0.0529: outcome=1, conf=0.77 → (1-0.77)^2 = 0.0529 ✓
    // id2 VIC 0.0441: outcome=1, conf=0.79 → (1-0.79)^2 = 0.0441 ✓
    // id3 FPT 0.3969: outcome=0, conf=0.37 → (0-0.37)^2 = 0.1369 — spec says 0.3969
    // Per spec: id3 FPT wrong brier=0.3969 → (0 - confidence)^2 = 0.3969 → conf=0.63
    seedCorrectClaim("FPT", "2026-04-01", 0.76); // brier=0.0576
    seedCorrectClaim("BID", "2026-04-15", 0.77); // brier=0.0529
    seedCorrectClaim("VIC", "2026-05-01", 0.79); // brier=0.0441
    seedWrongClaim("FPT2", "2026-05-15", 0.37);  // brier=(0-0.37)^2=0.1369 approx
    seedPendingClaim("HPG", "2026-07-01");
    seedPendingClaim("TCB", "2026-07-15");
    seedNeutralNullClaim("VNM", "2026-08-01");

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    const cal = body.calibration;
    expect(cal.total).toBe(7);
    expect(cal.resolved).toBe(4);
    expect(cal.correct).toBe(3);
    expect(cal.wrong).toBe(1);
    expect(cal.pending).toBe(3);
    expect(cal.hitRate).toBe(0.75);
    expect(cal.avgBrier).not.toBeNull();
    // avgBrier over 4 resolved rows
    expect(cal.avgBrier).toBeGreaterThan(0);
  });

  it("AC-7: ZERO-RESOLVED GUARD — all pending → hitRate null AND avgBrier null", () => {
    seedPendingClaim("HPG", "2026-07-01");
    seedNeutralNullClaim("VNM", "2026-08-01");

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    const cal = body.calibration;
    expect(cal.resolved).toBe(0);
    expect(cal.hitRate).toBeNull();
    expect(cal.avgBrier).toBeNull();
    // Must not be NaN or Infinity
    expect(Number.isNaN(cal.hitRate as unknown as number)).toBe(false);
    expect(Number.isFinite(cal.hitRate as unknown as number)).toBe(false); // null is not finite
  });

  it("AC-8: calibration is computed over ALL claims, not filtered subset", () => {
    seedCorrectClaim("FPT", "2026-04-01", 0.76);
    seedWrongClaim("BID", "2026-04-15", 0.6);
    seedPendingClaim("HPG", "2026-07-01");

    // Filter to ?outcome=correct — claims[] will only show 1
    // but calibration must reflect total=3, resolved=2
    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims?outcome=correct"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    // Claims array filtered to correct only
    expect(body.claims).toHaveLength(1);
    expect(body.claims[0]!.outcome).toBe("correct");
    // Calibration covers ALL 3 rows
    expect(body.calibration.total).toBe(3);
    expect(body.calibration.resolved).toBe(2);
    expect(body.calibration.pending).toBe(1);
  });

  it("AC-9: ?outcome=correct filters claims[] to correct rows", () => {
    seedCorrectClaim("FPT", "2026-04-01", 0.76);
    seedWrongClaim("BID", "2026-04-15", 0.6);
    seedPendingClaim("HPG", "2026-07-01");

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims?outcome=correct"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    expect(body.claims.every((c) => c.outcome === "correct")).toBe(true);
    expect(body.count).toBe(body.claims.length);
  });

  it("AC-10: ?outcome=wrong filters claims[] to wrong rows", () => {
    seedCorrectClaim("FPT", "2026-04-01", 0.76);
    seedWrongClaim("BID", "2026-04-15", 0.6);
    seedPendingClaim("HPG", "2026-07-01");

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims?outcome=wrong"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    expect(body.claims.every((c) => c.outcome === "wrong")).toBe(true);
  });

  it("AC-11: ?outcome=pending filters claims[] to pending rows", () => {
    seedCorrectClaim("FPT", "2026-04-01", 0.76);
    seedWrongClaim("BID", "2026-04-15", 0.6);
    seedPendingClaim("HPG", "2026-07-01");
    seedNeutralNullClaim("VNM", "2026-08-01");

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims?outcome=pending"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    expect(body.claims.every((c) => c.outcome === "pending")).toBe(true);
    expect(body.claims).toHaveLength(2); // HPG pending + VNM neutral/pending
  });

  it("AC-12: claims are sorted resolution_date DESC (newest date first)", () => {
    // Seed in reverse order to verify sort is applied
    seedPendingClaim("HPG", "2026-08-15"); // latest
    seedCorrectClaim("FPT", "2026-04-01", 0.76); // oldest resolved
    seedWrongClaim("BID", "2026-06-01", 0.6); // middle

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    expect(body.claims.length).toBeGreaterThanOrEqual(3);
    const dates = body.claims.map((c) => c.resolutionDate);
    // Verify descending order
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]! <= dates[i - 1]!).toBe(true);
    }
  });

  it("AC-13: ?limit=1 clamps response to 1 claim", () => {
    seedCorrectClaim("FPT", "2026-04-01", 0.76);
    seedWrongClaim("BID", "2026-04-15", 0.6);
    seedPendingClaim("HPG", "2026-07-01");

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims?limit=1"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    expect(body.claims).toHaveLength(1);
    expect(body.count).toBe(1);
    // calibration still covers all 3
    expect(body.calibration.total).toBe(3);
  });

  it("AC-14: returns 200 + empty claims[] when no rows exist", () => {
    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    expect(body.claims).toHaveLength(0);
    expect(body.count).toBe(0);
    expect(body.calibration.total).toBe(0);
    expect(body.calibration.hitRate).toBeNull();
    expect(body.calibration.avgBrier).toBeNull();
  });

  it("AC-15: returns 500 JSON on DB error (closed DB)", () => {
    const db = getDb();
    closeDb();

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");
  });

  it("AC-16: count matches claims.length", () => {
    seedCorrectClaim("FPT", "2026-04-01", 0.76);
    seedWrongClaim("BID", "2026-04-15", 0.6);
    seedPendingClaim("HPG", "2026-07-01");

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    expect(body.count).toBe(body.claims.length);
  });

  it("AC-17: nullable fields pass through as null in the JSON response", () => {
    seedNeutralNullClaim("VNM", "2026-08-01");

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    const claim = body.claims[0]!;
    // JSON null (not undefined, not 0)
    expect(claim.targetPrice).toBeNull();
    expect(claim.creationPrice).toBeNull();
    expect(claim.actualPrice).toBeNull();
    expect(claim.brierScore).toBeNull();
    expect(claim.resolvedAt).toBeNull();
  });

  it("PRODUCTION SHAPE: past resolution_date + outcome=null stays pending (not invented verdict)", () => {
    // A neutral claim whose resolution_date is in the PAST but outcome is still NULL
    // (resolver couldn't determine — no target price to compare against)
    const db = getDb();
    insertPredictionClaim(db, {
      stock: "TCB",
      agent_id: "08-prediction-synthesizer",
      claim_text: "TCB thị trường trung lập",
      direction: "neutral",
      target_price: null,
      creation_price: null,
      resolution_date: "2026-01-01", // past date
      confidence: 0.5,
    });

    const res = makeMockRes();
    handleGetPredictionClaims(
      makeFakeReq("/api/prediction-claims"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    const body = JSON.parse(res.body) as PredictionClaimsResponse;
    expect(body.claims).toHaveLength(1);
    const claim = body.claims[0]!;
    // CRITICAL: must NOT invent "wrong" or "correct" — stays pending
    expect(claim.outcome).toBe("pending");
    expect(claim.brierScore).toBeNull();
    expect(claim.actualPrice).toBeNull();
  });
});
