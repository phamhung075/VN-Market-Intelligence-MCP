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

export function initFinancialReportsTables(db: Database): void {
  // ── Financial Reports (BCTC) ───────────────────────────────────────────────
  // DDL imported from bctc-schema.ts — includes financial_reports table,
  // all scalar columns, JSON blobs, indexes, v_chart_timeseries and
  // v_yoy_comparison views.
  db.exec(SQLITE_DDL);

  // ── Migration: add validation_status/validation_notes if missing ───────────
  try {
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(financial_reports)")
      .all();
    const colNames = new Set(cols.map((c) => c.name));
    if (!colNames.has("validation_status")) {
      db.exec(
        "ALTER TABLE financial_reports ADD COLUMN validation_status TEXT DEFAULT 'pending'",
      );
    }
    if (!colNames.has("validation_notes")) {
      db.exec("ALTER TABLE financial_reports ADD COLUMN validation_notes TEXT");
    }

    // ── Task 1294b: extraction method + confidence tracking ──────────────────
    if (!colNames.has("extraction_method")) {
      db.exec(
        "ALTER TABLE financial_reports ADD COLUMN extraction_method TEXT DEFAULT 'ocr_pdf'",
      );
    }
    if (!colNames.has("extraction_source_note")) {
      db.exec("ALTER TABLE financial_reports ADD COLUMN extraction_source_note TEXT");
    }
    if (!colNames.has("revenue_growth_qoq")) {
      db.exec("ALTER TABLE financial_reports ADD COLUMN revenue_growth_qoq REAL DEFAULT 0.0");
    }
    if (!colNames.has("margin_trend")) {
      db.exec("ALTER TABLE financial_reports ADD COLUMN margin_trend REAL DEFAULT 0.0");
    }
    if (!colNames.has("debt_ratio_hint")) {
      db.exec("ALTER TABLE financial_reports ADD COLUMN debt_ratio_hint REAL DEFAULT 0.0");
    }

    // Add index for fallback signal lookups
    db.exec(`CREATE INDEX IF NOT EXISTS idx_fr_extraction_method ON financial_reports(action_code, extraction_method, parsed_at)`);

    // ── Task 1345b: financial validation confidence columns ──────────────────
    if (!colNames.has("ocr_confidence")) {
      db.exec("ALTER TABLE financial_reports ADD COLUMN ocr_confidence REAL");
    }
    if (!colNames.has("confidence_financial")) {
      db.exec("ALTER TABLE financial_reports ADD COLUMN confidence_financial REAL");
    }

    // ── Task 1878a: OCF bridge column (vnstock API-grade, quarterly only) ───
    // Separate from existing `operating_cf` (BCTC OCR/PDF extraction).
    // Unit: trieu VND (millions) — consistent with all other scalar columns.
    // NULLABLE: not every ticker has vnstock cash-flow history.
    if (!colNames.has("operating_cash_flow")) {
      db.exec(
        "ALTER TABLE financial_reports ADD COLUMN operating_cash_flow REAL",
      );
    }

    // ── Task 1941d: net_profit API bridge column ─────────────────────────────
    // Separate from existing `net_profit` (BCTC OCR/PDF extraction, often wrong).
    // Populated from vnstock_financials.net_profit_bn * 1000 (ty -> trieu).
    // Unit: trieu VND (millions). NULLABLE: not every ticker has vnstock data.
    if (!colNames.has("net_profit_api_bridge")) {
      db.exec(
        "ALTER TABLE financial_reports ADD COLUMN net_profit_api_bridge REAL",
      );
    }
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
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, date)
    )
  `);

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

  // ── BCTC-AGENTIC-REFINE: text_status + refine_status on financial_reports ─
  // Idempotent migrations: check PRAGMA table_info before ALTER TABLE.
  // text_status: OCR lifecycle (COMPLETE | IN_PROGRESS | PARTIAL)
  //   Default COMPLETE for existing rows (they already have extracted OCR text).
  // refine_status: refine lifecycle (PENDING | IN_PROGRESS | DONE | FAILED | PARTIAL | REJECTED_SANITY)
  //   Default PENDING for existing rows (they need to be refined).
  //   REJECTED_SANITY — terminal state, report rejected by DT-2/DT-3 aggregate sanity gates
  //   during finalize_bctc_refine (BCTC-TRUST-RED sprint). Not re-queued by cron until
  //   manually reset to PENDING. No ALTER TABLE needed — TEXT column, additive value.
  try {
    const refCols = db
      .query<{ name: string }, []>("PRAGMA table_info(financial_reports)")
      .all();
    const refColNames = new Set(refCols.map((c) => c.name));

    if (!refColNames.has("text_status")) {
      db.exec(
        "ALTER TABLE financial_reports ADD COLUMN text_status TEXT NOT NULL DEFAULT 'COMPLETE'",
      );
      // Existing rows have completed OCR — default COMPLETE is correct.
    }
    if (!refColNames.has("refine_status")) {
      db.exec(
        "ALTER TABLE financial_reports ADD COLUMN refine_status TEXT NOT NULL DEFAULT 'PENDING'",
      );
      // Existing rows need refine — default PENDING is correct.
    }
  } catch {
    // fresh DB — columns included via SQLITE_DDL or table does not yet exist
  }

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

  // ── BAL-1c: period_basis column on financial_reports ─────────────────────
  // period_basis: 'standalone_quarter' | 'full_year_cumulative' | NULL (unknown)
  //   Q4 under VAS standard = full-year cumulative (Jan–Dec).
  //   Q1/Q2/Q3 = YTD cumulative but treated as 'standalone_quarter' for comparison
  //   basis (the minimal conservative tagging sufficient to block the false Q4 vs
  //   Q1/Q2/Q3 delta). NULL on existing rows until finalize_bctc_refine populates them.
  //
  // Migration mechanism: PRAGMA table_info check + guarded ALTER TABLE (idempotent).
  // Pattern: same as refine_status / confirm_status migrations above.
  try {
    const pb_cols = db
      .query<{ name: string }, []>("PRAGMA table_info(financial_reports)")
      .all();
    const pb_col_names = new Set(pb_cols.map((c) => c.name));
    if (!pb_col_names.has("period_basis")) {
      db.exec("ALTER TABLE financial_reports ADD COLUMN period_basis TEXT");
      // NULL default: existing rows are unknown basis until finalize_bctc_refine
      // backfills them on next run. NULL causes the comparison guard to pass-through
      // (safe fail-open: no false-block on untagged data).
    }
  } catch {
    // fresh DB — column included via SQLITE_DDL (will be added there in future)
  }

  // ── BCTC-HUMAN-CONFIRM: Migration 2 — confirm_status on financial_reports ──
  // confirm_status: PENDING | CONFIRMED (separate dimension from refine_status)
  // final_confirmed_at: ISO8601 UTC timestamp; NULL when not yet confirmed
  // confirmed_by: reserved for future RBAC; always 'user' for single-user product
  // Default PENDING for all existing rows (nothing has been human-confirmed yet).
  try {
    const frCols2 = db
      .query<{ name: string }, []>("PRAGMA table_info(financial_reports)")
      .all();
    const frColNames2 = new Set(frCols2.map((c) => c.name));
    if (!frColNames2.has("confirm_status")) {
      db.exec(
        "ALTER TABLE financial_reports ADD COLUMN confirm_status TEXT NOT NULL DEFAULT 'PENDING'",
      );
    }
    if (!frColNames2.has("final_confirmed_at")) {
      db.exec(
        "ALTER TABLE financial_reports ADD COLUMN final_confirmed_at TEXT",
      );
    }
    if (!frColNames2.has("confirmed_by")) {
      db.exec(
        "ALTER TABLE financial_reports ADD COLUMN confirmed_by TEXT DEFAULT 'user'",
      );
    }
  } catch {
    // fresh DB — columns included via SQLITE_DDL
  }

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

  // ── TASK-1943a: reset Q1-2026 url_not_found rows to pending ───────────────
  // 31 bctc_vps_queue rows exhausted MAX_ENRICH_ATTEMPTS=5 without finding PDF
  // URLs. Resetting to pending/attempts=0 allows the enricher to retry.
  // Idempotent: no-op after first run (rows already pending). Safe on startup.
  resetQ1UrlNotFound(db);
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
 * All 31 bctc_vps_queue rows with status='url_not_found' for Q1-2026 hit
 * MAX_ENRICH_ATTEMPTS=5 without finding a PDF URL. This function resets them
 * to pending/attempts=0 so the enricher picks them up on next cycle.
 *
 * Called automatically from initFinancialReportsTables() after each startup.
 *
 * Idempotent: rows already in 'pending' state are unaffected (WHERE status=
 * 'url_not_found' matches nothing on repeat calls). Safe to run multiple times.
 *
 * Scope: Q1-2026 only. Other periods (Q4-2025, Q2-2026, etc.) are untouched.
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
