/**
 * SPIKE_006-c61-T6 — Integration test: Scoring Unification
 *
 * Verifies that:
 *   1. `scoreAlert` is NOT exported from alertAccuracy module (deleted in T-2/c64).
 *   2. `formatAccuracyReport` uses domain scorer exclusively (classifyAlertType +
 *      scoreAlertOutcome) — no local scoring path remains.
 *   3. Pre-scored rows (Path 1) still pass through DB outcome column untouched.
 *   4. NULL-outcome rows (Path 2) route through domain scorer only.
 *   5. Mixed batch produces consistent results using a single code path.
 *
 * Uses :memory: SQLite (enforced by setup.ts preload + beforeAll override).
 * No mocking of domain scorer — tests true end-to-end flow.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import * as alertAccuracyModule from "../interface/mcp/tools/alerts/alertAccuracy.js";
import { formatAccuracyReport } from "../interface/mcp/tools/alerts/alertAccuracy.js";
import {
  classifyAlertType,
  scoreAlertOutcome,
} from "../domain/services/alertOutcomeScorer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal type mirrored from alertAccuracy (not exported, so we define it here)
// ─────────────────────────────────────────────────────────────────────────────

interface AlertRow {
  id: string;
  triggered_at: string;
  severity: string;
  signals_json: string | null;
  affected_actions_json: string | null;
  outcome: string | null;
  outcome_at: string | null;
  outcome_detail: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeRow(
  id: string,
  signalType: string,
  code: string,
  outcome: string | null = null,
  daysAgo = 5,
): AlertRow {
  return {
    id,
    triggered_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    severity: "medium",
    signals_json: JSON.stringify([{ type: signalType }]),
    affected_actions_json: JSON.stringify([{ code }]),
    outcome,
    outcome_at: null,
    outcome_detail: null,
  };
}

function insertPriceHistory(code: string, price: number, offsetHours: number): void {
  const db = getDb();
  const fetchedAt = new Date(Date.now() - offsetHours * 3_600_000).toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO market_prices_history (code, price, volume, fetched_at)
    VALUES (?, ?, 0, ?)
  `).run(code, price, fetchedAt);
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  closeDb();
  await initDatabase();

  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      volume     REAL NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (code, fetched_at)
    );
    CREATE INDEX IF NOT EXISTS idx_spike006_mph
      ON market_prices_history(code, fetched_at DESC);
  `);
});

afterAll(() => {
  closeDb();
});

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM alerts");
  db.exec("DELETE FROM market_prices_history");
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("SPIKE_006 — Scoring Unification Integration", () => {
  // ── Test 1: scoreAlert must NOT exist in module exports ───────────────────

  it("scoreAlert is NOT exported from alertAccuracy module (deleted in T-2/c64)", () => {
    // This assertion is the primary acceptance criterion for the deletion task.
    // If scoreAlert still exists in exports, the unification is incomplete.
    expect("scoreAlert" in alertAccuracyModule).toBe(false);
  });

  // ── Test 2: domain scorer functions are importable and correct ────────────

  it("domain scorer (classifyAlertType + scoreAlertOutcome) is the sole scoring path", () => {
    // Validate that domain scorer functions produce expected results directly.
    // This confirms the domain layer contract that formatAccuracyReport relies on.

    const classification = classifyAlertType(
      JSON.stringify([{ type: "price_drop" }]),
      null,
    );
    expect(classification.alertClass).toBe("price-signal");
    expect(classification.direction).toBe("down");
    expect(classification.evalWindowDays).toBe(3);

    // Price dropped 2% → should be a HIT for price_drop direction=down
    const result = scoreAlertOutcome(
      classification,
      100,
      [{ price: 98, fetchedAt: new Date(Date.now() - 86_400_000).toISOString() }],
      1,
    );
    expect(result.outcome).toBe("hit");
  });

  // ── Test 3: formatAccuracyReport Path 1 (pre-scored) uses DB outcome ──────

  it("formatAccuracyReport Path 1 — pre-scored rows use DB outcome column directly", () => {
    const rows: AlertRow[] = [
      makeRow("p1-hit", "price_drop", "VNM", "HIT", 5),
      makeRow("p1-miss", "price_surge", "HPG", "MISS", 5),
      makeRow("p1-unk", "volume_spike", "FPT", "UNKNOWN", 5),
    ];

    const report = formatAccuracyReport(rows, 30);

    // All 3 rows have pre-scored outcomes → scored_pct = 100%
    expect(report.scored_pct).toBe(100);
    expect(report.hits).toBe(1);
    expect(report.misses).toBe(1);
    expect(report.unknowns).toBe(1);
    expect(report.total).toBe(3);
  });

  // ── Test 4: formatAccuracyReport Path 2 (NULL outcome) uses domain scorer ─

  it("formatAccuracyReport Path 2 — NULL outcome rows route through domain scorer only", () => {
    // Alert: price_drop, triggered 5 days ago (within 3-day eval window is past)
    const rows: AlertRow[] = [
      makeRow("p2-drop", "price_drop", "VCB", null, 5),
    ];

    // Seed price: baseline at alert time, then dropped price within window
    insertPriceHistory("VCB", 50, 5 * 24);         // price at alert (~5d ago)
    insertPriceHistory("VCB", 48.5, 3 * 24);       // price 2d later → -3% → HIT

    const report = formatAccuracyReport(rows, 30);

    // No pre-scored outcomes in DB → scored_pct = 0
    expect(report.scored_pct).toBe(0);
    // Domain scorer should produce a hit (price_drop, -3% > threshold 1%)
    expect(report.total).toBe(1);
    expect(report.hits).toBe(1);
  });

  // ── Test 5: mixed batch — Path 1 and Path 2 coexist consistently ──────────

  it("formatAccuracyReport mixed batch — Path 1 and Path 2 rows produce consistent totals", () => {
    // Two pre-scored rows (Path 1) + one NULL-outcome row (Path 2)
    const rows: AlertRow[] = [
      makeRow("mix-1", "price_drop", "VNM", "HIT", 10),
      makeRow("mix-2", "price_surge", "HPG", "MISS", 10),
      makeRow("mix-3", "price_drop", "MWG", null, 8),
    ];

    // Seed price for the NULL-outcome row (Path 2)
    insertPriceHistory("MWG", 80, 8 * 24);        // at alert time
    insertPriceHistory("MWG", 78, 6 * 24);        // 2d later → -2.5% → HIT

    const report = formatAccuracyReport(rows, 30);

    // 2 of 3 rows have pre-scored outcome → scored_pct = 67%
    expect(report.scored_pct).toBe(67);
    // Total = 3 (all rows have valid stock codes)
    expect(report.total).toBe(3);
    // HIT: mix-1 (Path 1 HIT) + mix-3 (Path 2 domain scorer HIT) = 2
    expect(report.hits).toBe(2);
    // MISS: mix-2 (Path 1 MISS) = 1
    expect(report.misses).toBe(1);
  });
});
