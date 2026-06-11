/**
 * FIX-EVIDENCE-PIPELINE-STARVED — scoped regression tests
 *
 * Covers two AC from the task mandate:
 *
 * (a) Producer fix — foreignFlowAlertJob queries the MOST RECENT `days` rows
 *     from daily_ohlcv (ORDER BY date DESC LIMIT N) so the zero-data guard does
 *     not fire when old all-zero rows exist in the table. Asserts that:
 *     - A stock with recent non-zero foreign flow produces >= 1 evidence fragment.
 *     - Old all-zero rows (pre-date window) do NOT suppress the signal.
 *
 * (b) Accumulator fail-loud — runEvidenceAccumulator() throws when
 *     evidence_fragments is empty, so recordJobRun stamps status='error' instead
 *     of the former silent status='success' with rows_written=0.
 *
 * Note: DB_PATH is overridden to :memory: by apps/mcp-server/src/__tests__/setup.ts.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runForeignFlowAlertJob,
  type TelegramOverridesFF,
} from "../scheduler/market-data/foreignFlowAlertJob.js";
import { runEvidenceAccumulator } from "../scheduler/news-analysis/evidenceAccumulatorJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared in-memory DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");

  db.run(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      company_name TEXT,
      exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain TEXT NOT NULL DEFAULT 'other',
      notes TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct REAL,
      alert_rise_pct REAL,
      alert_impact_min REAL,
      alert_report_new INTEGER NOT NULL DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code             TEXT NOT NULL,
      date             TEXT NOT NULL,
      open             REAL,
      high             REAL,
      low              REAL,
      close            REAL,
      volume           REAL,
      foreign_buy_vol  REAL,
      foreign_sell_vol REAL,
      foreign_net_vol  REAL,
      put_through_vol  REAL,
      PRIMARY KEY (code, date)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      signals_json          TEXT,
      affected_actions_json TEXT,
      analysis_ids_json     TEXT,
      message               TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      user_note             TEXT,
      notified_telegram     INTEGER NOT NULL DEFAULT 0,
      sent_by               TEXT NOT NULL DEFAULT 'server',
      resolved_at           TEXT,
      resolution_notes      TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS evidence_fragments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      stock         TEXT    NOT NULL,
      evidence_type TEXT    NOT NULL,
      direction     TEXT    NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
      magnitude     REAL    NOT NULL CHECK(magnitude BETWEEN 0.0 AND 1.0),
      confidence    REAL    NOT NULL CHECK(confidence BETWEEN 0.0 AND 1.0),
      timestamp     TEXT    NOT NULL,
      source_agent  TEXT    NOT NULL,
      ttl_days      INTEGER NOT NULL DEFAULT 30,
      expires_at    TEXT    NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS evidence_scores (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      stock         TEXT    NOT NULL,
      score_date    TEXT    NOT NULL,
      bullish_score REAL    NOT NULL DEFAULT 0.0,
      bearish_score REAL    NOT NULL DEFAULT 0.0,
      neutral_score REAL    NOT NULL DEFAULT 0.0,
      fragment_count INTEGER NOT NULL DEFAULT 0,
      computed_at   TEXT    NOT NULL,
      UNIQUE(stock, score_date)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name    TEXT    NOT NULL,
      started_at  TEXT    NOT NULL,
      finished_at TEXT,
      status      TEXT    NOT NULL DEFAULT 'running',
      rows_written INTEGER,
      error_msg   TEXT
    )
  `);

  return db;
}

function makeNoopTelegram(): TelegramOverridesFF {
  return {
    sendWork: async () => true,
    sendMarket: async () => true,
  };
}

/**
 * Seed daily_ohlcv rows for a stock.
 * - recentNetVols: net_vol values for the last N days (index 0 = today, 1 = yesterday, ...)
 * - oldZeroRows: number of ALL-ZERO rows to insert BEFORE the recent data (simulating the
 *   production situation where old historical rows exist with foreign_net_vol=0).
 */
function seedOhlcvWithOldZeroRows(
  db: Database,
  code: string,
  recentNetVols: number[],
  oldZeroRowCount: number,
): void {
  const ins = db.prepare(
    `INSERT OR IGNORE INTO daily_ohlcv (code, date, foreign_net_vol) VALUES (?, ?, ?)`,
  );

  const today = new Date();

  // Seed recent rows (most recent = today, older = today - N days)
  for (let i = 0; i < recentNetVols.length; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    ins.run(code, d.toISOString().slice(0, 10), recentNetVols[i] ?? 0);
  }

  // Seed old zero rows BEFORE the recent data
  for (let i = 0; i < oldZeroRowCount; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - recentNetVols.length - i);
    ins.run(code, d.toISOString().slice(0, 10), 0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// (a) Producer fix: foreignFlowAlertJob fetches RECENT rows, not oldest
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-EVIDENCE-PIPELINE-STARVED (a) — foreignFlowAlertJob producer fix", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
    db.run(`INSERT INTO watchlist (code) VALUES ('ACB')`);

    // Simulate production scenario:
    // - 30 old zero rows (like April 2026 rows that caused the bug)
    // - 5 recent rows with actual foreign flow data
    // The buggy query (ORDER BY date ASC LIMIT 10) would pick the 10 oldest = all-zero.
    // The fixed query (ORDER BY date DESC LIMIT 10) picks the 5 recent = real data.
    seedOhlcvWithOldZeroRows(
      db,
      "ACB",
      /* recent net_vols: 4 consecutive net_buy days of 150k → HIGH */ [150_000, 150_000, 150_000, 150_000, 0],
      /* old zero rows */ 30,
    );
  });

  it("writes >= 1 evidence fragment when recent rows have real foreign flow (old zero rows should not block)", async () => {
    const result = await runForeignFlowAlertJob(db, makeNoopTelegram());
    expect(result.evidenceFragmentsWritten).toBeGreaterThanOrEqual(1);
  });

  it("does NOT skip ACB due to the zero-data guard when recent rows are non-zero", async () => {
    const result = await runForeignFlowAlertJob(db, makeNoopTelegram());
    // highSignals >= 1 means the stock was not skipped by the zero-data guard
    expect(result.highSignals).toBeGreaterThanOrEqual(1);
    expect(result.stocksSkipped).toBe(0);
  });

  it("evidence fragment in DB has correct stock and evidence_type", async () => {
    await runForeignFlowAlertJob(db, makeNoopTelegram());
    const frag = db
      .prepare("SELECT stock, evidence_type, direction FROM evidence_fragments WHERE stock='ACB'")
      .get() as { stock: string; evidence_type: string; direction: string } | null;
    expect(frag).not.toBeNull();
    expect(frag!.stock).toBe("ACB");
    expect(frag!.evidence_type).toBe("foreign_flow_institutional");
    expect(frag!.direction).toBe("bullish");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) Accumulator fail-loud: throws when evidence_fragments is empty
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-EVIDENCE-PIPELINE-STARVED (b) — evidenceAccumulator fail-loud on empty input", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
    // evidence_fragments is empty — simulates the starved state
  });

  it("throws when evidence_fragments table is empty (producer starvation)", async () => {
    await expect(runEvidenceAccumulator(db)).rejects.toThrow(
      /evidence_fragments is empty/,
    );
  });

  it("throw message mentions 'producer starvation' so the error is actionable", async () => {
    let caught: Error | null = null;
    try {
      await runEvidenceAccumulator(db);
    } catch (err) {
      caught = err instanceof Error ? err : new Error(String(err));
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/producer starvation/);
  });

  it("does NOT throw when at least one active fragment exists (healthy state)", async () => {
    const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO evidence_fragments
        (stock, evidence_type, direction, magnitude, confidence, timestamp, source_agent, ttl_days, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("VCB", "foreign_flow_institutional", "bullish", 0.7, 0.75,
           new Date().toISOString(), "test", 30, futureExpiry);

    // Should not throw — healthy case
    const result = await runEvidenceAccumulator(db);
    expect(result.stocks).toBe(1);
  });
});
