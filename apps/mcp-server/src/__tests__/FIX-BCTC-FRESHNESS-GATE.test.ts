/**
 * FIX-BCTC-FRESHNESS-GATE — Contract 2 tests
 *
 * Verifies the active freshness check for vn-bctc-fetch in vpsHealthPoller.ts:
 *   - passive: true replaced with latestTimestampSql on bctc_vps_queue.
 *   - 24h staleness threshold.
 *   - Earnings-window guard (queueGuardSql): returns "idle" when queue is empty
 *     and no recent done rows (off-season), not "unhealthy" (false alarm).
 *
 * Fault-path RAW-verification:
 *   baseline_pass_A: non-empty queue + last_attempt > 24h ago → UNHEALTHY (stale path).
 *   baseline_pass_B: non-empty queue + last_attempt < 24h ago → HEALTHY (fresh).
 *   baseline_pass_C: empty queue (no pending/url_not_found) + no done rows in 7d → IDLE.
 *   baseline_pass_D: empty queue + recent done row (< 7d) → HEALTHY (all resolved, fresh).
 *   baseline_pass_E: active queue + no done rows yet → UNREACHABLE (no data yet, not idle).
 */

import { describe, it, expect } from "bun:test";
import { Database as SqliteDatabase } from "bun:sqlite";
import type { Database } from "bun:sqlite";

import {
  checkServiceFreshness,
  DEFAULT_FRESHNESS_CONFIGS,
  type FreshnessConfig,
} from "../domain/services/vpsHealthPoller.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildDb(): Database {
  const db = new SqliteDatabase(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_vps_queue (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code     TEXT    NOT NULL,
      period_year     INTEGER NOT NULL,
      period_quarter  TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'pending',
      source_url      TEXT,
      attempts        INTEGER NOT NULL DEFAULT 0,
      last_attempt    TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(action_code, period_year, period_quarter)
    )
  `);
  return db;
}

/** Retrieve the vn-bctc-fetch config from the module defaults */
function bctcConfig(): FreshnessConfig {
  const cfg = DEFAULT_FRESHNESS_CONFIGS.find((c) => c.serviceName === "vn-bctc-fetch");
  if (!cfg) throw new Error("vn-bctc-fetch config not found in DEFAULT_FRESHNESS_CONFIGS");
  return cfg;
}

function insertQueueRow(
  db: Database,
  ticker: string,
  status: string,
  lastAttemptOffsetMs: number | null,
): void {
  const lastAttempt =
    lastAttemptOffsetMs !== null
      ? new Date(Date.now() + lastAttemptOffsetMs).toISOString()
      : null;
  db.exec(`
    INSERT OR REPLACE INTO bctc_vps_queue
      (action_code, period_year, period_quarter, status, last_attempt)
    VALUES (
      '${ticker}', 2026, 'Q1', '${status}',
      ${lastAttempt ? `'${lastAttempt}'` : "NULL"}
    )
  `);
}

const NOW_ISO = new Date().toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-FRESHNESS-GATE — Contract 2", () => {

  it("config: vn-bctc-fetch is NOT passive — has active latestTimestampSql and maxAgeMs", () => {
    const cfg = bctcConfig();
    expect(cfg.passive).toBeUndefined();
    expect(cfg.latestTimestampSql).toBeDefined();
    expect(cfg.latestTimestampSql).toContain("bctc_vps_queue");
    expect(cfg.latestTimestampSql).toContain("status = 'done'");
    expect(cfg.maxAgeMs).toBe(24 * 60 * 60_000);
  });

  it("config: has queueGuardSql covering pending/url_not_found/enrich_failed", () => {
    const cfg = bctcConfig();
    expect(cfg.queueGuardSql).toBeDefined();
    expect(cfg.queueGuardSql).toContain("pending");
    expect(cfg.queueGuardSql).toContain("url_not_found");
    expect(cfg.queueGuardSql).toContain("enrich_failed");
    // Generic: no ticker name
    expect(cfg.queueGuardSql).not.toMatch(/VCB|VNM|HPG|TCB/);
  });

  // ── baseline_pass_A: STALE PATH — active queue + last_attempt > 24h ──────

  it("baseline_pass_A (FAULT PATH): active queue + done row older than 24h → UNHEALTHY", () => {
    const db = buildDb();
    // Active (pending) row to satisfy earnings-window guard.
    insertQueueRow(db, "VCB", "pending", null);
    // Done row with last_attempt = 25 hours ago.
    const twentyFiveHoursAgo = -25 * 60 * 60_000;
    insertQueueRow(db, "VNM", "done", twentyFiveHoursAgo);

    const result = checkServiceFreshness(db, bctcConfig(), NOW_ISO);

    // STALE FAULT PATH must report unhealthy.
    expect(result.healthStatus).toBe("unhealthy");
    expect(result.errorMessage).toContain("stale");
    expect(result.lastSuccessfulRun).toBeDefined();
    db.close();
  });

  // ── baseline_pass_B: fresh path — active queue + last_attempt < 24h ──────

  it("baseline_pass_B: active queue + done row < 24h ago → HEALTHY", () => {
    const db = buildDb();
    insertQueueRow(db, "VCB", "pending", null);
    // Done row with last_attempt = 2 hours ago.
    insertQueueRow(db, "VNM", "done", -2 * 60 * 60_000);

    const result = checkServiceFreshness(db, bctcConfig(), NOW_ISO);
    expect(result.healthStatus).toBe("healthy");
    db.close();
  });

  // ── baseline_pass_C: IDLE PATH — empty queue + no recent done rows ────────

  it("baseline_pass_C: empty queue (no active rows) + no done row in 7d → IDLE (not UNHEALTHY)", () => {
    const db = buildDb();
    // Insert a done row that is 8 days old (older than 7d window).
    const eightDaysAgo = -8 * 24 * 60 * 60_000;
    insertQueueRow(db, "VCB", "done", eightDaysAgo);
    // No pending/url_not_found/enrich_failed rows.

    const result = checkServiceFreshness(db, bctcConfig(), NOW_ISO);
    // Must be idle, NOT unhealthy — off-season false alarm prevented.
    expect(result.healthStatus).toBe("idle");
    db.close();
  });

  // ── baseline_pass_D: empty active queue + recent done → HEALTHY ───────────

  it("baseline_pass_D: queue fully resolved (no active rows) + recent done row → HEALTHY", () => {
    const db = buildDb();
    // A done row from 1 hour ago (all tickers resolved recently).
    insertQueueRow(db, "VCB", "done", -1 * 60 * 60_000);
    // No pending rows (all resolved).

    const result = checkServiceFreshness(db, bctcConfig(), NOW_ISO);
    expect(result.healthStatus).toBe("healthy");
    db.close();
  });

  // ── baseline_pass_E: active queue + no done rows → UNREACHABLE (no data) ──

  it("baseline_pass_E: active pending queue + no done rows at all → UNREACHABLE (not idle)", () => {
    const db = buildDb();
    // Pending row exists (earnings window active) but no done rows yet (new season).
    insertQueueRow(db, "VCB", "pending", null);

    const result = checkServiceFreshness(db, bctcConfig(), NOW_ISO);
    // Queue has work but no successful push yet → not idle, but no data rows.
    expect(result.healthStatus).toBe("unreachable");
    expect(result.errorMessage).toContain("No data rows found");
    db.close();
  });

  // ── guard: SQL is generic (no ticker literal) ─────────────────────────────

  it("latestTimestampSql and queueGuardSql contain no ticker/exchange literals", () => {
    const cfg = bctcConfig();
    const TICKER_PATTERN = /\b(VCB|VNM|HPG|TCB|MBB|STB|HNX|HOSE|UPCOM|SSC)\b/;
    expect(cfg.latestTimestampSql).not.toMatch(TICKER_PATTERN);
    expect(cfg.queueGuardSql).not.toMatch(TICKER_PATTERN);
  });
});
