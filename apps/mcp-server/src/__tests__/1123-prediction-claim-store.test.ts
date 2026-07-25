/**
 * Task 1123 — prediction_claims DDL + store functions
 *
 * Tests for:
 *   1. DDL: prediction_claims table exists after initDatabase()
 *   2. insertPredictionClaim — happy path, INSERT OR IGNORE dedup
 *   3. getPendingClaims — resolution_outcome IS NULL, resolution_date >= today, optional stock filter
 *   4. resolveClaim — sets resolution_outcome, actual_price, brier_score, resolved_at
 *   5. getResolvedClaims — resolution_outcome IS NOT NULL, optional stock + limit
 *   6. getClaimsByAgent — filter by agent_id
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import {
  insertPredictionClaim,
  getPendingClaims,
  resolveClaim,
  getResolvedClaims,
  getClaimsByAgent,
  type PredictionClaimInput,
} from "../infrastructure/db/predictionClaimStore.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeDb(): Database {
  Bun.env["DB_PATH"] = ":memory:";
  closeDb();
  return new Database(":memory:");
}

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function pastDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// ─── test suite ──────────────────────────────────────────────────────────────

describe("Task 1123 — prediction_claims store", () => {
  let db: Database;

  beforeEach(async () => {
    Bun.env["DB_PATH"] = ":memory:";
    closeDb();
    db = makeDb();
    // Run initDatabase to create the prediction_claims table
    await initDatabase();
    // initDatabase uses the singleton; get that same DB reference
    const { getDb } = await import("../infrastructure/db/schema.js");
    db = getDb();
  });

  // ── DDL ────────────────────────────────────────────────────────────────────

  it("prediction_claims table exists after initDatabase()", () => {
    const row = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='prediction_claims'",
      )
      .get();
    expect(row).not.toBeNull();
    expect(row!.name).toBe("prediction_claims");
  });

  it("prediction_claims has required columns", () => {
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(prediction_claims)")
      .all()
      .map((c) => c.name);

    const required = [
      "id",
      "stock",
      "agent_id",
      "claim_text",
      "direction",
      "target_price",
      "resolution_date",
      "confidence",
      "resolution_outcome",
      "actual_price",
      "brier_score",
      "created_at",
      "resolved_at",
    ];
    for (const col of required) {
      expect(cols).toContain(col);
    }
  });

  // ── insertPredictionClaim ─────────────────────────────────────────────────

  it("inserts a new prediction claim and returns its id", () => {
    const input: PredictionClaimInput = {
      stock: "VCB",
      agent_id: "04-market-watcher",
      claim_text: "VCB sẽ tăng 10% trong 30 ngày tới",
      direction: "bullish",
      target_price: 88000,
      creation_price: 85000,
      resolution_date: futureDate(30),
      confidence: 0.75,
    };
    const id = insertPredictionClaim(db, input);
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  it("INSERT OR IGNORE deduplicates on (stock, claim_text, resolution_date)", () => {
    const resDate = futureDate(30);
    const input: PredictionClaimInput = {
      stock: "FPT",
      agent_id: "04-market-watcher",
      claim_text: "FPT sẽ vượt 100k",
      direction: "bullish",
      target_price: 100000,
      creation_price: 97000,
      resolution_date: resDate,
      confidence: 0.6,
    };
    const id1 = insertPredictionClaim(db, input);
    // Same (stock, claim_text, resolution_date) — second insert should be ignored
    const id2 = insertPredictionClaim(db, { ...input, confidence: 0.9 });
    expect(id1).toBeGreaterThan(0);
    expect(id2).toBe(0); // INSERT OR IGNORE returns 0 / same id or 0 on no-op

    // Only one row in the table
    const count = db
      .query<{ c: number }, []>("SELECT COUNT(*) as c FROM prediction_claims WHERE stock='FPT'")
      .get();
    expect(count!.c).toBe(1);
  });

  // ── getPendingClaims ──────────────────────────────────────────────────────

  it("getPendingClaims returns rows where resolution_outcome IS NULL and resolution_date >= today", () => {
    // Insert one future (pending)
    insertPredictionClaim(db, {
      stock: "HPG",
      agent_id: "05-alert-commander",
      claim_text: "HPG bullish Q2",
      direction: "bullish",
      target_price: 35000,
      creation_price: 32000,
      resolution_date: futureDate(14),
      confidence: 0.7,
    });
    // Insert one with a past resolution_date — should NOT appear in pending
    insertPredictionClaim(db, {
      stock: "HPG",
      agent_id: "05-alert-commander",
      claim_text: "HPG bearish yesterday",
      direction: "bearish",
      target_price: 30000,
      creation_price: 27000,
      resolution_date: pastDate(1),
      confidence: 0.5,
    });

    const pending = getPendingClaims(db);
    expect(pending.length).toBe(1);
    expect(pending[0]!.claim_text).toBe("HPG bullish Q2");
  });

  it("getPendingClaims filters by stock when provided", () => {
    insertPredictionClaim(db, {
      stock: "VCB",
      agent_id: "04-market-watcher",
      claim_text: "VCB claim A",
      direction: "bullish",
      target_price: 90000,
      creation_price: 87000,
      resolution_date: futureDate(7),
      confidence: 0.8,
    });
    insertPredictionClaim(db, {
      stock: "FPT",
      agent_id: "04-market-watcher",
      claim_text: "FPT claim B",
      direction: "bullish",
      target_price: 105000,
      creation_price: 102000,
      resolution_date: futureDate(7),
      confidence: 0.65,
    });

    const vcbPending = getPendingClaims(db, "VCB");
    expect(vcbPending.length).toBe(1);
    expect(vcbPending[0]!.stock).toBe("VCB");
  });

  it("getPendingClaims excludes already-resolved claims", () => {
    const resDate = futureDate(10);
    const id = insertPredictionClaim(db, {
      stock: "MWG",
      agent_id: "04-market-watcher",
      claim_text: "MWG recovery",
      direction: "bullish",
      target_price: 62000,
      creation_price: 59000,
      resolution_date: resDate,
      confidence: 0.6,
    });
    resolveClaim(db, id, 1, 65000);

    const pending = getPendingClaims(db, "MWG");
    expect(pending.length).toBe(0);
  });

  // ── resolveClaim ──────────────────────────────────────────────────────────

  it("resolveClaim sets resolution_outcome, actual_price, brier_score, resolved_at", () => {
    const id = insertPredictionClaim(db, {
      stock: "VCB",
      agent_id: "04-market-watcher",
      claim_text: "VCB target 90k",
      direction: "bullish",
      target_price: 90000,
      creation_price: 87000,
      resolution_date: futureDate(5),
      confidence: 0.8,
    });

    resolveClaim(db, id, 1, 92000);

    const row = db
      .query<
        {
          resolution_outcome: number;
          actual_price: number;
          brier_score: number | null;
          resolved_at: string;
        },
        [number]
      >("SELECT resolution_outcome, actual_price, brier_score, resolved_at FROM prediction_claims WHERE id = ?")
      .get(id);

    expect(row).not.toBeNull();
    expect(row!.resolution_outcome).toBe(1);
    expect(row!.actual_price).toBe(92000);
    expect(row!.resolved_at).not.toBeNull();
    // Brier score for outcome=1, confidence=0.8: (1 - 0.8)^2 = 0.04
    expect(row!.brier_score).toBeCloseTo(0.04, 5);
  });

  it("resolveClaim outcome=0 computes brier_score correctly", () => {
    const id = insertPredictionClaim(db, {
      stock: "HPG",
      agent_id: "04-market-watcher",
      claim_text: "HPG will rise",
      direction: "bullish",
      target_price: 40000,
      creation_price: 37000,
      resolution_date: futureDate(5),
      confidence: 0.7,
    });

    resolveClaim(db, id, 0, 32000);

    const row = db
      .query<{ brier_score: number | null }, [number]>(
        "SELECT brier_score FROM prediction_claims WHERE id = ?",
      )
      .get(id);

    expect(row).not.toBeNull();
    // Brier score for outcome=0, confidence=0.7: (0 - 0.7)^2 = 0.49
    expect(row!.brier_score).toBeCloseTo(0.49, 5);
  });

  // ── getResolvedClaims ─────────────────────────────────────────────────────

  it("getResolvedClaims returns only resolved rows", () => {
    const id1 = insertPredictionClaim(db, {
      stock: "VCB",
      agent_id: "04-market-watcher",
      claim_text: "VCB resolved",
      direction: "bullish",
      target_price: 88000,
      creation_price: 85000,
      resolution_date: futureDate(5),
      confidence: 0.75,
    });
    insertPredictionClaim(db, {
      stock: "VCB",
      agent_id: "04-market-watcher",
      claim_text: "VCB still pending",
      direction: "bullish",
      target_price: 90000,
      creation_price: 87000,
      resolution_date: futureDate(10),
      confidence: 0.6,
    });

    resolveClaim(db, id1, 1, 89000);

    const resolved = getResolvedClaims(db);
    expect(resolved.length).toBe(1);
    expect(resolved[0]!.claim_text).toBe("VCB resolved");
  });

  it("getResolvedClaims filters by stock", () => {
    const id1 = insertPredictionClaim(db, {
      stock: "VCB",
      agent_id: "04-market-watcher",
      claim_text: "VCB up",
      direction: "bullish",
      target_price: 88000,
      creation_price: 85000,
      resolution_date: futureDate(5),
      confidence: 0.75,
    });
    const id2 = insertPredictionClaim(db, {
      stock: "FPT",
      agent_id: "04-market-watcher",
      claim_text: "FPT up",
      direction: "bullish",
      target_price: 100000,
      creation_price: 97000,
      resolution_date: futureDate(5),
      confidence: 0.7,
    });
    resolveClaim(db, id1, 1, 89000);
    resolveClaim(db, id2, 0, 95000);

    const vcbResolved = getResolvedClaims(db, "VCB");
    expect(vcbResolved.length).toBe(1);
    expect(vcbResolved[0]!.stock).toBe("VCB");
  });

  it("getResolvedClaims respects limit parameter", () => {
    const resDate = futureDate(5);
    for (let i = 0; i < 5; i++) {
      const id = insertPredictionClaim(db, {
        stock: "VCB",
        agent_id: "04-market-watcher",
        claim_text: `VCB claim ${i}`,
        direction: "bullish",
        target_price: 80000 + i * 1000,
        creation_price: 77000 + i * 1000,
        resolution_date: resDate,
        confidence: 0.7,
      });
      resolveClaim(db, id, 1, 81000);
    }

    const limited = getResolvedClaims(db, undefined, 3);
    expect(limited.length).toBe(3);
  });

  // ── getClaimsByAgent ──────────────────────────────────────────────────────

  it("getClaimsByAgent returns all claims for a given agent", () => {
    insertPredictionClaim(db, {
      stock: "VCB",
      agent_id: "04-market-watcher",
      claim_text: "VCB by agent 04",
      direction: "bullish",
      target_price: 88000,
      creation_price: 85000,
      resolution_date: futureDate(14),
      confidence: 0.75,
    });
    insertPredictionClaim(db, {
      stock: "FPT",
      agent_id: "04-market-watcher",
      claim_text: "FPT by agent 04",
      direction: "bullish",
      target_price: 100000,
      creation_price: 97000,
      resolution_date: futureDate(14),
      confidence: 0.6,
    });
    insertPredictionClaim(db, {
      stock: "HPG",
      agent_id: "05-alert-commander",
      claim_text: "HPG by agent 05",
      direction: "bearish",
      target_price: 30000,
      creation_price: 27000,
      resolution_date: futureDate(14),
      confidence: 0.55,
    });

    const agent04Claims = getClaimsByAgent(db, "04-market-watcher");
    expect(agent04Claims.length).toBe(2);
    expect(agent04Claims.every((c) => c.agent_id === "04-market-watcher")).toBe(true);

    const agent05Claims = getClaimsByAgent(db, "05-alert-commander");
    expect(agent05Claims.length).toBe(1);
    expect(agent05Claims[0]!.stock).toBe("HPG");
  });

  it("getClaimsByAgent returns empty array for unknown agent", () => {
    const claims = getClaimsByAgent(db, "99-nonexistent-agent");
    expect(claims).toEqual([]);
  });
});
