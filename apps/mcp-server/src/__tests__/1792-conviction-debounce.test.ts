Bun.env["DB_PATH"] = ":memory:";
/**
 * Task 1792 — Conviction signal debounce
 *
 * The [BCTC-1345b] low-confidence Telegram bug alert must fire at most ONCE
 * per ticker+quarter within a 1-hour cooldown window.
 *
 * Regression scenario: VCB 2025-Q4 was evaluated 10 times in 3 minutes
 * (retry loop), generating 10 identical bug reports in the channel.
 *
 * Tests:
 *   1. 10 rapid fires for same ticker+quarter → only 1 Telegram message sent
 *   2. Different ticker+quarter → sends its own message (not blocked by VCB debounce)
 *   3. After cooldown expires → next fire sends a new message
 *   4. `isBctcSignalDebounced` helper returns true inside window, false outside
 *   5. `recordBctcSignalSent` persists the debounce row (DB-backed, survives restart)
 */

import { describe, it, expect, mock, beforeEach, afterEach, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Telegram mock — captures all bug channel messages
// ─────────────────────────────────────────────────────────────────────────────

// Load real telegram module via cache-bust (bypasses any prior mock.module stub from earlier files)
const _realMod1792 = await import(
  Bun.resolveSync("../infrastructure/notifiers/telegram.js", import.meta.dir) + "?isolate=1792"
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
// Helpers imported lazily (after DB init)
// ─────────────────────────────────────────────────────────────────────────────

import type { FiscalPeriod } from "../../bctc-schema.js";

const VCB_PERIOD: FiscalPeriod = {
  year: 2025,
  quarter: 4,
  periodType: "Q4",
  startDate: "2025-10-01",
  endDate: "2025-12-31",
  sortKey: "2025-Q4",
};

const HPG_PERIOD: FiscalPeriod = {
  year: 2025,
  quarter: 4,
  periodType: "Q4",
  startDate: "2025-10-01",
  endDate: "2025-12-31",
  sortKey: "2025-Q4",
};

/** Minimal corrupt BCTC text that forces composite_confidence <= 0.3 (assets < equity). */
const CORRUPT_BCTC_TEXT = `
BẢNG CÂN ĐỐI KẾ TOÁN
Tài sản ngắn hạn                               500
Tài sản dài hạn                                457
TỔNG CỘNG TÀI SẢN                             957
Nợ phải trả                                  6000
Vốn chủ sở hữu                             18829
TỔNG CỘNG NGUỒN VỐN                        24829
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Doanh thu thuần                              5000
Giá vốn hàng bán                             3000
Lợi nhuận gộp                               2000
Lợi nhuận thuần từ hoạt động kinh doanh      600
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

describe("Task 1792 — Conviction signal debounce (DB-backed, per-ticker+quarter)", () => {

  it("10 rapid fires for same ticker+quarter → only 1 Telegram bug message sent", async () => {
    const { parseBctcReport } = await import(
      "../application/usecases/parseBctcReport.js"
    );

    // Fire 10 times for VCB 2025-Q4 in rapid succession
    for (let i = 0; i < 10; i++) {
      await parseBctcReport({
        rawText: CORRUPT_BCTC_TEXT,
        actionCode: "VCB_1792_A",
        period: VCB_PERIOD,
      });
    }

    // Despite 10 calls, only 1 bug message should reach Telegram
    const vcbMessages = bugMessages.filter((m) => m.includes("VCB_1792_A"));
    expect(vcbMessages.length).toBe(1);
  });

  it("different ticker+quarter is not blocked by VCB debounce", async () => {
    const { parseBctcReport } = await import(
      "../application/usecases/parseBctcReport.js"
    );

    // Fire VCB first — fills VCB debounce slot
    await parseBctcReport({
      rawText: CORRUPT_BCTC_TEXT,
      actionCode: "VCB_1792_B",
      period: VCB_PERIOD,
    });

    // HPG is a different ticker — should send its own message
    await parseBctcReport({
      rawText: CORRUPT_BCTC_TEXT,
      actionCode: "HPG_1792_B",
      period: HPG_PERIOD,
    });

    expect(bugMessages.filter((m) => m.includes("VCB_1792_B")).length).toBe(1);
    expect(bugMessages.filter((m) => m.includes("HPG_1792_B")).length).toBe(1);
  });

  it("isBctcSignalDebounced returns true inside cooldown window", async () => {
    const { isBctcSignalDebounced, recordBctcSignalSent } = await import(
      "../infrastructure/db/bctcSignalDebounce.js"
    );

    const db = getDb();
    const ticker = "VCB_1792_C";
    const period = "2025-Q4";
    const cooldownHours = 1;

    // Before recording: not debounced
    expect(isBctcSignalDebounced(db, ticker, period, cooldownHours)).toBe(false);

    // Record a send
    recordBctcSignalSent(db, ticker, period);

    // Immediately after: debounced
    expect(isBctcSignalDebounced(db, ticker, period, cooldownHours)).toBe(true);
  });

  it("isBctcSignalDebounced returns false after cooldown expires", async () => {
    const { isBctcSignalDebounced, recordBctcSignalSent } = await import(
      "../infrastructure/db/bctcSignalDebounce.js"
    );

    const db = getDb();
    const ticker = "VCB_1792_D";
    const period = "2025-Q4";

    // Insert a row with sent_at 2 hours ago (older than 1h cooldown)
    db.exec(`
      INSERT INTO bctc_signal_debounce (action_code, period_key, sent_at)
      VALUES ('${ticker}', '${period}', datetime('now', '-2 hours'))
    `);

    // Cooldown window is 1h → 2h-old record is expired → not debounced
    expect(isBctcSignalDebounced(db, ticker, period, 1)).toBe(false);
  });

  it("recordBctcSignalSent persists a row in bctc_signal_debounce (DB-backed)", async () => {
    const { recordBctcSignalSent } = await import(
      "../infrastructure/db/bctcSignalDebounce.js"
    );

    const db = getDb();
    const ticker = "VCB_1792_E";
    const period = "2025-Q4";

    recordBctcSignalSent(db, ticker, period);

    const row = db
      .query<{ action_code: string; period_key: string }, [string, string]>(
        "SELECT action_code, period_key FROM bctc_signal_debounce WHERE action_code = ? AND period_key = ?",
      )
      .get(ticker, period);

    expect(row).not.toBeNull();
    expect(row!.action_code).toBe(ticker);
    expect(row!.period_key).toBe(period);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C5-cure: restore real telegram module after all 1792 tests complete so
// downstream files in the same Bun process see the genuine implementations.
// ─────────────────────────────────────────────────────────────────────────────
afterAll(() => {
  mock.module("../infrastructure/notifiers/telegram.js", () => ({
    sendTelegramWork: _realMod1792.sendTelegramWork,
    sendTelegramMarket: _realMod1792.sendTelegramMarket,
    sendTelegramBug: _realMod1792.sendTelegramBug,
    sendTelegram: _realMod1792.sendTelegram,
    notifyTelegramAlert: _realMod1792.notifyTelegramAlert,
    notifyTelegramDocument: _realMod1792.notifyTelegramDocument,
    formatConvictionBlock: _realMod1792.formatConvictionBlock,
    deleteTelegramBug: _realMod1792.deleteTelegramBug,
  }));
});
