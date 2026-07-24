/**
 * schema-financial-reports.ts — Sprint 209 schema decomposition
 *
 * Tables:
 *   - financial_reports   — BCTC financial report data (DDL from bctc-schema.ts)
 *   - pdf_extracted_text  — PDF OCR cache
 *   - bctc_vps_queue      — VPS proxy queue for BCTC PDF fetches
 *   - vnstock_financials  — vnstock income statement data
 *   - vnstock_balance_sheet
 *   - vnstock_cash_flow
 *   - vnstock_trading_stats
 *   - vnstock_events
 *   - vnstock_officers
 *   - vnstock_shareholders
 *   - vnstock_fetch_log
 */

import * as fs from "node:fs";
import type { Database } from "bun:sqlite";
import { SQLITE_DDL } from "../../../bctc-schema.js";
import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// FACTORY-INFRA-split-stores-and-migrations — declarative column migrations
// ---------------------------------------------------------------------------
// financial_reports accreted ~22 columns over many tasks, each guarded by its
// own hand-written `if (!colNames.has("x")) db.exec("ALTER TABLE ... ADD
// COLUMN x ...")`. Converted to ONE data array iterated by ONE loop — adding
// a future column is now a one-line entry here instead of a new inline
// try/catch block. `ddl` strings are byte-identical to the original inline
// statements (verified by AR-schema-migration equivalence test). `column` is
// the PRAGMA table_info name checked before ALTER (idempotency guard).
interface FinancialReportsColumnMigration {
  column: string;
  ddl: string;
}

const FINANCIAL_REPORTS_COLUMN_MIGRATIONS: FinancialReportsColumnMigration[] = [
  // ── validation_status/validation_notes ──────────────────────────────────
  { column: "validation_status", ddl: "ALTER TABLE financial_reports ADD COLUMN validation_status TEXT DEFAULT 'pending'" },
  { column: "validation_notes", ddl: "ALTER TABLE financial_reports ADD COLUMN validation_notes TEXT" },
  // ── Task 1294b: extraction method + confidence tracking ────────────────
  { column: "extraction_method", ddl: "ALTER TABLE financial_reports ADD COLUMN extraction_method TEXT DEFAULT 'ocr_pdf'" },
  { column: "extraction_source_note", ddl: "ALTER TABLE financial_reports ADD COLUMN extraction_source_note TEXT" },
  { column: "revenue_growth_qoq", ddl: "ALTER TABLE financial_reports ADD COLUMN revenue_growth_qoq REAL DEFAULT 0.0" },
  { column: "margin_trend", ddl: "ALTER TABLE financial_reports ADD COLUMN margin_trend REAL DEFAULT 0.0" },
  { column: "debt_ratio_hint", ddl: "ALTER TABLE financial_reports ADD COLUMN debt_ratio_hint REAL DEFAULT 0.0" },
  // ── Task 1345b: financial validation confidence columns ────────────────
  { column: "ocr_confidence", ddl: "ALTER TABLE financial_reports ADD COLUMN ocr_confidence REAL" },
  { column: "confidence_financial", ddl: "ALTER TABLE financial_reports ADD COLUMN confidence_financial REAL" },
  // ── Task 1878a: OCF bridge column (vnstock API-grade, quarterly only) ──
  { column: "operating_cash_flow", ddl: "ALTER TABLE financial_reports ADD COLUMN operating_cash_flow REAL" },
  // ── Task 1941d: net_profit API bridge column ────────────────────────────
  { column: "net_profit_api_bridge", ddl: "ALTER TABLE financial_reports ADD COLUMN net_profit_api_bridge REAL" },
  // ── BCTC-AGENTIC-REFINE: text_status + refine_status ────────────────────
  { column: "text_status", ddl: "ALTER TABLE financial_reports ADD COLUMN text_status TEXT NOT NULL DEFAULT 'COMPLETE'" },
  { column: "refine_status", ddl: "ALTER TABLE financial_reports ADD COLUMN refine_status TEXT NOT NULL DEFAULT 'PENDING'" },
  // ── BAL-1c: period_basis ────────────────────────────────────────────────
  { column: "period_basis", ddl: "ALTER TABLE financial_reports ADD COLUMN period_basis TEXT" },
  // ── BAL-1d: report_scope ────────────────────────────────────────────────
  { column: "report_scope", ddl: "ALTER TABLE financial_reports ADD COLUMN report_scope TEXT" },
  // ── EI-P2-2: data_env ────────────────────────────────────────────────────
  { column: "data_env", ddl: "ALTER TABLE financial_reports ADD COLUMN data_env TEXT" },
  // ── FIX-F: charter_capital / investment_property / reward_fund ─────────
  { column: "charter_capital", ddl: "ALTER TABLE financial_reports ADD COLUMN charter_capital REAL" },
  { column: "investment_property", ddl: "ALTER TABLE financial_reports ADD COLUMN investment_property REAL" },
  { column: "reward_fund", ddl: "ALTER TABLE financial_reports ADD COLUMN reward_fund REAL" },
  // ── BCTC-HUMAN-CONFIRM Migration 2: confirm_status on financial_reports ─
  { column: "confirm_status", ddl: "ALTER TABLE financial_reports ADD COLUMN confirm_status TEXT NOT NULL DEFAULT 'PENDING'" },
  { column: "final_confirmed_at", ddl: "ALTER TABLE financial_reports ADD COLUMN final_confirmed_at TEXT" },
  { column: "confirmed_by", ddl: "ALTER TABLE financial_reports ADD COLUMN confirmed_by TEXT DEFAULT 'user'" },
];

/**
 * runColumnMigrations — apply a declarative [{column, ddl}] array against one
 * table, idempotently. PRAGMA table_info is read ONCE (matches the original
 * inline blocks' single colNames snapshot per try-block); each ALTER TABLE
 * runs in its OWN try/catch so one unexpected failure does not block the
 * remaining independent column additions (equal-or-better resilience vs the
 * original's 7 separate try-blocks, since ALTER TABLE ADD COLUMN statements
 * are mutually independent — order between them is not observable).
 */
function runColumnMigrations(
  db: Database,
  table: string,
  migrations: FinancialReportsColumnMigration[],
): void {
  let colNames: Set<string>;
  try {
    const cols = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
    colNames = new Set(cols.map((c) => c.name));
  } catch {
    // table not queryable yet — nothing to migrate this call
    return;
  }
  for (const m of migrations) {
    if (colNames.has(m.column)) continue;
    try {
      db.exec(m.ddl);
    } catch {
      // fresh DB race / column already added concurrently — safe to skip
    }
  }
}

export function initFinancialReportsTables(db: Database): void {
  // ── Financial Reports (BCTC) ───────────────────────────────────────────────
  // DDL imported from bctc-schema.ts — includes financial_reports table,
  // all scalar columns, JSON blobs, indexes, v_chart_timeseries and
  // v_yoy_comparison views.
  db.exec(SQLITE_DDL);

  // ── Declarative column migrations (was 7 inline try/catch blocks, ~22
  // ALTER TABLE statements scattered across this function) ─────────────────
  try {
    runColumnMigrations(db, "financial_reports", FINANCIAL_REPORTS_COLUMN_MIGRATIONS);
    // Index for fallback signal lookups — depends on extraction_method,
    // which the loop above guarantees exists by this point.
    db.exec(`CREATE INDEX IF NOT EXISTS idx_fr_extraction_method ON financial_reports(action_code, extraction_method, parsed_at)`);
  } catch {
    // fresh DB — CREATE TABLE already included the columns
  }

  // ── BT-3 BCTC table rows ─────────────────────────────────────────────────
  // Structured table rows produced by the TEXT-path extractor (BT-3).
  // Stored per doc (report_id FK → financial_reports.id) + page + row_order.
  // Additive on top of the consolidated 1954c write path (no collision).
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_table_rows (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id        TEXT    NOT NULL,
      page_number      INTEGER NOT NULL,
      statement_section TEXT   NOT NULL,
      row_order        INTEGER NOT NULL,
      code             TEXT,
      label            TEXT    NOT NULL,
      period_current   TEXT    NOT NULL,
      value_current    REAL,
      period_prior     TEXT,
      value_prior      REAL,
      unit             TEXT    NOT NULL DEFAULT 'billion_vnd',
      is_summary_row   INTEGER NOT NULL DEFAULT 0,
      extracted_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_btr_report ON bctc_table_rows(report_id, statement_section, row_order)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_btr_code   ON bctc_table_rows(report_id, code)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_balance_checks (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id        TEXT    NOT NULL UNIQUE,
      statement_section TEXT   NOT NULL,
      total_assets     REAL,
      total_liabilities REAL,
      total_equity     REAL,
      balance_delta    REAL,
      balance_pass     INTEGER NOT NULL DEFAULT 0,
      checked_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bbc_report ON bctc_balance_checks(report_id)`);

  // ── MD-INSPECT: Generic markdown table storage (Sprint BCTC-MD-TABLE) ─────
  // Additive on top of the structured bctc_table_rows path (Decision A).
  // Zero mutation to bctc_table_rows / bctc_balance_checks.
  // report_id is UNIQUE — INSERT OR REPLACE is the idempotency mechanism.
  // md_tables_json stores JSON array of markdown pipe-table strings.
  // ocr_as_markdown stores OCR text converted to readable markdown form.
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_md_tables (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id        TEXT    NOT NULL UNIQUE,
      md_tables_json   TEXT    NOT NULL,
      ocr_as_markdown  TEXT    NOT NULL,
      table_count      INTEGER NOT NULL DEFAULT 0,
      page_count       INTEGER NOT NULL DEFAULT 0,
      extracted_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bmt_report ON bctc_md_tables(report_id)`);

  // ── LF-OVERLAY: Layout-first unit + zone-geometry storage ─────────────────
  // Sprint BCTC-LAYOUT-FIRST §3.1 — two new tables owned exclusively by mcp-server.
  // Written only by pushBctcLayoutHandler (POST /api/push-bctc-layout).
  // Zero overlap with bctc_table_rows, bctc_balance_checks, or bctc_md_tables.
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_layout_units (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id           TEXT    NOT NULL,
      unit_id             TEXT    NOT NULL,
      schema_page         INTEGER NOT NULL,
      page_numbers_json   TEXT    NOT NULL,
      page_type           TEXT    NOT NULL DEFAULT 'table',
      stitched_markdown   TEXT    NOT NULL DEFAULT '',
      row_count           INTEGER NOT NULL DEFAULT 0,
      quarantined         INTEGER NOT NULL DEFAULT 0,
      quarantine_reason   TEXT,
      document_map_json   TEXT,
      extracted_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(report_id, unit_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_blu_report ON bctc_layout_units(report_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_blu_quarantine ON bctc_layout_units(report_id, quarantined)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_page_zones (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id                   TEXT    NOT NULL,
      page_number                 INTEGER NOT NULL,
      unit_id                     TEXT    NOT NULL,
      page_type                   TEXT    NOT NULL,
      is_schema_page              INTEGER NOT NULL DEFAULT 0,
      is_continuation_page        INTEGER NOT NULL DEFAULT 0,
      schema_inherited_from_page  INTEGER,
      zones_json                  TEXT    NOT NULL,
      extracted_at                TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(report_id, page_number)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bpz_report ON bctc_page_zones(report_id, page_number)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bpz_unit   ON bctc_page_zones(unit_id)`);

  // ── BCTC-EVAL-SUBSTRATE: Per-stage evaluation results (Sprint BCTC-EVAL-SUBSTRATE) ──
  // Additive migration — zero mutation to any existing table or index above.
  // 6 rows per PDF (one per pipeline stage); written at extraction time + nightly recompute.
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_eval_results (
      report_id TEXT NOT NULL,
      stage_no INTEGER NOT NULL,
      stage_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('green','yellow','red')),
      metrics_json TEXT NOT NULL DEFAULT '{}',
      gate_failures_json TEXT NOT NULL DEFAULT '[]',
      golden_diff_json TEXT NOT NULL DEFAULT '{}',
      detector_version TEXT NOT NULL DEFAULT 'v1',
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (report_id, stage_no),
      CONSTRAINT fk_report FOREIGN KEY (report_id) REFERENCES financial_reports(id) ON DELETE CASCADE
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ber_report ON bctc_eval_results(report_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ber_status ON bctc_eval_results(status, stage_no)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ber_version ON bctc_eval_results(detector_version, computed_at)`);

  // ── PDF OCR Cache (Sprint 048 / Task 292) ──────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS pdf_extracted_text (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      filename     TEXT    NOT NULL,
      page_number  INTEGER NOT NULL,
      text_content TEXT    NOT NULL DEFAULT '',
      confidence   REAL    NOT NULL DEFAULT 0,
      extracted_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(filename, page_number)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pet_filename ON pdf_extracted_text(filename, page_number)`);

  // Task 1002 — action_code column for ticker attribution
  try {
    db.exec(`ALTER TABLE pdf_extracted_text ADD COLUMN action_code TEXT NOT NULL DEFAULT ''`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_pet_action_code ON pdf_extracted_text(action_code)`);
  } catch {
    // Column already exists
  }

  // ── EI-P2-2: data_env column on pdf_extracted_text ───────────────────────
  // Idempotent: guarded ALTER TABLE (try/catch on column-exists error).
  // Existing rows get NULL. New rows stamped by pdfOcrWorker write path.
  try { db.exec("ALTER TABLE pdf_extracted_text ADD COLUMN data_env TEXT"); } catch { /* already exists */ }

  // ── BCTC VPS Queue (Task 1112) ────────────────────────────────────────────
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
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bvq_status ON bctc_vps_queue(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bvq_code   ON bctc_vps_queue(action_code)`);

  // FIX-BCTC-D3C-RECONCILE-JOB: dedicated attempt counter for the
  // bctcExtractReconcileJob's bounded reconciliation-pass budget
  // (MAX_RECONCILE_ATTEMPTS). Deliberately a SEPARATE column from the
  // existing `attempts` field above — `attempts` already carries pre-download
  // fetch-failure semantics (MAX_404_ATTEMPTS gate in bctcPdfPullJob.ts) and a
  // row reaching `pek_triggered` may already have a nonzero `attempts` value
  // from earlier fetch retries; reusing it for the unrelated reconciliation
  // budget would corrupt both counters' meaning. Idempotent guarded ALTER
  // TABLE — same pattern as the financial_reports migrations above.
  try {
    const bvqCols = db
      .query<{ name: string }, []>("PRAGMA table_info(bctc_vps_queue)")
      .all();
    if (!bvqCols.some((c) => c.name === "reconcile_attempts")) {
      db.exec(
        "ALTER TABLE bctc_vps_queue ADD COLUMN reconcile_attempts INTEGER NOT NULL DEFAULT 0",
      );
    }
  } catch {
    // fresh DB — CREATE TABLE will include the column on next start
  }

  // ── BCTC Health State (FIX-BCTC-ZERO-URL-ALERT) ──────────────────────────
  // Single-row persistent state for the consecutive-zero-URL counter and the
  // 6h dedup guard.  CREATE TABLE IF NOT EXISTS → safe to call on existing DBs.
  // Row with key='zero_url_counter' is upserted on first enricher run.
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_health_state (
      key              TEXT PRIMARY KEY,
      int_value        INTEGER NOT NULL DEFAULT 0,
      text_value       TEXT,
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── vnstock tables (Task 1042) ────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_financials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      year_report INTEGER NOT NULL,
      quarter INTEGER NOT NULL,
      revenue_bn REAL,
      revenue_yoy REAL,
      net_profit_bn REAL,
      net_profit_yoy REAL,
      eps INTEGER,
      pe REAL,
      pb REAL,
      roe REAL,
      roa REAL,
      debt_to_equity REAL,
      net_profit_margin REAL,
      nim REAL,
      npl REAL,
      source TEXT NOT NULL DEFAULT 'vnstock',
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, year_report, quarter, source)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vnfin_code ON vnstock_financials(code)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vnfin_period ON vnstock_financials(year_report, quarter)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '1970-01-01',
      foreign_room INTEGER,
      foreign_volume INTEGER,
      current_holding_ratio REAL,
      max_holding_ratio REAL,
      avg_volume_2w INTEGER,
      high_52w REAL,
      low_52w REAL,
      pct_from_high_52w REAL,
      pct_from_low_52w REAL,
      market_cap_bn REAL,
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, date)
    )
  `);

  // FIX-B-1: idempotent migration — add market_cap_bn to existing production DBs
  // NULLABLE: vnstock ratio API may be unavailable; null is the honest "not fetched" sentinel.
  try {
    const vntsCols = db
      .query<{ name: string }, []>("PRAGMA table_info(vnstock_trading_stats)")
      .all();
    if (vntsCols.length > 0 && !vntsCols.some((c) => c.name === "market_cap_bn")) {
      db.exec("ALTER TABLE vnstock_trading_stats ADD COLUMN market_cap_bn REAL");
      logger.info("[schema] migrated vnstock_trading_stats: added market_cap_bn column");
    }
  } catch {
    // fresh DB — CREATE TABLE already included the column
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      event_name TEXT NOT NULL,
      event_date TEXT NOT NULL,
      event_type TEXT NOT NULL,
      description TEXT,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, event_name, event_date)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vnevents_code ON vnstock_events(code)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vnevents_date ON vnstock_events(event_date)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_officers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      own_percent REAL,
      quantity INTEGER,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, name)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vnofficers_code ON vnstock_officers(code)`);

  // ── FIX-I-B: appointment_year on vnstock_officers ─────────────────────────
  // Nullable INTEGER: null = not yet fetched or N/A from VPS.
  // Populated by boardDetailsJob (daily cron, UPDATE-only via boardDetailsStore).
  // Idempotent: guarded by PRAGMA table_info check (same pattern as FIX-F).
  try {
    const officerCols = db
      .query<{ name: string }, []>("PRAGMA table_info(vnstock_officers)")
      .all();
    if (!officerCols.some((c) => c.name === "appointment_year")) {
      db.exec("ALTER TABLE vnstock_officers ADD COLUMN appointment_year INTEGER");
      logger.info("[schema] migrated vnstock_officers: added appointment_year column");
    }
  } catch {
    // fresh DB — column already present via CREATE TABLE (future DDL update)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_shareholders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER,
      own_percent REAL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, name)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vnshareholders_code ON vnstock_shareholders(code)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_fetch_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      data_type TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, data_type)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_balance_sheet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      year_report INTEGER NOT NULL,
      quarter INTEGER NOT NULL,
      total_assets_bn REAL,
      total_liabilities_bn REAL,
      total_equity_bn REAL,
      cash_bn REAL,
      short_term_debt_bn REAL,
      long_term_debt_bn REAL,
      receivables_bn REAL,
      inventory_bn REAL,
      source TEXT NOT NULL DEFAULT 'vnstock',
      fetched_at TEXT NOT NULL,
      UNIQUE(code, year_report, quarter, source)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vnbs_code ON vnstock_balance_sheet(code)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_cash_flow (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      year_report INTEGER NOT NULL,
      quarter INTEGER NOT NULL,
      operating_cf_bn REAL,
      investing_cf_bn REAL,
      financing_cf_bn REAL,
      net_cf_bn REAL,
      source TEXT NOT NULL DEFAULT 'vnstock',
      fetched_at TEXT NOT NULL,
      UNIQUE(code, year_report, quarter, source)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vncf_code ON vnstock_cash_flow(code)`);

  // ── BCTC-AGENTIC-REFINE: bctc_refined_units table (FR-9) ──────────────────
  // Per-window refined markdown storage. Written exclusively by bctcRefineJob
  // orchestrator (Phase 4 collect-then-write). Subagents NEVER write to this table.
  // DELETE-then-INSERT idempotency; UNIQUE(report_id, unit_id) prevents dupes.
  //
  // window_status valid values: DONE | FAILED | REJECTED_SANITY
  //   DONE           — window successfully refined and passed sanity checks
  //   FAILED         — window processing failed (e.g. timeout, agent_error)
  //   REJECTED_SANITY — terminal state: rejected by DT-1/DT-2/DT-3 sanity gate at ingest
  //                     (BCTC-TRUST-RED sprint). Row is still written for audit trail visibility.
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_refined_units (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id         TEXT    NOT NULL,
      unit_id           TEXT    NOT NULL,
      page_numbers_json TEXT    NOT NULL,
      markdown          TEXT    NOT NULL,
      row_count         INTEGER NOT NULL DEFAULT 0,
      confidence        REAL    NOT NULL DEFAULT 0.0,
      flags             TEXT,
      window_status     TEXT    NOT NULL DEFAULT 'DONE',
      refined_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(report_id, unit_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bru_report ON bctc_refined_units(report_id)`);
  // FIX-FINALIZE-STATUS-STUCK-PARTIAL (RF-1 mitigation):
  // Composite index on (report_id, window_status) for the Fix-A exclusion subquery in
  // getBctcPendingRefineTool. Both correlated subqueries (COUNT(*) where window_status!=DONE
  // and COUNT(*) total) are O(log n) with this index instead of O(n) full scan.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bctc_refined_units_report_status ON bctc_refined_units(report_id, window_status)`);

  // ── BCTC-AGENTIC-REFINE: text_status + refine_status on financial_reports ─
  // text_status: OCR lifecycle (COMPLETE | IN_PROGRESS | PARTIAL)
  //   Default COMPLETE for existing rows (they already have extracted OCR text).
  // refine_status: refine lifecycle (PENDING | IN_PROGRESS | DONE | FAILED | PARTIAL | REJECTED_SANITY)
  //   Default PENDING for existing rows (they need to be refined).
  //   REJECTED_SANITY — terminal state, report rejected by DT-2/DT-3 aggregate sanity gates
  //   during finalize_bctc_refine (BCTC-TRUST-RED sprint). Not re-queued by cron until
  //   manually reset to PENDING.
  // NOTE: DDL moved into FINANCIAL_REPORTS_COLUMN_MIGRATIONS (top of file) —
  // applied by the runColumnMigrations() call at the start of this function.

  // ── BCTC-HUMAN-CONFIRM: Migration 1 — source_confidence on bctc_table_rows ─
  // Non-breaking additive column. Default 1.0 = fully confident for existing rows
  // (no flag info available). Parser-computed rows will override with their value.
  // Corrected rows are explicitly set to 1.0 by the correction write path.
  try {
    const btrCols = db
      .query<{ name: string }, []>("PRAGMA table_info(bctc_table_rows)")
      .all();
    const btrColNames = new Set(btrCols.map((c) => c.name));
    if (!btrColNames.has("source_confidence")) {
      db.exec(
        "ALTER TABLE bctc_table_rows ADD COLUMN source_confidence REAL NOT NULL DEFAULT 1.0",
      );
    }
  } catch {
    // bctc_table_rows may not exist yet on fresh DB (handled by CREATE TABLE IF NOT EXISTS above)
  }

  // ── BAL-1c/BAL-1d/EI-P2-2/FIX-F/BCTC-HUMAN-CONFIRM-2: period_basis,
  // report_scope, data_env, charter_capital, investment_property,
  // reward_fund, confirm_status, final_confirmed_at, confirmed_by ─────────
  // NOTE: DDL for all 9 columns moved into FINANCIAL_REPORTS_COLUMN_MIGRATIONS
  // (top of file) — applied by the runColumnMigrations() call at the start
  // of this function. See that array for per-column semantics/provenance.

  // ── BCTC-HUMAN-CONFIRM: Migration 3 — bctc_human_corrections table ──────────
  // One correction record per (report_id, row_id). INSERT OR REPLACE is the
  // idempotency mechanism for repeated corrections to the same cell.
  // anchor_status tracks re-anchor outcome after re-parse:
  //   'ok' = stable key matched exactly one row
  //   'anchor_ambiguous' = stable key matched >1 rows (safe-fail: no mis-apply)
  //   'anchor_missing' = stable key matched no row after re-parse
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_human_corrections (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id             TEXT    NOT NULL,
      row_id                INTEGER NOT NULL,
      label                 TEXT    NOT NULL,
      page_number           INTEGER NOT NULL,
      statement_section     TEXT    NOT NULL,
      code                  TEXT,
      old_value             REAL,
      new_value             REAL    NOT NULL,
      correction_source     TEXT    NOT NULL DEFAULT 'human_ui',
      confirmed_by          TEXT    NOT NULL DEFAULT 'user',
      corrected_at          TEXT    NOT NULL DEFAULT (datetime('now')),
      flag_type             TEXT    NOT NULL,
      ocr_value_snapshot    TEXT,
      image_value_snapshot  TEXT,
      anchor_status         TEXT    NOT NULL DEFAULT 'ok',
      UNIQUE(report_id, row_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bhc_report ON bctc_human_corrections(report_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bhc_stable_key ON bctc_human_corrections(report_id, label, page_number, statement_section)`);

  // ── Task 1878a: backfill OCF on migration ─────────────────────────────────
  // Dev decision: wire backfillAllOCF into the migration block so new tickers
  // are covered automatically on every server start (idempotent UPDATE is a
  // no-op when values already populated). Simpler than a separate CLI command.
  backfillAllOCF(db);

  // ── Task 1941d: backfill net_profit_api_bridge on migration ──────────────
  // Mirrors backfillAllOCF strategy. Idempotent UPDATE from vnstock_financials.
  backfillAllNetProfit(db);

  // ── Task 1942b: backfill OCF for watchlist tickers on migration ───────────
  // Covers the 30 watchlist tickers regardless of whether they appear in
  // vnstock_cash_flow. Idempotent. Safe on startup: EC-6 handled internally.
  backfillOCFForWatchlist(db);

  // ── TASK-1943a: startup reset REMOVED (FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH) ─
  // resetQ1UrlNotFound(db) was removed from here because:
  //   1. It fired on EVERY initFinancialReportsTables() call — including from
  //      many MCP tool handlers (via initDatabase()) during normal cowork cycles.
  //   2. Each call reset all Q1-2026 url_not_found rows back to pending/attempts=0,
  //      perpetually undoing the terminalization done by the enricher.
  //   3. The Arm 2 grace-period query in bctcQueueEnricherJob.ts COMBINED_SQL
  //      (status='url_not_found' AND last_attempt < now-7d AND attempts < 6)
  //      already provides the correct bounded grace-period retry — no startup
  //      reset needed.  Truly terminal rows (attempts>=6) stay terminal forever.
  // resetQ1UrlNotFound() is kept as an exported function for test coverage and
  // potential future manual recovery use, but is NO LONGER called at init time.

  // ── FIX-CTG-3 STEP-A: purge cover-letter + wrong-period source_url for CTG ─
  // CTG queue rows were poisoned by two defects (see arch-brief 2026-06-03):
  //   - Q1 2026: owa.hnx.vn cover-letter (524 KB) instead of hsx.vn hop nhat.
  //   - Q3/Q2 2025 (and any other non-Q1 period): wrong-period Q1-2026 URL
  //     written by Defect B (enricher ignored period_year/period_quarter).
  // FIX-CTG-1 (ddf37a3b) already corrected the enricher logic. This migration
  // clears the stale URLs so the enricher (now correct) can re-discover and
  // write the right URL on next cycle.
  // Idempotent: WHERE conditions only match rows with the bad URLs.
  resetCtgWrongSourceUrls(db);

  // ── FIX-CTG-3 STEP-C: recover stuck status='fetching' queue rows ──────────
  // When push-bctc-pdf extraction fails (geo-blocked source URL, service down),
  // the queue row stays at status='fetching'. No scheduled job queries 'fetching',
  // leaving the PDF stranded until the next daily bctcReparseJob (02:30 UTC).
  // This migration resets those rows to 'pending' on startup so the 15-min
  // enricher + 30-min pull cycle can retry within ~45 min.
  // Also: pushBctcExtraction.ts now has a three-tier local-file fallback so
  // future pushes succeed even when the remote source URL is geo-blocked.
  // Idempotent: no-op after first run (rows already pending). Safe on startup.
  recoverStuckFetchingQueue(db);

  // ── P0-2-FOREIGN-ROOM-SUITE: foreign_room_events table ────────────────────
  // Additive schema migration — CREATE TABLE IF NOT EXISTS pattern.
  // Detects ROOM_FULL (utilization ≥99%) and ROOM_REOPEN (<95% recovery) events
  // per ticker. Written by vnstockTradingStatsRefresh job after each daily sweep.
  // UNIQUE(code, event_date, event_type) ensures idempotency on re-runs.
  // Owner: mcp-server (single-writer principle — dev-stock-price has ZERO changes).
  db.exec(`
    CREATE TABLE IF NOT EXISTS foreign_room_events (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      code                  TEXT NOT NULL,
      event_type            TEXT NOT NULL CHECK(event_type IN ('ROOM_FULL', 'ROOM_REOPEN')),
      event_date            TEXT NOT NULL,
      room_remaining_before INTEGER,
      room_remaining_after  INTEGER,
      created_at            TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, event_date, event_type)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_fre_code ON foreign_room_events(code)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_fre_date ON foreign_room_events(event_date DESC)`);
}

// ---------------------------------------------------------------------------
// Task 1878a — OCF Bridge mapper
// ---------------------------------------------------------------------------

/**
 * bridgeOCFToFinancialReports — lifts vnstock quarterly OCF into financial_reports.
 *
 * Strategy (dev decision): update ALL quarters for the ticker on each call
 * (single UPDATE covers all, historical rows included). Simpler than tracking
 * just-inserted quarter; idempotent (repeated calls = same result).
 *
 * Unit conversion: vnstock_cash_flow.operating_cf_bn is ty VND (billions).
 *                  financial_reports.operating_cash_flow is trieu VND (millions).
 *                  Multiply by 1000.0.
 *
 * Skips:
 *   - Annual rows in financial_reports (period_quarter IS NULL)
 *   - vnstock_cash_flow rows where quarter = 0 (treated as annual by exchange)
 *
 * @param db     Database instance (injected — supports in-memory test DBs)
 * @param ticker Stock code (e.g. "VCB")
 */
export function bridgeOCFToFinancialReports(
  db: Database,
  ticker: string,
): number {
  const result = db.prepare(
    `UPDATE financial_reports
     SET operating_cash_flow = (
       SELECT vcf.operating_cf_bn * 1000.0
       FROM vnstock_cash_flow vcf
       WHERE vcf.code        = financial_reports.action_code
         AND vcf.year_report = financial_reports.period_year
         AND vcf.quarter     = financial_reports.period_quarter
         AND vcf.quarter BETWEEN 1 AND 4
       ORDER BY vcf.fetched_at DESC
       LIMIT 1
     )
     WHERE financial_reports.action_code    = ?
       AND financial_reports.period_quarter IS NOT NULL`,
  ).run(ticker);
  return result.changes;
}

/**
 * backfillAllOCF — one-shot backfill for all tickers in vnstock_cash_flow.
 *
 * Iterates all distinct codes in vnstock_cash_flow and calls
 * bridgeOCFToFinancialReports for each. Idempotent: re-running is a no-op if
 * values are already populated (UPDATE sets same value, no observable change).
 *
 * Called automatically from initFinancialReportsTables (dev decision: migration
 * block placement ensures new tickers are covered on server restart).
 *
 * @param db Database instance
 */
export function backfillAllOCF(db: Database): void {
  const tickers = db
    .prepare<{ code: string }, []>(
      "SELECT DISTINCT code FROM vnstock_cash_flow",
    )
    .all();
  for (const { code } of tickers) {
    bridgeOCFToFinancialReports(db, code);
  }
}

// ---------------------------------------------------------------------------
// Task 1941d — Net Profit Bridge mapper
// ---------------------------------------------------------------------------

/**
 * bridgeNetProfitToFinancialReports — lifts vnstock quarterly NI into financial_reports.
 *
 * Strategy: update ALL quarters for the ticker on each call. Idempotent.
 *
 * Unit conversion: vnstock_financials.net_profit_bn is ty VND (billions).
 *                  financial_reports.net_profit_api_bridge is trieu VND (millions).
 *                  Multiply by 1000.0.
 *
 * Root cause context (Task 1941d): FPT Q4/2025 OCR extracted revenue as net_profit
 * (financial_reports.net_profit=20,225 trieu vs correct 2,509,520 trieu).
 * cashFlowTool COALESCEs net_profit_api_bridge over net_profit for OCF/NI ratio.
 *
 * Skips:
 *   - Annual rows in financial_reports (period_quarter IS NULL)
 *   - vnstock_financials rows where quarter = 0 (annual)
 *
 * @param db     Database instance (injected — supports in-memory test DBs)
 * @param ticker Stock code (e.g. "FPT")
 */
export function bridgeNetProfitToFinancialReports(
  db: Database,
  ticker: string,
): void {
  db.prepare(
    `UPDATE financial_reports
     SET net_profit_api_bridge = (
       SELECT vf.net_profit_bn * 1000.0
       FROM vnstock_financials vf
       WHERE vf.code        = financial_reports.action_code
         AND vf.year_report = financial_reports.period_year
         AND vf.quarter     = financial_reports.period_quarter
         AND vf.quarter BETWEEN 1 AND 4
       ORDER BY vf.fetched_at DESC
       LIMIT 1
     )
     WHERE financial_reports.action_code    = ?
       AND financial_reports.period_quarter IS NOT NULL`,
  ).run(ticker);
}

/**
 * backfillAllNetProfit — one-shot backfill for all tickers in vnstock_financials.
 *
 * Iterates all distinct codes in vnstock_financials and calls
 * bridgeNetProfitToFinancialReports for each. Idempotent.
 *
 * @param db Database instance
 */
export function backfillAllNetProfit(db: Database): void {
  const tickers = db
    .prepare<{ code: string }, []>(
      "SELECT DISTINCT code FROM vnstock_financials",
    )
    .all();
  for (const { code } of tickers) {
    bridgeNetProfitToFinancialReports(db, code);
  }
}

// ---------------------------------------------------------------------------
// Task 1942b — Watchlist OCF backfill (SSOT: docs/data/stock-classification.json)
// ---------------------------------------------------------------------------

/**
 * backfillOCFForWatchlist — bridges OCF to financial_reports for every ticker
 * in the 30-ticker watchlist SSOT.
 *
 * Reads `docs/data/stock-classification.json`, iterates all tickers, and calls
 * `bridgeOCFToFinancialReports(db, ticker)` for each. Idempotent: the underlying
 * UPDATE sets the same value on repeat runs (no INSERT, no duplicates).
 *
 * N = tickers for which the UPDATE touched ≥1 row in financial_reports.
 * This will be 0 for fresh DBs and grow as BCTC OCR adds more tickers.
 *
 * EC-6: if stock-classification.json is unreadable, logs WARN and returns early
 * without throwing. Server startup must not crash due to a missing file.
 *
 * @param db Database instance
 */
export function backfillOCFForWatchlist(db: Database): void {
  try {
    const raw = fs.readFileSync("docs/data/stock-classification.json", "utf-8");
    const classification = JSON.parse(raw) as {
      watchlist: Array<{ ticker: string }>;
    };
    const tickers: Array<{ ticker: string }> = classification.watchlist ?? [];

    let count = 0;
    for (const { ticker } of tickers) {
      const changes = bridgeOCFToFinancialReports(db, ticker);
      if (changes > 0) count++;
    }

    logger.info(
      `[backfillOCFForWatchlist] updated operating_cash_flow for ${count} tickers (watchlist sweep)`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[backfillOCFForWatchlist] failed to read stock-classification.json: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// TASK-1943a — Q1-2026 url_not_found queue reset
// ---------------------------------------------------------------------------

/**
 * resetQ1UrlNotFound — reset Q1-2026 url_not_found rows to pending.
 *
 * @deprecated No longer called from initFinancialReportsTables().
 *
 * Removed from init by FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH because
 * this function was being called on EVERY initFinancialReportsTables() call
 * (including from MCP tool handlers during cowork cycles), perpetually
 * resetting the 8 genuinely-absent Q1-2026 rows back to pending/attempts=0
 * and undoing the enricher's terminalization in an infinite tug-of-war.
 *
 * The Arm 2 grace-period query in bctcQueueEnricherJob.ts already provides
 * correct bounded retry (7-day grace, attempts < 6 cap). No startup reset
 * is needed.
 *
 * Kept exported for test coverage and emergency manual recovery only.
 * DO NOT re-add to initFinancialReportsTables.
 *
 * Original scope: Q1-2026 only. Hardcoded period literal — this is a
 * known limitation (/goal#2: generalize). Kept as-is since the function
 * is no longer called automatically; the enricher Arm 2 is the generic path.
 *
 * @param db Database instance
 * @returns Number of rows changed (0 on repeat calls = idempotent)
 */
export function resetQ1UrlNotFound(db: Database): number {
  let changes = 0;
  try {
    const result = db
      .prepare(
        `UPDATE bctc_vps_queue
         SET status = 'pending', attempts = 0
         WHERE status = 'url_not_found'
           AND period_year = 2026
           AND period_quarter = 'Q1'`,
      )
      .run();

    changes = result.changes;

    if (changes > 0) {
      logger.info(
        `[TASK-1943a] Reset ${changes} Q1-2026 url_not_found rows to pending`,
      );
    }
  } catch {
    // bctc_vps_queue may not exist yet on a fresh DB — silently skip
  }

  return changes;
}

// ---------------------------------------------------------------------------
// FIX-CTG-3 STEP-A — purge cover-letter + wrong-period source_url for CTG
// ---------------------------------------------------------------------------

/**
 * resetCtgWrongSourceUrls — purge poisoned source_url values from CTG queue rows.
 *
 * Two classes of wrong URLs (see docs/architecture-briefs/2026-06-03-bctc-ctg-attachment-fetch-spike.md):
 *
 *   Class 1 — Cover-letter URL (all periods):
 *     Any CTG row where source_url contains 'CV_CBTT' is a disclosure cover
 *     letter (Công Văn Công Bố Thông Tin), NOT a B02-TCTD financial statement.
 *     Confirmed case: Q1 2026 had owa.hnx.vn/.../CV_CBTT_BCTC_Quy_I.2026_VI.pdf
 *     (524 KB cover letter → extraction_confidence = 0.06, all values = 0).
 *
 *   Class 2 — Wrong-period URL (non-Q1-2026 rows):
 *     Defect B in bctcQueueEnricherJob (before FIX-CTG-1/ddf37a3b) ignored
 *     period_year/period_quarter and defaulted to year=2026/quarter=Q4 →
 *     hsx.vn returned the Q1-2026 PDF for every row. Q3-2025 and Q2-2025
 *     CTG rows were written with a URL containing 'Quy_I.2026' or 'Quy I.2026'
 *     or the percent-encoded equivalent '%20I.2026%20'.
 *     Detection: source_url contains any of those patterns AND
 *     NOT (period_year = 2026 AND period_quarter = 'Q1').
 *
 * Fix applied by this migration:
 *   - Set source_url = NULL, status = 'pending', attempts = 0 for matched rows.
 *   - The enricher (FIX-CTG-1 already in prod) will re-run with the correct
 *     year/quarter and write the proper hsx.vn hop-nhat URL on next cycle.
 *   - For Q1 2026: the enricher will find the 6.34 MB consolidated statement
 *     instead of the 524 KB cover letter.
 *
 * Idempotent:
 *   - Class 1 WHERE clause matches only rows still holding 'CV_CBTT' in their URL.
 *     After reset (source_url = NULL), the condition evaluates to false → no-op.
 *   - Class 2 WHERE clause matches only wrong-period URLs. After reset, no-op.
 *
 * Scope: CTG only. All other tickers are untouched.
 *
 * @param db Database instance
 * @returns Total number of rows reset (0 on repeat calls = idempotent)
 */
export function resetCtgWrongSourceUrls(db: Database): number {
  let total = 0;

  try {
    // Class 1: any CTG row with a cover-letter URL (contains 'CV_CBTT')
    const class1 = db.prepare(`
      UPDATE bctc_vps_queue
      SET source_url = NULL, status = 'pending', attempts = 0
      WHERE action_code = 'CTG'
        AND source_url IS NOT NULL
        AND (
          source_url LIKE '%CV_CBTT%'
          OR source_url LIKE '%CV CBTT%'
        )
    `).run();
    total += class1.changes;

    // Class 2: non-Q1-2026 CTG rows that were corrupted with a Q1-2026 URL
    // (Defect B: enricher ignored period_year/period_quarter before FIX-CTG-1).
    // Pattern: URL contains 'I.2026' (Roman numeral I = Q1) or percent-encoded variant.
    const class2 = db.prepare(`
      UPDATE bctc_vps_queue
      SET source_url = NULL, status = 'pending', attempts = 0
      WHERE action_code = 'CTG'
        AND source_url IS NOT NULL
        AND NOT (period_year = 2026 AND period_quarter = 'Q1')
        AND (
          source_url LIKE '% I.2026%'
          OR source_url LIKE '%_I.2026%'
          OR source_url LIKE '%I.2026%'
          OR source_url LIKE '%Quy I 2026%'
          OR source_url LIKE '%I%2026%'
        )
    `).run();
    total += class2.changes;

    if (total > 0) {
      logger.info(
        `[FIX-CTG-3 STEP-A] Reset ${total} CTG bctc_vps_queue rows with wrong source_url to pending`,
        { class1: class1.changes, class2: class2.changes },
      );
    }
  } catch {
    // bctc_vps_queue may not exist yet on a fresh DB — silently skip
  }

  return total;
}

// ---------------------------------------------------------------------------
// FIX-CTG-3 STEP-C — Recover stuck status='fetching' queue rows
// ---------------------------------------------------------------------------

/**
 * recoverStuckFetchingQueue — reset bctc_vps_queue rows stuck at status='fetching'
 * that have no corresponding financial_reports entry.
 *
 * When POST /api/push-bctc-pdf receives a PDF, it immediately sets the queue row
 * to status='fetching', then fires setImmediate→triggerPushBctcExtraction. If the
 * extraction silently fails (geo-blocked source URL, service unavailable, process
 * restart mid-flight), the row can remain at 'fetching' indefinitely. No scheduled
 * job queries status='fetching', so the PDF sits on disk with no financial_reports
 * entry and no re-attempt path until the next daily bctcReparseJob (02:30 UTC).
 *
 * Fix: on every startup, find 'fetching' rows with no matching financial_reports
 * row and reset them to status='pending'. This allows bctcQueueEnricherJob (15-min
 * cron) to re-discover the PDF URL and bctcPdfPullJob (30-min cron) to re-download
 * and re-extract. The bctcReparseJob disk scan also picks up on-disk PDFs
 * independently, providing a second recovery path.
 *
 * Only CTG-class failures (geo-blocked push URL → service null → stuck 'fetching')
 * are addressed. Rows where extraction succeeded (financial_reports row exists) are
 * left at 'fetching' to avoid infinite retry loops.
 *
 * Idempotent: a second call on already-pending rows returns 0 (WHERE status='fetching'
 * matches nothing).
 *
 * @param db - SQLite database instance.
 * @returns Number of rows reset from 'fetching' to 'pending'.
 */
export function recoverStuckFetchingQueue(db: Database): number {
  try {
    const result = db.prepare(`
      UPDATE bctc_vps_queue
      SET status = 'pending'
      WHERE status = 'fetching'
        AND NOT EXISTS (
          SELECT 1 FROM financial_reports fr
          WHERE fr.action_code = bctc_vps_queue.action_code
            AND fr.period_year  = bctc_vps_queue.period_year
            AND fr.period_type  = bctc_vps_queue.period_quarter
        )
    `).run();
    const count = result.changes;
    if (count > 0) {
      logger.info(
        `[FIX-CTG-3 STEP-C] Recovered ${count} stuck-fetching bctc_vps_queue rows → pending`,
        { count },
      );
    }
    return count;
  } catch {
    // bctc_vps_queue or financial_reports may not exist on fresh DB — silently skip
    return 0;
  }
}
