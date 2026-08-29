/**
 * FIX-BCTC-DATA-GAP-FAMILY U3 — period-mismatch durable quarantine + recovery
 *
 * Covers (architect brief 2026-08-28 U3, BID 2025-Q4 class, telegram 5214-5228):
 *   - U3.1 parseBctcReport writes a DURABLE quarantine row (bctc_zero_extract_blocks,
 *     reason='period-mismatch: content=<y>-Q<q>') when BctcPeriodContentMismatchError
 *     fires — previously only a debounced Telegram line existed, so the serve path
 *     returned flat "Chưa có dữ liệu BCTC" with no WHY.
 *   - U3.2 fetchParseAndStoreBctc parks the matching bctc_vps_queue row at
 *     'url_not_found' (enricher Arm-2 re-discovery path) instead of leaving it
 *     'pending' forever (the runPipeline-null loop on manual re-push).
 *   - U3.3 serve-side: buildBctcNoDataDiagnostic surfaces the quarantine reason
 *     ("period-mismatch (content 2026-Q1) — awaiting re-discovery") instead of
 *     flat no-data, while the true-absent case stays kind='absent' (caller keeps
 *     the EXACT legacy string — bctc-analyst contract).
 *
 * DI strategy: real in-memory SQLite + injected _telegramBugFn / pdfTextOverride.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { parseBctcReport } from "../application/usecases/parseBctcReport.js";
import { BctcPeriodContentMismatchError } from "../domain/services/financial-reports/periodContentExtractor.js";
import { fetchParseAndStoreBctc } from "../application/usecases/fetchParseAndStoreBctc.js";
import { buildBctcNoDataDiagnostic } from "../interface/mcp/tools/financial-reports/bctcNoDataDiagnostics.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures (mirror FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT)
// ─────────────────────────────────────────────────────────────────────────────

/** Repeated Q1-2026 boundary statements — a confident content signal for Q1-2026. */
const CLEAN_Q1_2026_DATES = `
Tại ngày 31 tháng 03 năm 2026
Từ ngày 01 tháng 01 năm 2026 đến ngày 31 tháng 03 năm 2026
Tại ngày 31 tháng 03 năm 2026
`;

/** Minimal BCTC body — enough for extractionConfidence > 0 so storeReport() proceeds. */
const MINIMAL_BCTC_BODY = `
TỔNG CỘNG TÀI SẢN                                   80.000.000
Doanh thu thuần                                     39.500.000
Lợi nhuận sau thuế                                   6.880.000
Lưu chuyển tiền thuần từ hoạt động kinh doanh        5.880.000
`;

const PERIOD_2025_Q4 = { year: 2025, quarter: 4 as const, periodType: "Q4", startDate: "2025-10-01", endDate: "2025-12-31", sortKey: "2025-Q4" };

const MISMATCH_TEXT = CLEAN_Q1_2026_DATES + MINIMAL_BCTC_BODY;

function blockedRow(
  actionCode: string,
  sortKey: string,
): { attempt_count: number; reason: string; status: string } | null {
  return getDb()
    .query<{ attempt_count: number; reason: string; status: string }, [string, string]>(
      "SELECT attempt_count, reason, status FROM bctc_zero_extract_blocks WHERE action_code = ? AND sort_key = ?",
    )
    .get(actionCode, sortKey) ?? null;
}

function queueRow(
  code: string,
  year: number,
  quarter: string,
): { status: string; attempts: number } | undefined {
  return getDb()
    .query<{ status: string; attempts: number }, [string, number, string]>(
      `SELECT status, attempts FROM bctc_vps_queue
       WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
    )
    .get(code, year, quarter) ?? undefined;
}

beforeAll(async () => {
  await initDatabase();
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});

// ─────────────────────────────────────────────────────────────────────────────
// U3.1 — durable quarantine record on mismatch
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-DATA-GAP-FAMILY U3.1 — durable period-mismatch quarantine", () => {
  it("writes a bctc_zero_extract_blocks row with the content-derived period when the guard fires", async () => {
    const actionCode = "BID";
    try {
      await parseBctcReport({
        rawText: MISMATCH_TEXT,
        actionCode,
        period: PERIOD_2025_Q4 as never,
        _telegramBugFn: async () => true,
      });
      throw new Error("expected BctcPeriodContentMismatchError");
    } catch (err) {
      expect(err).toBeInstanceOf(BctcPeriodContentMismatchError);
    }

    const row = blockedRow(actionCode, "2025-Q4");
    expect(row).not.toBeNull();
    expect(row!.reason).toContain("period-mismatch: content=2026-Q1");
    expect(row!.attempt_count).toBe(1);
    expect(row!.status).toBe("active");
  });

  it("increments attempt_count on repeated mismatches (bounded re-attempt signal)", async () => {
    const actionCode = "BIDREP";
    for (let i = 0; i < 3; i++) {
      try {
        await parseBctcReport({
          rawText: MISMATCH_TEXT,
          actionCode,
          period: PERIOD_2025_Q4 as never,
          _telegramBugFn: async () => true,
        });
      } catch { /* expected */ }
    }
    const row = blockedRow(actionCode, "2025-Q4");
    expect(row?.attempt_count).toBe(3);
  });

  it("does NOT write a quarantine record for a correctly-labelled filing", async () => {
    const actionCode = "BIDOK";
    const report = await parseBctcReport({
      rawText: CLEAN_Q1_2026_DATES + MINIMAL_BCTC_BODY,
      actionCode,
      period: { year: 2026, quarter: 1 as const, periodType: "Q1", startDate: "2026-01-01", endDate: "2026-03-31", sortKey: "2026-Q1" },
      _telegramBugFn: async () => true,
    });
    expect(report.period.sortKey).toBe("2026-Q1");
    expect(blockedRow(actionCode, "2026-Q1")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// U3.2 — queue recovery: no silent 'pending' dead-end on re-push
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-DATA-GAP-FAMILY U3.2 — queue row parked at url_not_found on mismatch", () => {
  it("marks the bctc_vps_queue row url_not_found instead of leaving it pending", async () => {
    const actionCode = "BIDQ";
    // Seed the queue row exactly as the live BID 2025-Q4 shape (pending, attempts=0).
    getDb().prepare(`
      INSERT OR REPLACE INTO bctc_vps_queue
        (action_code, period_year, period_quarter, status, source_url, attempts)
      VALUES (?, ?, ?, 'pending', NULL, 0)
    `).run(actionCode, 2025, "Q4");

    const result = await fetchParseAndStoreBctc({
      actionCode,
      year: 2025,
      quarter: "Q4",
      enableBctcFallback: false,
      pdfUrl: "https://owa.hnx.vn/ftp/x/000000015833101_VI_BaoCaoQuanTri_2025.pdf",
      pdfTextOverride: MISMATCH_TEXT,
      insertAnalysisFn: async () => {},
    });

    expect(result).toBeNull();

    const row = queueRow(actionCode, 2025, "Q4");
    expect(row?.status).toBe("url_not_found");
    expect(row?.attempts).toBe(1); // attempts+1, mirroring markUrlNotFoundStmt
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// U3.3 — serve-side quarantine reason vs true-absent
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-DATA-GAP-FAMILY U3.3 — serve-side quarantine reason", () => {
  it("returns the period-mismatch reason when a quarantine record exists", () => {
    const actionCode = "BIDSERVE";
    getDb().prepare(`
      INSERT OR REPLACE INTO bctc_zero_extract_blocks
        (action_code, sort_key, attempt_count, last_blocked_at, reason, status)
      VALUES (?, '2025-Q4', 2, datetime('now'),
              'period-mismatch: content=2026-Q1 (supplied 2025-Q4, 6 content matches vs 4 runner-up)',
              'active')
    `).run(actionCode);

    const diag = buildBctcNoDataDiagnostic(getDb(), actionCode, "2025-Q4");
    expect(diag.kind).toBe("blocked");
    expect(diag.text).toContain("period-mismatch (content 2026-Q1)");
    expect(diag.text).toContain("awaiting re-discovery");
  });

  it("returns kind='absent' when no quarantine record exists (caller keeps the exact legacy string)", () => {
    const diag = buildBctcNoDataDiagnostic(getDb(), "NOMATCH_TICKER_XYZ");
    expect(diag.kind).toBe("absent");
    expect(diag.text).toBeNull();
  });
});
