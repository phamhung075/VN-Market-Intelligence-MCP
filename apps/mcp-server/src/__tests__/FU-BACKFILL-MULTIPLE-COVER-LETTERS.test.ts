/**
 * FU-BACKFILL-MULTIPLE-COVER-LETTERS — regression tests hardening
 * backfillBctcPdfPaths' PDF-selection heuristic.
 *
 * Residual weakness #2 from FIX-CTG-PDF-MISLINK (commit 77092007): that fix's
 * "consolidated" bucket was defined by NEGATIVE match only —
 * `matches.filter(m => !isCoverLetterFilename(m.filename))` — i.e. "anything
 * that does not literally look like a cover letter". This is unsound: a file
 * that is neither a recognised cover-letter pattern NOR the real consolidated
 * financial statement (e.g. an explanatory note, an audit-opinion-only PDF,
 * or any other non-report file sharing the same ticker/year/quarter tokens)
 * would slip into the "consolidated" bucket by elimination alone. When
 * exactly one such file was present alongside the real report, the ambiguity
 * count silently inflated (2+ "consolidated" candidates) and the row was
 * left NULL forever instead of healing to the real report — the row never
 * "just picks the first cover letter", but it never resolves either.
 *
 * Fix: `isConsolidatedReportFilename()` — a POSITIVE matcher (Vietnamese
 * "hop nhat" / English "consolidated" marker, mirroring hsxBctcFetcher.ts's
 * existing `rankItem()` "hop nhat" signal). Selection among 2+ candidates now
 * requires a filename to affirmatively match this positive criterion; ANY
 * candidate that fails it (cover letter or otherwise) is excluded — not just
 * ones the cover-letter pattern happens to recognise. Zero positive matches
 * among 2+ candidates now leaves the row PENDING with a loud console.warn
 * (never silently linked to a non-report file).
 *
 * AC-1: synthetic fixture — 2+ cover-letter/non-report PDFs + 1 real
 *       consolidated PDF for the same ticker-quarter → heals to the
 *       CONSOLIDATED PDF via the live production code path
 *       (backfillBctcPdfPaths).
 * AC-2: `legacyNegativeMatchSelect()` below is a frozen, verbatim snapshot of
 *       the PRE-FIX (commit 77092007) NULL-pass decision branches — NOT
 *       imported from the live file, so it can never silently track future
 *       changes to backfillBctcPdfPaths.ts and stop proving the regression.
 *       Run against the IDENTICAL AC-1 fixture, it is asserted to FAIL
 *       (RED) — genuinely reproducing the pre-fix defect, not just
 *       asserting GREEN on the new code.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  backfillBctcPdfPaths,
  isCoverLetterFilename,
  isConsolidatedReportFilename,
  type BackfillResult,
} from "../application/usecases/backfillBctcPdfPaths.js";

// ─── Test helpers (mirrors FIX-CTG-PDF-MISLINK.test.ts fixture pattern) ───────

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_reports (
      id                    TEXT PRIMARY KEY,
      action_code           TEXT NOT NULL,
      company_name          TEXT NOT NULL DEFAULT 'Test Corp',
      exchange              TEXT NOT NULL DEFAULT 'HOSE',
      domain                TEXT NOT NULL DEFAULT 'banking',
      period_year           INTEGER NOT NULL,
      period_quarter        INTEGER,
      period_type           TEXT NOT NULL DEFAULT 'Q1',
      period_start          TEXT NOT NULL DEFAULT '2025-01-01',
      period_end            TEXT NOT NULL DEFAULT '2025-03-31',
      sort_key              TEXT NOT NULL,
      pdf_path              TEXT,
      refine_status         TEXT NOT NULL DEFAULT 'PENDING',
      parsed_at             TEXT NOT NULL DEFAULT (datetime('now')),
      net_revenue           REAL,
      gross_profit          REAL,
      net_profit            REAL,
      net_profit_api_bridge REAL,
      net_margin_pct        REAL,
      ocr_confidence        REAL,
      confidence_financial  REAL,
      extraction_confidence REAL,
      balance_sheet_json    TEXT NOT NULL DEFAULT '{}',
      income_stmt_json      TEXT NOT NULL DEFAULT '{}',
      cash_flow_json        TEXT NOT NULL DEFAULT '{}',
      ratios_json           TEXT NOT NULL DEFAULT '{}',
      UNIQUE(action_code, sort_key)
    )
  `);
  return db;
}

function insertReport(
  db: Database,
  opts: {
    id?: string;
    action_code?: string;
    period_year?: number;
    period_quarter?: number | null;
    sort_key?: string;
    pdf_path?: string | null;
  } = {},
): string {
  const id = opts.id ?? crypto.randomUUID();
  db.prepare(`
    INSERT INTO financial_reports
      (id, action_code, period_year, period_quarter, sort_key, pdf_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    opts.action_code ?? "CTG",
    opts.period_year ?? 2026,
    opts.period_quarter !== undefined ? opts.period_quarter : 1,
    opts.sort_key ?? `${opts.period_year ?? 2026}-Q${opts.period_quarter ?? 1}-${opts.action_code ?? "CTG"}`,
    opts.pdf_path !== undefined ? opts.pdf_path : null,
  );
  return id;
}

function createTempPdfDir(
  files: Array<{ name: string; sizeBytes?: number }>,
): { dir: string; cleanup: () => void } {
  const dir = resolve(tmpdir(), `fu-backfill-multi-cv-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  for (const f of files) {
    writeFileSync(resolve(dir, f.name), Buffer.alloc(f.sizeBytes ?? 20480, 0x25));
  }
  return {
    dir,
    cleanup: () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// AC-2 fixture: the shared candidate set used for both the legacy-RED proof
// and the live-GREEN proof.
//   - 20260428-CTG-CV_CBTT_BCTC-Quy1-2026.pdf → recognised cover letter
//                                          (CV_CBTT marker; ticker-first
//                                          ordering — matches the existing
//                                          "CV_CBTT in the middle of filename"
//                                          fixture already proven in
//                                          FIX-CTG-PDF-MISLINK.test.ts, and
//                                          deliberately avoids the unrelated,
//                                          pre-existing extractTicker()
//                                          KEYWORD_SET gap where a leading
//                                          "CV_" token — as in "CV_CBTT_CTG_..."
//                                          — is itself mistaken for the ticker
//                                          since "CV" is absent from
//                                          KEYWORD_SET; out of this task's
//                                          scope, sidestepped rather than
//                                          silently masked by fixture choice)
//   - CTG_2026_Q1_GiaiTrinh.pdf         → NOT a recognised cover-letter pattern
//                                          (4 segments, no CV_CBTT marker) but
//                                          also NOT the real consolidated report
//                                          (a P&L-variance explanatory note) —
//                                          this is the file the old negative-match
//                                          design could not correctly exclude.
//   - 20260428-CTG-BCTC-hop-nhat-Q1-2026.pdf → the real consolidated report
//                                          ("hop nhat" = Vietnamese "consolidated").
// ═════════════════════════════════════════════════════════════════════════════
const COVER_LETTER_FILE = "20260428-CTG-CV_CBTT_BCTC-Quy1-2026.pdf";
const NON_REPORT_FILE = "CTG_2026_Q1_GiaiTrinh.pdf";
const CONSOLIDATED_FILE = "20260428-CTG-BCTC-hop-nhat-Q1-2026.pdf";

// ═════════════════════════════════════════════════════════════════════════════
// AC-1 — synthetic fixture heals to the CONSOLIDATED PDF via the live
// production code path (backfillBctcPdfPaths).
// ═════════════════════════════════════════════════════════════════════════════

describe("FU-BACKFILL-MULTIPLE-COVER-LETTERS AC-1 — live backfillBctcPdfPaths heals to consolidated", () => {
  let db: Database;
  beforeEach(() => { db = setupTestDb(); });

  test("AC-1: 2+ cover-letter/non-report PDFs + 1 consolidated PDF → heals to consolidated", () => {
    const id = insertReport(db, {
      action_code: "CTG",
      period_year: 2026,
      period_quarter: 1,
      sort_key: "2026-Q1-CTG-multi-cv",
      pdf_path: null,
    });

    const { dir, cleanup } = createTempPdfDir([
      { name: COVER_LETTER_FILE, sizeBytes: 30_720 },
      { name: NON_REPORT_FILE, sizeBytes: 45_000 },
      { name: CONSOLIDATED_FILE, sizeBytes: 6_000_000 },
    ]);
    try {
      const result = backfillBctcPdfPaths(db, dir);

      expect(result.updated).toBe(1);
      expect(result.ambiguous).toBe(0);
      expect(result.no_match).toBe(0);

      const row = db.prepare("SELECT pdf_path FROM financial_reports WHERE id = ?")
        .get(id) as { pdf_path: string | null };
      expect(row.pdf_path).not.toBeNull();
      expect(row.pdf_path).toContain(CONSOLIDATED_FILE);
      expect(row.pdf_path).not.toContain(COVER_LETTER_FILE);
      expect(row.pdf_path).not.toContain(NON_REPORT_FILE);
    } finally { cleanup(); }
  });

  test("AC-1b: 2 RECOGNISED cover-letter-pattern files + 1 consolidated → heals to consolidated (literal backlog wording)", () => {
    const id = insertReport(db, {
      action_code: "CTG",
      period_year: 2026,
      period_quarter: 1,
      sort_key: "2026-Q1-CTG-two-cv",
      pdf_path: null,
    });

    const { dir, cleanup } = createTempPdfDir([
      { name: COVER_LETTER_FILE, sizeBytes: 30_720 },           // cover letter #1 (CV_CBTT marker, ticker-first form)
      { name: "CTG_2026_Q1.pdf", sizeBytes: 20_480 },           // cover letter #2 (short canonical form)
      { name: CONSOLIDATED_FILE, sizeBytes: 6_000_000 },
    ]);
    try {
      const result = backfillBctcPdfPaths(db, dir);
      expect(result.updated).toBe(1);
      expect(result.ambiguous).toBe(0);
      expect(result.no_match).toBe(0);

      const row = db.prepare("SELECT pdf_path FROM financial_reports WHERE id = ?")
        .get(id) as { pdf_path: string | null };
      expect(row.pdf_path).toContain(CONSOLIDATED_FILE);
    } finally { cleanup(); }
  });

  test("AC-3: 2+ candidates, NONE positively match consolidated criteria → leaves PENDING (no wrong link)", () => {
    // Neither file is the real report — one is a recognised cover letter, the
    // other is an unrecognised non-report file. The old negative-match design
    // would have wrongly linked the non-report file (sole "consolidated" by
    // elimination). The hardened positive-match design must instead leave the
    // row NULL/PENDING — never silently pick a non-report PDF.
    const id = insertReport(db, {
      action_code: "CTG",
      period_year: 2026,
      period_quarter: 1,
      sort_key: "2026-Q1-CTG-no-consolidated",
      pdf_path: null,
    });

    const { dir, cleanup } = createTempPdfDir([
      { name: COVER_LETTER_FILE, sizeBytes: 30_720 },
      { name: NON_REPORT_FILE, sizeBytes: 45_000 },
      // no real consolidated PDF present yet
    ]);
    try {
      const result = backfillBctcPdfPaths(db, dir);
      expect(result.updated).toBe(0);
      expect(result.ambiguous).toBe(0);
      expect(result.no_match).toBe(1);

      const row = db.prepare("SELECT pdf_path FROM financial_reports WHERE id = ?")
        .get(id) as { pdf_path: string | null };
      expect(row.pdf_path).toBeNull();
    } finally { cleanup(); }
  });

  test("AC-4: heal pass — row linked to an UNRECOGNISED non-report file (not a cover-letter pattern) still heals once consolidated arrives", () => {
    // Broadens FIX-CTG-PDF-MISLINK's heal-pass guard, which only re-checked
    // rows whose CURRENT link matched isCoverLetterFilename(). A row mislinked
    // to a non-report file that ISN'T a recognised cover-letter pattern was
    // previously never eligible for healing at all.
    const { dir, cleanup } = createTempPdfDir([
      { name: NON_REPORT_FILE, sizeBytes: 45_000 },
      { name: CONSOLIDATED_FILE, sizeBytes: 6_000_000 },
    ]);
    try {
      const id = insertReport(db, {
        action_code: "CTG",
        period_year: 2026,
        period_quarter: 1,
        sort_key: "2026-Q1-CTG-heal-nonreport",
        pdf_path: `${dir}/${NON_REPORT_FILE}`, // mislinked to the non-report file
      });

      const result = backfillBctcPdfPaths(db, dir);
      expect(result.updated).toBe(0);
      expect(result.healed).toBe(1);

      const row = db.prepare("SELECT pdf_path FROM financial_reports WHERE id = ?")
        .get(id) as { pdf_path: string | null };
      expect(row.pdf_path).toContain(CONSOLIDATED_FILE);
      expect(row.pdf_path).not.toContain(NON_REPORT_FILE);
    } finally { cleanup(); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// isConsolidatedReportFilename — positive-match unit tests
// ═════════════════════════════════════════════════════════════════════════════

describe("FU-BACKFILL-MULTIPLE-COVER-LETTERS — isConsolidatedReportFilename() positive matcher", () => {
  test("filename containing 'hop nhat' (hyphenated) positively matches", () => {
    expect(isConsolidatedReportFilename(CONSOLIDATED_FILE)).toBe(true);
  });

  test("filename containing 'hop-nhat' with extra suffix segment positively matches", () => {
    expect(isConsolidatedReportFilename("CTG_2026_Q1_hop_nhat.pdf")).toBe(true);
  });

  test("English 'consolidated' marker positively matches", () => {
    expect(isConsolidatedReportFilename("CTG_2026_Q1_Consolidated_Financial_Statements.pdf")).toBe(true);
  });

  test("recognised cover letter (CV_CBTT) does NOT positively match", () => {
    expect(isConsolidatedReportFilename(COVER_LETTER_FILE)).toBe(false);
  });

  test("unrecognised non-report file (no cover-letter marker, no consolidated marker) does NOT positively match", () => {
    expect(isConsolidatedReportFilename(NON_REPORT_FILE)).toBe(false);
  });

  test("real CTG consolidated filename (Roman-numeral quarter form) positively matches", () => {
    expect(isConsolidatedReportFilename(
      "20260428 - CTG - BCTC hop nhat Quy I.2026 va giai trinh bien dong loi nhuan_signed.pdf",
    )).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC-2 — genuine RED reproduction: the pre-fix (commit 77092007) negative-
// match algorithm, frozen verbatim below, FAILS the AC-1 fixture; the live
// (post-fix) backfillBctcPdfPaths PASSES it.
// ═════════════════════════════════════════════════════════════════════════════

type LegacyDecision =
  | { kind: "linked"; filename: string }
  | { kind: "ambiguous" }
  | { kind: "no_match" };

/**
 * Frozen, verbatim snapshot of the PRE-FIX (commit 77092007) NULL-pass
 * candidate-selection decision from backfillBctcPdfPaths.ts's cover-letter
 * filter block:
 *
 *   const consolidated = matches.filter((m) => !isCoverLetterFilename(m.filename));
 *   const coverLetters = matches.filter((m) => isCoverLetterFilename(m.filename));
 *   if (consolidated.length === 0) {
 *     if (coverLetters.length === 1) { link coverLetters[0] }
 *     else { no_match }
 *   } else if (consolidated.length === 1) { link consolidated[0] }
 *   else { ambiguous }
 *
 * Deliberately NOT imported from the live file (it no longer contains this
 * branch post-fix) — reproduced here so this test keeps proving the
 * regression forever, independent of future edits to backfillBctcPdfPaths.ts.
 * Only decision branches are replicated (no DB/logging side effects).
 */
function legacyNegativeMatchSelect(matches: { filename: string }[]): LegacyDecision {
  if (matches.length === 0) return { kind: "no_match" };
  const consolidated = matches.filter((m) => !isCoverLetterFilename(m.filename));
  const coverLetters = matches.filter((m) => isCoverLetterFilename(m.filename));
  if (consolidated.length === 0) {
    if (coverLetters.length === 1) {
      return { kind: "linked", filename: coverLetters[0]!.filename };
    }
    return { kind: "no_match" };
  } else if (consolidated.length === 1) {
    return { kind: "linked", filename: consolidated[0]!.filename };
  }
  return { kind: "ambiguous" };
}

describe("FU-BACKFILL-MULTIPLE-COVER-LETTERS AC-2 — legacy negative-match RED vs live positive-match GREEN", () => {
  const fixture = [
    { filename: COVER_LETTER_FILE },
    { filename: NON_REPORT_FILE },
    { filename: CONSOLIDATED_FILE },
  ];

  test("RED: pre-fix legacyNegativeMatchSelect does NOT resolve the AC-1 fixture to the consolidated file", () => {
    const decision = legacyNegativeMatchSelect(fixture);
    // The old design pollutes its "consolidated" bucket with NON_REPORT_FILE
    // (fails isCoverLetterFilename, so it counts as "consolidated" by
    // elimination) alongside the real CONSOLIDATED_FILE → 2 candidates →
    // ambiguous. It genuinely fails to heal — this is the reproduced defect.
    expect(decision.kind).not.toBe("linked");
    // Explicitly pin down the failure mode observed pre-fix, so this stays a
    // meaningful regression proof rather than a vague negative assertion.
    expect(decision).toEqual({ kind: "ambiguous" });
  });

  test("GREEN: live backfillBctcPdfPaths DOES resolve the identical fixture to the consolidated file", () => {
    const db = setupTestDb();
    const id = insertReport(db, {
      action_code: "CTG",
      period_year: 2026,
      period_quarter: 1,
      sort_key: "2026-Q1-CTG-red-vs-green",
      pdf_path: null,
    });
    const { dir, cleanup } = createTempPdfDir(
      fixture.map((f) => ({ name: f.filename, sizeBytes: f.filename === CONSOLIDATED_FILE ? 6_000_000 : 30_720 })),
    );
    try {
      const result: BackfillResult = backfillBctcPdfPaths(db, dir);
      expect(result.updated).toBe(1);
      expect(result.ambiguous).toBe(0);

      const row = db.prepare("SELECT pdf_path FROM financial_reports WHERE id = ?")
        .get(id) as { pdf_path: string | null };
      expect(row.pdf_path).toContain(CONSOLIDATED_FILE);
    } finally { cleanup(); }
  });
});
