/**
 * Task 298 — computeMacroScore fix
 * Task 300 — computeMacroIndicatorScore fix (same pattern, same test file)
 *
 * Root cause: queries referenced non-existent columns `name`, `sigma`, `updated_at`.
 * Fix: use `indicator` column, `extracted_at`, compute z-score inline from history window.
 * Indicator names: 'brent_crude_usd', 'gold_usd_oz', 'wti_crude_usd'
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import {
  computeMacroScore,
  computeMacroIndicatorScore,
} from "../application/services/kinhDich/kinhDichScoring.js";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();

  // Create tracked_indicators table (owned by commodityTracker, not main schema)
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracked_indicators (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      indicator    TEXT NOT NULL,
      value        REAL NOT NULL,
      unit         TEXT NOT NULL DEFAULT '',
      source       TEXT NOT NULL DEFAULT '',
      extracted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tracked_ind_name_time
      ON tracked_indicators(indicator, extracted_at DESC);
  `);
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM tracked_indicators");
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: seed N rows for one indicator with linearly rising values
// ─────────────────────────────────────────────────────────────────────────────
function seedIndicator(indicator: string, count: number, startValue: number, step: number): void {
  const db = getDb();
  for (let i = 0; i < count; i++) {
    const value = startValue + i * step;
    // Row i=0 is oldest, i=count-1 is newest (highest extracted_at)
    const daysAgo = count - 1 - i;
    const extractedAt = `datetime('now', '-${daysAgo} days')`;
    db.exec(`
      INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
      VALUES ('${indicator}', ${value}, '$/bbl', 'test', ${extractedAt})
    `);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 298 — computeMacroScore
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 298 — computeMacroScore fix", () => {
  it("returns a negative value when oil is rising (macro stress)", () => {
    // Seed 20 rows of rising brent_crude_usd: 75 to 94 (step=1)
    // Latest value (94) is the highest — z-score should be strongly positive
    // computeMacroScore returns -avgZ/2, so it should be negative
    seedIndicator("brent_crude_usd", 20, 75, 1);

    const score = computeMacroScore();
    expect(score).toBeLessThan(0);
  });

  it("returns 0.0 when all values are equal (stddev=0)", () => {
    // All same value → std=0 → skip indicator → no zScores → return 0.0
    const db = getDb();
    for (let i = 0; i < 20; i++) {
      const daysAgo = 19 - i;
      db.exec(`
        INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
        VALUES ('brent_crude_usd', 80, '$/bbl', 'test', datetime('now', '-${daysAgo} days'))
      `);
    }

    const score = computeMacroScore();
    expect(score).toBe(0.0);
  });

  it("returns 0.0 when tracked_indicators table is empty", () => {
    const score = computeMacroScore();
    expect(score).toBe(0.0);
  });

  it("returns positive value when all indicators are falling (low macro stress)", () => {
    // Falling brent: 94 down to 75 (latest is lowest → z-score negative)
    // computeMacroScore returns -avgZ/2: negative z → positive score
    seedIndicator("brent_crude_usd", 20, 94, -1);

    const score = computeMacroScore();
    expect(score).toBeGreaterThan(0);
  });

  it("handles only oil indicator present (still computes)", () => {
    seedIndicator("brent_crude_usd", 10, 80, 0.5);
    const score = computeMacroScore();
    expect(typeof score).toBe("number");
    expect(isFinite(score)).toBe(true);
  });

  it("score is clamped to [-1, +1]", () => {
    // Extreme spike: last value is 10x the window mean
    const db = getDb();
    for (let i = 0; i < 19; i++) {
      db.exec(`
        INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
        VALUES ('brent_crude_usd', 80, '$/bbl', 'test', datetime('now', '-${20 - i} days'))
      `);
    }
    // Latest: extremely high
    db.exec(`
      INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
      VALUES ('brent_crude_usd', 8000, '$/bbl', 'test', datetime('now'))
    `);

    const score = computeMacroScore();
    expect(score).toBeGreaterThanOrEqual(-1);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX-COMMODITY-WTI-DELTA-CORRUPT (I10) — stale news-mined indicator exclusion
//
// wti_crude_usd has no live fetcher (news-regex extraction only). Live evidence
// (2026-07-23): 79 rows, all value=95.5, latest extracted_at=2026-04-12 — frozen
// 102+ days because no news article has mentioned WTI since. Before this fix,
// computeMacroScore() fed that frozen value into the z-score unconditionally,
// corrupting the Hao 6 oil-regime signal with a permanent phantom "reading".
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-COMMODITY-WTI-DELTA-CORRUPT I10 — stale indicator excluded from composite score", () => {
  it("a stale (>4h) frozen wti_crude_usd contributes ZERO influence — score matches WTI-absent baseline", () => {
    // Baseline: only brent_crude_usd seeded (fresh, rising) — no wti_crude_usd at all.
    seedIndicator("brent_crude_usd", 20, 75, 1);
    const baseline = computeMacroScore();

    // Reset and re-seed the SAME brent pattern, PLUS a rising wti_crude_usd series
    // (real variance, would otherwise produce a strong z-score) whose entire
    // history (including the "latest" row) is stale (>4h old) — mirrors the live
    // frozen-95.5-for-102-days pattern (a frozen series is the degenerate case of
    // "stale"; a varying-but-stale series proves the guard keys on staleness, not
    // on the value being constant / std=0).
    const db = getDb();
    db.exec("DELETE FROM tracked_indicators");
    seedIndicator("brent_crude_usd", 20, 75, 1);
    for (let i = 0; i < 20; i++) {
      const hoursAgo = 40 - i; // 40h..21h ago — all well beyond the 4h staleness threshold
      const value = 75 + i; // rising, same shape as the brent fixture (real variance)
      db.exec(`
        INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
        VALUES ('wti_crude_usd', ${value}, '$/bbl', 'test', datetime('now', '-${hoursAgo} hours'))
      `);
    }
    const withStaleWti = computeMacroScore();

    // The stale WTI series (despite carrying real variance) must be excluded
    // entirely — score must match the WTI-absent baseline, not be skewed by it.
    expect(withStaleWti).toBeCloseTo(baseline, 6);
  });

  it("control: a FRESH (<4h) falling wti_crude_usd series DOES influence the score", () => {
    // Proves the guard is staleness-specific — not an unconditional WTI blackout.
    // WTI is seeded FALLING (opposite shape from brent's rising fixture) so its
    // z-score differs from brent's — if the fix wrongly excluded ALL wti_crude_usd
    // unconditionally, this fresh series would be dropped too and the score would
    // match the baseline; it must NOT.
    seedIndicator("brent_crude_usd", 20, 75, 1);
    const baseline = computeMacroScore();

    const db = getDb();
    db.exec("DELETE FROM tracked_indicators");
    seedIndicator("brent_crude_usd", 20, 75, 1);
    for (let i = 0; i < 20; i++) {
      const hoursAgo = i === 19 ? 0 : 40 - i; // latest row (i=19) is fresh ("now")
      const value = 94 - i; // falling — opposite shape from brent's rising fixture
      db.exec(`
        INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
        VALUES ('wti_crude_usd', ${value}, '$/bbl', 'test', datetime('now', '-${hoursAgo} hours'))
      `);
    }
    const withFreshFallingWti = computeMacroScore();

    expect(withFreshFallingWti).not.toBeCloseTo(baseline, 3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 300 — computeMacroIndicatorScore fix
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 300 — computeMacroIndicatorScore fix", () => {
  it("returns a positive value when usd_vnd is rising", () => {
    // Rising usd_vnd: latest is highest → z-score positive → score positive (+z/2)
    seedIndicator("usd_vnd", 20, 24000, 10);

    const score = computeMacroIndicatorScore("usd_vnd");
    expect(score).toBeGreaterThan(0);
  });

  it("returns 0.0 when fewer than 3 rows exist", () => {
    const db = getDb();
    db.exec(`
      INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
      VALUES ('usd_vnd', 24500, '', 'test', datetime('now'))
    `);
    db.exec(`
      INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
      VALUES ('usd_vnd', 24400, '', 'test', datetime('now', '-1 days'))
    `);

    const score = computeMacroIndicatorScore("usd_vnd");
    expect(score).toBe(0.0);
  });

  it("returns 0.0 when indicator has no rows", () => {
    const score = computeMacroIndicatorScore("usd_vnd");
    expect(score).toBe(0.0);
  });

  it("returns a negative value when usd_vnd is falling (latest is lowest)", () => {
    // Falling: start high, step negative, latest is lowest → z < 0 → score < 0
    seedIndicator("usd_vnd", 20, 24500, -10);

    const score = computeMacroIndicatorScore("usd_vnd");
    expect(score).toBeLessThan(0);
  });

  it("score is clamped to [-1, +1]", () => {
    // Extreme spike
    const db = getDb();
    for (let i = 0; i < 20; i++) {
      const daysAgo = 20 - i;
      db.exec(`
        INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
        VALUES ('brent_crude_usd', 80, '$/bbl', 'test', datetime('now', '-${daysAgo} days'))
      `);
    }
    db.exec(`
      INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
      VALUES ('brent_crude_usd', 99999, '$/bbl', 'test', datetime('now'))
    `);

    const score = computeMacroIndicatorScore("brent_crude_usd");
    expect(score).toBeGreaterThanOrEqual(-1);
    expect(score).toBeLessThanOrEqual(1);
  });
});
