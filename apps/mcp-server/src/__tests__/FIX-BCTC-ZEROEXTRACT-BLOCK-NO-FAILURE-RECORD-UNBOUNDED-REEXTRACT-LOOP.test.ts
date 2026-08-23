Bun.env["DB_PATH"] = ":memory:";
/**
 * FIX-BCTC-ZEROEXTRACT-BLOCK-NO-FAILURE-RECORD-UNBOUNDED-REEXTRACT-LOOP
 *
 * Incident: parseBctcReport.ts::storeReport()'s totalAssets<=0 write-block
 * guard (correct, untouched) logged a warning + fired one Telegram message
 * and `return`ed before any INSERT — no row, no queue marker, no attempt
 * counter, no dead-letter entry was persisted ANYWHERE, even though the
 * message text asserted "flagged for manual review". Every enqueuer
 * (checkSscReports.ts, the bctc_vps_queue pull/enrich cycle,
 * bctcReparseJob.ts's agent_feedback loop) therefore treated "no
 * financial_reports row" as "never attempted" and re-enqueued the same
 * (ticker, quarter) pair forever: 8/8 pairs blocked on 08-22 reappeared on
 * 08-23, GEX 2025-Q4 fired 4x in 36 minutes, pdf-extractor sat at 119-206%
 * CPU re-OCRing the same PDFs.
 *
 * This suite proves:
 *   AC-1: a blocked zero-extraction persists a durable failure record keyed
 *         on (action_code, sort_key) carrying attempt_count +
 *         last_blocked_at + reason (bctc_zero_extract_blocks table).
 *   AC-2: attempt_count past BCTC_ZERO_EXTRACT_DEAD_AT_ATTEMPTS dead-letters
 *         the pair — mirrors bctcReparseJob.ts:776-803's agent_feedback
 *         attempt-count + dead-letter pattern.
 *   AC-3: replay the 8 live-incident pairs (FRT 2024-Q4, FRT 2025-Q4, FRT
 *         2026-Q1, KDH 2025-Q4, KDH 2026-Q1, SHB 2025-Q4, VJC 2025-Q1, GEX
 *         2025-Q3) — each attempted at most N times, then STOPS: once
 *         dead-lettered, fetchParseAndStoreBctc.ts and pushBctcExtraction.ts
 *         both short-circuit BEFORE any further SSC/OCR/parse work, which is
 *         the actual loop-breaker (storeReport's own guard can only refuse
 *         the INSERT — it cannot stop itself from being called again).
 *   AC-4: the block message never claims "flagged for manual review" unless
 *         the failure record was actually written.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { parseBctcReport } from "../application/usecases/parseBctcReport.js";
import { fetchParseAndStoreBctc } from "../application/usecases/fetchParseAndStoreBctc.js";
import { triggerPushBctcExtraction } from "../scheduler/financial-reports/pushBctcExtraction.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  isZeroExtractDeadLettered,
  BCTC_ZERO_EXTRACT_DEAD_AT_ATTEMPTS,
} from "../infrastructure/db/bctcZeroExtractBlocklist.js";
import { buildPeriod } from "../../bctc-schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PARTIAL failure text — balance sheet section entirely removed, income
 * statement + cash flow intact. Reproduces the exact live-incident
 * fingerprint: total_assets=0 while other fields are non-zero
 * (extraction_confidence lands > 0, NOT the separate all-zero 1196 guard).
 * Mirrors FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP.test.ts's
 * partialFailureText(), parameterized by year/quarter.
 */
function zeroExtractText(year: number, quarter: number): string {
  return `
BÁO CÁO TÀI CHÍNH QUÝ ${quarter}/${year}

BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Doanh thu bán hàng và cung cấp dịch vụ              40.000.000
Giảm trừ doanh thu                                     500.000
Doanh thu thuần                                     39.500.000
Giá vốn hàng bán                                    25.000.000
Lợi nhuận gộp                                       14.500.000
Lợi nhuận thuần từ hoạt động kinh doanh              8.500.000
Lợi nhuận trước thuế                                 8.600.000
Thuế TNDN hiện hành                                  1.720.000
Lợi nhuận sau thuế                                   6.880.000

BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Lưu chuyển tiền thuần từ hoạt động kinh doanh        5.880.000
Lưu chuyển tiền thuần trong kỳ                       2.880.000
Tiền và tương đương tiền đầu kỳ                      2.120.000
Tiền và tương đương tiền cuối kỳ                     5.000.000
`;
}

/** Otherwise-VALID text (full balance sheet + income + cash flow). */
function goodText(year: number, quarter: number): string {
  return `
BÁO CÁO TÀI CHÍNH QUÝ ${quarter}/${year}

BẢNG CÂN ĐỐI KẾ TOÁN
Tài sản ngắn hạn                                    50.000.000
  Tiền và tương đương tiền                            5.000.000
  Đầu tư tài chính ngắn hạn                          10.000.000
  Phải thu ngắn hạn                                  20.000.000
  Hàng tồn kho                                       12.000.000
  Tài sản ngắn hạn khác                               3.000.000
Tài sản dài hạn                                     30.000.000
  Tài sản cố định                                    25.000.000
  Đầu tư tài chính dài hạn                            5.000.000
TỔNG CỘNG TÀI SẢN                                   80.000.000

Nợ ngắn hạn                                         20.000.000
  Vay và nợ thuê tài chính ngắn hạn                   8.000.000
  Phải trả người bán ngắn hạn                         6.000.000
  Thuế và các khoản phải nộp                          1.000.000
  Người mua trả tiền trước                            2.000.000
  Nợ ngắn hạn khác                                   3.000.000
Nợ dài hạn                                          10.000.000
  Vay và nợ thuê tài chính dài hạn                   10.000.000
Nợ phải trả                                         30.000.000
Vốn chủ sở hữu                                      50.000.000
  Vốn góp của chủ sở hữu                             30.000.000
  Thặng dư vốn cổ phần                                5.000.000
  Lợi nhuận sau thuế chưa phân phối                  15.000.000
TỔNG CỘNG NGUỒN VỐN                                 80.000.000

BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Doanh thu bán hàng và cung cấp dịch vụ              40.000.000
Giảm trừ doanh thu                                     500.000
Doanh thu thuần                                     39.500.000
Giá vốn hàng bán                                    25.000.000
Lợi nhuận gộp                                       14.500.000
Doanh thu hoạt động tài chính                         1.000.000
Chi phí tài chính                                     2.000.000
  Chi phí lãi vay                                    1.500.000
Chi phí bán hàng                                     3.000.000
Chi phí quản lý doanh nghiệp                         2.000.000
Lợi nhuận thuần từ hoạt động kinh doanh              8.500.000
Thu nhập khác                                          200.000
Chi phí khác                                           100.000
Lợi nhuận khác                                        100.000
Lợi nhuận trước thuế                                 8.600.000
Thuế TNDN hiện hành                                  1.720.000
Lợi nhuận sau thuế                                   6.880.000
Lãi cơ bản trên cổ phiếu                                 3.440

BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Lợi nhuận trước thuế                                 8.600.000
Khấu hao TSCĐ                                        1.500.000
Thay đổi vốn lưu động                               (1.000.000)
Tiền lãi vay đã trả                                 (1.500.000)
Thuế TNDN đã nộp                                    (1.720.000)
Lưu chuyển tiền thuần từ hoạt động kinh doanh        5.880.000
Tiền chi mua sắm TSCĐ                               (3.000.000)
Lưu chuyển tiền thuần từ hoạt động đầu tư           (3.000.000)
Tiền vay nhận được                                   5.000.000
Tiền trả nợ gốc vay                                 (4.000.000)
Cổ tức đã trả                                       (1.000.000)
Lưu chuyển tiền thuần từ hoạt động tài chính           (0)
Lưu chuyển tiền thuần trong kỳ                       2.880.000
Tiền và tương đương tiền đầu kỳ                      2.120.000
Tiền và tương đương tiền cuối kỳ                     5.000.000
`;
}

function blockedRow(
  actionCode: string,
  sortKey: string,
): { attempt_count: number; last_blocked_at: string; reason: string; status: string } | null {
  return getDb()
    .query<
      { attempt_count: number; last_blocked_at: string; reason: string; status: string },
      [string, string]
    >(
      "SELECT attempt_count, last_blocked_at, reason, status FROM bctc_zero_extract_blocks WHERE action_code = ? AND sort_key = ?",
    )
    .get(actionCode, sortKey);
}

function financialRow(actionCode: string, sortKey: string): { total_assets: number } | null {
  return getDb()
    .query<{ total_assets: number }, [string, string]>(
      "SELECT total_assets FROM financial_reports WHERE action_code = ? AND sort_key = ?",
    )
    .get(actionCode, sortKey);
}

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});

describe("AC-1: durable failure record on a blocked zero-extraction", () => {
  it("persists attempt_count/last_blocked_at/reason keyed on (action_code, sort_key), no financial_reports row", async () => {
    const actionCode = "ZXAC1";
    const p = buildPeriod(2026, 1);

    await parseBctcReport({
      rawText: zeroExtractText(2026, 1),
      actionCode,
      period: p,
      _telegramBugFn: async () => true,
    });

    const row = blockedRow(actionCode, p.sortKey);
    expect(row).not.toBeNull();
    expect(row!.attempt_count).toBe(1);
    expect(row!.status).toBe("active");
    expect(row!.reason.length).toBeGreaterThan(0);
    expect(row!.last_blocked_at.length).toBeGreaterThan(0);
    expect(financialRow(actionCode, p.sortKey)).toBeNull();
  });
});

describe("AC-2: attempt_count past threshold dead-letters the pair", () => {
  it(`dead-letters at attempt ${BCTC_ZERO_EXTRACT_DEAD_AT_ATTEMPTS} (mirrors bctcReparseJob.ts DEAD_AT_ATTEMPTS shape)`, async () => {
    const actionCode = "ZXAC2";
    const p = buildPeriod(2026, 2);

    for (let i = 0; i < BCTC_ZERO_EXTRACT_DEAD_AT_ATTEMPTS; i++) {
      await parseBctcReport({
        rawText: zeroExtractText(2026, 2),
        actionCode,
        period: p,
        _telegramBugFn: async () => true,
      });
    }

    const row = blockedRow(actionCode, p.sortKey);
    expect(row!.attempt_count).toBe(BCTC_ZERO_EXTRACT_DEAD_AT_ATTEMPTS);
    expect(row!.status).toBe("dead");
    expect(isZeroExtractDeadLettered(getDb(), actionCode, p.sortKey)).toBe(true);
  });
});

describe("AC-3: replay the 8 live-incident pairs — bounded attempts, then STOPS", () => {
  const PAIRS: Array<{ ticker: string; year: number; quarter: 1 | 2 | 3 | 4 }> = [
    { ticker: "FRT", year: 2024, quarter: 4 },
    { ticker: "FRT", year: 2025, quarter: 4 },
    { ticker: "FRT", year: 2026, quarter: 1 },
    { ticker: "KDH", year: 2025, quarter: 4 },
    { ticker: "KDH", year: 2026, quarter: 1 },
    { ticker: "SHB", year: 2025, quarter: 4 },
    { ticker: "VJC", year: 2025, quarter: 1 },
    { ticker: "GEX", year: 2025, quarter: 3 },
  ];
  const REPLAYS = BCTC_ZERO_EXTRACT_DEAD_AT_ATTEMPTS + 3;

  it(`each of the 8 pairs replayed ${REPLAYS}x caps at attempt_count=${BCTC_ZERO_EXTRACT_DEAD_AT_ATTEMPTS} and never writes financial_reports`, async () => {
    for (const { ticker, year, quarter } of PAIRS) {
      const p = buildPeriod(year, quarter);
      for (let i = 0; i < REPLAYS; i++) {
        await parseBctcReport({
          rawText: zeroExtractText(year, quarter),
          actionCode: ticker,
          period: p,
          _telegramBugFn: async () => true,
        });
      }
      const row = blockedRow(ticker, p.sortKey);
      expect(row).not.toBeNull();
      expect(row!.status).toBe("dead");
      expect(financialRow(ticker, p.sortKey)).toBeNull();
    }
  });

  it("GEX 2025-Q3: once dead-lettered, fetchParseAndStoreBctc STOPS re-attempting — returns null even with otherwise-VALID text", async () => {
    const p = buildPeriod(2025, 3);
    expect(isZeroExtractDeadLettered(getDb(), "GEX", p.sortKey)).toBe(true);

    const result = await fetchParseAndStoreBctc({
      actionCode: "GEX",
      year: 2025,
      quarter: "Q3",
      pdfUrl: "https://example.com/gex-2025-q3.pdf", // bypasses SSC listing
      pdfTextOverride: goodText(2025, 3), // otherwise fully VALID text
    });

    // Short-circuited BEFORE Step 3 (parseBctcReport) ever ran — proves the
    // loop-breaker, not just the write-block (which would have let good text
    // through and created a row).
    expect(result).toBeNull();
    expect(financialRow("GEX", p.sortKey)).toBeNull();
  });

  it("pushBctcExtraction.triggerPushBctcExtraction also short-circuits BEFORE any OCR tier once dead-lettered (stops the pdf-extractor CPU burn)", async () => {
    let ocrTierCalls = 0;

    const result = await triggerPushBctcExtraction({
      actionCode: "GEX",
      year: 2025,
      quarter: "Q3",
      filePath: "/data/pdfs/GEX_2025_Q3.pdf",
      filename: "GEX_2025_Q3.pdf",
      pdfUrl: "https://example.com/gex-2025-q3.pdf",
      deps: {
        extractViaService: async () => {
          ocrTierCalls++;
          return null;
        },
        extractViaServicePdfPath: async () => {
          ocrTierCalls++;
          return null;
        },
        runPipeline: async () => null,
        isDeadLettered: (actionCode: string, sortKey: string) =>
          isZeroExtractDeadLettered(getDb(), actionCode, sortKey),
      },
    });

    expect(ocrTierCalls).toBe(0);
    expect(result.outcome).toBe("failed");
    expect(result.outcome === "failed" ? result.reason : "").toContain("dead-lettered");
  });
});

describe("AC-4: block message never claims 'flagged for manual review' unless the record was actually written", () => {
  it("normal write success → message DOES say 'flagged for manual review'", async () => {
    const actionCode = "ZXAC4A";
    const p = buildPeriod(2026, 3);
    const msgs: string[] = [];

    await parseBctcReport({
      rawText: zeroExtractText(2026, 3),
      actionCode,
      period: p,
      _telegramBugFn: async (m: string) => {
        msgs.push(m);
        return true;
      },
    });

    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain("flagged for manual review");
    expect(msgs[0]).not.toContain("NOT flagged for manual review");
  });

  it("durable write failure (table missing) → message does NOT claim 'flagged for manual review'", async () => {
    const actionCode = "ZXAC4B";
    const p = buildPeriod(2026, 4);
    const db = getDb();
    db.exec("DROP TABLE bctc_zero_extract_blocks");

    try {
      const msgs: string[] = [];
      await parseBctcReport({
        rawText: zeroExtractText(2026, 4),
        actionCode,
        period: p,
        _telegramBugFn: async (m: string) => {
          msgs.push(m);
          return true;
        },
      });

      expect(msgs.length).toBe(1);
      expect(msgs[0]).toContain("NOT flagged for manual review");
      expect(msgs[0]).toContain("UNRECORDED");
    } finally {
      // Restore for any later test file sharing this :memory: DB instance —
      // same DDL as schema-financial-reports.ts.
      db.exec(`
        CREATE TABLE IF NOT EXISTS bctc_zero_extract_blocks (
          action_code       TEXT    NOT NULL,
          sort_key          TEXT    NOT NULL,
          attempt_count     INTEGER NOT NULL DEFAULT 1,
          last_blocked_at   TEXT    NOT NULL DEFAULT (datetime('now')),
          reason            TEXT    NOT NULL DEFAULT '',
          status            TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','dead')),
          first_blocked_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (action_code, sort_key)
        )
      `);
    }
  });
});
