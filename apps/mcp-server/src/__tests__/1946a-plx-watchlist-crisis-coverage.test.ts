/**
 * Task 1946a — PLX watchlist crisis detection coverage
 *
 * Root cause: PLX absent from all three watchlist SSoT sources.
 * `get_crisis_early_warning` queries `SELECT code FROM watchlist` — PLX
 * never entered it. This test verifies the fix.
 *
 * Acceptance criteria covered:
 *   AC-1: PLX present in WATCHLIST_SEED with exchange=HOSE, domain=oil_gas
 *   AC-4: seed PLX into in-memory DB, record mention velocity ≥2.0× baseline,
 *         getCrisisEarlyWarning returns PLX in crisisIndicators
 *   AC-5: seedWatchlist idempotency still holds after PLX addition
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  seedWatchlist,
  WATCHLIST_SEED,
} from "../infrastructure/db/seedWatchlist.js";
import { recordMention } from "../infrastructure/db/mentionVelocityStore.js";
import { getCrisisEarlyWarning } from "../application/usecases/getCrisisEarlyWarning.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB helpers — minimal schema for watchlist + mention_velocity
// ─────────────────────────────────────────────────────────────────────────────

function createTestDb(): Database {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code             TEXT PRIMARY KEY,
      exchange         TEXT NOT NULL,
      domain           TEXT NOT NULL DEFAULT 'other',
      notes            TEXT,
      added_at         TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct   REAL NOT NULL DEFAULT -3,
      alert_rise_pct   REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7,
      alert_report_new INTEGER NOT NULL DEFAULT 1
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS mention_velocity (
      code          TEXT NOT NULL,
      hour          TEXT NOT NULL,
      mention_count INTEGER NOT NULL DEFAULT 0,
      negative_count INTEGER NOT NULL DEFAULT 0,
      source_count  INTEGER NOT NULL DEFAULT 0,
      UNIQUE(code, hour)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reputation_scores (
      code        TEXT NOT NULL,
      date        TEXT NOT NULL,
      score       REAL NOT NULL DEFAULT 70.0,
      risk_level  TEXT NOT NULL DEFAULT 'low',
      trend       TEXT NOT NULL DEFAULT 'stable',
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, date)
    )
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function currentHourKey(): string {
  const h = new Date();
  h.setMinutes(0, 0, 0);
  return h.toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1946a — PLX watchlist crisis detection coverage", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  // ── AC-1: PLX present in WATCHLIST_SEED ───────────────────────────────────

  it("AC-1a: WATCHLIST_SEED contains PLX", () => {
    const plxEntry = WATCHLIST_SEED.find((e) => e.code === "PLX");
    expect(plxEntry).toBeDefined();
  });

  it("AC-1b: PLX has exchange=HOSE in WATCHLIST_SEED", () => {
    const plxEntry = WATCHLIST_SEED.find((e) => e.code === "PLX");
    expect(plxEntry?.exchange).toBe("HOSE");
  });

  it("AC-1c: PLX has domain=oil_gas in WATCHLIST_SEED", () => {
    const plxEntry = WATCHLIST_SEED.find((e) => e.code === "PLX");
    expect(plxEntry?.domain).toBe("oil_gas");
  });

  // ── AC-4: seed PLX → mock velocity ≥2.0 → crisisIndicators contains PLX ──

  it("AC-4: getCrisisEarlyWarning returns PLX in crisisIndicators when velocity ≥2.0× baseline", async () => {
    // Seed PLX into watchlist
    seedWatchlist(db);

    // Verify PLX is now in the watchlist table
    const row = db
      .prepare("SELECT code, exchange, domain FROM watchlist WHERE code = ?")
      .get("PLX") as { code: string; exchange: string; domain: string } | null;
    expect(row).not.toBeNull();
    expect(row?.exchange).toBe("HOSE");
    expect(row?.domain).toBe("oil_gas");

    const now = Date.now();

    // Seed low historical baseline: 2 mentions/hr across 5 past hours
    // (these are in the 24h window used by getBaseline)
    for (let i = 2; i <= 6; i++) {
      const pastHour = new Date(now - i * 60 * 60 * 1000);
      pastHour.setMinutes(0, 0, 0);
      recordMention(db, {
        code: "PLX",
        hour: pastHour.toISOString(),
        mentionCount: 2,
        negativeCount: 0,
        sourceCount: 1,
      });
    }

    // Current hour: 10 mentions — baseline avg over 6 hours = (2+2+2+2+2+10)/6 ≈ 3.3
    // velocityRatio = 10 / 3.3 ≈ 3.0 ≥ 2.0 → should trigger crisis indicator
    // Note: getBaseline uses a lookback window including the current hour record
    const hourKey = currentHourKey();
    recordMention(db, {
      code: "PLX",
      hour: hourKey,
      mentionCount: 10,
      negativeCount: 6,
      sourceCount: 3,
    });

    // Call use case with PLX in stock codes
    const result = await getCrisisEarlyWarning(db, ["PLX"]);

    expect(result.crisisIndicators.length).toBeGreaterThan(0);
    const plxIndicator = result.crisisIndicators.find(
      (ind) => ind.stockCode === "PLX",
    );
    expect(plxIndicator).toBeDefined();
    expect(plxIndicator?.velocityRatio).toBeGreaterThanOrEqual(2.0);
  });

  it("AC-4b: PLX NOT in crisisIndicators when velocity < 2.0× baseline", async () => {
    seedWatchlist(db);

    // Seed 5 hours of historical baseline: 5 mentions/hr average
    const now = Date.now();
    for (let i = 1; i <= 5; i++) {
      const pastHour = new Date(now - i * 60 * 60 * 1000);
      pastHour.setMinutes(0, 0, 0);
      recordMention(db, {
        code: "PLX",
        hour: pastHour.toISOString(),
        mentionCount: 5,
        negativeCount: 1,
        sourceCount: 1,
      });
    }

    // Current hour: only 6 mentions — ratio = 6/5 = 1.2 < 2.0 → no crisis
    const hourKey = currentHourKey();
    recordMention(db, {
      code: "PLX",
      hour: hourKey,
      mentionCount: 6,
      negativeCount: 1,
      sourceCount: 1,
    });

    const result = await getCrisisEarlyWarning(db, ["PLX"]);
    const plxIndicator = result.crisisIndicators.find(
      (ind) => ind.stockCode === "PLX",
    );
    expect(plxIndicator).toBeUndefined();
  });

  // ── AC-5: idempotency after PLX addition ───────────────────────────────────

  it("AC-5: seedWatchlist is idempotent — calling twice keeps same PLX row", () => {
    seedWatchlist(db);
    seedWatchlist(db); // second call — must not duplicate

    const rows = db
      .prepare("SELECT code FROM watchlist WHERE code = 'PLX'")
      .all() as { code: string }[];
    expect(rows).toHaveLength(1);
  });

  it("AC-5b: total row count is stable after two seedWatchlist calls", () => {
    seedWatchlist(db);
    const { cnt1 } = db.prepare("SELECT COUNT(*) AS cnt1 FROM watchlist").get() as { cnt1: number };

    seedWatchlist(db);
    const { cnt2 } = db.prepare("SELECT COUNT(*) AS cnt2 FROM watchlist").get() as { cnt2: number };

    expect(cnt2).toBe(cnt1);
  });
});
