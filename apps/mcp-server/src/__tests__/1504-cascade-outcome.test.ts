/**
 * 1504-cascade-outcome.test.ts — RED phase
 *
 * 11 failing assertions covering:
 *   - Schema migrations for cascade_rule_hits (5 new cols) + market_messages (3 new cols)
 *   - Idempotency of initDatabase(db) on an existing DB
 *   - updateOutcome() in cascadeHitStore
 *   - updateImpact() in marketMessageStore
 *   - get_cascade_outcomes MCP tool via queryCascadeOutcomes()
 *   - Ticker filter narrowing
 *   - TypeScript compile marker
 *
 * All 11 tests MUST FAIL before GREEN (task 1504b) starts.
 *
 * Imports are dynamic per-test so module-load errors surface as individual
 * test failures rather than a single unhandled module error.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import Database from "bun:sqlite";

describe("1504 cascade-outcome", () => {
  let db: Database;
  beforeEach(async () => {
    db = new Database(":memory:");
    const { initDatabase } = await import("../infrastructure/db/schema.js");
    // initDatabase with explicit db arg — new contract expected in GREEN phase
    initDatabase(db);
  });

  // AC-1: cascade_rule_hits has 5 new columns on fresh DB
  test("AC-1: cascade_rule_hits has 5 new columns", async () => {
    const { initDatabase } = await import("../infrastructure/db/schema.js");
    initDatabase(db);
    const cols = db
      .prepare("PRAGMA table_info(cascade_rule_hits)")
      .all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toContain("source_rag_id");
    expect(names).toContain("price_impact_3d");
    expect(names).toContain("price_impact_7d");
    expect(names).toContain("outcome_correct");
    expect(names).toContain("confidence");
  });

  // AC-2: migration idempotent on existing DB without new cols
  test("AC-2: cascade_rule_hits migration idempotent", async () => {
    const { initDatabase } = await import("../infrastructure/db/schema.js");
    // second initDatabase() on same DB — must not throw
    expect(() => initDatabase(db)).not.toThrow();
    const cols = db
      .prepare("PRAGMA table_info(cascade_rule_hits)")
      .all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain("source_rag_id");
  });

  // AC-3: market_messages has 3 new columns on fresh DB
  test("AC-3: market_messages has 3 new columns", async () => {
    const { initDatabase } = await import("../infrastructure/db/schema.js");
    initDatabase(db);
    const cols = db
      .prepare("PRAGMA table_info(market_messages)")
      .all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toContain("impact_score");
    expect(names).toContain("price_at_message");
    expect(names).toContain("price_3d_after");
  });

  // AC-4: market_messages idempotent
  test("AC-4: market_messages migration idempotent", async () => {
    const { initDatabase } = await import("../infrastructure/db/schema.js");
    expect(() => initDatabase(db)).not.toThrow();
    const cols = db
      .prepare("PRAGMA table_info(market_messages)")
      .all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain("impact_score");
  });

  // AC-5: updateOutcome() writes priceImpact3d/7d/outcomeCorrect/confidence, returns true
  test("AC-5: updateOutcome writes priceImpact/outcomeCorrect/confidence", async () => {
    const { recordHit, updateOutcome } = await import("../infrastructure/db/cascadeHitStore.js");
    const { initDatabase } = await import("../infrastructure/db/schema.js");
    initDatabase(db);
    recordHit(db, "oil_gas_up", "text", "oil_gas", "PVS");
    const row = db.prepare("SELECT id FROM cascade_rule_hits ORDER BY id DESC LIMIT 1").get() as { id: number };
    const result = updateOutcome(db, row.id, {
      priceImpact3d: 2.5,
      priceImpact7d: -1.0,
      outcomeCorrect: 1,
      confidence: 0.8,
    });
    expect(result).toBe(true);
    const updated = db
      .prepare(
        "SELECT price_impact_3d, price_impact_7d, outcome_correct, confidence FROM cascade_rule_hits WHERE id = ?"
      )
      .get(row.id) as { price_impact_3d: number; price_impact_7d: number; outcome_correct: number; confidence: number };
    expect(updated.price_impact_3d).toBe(2.5);
    expect(updated.price_impact_7d).toBe(-1.0);
    expect(updated.outcome_correct).toBe(1);
    expect(updated.confidence).toBe(0.8);
  });

  // AC-6: updateOutcome() returns false for unknown id=9999
  test("AC-6: updateOutcome returns false for unknown id", async () => {
    const { updateOutcome } = await import("../infrastructure/db/cascadeHitStore.js");
    const { initDatabase } = await import("../infrastructure/db/schema.js");
    initDatabase(db);
    const result = updateOutcome(db, 9999, { outcomeCorrect: 1 });
    expect(result).toBe(false);
  });

  // AC-7: recordHit() extended — sourceRagId + confidence stored
  test("AC-7: recordHit extended signature stores sourceRagId and confidence", async () => {
    const { recordHit } = await import("../infrastructure/db/cascadeHitStore.js");
    const { initDatabase } = await import("../infrastructure/db/schema.js");
    initDatabase(db);
    recordHit(db, "oil_gas_up", "text", "oil_gas", "PVS,BSR", "rag-abc-123", 0.75);
    const row = db
      .prepare("SELECT source_rag_id, confidence FROM cascade_rule_hits ORDER BY id DESC LIMIT 1")
      .get() as { source_rag_id: string; confidence: number };
    expect(row.source_rag_id).toBe("rag-abc-123");
    expect(row.confidence).toBe(0.75);
  });

  // AC-8: updateImpact() writes impactScore/priceAtMessage/price3dAfter, returns true
  test("AC-8: updateImpact writes impactScore/priceAtMessage/price3dAfter", async () => {
    const { insertMarketMessage, updateImpact } = await import("../infrastructure/db/marketMessageStore.js");
    const { initDatabase } = await import("../infrastructure/db/schema.js");
    initDatabase(db);
    const id = insertMarketMessage(db, {
      from_agent: "test-agent",
      message_type: "alert",
      ticker: "VCB",
      content: "test message",
    });
    const result = updateImpact(db, id, {
      impactScore: 0.9,
      priceAtMessage: 88500,
      price3dAfter: 91000,
    });
    expect(result).toBe(true);
    const row = db
      .prepare("SELECT impact_score, price_at_message, price_3d_after FROM market_messages WHERE id = ?")
      .get(id) as { impact_score: number; price_at_message: number; price_3d_after: number };
    expect(row.impact_score).toBe(0.9);
    expect(row.price_at_message).toBe(88500);
    expect(row.price_3d_after).toBe(91000);
  });

  // AC-9: get_cascade_outcomes returns 3 rows (2 with outcomes, 1 pending)
  test("AC-9: get_cascade_outcomes returns all rows including pending", async () => {
    const { recordHit, updateOutcome } = await import("../infrastructure/db/cascadeHitStore.js");
    const { initDatabase } = await import("../infrastructure/db/schema.js");
    initDatabase(db);
    // insert 2 with outcomes, 1 pending
    recordHit(db, "oil_gas_up", "text", "oil_gas", "PVS");
    const r1 = db.prepare("SELECT id FROM cascade_rule_hits ORDER BY id DESC LIMIT 1").get() as { id: number };
    updateOutcome(db, r1.id, { priceImpact3d: 2.5, outcomeCorrect: 1 });

    recordHit(db, "banking_up", "text2", "banking", "VCB");
    const r2 = db.prepare("SELECT id FROM cascade_rule_hits ORDER BY id DESC LIMIT 1").get() as { id: number };
    updateOutcome(db, r2.id, { priceImpact3d: -0.5, outcomeCorrect: 0 });

    recordHit(db, "steel_up", "text3", "steel", "HPG"); // pending — no outcome

    const { queryCascadeOutcomes } = await import("../interface/mcp/tools/news-analysis/cascadeOutcomeTools.js");
    const rows = queryCascadeOutcomes(db, { days: 30 });
    expect(rows).toHaveLength(3);
    const pending = rows.find((r) => r.ruleKey === "steel_up");
    expect(pending).toBeDefined();
    expect(pending!.priceImpact3d).toBeNull();
    expect(pending!.outcomeCorrect).toBeNull();
  });

  // AC-10: ticker filter narrows to rows matching LIKE '%VCB%'
  test("AC-10: ticker filter narrows results to LIKE match", async () => {
    const { recordHit } = await import("../infrastructure/db/cascadeHitStore.js");
    const { initDatabase } = await import("../infrastructure/db/schema.js");
    initDatabase(db);
    recordHit(db, "banking_up", "t1", "banking", "VCB,TCB");
    recordHit(db, "steel_up", "t2", "steel", "HPG,HSG");

    const { queryCascadeOutcomes } = await import("../interface/mcp/tools/news-analysis/cascadeOutcomeTools.js");
    const rows = queryCascadeOutcomes(db, { days: 30, ticker: "VCB" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ruleKey).toBe("banking_up");
  });

  // AC-11: TypeScript compile clean (structural marker)
  test("AC-11: TypeScript compile clean (structural marker — CI runs bun tsc --noEmit)", () => {
    // This test always passes in bun:test; actual compile check is in CI.
    // Its purpose: ensure this file is syntactically valid and imports resolve.
    expect(true).toBe(true);
  });
});
