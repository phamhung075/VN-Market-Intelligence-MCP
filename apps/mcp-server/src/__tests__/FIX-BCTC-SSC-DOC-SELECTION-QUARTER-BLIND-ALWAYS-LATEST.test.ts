Bun.env["DB_PATH"] = ":memory:";
/**
 * FIX-BCTC-SSC-DOC-SELECTION-QUARTER-BLIND-ALWAYS-LATEST
 *
 * Full design: docs/architecture-briefs/2026-08-05-fix-bctc-ssc-doc-selection-quarter-blind.md
 * Board row: docs/data/orch/orch-state.json `.task_board` (search this task id).
 *
 * Root cause: `listSscDocuments()` (infrastructure/fetchers/ssc.ts) has no
 * quarter parameter — for a given (ticker, year) every quarter request lists
 * the SAME documents — and `fetchParseAndStoreBctc.ts` Step 1 took `docs[0]`
 * unconditionally, silently returning whichever document the portal happened
 * to list first (100+ live period-mismatch refusals, family A: "supplied Qx
 * -> detected same-year Q4").
 *
 * Tests:
 *   1. Domain unit tests for extractPeriodFromTitle (pure — every live
 *      fixture-title shape found across the SSC/HOSE/HNX/UPCOM fetchers).
 *   2. Application unit tests for selectSscDocumentForPeriod (pure — AC-1
 *      matching candidate selected; AC-2 no-match throws the named error).
 *   3. AC-3 regression: family-A fingerprint replay — a Q1 request against a
 *      listing whose array order is Q4-first must NOT select the Q4 doc.
 *   4. Integration tests through fetchParseAndStoreBctc — AC-1/AC-2 end to
 *      end: a matching candidate among several is selected via the real
 *      listSscDocuments() -> selectSscDocumentForPeriod() path; a no-match
 *      case returns null (never docs[0]) with a debounced Telegram bug.
 */

import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import {
  extractPeriodFromTitle,
} from "../domain/services/financial-reports/documentTitlePeriodExtractor.js";
import {
  selectSscDocumentForPeriod,
  SscDocumentPeriodNotFoundError,
} from "../application/usecases/bctc/selectSscDocument.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import type { HttpClient, SscDocument } from "../infrastructure/fetchers/ssc.js";

// ─────────────────────────────────────────────────────────────────────────────
// Telegram stub — matches the FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-
// CONTENT.test.ts precedent so the debounced Telegram bug call never hits the
// real network during tests, and calls are recorded for assertion.
// ─────────────────────────────────────────────────────────────────────────────

const _realMod = await import(
  Bun.resolveSync("../infrastructure/notifiers/telegram.js", import.meta.dir) + "?isolate=FIX-BCTC-SSC-DOC-SELECTION"
);

const telegramBugCalls: string[] = [];

mock.module("../infrastructure/notifiers/telegram.js", () => ({
  sendTelegramWork: () => Promise.resolve(true),
  sendTelegramMarket: () => Promise.resolve(true),
  sendTelegramBug: (msg: string) => {
    telegramBugCalls.push(msg);
    return Promise.resolve(true);
  },
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

function doc(title: string, url: string, publishedAt: string): SscDocument {
  return { title, url, publishedAt, reportType: "quarterly" };
}

/** Minimal BCTC text — no boundary-date phrases, so parseBctcReport.ts's
 *  Step 0 content guard (periodContentExtractor.ts) is inconclusive (AC-3
 *  negative control there) and never interferes with THIS row's own tests. */
const MINIMAL_BCTC_TEXT = `
BÁO CÁO TÀI CHÍNH
TỔNG CỘNG TÀI SẢN                                   80.000.000
Doanh thu thuần                                     39.500.000
Lợi nhuận sau thuế                                   6.880.000
Lưu chuyển tiền thuần từ hoạt động kinh doanh        5.880.000
`;

/** Builds an HttpClient returning legacy tbl-data HTML (parsed by both
 *  sscPortal.ts and hoseDisclosure.ts's fallback branch — same shape already
 *  proven live by 048-ssc-pipeline.test.ts). */
function makeMockSscHttpClient(rows: SscDocument[]): HttpClient {
  const trs = rows
    .map((r) => `<tr><td><a href="${r.url}">${r.title}</a></td><td>${r.publishedAt}</td></tr>`)
    .join("");
  const html = `<html><body><table class="tbl-data"><tbody>${trs}</tbody></table></body></html>`;
  return { async get(_url: string): Promise<string> { return html; } };
}

function makeMockInsertAnalysis(): { fn: (entry: unknown) => Promise<void>; calls: unknown[] } {
  const calls: unknown[] = [];
  return { fn: async (entry: unknown) => { calls.push(entry); }, calls };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Domain unit tests — extractPeriodFromTitle (pure)
// ─────────────────────────────────────────────────────────────────────────────

describe("extractPeriodFromTitle (domain, pure)", () => {
  it("parses digit quarter + slash year (029-ssc-scraper.test.ts live fixture shape)", () => {
    expect(extractPeriodFromTitle("Báo cáo tài chính quý 1/2025 — VCB")).toEqual({ year: 2025, quarter: 1 });
    expect(extractPeriodFromTitle("Báo cáo tài chính quý 3/2025 — VCB")).toEqual({ year: 2025, quarter: 3 });
  });

  it("parses digit quarter + 'năm' year (104-job-ssc-check.test.ts live fixture shape)", () => {
    expect(extractPeriodFromTitle("Báo cáo tài chính quý 1 năm 2025 - VCB")).toEqual({ year: 2025, quarter: 1 });
    expect(extractPeriodFromTitle("Báo cáo tài chính quý 3 năm 2025 - HPG")).toEqual({ year: 2025, quarter: 3 });
  });

  it("parses roman-numeral quarter (034-telegram-notifier.test.ts live fixture shape)", () => {
    expect(extractPeriodFromTitle("BCTC Quý I 2025 - VCB")).toEqual({ year: 2025, quarter: 1 });
  });

  it("parses abbreviated Q-form (1289f-refinement-direct-api.test.ts live fixture shape)", () => {
    expect(extractPeriodFromTitle("BCTC Q1 2024")).toEqual({ year: 2024, quarter: 1 });
    expect(extractPeriodFromTitle("BCTC Q2 2024")).toEqual({ year: 2024, quarter: 2 });
  });

  it("returns null for an annual title (no quarter marker) — never guesses", () => {
    expect(extractPeriodFromTitle("Báo cáo tài chính năm 2024 — VCB (kiểm toán)")).toBeNull();
  });

  it("returns null for an empty or unrelated title", () => {
    expect(extractPeriodFromTitle("")).toBeNull();
    expect(extractPeriodFromTitle("Test doc")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Application unit tests — selectSscDocumentForPeriod (pure)
// ─────────────────────────────────────────────────────────────────────────────

describe("selectSscDocumentForPeriod (application, pure)", () => {
  const listing: SscDocument[] = [
    doc("Báo cáo tài chính quý 4 năm 2025 - SELTEST", "https://x/q4.pdf", "20/01/2026"),
    doc("Báo cáo tài chính quý 3 năm 2025 - SELTEST", "https://x/q3.pdf", "20/10/2025"),
    doc("Báo cáo tài chính quý 2 năm 2025 - SELTEST", "https://x/q2.pdf", "20/07/2025"),
    doc("Báo cáo tài chính quý 1 năm 2025 - SELTEST", "https://x/q1.pdf", "20/04/2025"),
  ];

  it("AC-1: selects the matching candidate among several", () => {
    const selected = selectSscDocumentForPeriod(listing, "SELTEST", 2025, 1);
    expect(selected.url).toBe("https://x/q1.pdf");

    const selectedQ3 = selectSscDocumentForPeriod(listing, "SELTEST", 2025, 3);
    expect(selectedQ3.url).toBe("https://x/q3.pdf");
  });

  it("AC-2: throws the named error (not docs[0]) when no candidate matches", () => {
    expect(() => selectSscDocumentForPeriod(listing, "SELTEST", 2026, 2)).toThrow(SscDocumentPeriodNotFoundError);
    try {
      selectSscDocumentForPeriod(listing, "SELTEST", 2026, 2);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SscDocumentPeriodNotFoundError);
      expect((err as Error).message).toContain("SELTEST");
      expect((err as Error).message).toContain("2026-Q2");
      expect((err as SscDocumentPeriodNotFoundError).candidateCount).toBe(4);
    }
  });

  it("AC-2 negative control: an empty candidate list also throws the named error", () => {
    expect(() => selectSscDocumentForPeriod([], "EMPTYTEST", 2025, 1)).toThrow(SscDocumentPeriodNotFoundError);
  });

  it("falls back to publishedAt-derived signal when the title cannot be parsed", () => {
    // Title carries no quarter/year marker at all — must fall back to the
    // Vietnamese SSC filing-deadline calendar derived from publishedAt.
    // May-Jul publish -> Q1 of that year (deriveQuarterFromPublishedAt).
    const untitled: SscDocument[] = [
      { title: "Tài liệu công bố thông tin", url: "https://x/untitled.pdf", publishedAt: "15/06/2025", reportType: "quarterly" },
    ];
    const selected = selectSscDocumentForPeriod(untitled, "FALLBACKTEST", 2025, 1);
    expect(selected.url).toBe("https://x/untitled.pdf");
  });

  it("never trusts an empty publishedAt as a signal (no false-positive Q1-current-year match)", () => {
    const noSignal: SscDocument[] = [
      { title: "Tài liệu công bố thông tin", url: "https://x/nosignal.pdf", publishedAt: "", reportType: "quarterly" },
    ];
    expect(() => selectSscDocumentForPeriod(noSignal, "NOSIGNAL", 2025, 1)).toThrow(SscDocumentPeriodNotFoundError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. AC-3 — regression: family-A fingerprint replay
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-3 regression — family-A fingerprint (Q1 request, Q4-first listing)", () => {
  it("does NOT select the Q4 document when the array's first entry is that year's Q4", () => {
    // Reproduces the exact family-A shape recorded on the board row: "supplied
    // Qx -> detected same-year Q4" (e.g. FRT 2024-Q1 -> 2024-Q4, 46 vs 10).
    const listing: SscDocument[] = [
      doc("Báo cáo tài chính quý 4 năm 2024 - FAMILYA", "https://x/famA-q4.pdf", "20/01/2025"),
      doc("Báo cáo tài chính quý 3 năm 2024 - FAMILYA", "https://x/famA-q3.pdf", "20/10/2024"),
      doc("Báo cáo tài chính quý 2 năm 2024 - FAMILYA", "https://x/famA-q2.pdf", "20/07/2024"),
      doc("Báo cáo tài chính quý 1 năm 2024 - FAMILYA", "https://x/famA-q1.pdf", "20/04/2024"),
    ];

    const selected = selectSscDocumentForPeriod(listing, "FAMILYA", 2024, 1);

    expect(selected.title).not.toContain("quý 4");
    expect(selected.url).not.toBe("https://x/famA-q4.pdf");
    expect(selected.url).toBe("https://x/famA-q1.pdf");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Integration tests — fetchParseAndStoreBctc wiring (AC-1/AC-2 end to end)
// ─────────────────────────────────────────────────────────────────────────────

describe("fetchParseAndStoreBctc — Step 1 quarter-aware document selection", () => {
  it("AC-1: selects the period-matching document via the real listSscDocuments() path, not docs[0]", async () => {
    const { fetchParseAndStoreBctc } = await import("../application/usecases/fetchParseAndStoreBctc.js");
    const mockInsert = makeMockInsertAnalysis();

    const listing: SscDocument[] = [
      doc("Báo cáo tài chính quý 4 năm 2025 - INTQ1", "https://x/intq1-q4.pdf", "20/01/2026"),
      doc("Báo cáo tài chính quý 3 năm 2025 - INTQ1", "https://x/intq1-q3.pdf", "20/10/2025"),
      doc("Báo cáo tài chính quý 2 năm 2025 - INTQ1", "https://x/intq1-q2.pdf", "20/07/2025"),
      doc("Báo cáo tài chính quý 1 năm 2025 - INTQ1", "https://x/intq1-q1.pdf", "20/04/2025"),
    ];

    const report = await fetchParseAndStoreBctc({
      actionCode: "INTQ1",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeMockSscHttpClient(listing),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(report).not.toBeNull();
    expect(report!.source.sscUrl).toBe("https://x/intq1-q1.pdf");
    expect(report!.period.sortKey).toBe("2025-Q1");
  });

  it("AC-2: returns null (never docs[0]) when no listed document matches the requested period, with a debounced Telegram bug", async () => {
    const { fetchParseAndStoreBctc } = await import("../application/usecases/fetchParseAndStoreBctc.js");
    const mockInsert = makeMockInsertAnalysis();

    // Listing only has 2024 documents — a 2025-Q1 request has no match.
    const listing: SscDocument[] = [
      doc("Báo cáo tài chính quý 4 năm 2024 - INTNOPE", "https://x/intnope-q4.pdf", "20/01/2025"),
      doc("Báo cáo tài chính quý 1 năm 2024 - INTNOPE", "https://x/intnope-q1.pdf", "20/04/2024"),
    ];

    const callsBefore = telegramBugCalls.length;

    const result1 = await fetchParseAndStoreBctc({
      actionCode: "INTNOPE",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeMockSscHttpClient(listing),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(result1).toBeNull();
    expect(mockInsert.calls.length).toBe(0);
    expect(telegramBugCalls.length).toBe(callsBefore + 1);
    expect(telegramBugCalls[telegramBugCalls.length - 1]).toContain("INTNOPE");
    expect(telegramBugCalls[telegramBugCalls.length - 1]).toContain("2025-Q1");

    // Debounce: an immediate second identical call must NOT fire a second Telegram bug.
    const result2 = await fetchParseAndStoreBctc({
      actionCode: "INTNOPE",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeMockSscHttpClient(listing),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(result2).toBeNull();
    expect(telegramBugCalls.length).toBe(callsBefore + 1);
  });

  it("no-documents-at-all case (docs.length===0) stays distinct from the selection-not-found case — no Telegram fire", async () => {
    const { fetchParseAndStoreBctc } = await import("../application/usecases/fetchParseAndStoreBctc.js");
    const mockInsert = makeMockInsertAnalysis();

    const callsBefore = telegramBugCalls.length;

    const result = await fetchParseAndStoreBctc({
      actionCode: "INTEMPTY",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeMockSscHttpClient([]),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(result).toBeNull();
    expect(telegramBugCalls.length).toBe(callsBefore);
  });
});
