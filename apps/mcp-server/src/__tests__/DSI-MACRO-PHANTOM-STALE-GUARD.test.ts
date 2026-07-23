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

import { describe, it, expect, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildMacroSection } from "../domain/services/marketContextBuilder.js";
import { listTrackedIndicatorsFromDb } from "../infrastructure/db/commodityTracker.js";
import { formatCommoditiesSection } from "../scheduler/briefings/morningBriefingJob.js";

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

// ─────────────────────────────────────────────────────────────────────────────
// GUARD-7..8: FIX-COMMODITY-WTI-DELTA-CORRUPT (I10) — the wiring this file's own
// header comment promised ("listTrackedIndicators() adds isStale flag so
// consumers (assembleBriefing step 9) can surface honest staleness to agents")
// but was never actually delivered at the assembleBriefing.ts call site —
// step 9 called the UNGUARDED listTrackedIndicators() (no isStale) the whole
// time, so a frozen wti_crude_usd (live case: stuck at $95.5 for 102+ days,
// last real news extraction 2026-04-12) was served to the morning Telegram
// briefing as an unqualified "current" price. GUARD-7 proves the real
// assembleBriefing() end-to-end wiring now threads isStale through; GUARD-8
// proves the Telegram formatter surfaces it as "[STALE]" (never silently drops
// or silently serves it as fresh).
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal DB schema covering assembleBriefing's UNGUARDED steps (3-6) — proven
 * table set (mirrors 1159-morning-briefing-enrichment.test.ts's setupTestDb) —
 * plus tracked_indicators (step 9, under test here). Every step past #9 is
 * wrapped in try/catch in the real implementation (verified at source), so no
 * further tables are required for the pipeline to reach `return`. */
function buildAssembleBriefingFixtureDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE watchlist (
      code              TEXT PRIMARY KEY,
      company_name      TEXT,
      exchange          TEXT NOT NULL DEFAULT 'HOSE',
      domain            TEXT NOT NULL DEFAULT 'other',
      notes             TEXT,
      added_at          TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct    REAL NOT NULL DEFAULT -3,
      alert_rise_pct    REAL NOT NULL DEFAULT 5,
      alert_impact_min  REAL NOT NULL DEFAULT 7,
      alert_report_new  INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT
    );
    CREATE TABLE daily_ohlcv (
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL NOT NULL,
      high       REAL NOT NULL,
      low        REAL NOT NULL,
      close      REAL NOT NULL,
      volume     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (code, date)
    );
    CREATE TABLE rag_analyses (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, level TEXT NOT NULL,
      source_title TEXT, sentiment TEXT, impact_score REAL
    );
    CREATE TABLE alerts (
      id TEXT PRIMARY KEY, triggered_at TEXT NOT NULL, severity TEXT NOT NULL,
      affected_actions_json TEXT, message TEXT
    );
    CREATE TABLE financial_reports (
      id TEXT PRIMARY KEY, action_code TEXT NOT NULL, period_year INTEGER,
      period_type TEXT, parsed_at TEXT
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
  `);
  return db;
}

const I10_BRIEFINGS_DIR = join(process.cwd(), "data", "__test-briefings-i10__");
function cleanupI10BriefingsDir(): void {
  if (existsSync(I10_BRIEFINGS_DIR)) {
    rmSync(I10_BRIEFINGS_DIR, { recursive: true, force: true });
  }
}
const i10Noop = () => Promise.resolve({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 });

describe("FIX-COMMODITY-WTI-DELTA-CORRUPT I10 — assembleBriefing step 9 wiring", () => {
  afterEach(() => cleanupI10BriefingsDir());

  it("GUARD-7: a stale wti_crude_usd row surfaces as trackedCommodities[].isStale=true (real assembleBriefing() path)", async () => {
    const db = buildAssembleBriefingFixtureDb();
    mkdirSync(I10_BRIEFINGS_DIR, { recursive: true });
    insertTrackedRow(db, "wti_crude_usd", 95.5, 6); // 6h old = stale (mirrors live 102-day-stale case)

    const { assembleBriefing } = await import("../application/usecases/assembleBriefing.js");
    const briefing = await assembleBriefing({
      db,
      pollNewsFn: i10Noop,
      fetchVnIndexFn: async () => null,
      briefingsDir: I10_BRIEFINGS_DIR,
    });

    const wtiEntry = briefing.trackedCommodities.find((c) => c.indicator === "wti_crude_usd");
    expect(wtiEntry).toBeDefined();
    expect(wtiEntry!.isStale).toBe(true);
    // Value is still returned (transparency) — the point is the flag, not suppression.
    expect(wtiEntry!.value).toBe(95.5);
    db.close();
  });

  it("GUARD-7b (regression control): a fresh wti_crude_usd row surfaces isStale=false", async () => {
    const db = buildAssembleBriefingFixtureDb();
    mkdirSync(I10_BRIEFINGS_DIR, { recursive: true });
    insertTrackedRow(db, "wti_crude_usd", 79.8, 1); // 1h old = fresh

    const { assembleBriefing } = await import("../application/usecases/assembleBriefing.js");
    const briefing = await assembleBriefing({
      db,
      pollNewsFn: i10Noop,
      fetchVnIndexFn: async () => null,
      briefingsDir: I10_BRIEFINGS_DIR,
    });

    const wtiEntry = briefing.trackedCommodities.find((c) => c.indicator === "wti_crude_usd");
    expect(wtiEntry).toBeDefined();
    expect(wtiEntry!.isStale).toBe(false);
    expect(wtiEntry!.value).toBe(79.8);
    db.close();
  });

  it("GUARD-8: formatCommoditiesSection renders '[STALE]' for isStale:true — never a bare 'current' price", () => {
    const lines = formatCommoditiesSection([
      { indicator: "wti_crude_usd", value: 95.5, unit: "$/bbl", dataPoints: 79, isStale: true },
    ]);
    const line = lines.find((l) => l.includes("wti_crude_usd"))!;
    expect(line).toContain("[STALE]");
  });

  it("GUARD-8b (regression control): formatCommoditiesSection omits '[STALE]' for isStale:false/undefined", () => {
    const lines = formatCommoditiesSection([
      { indicator: "brent_crude_usd", value: 99.85, unit: "$/bbl", dataPoints: 30, isStale: false },
    ]);
    const line = lines.find((l) => l.includes("brent_crude_usd"))!;
    expect(line).not.toContain("[STALE]");
  });
});
