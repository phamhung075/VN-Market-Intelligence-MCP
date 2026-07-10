// scripts/migrations/__tests__/carry-forward-bctc-orphaned-rows.test.ts
//
// TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD (Track 1 of
// FIX-BCTC-BANK-SUMMARY-MAPPING W5 replacement, per AC-14 dedup with the
// twin sprint FIX-BCTC-BANK-SCALAR-MAPPING). Architect brief §2.5:
// docs/architecture-briefs/2026-07-10-FIX-BCTC-BANK-SCALAR-MAPPING.md
//
// Unit tests for the carry-forward-bctc-orphaned-rows migration script's
// pure functions (readMigrationSnapshot / decideMigration / copyOrphanedRows).
// All DB ops use :memory: via the exported API — no live/named-volume DB touched.

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initFinancialReportsTables } from "../../../apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts";
import { buildBackfillBctcScalarsHandler } from "../../../apps/mcp-server/src/interface/mcp/tools/financial-reports/backfillBctcScalarsTool.ts";
import {
  readMigrationSnapshot,
  decideMigration,
  copyOrphanedRows,
  type MigrationSnapshot,
} from "../carry-forward-bctc-orphaned-rows.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function openTestDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  return db;
}

const SOURCE_ID = "96e36139-5dac-414d-8e4d-20a4725890d1"; // orphaned — no financial_reports row
const TARGET_ID = "e497f7d1-8717-49cc-bfa9-88804464d143"; // current CTG 2026-Q1

function insertTargetReport(
  db: Database,
  opts: { id?: string; confirmStatus?: string | null; code?: string; sortKey?: string } = {},
): string {
  const id = opts.id ?? TARGET_ID;
  db.run(
    `
    INSERT INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       period_year, period_quarter, period_type, period_start, period_end, sort_key,
       total_assets, net_revenue, net_margin_pct, refine_status, confirm_status,
       audit_status, extraction_confidence, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (?, ?, ?, 'HOSE', 'bank', 2026, 1, 'Q1', '2026-01-01', '2026-03-31', ?,
            0, 3910, 229157.0588235294, 'PENDING', ?,
            'unaudited', 0.5, datetime('now'), '{}', '{}', '{}', '{}')
  `,
    [id, opts.code ?? "CTG", `${opts.code ?? "CTG"} Corp`, opts.sortKey ?? "2026-Q1", opts.confirmStatus ?? "PENDING"],
  );
  return id;
}

/** Minimal bank-shaped 3-section corpus — enough to pass BEQ-6 completeness gate. */
function insertOrphanedSourceRows(db: Database, reportId: string, count = 451): void {
  const seedRows: Array<{ section: string; code: string | null; label: string; value: number | null; isSum: number }> = [
    { section: "income_statement", code: "10", label: "Thu nhập lãi thuần", value: 5_000_000, isSum: 1 },
    { section: "income_statement", code: "60", label: "Lợi nhuận sau thuế", value: 1_200_000, isSum: 1 },
    { section: "general", code: "270", label: "TỔNG TÀI SẢN", value: 1_800_000_000, isSum: 1 },
    { section: "general", code: "300", label: "NỢ PHẢI TRẢ", value: 1_650_000_000, isSum: 1 },
    { section: "general", code: "400", label: "VỐN CHỦ SỞ HỮU", value: 150_000_000, isSum: 1 },
    { section: "cash_flow", code: "20", label: "Lưu chuyển tiền thuần từ HĐKD", value: -300_000, isSum: 1 },
  ];
  for (let i = 0; i < seedRows.length; i++) {
    const row = seedRows[i]!;
    db.run(
      `INSERT INTO bctc_table_rows
        (report_id, page_number, statement_section, row_order, code, label, period_current, value_current, unit, is_summary_row)
       VALUES (?, 1, ?, ?, ?, ?, 'current', ?, 'billion_vnd', ?)`,
      [reportId, row.section, i, row.code, row.label, row.value, row.isSum],
    );
  }
  // Pad to `count` total rows with non-summary filler rows (mirrors the real
  // orphan's page/notes filler content — irrelevant to aggregation).
  for (let i = seedRows.length; i < count; i++) {
    db.run(
      `INSERT INTO bctc_table_rows
        (report_id, page_number, statement_section, row_order, code, label, period_current, value_current, unit, is_summary_row)
       VALUES (?, ?, 'notes', ?, NULL, ?, 'current', NULL, 'billion_vnd', 0)`,
      [reportId, 10 + i, i, `filler row ${i}`],
    );
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("carry-forward-bctc-orphaned-rows — decision logic", () => {
  it("refuses when target report_id is not found (AC-16 freshness guard)", () => {
    const db = openTestDb();
    insertOrphanedSourceRows(db, SOURCE_ID, 5);

    const snap = readMigrationSnapshot(db, SOURCE_ID, "does-not-exist-0000");
    expect(snap.targetFound).toBe(false);

    const decision = decideMigration(snap);
    expect(decision.action).toBe("refuse_target_not_found");
  });

  it("refuses (never touches) a CONFIRMED target", () => {
    const db = openTestDb();
    insertTargetReport(db, { confirmStatus: "CONFIRMED" });
    insertOrphanedSourceRows(db, SOURCE_ID, 5);

    const snap = readMigrationSnapshot(db, SOURCE_ID, TARGET_ID);
    const decision = decideMigration(snap);
    expect(decision.action).toBe("noop_confirmed");
  });

  it("refuses when the source report_id has 0 orphaned rows", () => {
    const db = openTestDb();
    insertTargetReport(db);
    // no source rows inserted

    const snap = readMigrationSnapshot(db, SOURCE_ID, TARGET_ID);
    expect(snap.sourceRowCount).toBe(0);

    const decision = decideMigration(snap);
    expect(decision.action).toBe("refuse_no_source_rows");
  });

  it("refuses when target already has a conflicting (non-matching) row count", () => {
    const db = openTestDb();
    insertTargetReport(db);
    insertOrphanedSourceRows(db, SOURCE_ID, 451);
    // Simulate a partial/dirty prior write: target already has SOME rows,
    // but not the full source count.
    db.run(
      `INSERT INTO bctc_table_rows (report_id, page_number, statement_section, row_order, code, label, period_current, unit, is_summary_row)
       VALUES (?, 1, 'general', 0, '270', 'stale row', 'current', 'billion_vnd', 1)`,
      [TARGET_ID],
    );

    const snap = readMigrationSnapshot(db, SOURCE_ID, TARGET_ID);
    expect(snap.targetRowCount).toBe(1);
    expect(snap.sourceRowCount).toBe(451);

    const decision = decideMigration(snap);
    expect(decision.action).toBe("refuse_conflicting_rows");
  });

  it("apply: target=0 rows, source=451 rows → eligible to carry forward", () => {
    const db = openTestDb();
    insertTargetReport(db);
    insertOrphanedSourceRows(db, SOURCE_ID, 451);

    const snap = readMigrationSnapshot(db, SOURCE_ID, TARGET_ID);
    expect(snap.targetRowCount).toBe(0);
    expect(snap.sourceRowCount).toBe(451);

    const decision = decideMigration(snap);
    expect(decision.action).toBe("apply");
  });

  it("idempotent: after a successful copy, re-running detects noop_already_migrated", () => {
    const db = openTestDb();
    insertTargetReport(db);
    insertOrphanedSourceRows(db, SOURCE_ID, 451);

    const inserted = copyOrphanedRows(db, SOURCE_ID, TARGET_ID);
    expect(inserted).toBe(451);

    const snapAfter: MigrationSnapshot = readMigrationSnapshot(db, SOURCE_ID, TARGET_ID);
    expect(snapAfter.targetRowCount).toBe(451);

    const decision = decideMigration(snapAfter);
    expect(decision.action).toBe("noop_already_migrated");

    // Re-running copyOrphanedRows would double the rows if ever called again
    // without the decision gate — this proves the gate, not the copy fn itself,
    // is what keeps a second CLI invocation safe.
  });
});

describe("carry-forward-bctc-orphaned-rows — copy + scalar reflow (AC-TRACK1-2, AC-TRACK1-3)", () => {
  it("copies all orphaned rows onto the target report_id, unmodified", () => {
    const db = openTestDb();
    insertTargetReport(db);
    insertOrphanedSourceRows(db, SOURCE_ID, 451);

    const inserted = copyOrphanedRows(db, SOURCE_ID, TARGET_ID);
    expect(inserted).toBe(451);

    const targetRows = db
      .query<{ c: number }, [string]>("SELECT COUNT(*) as c FROM bctc_table_rows WHERE report_id = ?")
      .get(TARGET_ID);
    expect(targetRows?.c).toBe(451);

    // Source rows untouched (copy, not move)
    const sourceRows = db
      .query<{ c: number }, [string]>("SELECT COUNT(*) as c FROM bctc_table_rows WHERE report_id = ?")
      .get(SOURCE_ID);
    expect(sourceRows?.c).toBe(451);

    // Content fidelity spot-check: the balance-sheet total_assets row carried over intact
    const totalAssetsRow = db
      .query<{ value_current: number }, [string]>(
        "SELECT value_current FROM bctc_table_rows WHERE report_id = ? AND code = '270'",
      )
      .get(TARGET_ID);
    expect(totalAssetsRow?.value_current).toBe(1_800_000_000);
  });

  it("AC-TRACK1-3: after copy, backfill_bctc_scalars reflow populates total_assets/net_revenue/net_margin_pct plausibly", async () => {
    const db = openTestDb();
    insertTargetReport(db); // starts total_assets=0, net_revenue=3910 (garbage), net_margin_pct=229157% (garbage)
    insertOrphanedSourceRows(db, SOURCE_ID, 451);

    const inserted = copyOrphanedRows(db, SOURCE_ID, TARGET_ID);
    expect(inserted).toBe(451);

    // Reuse the LIVE backfill_bctc_scalars handler — zero duplicated aggregation logic.
    const handler = buildBackfillBctcScalarsHandler(db);
    const result = await handler({ report_id: TARGET_ID });
    const body = JSON.parse(result.content[0].text) as { ok: boolean; summary: { done: number; skipped: number } };
    expect(body.ok).toBe(true);
    expect(body.summary.done).toBe(1);

    const after = db
      .query<{ total_assets: number; net_revenue: number; net_margin_pct: number; refine_status: string }, [string]>(
        "SELECT total_assets, net_revenue, net_margin_pct, refine_status FROM financial_reports WHERE id = ?",
      )
      .get(TARGET_ID);

    expect(after?.refine_status).toBe("DONE");
    // total_assets no longer 0 (was frozen at 0 pre-migration)
    expect(after?.total_assets).toBeGreaterThan(0);
    // net_margin_pct no longer the ~229157% garbage value
    expect(after?.net_margin_pct).not.toBeCloseTo(229157.0588235294, 0);
  });
});
