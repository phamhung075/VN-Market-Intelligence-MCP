/**
 * Application — backfillBctcPdfPaths
 *
 * Idempotent startup task that links on-disk PDFs to financial_reports rows
 * where pdf_path IS NULL (inserted via news-inference fallback path).
 *
 * Problem: ALL 14 real financial_reports rows have pdf_path = NULL because
 * they were inserted by tryNewsChainFallback() which hardcodes pdfPath: null.
 * 17 real PDFs exist at pdfDir. This function resolves the join retroactively.
 *
 * Algorithm:
 *   1. SELECT rows WHERE pdf_path IS NULL (only touches NULL rows — idempotent).
 *   2. Enumerate pdfDir/*.pdf and apply two-pass token matcher against
 *      (action_code, period_year, period_quarter) for each row.
 *   3. Exactly one match → UPDATE financial_reports SET pdf_path = '<abs_path>'.
 *   4. Zero matches → leave NULL, log "no match".
 *   5. Ambiguous (2+ files same ticker/year/quarter) → leave NULL, log "ambiguous".
 *
 * Safety: only writes to pdf_path column; never touches other columns or rows.
 * Zone: apps/mcp-server/ (mcp-server is sole market.db writer).
 *
 * DDD layer: application (injected db + pdfDir; no domain imports; no interface imports).
 */

import type { Database } from "bun:sqlite";
import { readdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BackfillResult {
  /** Rows successfully linked to a PDF file */
  updated: number;
  /** Rows with no matching PDF on disk */
  no_match: number;
  /** Rows where 2+ PDF filenames matched the same (ticker, year, quarter) */
  ambiguous: number;
  /** Rows skipped because pdf_path was already set (idempotency confirmation) */
  already_set: number;
}

/** A parsed token set extracted from a PDF filename */
interface FilenameTokens {
  /** Uppercase stock ticker (2-4+ alpha chars) */
  ticker: string;
  /** 4-digit year in range 2020-2030 */
  year: number;
  /** Quarter 1-4 */
  quarter: number;
  /** Original filename (not the full path) */
  filename: string;
  /** Absolute path to the file */
  absPath: string;
}

interface ReportRow {
  id: string;
  action_code: string;
  period_year: number;
  period_quarter: number | null;
}

// ─── Filename token extractor (two-pass) ──────────────────────────────────────

/**
 * Normalise a filename for token extraction:
 *   - Strip extension
 *   - Uppercase
 *   - Replace hyphens / underscores / dots / spaces with a single space
 */
function normaliseForParsing(filename: string): string {
  // Strip extension
  const noExt = filename.replace(/\.[^.]+$/, "");
  // Uppercase
  const upper = noExt.toUpperCase();
  // Replace all separator chars with space, then collapse multiple spaces
  return upper.replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Extract a 4-digit year (2020-2030) from the token list.
 * Returns the first match found.
 */
function extractYear(tokens: string[]): number | null {
  for (const t of tokens) {
    const m = t.match(/^(202[0-9]|2030)$/);
    if (m) return parseInt(m[1]!, 10);
  }
  return null;
}

/**
 * Extract a quarter (1-4) from the token list.
 *
 * Supported patterns (after normalisation, all uppercase):
 *   Q1 / Q2 / Q3 / Q4
 *   QUY 1 / QUY 2 / QUY 3 / QUY 4   (consecutive tokens)
 *   QUY1 / QUY2 / QUY3 / QUY4        (joined token)
 *   Month 12 / 31 12 / date like "31 12 2025" → month=12 → Q4
 *   Month tokens: JAN-MAR=Q1, APR-JUN=Q2, JUL-SEP=Q3, OCT-DEC=Q4
 */
function extractQuarter(tokens: string[]): number | null {
  // Pass 1a: direct Q1..Q4 token
  for (const t of tokens) {
    const m = t.match(/^Q([1-4])$/);
    if (m) return parseInt(m[1]!, 10);
  }

  // Pass 1b: QUY1..QUY4 (joined, no space)
  for (const t of tokens) {
    const m = t.match(/^QUY([1-4])$/);
    if (m) return parseInt(m[1]!, 10);
  }

  // Pass 1c: "QUY" followed immediately by digit token
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i] === "QUY") {
      const next = tokens[i + 1]!;
      const m = next.match(/^([1-4])$/);
      if (m) return parseInt(m[1]!, 10);
      // Also handle "QUY 1 NAM YYYY" — already covered by the above
    }
  }

  // Pass 2: month-based extraction
  // Look for numeric tokens that could be months (1-12)
  // Context: in filenames like "BCTC VNM 31 12 2025" the "12" is the month
  // Strategy: find a 1-2 digit token that is 1-12, preceded by a day token (1-31)
  // or standing alone as a month indicator
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    // Token that looks like "31" (day) followed by "12" (month) → month=12
    if (/^[12][0-9]$|^3[01]$|^0?[1-9]$/.test(t)) {
      const dayVal = parseInt(t, 10);
      if (dayVal >= 1 && dayVal <= 31 && i + 1 < tokens.length) {
        const next = tokens[i + 1]!;
        const monthVal = parseInt(next, 10);
        if (!isNaN(monthVal) && monthVal >= 1 && monthVal <= 12) {
          // Verify "next" looks like a month (1-2 digits), not a year
          if (/^(1[0-2]|0?[1-9])$/.test(next)) {
            return monthToQuarter(monthVal);
          }
        }
      }
    }
    // Also: standalone month numeric token adjacent to a year token
    // e.g. "12 2025" or "2025 12"
    const numVal = parseInt(t, 10);
    if (!isNaN(numVal) && numVal >= 1 && numVal <= 12 && /^(1[0-2]|0?[1-9])$/.test(t)) {
      // Check neighbours for a year token
      const prevT = i > 0 ? tokens[i - 1]! : "";
      const nextT = i + 1 < tokens.length ? tokens[i + 1]! : "";
      if (/^(202[0-9]|2030)$/.test(prevT) || /^(202[0-9]|2030)$/.test(nextT)) {
        return monthToQuarter(numVal);
      }
    }
  }

  return null;
}

function monthToQuarter(month: number): number {
  if (month <= 3) return 1;
  if (month <= 6) return 2;
  if (month <= 9) return 3;
  return 4;
}

/**
 * Extract a ticker from the token list.
 *
 * Heuristic: the first 2-5 uppercase alpha-only token that is NOT a known
 * keyword (QUY, NAM, HOP, NHAT, BCTC, Q, VN, etc.).
 *
 * The ticker must match the financial_reports.action_code exactly (uppercase).
 * We don't need to derive it from the filename alone — we use it as a filter
 * in the two-pass match (step: does the filename ticker == row.action_code?).
 */
const KEYWORD_SET = new Set([
  "QUY", "NAM", "HOP", "NHAT", "BCTC", "Q", "VN", "VND",
  "BAO", "CAO", "TAI", "CHINH", "KET", "HOP", "KY",
  "SIGNED", "FINAL", "REVISED",
]);

function extractTicker(tokens: string[]): string | null {
  for (const t of tokens) {
    // 2-5 uppercase alpha characters only, not a keyword
    if (/^[A-Z]{2,5}$/.test(t) && !KEYWORD_SET.has(t)) {
      return t;
    }
  }
  return null;
}

/**
 * Parse a PDF filename into (ticker, year, quarter).
 * Returns null if any token cannot be extracted.
 */
export function parsePdfFilenameTokens(filename: string, absPath: string): FilenameTokens | null {
  const normalised = normaliseForParsing(basename(filename));
  const tokens = normalised.split(" ").filter((t) => t.length > 0);

  const year = extractYear(tokens);
  const quarter = extractQuarter(tokens);
  const ticker = extractTicker(tokens);

  if (!year || !quarter || !ticker) return null;

  return { ticker, year, quarter, filename: basename(filename), absPath };
}

// ─── Main backfill function ───────────────────────────────────────────────────

/**
 * Idempotent: selects all financial_reports rows with pdf_path IS NULL,
 * attempts to match each to exactly one file in pdfDir via two-pass token matcher,
 * and UPDATEs pdf_path for unambiguous matches.
 *
 * This is a WRITE to market.db (financial_reports.pdf_path only) — legitimately
 * owned by mcp-server.
 *
 * @param db   Injected DB handle (market.db)
 * @param pdfDir Absolute path to the directory containing PDF files (e.g. /app/data/pdfs)
 */
export function backfillBctcPdfPaths(db: Database, pdfDir: string): BackfillResult {
  const result: BackfillResult = { updated: 0, no_match: 0, ambiguous: 0, already_set: 0 };

  // Guard: pdfDir must exist
  if (!existsSync(pdfDir)) {
    console.warn(`[backfillBctcPdfPaths] pdfDir not found: ${pdfDir} — skipping backfill`);
    return result;
  }

  // Step 1: enumerate all PDF files in pdfDir and parse their tokens
  let pdfFiles: string[];
  try {
    pdfFiles = readdirSync(pdfDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  } catch {
    console.warn(`[backfillBctcPdfPaths] failed to read pdfDir: ${pdfDir} — skipping`);
    return result;
  }

  // Parse tokens for every PDF file upfront
  const parsedFiles: FilenameTokens[] = [];
  for (const f of pdfFiles) {
    const absPath = resolve(pdfDir, f);
    const tokens = parsePdfFilenameTokens(f, absPath);
    if (tokens) {
      parsedFiles.push(tokens);
    }
  }

  // Step 2: select rows with pdf_path IS NULL
  const nullRows = db.prepare(
    `SELECT id, action_code, period_year, period_quarter
     FROM financial_reports
     WHERE pdf_path IS NULL
       AND action_code NOT LIKE '%example%'
       AND action_code NOT LIKE '%error%'
       AND action_code NOT LIKE '%missing%'`,
  ).all() as ReportRow[];

  // Prepare update statement
  const updateStmt = db.prepare(
    `UPDATE financial_reports SET pdf_path = ? WHERE id = ? AND pdf_path IS NULL`,
  );

  // Step 3: for each NULL row, find matching PDFs
  for (const row of nullRows) {
    const actionCode = row.action_code.toUpperCase().trim();
    const year = row.period_year;
    const quarter = row.period_quarter;

    if (!quarter) {
      // Annual reports — no quarter to match against; skip
      result.no_match++;
      continue;
    }

    // Find all PDF files whose (ticker, year, quarter) match this row exactly
    const matches = parsedFiles.filter(
      (f) =>
        f.ticker === actionCode &&
        f.year === year &&
        f.quarter === quarter,
    );

    if (matches.length === 0) {
      console.info(
        `[backfillBctcPdfPaths] no match: ${actionCode} Q${quarter} ${year}`,
      );
      result.no_match++;
    } else if (matches.length === 1) {
      const match = matches[0]!;
      updateStmt.run(match.absPath, row.id);
      console.info(
        `[backfillBctcPdfPaths] linked: ${actionCode} Q${quarter} ${year} → ${match.filename}`,
      );
      result.updated++;
    } else {
      // Ambiguous — 2+ files match the same (ticker, year, quarter)
      const names = matches.map((m) => m.filename).join(", ");
      console.warn(
        `[backfillBctcPdfPaths] ambiguous (${matches.length} files): ${actionCode} Q${quarter} ${year} — [${names}] — leaving pdf_path NULL`,
      );
      result.ambiguous++;
    }
  }

  // Count already-set rows for transparency (informational only — not touched)
  const alreadySet = db.prepare(
    `SELECT COUNT(*) as cnt FROM financial_reports WHERE pdf_path IS NOT NULL AND pdf_path != ''`,
  ).get() as { cnt: number };
  result.already_set = alreadySet.cnt;

  console.info(
    `[backfillBctcPdfPaths] done: updated=${result.updated} no_match=${result.no_match} ambiguous=${result.ambiguous} already_set=${result.already_set}`,
  );

  return result;
}
