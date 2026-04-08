/**
 * Report 1055 regression — BCTC stranded-PDF pipeline fixes.
 *
 * Two closely-related gaps surfaced by the bctc-collector agent:
 *
 *   1. `get_system_status` DATA FRESHNESS reports "BCTC | N/A | Chua co du lieu"
 *      while `list_stored_pdfs` shows multiple PDFs on disk. Root cause: the
 *      PDFs were never parsed into `financial_reports` because the stranded-
 *      PDF feedback rows were stuck — the reparse job silently skipped legacy-
 *      format rows that had no JSON payload.
 *
 *   2. `get_earnings_calendar` shows watchlist stocks QUA HAN with empty
 *      "Ngay nop" even when a PDF exists on disk. Same root cause plus a
 *      per-file dedup collision: `insertFeedbackIfNew` used a title that only
 *      varied by (check, table, rowsAffected), so every per-file
 *      `stranded_bctc_pdf` finding collapsed to the same row and only the
 *      first stranded PDF ever got flagged.
 *
 * Fixes under test:
 *   - parseStrandedDetail() now parses the legacy "TICKER:filename.pdf" prefix
 *     and reconstructs filePath as `${cwd}/data/pdfs/<filename>`.
 *   - buildFindingTitle() appends a filename tag for per-file stranded_bctc_pdf
 *     findings so the dedup guard keys on filename, not just check name.
 */

import { describe, it, expect } from "bun:test";
import { parseStrandedDetail } from "../scheduler/bctcReparseJob.js";
import { buildFindingTitle, type AuditFinding } from "../scheduler/dataAuditJob.js";

describe("Report 1055 — parseStrandedDetail legacy fallback", () => {
  it("reconstructs payload from a legacy 'Stranded PDFs (need re-parse): TICKER:filename' row", () => {
    const detail = "Stranded PDFs (need re-parse): VNM:BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf";
    const parsed = parseStrandedDetail(detail);
    expect(parsed).not.toBeNull();
    expect(parsed!.ticker).toBe("VNM");
    expect(parsed!.filename).toBe("BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf");
    expect(parsed!.filePath.endsWith("data/pdfs/BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf")).toBe(true);
  });

  it("still prefers the JSON payload when both legacy prefix and JSON body exist", () => {
    const detail =
      'VNM:BCTC VNM 31.12.2025.pdf {"ticker":"VNM","filename":"BCTC VNM 31.12.2025.pdf","filePath":"/explicit/path.pdf"}';
    const parsed = parseStrandedDetail(detail);
    expect(parsed!.filePath).toBe("/explicit/path.pdf");
  });
});

describe("Report 1055 — buildFindingTitle per-file dedup tag", () => {
  function makeStranded(filename: string, ticker: string): AuditFinding {
    return {
      table: "financial_reports",
      check: "stranded_bctc_pdf",
      severity: "warning",
      rowsAffected: 1,
      action: "flagged",
      detail: `${ticker}:${filename} {"ticker":"${ticker}","filename":"${filename}","filePath":"/tmp/${filename}"}`,
    };
  }

  it("produces distinct dedup titles for distinct stranded PDFs", () => {
    const a = buildFindingTitle(makeStranded("BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf", "VNM"));
    const b = buildFindingTitle(makeStranded("BCTC VEA 31.12.2025 - RIENG - VN.pdf", "VEA"));
    expect(a).not.toBe(b);
    expect(a).toContain("BCTC VNM");
    expect(b).toContain("BCTC VEA");
  });

  it("produces identical dedup titles for the same stranded PDF seen twice", () => {
    const a = buildFindingTitle(makeStranded("BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf", "VNM"));
    const b = buildFindingTitle(makeStranded("BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf", "VNM"));
    expect(a).toBe(b);
  });

  it("falls back to the plain title for non-stranded findings", () => {
    const finding: AuditFinding = {
      table: "market_prices",
      check: "zero_price_rows",
      severity: "warning",
      rowsAffected: 3,
      action: "auto_cleaned",
      detail: "Deleted 3 rows",
    };
    expect(buildFindingTitle(finding)).toBe(
      "[AUDIT] zero_price_rows — market_prices (3 rows)",
    );
  });
});
