Bun.env["DB_PATH"] = ":memory:";
/**
 * FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP (part 2 — durable write-back fix)
 *
 * Incident: an unattended reparse/reprocess wrote back (a) corrupt financials
 * (total_assets=0) AND (b) a `published_at` (NGÀY NỘP filing date) equal to
 * the processing day, over previously-good stored BCTC reports — 16
 * watchlist tickers corrupted 2026-07-19/07-20.
 *
 * Root cause: TWO independent writer functions to `financial_reports`
 * (`parseBctcReport.ts::storeReport()` and
 * `bctc/newsChainFallback.ts::tryNewsChainFallback()`) both (1) always wrote
 * `published_at` from the current-call timestamp rather than the real filing
 * date, and (2) unconditionally overwrote EVERY column — including
 * previously-good financial scalars — via `ON CONFLICT ... DO UPDATE SET`
 * regardless of whether the new extraction was worse than what was already
 * stored.
 *
 * This suite proves, for BOTH writers:
 *   AC-1: `published_at` is immutable after the first insert — a re-parse
 *         (even one that supplies a fresh/different published date) never
 *         changes the stored value.
 *   AC-2 (arm b1): a failed/corrupt extraction (total_assets <= 0) never
 *         overwrites a previously-good stored report (existing
 *         total_assets > 0) — the write is skipped entirely and the
 *         existing good row survives byte-for-byte.
 *   AC-3 (non-regression): a genuinely BETTER re-parse (new total_assets > 0,
 *         same or different value) still updates the servable scalar columns
 *         normally — the guard only blocks total_assets<=0 writes, not
 *         ordinary re-parse-with-good-data.
 *
 * AC-2b (arm b2, po_acceptance_reconciliation_20260721T1649, revised
 * 2026-07-21T16:49Z) — parseBctcReport.ts::storeReport() ONLY: a failed/
 * corrupt extraction (total_assets <= 0) for a ticker with NO PRIOR STORED
 * REPORT never CREATES a new row — the ticker stays ABSENT ("Chưa có dữ
 * liệu BCTC"), never a total_assets=0 row. This is the arm the original
 * guard MISSED (it only ever evaluated `existingGoodRow && ...`, so with no
 * existing row the condition never fired) and the ONLY transition PO
 * confirmed as actually observed in the 16-ticker cohort: ABSENT ->
 * manufactured zero-row, not good -> corrupt. Scoped to storeReport() only
 * — this is the writer bctcReparseJob's pipeline always exercises
 * (bctcReparseJob -> fetchParseAndStoreBctc -> parseBctcReport ->
 * storeReport runs unconditionally on every reparse). The sibling
 * tryNewsChainFallback() writer shares the same total_assets=0 fingerprint
 * in principle, but is currently production-unreachable
 * (`enableBctcFallback` defaults false and is never set true outside
 * tests — grep-verified) and extending the same unconditional guard there
 * was tried and reverted: it breaks the still-active
 * 1294b-bctc-fallback.test.ts feature suite (4 tests) and
 * FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts (2 tests). Left as a
 * known, reported gap for a follow-up scope decision rather than folded in
 * here — see AC-1/normal-path test below in the tryNewsChainFallback()
 * describe block, unchanged from before this task.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { parseBctcReport } from "../application/usecases/parseBctcReport.js";
import { tryNewsChainFallback } from "../application/usecases/bctc/newsChainFallback.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import type { FiscalPeriod } from "../../bctc-schema.js";

function period(actionCode: string, year = 2026): FiscalPeriod {
  return {
    year,
    quarter: 1,
    periodType: "Q1",
    startDate: `${year}-01-01`,
    endDate: `${year}-03-31`,
    sortKey: `${year}-Q1-${actionCode}`,
  };
}

/** Full, well-formed BCTC text — balance sheet + income statement + cash flow. */
function fullText(): string {
  return `
BÁO CÁO TÀI CHÍNH QUÝ 1/2026

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

/**
 * PARTIAL failure text — balance sheet section entirely removed, income
 * statement + cash flow intact. Reproduces the exact live-incident
 * fingerprint: total_assets=0 (nothing to extract) while OTHER key fields
 * are non-zero (extraction_confidence lands in the 0.3-0.8 range, NOT the
 * literal 0.0 the pre-existing 1196 zero-confidence guard already catches).
 */
function partialFailureText(): string {
  return `
BÁO CÁO TÀI CHÍNH QUÝ 1/2026

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

type Row = {
  total_assets: number | null;
  published_at: string | null;
  parsed_at: string;
};

function readRow(actionCode: string, sortKey: string): Row | null {
  return getDb()
    .query<Row, [string, string]>(
      "SELECT total_assets, published_at, parsed_at FROM financial_reports WHERE action_code = ? AND sort_key = ?",
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

describe("FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP — parseBctcReport.ts::storeReport()", () => {
  const ACTION_CODE = "NGAYNOP1";
  const P = period(ACTION_CODE);

  it("AC-1: published_at is set on first insert and is NOT the caller's parsedAt when a real filing date is supplied", async () => {
    const realFilingDate = "2026-04-29T03:00:00.000Z"; // real SSC filing date, NOT "today"
    await parseBctcReport({
      rawText: fullText(),
      actionCode: ACTION_CODE,
      period: P,
      publishedAt: realFilingDate,
      _telegramBugFn: async () => true,
    });

    const row = readRow(ACTION_CODE, P.sortKey);
    expect(row).not.toBeNull();
    expect(row!.total_assets).toBe(80_000_000);
    expect(row!.published_at).toBe(realFilingDate);
    // parsed_at (processing timestamp) is DIFFERENT from published_at (filing date) —
    // the bug conflated the two; the fix keeps them independent.
    expect(row!.parsed_at).not.toBe(realFilingDate);
  });

  it("AC-2: a partial-failure reparse (total_assets<=0) does NOT overwrite the previously-good row", async () => {
    const before = readRow(ACTION_CODE, P.sortKey)!;
    expect(before.total_assets).toBeGreaterThan(0);

    // Simulate a same-day reparse (e.g. the composition-root bootstrap hook,
    // bctcReparseJob, or a VPS re-push) supplying a fresh "today" published
    // date and a corrupt (balance-sheet-missing) extraction.
    await parseBctcReport({
      rawText: partialFailureText(),
      actionCode: ACTION_CODE,
      period: P,
      publishedAt: new Date().toISOString(), // processing-day date — the exact bug pattern
      _telegramBugFn: async () => true,
    });

    const after = readRow(ACTION_CODE, P.sortKey)!;
    // Existing good row is COMPLETELY untouched — both harms blocked in one guard.
    expect(after.total_assets).toBe(before.total_assets);
    expect(after.published_at).toBe(before.published_at);
    expect(after.parsed_at).toBe(before.parsed_at);
  });

  it("AC-2b (arm b2, po_acceptance_reconciliation_20260721T1649): a partial-failure parse for a ticker with NO PRIOR STORED REPORT does NOT create a new row — stays ABSENT", async () => {
    // This is the arm the ORIGINAL guard MISSED and the only transition PO
    // confirmed as actually observed in the 16-ticker cohort: ABSENT ->
    // manufactured zero-row (not good -> corrupt, which AC-2 above already
    // covers). No prior insert for this actionCode/period — existingGoodRow
    // is null, so the pre-fix guard condition (`existingGoodRow && ...`)
    // never evaluated and the corrupt row sailed through the INSERT.
    const NO_PRIOR_ACTION_CODE = "NGAYNOP3";
    const noPriorPeriod = period(NO_PRIOR_ACTION_CODE);

    expect(readRow(NO_PRIOR_ACTION_CODE, noPriorPeriod.sortKey)).toBeNull();

    await parseBctcReport({
      rawText: partialFailureText(), // total_assets computes to 0, confidence > 0 (not the 1196 all-zero guard)
      actionCode: NO_PRIOR_ACTION_CODE,
      period: noPriorPeriod,
      publishedAt: new Date().toISOString(),
      _telegramBugFn: async () => true,
    });

    // No row is created at all — the ticker stays ABSENT, exactly like
    // get_bctc_full's "Chưa có dữ liệu BCTC" branch (row === null), never a
    // total_assets<=0 row that would trip "[CORRUPT DATA — SKIP]" at serve time.
    expect(readRow(NO_PRIOR_ACTION_CODE, noPriorPeriod.sortKey)).toBeNull();
  });

  it("AC-1 (reprocess immutability): a normal re-parse with GOOD data and a caller-supplied fresh published date still does NOT change published_at", async () => {
    const before = readRow(ACTION_CODE, P.sortKey)!;

    await parseBctcReport({
      rawText: fullText(), // same good text — total_assets stays 80M, does not trip AC-2's guard
      actionCode: ACTION_CODE,
      period: P,
      publishedAt: new Date().toISOString(), // attacker/bug scenario: caller tries to set "today"
      _telegramBugFn: async () => true,
    });

    const after = readRow(ACTION_CODE, P.sortKey)!;
    expect(after.total_assets).toBe(80_000_000);
    // published_at is immutable post-insert — the ON CONFLICT clause never
    // touches it, regardless of what the caller supplies on reparse.
    expect(after.published_at).toBe(before.published_at);
  });

  it("AC-3 (non-regression): a genuinely different GOOD extraction still updates scalar columns normally", async () => {
    // Mirrors FIX-BCTC-D1-STABILIZE-REPORT-ID.test.ts's fixture pattern:
    // change "Doanh thu thuần" only (a scalar with no cross-statement
    // decomposition guard) rather than the balance-sheet total, which trips
    // an unrelated, legitimate domain-layer magnitude-normalization check
    // (balanceSheetExtractor.ts FIX-BCTC-MAGNITUDE-NORMALIZE) when the
    // top-line total disagrees with its own sub-component sum.
    const OTHER_ACTION_CODE = "NGAYNOP2";
    const otherPeriod = period(OTHER_ACTION_CODE);
    const v2Text = fullText().replace(
      "Doanh thu thuần                                     39.500.000",
      "Doanh thu thuần                                     60.000.000",
    );

    await parseBctcReport({
      rawText: fullText(),
      actionCode: OTHER_ACTION_CODE,
      period: otherPeriod,
      _telegramBugFn: async () => true,
    });
    const first = readRow(OTHER_ACTION_CODE, otherPeriod.sortKey)!;
    expect(first.total_assets).toBe(80_000_000);

    await parseBctcReport({
      rawText: v2Text,
      actionCode: OTHER_ACTION_CODE,
      period: otherPeriod,
      _telegramBugFn: async () => true,
    });
    // total_assets stays > 0 throughout — the guard never fires — and the
    // UPSERT still applies the new scalar (net_revenue) normally.
    const second = getDb()
      .query<{ total_assets: number; net_revenue: number }, [string, string]>(
        "SELECT total_assets, net_revenue FROM financial_reports WHERE action_code = ? AND sort_key = ?",
      )
      .get(OTHER_ACTION_CODE, otherPeriod.sortKey)!;
    expect(second.total_assets).toBe(80_000_000);
    expect(second.net_revenue).toBe(60_000_000);
  });
});

describe("FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP — bctc/newsChainFallback.ts::tryNewsChainFallback()", () => {
  const ACTION_CODE = "NGAYNOPNC";
  const YEAR = 2026;
  const QUARTER = "Q1" as const;
  const SORT_KEY = `${YEAR}-${QUARTER}`;

  function hoursAgo(h: number): string {
    return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
  }
  function daysFromNow(d: number): string {
    return new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString();
  }

  function seedTwoConfirmingSignals(): void {
    const db = getDb();
    for (const [from, to, signalType, findingData, hrsAgo] of [
      [
        "news_scout",
        "market_watcher",
        "chain_catalyst",
        JSON.stringify({
          event_type: "earnings",
          direction: "bullish",
          confidence: 0.8,
          affected_stocks: [ACTION_CODE],
          affected_sectors: ["retail"],
          headline: `${ACTION_CODE} Revenue Growth Outperforms Expectations`,
          source: "reuters",
          newsSentiment: 0.6,
        }),
        2,
      ],
      [
        "market_watcher",
        "alert_commander",
        "price_confirmation",
        JSON.stringify({
          price_change_pct: 2.5,
          volume_ratio: 1.8,
          confirms_direction: true,
          fully_priced: false,
          confidence: 0.75,
        }),
        1,
      ],
    ] as const) {
      db.prepare(`
        INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(from, to, signalType, ACTION_CODE, "{}", findingData, hoursAgo(hrsAgo), daysFromNow(7));
    }
  }

  beforeAll(() => {
    Bun.env["BCTC_FALLBACK_SIGNAL_MAX_AGE_DAYS"] = "30";
  });
  afterAll(() => {
    delete Bun.env["BCTC_FALLBACK_SIGNAL_MAX_AGE_DAYS"];
  });

  it("AC-2: fallback write is BLOCKED and does not overwrite a previously-good stored report", async () => {
    // Seed a previously-good report directly (as if a real OCR parse had
    // succeeded earlier) — total_assets > 0, a real filing date.
    const db = getDb();
    const goodId = "seed-good-" + ACTION_CODE;
    const realFilingDate = "2026-04-30T02:00:00.000Z";
    db.prepare(`
      INSERT INTO financial_reports (
        id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type, period_start, period_end, sort_key,
        published_at, parsed_at, extraction_confidence,
        total_assets, equity_total,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
        validation_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      goodId, ACTION_CODE, "Seed Co", "HOSE", "other",
      YEAR, 1, QUARTER, `${YEAR}-01-01`, `${YEAR}-03-31`, SORT_KEY,
      realFilingDate, realFilingDate, 0.9,
      80_000_000, 50_000_000,
      "{}", "{}", "{}", "{}",
      "passed",
    );

    seedTwoConfirmingSignals();

    const result = await tryNewsChainFallback(ACTION_CODE, YEAR, QUARTER);

    // Fallback refuses to write — reports itself as not-applied.
    expect(result.fallback).toBe(false);
    expect(result.reason).toContain("preserved");

    const row = readRow(ACTION_CODE, SORT_KEY)!;
    expect(row).not.toBeNull();
    // Existing good row is COMPLETELY untouched — total_assets stays 80M
    // (never clobbered by the fallback's hardcoded 0), published_at stays
    // the real filing date (never flipped to the processing day).
    expect(row.total_assets).toBe(80_000_000);
    expect(row.published_at).toBe(realFilingDate);
  });

  it("AC-1/normal path: fallback DOES write (and is immutable on re-run) when no prior good row exists", async () => {
    // Scope note (po_acceptance_reconciliation_20260721T1649, revised
    // 2026-07-21T16:49Z): arm (b2) — "no prior row -> never manufacture a
    // corrupt row" — is fixed for parseBctcReport.ts::storeReport() above
    // (the actual live write path: bctcReparseJob -> fetchParseAndStoreBctc
    // -> parseBctcReport -> storeReport always runs on every reparse). This
    // writer (tryNewsChainFallback) is a SEPARATE, currently
    // production-unreachable path — `enableBctcFallback` defaults false and
    // is never set true anywhere outside tests (grep-verified), so it is
    // NOT part of the 16-ticker incident's write-back path. Extending the
    // same unconditional (b2) guard here was tried and reverted: it breaks
    // the still-active 1294b-bctc-fallback.test.ts feature suite (4 tests)
    // and FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts (2 tests) — a real
    // scope-widening tradeoff, not this row's mechanism. Left as a known,
    // reported gap for a follow-up decision rather than folded in here.
    const OTHER_ACTION_CODE = "NGAYNOPNC2";
    const db = getDb();
    const db2Signals = () => {
      for (const [from, to, signalType, findingData, hrsAgo] of [
        [
          "news_scout",
          "market_watcher",
          "chain_catalyst",
          JSON.stringify({
            event_type: "earnings",
            direction: "bullish",
            confidence: 0.8,
            affected_stocks: [OTHER_ACTION_CODE],
            affected_sectors: ["retail"],
            headline: `${OTHER_ACTION_CODE} Revenue Growth Outperforms Expectations`,
            source: "reuters",
            newsSentiment: 0.6,
          }),
          2,
        ],
        [
          "market_watcher",
          "alert_commander",
          "price_confirmation",
          JSON.stringify({
            price_change_pct: 2.5,
            volume_ratio: 1.8,
            confirms_direction: true,
            fully_priced: false,
            confidence: 0.75,
          }),
          1,
        ],
      ] as const) {
        db.prepare(`
          INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(from, to, signalType, OTHER_ACTION_CODE, "{}", findingData, hoursAgo(hrsAgo), daysFromNow(7));
      }
    };
    db2Signals();

    const first = await tryNewsChainFallback(OTHER_ACTION_CODE, YEAR, QUARTER);
    expect(first.fallback).toBe(true);
    const row1 = readRow(OTHER_ACTION_CODE, SORT_KEY)!;
    expect(row1.total_assets).toBe(0);
    const firstPublishedAt = row1.published_at;
    expect(firstPublishedAt).not.toBeNull();

    // Re-run — total_assets is still 0 (not > 0), so AC-2's guard does not
    // block this; the UPSERT proceeds (preserves id, per the sibling
    // FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN test) — but published_at must
    // still be immutable across this re-run.
    const second = await tryNewsChainFallback(OTHER_ACTION_CODE, YEAR, QUARTER);
    expect(second.fallback).toBe(true);
    const row2 = readRow(OTHER_ACTION_CODE, SORT_KEY)!;
    expect(row2.published_at).toBe(firstPublishedAt);
  });
});
