/**
 * TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST.test.ts
 *
 * Sprint: FIX-BCTC-BANK-SUMMARY-MAPPING | Unit: W5 (final) | Date: 2026-07-01
 * Spec: docs/handoffs/BA-FIX-BCTC-BANK-SUMMARY-MAPPING.md — FR-6, AC-6
 * Brief: docs/architecture-briefs/2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING.md §5 W5
 *
 * SCOPE — AC-6 ("validation_status no longer low_confidence SOLELY from the
 * identity violation" AND "for readings that remain genuinely violated,
 * validation_status/confidence must reflect the FR-5 hard-block, not a soft
 * 'failed'/'low_confidence' label").
 *
 * SPIKE FINDING (documented here, not fabricated):
 *   finalizeBctcRefineTool.ts's BLOCK-4 (FU-LF-VALIDATION-STATUS-REFLOW,
 *   pre-existing, commit e74dd0e1, unrelated to this sprint) already
 *   re-validates from freshly-committed scalars on every finalize call and
 *   was ALREADY proven (see FU-LF-VALIDATION-REFLOW-DE-SERVE-HONEST.test.ts
 *   FLR-4/FLR-5) to correctly flip a stale 'passed'/'failed' status to match
 *   a genuinely-violated or genuinely-repaired balance sheet.
 *
 *   A live-DB probe of CTG's actual report_id=96e36139-5dac-414d-8e4d-
 *   20a4725890d1 (docker exec, named-volume market.db, 2026-07-01) confirms
 *   its CURRENT validation_notes carry the "Errors: ..." prefix format that
 *   ONLY parseBctcReport.ts (OCR parse time) writes — never BLOCK-4's format
 *   ("; "-joined, no prefix). This proves BLOCK-4 has never (yet) run against
 *   this report_id — CTG's live validation_status='low_confidence' is DATA
 *   STALENESS (no finalize since the OCR-parse-time low-confidence override),
 *   not a masking defect in BLOCK-4 itself. Un-freezing it is the re-ingest
 *   operational step (Part B — scripts/migrations/reingest-bctc-report.ts),
 *   NOT a code change. Confirmed via CTG-1 below (confirm-clean regression).
 *
 * REAL DEFECT FOUND + FIXED (RED→GREEN, CTG-2/BLOCK5-1 below):
 *   BLOCK-4's validateFinancialReport() uses its own 1%/5% relative-diff
 *   identity math, which is a DIFFERENT predicate than the canonical FR-5
 *   serve-path guard (bctcIdentityGuard.ts's checkBctcIdentityGuard —
 *   totalAssets<=0 OR totalAssets<equityTotal). These two predicates can
 *   DIVERGE: a BLOCK-1 Case-2-frozen total_assets combined with a
 *   compensating/miscomputed total_liabilities can make the relative-diff
 *   math read as balance-EXACT (0% diff) even though total_assets is still
 *   LESS than equity_total (an accounting impossibility — equity must be
 *   funded by assets) — so BLOCK-4 silently wrote validation_status='passed'
 *   for a row the serve layer (get_bctc_full/get_financial_summary/
 *   compare_financials, via W1's shared guard) would hard-block as
 *   "[CORRUPT DATA — SKIP]". Same defect class for BLOCK-5: extraction_
 *   confidence could be BOOSTED toward 1.0 by section-completeness alone,
 *   with no gate on whether the underlying scalars are guard-corrupt.
 *
 *   Fixed by re-applying the canonical checkBctcIdentityGuard inside both
 *   BLOCK-4 and BLOCK-5 as the write-time SSOT — closes the split-brain risk
 *   between finalize's write-time truthfulness and the serve paths' FR-5
 *   hard-block, generically (no per-ticker/date literal in the fix).
 *
 * @module __tests__/TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { buildFinalizeBctcRefineHandler } from "../interface/mcp/tools/financial-reports/finalizeBctcRefineTool.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Full-schema in-memory DB (validation_status/extraction_confidence columns + all BCTC tables). */
function openFullDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  db.exec(`CREATE TABLE IF NOT EXISTS rag_analyses (
    id TEXT PRIMARY KEY,
    action_level TEXT NOT NULL DEFAULT 'stock',
    action_code TEXT NOT NULL DEFAULT 'TST',
    affected_actions TEXT NOT NULL DEFAULT '[]',
    headline TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    published_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    embedding_vector TEXT NOT NULL DEFAULT '',
    sentiment TEXT,
    confidence REAL,
    causal_chain TEXT,
    data_env TEXT,
    source_url TEXT UNIQUE)`);
  return db;
}

interface FrRow {
  validation_status: string | null;
  validation_notes: string | null;
  extraction_confidence: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  equity_total: number | null;
}

function readReport(db: Database, reportId: string): FrRow | null {
  return db
    .prepare<FrRow, [string]>(
      `SELECT validation_status, validation_notes, extraction_confidence,
              total_assets, total_liabilities, equity_total
       FROM financial_reports WHERE id = ?`,
    )
    .get(reportId);
}

/** Seed a bare financial_reports row (INSERT OR REPLACE, minimal required columns). */
function seedReport(
  db: Database,
  opts: {
    id: string;
    action_code: string;
    total_assets: number | null;
    total_liabilities: number | null;
    equity_total: number | null;
    extraction_confidence: number;
    validation_status: string;
    validation_notes: string | null;
  },
): void {
  db.prepare(
    `INSERT OR REPLACE INTO financial_reports
       (id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type, period_start, period_end, sort_key,
        parsed_at, extraction_confidence,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
        total_assets, total_liabilities, equity_total,
        validation_status, validation_notes,
        refine_status, confirm_status)
     VALUES (?, ?, ?, 'HOSE', 'other',
             2026, 1, 'Q1', '2026-01-01', '2026-03-31', '2026-Q1',
             datetime('now'), ?,
             '{}', '{}', '{}', '{}',
             ?, ?, ?,
             ?, ?,
             'PENDING', 'PENDING')`,
  ).run(
    opts.id,
    opts.action_code,
    `${opts.action_code} Corp`,
    opts.extraction_confidence,
    opts.total_assets,
    opts.total_liabilities,
    opts.equity_total,
    opts.validation_status,
    opts.validation_notes,
  );
}

/** Seed one DONE refine window whose markdown carries NO balance-sheet total/label rows —
 * guarantees the aggregator returns null for total_assets/total_liabilities/equity_total,
 * so BLOCK-1's Case-2 ("aggregator null AND not notApplicable → skip, preserve prior")
 * leaves the seeded (possibly corrupt) scalars frozen exactly as seeded. */
function seedDoneUnitNoBalanceSheetData(db: Database, reportId: string): void {
  db.prepare(
    `INSERT OR REPLACE INTO bctc_refined_units
       (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
     VALUES (?, 'unit-w5', '[1]', '| test |', 1, 0.85, 'DONE')`,
  ).run(reportId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// AC-6 — real defect: BLOCK-4/BLOCK-5 vs FR-5 canonical guard split-brain
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-6: finalize write-path validation_status/confidence must match FR-5 canonical guard", () => {
  let db: Database;

  beforeEach(() => { db = openFullDb(); });
  afterEach(() => { db.close(); });

  it("CTG-2 (RED→GREEN): guard-corrupt row (compensating negative liabilities) — BLOCK-4 must NOT write validation_status='passed'", async () => {
    /**
     * total_assets=100,000 < equity_total=150,000 → canonical FR-5 guard
     * (checkBctcIdentityGuard) says CORRUPT (equity cannot exceed the assets
     * that fund it). BUT total_liabilities=-50,000 makes
     * validateFinancialReport's own relative-diff math read as balance-EXACT
     * (-50,000 + 150,000 = 100,000 = total_assets, diff=0%) — its identity
     * check does NOT fire in isolation. This is the concrete split-brain the
     * fix closes: BEFORE the fix, this fixture proves BLOCK-4 would write
     * validation_status='passed' for a guard-corrupt row (RED). AFTER the
     * fix, the canonical guard forces 'failed' regardless (GREEN).
     */
    const REPORT_ID = "w5-ctg2-split-brain-0001";
    seedReport(db, {
      id: REPORT_ID,
      action_code: "CTG",
      total_assets: 100_000,
      total_liabilities: -50_000,
      equity_total: 150_000,
      extraction_confidence: 0.8,
      validation_status: "pending",
      validation_notes: null,
    });
    seedDoneUnitNoBalanceSheetData(db, REPORT_ID);

    const handler = buildFinalizeBctcRefineHandler(db);
    await handler({ report_id: REPORT_ID, report_status: "PARTIAL" });

    const row = readReport(db, REPORT_ID);
    expect(row).not.toBeNull();
    // Scalars must have stayed frozen (Case-2, no balance-sheet rows to update from)
    expect(row!.total_assets).toBe(100_000);
    expect(row!.equity_total).toBe(150_000);

    // CORE ASSERTION (AC-6): a guard-corrupt row must NEVER be 'passed' —
    // the FR-5 hard-block must be reflected in validation_status.
    expect(row!.validation_status).not.toBe("passed");
    expect(row!.validation_status).toBe("failed");
    // Notes must carry the guard's own reason (traceable to the hard-block).
    expect(row!.validation_notes).toContain("FR-5 hard-block");
  });

  it("BLOCK5-1 (RED→GREEN): guard-corrupt row must NOT have extraction_confidence boosted by section completeness", async () => {
    /**
     * Same guard-corrupt fixture, but with a DONE window covering all 3
     * sections (balance_sheet + income_statement + cash_flow headers) so
     * BLOCK-5's section-completeness score would compute refinedConfidence=1.0
     * (0.4+0.4+0.2) — a HIGHER value than the seeded 0.3, which WOULD have
     * overwritten extraction_confidence to 1.0 pre-fix, misrepresenting a
     * guard-corrupt reading as maximally trustworthy (RED). Post-fix: forced
     * to 0 regardless of section coverage (GREEN).
     */
    const REPORT_ID = "w5-block5-corrupt-conf-0002";
    seedReport(db, {
      id: REPORT_ID,
      action_code: "CTG",
      total_assets: 100_000,
      total_liabilities: -50_000,
      equity_total: 150_000,
      extraction_confidence: 0.3,
      validation_status: "pending",
      validation_notes: null,
    });

    const markdown = [
      "BẢNG CÂN ĐỐI KẾ TOÁN",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| I | Tiền mặt | 100 | 90 |",
      "",
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| 1 | Thu nhập lãi thuần | 50 | 45 |",
      "",
      "LƯU CHUYỂN TIỀN TỆ",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| 01 | Lưu chuyển tiền từ HĐKD | 20 | 15 |",
    ].join("\n");

    db.prepare(
      `INSERT OR REPLACE INTO bctc_refined_units
         (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
       VALUES (?, 'unit-w5-conf', '[1]', ?, 3, 0.85, 'DONE')`,
    ).run(REPORT_ID, markdown);

    const handler = buildFinalizeBctcRefineHandler(db);
    await handler({ report_id: REPORT_ID, report_status: "PARTIAL" });

    const row = readReport(db, REPORT_ID);
    expect(row).not.toBeNull();
    // total_assets/equity_total unaffected by these rows (no matching total-assets
    // label/code in the markdown) — still the guard-corrupt seed values.
    expect(row!.total_assets).toBe(100_000);
    expect(row!.equity_total).toBe(150_000);

    // CORE ASSERTION: confidence must be forced to 0, NOT boosted to 1.0.
    expect(row!.extraction_confidence).toBe(0);
  });

  it("CTG-1 (confirm-clean): CTG's real live numbers already trip BLOCK-4 truthfully — no masking for this data shape", async () => {
    /**
     * Pins CTG's ACTUAL live report_id=96e36139-… numbers (2026-07-01 live
     * probe: total_assets=0, total_liabilities=24,735,484,770,
     * equity_total=244,904,306, validation_status='low_confidence' — the
     * STALE parse-time value). This is the confirm-clean half of the SPIKE:
     * validateFinancialReport's own garbage-threshold math ALREADY correctly
     * flags this exact number set (100% mismatch, not a compensating-value
     * edge case) — proving BLOCK-4 was never the mechanism keeping this row
     * at 'low_confidence' live; the live staleness is because finalize has
     * not re-run against this report_id since BLOCK-4 shipped (Part B —
     * re-ingest operational runbook unfreezes it, not a code change here).
     */
    const REPORT_ID = "w5-ctg1-real-numbers-confirm-clean";
    seedReport(db, {
      id: REPORT_ID,
      action_code: "CTG",
      total_assets: 0,
      total_liabilities: 24_735_484_770,
      equity_total: 244_904_306,
      extraction_confidence: 0.5625,
      // Mirrors CTG's live stale state exactly (parse-time low_confidence
      // override + the "Errors: " prefixed parse-time note format).
      validation_status: "low_confidence",
      validation_notes:
        "Errors: Accounting identity violated: Assets (0) ≠ Liabilities (24.735.484.770) + Equity (244.904.306) — mismatch 100.0%",
    });
    seedDoneUnitNoBalanceSheetData(db, REPORT_ID);

    const handler = buildFinalizeBctcRefineHandler(db);
    await handler({ report_id: REPORT_ID, report_status: "PARTIAL" });

    const row = readReport(db, REPORT_ID);
    expect(row).not.toBeNull();
    // Once finalize DOES run (the re-ingest step), the stale 'low_confidence'
    // label must be gone — replaced with the truthful hard-block state.
    expect(row!.validation_status).not.toBe("low_confidence");
    expect(row!.validation_status).toBe("failed");
    expect(row!.extraction_confidence).toBe(0);
  });

  it("non-regression: balance-exact row (no guard violation) still gets the normal confidence boost", async () => {
    const REPORT_ID = "w5-noncorrupt-normal-boost-0003";
    seedReport(db, {
      id: REPORT_ID,
      action_code: "VCB",
      total_assets: 100_000,
      total_liabilities: 60_000,
      equity_total: 40_000, // 60,000 + 40,000 = 100,000 — identity holds AND assets >= equity
      extraction_confidence: 0.3,
      validation_status: "pending",
      validation_notes: null,
    });

    const markdown = [
      "BẢNG CÂN ĐỐI KẾ TOÁN",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| I | Tiền mặt | 100 | 90 |",
      "",
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| 1 | Thu nhập lãi thuần | 50 | 45 |",
      "",
      "LƯU CHUYỂN TIỀN TỆ",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| 01 | Lưu chuyển tiền từ HĐKD | 20 | 15 |",
    ].join("\n");

    db.prepare(
      `INSERT OR REPLACE INTO bctc_refined_units
         (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
       VALUES (?, 'unit-w5-clean', '[1]', ?, 3, 0.85, 'DONE')`,
    ).run(REPORT_ID, markdown);

    const handler = buildFinalizeBctcRefineHandler(db);
    await handler({ report_id: REPORT_ID, report_status: "PARTIAL" });

    const row = readReport(db, REPORT_ID);
    expect(row).not.toBeNull();
    expect(row!.validation_status).not.toBe("failed");
    expect(row!.validation_status).toMatch(/^passed/);
    // Not guard-corrupt → normal section-completeness boost still applies (1.0 > 0.3).
    expect(row!.extraction_confidence).toBe(1);
  });
});
