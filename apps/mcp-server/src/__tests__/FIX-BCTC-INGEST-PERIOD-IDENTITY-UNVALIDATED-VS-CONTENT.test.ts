Bun.env["DB_PATH"] = ":memory:";
/**
 * FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT
 *
 * PO row (docs/data/orch/orch-state.json .task_board — full analysis in `.note`):
 * financial_reports.period_year/period_quarter (and the (action_code, sort_key)
 * conflict-target identity derived from them) are caller-supplied and were
 * NEVER checked against the PDF's own content. Concrete instance: report_id
 * 5b0dad71-3b05-4455-9823-c2072442777d stored as DPM_2025_Q4 but its content
 * is unambiguously Q1-2026 — a durable data-loss condition (the real Q4-2025
 * filing can never land in that slot while the mislabelled row holds it).
 *
 * Remedy shape (settled by PO, mirrors UC-CDC-P1 — compute server-side at the
 * boundary, gate the caller override): checkPeriodContentConsistency (domain,
 * periodContentExtractor.ts) is run inside parseBctcReport.ts BEFORE any
 * extraction/storage. A confident content-derived period that contradicts the
 * supplied key throws BctcPeriodContentMismatchError — the report is written
 * under NEITHER key. An inconclusive signal (poor OCR / no boundary dates at
 * all) or a matching signal proceeds exactly as before (AC-3 negative control).
 *
 * Tests:
 *   1. Domain unit tests for extractPeriodFromContent / checkPeriodContentConsistency
 *      (pure functions — no DB, no mocks).
 *   2. Integration tests through parseBctcReport — mismatch rejection (AC-2),
 *      negative controls (AC-3), slot-recovery (AC-4), and the regression
 *      guard that a mismatched document can never occupy the (action_code,
 *      sort_key) slot it was wrongly supplied for (AC-5).
 */

import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import {
  extractPeriodFromContent,
  checkPeriodContentConsistency,
  BctcPeriodContentMismatchError,
} from "../domain/services/financial-reports/periodContentExtractor.js";
import { parseBctcReport } from "../application/usecases/parseBctcReport.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import type { FiscalPeriod } from "../../bctc-schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Telegram stub — matches the 047-bctc-orchestrator.test.ts precedent so
// storeReport()'s / the new period-mismatch guard's fire-and-forget/injected
// Telegram calls never hit the real network during tests.
// ─────────────────────────────────────────────────────────────────────────────

const _realMod = await import(
  Bun.resolveSync("../infrastructure/notifiers/telegram.js", import.meta.dir) + "?isolate=FIX-BCTC-PERIOD-IDENTITY"
);

mock.module("../infrastructure/notifiers/telegram.js", () => ({
  sendTelegramWork: () => Promise.resolve(true),
  sendTelegramMarket: () => Promise.resolve(true),
  sendTelegramBug: () => Promise.resolve(true),
  sendTelegram: () => Promise.resolve(true),
  notifyTelegramAlert: () => Promise.resolve(true),
  notifyTelegramDocument: () => Promise.resolve(true),
  formatConvictionBlock: _realMod.formatConvictionBlock,
  deleteTelegramBug: () => Promise.resolve(false),
}));

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
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
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Clean Q1-2026 boundary statements — balance sheet as-of + income/CF range (2 boundaries per block). */
const CLEAN_Q1_2026_DATES = `
Tại ngày 31 tháng 03 năm 2026
Từ ngày 01 tháng 01 năm 2026 đến ngày 31 tháng 03 năm 2026
Tại ngày 31 tháng 03 năm 2026
`;

/**
 * Real-world OCR/font-corruption pattern reproduced from the actual
 * report_id=5b0dad71 PDF's pdf-parse extraction — Vietnamese diacritic
 * letters mis-decoded ("Tqi ngity 31 thing 03 nbn 2026" for "Tại ngày 31
 * tháng 03 năm 2026") while digits + short ASCII stems survive.
 */
const GARBLED_Q1_2026_DATES = `
Tqi ngity 31 thing 03 nbn 2026
Tir ngity 01 thing 01 nbn 2026 den ngity 31 thing 03 nbn 2026
Tqi ngity 31 thing 03 nbn 2026
`;

/** Q4-2025 boundary statements — for the "correctly labelled" negative control and AC-4 slot recovery. */
const CLEAN_Q4_2025_DATES = `
Tại ngày 31 tháng 12 năm 2025
Từ ngày 01 tháng 10 năm 2025 đến ngày 31 tháng 12 năm 2025
Tại ngày 31 tháng 12 năm 2025
`;

/** Minimal BCTC body — enough for extractionConfidence > 0 so storeReport() does not skip the insert. */
const MINIMAL_BCTC_BODY = `
TỔNG CỘNG TÀI SẢN                                   80.000.000
Doanh thu thuần                                     39.500.000
Lợi nhuận sau thuế                                   6.880.000
Lưu chuyển tiền thuần từ hoạt động kinh doanh        5.880.000
`;

const PERIOD_2025_Q4: FiscalPeriod = {
  year: 2025,
  quarter: 4,
  periodType: "Q4",
  startDate: "2025-10-01",
  endDate: "2025-12-31",
  sortKey: "2025-Q4",
};

const PERIOD_2026_Q1: FiscalPeriod = {
  year: 2026,
  quarter: 1,
  periodType: "Q1",
  startDate: "2026-01-01",
  endDate: "2026-03-31",
  sortKey: "2026-Q1",
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Domain unit tests — extractPeriodFromContent / checkPeriodContentConsistency
// ─────────────────────────────────────────────────────────────────────────────

describe("extractPeriodFromContent (domain, pure)", () => {
  it("derives Q1-2026 from clean repeated boundary-date statements", () => {
    const signal = extractPeriodFromContent(CLEAN_Q1_2026_DATES);
    expect(signal).not.toBeNull();
    expect(signal!.year).toBe(2026);
    expect(signal!.quarter).toBe(1);
    expect(signal!.matchCount).toBeGreaterThanOrEqual(3);
  });

  it("derives Q1-2026 from the REAL diacritic-corrupted OCR pattern (report 5b0dad71 fingerprint)", () => {
    const signal = extractPeriodFromContent(GARBLED_Q1_2026_DATES);
    expect(signal).not.toBeNull();
    expect(signal!.year).toBe(2026);
    expect(signal!.quarter).toBe(1);
  });

  it("returns null when no boundary-shaped date occurs at all (existing corpus — no regression)", () => {
    // No "ngày D tháng M năm Y" / slash-date boundary text — matches every
    // existing 047-bctc-orchestrator.test.ts fixture (header-only "QUÝ 1/2024").
    const signal = extractPeriodFromContent("BÁO CÁO TÀI CHÍNH QUÝ 1/2024\nTổng tài sản 80.000.000");
    expect(signal).toBeNull();
  });

  it("returns null (inconclusive) below MIN_SIGNAL_COUNT — a single stray boundary-shaped date is not trusted", () => {
    const signal = extractPeriodFromContent("Tại ngày 31 tháng 03 năm 2026");
    expect(signal).toBeNull();
  });

  it("returns null (inconclusive) on a tie between two candidates — never guesses", () => {
    const tied = `
      Tại ngày 31 tháng 03 năm 2026
      Tại ngày 31 tháng 03 năm 2026
      Tại ngày 31 tháng 03 năm 2026
      Tại ngày 31 tháng 12 năm 2025
      Tại ngày 31 tháng 12 năm 2025
      Tại ngày 31 tháng 12 năm 2025
    `;
    expect(extractPeriodFromContent(tied)).toBeNull();
  });

  it("derives from clean slash-dates (DD/MM/YYYY) as an alternate pattern", () => {
    const text = `Từ 01/01/2026 đến 31/03/2026. Tại 31/03/2026. Kỳ báo cáo 31/03/2026.`;
    const signal = extractPeriodFromContent(text);
    expect(signal).not.toBeNull();
    expect(signal!.year).toBe(2026);
    expect(signal!.quarter).toBe(1);
  });
});

describe("checkPeriodContentConsistency (domain, pure)", () => {
  it("flags inconsistency when content confidently disagrees with the supplied period", () => {
    const result = checkPeriodContentConsistency(CLEAN_Q1_2026_DATES, 2025, 4);
    expect(result.consistent).toBe(false);
    expect(result.contentSignal).not.toBeNull();
    expect(result.contentSignal!.year).toBe(2026);
    expect(result.contentSignal!.quarter).toBe(1);
  });

  it("is consistent when content agrees with the supplied period", () => {
    const result = checkPeriodContentConsistency(CLEAN_Q1_2026_DATES, 2026, 1);
    expect(result.consistent).toBe(true);
  });

  it("is consistent (AC-3 negative control) when content is inconclusive — never blocks a poor-OCR filing", () => {
    const result = checkPeriodContentConsistency(MINIMAL_BCTC_BODY, 2025, 4);
    expect(result.consistent).toBe(true);
    expect(result.contentSignal).toBeNull();
  });

  it("skips the check entirely for annual reports (quarter=null) — always consistent", () => {
    const result = checkPeriodContentConsistency(CLEAN_Q1_2026_DATES, 2025, null);
    expect(result.consistent).toBe(true);
    expect(result.contentSignal).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Integration tests — parseBctcReport wiring
// ─────────────────────────────────────────────────────────────────────────────

describe("parseBctcReport — period-vs-content boundary guard", () => {
  it("AC-2: rejects (throws, no write) when supplied period contradicts confident content signal", async () => {
    const rawText = CLEAN_Q1_2026_DATES + MINIMAL_BCTC_BODY;

    await expect(
      parseBctcReport({
        rawText,
        actionCode: "DPMFIX1",
        period: PERIOD_2025_Q4,
      }),
    ).rejects.toBeInstanceOf(BctcPeriodContentMismatchError);

    // Loud signal names both periods (AC-2).
    try {
      await parseBctcReport({ rawText, actionCode: "DPMFIX1", period: PERIOD_2025_Q4 });
      throw new Error("expected rejection");
    } catch (err) {
      expect(err).toBeInstanceOf(BctcPeriodContentMismatchError);
      expect((err as Error).message).toContain("2025-Q4");
      expect((err as Error).message).toContain("2026-Q1");
    }

    // AC-5: the (action_code, sort_key) slot the caller supplied was NEVER written.
    const db = getDb();
    const row = db
      .prepare("SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get("DPMFIX1", "2025-Q4");
    expect(row).toBeNull();
  });

  it("AC-2 (real OCR fingerprint): also rejects using the diacritic-corrupted date pattern", async () => {
    const rawText = GARBLED_Q1_2026_DATES + MINIMAL_BCTC_BODY;

    await expect(
      parseBctcReport({
        rawText,
        actionCode: "DPMFIX2",
        period: PERIOD_2025_Q4,
      }),
    ).rejects.toBeInstanceOf(BctcPeriodContentMismatchError);

    const db = getDb();
    const row = db
      .prepare("SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get("DPMFIX2", "2025-Q4");
    expect(row).toBeNull();
  });

  it("AC-3 negative control: correctly-labelled filing (content matches supplied period) ingests normally", async () => {
    const rawText = CLEAN_Q1_2026_DATES + MINIMAL_BCTC_BODY;

    const report = await parseBctcReport({
      rawText,
      actionCode: "DPMFIX3",
      period: PERIOD_2026_Q1,
    });

    expect(report.period.sortKey).toBe("2026-Q1");

    const db = getDb();
    const row = db
      .prepare("SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get("DPMFIX3", "2026-Q1") as { id: string } | null;
    expect(row).not.toBeNull();
    expect(row!.id).toBe(report.id);
  });

  it("AC-3 negative control: text too poor to extract a period from still ingests normally under the caller's key", async () => {
    // MINIMAL_BCTC_BODY alone has zero boundary-date matches — content signal
    // is null (inconclusive), exactly the poor-OCR case AC-3 requires to pass.
    const report = await parseBctcReport({
      rawText: MINIMAL_BCTC_BODY,
      actionCode: "DPMFIX4",
      period: PERIOD_2025_Q4,
    });

    expect(report.period.sortKey).toBe("2025-Q4");

    const db = getDb();
    const row = db
      .prepare("SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get("DPMFIX4", "2025-Q4");
    expect(row).not.toBeNull();
  });

  it("AC-4 + AC-5: after a rejected mismatch, the freed slot accepts the genuinely correct filing", async () => {
    const mismatchedText = CLEAN_Q1_2026_DATES + MINIMAL_BCTC_BODY;

    // First: the wrong-period push is rejected, slot stays empty.
    await expect(
      parseBctcReport({ rawText: mismatchedText, actionCode: "DPMFIX5", period: PERIOD_2025_Q4 }),
    ).rejects.toBeInstanceOf(BctcPeriodContentMismatchError);

    // Then: the REAL Q4-2025 filing (content matches the key) can now be
    // ingested into that exact (action_code, sort_key) slot — proving the
    // fix restores capacity rather than merely blocking forever.
    const correctText = CLEAN_Q4_2025_DATES + MINIMAL_BCTC_BODY;
    const report = await parseBctcReport({
      rawText: correctText,
      actionCode: "DPMFIX5",
      period: PERIOD_2025_Q4,
    });
    expect(report.period.sortKey).toBe("2025-Q4");

    const db = getDb();
    const row = db
      .prepare("SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get("DPMFIX5", "2025-Q4") as { id: string } | null;
    expect(row).not.toBeNull();
    expect(row!.id).toBe(report.id);
  });

  it("regression: a mismatched document can never occupy the (action_code, sort_key) slot of the period it was wrongly supplied for", async () => {
    const rawText = CLEAN_Q1_2026_DATES + MINIMAL_BCTC_BODY;
    const attempts = 3;
    for (let i = 0; i < attempts; i++) {
      await expect(
        parseBctcReport({ rawText, actionCode: "DPMFIX6", period: PERIOD_2025_Q4 }),
      ).rejects.toBeInstanceOf(BctcPeriodContentMismatchError);
    }

    const db = getDb();
    const wrongSlot = db
      .prepare("SELECT COUNT(*) as c FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get("DPMFIX6", "2025-Q4") as { c: number };
    expect(wrongSlot.c).toBe(0);

    // Nor does it leak into the (action_code, sort_key) slot content actually indicates.
    const rightSlot = db
      .prepare("SELECT COUNT(*) as c FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get("DPMFIX6", "2026-Q1") as { c: number };
    expect(rightSlot.c).toBe(0);
  });
});
