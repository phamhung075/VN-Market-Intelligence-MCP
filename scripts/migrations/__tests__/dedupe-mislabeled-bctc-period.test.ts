// scripts/migrations/__tests__/dedupe-mislabeled-bctc-period.test.ts
//
// FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT — AC-1 (DATA) script.
// Unit tests for the dedupe-mislabeled-bctc-period migration script's pure
// functions (readDedupeSnapshot / decideDedupe / reparentRefinedUnits /
// deleteReportRow / resetFreedQueueRow). All DB ops use :memory: via the
// exported API — no live/named-volume DB touched.

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initFinancialReportsTables } from "../../../apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts";
import {
  readDedupeSnapshot,
  decideDedupe,
  reparentRefinedUnits,
  deleteReportRow,
  resetFreedQueueRow,
  safeMd5,
  type DedupeSnapshot,
} from "../dedupe-mislabeled-bctc-period.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function openTestDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  return db;
}

const SOURCE_ID = "5b0dad71-3b05-4455-9823-c2072442777d"; // mislabelled DPM_2025_Q4 (real content 2026-Q1)
const TARGET_ID = "3e2a26d9-525a-4dba-8ebe-fcaecc0cb28e"; // correctly-labelled DPM_2026_Q1

function insertReport(
  db: Database,
  opts: {
    id: string;
    actionCode?: string;
    sortKey?: string;
    year?: number;
    quarter?: number;
    refineStatus?: string | null;
    confirmStatus?: string | null;
    pdfPath?: string | null;
  },
): void {
  db.run(
    `
    INSERT INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       period_year, period_quarter, period_type, period_start, period_end, sort_key,
       pdf_path, refine_status, confirm_status,
       audit_status, extraction_confidence, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (?, ?, ?, 'HOSE', 'other',
            ?, ?, ?, '2025-10-01', '2025-12-31', ?,
            ?, ?, ?,
            'unaudited', 0.5, datetime('now'), '{}', '{}', '{}', '{}')
  `,
    [
      opts.id,
      opts.actionCode ?? "DPM",
      `${opts.actionCode ?? "DPM"} Corp`,
      opts.year ?? 2025,
      opts.quarter ?? 4,
      `Q${opts.quarter ?? 4}`,
      opts.sortKey ?? "2025-Q4",
      opts.pdfPath ?? null,
      opts.refineStatus === undefined ? "PENDING" : opts.refineStatus,
      opts.confirmStatus ?? "PENDING",
    ],
  );
}

function insertRefinedUnits(db: Database, reportId: string, count: number): void {
  for (let i = 0; i < count; i++) {
    db.run(
      `INSERT INTO bctc_refined_units (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
       VALUES (?, ?, '[]', 'md', 0, 0.9, 'DONE')`,
      [reportId, `unit-${String(i).padStart(4, "0")}`],
    );
  }
}

function insertQueueRow(
  db: Database,
  opts: { actionCode: string; year: number; quarter: string; status: string; sourceUrl?: string | null; attempts?: number },
): void {
  db.run(
    `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url, attempts, last_attempt)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    [opts.actionCode, opts.year, opts.quarter, opts.status, opts.sourceUrl ?? "https://example.com/wrong.pdf", opts.attempts ?? 1],
  );
}

// ── Tests: decision logic ──────────────────────────────────────────────────

describe("dedupe-mislabeled-bctc-period — decision logic", () => {
  it("idempotent no-op when source report_id is not found (already deduped or wrong id)", () => {
    const db = openTestDb();
    insertReport(db, { id: TARGET_ID, sortKey: "2026-Q1", year: 2026, quarter: 1 });

    const snap = readDedupeSnapshot(db, SOURCE_ID, TARGET_ID);
    expect(snap.source.found).toBe(false);

    const decision = decideDedupe(snap);
    expect(decision.action).toBe("noop_source_absent");
  });

  it("refuses when target report_id is not found", () => {
    const db = openTestDb();
    insertReport(db, { id: SOURCE_ID });

    const snap = readDedupeSnapshot(db, SOURCE_ID, "does-not-exist-0000");
    const decision = decideDedupe(snap);
    expect(decision.action).toBe("refuse_target_not_found");
  });

  it("CRITICAL time_gate: refuses when source refine_status is already DONE (finalized)", () => {
    const db = openTestDb();
    insertReport(db, { id: SOURCE_ID, refineStatus: "DONE" });
    insertReport(db, { id: TARGET_ID, sortKey: "2026-Q1", year: 2026, quarter: 1 });

    const snap = readDedupeSnapshot(db, SOURCE_ID, TARGET_ID);
    const decision = decideDedupe(snap);
    expect(decision.action).toBe("refuse_source_finalized");
  });

  it("refuses (never touches) a CONFIRMED target", () => {
    const db = openTestDb();
    insertReport(db, { id: SOURCE_ID });
    insertReport(db, { id: TARGET_ID, sortKey: "2026-Q1", year: 2026, quarter: 1, confirmStatus: "CONFIRMED" });

    const snap = readDedupeSnapshot(db, SOURCE_ID, TARGET_ID);
    const decision = decideDedupe(snap);
    expect(decision.action).toBe("refuse_target_confirmed");
  });

  it("refuses a cross-ticker dedupe (action_code mismatch)", () => {
    const db = openTestDb();
    insertReport(db, { id: SOURCE_ID, actionCode: "DPM" });
    insertReport(db, { id: TARGET_ID, actionCode: "CTG", sortKey: "2026-Q1", year: 2026, quarter: 1 });

    const snap = readDedupeSnapshot(db, SOURCE_ID, TARGET_ID);
    const decision = decideDedupe(snap);
    expect(decision.action).toBe("refuse_action_code_mismatch");
  });

  it("refuses when source and target share the same sort_key (nothing to dedupe)", () => {
    // financial_reports has UNIQUE(action_code, sort_key), so two REAL rows can
    // never share a sort_key — this guard is defense-in-depth for a snapshot
    // that could only arise from caller misuse (e.g. --source === --target
    // typo'd to two different ids that happen to collide on sort_key via a
    // stale read). Exercised directly against a hand-built snapshot, matching
    // the pdf-mismatch test's approach below.
    const snap: DedupeSnapshot = {
      source: {
        found: true,
        actionCode: "DPM",
        sortKey: "2025-Q4",
        periodYear: 2025,
        periodQuarter: 4,
        refineStatus: "PENDING",
        confirmStatus: "PENDING",
        pdfPath: null,
        refinedUnitsCount: 0,
      },
      target: {
        found: true,
        actionCode: "DPM",
        sortKey: "2025-Q4",
        periodYear: 2025,
        periodQuarter: 4,
        refineStatus: "PENDING",
        confirmStatus: "PENDING",
        pdfPath: null,
        refinedUnitsCount: 0,
      },
      pdfHashesMatch: null,
    };
    const decision = decideDedupe(snap);
    expect(decision.action).toBe("refuse_same_sort_key");
  });

  it("refuses when target already has bctc_refined_units (manual reconciliation needed)", () => {
    const db = openTestDb();
    insertReport(db, { id: SOURCE_ID });
    insertReport(db, { id: TARGET_ID, sortKey: "2026-Q1", year: 2026, quarter: 1 });
    insertRefinedUnits(db, TARGET_ID, 3);

    const snap = readDedupeSnapshot(db, SOURCE_ID, TARGET_ID);
    expect(snap.target.refinedUnitsCount).toBe(3);
    const decision = decideDedupe(snap);
    expect(decision.action).toBe("refuse_target_has_units");
  });

  it("apply: eligible when source pending + target empty + same ticker + different slot", () => {
    const db = openTestDb();
    insertReport(db, { id: SOURCE_ID, sortKey: "2025-Q4", year: 2025, quarter: 4, refineStatus: "PENDING" });
    insertReport(db, { id: TARGET_ID, sortKey: "2026-Q1", year: 2026, quarter: 1, refineStatus: "PENDING" });
    insertRefinedUnits(db, SOURCE_ID, 22);

    const snap = readDedupeSnapshot(db, SOURCE_ID, TARGET_ID);
    expect(snap.source.refinedUnitsCount).toBe(22);
    expect(snap.target.refinedUnitsCount).toBe(0);

    const decision = decideDedupe(snap);
    expect(decision.action).toBe("apply");
  });

  it("refuses on confirmed pdf md5 mismatch — refuses to guess when files exist but differ", () => {
    // Simulate via a hand-built snapshot (safeMd5 needs real files — decideDedupe
    // is pure and only reads the pdfHashesMatch field, so this exercises the
    // guard in isolation without touching disk).
    const snap: DedupeSnapshot = {
      source: {
        found: true,
        actionCode: "DPM",
        sortKey: "2025-Q4",
        periodYear: 2025,
        periodQuarter: 4,
        refineStatus: "PENDING",
        confirmStatus: "PENDING",
        pdfPath: "/tmp/a.pdf",
        refinedUnitsCount: 0,
      },
      target: {
        found: true,
        actionCode: "DPM",
        sortKey: "2026-Q1",
        periodYear: 2026,
        periodQuarter: 1,
        refineStatus: "PENDING",
        confirmStatus: "PENDING",
        pdfPath: "/tmp/b.pdf",
        refinedUnitsCount: 0,
      },
      pdfHashesMatch: false,
    };
    const decision = decideDedupe(snap);
    expect(decision.action).toBe("refuse_pdf_mismatch");
  });

  it("safeMd5 returns null for a missing file (never throws)", () => {
    expect(safeMd5("/definitely/does/not/exist.pdf")).toBeNull();
    expect(safeMd5(null)).toBeNull();
  });
});

// ── Tests: apply mechanics ──────────────────────────────────────────────────

describe("dedupe-mislabeled-bctc-period — apply mechanics", () => {
  it("reparentRefinedUnits moves every row from source to target report_id", () => {
    const db = openTestDb();
    insertReport(db, { id: SOURCE_ID });
    insertReport(db, { id: TARGET_ID, sortKey: "2026-Q1", year: 2026, quarter: 1 });
    insertRefinedUnits(db, SOURCE_ID, 22);

    const moved = reparentRefinedUnits(db, SOURCE_ID, TARGET_ID);
    expect(moved).toBe(22);

    const sourceCount = db.query<{ c: number }, [string]>("SELECT COUNT(*) as c FROM bctc_refined_units WHERE report_id = ?").get(SOURCE_ID);
    const targetCount = db.query<{ c: number }, [string]>("SELECT COUNT(*) as c FROM bctc_refined_units WHERE report_id = ?").get(TARGET_ID);
    expect(sourceCount?.c).toBe(0);
    expect(targetCount?.c).toBe(22);
  });

  it("deleteReportRow removes exactly the source financial_reports row", () => {
    const db = openTestDb();
    insertReport(db, { id: SOURCE_ID });
    insertReport(db, { id: TARGET_ID, sortKey: "2026-Q1", year: 2026, quarter: 1 });

    const deleted = deleteReportRow(db, SOURCE_ID);
    expect(deleted).toBe(1);

    const remaining = db.query<{ id: string }, [string]>("SELECT id FROM financial_reports WHERE id = ?").get(SOURCE_ID);
    expect(remaining).toBeNull();
    const targetStillThere = db.query<{ id: string }, [string]>("SELECT id FROM financial_reports WHERE id = ?").get(TARGET_ID);
    expect(targetStillThere).not.toBeNull();
  });

  it("resetFreedQueueRow resets the exact (action_code, year, quarter) row to pending/0/NULL/NULL", () => {
    const db = openTestDb();
    insertQueueRow(db, { actionCode: "DPM", year: 2025, quarter: "Q4", status: "done", sourceUrl: "https://wrong.example/DPM_Q1_2026.pdf", attempts: 1 });
    insertQueueRow(db, { actionCode: "DPM", year: 2026, quarter: "Q1", status: "done" }); // untouched sibling row

    const changed = resetFreedQueueRow(db, { actionCode: "DPM", periodYear: 2025, periodQuarter: 4 });
    expect(changed).toBe(1);

    const freed = db
      .query<{ status: string; attempts: number; source_url: string | null; last_attempt: string | null }, [string, number, string]>(
        "SELECT status, attempts, source_url, last_attempt FROM bctc_vps_queue WHERE action_code = ? AND period_year = ? AND period_quarter = ?",
      )
      .get("DPM", 2025, "Q4");
    expect(freed?.status).toBe("pending");
    expect(freed?.attempts).toBe(0);
    expect(freed?.source_url).toBeNull();
    expect(freed?.last_attempt).toBeNull();

    // Sibling (target's own queue row) is untouched.
    const sibling = db
      .query<{ status: string }, [string, number, string]>(
        "SELECT status FROM bctc_vps_queue WHERE action_code = ? AND period_year = ? AND period_quarter = ?",
      )
      .get("DPM", 2026, "Q1");
    expect(sibling?.status).toBe("done");
  });

  it("full apply flow: source deleted, units on target, freed queue row pending — matches the live DPM incident shape", () => {
    const db = openTestDb();
    insertReport(db, { id: SOURCE_ID, sortKey: "2025-Q4", year: 2025, quarter: 4 });
    insertReport(db, { id: TARGET_ID, sortKey: "2026-Q1", year: 2026, quarter: 1 });
    insertRefinedUnits(db, SOURCE_ID, 22);
    insertQueueRow(db, { actionCode: "DPM", year: 2025, quarter: "Q4", status: "done" });

    const before = readDedupeSnapshot(db, SOURCE_ID, TARGET_ID);
    const decision = decideDedupe(before);
    expect(decision.action).toBe("apply");

    reparentRefinedUnits(db, SOURCE_ID, TARGET_ID);
    deleteReportRow(db, SOURCE_ID);
    resetFreedQueueRow(db, { actionCode: before.source.actionCode!, periodYear: before.source.periodYear!, periodQuarter: before.source.periodQuarter! });

    const after = readDedupeSnapshot(db, SOURCE_ID, TARGET_ID);
    expect(after.source.found).toBe(false);
    expect(after.target.refinedUnitsCount).toBe(22);

    const freedQueue = db
      .query<{ status: string }, [string, number, string]>(
        "SELECT status FROM bctc_vps_queue WHERE action_code = ? AND period_year = ? AND period_quarter = ?",
      )
      .get("DPM", 2025, "Q4");
    expect(freedQueue?.status).toBe("pending");

    // Idempotency: re-running the decision now sees source absent -> noop.
    const secondDecision = decideDedupe(after);
    expect(secondDecision.action).toBe("noop_source_absent");
  });
});
