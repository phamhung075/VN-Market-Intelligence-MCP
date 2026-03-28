/**
 * Task 104 — SSC Nightly Report Check (20:00 GMT+7)
 *
 * Tests the checkSscReports application use case and the sscCheckerJob
 * scheduler wrapper.
 *
 * All external dependencies (SQLite watchlist, SSC HTTP, BCTC pipeline,
 * dedup check, alert storage) are fully injected — no real DB or network calls.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import type { Alert } from "../domain/services/alertGenerator.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const FAKE_SSC_DOC = {
  title: "Báo cáo tài chính quý 1 năm 2025 - VCB",
  url: "https://congbothongtin.ssc.gov.vn/faces/document/vcb-q1-2025.pdf",
  publishedAt: "15/04/2025",
  reportType: "quarterly" as const,
};

const FAKE_SSC_DOC_2 = {
  title: "Báo cáo tài chính quý 2 năm 2025 - HPG",
  url: "https://congbothongtin.ssc.gov.vn/faces/document/hpg-q2-2025.pdf",
  publishedAt: "20/07/2025",
  reportType: "quarterly" as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Database setup — one shared in-memory DB for tests that need real DB
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  process.env["DB_PATH"] = ":memory:";
  await initDatabase();
});

afterAll(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 104 — SSC nightly report check", () => {
  // ── 1. Empty watchlist → checked: 0 ────────────────────────────────────────
  it("returns { checked: 0 } when getWatchlistFn returns empty array", async () => {
    const { checkSscReports } = await import(
      "../application/usecases/checkSscReports.js"
    );

    const result = await checkSscReports({
      getWatchlistFn: async () => [],
      listDocsFn: async () => [],
      pipelineFn: async () => null,
    });

    expect(result.checked).toBe(0);
    expect(result.newReports).toBe(0);
    expect(result.alerts).toBe(0);
  });

  // ── 2. Already-existing report is skipped (dedup by isNewReportFn) ─────────
  it("skips reports when isNewReportFn returns false", async () => {
    const { checkSscReports } = await import(
      "../application/usecases/checkSscReports.js"
    );

    const pipelineCalls: unknown[] = [];

    const result = await checkSscReports({
      getWatchlistFn: async () => [{ code: "VCB", alertReportNew: true }],
      listDocsFn: async (code) => (code === "VCB" ? [FAKE_SSC_DOC] : []),
      // Inject: the report already exists — isNewReport returns false
      isNewReportFn: (_code, _url) => false,
      pipelineFn: async () => {
        pipelineCalls.push(true);
        return null;
      },
      storeAlertsFn: () => {},
    });

    expect(result.newReports).toBe(0);
    expect(pipelineCalls.length).toBe(0);
  });

  // ── 3. New report found → pipeline called ──────────────────────────────────
  it("calls pipeline for a new SSC report when isNewReportFn returns true", async () => {
    const { checkSscReports } = await import(
      "../application/usecases/checkSscReports.js"
    );

    const pipelineCalls: Array<{ actionCode: string; pdfUrl: string }> = [];

    const result = await checkSscReports({
      getWatchlistFn: async () => [{ code: "HPG", alertReportNew: true }],
      listDocsFn: async (code) => (code === "HPG" ? [FAKE_SSC_DOC_2] : []),
      isNewReportFn: () => true,
      pipelineFn: async (params) => {
        pipelineCalls.push({ actionCode: params.actionCode, pdfUrl: params.pdfUrl });
        return null;
      },
      storeAlertsFn: () => {},
    });

    expect(result.checked).toBe(1);
    expect(result.newReports).toBeGreaterThanOrEqual(1);
    expect(pipelineCalls.length).toBe(1);
    expect(pipelineCalls[0]!.actionCode).toBe("HPG");
    expect(pipelineCalls[0]!.pdfUrl).toBe(FAKE_SSC_DOC_2.url);
  });

  // ── 4. SSC fetch error → graceful degradation, no throw ─────────────────────
  it("handles SSC fetch error gracefully without throwing", async () => {
    const { checkSscReports } = await import(
      "../application/usecases/checkSscReports.js"
    );

    const result = await checkSscReports({
      getWatchlistFn: async () => [{ code: "VCB", alertReportNew: true }],
      listDocsFn: async (_code) => {
        throw new Error("SSC portal unavailable");
      },
      isNewReportFn: () => true,
      pipelineFn: async () => null,
      storeAlertsFn: () => {},
    });

    // Must not throw — errors are swallowed per-stock
    expect(result.checked).toBe(1);
    expect(result.newReports).toBe(0);
    expect(result.errors).toBeGreaterThanOrEqual(1);
  });

  // ── 5. Alert generated for new BCTC report ─────────────────────────────────
  it("calls storeAlertsFn with an alert when a new report is found", async () => {
    const { checkSscReports } = await import(
      "../application/usecases/checkSscReports.js"
    );

    const storedAlerts: Alert[] = [];

    const result = await checkSscReports({
      getWatchlistFn: async () => [{ code: "HPG", alertReportNew: true }],
      listDocsFn: async (code) => (code === "HPG" ? [FAKE_SSC_DOC_2] : []),
      isNewReportFn: () => true,
      pipelineFn: async () => null,
      storeAlertsFn: (alerts) => {
        storedAlerts.push(...alerts);
      },
    });

    expect(result.newReports).toBeGreaterThanOrEqual(1);
    expect(result.alerts).toBeGreaterThanOrEqual(1);
    expect(storedAlerts.length).toBeGreaterThanOrEqual(1);
    expect(storedAlerts[0]!.actionCode).toBe("HPG");
  });

  // ── 6. Multiple watchlist stocks → newReports sums correctly ───────────────
  it("processes multiple watchlist stocks and sums newReports", async () => {
    const { checkSscReports } = await import(
      "../application/usecases/checkSscReports.js"
    );

    const vcbNewDoc = {
      title: "Báo cáo tài chính quý 3 năm 2025 - VCB",
      url: "https://congbothongtin.ssc.gov.vn/faces/document/vcb-q3-2025.pdf",
      publishedAt: "20/10/2025",
      reportType: "quarterly" as const,
    };

    const hpgNewDoc = {
      title: "Báo cáo tài chính quý 3 năm 2025 - HPG",
      url: "https://congbothongtin.ssc.gov.vn/faces/document/hpg-q3-2025.pdf",
      publishedAt: "20/10/2025",
      reportType: "quarterly" as const,
    };

    const result = await checkSscReports({
      getWatchlistFn: async () => [
        { code: "VCB", alertReportNew: true },
        { code: "HPG", alertReportNew: true },
      ],
      listDocsFn: async (code) => {
        if (code === "VCB") return [vcbNewDoc];
        if (code === "HPG") return [hpgNewDoc];
        return [];
      },
      isNewReportFn: () => true,
      pipelineFn: async () => null,
      storeAlertsFn: () => {},
    });

    expect(result.checked).toBe(2);
    expect(result.newReports).toBe(2);
  });

  // ── 7. Cron job CRONS.sscCheck uses 20:00 daily pattern ────────────────────
  it("sscCheck cron is registered with 20:00 daily pattern", async () => {
    const { CRONS } = await import("../scheduler/jobs.js");
    expect(CRONS.sscCheck).toMatch(/0 20 \* \* \*/);
  });

  // ── 8. alert_report_new = false suppresses alert generation ────────────────
  it("does not call storeAlertsFn when alertReportNew is false", async () => {
    const { checkSscReports } = await import(
      "../application/usecases/checkSscReports.js"
    );

    const storedAlerts: Alert[] = [];

    const mbbDoc = {
      title: "Báo cáo tài chính quý 1 năm 2025 - MBB",
      url: "https://congbothongtin.ssc.gov.vn/faces/document/mbb-q1-2025.pdf",
      publishedAt: "15/04/2025",
      reportType: "quarterly" as const,
    };

    const result = await checkSscReports({
      getWatchlistFn: async () => [{ code: "MBB", alertReportNew: false }],
      listDocsFn: async (code) => (code === "MBB" ? [mbbDoc] : []),
      isNewReportFn: () => true,
      pipelineFn: async () => null,
      storeAlertsFn: (alerts) => {
        storedAlerts.push(...alerts);
      },
    });

    expect(result.newReports).toBeGreaterThanOrEqual(1);
    expect(result.alerts).toBe(0);
    expect(storedAlerts.length).toBe(0);
  });

  // ── 9. Default isNewReport checks ssc_url in financial_reports table ────────
  it("default isNewReport: returns false when ssc_url already in financial_reports", async () => {
    const db = getDb();

    // Seed a financial_reports row with a known ssc_url
    db.prepare(`
      INSERT OR REPLACE INTO financial_reports
        (id, action_code, company_name, exchange, domain,
         period_year, period_type, period_start, period_end, sort_key,
         ssc_url, parsed_at,
         balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
      VALUES (?, 'VCB', 'Vietcombank', 'HOSE', 'banking',
              2025, 'Q1', '2025-01-01', '2025-03-31', '2025-Q1',
              ?, datetime('now'),
              '{}', '{}', '{}', '{}')
    `).run("fr-dedup-test-1", FAKE_SSC_DOC.url);

    const { checkSscReports } = await import(
      "../application/usecases/checkSscReports.js"
    );

    const pipelineCalls: unknown[] = [];

    // Use the real DB isNewReport (no isNewReportFn override) to confirm dedup works
    const result = await checkSscReports({
      getWatchlistFn: async () => [{ code: "VCB", alertReportNew: true }],
      listDocsFn: async (code) => (code === "VCB" ? [FAKE_SSC_DOC] : []),
      // No isNewReportFn override — uses the real DB check
      pipelineFn: async () => {
        pipelineCalls.push(true);
        return null;
      },
      storeAlertsFn: () => {},
    });

    expect(result.newReports).toBe(0);
    expect(pipelineCalls.length).toBe(0);
  });
});
