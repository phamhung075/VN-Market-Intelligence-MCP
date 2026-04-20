/**
 * schema-briefings.ts — Sprint 209 schema decomposition
 *
 * Tables:
 *   - briefing_log      — dedup guard for morningBriefingJob (Task 1040)
 *   - market_summaries  — periodic market briefing snapshots (Sprint 034)
 */

import type { Database } from "bun:sqlite";

export function initBriefingsTables(db: Database): void {
  // ── Briefing Log (Task 1040) ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS briefing_log (
      date    TEXT PRIMARY KEY,
      sent_at TEXT NOT NULL
    )
  `);

  // ── Market Summaries (Sprint 034 / Task 130) ──────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_summaries (
      id                     TEXT PRIMARY KEY,
      period_type            TEXT NOT NULL,
      period_start           TEXT NOT NULL,
      period_end             TEXT NOT NULL,
      created_at             TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
      summary_text           TEXT NOT NULL,
      key_events_json        TEXT,
      stock_performance_json TEXT,
      alerts_summary_json    TEXT,
      macro_context_json     TEXT,
      recommendation_json    TEXT,
      news_count             INTEGER DEFAULT 0,
      alert_count            INTEGER DEFAULT 0,
      report_count           INTEGER DEFAULT 0,
      data_sources_json      TEXT,
      UNIQUE(period_type, period_start)
    );
    CREATE INDEX IF NOT EXISTS idx_ms_period  ON market_summaries(period_type, period_start);
    CREATE INDEX IF NOT EXISTS idx_ms_created ON market_summaries(created_at);
  `);
}
