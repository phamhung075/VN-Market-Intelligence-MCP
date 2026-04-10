/**
 * Cascade Rule Hit Store — Task 247
 *
 * Infrastructure adapter for recording and querying cascade rule hits.
 * Stores which sector rules fire during the causal chain build,
 * enabling dead-rule detection and effectiveness analysis.
 *
 * Layer: infrastructure/db
 */

import type { Database } from "bun:sqlite";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface CascadeRuleMetric {
  /** Rule identifier, e.g. "oil_gas_rise" */
  ruleKey: string;
  /** Total hits in the queried window */
  hitCount: number;
  /** ISO datetime string of the most recent hit */
  lastHit: string;
}

// DDL is canonical in schema.ts:872 via initDatabase(). Tests use
// src/__tests__/helpers/cascadeHitsTestDdl.ts for in-memory setup.

// ═══════════════════════════════════════════════════════════════════════════
// Write helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record a single cascade rule hit.
 *
 * @param db          - Active bun:sqlite Database connection
 * @param ruleKey     - Stable identifier for the rule, e.g. "oil_gas_rise"
 * @param matchedText - The text snippet that triggered the rule
 * @param sector      - Affected domain/sector, e.g. "oil_gas"
 * @param stocks      - Comma-separated affected stock codes (optional)
 */
export function recordHit(
  db: Database,
  ruleKey: string,
  matchedText: string,
  sector?: string,
  stocks?: string,
): void {
  db.prepare(`
    INSERT INTO cascade_rule_hits (rule_key, matched_text, affected_sector, affected_stocks)
    VALUES (?, ?, ?, ?)
  `).run(ruleKey, matchedText, sector ?? null, stocks ?? null);
}

// ═══════════════════════════════════════════════════════════════════════════
// Read helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get hit metrics grouped by rule_key for the given time window.
 *
 * Returns rules ordered by hitCount DESC (most active first).
 *
 * @param db   - Active bun:sqlite Database connection
 * @param days - Look-back window in days (default 30)
 */
export function getHitMetrics(db: Database, days: number = 30): CascadeRuleMetric[] {
  const rows = db
    .prepare<
      { rule_key: string; hit_count: number; last_hit: string },
      [number]
    >(`
      SELECT
        rule_key,
        COUNT(*)   AS hit_count,
        MAX(hit_at) AS last_hit
      FROM cascade_rule_hits
      WHERE hit_at >= datetime('now', '-' || ? || ' days')
      GROUP BY rule_key
      ORDER BY hit_count DESC
    `)
    .all(days);

  return rows.map((r) => ({
    ruleKey: r.rule_key,
    hitCount: r.hit_count,
    lastHit: r.last_hit,
  }));
}

/**
 * Return rules from knownRules that have zero hits in the given window.
 *
 * Useful for detecting stale / dead rules that can be pruned.
 *
 * @param db         - Active bun:sqlite Database connection
 * @param knownRules - Complete list of rule keys in the engine
 * @param days       - Look-back window in days (default 30)
 */
export function getDeadRules(
  db: Database,
  knownRules: string[],
  days: number = 30,
): string[] {
  if (knownRules.length === 0) return [];

  const activeMetrics = getHitMetrics(db, days);
  const activeKeys = new Set(activeMetrics.map((m) => m.ruleKey));

  return knownRules.filter((key) => !activeKeys.has(key));
}
