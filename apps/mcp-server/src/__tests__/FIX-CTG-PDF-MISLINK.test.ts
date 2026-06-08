/**
 * FIX-CTG-PDF-MISLINK — TDD tests for cover-letter skip + heal-mislink pass
 * in backfillBctcPdfPaths
 *
 * Acceptance criteria:
 *   AC-1  isCoverLetterFilename — "CTG_2026_Q1.pdf" matches (short canonical form)
 *   AC-2  isCoverLetterFilename — "CV_CBTT_CTG_2026_Q1.pdf" matches cover-letter pattern
 *   AC-3  isCoverLetterFilename — "CV CBTT BCTC Quy I.2026 VI.pdf" matches cover-letter pattern
 *   AC-4  isCoverLetterFilename — "20260428-CTG-BCTC-hop-nhat-Q1-2026.pdf" does NOT match (consolidated)
 *   AC-5  backfillBctcPdfPaths — cover letter + consolidated present → picks consolidated (updated=1, not ambiguous)
 *   AC-6  backfillBctcPdfPaths — sole cover-letter file (no consolidated on disk) → links as best available (updated=1)
 *   AC-6b backfillBctcPdfPaths — multiple cover-letter candidates, no consolidated → no_match (NULL)
 *   AC-7  backfillBctcPdfPaths — single short-form file (no other candidates) → links as before (regression)
 *   AC-8  backfillBctcPdfPaths — two real consolidated files same ticker/year/quarter → still ambiguous
 *   AC-9  isCoverLetterFilename — "CTG_2026_Q1.pdf" (short canonical form with no additional segment) = cover-letter candidate
 *   AC-10 isCoverLetterFilename — "CTG_2026_Q1_hop_nhat.pdf" (has extra segment) = NOT cover letter
 *   AC-11 backfillBctcPdfPaths heal pass — row already linked to cover-letter pdf_path, consolidated arrives → re-links
 *   AC-12 parsePdfFilenameTokens — "Quy I.2026" Roman numeral quarter → quarter=1 (real CTG consolidated filename)
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  backfillBctcPdfPaths,
  isCoverLetterFilename,
  parsePdfFilenameTokens,
} from "../application/usecases/backfillBctcPdfPaths.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

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
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
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

/** Create a temp directory with stub PDF files sized as requested; return dir + cleanup */
function createTempPdfDir(
  files: Array<{ name: string; sizeBytes?: number }>,
): { dir: string; cleanup: () => void } {
  const dir = resolve(tmpdir(), `fix-ctg-mislink-test-${Date.now()}`);
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
// AC-1..4 / AC-9..10 — isCoverLetterFilename unit tests
// ═════════════════════════════════════════════════════════════════════════════

describe("FIX-CTG-PDF-MISLINK AC-1..4/AC-9..10 — isCoverLetterFilename()", () => {
  test("AC-2: CV_CBTT prefix matches cover-letter pattern", () => {
    expect(isCoverLetterFilename("CV_CBTT_CTG_2026_Q1.pdf")).toBe(true);
  });

  test("AC-3: 'CV CBTT' in filename matches cover-letter pattern", () => {
    expect(isCoverLetterFilename("CV CBTT BCTC Quy I.2026 VI.pdf")).toBe(true);
  });

  test("AC-4: consolidated hop-nhat filename does NOT match cover-letter", () => {
    expect(isCoverLetterFilename("20260428-CTG-BCTC-hop-nhat-Q1-2026.pdf")).toBe(false);
  });

  test("AC-9: short canonical 'TICKER_YEAR_Qn.pdf' (no extra segment) = cover-letter candidate", () => {
    // CTG_2026_Q1.pdf — exactly 3 segments after stripping ext → considered a cover-letter
    expect(isCoverLetterFilename("CTG_2026_Q1.pdf")).toBe(true);
  });

  test("AC-10: 'TICKER_YEAR_Qn_hop_nhat.pdf' (extra segment) = NOT a cover letter", () => {
    expect(isCoverLetterFilename("CTG_2026_Q1_hop_nhat.pdf")).toBe(false);
  });

  test("ordinary consolidated long-form filename is not a cover letter", () => {
    expect(isCoverLetterFilename("20260428-CTG-hop-nhat-Quy-1-2026-signed.pdf")).toBe(false);
  });

  test("CV_CBTT in the middle of filename also matches", () => {
    expect(isCoverLetterFilename("20260428-CTG-CV_CBTT_BCTC-Quy1-2026.pdf")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Roman numeral quarter parsing — real CTG 2026-Q1 consolidated filename
// ═════════════════════════════════════════════════════════════════════════════

describe("FIX-CTG-PDF-MISLINK — Roman numeral quarter in parsePdfFilenameTokens", () => {
  test("'Quy I.2026' in filename parses to quarter=1 (real CTG consolidated PDF)", () => {
    const absPath = "/app/data/pdfs/20260428 - CTG - BCTC hop nhat Quy I.2026 va giai trinh bien dong loi nhuan_signed.pdf";
    const result = parsePdfFilenameTokens(
      "20260428 - CTG - BCTC hop nhat Quy I.2026 va giai trinh bien dong loi nhuan_signed.pdf",
      absPath,
    );
    expect(result).not.toBeNull();
    expect(result?.ticker).toBe("CTG");
    expect(result?.year).toBe(2026);
    expect(result?.quarter).toBe(1);
  });

  test("'Quy II.2025' parses to quarter=2", () => {
    const result = parsePdfFilenameTokens("VCB-BCTC-Quy-II.2025-hop-nhat.pdf", "/tmp/t.pdf");
    expect(result?.ticker).toBe("VCB");
    expect(result?.quarter).toBe(2);
  });

  test("'Quy III.2025' parses to quarter=3", () => {
    const result = parsePdfFilenameTokens("VCB-BCTC-Quy-III.2025-hop-nhat.pdf", "/tmp/t.pdf");
    expect(result?.quarter).toBe(3);
  });

  test("'Quy IV.2025' parses to quarter=4", () => {
    const result = parsePdfFilenameTokens("VCB-BCTC-Quy-IV.2025-hop-nhat.pdf", "/tmp/t.pdf");
    expect(result?.quarter).toBe(4);
  });

  test("real CTG consolidated is NOT a cover letter", () => {
    expect(isCoverLetterFilename(
      "20260428 - CTG - BCTC hop nhat Quy I.2026 va giai trinh bien dong loi nhuan_signed.pdf",
    )).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC-5..8 — backfillBctcPdfPaths with cover-letter filtering
// ═════════════════════════════════════════════════════════════════════════════

describe("FIX-CTG-PDF-MISLINK AC-5..8 — backfillBctcPdfPaths cover-letter preference", () => {
  let db: Database;

  beforeEach(() => { db = setupTestDb(); });

  test("AC-5: cover letter + consolidated → picks consolidated (not ambiguous)", () => {
    // CTG 2026 Q1: cover letter (CTG_2026_Q1.pdf) + consolidated long-form
    const id = insertReport(db, {
      action_code: "CTG",
      period_year: 2026,
      period_quarter: 1,
      sort_key: "2026-Q1-CTG",
      pdf_path: null,
    });

    const { dir, cleanup } = createTempPdfDir([
      { name: "CTG_2026_Q1.pdf", sizeBytes: 20480 },           // 2-page cover letter stub
      { name: "20260428-CTG-BCTC-hop-nhat-Q1-2026.pdf", sizeBytes: 6_000_000 },  // 62-page consolidated
    ]);
    try {
      const result = backfillBctcPdfPaths(db, dir);
      // Must pick the consolidated PDF, not be ambiguous
      expect(result.updated).toBe(1);
      expect(result.ambiguous).toBe(0);
      expect(result.no_match).toBe(0);

      // Verify it picked the consolidated file, not the cover letter
      const row = db.prepare("SELECT pdf_path FROM financial_reports WHERE id = ?")
        .get(id) as { pdf_path: string | null };
      expect(row.pdf_path).not.toBeNull();
      expect(row.pdf_path).toContain("hop-nhat");
      expect(row.pdf_path).not.toContain("CTG_2026_Q1.pdf");
    } finally { cleanup(); }
  });

  test("AC-6: ONLY cover letter present (sole candidate) → links it as best available", () => {
    // When CTG_2026_Q1.pdf is the ONLY file on disk for CTG Q1 2026, it is the
    // sole candidate — linking it is better than leaving pdf_path NULL forever.
    // The cover-letter filter only kicks in when a consolidated alternative exists.
    const id = insertReport(db, {
      action_code: "CTG",
      period_year: 2026,
      period_quarter: 1,
      sort_key: "2026-Q1-CTG-cv",
      pdf_path: null,
    });

    const { dir, cleanup } = createTempPdfDir([
      { name: "CTG_2026_Q1.pdf", sizeBytes: 20480 },  // only cover letter, no consolidated
    ]);
    try {
      const result = backfillBctcPdfPaths(db, dir);
      // Sole candidate → link it even if it looks like a cover letter
      expect(result.updated).toBe(1);
      expect(result.no_match).toBe(0);
      expect(result.ambiguous).toBe(0);

      const row = db.prepare("SELECT pdf_path FROM financial_reports WHERE id = ?")
        .get(id) as { pdf_path: string | null };
      expect(row.pdf_path).not.toBeNull();
      expect(row.pdf_path).toContain("CTG_2026_Q1.pdf");
    } finally { cleanup(); }
  });

  test("AC-7: single consolidated file (no cover letter) → links as before (regression)", () => {
    const id = insertReport(db, {
      action_code: "VCB",
      period_year: 2025,
      period_quarter: 1,
      sort_key: "2025-Q1-VCB",
      pdf_path: null,
    });

    const { dir, cleanup } = createTempPdfDir([
      { name: "VCB_2025_Q1.pdf", sizeBytes: 6_000_000 },  // single file — not filtered (no consolidated available)
    ]);
    try {
      // Single file: cover-letter heuristic applies only when a non-cover candidate exists
      // Single-candidate passthrough: one file → links it regardless
      const result = backfillBctcPdfPaths(db, dir);
      expect(result.updated).toBe(1);
      expect(result.ambiguous).toBe(0);

      const row = db.prepare("SELECT pdf_path FROM financial_reports WHERE id = ?")
        .get(id) as { pdf_path: string | null };
      expect(row.pdf_path).toContain("VCB_2025_Q1.pdf");
    } finally { cleanup(); }
  });

  test("AC-8: two real consolidated files same ticker/year/quarter → still ambiguous", () => {
    const id = insertReport(db, {
      action_code: "VCB",
      period_year: 2025,
      period_quarter: 1,
      sort_key: "2025-Q1-VCB-amb",
      pdf_path: null,
    });

    const { dir, cleanup } = createTempPdfDir([
      { name: "20250429-VCB-BCTC-hop-nhat-Quy-1-2025.pdf", sizeBytes: 5_000_000 },
      { name: "20250430-VCB-BCTC-hop-nhat-Quy-1-2025-revised.pdf", sizeBytes: 5_100_000 },
    ]);
    try {
      const result = backfillBctcPdfPaths(db, dir);
      // Two genuine consolidated candidates → still ambiguous
      expect(result.ambiguous).toBe(1);
      expect(result.updated).toBe(0);

      const row = db.prepare("SELECT pdf_path FROM financial_reports WHERE id = ?")
        .get(id) as { pdf_path: string | null };
      expect(row.pdf_path).toBeNull();
    } finally { cleanup(); }
  });

  test("AC-6b: zero matching PDFs for a row → no_match (NULL)", () => {
    // ACB row with no ACB PDF on disk → no_match.
    const id = insertReport(db, {
      action_code: "ACB",
      period_year: 2026,
      period_quarter: 1,
      sort_key: "2026-Q1-ACB",
      pdf_path: null,
    });

    const { dir, cleanup } = createTempPdfDir([
      { name: "CTG_2026_Q1.pdf", sizeBytes: 20480 },  // wrong ticker — won't match ACB
    ]);
    try {
      const result = backfillBctcPdfPaths(db, dir);
      // ACB row has no candidates → no_match
      expect(result.no_match).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.ambiguous).toBe(0);

      const row = db.prepare("SELECT pdf_path FROM financial_reports WHERE id = ?")
        .get(id) as { pdf_path: string | null };
      expect(row.pdf_path).toBeNull();
    } finally { cleanup(); }
  });

  test("CV_CBTT explicit-prefix cover letter + consolidated → picks consolidated", () => {
    const id = insertReport(db, {
      action_code: "CTG",
      period_year: 2026,
      period_quarter: 1,
      sort_key: "2026-Q1-CTG-cv2",
      pdf_path: null,
    });

    const { dir, cleanup } = createTempPdfDir([
      { name: "CV_CBTT_BCTC_CTG_2026_Q1.pdf", sizeBytes: 30720 },
      { name: "20260428-CTG-hop-nhat-Quy-1-2026-signed.pdf", sizeBytes: 6_200_000 },
    ]);
    try {
      const result = backfillBctcPdfPaths(db, dir);
      expect(result.updated).toBe(1);
      expect(result.ambiguous).toBe(0);

      const row = db.prepare("SELECT pdf_path FROM financial_reports WHERE id = ?")
        .get(id) as { pdf_path: string | null };
      expect(row.pdf_path).toContain("hop-nhat");
    } finally { cleanup(); }
  });

  test("AC-11: heal-mislink — row already linked to cover-letter, consolidated arrives → re-links", () => {
    // Simulate row 69fa303f scenario: CTG 2026 Q1 was previously linked to the
    // cover-letter CTG_2026_Q1.pdf (by an earlier backfill run). Then the consolidated
    // PDF was fetched (FIX-CTG-3). On next startup, the heal pass must correct the link.
    const { dir, cleanup } = createTempPdfDir([
      { name: "CTG_2026_Q1.pdf", sizeBytes: 20480 },
      { name: "20260428-CTG-BCTC-hop-nhat-Q1-2026.pdf", sizeBytes: 6_000_000 },
    ]);
    try {
      // Insert with pdf_path already pointing at the cover letter (wrong link)
      const id = insertReport(db, {
        action_code: "CTG",
        period_year: 2026,
        period_quarter: 1,
        sort_key: "2026-Q1-CTG-heal",
        pdf_path: `${dir}/CTG_2026_Q1.pdf`,  // already set to the cover letter
      });

      const result = backfillBctcPdfPaths(db, dir);
      // NULL-pass skips it (pdf_path is NOT NULL); heal-pass must fix it
      expect(result.updated).toBe(0);   // not touched by NULL pass
      expect(result.healed).toBe(1);    // healed by the heal pass

      const row = db.prepare("SELECT pdf_path FROM financial_reports WHERE id = ?")
        .get(id) as { pdf_path: string | null };
      expect(row.pdf_path).not.toBeNull();
      expect(row.pdf_path).toContain("hop-nhat");
      expect(row.pdf_path).not.toContain("CTG_2026_Q1.pdf");
    } finally { cleanup(); }
  });
});
