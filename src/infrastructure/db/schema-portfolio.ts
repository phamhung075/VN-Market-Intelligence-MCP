/**
 * schema-portfolio.ts — Sprint 209 schema decomposition
 *
 * Tables:
 *   - positions               — open / closed stock positions (Task 179)
 *   - portfolio_pnl_snapshots — daily P&L snapshot per position (Task 209)
 *   - portfolio_targets       — target allocation weights (Task 223)
 */

import type { Database } from "bun:sqlite";

export function initPortfolioTables(db: Database): void {
  // ── Positions (Task 179) ───────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT NOT NULL,
      shares      INTEGER NOT NULL,
      avg_price   REAL NOT NULL,
      opened_at   TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at   TEXT,
      notes       TEXT,
      UNIQUE(code)
    );
    CREATE INDEX IF NOT EXISTS idx_positions_code ON positions(code);
  `);

  // ── Portfolio P&L Snapshots (Task 209) ────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_pnl_snapshots (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      date          TEXT NOT NULL,
      code          TEXT NOT NULL,
      shares        INTEGER NOT NULL,
      avg_price     REAL NOT NULL,
      current_price REAL,
      pnl_pct       REAL,
      pnl_amount    REAL,
      snapshot_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(date, code)
    );
    CREATE INDEX IF NOT EXISTS idx_pnl_snapshots_date ON portfolio_pnl_snapshots(date);
  `);

  // ── Portfolio Target Allocation (Task 223) ────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_targets (
      code          TEXT PRIMARY KEY,
      target_weight REAL NOT NULL,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
