Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 219 — Custom Alert Rules Engine
 *
 * Tests:
 *   - Domain service: evaluateCustomRules (15+ assertions)
 *   - DB schema: custom_alert_rules table creation
 *   - MCP tools: add_alert_rule, list_alert_rules, delete_alert_rule
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

// Domain service
import { evaluateCustomRules, type CustomAlertRule } from "../domain/services/customAlertEvaluator.js";

// Infrastructure store
import {
  insertCustomAlertRule,
  listCustomAlertRules,
  deleteCustomAlertRule,
  markCustomAlertRuleTriggered,
  type CustomAlertRuleRow,
} from "../infrastructure/db/customAlertRuleStore.js";

// Schema migration helper
import { ensureCustomAlertRulesTable } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  ensureCustomAlertRulesTable(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain service: evaluateCustomRules
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 219 — evaluateCustomRules domain service", () => {
  const prices: Map<string, number> = new Map([
    ["VCB", 95000],
    ["HPG", 28000],
    ["FPT", 120000],
    ["VNM", 70000],
  ]);

  const volumes: Map<string, number> = new Map([
    ["VCB", 1_200_000],
    ["HPG", 6_000_000],
    ["FPT", 800_000],
    ["VNM", 500_000],
  ]);

  const financials: Map<string, { pe?: number; roe?: number }> = new Map([
    ["VCB", { pe: 12.5, roe: 18.0 }],
    ["HPG", { pe: 8.0, roe: 14.0 }],
    ["FPT", { pe: 22.0, roe: 25.0 }],
    ["VNM", { pe: 14.0, roe: 20.0 }],
  ]);

  it("price_above triggers when price exceeds threshold", () => {
    const rules: CustomAlertRule[] = [
      { id: 1, code: "VCB", predicate: "price_above", threshold: 90000 },
    ];
    const result = evaluateCustomRules(rules, prices, volumes, financials);
    expect(result).toHaveLength(1);
    expect(result[0]!.ruleId).toBe(1);
    expect(result[0]!.code).toBe("VCB");
    expect(result[0]!.currentValue).toBe(95000);
  });

  it("price_above does not trigger when price is below threshold", () => {
    const rules: CustomAlertRule[] = [
      { id: 2, code: "VCB", predicate: "price_above", threshold: 100000 },
    ];
    const result = evaluateCustomRules(rules, prices, volumes, financials);
    expect(result).toHaveLength(0);
  });

  it("price_below triggers when price is below threshold", () => {
    const rules: CustomAlertRule[] = [
      { id: 3, code: "HPG", predicate: "price_below", threshold: 30000 },
    ];
    const result = evaluateCustomRules(rules, prices, volumes, financials);
    expect(result).toHaveLength(1);
    expect(result[0]!.ruleId).toBe(3);
    expect(result[0]!.currentValue).toBe(28000);
  });

  it("price_below does not trigger when price is above threshold", () => {
    const rules: CustomAlertRule[] = [
      { id: 4, code: "HPG", predicate: "price_below", threshold: 25000 },
    ];
    const result = evaluateCustomRules(rules, prices, volumes, financials);
    expect(result).toHaveLength(0);
  });

  it("volume_above triggers when volume exceeds threshold", () => {
    const rules: CustomAlertRule[] = [
      { id: 5, code: "HPG", predicate: "volume_above", threshold: 5_000_000 },
    ];
    const result = evaluateCustomRules(rules, prices, volumes, financials);
    expect(result).toHaveLength(1);
    expect(result[0]!.currentValue).toBe(6_000_000);
  });

  it("volume_above does not trigger when volume is below threshold", () => {
    const rules: CustomAlertRule[] = [
      { id: 6, code: "VCB", predicate: "volume_above", threshold: 5_000_000 },
    ];
    const result = evaluateCustomRules(rules, prices, volumes, financials);
    expect(result).toHaveLength(0);
  });

  it("pe_above triggers when P/E exceeds threshold", () => {
    const rules: CustomAlertRule[] = [
      { id: 7, code: "FPT", predicate: "pe_above", threshold: 20.0 },
    ];
    const result = evaluateCustomRules(rules, prices, volumes, financials);
    expect(result).toHaveLength(1);
    expect(result[0]!.currentValue).toBe(22.0);
  });

  it("pe_below triggers when P/E is below threshold", () => {
    const rules: CustomAlertRule[] = [
      { id: 8, code: "HPG", predicate: "pe_below", threshold: 10.0 },
    ];
    const result = evaluateCustomRules(rules, prices, volumes, financials);
    expect(result).toHaveLength(1);
    expect(result[0]!.currentValue).toBe(8.0);
  });

  it("roe_above triggers when ROE exceeds threshold", () => {
    const rules: CustomAlertRule[] = [
      { id: 9, code: "FPT", predicate: "roe_above", threshold: 20.0 },
    ];
    const result = evaluateCustomRules(rules, prices, volumes, financials);
    expect(result).toHaveLength(1);
    expect(result[0]!.currentValue).toBe(25.0);
  });

  it("roe_above does not trigger when ROE is below threshold", () => {
    const rules: CustomAlertRule[] = [
      { id: 10, code: "VCB", predicate: "roe_above", threshold: 20.0 },
    ];
    const result = evaluateCustomRules(rules, prices, volumes, financials);
    expect(result).toHaveLength(0);
  });

  it("skips rule for unknown stock code (not in price/financial maps)", () => {
    const rules: CustomAlertRule[] = [
      { id: 11, code: "XYZ", predicate: "price_above", threshold: 50000 },
    ];
    const result = evaluateCustomRules(rules, prices, volumes, financials);
    expect(result).toHaveLength(0);
  });

  it("skips pe_above when financials not available", () => {
    const rules: CustomAlertRule[] = [
      { id: 12, code: "VCB", predicate: "pe_above", threshold: 5.0 },
    ];
    const noFinancials: Map<string, { pe?: number; roe?: number }> = new Map([
      ["VCB", {}], // no pe
    ]);
    const result = evaluateCustomRules(rules, prices, volumes, noFinancials);
    expect(result).toHaveLength(0);
  });

  it("evaluates multiple rules in a single call", () => {
    const rules: CustomAlertRule[] = [
      { id: 1, code: "VCB", predicate: "price_above", threshold: 90000 },
      { id: 2, code: "FPT", predicate: "pe_above", threshold: 20.0 },
      { id: 3, code: "HPG", predicate: "price_below", threshold: 25000 }, // won't trigger
    ];
    const result = evaluateCustomRules(rules, prices, volumes, financials);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.ruleId)).toEqual([1, 2]);
  });

  it("returns correct predicate on triggered result", () => {
    const rules: CustomAlertRule[] = [
      { id: 13, code: "VNM", predicate: "roe_above", threshold: 15.0 },
    ];
    const result = evaluateCustomRules(rules, prices, volumes, financials);
    expect(result).toHaveLength(1);
    expect(result[0]!.predicate).toBe("roe_above");
    expect(result[0]!.threshold).toBe(15.0);
  });

  it("returns empty array for empty rule list", () => {
    const result = evaluateCustomRules([], prices, volumes, financials);
    expect(result).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Infrastructure store
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 219 — customAlertRuleStore", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  it("inserts and retrieves a rule", () => {
    const id = insertCustomAlertRule(
      { code: "VCB", predicate: "price_above", threshold: 90000, notes: "test" },
      db,
    );
    expect(id).toBeGreaterThan(0);
    const rows = listCustomAlertRules(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.code).toBe("VCB");
    expect(rows[0]!.predicate).toBe("price_above");
    expect(rows[0]!.threshold).toBe(90000);
    expect(rows[0]!.status).toBe("active");
  });

  it("deletes a rule by id", () => {
    const id = insertCustomAlertRule(
      { code: "HPG", predicate: "volume_above", threshold: 5_000_000 },
      db,
    );
    deleteCustomAlertRule(id, db);
    const rows = listCustomAlertRules(db);
    expect(rows).toHaveLength(0);
  });

  it("marks a rule as triggered", () => {
    const id = insertCustomAlertRule(
      { code: "FPT", predicate: "pe_below", threshold: 15 },
      db,
    );
    markCustomAlertRuleTriggered(id, db);
    const rows = listCustomAlertRules(db);
    expect(rows[0]!.status).toBe("triggered");
    expect(rows[0]!.triggered_at).toBeTruthy();
  });

  it("lists rules in insertion order", () => {
    insertCustomAlertRule({ code: "VCB", predicate: "price_above", threshold: 90000 }, db);
    insertCustomAlertRule({ code: "HPG", predicate: "volume_above", threshold: 5_000_000 }, db);
    const rows = listCustomAlertRules(db);
    expect(rows[0]!.code).toBe("VCB");
    expect(rows[1]!.code).toBe("HPG");
  });

  it("returns empty list when no rules exist", () => {
    const rows = listCustomAlertRules(db);
    expect(rows).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema: ensureCustomAlertRulesTable
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 219 — ensureCustomAlertRulesTable", () => {
  it("creates the table idempotently", () => {
    const db = new Database(":memory:");
    // Call twice — must not throw
    ensureCustomAlertRulesTable(db);
    ensureCustomAlertRulesTable(db);
    const rows = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='custom_alert_rules'").all();
    expect(rows).toHaveLength(1);
    db.close();
  });
});
