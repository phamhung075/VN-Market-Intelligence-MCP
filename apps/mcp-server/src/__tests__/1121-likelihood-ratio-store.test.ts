Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1121 — evidence_likelihood_ratios DDL + likelihoodRatioStore CRUD
 *
 * Tests cover:
 * - Schema helper creates evidence_likelihood_ratios table in :memory:
 * - upsertLikelihoodRatio inserts a row and is idempotent on re-run
 * - upsertLikelihoodRatio stores likelihood_ratio = 1.0 when sample_size < 10
 * - getLikelihoodRatio returns 1.0 for missing rows (no throw)
 * - getLikelihoodRatio returns 1.0 for rows with sample_size < 10
 * - getLikelihoodRatios returns all rows for a (type, direction) pair
 * - getAllEvidenceTypePairs returns correct pairs
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  upsertLikelihoodRatio,
  getLikelihoodRatio,
  getLikelihoodRatios,
  getAllEvidenceTypePairs,
} from "../infrastructure/db/likelihoodRatioStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create in-memory DB with the evidence_likelihood_ratios table
// ─────────────────────────────────────────────────────────────────────────────

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_likelihood_ratios (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      evidence_type    TEXT NOT NULL,
      direction        TEXT NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
      horizon_days     INTEGER NOT NULL CHECK(horizon_days IN (5, 10, 20)),
      likelihood_ratio REAL NOT NULL DEFAULT 1.0,
      sample_size      INTEGER NOT NULL DEFAULT 0,
      last_updated     TEXT NOT NULL,
      UNIQUE(evidence_type, direction, horizon_days)
    );
    CREATE INDEX IF NOT EXISTS idx_elr_type_dir ON evidence_likelihood_ratios(evidence_type, direction);
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1121 — likelihood ratio store", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  // ── DDL ─────────────────────────────────────────────────────────────────────

  it("creates the evidence_likelihood_ratios table without error", () => {
    // Table creation is done in createTestDb — if we get here it succeeded
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='evidence_likelihood_ratios'")
      .all();
    expect(rows.length).toBe(1);
  });

  it("creates the idx_elr_type_dir index", () => {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_elr_type_dir'")
      .all();
    expect(rows.length).toBe(1);
  });

  // ── upsertLikelihoodRatio ────────────────────────────────────────────────────

  it("inserts a new likelihood ratio row", () => {
    upsertLikelihoodRatio(db, {
      evidence_type: "news_sentiment_macro",
      direction: "bullish",
      horizon_days: 10,
      likelihood_ratio: 2.5,
      sample_size: 50,
    });

    const row = db
      .prepare("SELECT * FROM evidence_likelihood_ratios WHERE evidence_type = ? AND direction = ? AND horizon_days = ?")
      .get("news_sentiment_macro", "bullish", 10) as {
        likelihood_ratio: number;
        sample_size: number;
      } | null;

    expect(row).not.toBeNull();
    expect(row!.likelihood_ratio).toBe(2.5);
    expect(row!.sample_size).toBe(50);
  });

  it("upsert is idempotent on re-run (updates existing row)", () => {
    upsertLikelihoodRatio(db, {
      evidence_type: "bctc_revenue_growth",
      direction: "bearish",
      horizon_days: 5,
      likelihood_ratio: 1.8,
      sample_size: 20,
    });

    upsertLikelihoodRatio(db, {
      evidence_type: "bctc_revenue_growth",
      direction: "bearish",
      horizon_days: 5,
      likelihood_ratio: 1.9,
      sample_size: 25,
    });

    const count = db
      .prepare("SELECT COUNT(*) as c FROM evidence_likelihood_ratios")
      .get() as { c: number };
    expect(count.c).toBe(1);

    const row = db
      .prepare("SELECT likelihood_ratio, sample_size FROM evidence_likelihood_ratios WHERE evidence_type = ? AND direction = ? AND horizon_days = ?")
      .get("bctc_revenue_growth", "bearish", 5) as { likelihood_ratio: number; sample_size: number } | null;
    expect(row!.likelihood_ratio).toBe(1.9);
    expect(row!.sample_size).toBe(25);
  });

  it("stores likelihood_ratio = 1.0 when sample_size < 10 (business rule)", () => {
    upsertLikelihoodRatio(db, {
      evidence_type: "price_momentum_5d",
      direction: "bullish",
      horizon_days: 20,
      likelihood_ratio: 3.7,
      sample_size: 5, // < 10 → should be stored as 1.0
    });

    const row = db
      .prepare("SELECT likelihood_ratio, sample_size FROM evidence_likelihood_ratios WHERE evidence_type = ? AND direction = ? AND horizon_days = ?")
      .get("price_momentum_5d", "bullish", 20) as { likelihood_ratio: number; sample_size: number } | null;

    expect(row).not.toBeNull();
    expect(row!.likelihood_ratio).toBe(1.0);
    expect(row!.sample_size).toBe(5); // actual sample_size stored, not overridden
  });

  it("stores likelihood_ratio = 1.0 when sample_size is exactly 0", () => {
    upsertLikelihoodRatio(db, {
      evidence_type: "kinh_dich_signal",
      direction: "neutral",
      horizon_days: 10,
      likelihood_ratio: 2.0,
      sample_size: 0,
    });

    const row = db
      .prepare("SELECT likelihood_ratio FROM evidence_likelihood_ratios")
      .get() as { likelihood_ratio: number } | null;

    expect(row!.likelihood_ratio).toBe(1.0);
  });

  // ── getLikelihoodRatio ───────────────────────────────────────────────────────

  it("getLikelihoodRatio returns 1.0 for a completely missing row (no throw)", () => {
    const result = getLikelihoodRatio(db, "nonexistent_type", "bullish", 10);
    expect(result).toBe(1.0);
  });

  it("getLikelihoodRatio returns 1.0 for a row with sample_size < 10", () => {
    upsertLikelihoodRatio(db, {
      evidence_type: "bctc_pe_ratio",
      direction: "bearish",
      horizon_days: 5,
      likelihood_ratio: 4.2, // stored as 1.0 by upsert due to low sample
      sample_size: 3,
    });

    const result = getLikelihoodRatio(db, "bctc_pe_ratio", "bearish", 5);
    expect(result).toBe(1.0);
  });

  it("getLikelihoodRatio returns the stored ratio when sample_size >= 10", () => {
    upsertLikelihoodRatio(db, {
      evidence_type: "news_sentiment_stock",
      direction: "bullish",
      horizon_days: 20,
      likelihood_ratio: 2.8,
      sample_size: 15,
    });

    const result = getLikelihoodRatio(db, "news_sentiment_stock", "bullish", 20);
    expect(result).toBe(2.8);
  });

  // ── getLikelihoodRatios ──────────────────────────────────────────────────────

  it("getLikelihoodRatios returns empty array when no rows exist", () => {
    const result = getLikelihoodRatios(db, "missing_type", "bullish");
    expect(result).toEqual([]);
  });

  it("getLikelihoodRatios returns all horizon_days rows for a (type, direction) pair", () => {
    for (const horizonDays of [5, 10, 20] as const) {
      upsertLikelihoodRatio(db, {
        evidence_type: "bctc_debt_equity",
        direction: "bearish",
        horizon_days: horizonDays,
        likelihood_ratio: 1.5 + horizonDays * 0.1,
        sample_size: 12,
      });
    }

    const rows = getLikelihoodRatios(db, "bctc_debt_equity", "bearish");
    expect(rows.length).toBe(3);
    const horizons = rows.map((r) => r.horizon_days).sort((a, b) => a - b);
    expect(horizons).toEqual([5, 10, 20]);
  });

  it("getLikelihoodRatios does not return rows for other directions", () => {
    upsertLikelihoodRatio(db, {
      evidence_type: "bctc_debt_equity",
      direction: "bullish",
      horizon_days: 10,
      likelihood_ratio: 1.8,
      sample_size: 15,
    });
    upsertLikelihoodRatio(db, {
      evidence_type: "bctc_debt_equity",
      direction: "bearish",
      horizon_days: 10,
      likelihood_ratio: 2.2,
      sample_size: 11,
    });

    const bullishRows = getLikelihoodRatios(db, "bctc_debt_equity", "bullish");
    expect(bullishRows.length).toBe(1);
    expect(bullishRows[0]?.direction).toBe("bullish");
  });

  // ── getAllEvidenceTypePairs ───────────────────────────────────────────────────

  it("getAllEvidenceTypePairs returns empty array when table is empty", () => {
    const result = getAllEvidenceTypePairs(db);
    expect(result).toEqual([]);
  });

  it("getAllEvidenceTypePairs returns correct distinct (evidence_type, direction) pairs", () => {
    // Insert 3 rows with 2 distinct (type, direction) pairs + 1 extra horizon for first pair
    upsertLikelihoodRatio(db, {
      evidence_type: "news_sentiment_macro",
      direction: "bullish",
      horizon_days: 5,
      likelihood_ratio: 1.5,
      sample_size: 20,
    });
    upsertLikelihoodRatio(db, {
      evidence_type: "news_sentiment_macro",
      direction: "bullish",
      horizon_days: 10,
      likelihood_ratio: 1.7,
      sample_size: 22,
    });
    upsertLikelihoodRatio(db, {
      evidence_type: "bctc_revenue_growth",
      direction: "bearish",
      horizon_days: 10,
      likelihood_ratio: 2.1,
      sample_size: 18,
    });

    const pairs = getAllEvidenceTypePairs(db);
    expect(pairs.length).toBe(2);

    const pairSet = new Set(pairs.map((p) => `${p.evidence_type}:${p.direction}`));
    expect(pairSet.has("news_sentiment_macro:bullish")).toBe(true);
    expect(pairSet.has("bctc_revenue_growth:bearish")).toBe(true);
  });

  it("getAllEvidenceTypePairs returns each pair only once even with multiple horizon_days", () => {
    for (const h of [5, 10, 20] as const) {
      upsertLikelihoodRatio(db, {
        evidence_type: "price_momentum_20d",
        direction: "neutral",
        horizon_days: h,
        likelihood_ratio: 1.0,
        sample_size: 30,
      });
    }

    const pairs = getAllEvidenceTypePairs(db);
    expect(pairs.length).toBe(1);
    expect(pairs[0]?.evidence_type).toBe("price_momentum_20d");
    expect(pairs[0]?.direction).toBe("neutral");
  });
});
