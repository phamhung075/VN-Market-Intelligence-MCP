Bun.env["DB_PATH"] = ":memory:";
/**
 * FIX-BCTC-1345B-REPORT-BATCH
 *
 * Suppress a repeat [BCTC-1345b] Telegram BUG alert for a ticker+period that
 * is ALREADY tracked as an open low-confidence quality issue.
 *
 * Root cause verified before writing this fix (do not confuse with Task
 * 1792): 1792's `bctc_signal_debounce` only covers a 1-HOUR retry-storm
 * window (10 calls in 3 minutes). `bctcReparseJob`
 * (scheduler/financial-reports/bctcReparseJob.ts) runs DAILY and retries the
 * SAME still-broken backlog of low-confidence tickers — 24h apart, well
 * outside the 1h window — so each daily cycle re-fires the SAME alert for an
 * issue that was already known/tracked the day before
 * (financial_reports.validation_status was already 'low_confidence'). PO
 * backlog note 2026-06-07: "backlog drain produced 6 reports today ... 11
 * more duplicate reports [next day], all same low-confidence-guard class,
 * resolved monitoring this tick. Noise recurs every analysis cycle until
 * batching/suppression ships." — "every analysis cycle" = this daily
 * reparse cadence, not a same-minute retry storm (1792 already fixed that).
 *
 * Fix: before firing the alert, check whether financial_reports already has
 * validation_status='low_confidence' for this exact (action_code, sort_key)
 * FROM A PRIOR parse. If so, this run is not new information — suppress.
 * The row self-closes automatically the moment a later re-parse produces a
 * different validation_status (e.g. a successful fix).
 */

import { describe, it, expect, mock, beforeEach, afterEach, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Telegram mock — captures all bug channel messages
// ─────────────────────────────────────────────────────────────────────────────

// Load real telegram module via cache-bust (bypasses any prior mock.module stub
// left behind by earlier test files in the same Bun process).
const _realModBatch = await import(
  Bun.resolveSync("../infrastructure/notifiers/telegram.js", import.meta.dir) + "?isolate=1345b-batch"
);

const bugMessages: string[] = [];

mock.module("../infrastructure/notifiers/telegram.js", () => ({
  sendTelegramWork: () => Promise.resolve(true),
  sendTelegramMarket: () => Promise.resolve(true),
  sendTelegramBug: (msg: string) => {
    bugMessages.push(msg);
    return Promise.resolve(true);
  },
  sendTelegram: () => Promise.resolve(true),
}));

beforeEach(async () => {
  bugMessages.length = 0;
  closeDb();
  await initDatabase();
});

afterEach(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

import type { FiscalPeriod } from "../../bctc-schema.js";

const PERIOD: FiscalPeriod = {
  year: 2025,
  quarter: 4,
  periodType: "Q4",
  startDate: "2025-10-01",
  endDate: "2025-12-31",
  sortKey: "2025-Q4",
};

/**
 * Minimal corrupt BCTC text that forces composite_confidence <= 0.3.
 * Identical corruption pattern to the 1792 test fixture: operatingProfit
 * (50000) >> netRevenue (5000) → operatingMarginRatio=10.0, which exceeds the
 * 5.0 hard-fail threshold in validateFinancialFigures → confidenceFinancial=0.
 * Balance sheet is internally consistent (2000 = 800 + 1200) so no BS
 * correction/guard path fires — the IS corruption is the sole source of the
 * low-confidence signal.
 */
const CORRUPT_BCTC_TEXT = `
BẢNG CÂN ĐỐI KẾ TOÁN
Tài sản ngắn hạn                               500
Tài sản dài hạn                               1500
TỔNG CỘNG TÀI SẢN                            2000
Nợ phải trả                                   800
Vốn chủ sở hữu                               1200
TỔNG CỘNG NGUỒN VỐN                          2000
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Doanh thu thuần                              5000
Giá vốn hàng bán                             3000
Lợi nhuận gộp                               2000
Lợi nhuận thuần từ hoạt động kinh doanh    50000
Lợi nhuận trước thuế                          620
Thuế TNDN hiện hành                           124
Lợi nhuận sau thuế                            496
BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Lưu chuyển tiền từ hoạt động kinh doanh       400
Lưu chuyển tiền từ hoạt động đầu tư          -200
Lưu chuyển tiền từ hoạt động tài chính       -100
Lưu chuyển tiền thuần trong kỳ               100
Tiền và tương đương tiền đầu kỳ              300
Tiền và tương đương tiền cuối kỳ             400
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-1345B-REPORT-BATCH — suppress re-alert on an already-open quality row", () => {
  it("REGRESSION: a daily reparse retry of the SAME already-low-confidence ticker+period (1792 debounce window expired) does NOT re-fire the Telegram alert", async () => {
    const { parseBctcReport } = await import(
      "../application/usecases/parseBctcReport.js"
    );
    const telegramFn = async (msg: string) => { bugMessages.push(msg); return true; };

    const ticker = "BATCH_A";

    // Day 1 — genuinely new low-confidence finding: alert fires exactly once.
    await parseBctcReport({
      rawText: CORRUPT_BCTC_TEXT,
      actionCode: ticker,
      period: PERIOD,
      _telegramBugFn: telegramFn,
    });
    expect(bugMessages.filter((m) => m.includes(ticker)).length).toBe(1);

    // Simulate the 1792 debounce window fully expiring — age the debounce row
    // back 2 hours, exactly what bctcReparseJob's NEXT daily run (24h later,
    // well past the 1h cooldown) would see.
    const db = getDb();
    db.exec(
      `UPDATE bctc_signal_debounce
       SET sent_at = datetime('now', '-2 hours')
       WHERE action_code = '${ticker}' AND period_key = '2025-Q4'`,
    );

    // Day 2 (bctcReparseJob's next daily retry): SAME ticker+period, STILL
    // low confidence — the parser fix did not help this one. Without this
    // task's fix this fires a SECOND alert (1792's window has expired) even
    // though the issue is already tracked — that daily re-fire is the actual
    // noise source the backlog note complains about.
    await parseBctcReport({
      rawText: CORRUPT_BCTC_TEXT,
      actionCode: ticker,
      period: PERIOD,
      _telegramBugFn: telegramFn,
    });

    expect(bugMessages.filter((m) => m.includes(ticker)).length).toBe(1);
  });

  it("a genuinely NEW ticker+period low-confidence finding still fires its own alert (not over-suppressed)", async () => {
    const { parseBctcReport } = await import(
      "../application/usecases/parseBctcReport.js"
    );
    const telegramFn = async (msg: string) => { bugMessages.push(msg); return true; };

    await parseBctcReport({ rawText: CORRUPT_BCTC_TEXT, actionCode: "BATCH_B1", period: PERIOD, _telegramBugFn: telegramFn });
    await parseBctcReport({ rawText: CORRUPT_BCTC_TEXT, actionCode: "BATCH_B2", period: PERIOD, _telegramBugFn: telegramFn });
    await parseBctcReport({ rawText: CORRUPT_BCTC_TEXT, actionCode: "BATCH_B3", period: PERIOD, _telegramBugFn: telegramFn });

    expect(bugMessages.filter((m) => m.includes("BATCH_B1")).length).toBe(1);
    expect(bugMessages.filter((m) => m.includes("BATCH_B2")).length).toBe(1);
    expect(bugMessages.filter((m) => m.includes("BATCH_B3")).length).toBe(1);
  });

  it("the quality row self-closes: once validation_status moves off low_confidence, a LATER regression alerts again", async () => {
    const { parseBctcReport } = await import(
      "../application/usecases/parseBctcReport.js"
    );
    const telegramFn = async (msg: string) => { bugMessages.push(msg); return true; };

    const ticker = "BATCH_C";

    // First low-confidence finding — alert fires.
    await parseBctcReport({ rawText: CORRUPT_BCTC_TEXT, actionCode: ticker, period: PERIOD, _telegramBugFn: telegramFn });
    expect(bugMessages.filter((m) => m.includes(ticker)).length).toBe(1);

    const db = getDb();

    // Simulate the issue being resolved (a human correction / successful
    // re-extraction flips validation_status away from 'low_confidence') and
    // the 1792 debounce window fully expiring, independently of each other.
    db.exec(
      `UPDATE financial_reports SET validation_status = 'passed' WHERE action_code = '${ticker}' AND sort_key = '2025-Q4'`,
    );
    db.exec(
      `UPDATE bctc_signal_debounce
       SET sent_at = datetime('now', '-2 hours')
       WHERE action_code = '${ticker}' AND period_key = '2025-Q4'`,
    );

    // A LATER regression (a fresh bad PDF replaces the fixed one) — this is
    // NEW information relative to the just-fixed row, so it must alert again.
    await parseBctcReport({ rawText: CORRUPT_BCTC_TEXT, actionCode: ticker, period: PERIOD, _telegramBugFn: telegramFn });

    expect(bugMessages.filter((m) => m.includes(ticker)).length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C5-cure: restore real telegram module after all tests in this file complete
// so downstream files in the same Bun process see the genuine implementations.
// ─────────────────────────────────────────────────────────────────────────────
afterAll(() => {
  mock.module("../infrastructure/notifiers/telegram.js", () => ({
    sendTelegramWork: _realModBatch.sendTelegramWork,
    sendTelegramMarket: _realModBatch.sendTelegramMarket,
    sendTelegramBug: _realModBatch.sendTelegramBug,
    sendTelegram: _realModBatch.sendTelegram,
    notifyTelegramAlert: _realModBatch.notifyTelegramAlert,
    notifyTelegramDocument: _realModBatch.notifyTelegramDocument,
    formatConvictionBlock: _realModBatch.formatConvictionBlock,
    deleteTelegramBug: _realModBatch.deleteTelegramBug,
  }));
});
