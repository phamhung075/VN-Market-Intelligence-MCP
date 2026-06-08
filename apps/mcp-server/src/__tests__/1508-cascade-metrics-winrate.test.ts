/**
 * 1508-cascade-metrics-winrate.test.ts — RED phase
 *
 * 5 failing assertions covering:
 *   - CascadeRuleMetric interface extended with evaluated + winRate
 *   - getHitMetricsWithAccuracy() query shape + winRate calculation
 *   - winRate = outcome_correct=1 / evaluated rows (nulls excluded)
 *   - formatCascadeMetrics WinRate column present in output
 *   - formatCascadeMetrics overall accuracy summary line
 *
 * All 5 tests MUST FAIL before GREEN (1508b) starts.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import Database from "bun:sqlite";

// ─── Inline DDL (no external helper) ─────────────────────────────────────────
function setupDb(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cascade_rule_hits (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_key         TEXT    NOT NULL,
      matched_text     TEXT    NOT NULL,
      affected_sector  TEXT,
      affected_stocks  TEXT,
      source_rag_id    TEXT,
      confidence       REAL,
      price_impact_3d  REAL,
      price_impact_7d  REAL,
      outcome_correct  INTEGER,
      hit_at           TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

describe("1508 cascade-metrics-winrate", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    setupDb(db);
  });

  // AC-1: getHitMetricsWithAccuracy returns evaluated + winRate fields
  test("AC-1: getHitMetricsWithAccuracy returns evaluated + winRate on metric", async () => {
    const { getHitMetricsWithAccuracy } = await import(
      "../infrastructure/db/cascadeHitStore.js"
    );

    db.exec(`
      INSERT INTO cascade_rule_hits (rule_key, matched_text, outcome_correct)
      VALUES
        ('oil_gas_up', 'oil rises', 1),
        ('oil_gas_up', 'oil spike',  1),
        ('oil_gas_up', 'oil surge',  0);
    `);

    const metrics = getHitMetricsWithAccuracy(db, 30);
    expect(metrics.length).toBe(1);

    const m = metrics[0];
    expect(m).toHaveProperty("evaluated");
    expect(m).toHaveProperty("winRate");
    // 3 hits, all 3 evaluated (outcome_correct not null), 2 correct -> 66.7%
    expect(m!.evaluated).toBe(3);
    expect(m!.winRate).toBeCloseTo(66.7, 0);
  });

  // AC-2: winRate excludes rows where outcome_correct IS NULL
  test("AC-2: winRate excludes non-evaluated rows", async () => {
    const { getHitMetricsWithAccuracy } = await import(
      "../infrastructure/db/cascadeHitStore.js"
    );

    db.exec(`
      INSERT INTO cascade_rule_hits (rule_key, matched_text, outcome_correct)
      VALUES
        ('banking_up', 'banks rally', 1),
        ('banking_up', 'banks up',    NULL),
        ('banking_up', 'banks surge', NULL);
    `);

    const metrics = getHitMetricsWithAccuracy(db, 30);
    const m = metrics.find((x: { ruleKey: string }) => x.ruleKey === "banking_up");
    expect(m).toBeDefined();
    // only 1 evaluated row, 1 correct -> 100%
    expect(m!.evaluated).toBe(1);
    expect(m!.winRate).toBeCloseTo(100, 0);
  });

  // AC-3: winRate is 0 when no evaluated rows
  test("AC-3: winRate is 0 when evaluated=0", async () => {
    const { getHitMetricsWithAccuracy } = await import(
      "../infrastructure/db/cascadeHitStore.js"
    );

    db.exec(`
      INSERT INTO cascade_rule_hits (rule_key, matched_text, outcome_correct)
      VALUES ('steel_up', 'steel rises', NULL);
    `);

    const metrics = getHitMetricsWithAccuracy(db, 30);
    const m = metrics.find((x: { ruleKey: string }) => x.ruleKey === "steel_up");
    expect(m).toBeDefined();
    expect(m!.evaluated).toBe(0);
    expect(m!.winRate).toBe(0);
  });

  // AC-4: formatCascadeMetrics includes WinRate column header
  test("AC-4: formatCascadeMetrics output contains WinRate column", async () => {
    const { formatCascadeMetrics } = await import(
      "../interface/mcp/tools/news-analysis/cascadeMetricsTools.js"
    );

    const metrics = [
      { ruleKey: "oil_gas_up", hitCount: 3, lastHit: "2026-04-19 10:00:00", evaluated: 3, winRate: 66.7 },
    ];

    const out = formatCascadeMetrics(metrics, [], 30);
    expect(out).toContain("WinRate");
    expect(out).toContain("66.7%");
  });

  // AC-5: formatCascadeMetrics overall accuracy summary line
  test("AC-5: formatCascadeMetrics overall accuracy summary line", async () => {
    const { formatCascadeMetrics } = await import(
      "../interface/mcp/tools/news-analysis/cascadeMetricsTools.js"
    );

    const metrics = [
      { ruleKey: "oil_gas_up",  hitCount: 3, lastHit: "2026-04-19 10:00:00", evaluated: 3, winRate: 66.7 },
      { ruleKey: "banking_up",  hitCount: 2, lastHit: "2026-04-19 09:00:00", evaluated: 1, winRate: 100.0 },
      { ruleKey: "steel_up",    hitCount: 1, lastHit: "2026-04-19 08:00:00", evaluated: 0, winRate: 0 },
    ];

    const out = formatCascadeMetrics(metrics, [], 30);
    // Overall accuracy = (2 correct / 4 evaluated) = 50%
    // Summary line must mention "Overall accuracy" and evaluated count
    expect(out).toContain("Overall accuracy");
    expect(out).toContain("4 evaluated");
  });
});
