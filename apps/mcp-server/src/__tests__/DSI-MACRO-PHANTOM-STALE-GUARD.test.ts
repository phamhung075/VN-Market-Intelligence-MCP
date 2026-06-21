/**
 * DSI-MACRO-PHANTOM-STALE-GUARD — Staleness gate for news-mined macro indicators
 *
 * Problem: tracked_indicators rows extracted from old news articles (e.g. WTI=95.5,
 * dow_jones=23750) are served as "current" values to agents. The 48h freshness
 * window in buildMacroSection is too permissive — news text can cite arbitrary
 * historical prices. Live oil ~$80 but stale WTI=95.5 corrupts regime analysis.
 *
 * Fix: tighten buildMacroSection tracked_indicators window to 4h (matches macro
 * refresh job cadence). listTrackedIndicators() adds isStale flag so consumers
 * (assembleBriefing step 9) can surface honest staleness to agents.
 *
 * Tests:
 *   GUARD-1: buildMacroSection — stale row (>4h) is NOT included in output
 *   GUARD-2: buildMacroSection — fresh row (≤4h) IS included in output
 *   GUARD-3: buildMacroSection — row at exactly 4h boundary is excluded
 *   GUARD-4: listTrackedIndicators — returns isStale:true for rows >4h old
 *   GUARD-5: listTrackedIndicators — returns isStale:false for rows ≤4h old
 *   GUARD-6: buildMacroSection — stale row does NOT leak phantom price as live value
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { buildMacroSection } from "../domain/services/marketContextBuilder.js";
import { listTrackedIndicatorsFromDb } from "../infrastructure/db/commodityTracker.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB fixture helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildMinimalDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE market_prices (
      code TEXT PRIMARY KEY,
      price REAL,
      change_pct REAL,
      updated_at TEXT
    );
    CREATE TABLE tracked_indicators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      indicator TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'news',
      extracted_at TEXT NOT NULL,
      data_env TEXT
    );
    CREATE TABLE sbv_rates (
      source TEXT PRIMARY KEY,
      usd_vnd_official REAL,
      fetched_at TEXT
    );
  `);
  return db;
}

/** Insert a tracked_indicator row with given age in hours. */
function insertTrackedRow(
  db: Database,
  indicator: string,
  value: number,
  ageHours: number,
): void {
  const extractedAt = new Date(Date.now() - ageHours * 3_600_000).toISOString();
  db.prepare(
    `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
     VALUES (?, ?, '$/unit', 'news', ?)`,
  ).run(indicator, value, extractedAt);
}

// ─────────────────────────────────────────────────────────────────────────────
// GUARD-1..3: buildMacroSection staleness gate
// ─────────────────────────────────────────────────────────────────────────────

describe("DSI-MACRO-PHANTOM-STALE-GUARD — buildMacroSection tracked_indicators gate", () => {
  it("GUARD-1: stale row (>4h old) is NOT included in macro section output", () => {
    const db = buildMinimalDb();
    // Insert wti_crude_usd extracted 5 hours ago (stale)
    insertTrackedRow(db, "wti_crude_usd", 95.5, 5);

    const text = buildMacroSection(db);

    // The phantom stale value must NOT appear as a live price
    expect(text).not.toContain("wti_crude_usd");
    expect(text).not.toContain("95.5");
  });

  it("GUARD-2: fresh row (≤4h old) IS included in macro section output", () => {
    const db = buildMinimalDb();
    // Insert a fresh wti value extracted 2 hours ago
    insertTrackedRow(db, "wti_crude_usd", 79.8, 2);

    const text = buildMacroSection(db);

    expect(text).toContain("wti_crude_usd");
    expect(text).toContain("79.8");
  });

  it("GUARD-3: row at exactly 4h boundary is excluded (strict <)", () => {
    const db = buildMinimalDb();
    // Exactly 4h old — should be excluded (boundary: strictly less than 4h to be fresh)
    insertTrackedRow(db, "dow_jones", 23750, 4);

    const text = buildMacroSection(db);

    // dow_jones=23750 phantom must not appear
    expect(text).not.toContain("dow_jones");
    expect(text).not.toContain("23750");
  });

  it("GUARD-6: phantom WTI=95.5 from stale news row does NOT appear as live value", () => {
    const db = buildMinimalDb();
    // Simulate the production scenario: 79 data points, latest extracted 6h ago
    // (still within old 48h window but outside new 4h window)
    for (let i = 0; i < 5; i++) {
      insertTrackedRow(db, "wti_crude_usd", 95.5, 6 + i); // all stale
    }

    const text = buildMacroSection(db);

    expect(text).not.toContain("95.5");
    // Must not claim macro data is available from a stale wti row
    expect(text).not.toContain("wti_crude_usd");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GUARD-4..5: listTrackedIndicatorsFromDb isStale flag
// ─────────────────────────────────────────────────────────────────────────────

describe("DSI-MACRO-PHANTOM-STALE-GUARD — listTrackedIndicatorsFromDb isStale flag", () => {
  it("GUARD-4: returns isStale:true for indicator with lastSeen >4h ago", () => {
    const db = buildMinimalDb();
    insertTrackedRow(db, "wti_crude_usd", 95.5, 6); // 6h old = stale

    const results = listTrackedIndicatorsFromDb(db);
    const wti = results.find((r) => r.indicator === "wti_crude_usd");

    expect(wti).toBeDefined();
    expect(wti!.isStale).toBe(true);
    // Value is still returned so callers can display it with a stale marker
    expect(wti!.value).toBe(95.5);
  });

  it("GUARD-5: returns isStale:false for indicator with lastSeen ≤4h ago", () => {
    const db = buildMinimalDb();
    insertTrackedRow(db, "wti_crude_usd", 79.8, 1); // 1h old = fresh

    const results = listTrackedIndicatorsFromDb(db);
    const wti = results.find((r) => r.indicator === "wti_crude_usd");

    expect(wti).toBeDefined();
    expect(wti!.isStale).toBe(false);
    expect(wti!.value).toBe(79.8);
  });
});
