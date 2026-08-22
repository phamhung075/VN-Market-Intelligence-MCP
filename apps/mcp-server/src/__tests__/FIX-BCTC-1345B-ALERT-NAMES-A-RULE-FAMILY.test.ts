Bun.env["DB_PATH"] = ":memory:";
/**
 * FIX-BCTC-1345B-ALERT-NAMES-A-RULE-FAMILY-THAT-CANNOT-PRODUCE-ITS-OWN-VALUE
 *
 * Root cause (measured, telegram_reports id=4273): parseBctcReport.ts's
 * unit-mismatch short-circuit sets confidenceFinancial=0.1 WITHOUT ever
 * calling validateFinancialFigures() — but the [BCTC-1345b] alert text
 * unconditionally told the reader to check the VNM/VEA (BCTC-VAL-01 /
 * BCTC-VAL-03) patterns, which live INSIDE the validator call that was just
 * skipped. validateFinancialFigures() can never return 0.1 (brute-forced
 * over 160,000 combos in the triaging analysis: only {0, 0.4, 0.6, 0.8, 1.0}
 * are reachable).
 *
 * AC-1/AC-2: the alert must name the detector that ACTUALLY fired (cross-
 * statement unit mismatch / intra-BS unit mismatch / the specific
 * BCTC-VAL-NN rule with figures) — never an unconditional hard-coded ticker
 * hint on a value the named rule family cannot produce.
 * AC-3: financialFiguresValidator.ts's `Math.max(confidence, 0.1)` floor was
 * unreachable (max stacked soft penalty is 0.6 — VAL-01-SCALE/POSITION and
 * VAL-06 can never co-fire since one requires totalEquity>0 and the other
 * totalEquity<0 — so the true minimum non-hard-fail output is 0.4, not
 * 0.1). Removed; docstrings corrected.
 * AC-4: this file.
 */

import { describe, it, expect, mock, beforeEach, afterEach, afterAll } from "bun:test";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import {
  validateFinancialFigures,
  validateFinancialFiguresDetailed,
} from "../domain/services/financial-reports/financialFiguresValidator.js";

// ─────────────────────────────────────────────────────────────────────────────
// Telegram mock (matches the pattern used by sibling 1345b/1424a/BATCH tests)
// ─────────────────────────────────────────────────────────────────────────────

const _realMod = await import(
  Bun.resolveSync("../infrastructure/notifiers/telegram.js", import.meta.dir) + "?isolate=1345b-alertnames"
);

mock.module("../infrastructure/notifiers/telegram.js", () => ({
  sendTelegramWork: () => Promise.resolve(true),
  sendTelegramMarket: () => Promise.resolve(true),
  sendTelegramBug: () => Promise.resolve(true),
  sendTelegram: () => Promise.resolve(true),
}));

beforeEach(async () => {
  closeDb();
  await initDatabase();
});

afterEach(() => {
  closeDb();
});

afterAll(() => {
  mock.module("../infrastructure/notifiers/telegram.js", () => ({
    sendTelegramWork: _realMod.sendTelegramWork,
    sendTelegramMarket: _realMod.sendTelegramMarket,
    sendTelegramBug: _realMod.sendTelegramBug,
    sendTelegram: _realMod.sendTelegram,
    notifyTelegramAlert: _realMod.notifyTelegramAlert,
    notifyTelegramDocument: _realMod.notifyTelegramDocument,
    formatConvictionBlock: _realMod.formatConvictionBlock,
    deleteTelegramBug: _realMod.deleteTelegramBug,
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1/AC-2 — describeConfidenceFinancialReason (unit-level, deterministic)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-1345B-ALERT-NAMES — describeConfidenceFinancialReason", () => {
  it("names cross-statement unit mismatch with the offending ratio/figures, and does NOT mention VNM/VEA", async () => {
    const { describeConfidenceFinancialReason } = await import(
      "../application/usecases/parseBctcReport.js"
    );

    const detail = describeConfidenceFinancialReason({
      crossStmtMismatch: true,
      bsIntraStmtMismatch: false,
      figures: {
        totalAssets: 420_322_071_420,
        totalEquity: 0,
        totalLiabilities: 0,
        operatingMargin: null,
        netRevenue: 31,
      },
    });

    expect(detail).toMatch(/cross-statement unit mismatch/i);
    expect(detail).toContain("420322071420");
    expect(detail).toContain("31");
    expect(detail).not.toContain("VNM/VEA");
    expect(detail).not.toMatch(/BCTC-VAL-\d\d/); // validateFinancialFigures was never called
  });

  it("names intra-BS unit mismatch with the offending ratio/figures, and does NOT mention VNM/VEA", async () => {
    const { describeConfidenceFinancialReason } = await import(
      "../application/usecases/parseBctcReport.js"
    );

    const detail = describeConfidenceFinancialReason({
      crossStmtMismatch: false,
      bsIntraStmtMismatch: true,
      figures: {
        totalAssets: 400_271_001_803,
        totalEquity: null,
        totalLiabilities: 76_754_658,
        operatingMargin: null,
        netRevenue: null,
      },
    });

    expect(detail).toMatch(/intra-BS unit mismatch/i);
    expect(detail).toContain("400271001803");
    expect(detail).toContain("76754658");
    expect(detail).not.toContain("VNM/VEA");
  });

  it("names BCTC-VAL-01 with the offending figures AND the VNM/VEA signature when the genuine rule fires (confidence=0.0, reachable)", async () => {
    const { describeConfidenceFinancialReason } = await import(
      "../application/usecases/parseBctcReport.js"
    );

    // VNM Q4 2024 corruption fixture: assets=957 < equity=18829, revenue not
    // >30x assets -> BCTC-VAL-01 hard fail (confidence=0.0, a value the rule
    // family CAN produce).
    const figures = {
      totalAssets: 957,
      totalEquity: 18829,
      totalLiabilities: 6000,
      operatingMargin: null,
      netRevenue: 5000,
    };
    expect(validateFinancialFigures(figures)).toBe(0.0);

    const detail = describeConfidenceFinancialReason({
      crossStmtMismatch: false,
      bsIntraStmtMismatch: false,
      figures,
    });

    expect(detail).toContain("BCTC-VAL-01");
    expect(detail).toContain("957");
    expect(detail).toContain("18829");
    expect(detail).toContain("VNM/VEA");
  });

  it("names BCTC-VAL-03 with the offending margin AND the VNM/VEA signature when the genuine rule fires (confidence=0.8, reachable)", async () => {
    const { describeConfidenceFinancialReason } = await import(
      "../application/usecases/parseBctcReport.js"
    );

    // VEA Q4 2024 fixture: operating_margin=3.3 (330%) — sole soft violation.
    const figures = {
      totalAssets: 50000,
      totalEquity: 20000,
      totalLiabilities: 30000,
      operatingMargin: 3.3,
      netRevenue: 10000,
    };
    expect(validateFinancialFigures(figures)).toBeCloseTo(0.8, 5);

    const detail = describeConfidenceFinancialReason({
      crossStmtMismatch: false,
      bsIntraStmtMismatch: false,
      figures,
    });

    expect(detail).toContain("BCTC-VAL-03");
    expect(detail).toContain("VNM/VEA");
  });

  it("does NOT attach the VNM/VEA signature to a rule violation outside that family (e.g. BCTC-VAL-05 net_revenue<=0 alone)", async () => {
    const { describeConfidenceFinancialReason } = await import(
      "../application/usecases/parseBctcReport.js"
    );

    const figures = {
      totalAssets: 1000,
      totalEquity: 500,
      totalLiabilities: 400,
      operatingMargin: null,
      netRevenue: -1,
    };
    const { confidence, violations } = validateFinancialFiguresDetailed(figures);
    expect(confidence).toBeCloseTo(0.8, 5);
    expect(violations.map((v) => v.rule)).toEqual(["BCTC-VAL-05"]);

    const detail = describeConfidenceFinancialReason({
      crossStmtMismatch: false,
      bsIntraStmtMismatch: false,
      figures,
    });

    expect(detail).toContain("BCTC-VAL-05");
    expect(detail).not.toContain("VNM/VEA");
  });

  it("REGRESSION (QA 2026-08-14, AC-2 gap): does NOT attach the VNM/VEA signature when BCTC-VAL-03 stacks with a second soft violation (confidence=0.6, outside {0.0,0.8})", async () => {
    const { describeConfidenceFinancialReason } = await import(
      "../application/usecases/parseBctcReport.js"
    );

    // Reproduces QA's live finding verbatim: BCTC-VAL-03 (margin outlier) +
    // BCTC-VAL-05 (net_revenue<=0) co-fire -> confidence=0.6, a value the
    // VNM/VEA rule family (0.0 hard-fail / 0.8 lone-soft-violation) can never
    // produce. Rule-membership-only gating would wrongly attach the hint
    // here because BCTC-VAL-03 is present among the violations.
    const figures = {
      totalAssets: 1000,
      totalEquity: 500,
      totalLiabilities: 400,
      operatingMargin: 2.0,
      netRevenue: -1,
    };
    const { confidence, violations } = validateFinancialFiguresDetailed(figures);
    expect(confidence).toBeCloseTo(0.6, 5);
    expect(violations.map((v) => v.rule).sort()).toEqual(["BCTC-VAL-03", "BCTC-VAL-05"]);

    const detail = describeConfidenceFinancialReason({
      crossStmtMismatch: false,
      bsIntraStmtMismatch: false,
      figures,
    });

    expect(detail).toContain("BCTC-VAL-03");
    expect(detail).toContain("BCTC-VAL-05");
    expect(detail).not.toContain("VNM/VEA");
  });

  it("REGRESSION (QA 2026-08-14, AC-2 gap): does NOT attach the VNM/VEA signature when BCTC-VAL-03 stacks with BCTC-VAL-01-SCALE (confidence=0.4, outside {0.0,0.8})", async () => {
    const { describeConfidenceFinancialReason } = await import(
      "../application/usecases/parseBctcReport.js"
    );

    const figures = {
      totalAssets: 1000,
      totalEquity: 600_000, // ratio 600 >= 500 -> VAL-01-SCALE soft +0.2
      totalLiabilities: 100,
      operatingMargin: 2.0, // outside (-5,1) -> VAL-03 soft +0.2
      netRevenue: 100,
    };
    const { confidence, violations } = validateFinancialFiguresDetailed(figures);
    expect(confidence).toBeCloseTo(0.6, 5);
    expect(violations.map((v) => v.rule).sort()).toEqual(["BCTC-VAL-01-SCALE", "BCTC-VAL-03"]);

    const detail = describeConfidenceFinancialReason({
      crossStmtMismatch: false,
      bsIntraStmtMismatch: false,
      figures,
    });

    expect(detail).toContain("BCTC-VAL-03");
    expect(detail).not.toContain("VNM/VEA");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1/AC-2 — end-to-end through parseBctcReport (wiring regression)
// ─────────────────────────────────────────────────────────────────────────────

import type { FiscalPeriod } from "../../bctc-schema.js";

const PERIOD: FiscalPeriod = {
  year: 2026,
  quarter: 2,
  periodType: "Q2",
  startDate: "2026-04-01",
  endDate: "2026-06-30",
  sortKey: "2026-Q2",
};

// NVL 2026-Q2-shaped corruption: assets/revenue ratio >> 1000x -> cross-
// statement detectUnitMismatch fires -> confidenceFinancial=0.1 WITHOUT
// calling validateFinancialFigures().
const UNIT_MISMATCH_BCTC_TEXT = `
BẢNG CÂN ĐỐI KẾ TOÁN
Tài sản ngắn hạn                       210000000000
Tài sản dài hạn                        210322071420
TỔNG CỘNG TÀI SẢN                      420322071420
Nợ phải trả                                       0
Vốn chủ sở hữu                                    0
TỔNG CỘNG NGUỒN VỐN                    420322071420
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Doanh thu thuần                                  31
Giá vốn hàng bán                                 20
Lợi nhuận gộp                                    11
Lợi nhuận thuần từ hoạt động kinh doanh            5
Lợi nhuận trước thuế                              5
Thuế TNDN hiện hành                               1
Lợi nhuận sau thuế                                4
BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Lưu chuyển tiền từ hoạt động kinh doanh            4
Lưu chuyển tiền từ hoạt động đầu tư               -2
Lưu chuyển tiền từ hoạt động tài chính            -1
Lưu chuyển tiền thuần trong kỳ                     1
Tiền và tương đương tiền đầu kỳ                    3
Tiền và tương đương tiền cuối kỳ                   4
`.trim();

// VNM Q4 2024-style corruption fixture: assets(957) < equity(2222),
// assets/revenue ratio ~5.2x (<1000) so detectUnitMismatch does NOT fire, and
// assets/liabilities ratio ~47x (<100) so detectBsIntraStmtUnitMismatch does
// NOT fire either — validateFinancialFigures IS called and hard-fails on
// BCTC-VAL-01.
//
// Deliberately omits the "TỔNG CỘNG NGUỒN VỐN" (code 440) line and sets
// Nợ phải trả=45000 (>= equity*20=44440) — both needed to keep this fixture
// out of range of balanceSheetExtractor's FIX-BCTC-MAGNITUDE-NORMALIZE
// identity-override paths A and B (which would otherwise "correct"
// totalAssets to match totalLiabilities+equity before validateFinancialFigures
// ever sees the corruption, defeating the fixture) while ALSO staying under
// detectBsIntraStmtUnitMismatch's 100x threshold (an earlier attempt with
// liabilities=400000 accidentally tripped that detector instead — verified
// live). equity=2222 (rather than a round 2000) avoids an unrelated live-
// verified extraction collision where "2000" ambiguously matched a nearby
// income-statement figure instead of the balance-sheet equity line. This is
// the same normalization ambiguity 1345b-bctc-financial-validation.test.ts's
// comment ("may be 0.0 ... or a value reflecting what was actually
// extracted") already flags for its own near-identical fixture.
const VNM_VAL01_BCTC_TEXT = `
CÔNG TY CỔ PHẦN SỮA VIỆT NAM - VNM
BÁO CÁO TÀI CHÍNH QUÝ 4/2024

BẢNG CÂN ĐỐI KẾ TOÁN
Tài sản ngắn hạn                               500
Tài sản dài hạn                                457
TỔNG CỘNG TÀI SẢN                             957

Nợ phải trả                                 45000
Vốn chủ sở hữu                               2222

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

describe("FIX-BCTC-1345B-ALERT-NAMES — end-to-end via parseBctcReport", () => {
  it("REGRESSION: unit-mismatch alert (financial=0.10) does NOT contain the VNM/VEA ticker-pattern hint", async () => {
    const { parseBctcReport } = await import("../application/usecases/parseBctcReport.js");
    const messages: string[] = [];
    const telegramFn = async (msg: string) => { messages.push(msg); return true; };

    await parseBctcReport({
      rawText: UNIT_MISMATCH_BCTC_TEXT,
      actionCode: "NVL_TEST_ALERTNAMES",
      period: PERIOD,
      _telegramBugFn: telegramFn,
    });

    const alerts = messages.filter((m) => m.includes("[BCTC-1345b]"));
    expect(alerts.length).toBeGreaterThan(0);
    const msg = alerts[0]!;
    expect(msg).toContain("financial=0.10");
    expect(msg).not.toContain("VNM/VEA");
  });

  it("REGRESSION: a genuine BCTC-VAL-01 alert (financial=0.00, assets<equity, no unit mismatch) DOES name BCTC-VAL-01 and the VNM/VEA corruption signature", async () => {
    const { parseBctcReport } = await import("../application/usecases/parseBctcReport.js");
    const messages: string[] = [];
    const telegramFn = async (msg: string) => { messages.push(msg); return true; };

    await parseBctcReport({
      rawText: VNM_VAL01_BCTC_TEXT,
      actionCode: "VNM_TEST_ALERTNAMES",
      period: PERIOD,
      _telegramBugFn: telegramFn,
    });

    const alerts = messages.filter((m) => m.includes("[BCTC-1345b]"));
    expect(alerts.length).toBeGreaterThan(0);
    const msg = alerts[0]!;
    expect(msg).toContain("financial=0.00");
    expect(msg).toContain("BCTC-VAL-01");
    expect(msg).toContain("VNM/VEA");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3 — dead 0.1 floor removed from validateFinancialFigures
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-1345B-ALERT-NAMES — AC-3: dead 0.1 floor removed", () => {
  it("the maximum reachable non-hard-fail penalty is 0.6 -> minimum confidence is 0.4, never 0.1", () => {
    // Stack the 3 co-firing soft violations: VAL-01-SCALE (equity/assets>=500,
    // requires totalEquity>0) + VAL-03 (margin out of range) + VAL-05
    // (revenue<=0). VAL-06 (equity<0) structurally cannot co-fire with
    // VAL-01's totalEquity>0 guard, so 0.4 is the true floor.
    const confidence = validateFinancialFigures({
      totalAssets: 1000,
      totalEquity: 600_000, // ratio 600 >= 500 -> VAL-01-SCALE soft +0.2
      totalLiabilities: 100,
      operatingMargin: 2.0, // outside (-5,1) -> VAL-03 soft +0.2 (inside VAL-10's ±5 hard bound)
      netRevenue: -1, // VAL-05 soft +0.2
    });
    expect(confidence).toBeCloseTo(0.4, 5);
    expect(confidence).not.toBe(0.1);
  });

  it("validateFinancialFiguresDetailed never returns confidence=0.1 across a wide input sweep", () => {
    const scaleValues = [0, 100, 1000, 100_000, 600_000, -1, null];
    const marginValues = [0, 0.5, 3.3, -3.3, 4.99, -4.99, null];
    let sawPointOne = false;
    for (const totalAssets of [1000, 50000, null]) {
      for (const totalEquity of scaleValues) {
        for (const operatingMargin of marginValues) {
          const { confidence } = validateFinancialFiguresDetailed({
            totalAssets,
            totalEquity: totalEquity as number | null,
            totalLiabilities: 100,
            operatingMargin: operatingMargin as number | null,
            netRevenue: 100,
          });
          if (confidence === 0.1) sawPointOne = true;
        }
      }
    }
    expect(sawPointOne).toBe(false);
  });
});
