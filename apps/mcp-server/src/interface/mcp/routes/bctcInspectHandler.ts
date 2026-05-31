/**
 * SI-2 BOUNDARY: BCTC inspection viewer surface.
 * This file is part of the served /api/bctc-inspect viewer (Sprint PDF-INSPECT redo).
 * It is SEPARATE from the pdf-extractor /inspect viewer (to be deprecated).
 * Do NOT touch apps/pdf-extractor/dashboard/ or apps/pdf-extractor/interface/viewer.html.
 *
 * Interface — GET /api/bctc-inspect/* route handlers
 *
 * Serves a side-by-side PDF inspection viewer over mcp-server's own market.db.
 * Data sources:
 *   - financial_reports (document list + parsed figures)
 *   - bctc_layout_units (PEK extraction units — primary source when present)
 *   - pdf_extracted_text (page-by-page OCR text — fallback when no PEK units)
 *   - bctc_table_rows (structured table rows — fallback when no PEK units)
 *   - financial_reports.pdf_path (authoritative absolute path to on-disk PDF)
 *
 * Routes:
 *   GET /api/bctc-inspect               — HTML viewer page
 *   GET /api/bctc-inspect/docs          — list of real docs from financial_reports
 *   GET /api/bctc-inspect/pdf/{doc_id}  — stream PDF bytes (application/pdf)
 *   GET /api/bctc-inspect/ocr/{doc_id}?page=N — OCR text (PEK-priority, fallback pdf_extracted_text)
 *   GET /api/bctc-inspect/table/{doc_id} — structured table (PEK-priority, fallback bctc_table_rows)
 *
 * PEK render-seam (PEK-RENDER-MCP):
 *   has_pek: true  — PEK bctc_layout_units exist for this report; stitched_markdown returned.
 *   has_pek: false — No PEK units; legacy fallback path used. ALWAYS emitted in every response.
 *   pek_coverage_gap: true — PEK units exist for this report but no unit covers the requested page.
 *
 * Security: doc_id is validated as UUID before any DB SELECT or filesystem access.
 * pdf_path is read from DB (server-side), never from user-supplied input — no path traversal.
 * Stored pdf_path is NOT exposed in the list API response (internal container paths).
 *
 * DI contract: db injected by caller (server.ts handleRequest). No getDb() here.
 * Pattern: identical to newsFetchLiveHandler.ts
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { parsePdfFilenameTokens } from "../../../application/usecases/backfillBctcPdfPaths.js";

// ─── UUID validation ──────────────────────────────────────────────────────────

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

// ─── Anomaly detection ────────────────────────────────────────────────────────

/**
 * Returns true when net_profit and net_profit_api_bridge differ by more than 10x
 * in magnitude — the decimal-shift / unit-error signal the user wants to spot.
 *
 * Formula: max(|ocr|, |api|) / max(min(|ocr|, |api|), 1e-9) > 10
 *
 * This correctly catches e.g. ocr=0.000051 vs api=51000 (factor ~1e9 >> 10),
 * and also catches simple 10x errors like ocr=100 vs api=1.
 * Both values in million VND.
 */
export function isDecimalShiftAnomaly(
  netProfitOcr: number | null,
  netProfitApiBridge: number | null,
): boolean {
  if (netProfitOcr === null || netProfitApiBridge === null) return false;
  // If api_bridge is 0, it likely means no API data — skip anomaly flag
  if (netProfitApiBridge === 0) return false;
  const absOcr = Math.abs(netProfitOcr);
  const absApi = Math.abs(netProfitApiBridge);
  if (absOcr === 0 && absApi === 0) return false;
  const larger = Math.max(absOcr, absApi);
  const smaller = Math.min(absOcr, absApi);
  // Use epsilon 1e-9 to avoid division by zero when OCR value is nearly zero
  const ratio = larger / Math.max(smaller, 1e-9);
  return ratio > 10;
}

// ─── DB row shapes ────────────────────────────────────────────────────────────

interface FinancialReportRow {
  id: string;
  action_code: string;
  company_name: string;
  period_type: string;
  period_year: number;
  period_quarter: number | null;
  sort_key: string;
  pdf_path: string | null;
  net_revenue: number | null;
  gross_profit: number | null;
  net_profit: number | null;
  net_profit_api_bridge: number | null;
  net_margin_pct: number | null;
  ocr_confidence: number | null;
  confidence_financial: number | null;
  extraction_confidence: number | null;
  parsed_at: string;
}

interface FinancialReportPdfRow {
  pdf_path: string | null;
}

interface OcrPageRow {
  page_number: number;
  text_content: string;
  confidence: number;
}

// ─── List endpoint ────────────────────────────────────────────────────────────

// REOPEN-2: removed `WHERE pdf_path IS NOT NULL` — all 14 real rows are shown.
// has_pdf is computed at serve time via existsSync(pdf_path).
// Rows with pdf_path IS NULL are still shown (has_pdf: false) so user can see
// news-inference reports (data quality signal). Junk exclusion kept.
const LIST_SQL = `
  SELECT
    id, action_code, company_name, period_type, period_year, period_quarter, sort_key,
    pdf_path,
    net_revenue, gross_profit, net_profit, net_profit_api_bridge,
    net_margin_pct, ocr_confidence, confidence_financial, extraction_confidence,
    parsed_at
  FROM financial_reports
  WHERE action_code NOT LIKE '%example%'
    AND action_code NOT LIKE '%error%'
    AND action_code NOT LIKE '%missing%'
  ORDER BY parsed_at DESC
`;

export interface DocListItem {
  doc_id: string;
  label: string;
  action_code: string;
  company_name: string;
  period_type: string;
  period_year: number;
  period_quarter: number | null;
  sort_key: string;
  /** True when the PDF file exists on disk at the stored pdf_path */
  has_pdf: boolean;
  /** True when pdf_extracted_text has rows for basename(pdf_path) */
  has_ocr: boolean;
  net_profit: number | null;
  net_profit_api_bridge: number | null;
  /** True when |net_profit - net_profit_api_bridge| / |net_profit_api_bridge| > 10 */
  anomaly_decimal_shift: boolean;
  ocr_confidence: number | null;
  confidence_financial: number | null;
  extraction_confidence: number | null;
  parsed_at: string;
}

function buildLabel(row: FinancialReportRow): string {
  // e.g. "VCB Q1 2025" or "VNM ANNUAL 2024"
  const quarter = row.period_quarter ? ` Q${row.period_quarter}` : "";
  return `${row.action_code} ${row.period_type}${quarter} ${row.period_year}`;
}

export function handleBctcInspectDocs(
  _req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): void {
  try {
    const rows = db.prepare(LIST_SQL).all() as FinancialReportRow[];

    // REOPEN-2: pdf_path is now included in each row (see LIST_SQL above).
    // No need for a second query to fetch pdf_path — it comes from the main SELECT.

    // Load all OCR filenames in one query for O(1) has_ocr lookups
    const ocrFilenames = db.prepare(
      `SELECT DISTINCT filename FROM pdf_extracted_text`,
    ).all() as { filename: string }[];
    const ocrFilenameSet = new Set(ocrFilenames.map((r) => r.filename));

    const items: DocListItem[] = rows.map((row) => {
      const pdfPath = row.pdf_path;

      // has_pdf: path stored AND file actually exists on disk at serve time
      const hasPdf = pdfPath !== null && pdfPath !== "" && existsSync(pdfPath);

      // has_ocr primary: filename from stored pdf_path (the authoritative join key)
      let hasOcr = false;
      if (pdfPath && pdfPath !== "") {
        hasOcr = ocrFilenameSet.has(basename(pdfPath));
      }

      // has_ocr secondary: when pdf_path IS NULL, apply token matcher against
      // pdf_extracted_text filenames to find OCR rows by (ticker, year, quarter).
      // This lets the right pane show OCR text even for news-inference rows.
      if (!hasOcr && (!pdfPath || pdfPath === "") && row.period_quarter !== null) {
        const actionCodeUpper = row.action_code.toUpperCase().trim();
        for (const ocrFilename of ocrFilenameSet) {
          const tokens = parsePdfFilenameTokens(ocrFilename, ocrFilename);
          if (
            tokens &&
            tokens.ticker === actionCodeUpper &&
            tokens.year === row.period_year &&
            tokens.quarter === row.period_quarter
          ) {
            hasOcr = true;
            break;
          }
        }
      }

      return {
        doc_id: row.id,
        label: buildLabel(row),
        action_code: row.action_code,
        company_name: row.company_name,
        period_type: row.period_type,
        period_year: row.period_year,
        period_quarter: row.period_quarter,
        sort_key: row.sort_key,
        has_pdf: hasPdf,
        has_ocr: hasOcr,
        net_profit: row.net_profit,
        net_profit_api_bridge: row.net_profit_api_bridge,
        anomaly_decimal_shift: isDecimalShiftAnomaly(
          row.net_profit,
          row.net_profit_api_bridge,
        ),
        ocr_confidence: row.ocr_confidence,
        confidence_financial: row.confidence_financial,
        extraction_confidence: row.extraction_confidence,
        parsed_at: row.parsed_at,
      };
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, count: items.length, items }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

// ─── PDF bytes endpoint ───────────────────────────────────────────────────────

export function handleBctcInspectPdf(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  docId: string,
): void {
  // Validate UUID before any DB access — guard against path traversal
  if (!isValidUuid(docId)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_doc_id", doc_id: docId }));
    return;
  }

  try {
    const row = db
      .prepare(`SELECT pdf_path FROM financial_reports WHERE id = ?`)
      .get(docId) as FinancialReportPdfRow | null;

    if (!row) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "doc_not_found", doc_id: docId }));
      return;
    }

    const pdfPath = row.pdf_path;
    if (!pdfPath) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: "pdf_path_null", doc_id: docId }),
      );
      return;
    }

    if (!existsSync(pdfPath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "pdf_not_on_disk",
          doc_id: docId,
          stored_path: pdfPath,
        }),
      );
      return;
    }

    // Stream the PDF bytes — path comes from DB, not user input
    const pdfBytes = readFileSync(pdfPath);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdfBytes.length),
      "Content-Disposition": `inline; filename="${basename(pdfPath)}"`,
    });
    res.end(pdfBytes);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "server_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

// ─── OCR text endpoint ────────────────────────────────────────────────────────

const PAGE_SIZE = 1; // Return 1 page at a time; caller uses ?page=N

// ─── PEK layout unit row shape ────────────────────────────────────────────────

interface BctcLayoutUnitRow {
  unit_id: string;
  schema_page: number;
  page_numbers_json: string;
  stitched_markdown: string;
  quarantined: number;
}

export interface OcrPageResponse {
  doc_id: string;
  filename: string | null;
  total_pages: number;
  page: number;
  text_content: string;
  confidence: number;
  has_more: boolean;
  /**
   * PEK render-seam flag — ALWAYS present in every response branch.
   * true  = PEK bctc_layout_units exist for this report; stitched_markdown returned.
   * false = No PEK units for this report; legacy pdf_extracted_text fallback used.
   */
  has_pek: boolean;
  /**
   * true when PEK units exist for the report but no unit covers the requested page.
   * Only set when has_pek:true.
   */
  pek_coverage_gap?: boolean;
  /** PEK unit fields — populated when has_pek:true and the page is covered. */
  unit_id?: string | null;
  page_numbers_json?: string | null;
  quarantined?: boolean | null;
  /** Parsed figures from financial_reports for the right-pane figures section */
  figures: FiguresPayload | null;
}

export interface FiguresPayload {
  net_revenue: number | null;
  gross_profit: number | null;
  net_profit: number | null;
  net_profit_api_bridge: number | null;
  net_margin_pct: number | null;
  ocr_confidence: number | null;
  confidence_financial: number | null;
  extraction_confidence: number | null;
  parsed_at: string;
  anomaly_decimal_shift: boolean;
}

interface FiguresRow {
  net_revenue: number | null;
  gross_profit: number | null;
  net_profit: number | null;
  net_profit_api_bridge: number | null;
  net_margin_pct: number | null;
  ocr_confidence: number | null;
  confidence_financial: number | null;
  extraction_confidence: number | null;
  parsed_at: string;
}

export function handleBctcInspectOcr(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  docId: string,
): void {
  // Validate UUID before any DB access
  if (!isValidUuid(docId)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_doc_id", doc_id: docId }));
    return;
  }

  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const rawPage = url.searchParams.get("page") ?? "1";
    const page = Math.max(1, parseInt(rawPage, 10) || 1);

    // Look up pdf_path for the doc_id
    const pathRow = db
      .prepare(`SELECT pdf_path FROM financial_reports WHERE id = ?`)
      .get(docId) as FinancialReportPdfRow | null;

    if (!pathRow) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "doc_not_found", doc_id: docId }));
      return;
    }

    const pdfPath = pathRow.pdf_path;

    // Primary join key: basename of the stored pdf_path
    let filename: string | null = pdfPath ? basename(pdfPath) : null;

    // REOPEN-2: Secondary OCR join — when pdf_path IS NULL, scan
    // pdf_extracted_text filenames for a token match on (action_code, period_year,
    // period_quarter). This lets the right pane show OCR text for news-inference rows.
    if (!filename) {
      // Need action_code + period info for the secondary join
      interface FullReportRow extends FiguresRow {
        action_code: string;
        period_year: number;
        period_quarter: number | null;
      }
      const fullRow = db
        .prepare(
          `SELECT action_code, period_year, period_quarter,
                  net_revenue, gross_profit, net_profit, net_profit_api_bridge,
                  net_margin_pct, ocr_confidence, confidence_financial,
                  extraction_confidence, parsed_at
           FROM financial_reports WHERE id = ?`,
        )
        .get(docId) as FullReportRow | null;

      if (fullRow && fullRow.period_quarter !== null) {
        const actionCodeUpper = fullRow.action_code.toUpperCase().trim();
        const allOcrFilenames = db
          .prepare(`SELECT DISTINCT filename FROM pdf_extracted_text`)
          .all() as { filename: string }[];
        for (const row of allOcrFilenames) {
          const tokens = parsePdfFilenameTokens(row.filename, row.filename);
          if (
            tokens &&
            tokens.ticker === actionCodeUpper &&
            tokens.year === fullRow.period_year &&
            tokens.quarter === fullRow.period_quarter
          ) {
            filename = row.filename;
            break;
          }
        }
      }
    }

    // Fetch parsed figures from financial_reports
    const figRow = db
      .prepare(
        `SELECT net_revenue, gross_profit, net_profit, net_profit_api_bridge,
                net_margin_pct, ocr_confidence, confidence_financial,
                extraction_confidence, parsed_at
         FROM financial_reports WHERE id = ?`,
      )
      .get(docId) as FiguresRow | null;

    const figures: FiguresPayload | null = figRow
      ? {
          net_revenue: figRow.net_revenue,
          gross_profit: figRow.gross_profit,
          net_profit: figRow.net_profit,
          net_profit_api_bridge: figRow.net_profit_api_bridge,
          net_margin_pct: figRow.net_margin_pct,
          ocr_confidence: figRow.ocr_confidence,
          confidence_financial: figRow.confidence_financial,
          extraction_confidence: figRow.extraction_confidence,
          parsed_at: figRow.parsed_at,
          anomaly_decimal_shift: isDecimalShiftAnomaly(
            figRow.net_profit,
            figRow.net_profit_api_bridge,
          ),
        }
      : null;

    // ── PEK render-seam: check bctc_layout_units FIRST ─────────────────────
    // §3 of PEK-RENDER-SEAM brief: PEK units take priority when present.
    // has_pek is ALWAYS emitted in the response (never omitted) — fail-loud guard.

    // Step 1: check if any PEK units exist for this report_id
    const pekCountRow = db
      .prepare<{ cnt: number }, [string]>(
        `SELECT COUNT(*) as cnt FROM bctc_layout_units WHERE report_id = ?`,
      )
      .get(docId) as { cnt: number } | null;
    const hasPekUnits = (pekCountRow?.cnt ?? 0) > 0;

    if (hasPekUnits) {
      // PEK units exist for this report — use PEK path.
      // Find the unit whose page_numbers_json covers the requested page.
      // Use json_each to safely match (LIKE '%7%' would match page 17/27).
      // R-CRIT-1 in brief: json_each available in SQLite 3.38+ (Bun bundles 3.43+).
      const pekUnitRow = db
        .prepare<BctcLayoutUnitRow, [string, number]>(`
          SELECT unit_id, schema_page, page_numbers_json, stitched_markdown, quarantined
          FROM bctc_layout_units
          WHERE report_id = ?
            AND page_type = 'table'
            AND EXISTS (
              SELECT 1 FROM json_each(page_numbers_json) WHERE value = ?
            )
          LIMIT 1
        `)
        .get(docId, page) as BctcLayoutUnitRow | null;

      if (pekUnitRow) {
        // Page covered by a PEK unit — return stitched_markdown
        const response: OcrPageResponse = {
          doc_id: docId,
          filename,
          // total_pages: use pdf_extracted_text count for page nav, or 0 if no filename
          total_pages: filename
            ? (db.prepare(`SELECT COUNT(*) as cnt FROM pdf_extracted_text WHERE filename = ?`).get(filename) as { cnt: number } | null)?.cnt ?? 0
            : 0,
          page,
          text_content: pekUnitRow.stitched_markdown,
          confidence: 1.0,
          has_more: false, // nav driven by PDF pane; PEK unit may span multiple pages
          has_pek: true,
          unit_id: pekUnitRow.unit_id,
          page_numbers_json: pekUnitRow.page_numbers_json,
          quarantined: pekUnitRow.quarantined === 1,
          figures,
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
        return;
      }

      // PEK units exist for the report but no unit covers this page as a 'table' unit.
      // Prose pages have a PEK unit with page_type='prose' but stitched_markdown=''.
      // PROSE-DEV-1 fix: fall back to pdf_extracted_text raw OCR for the page content.
      // pek_coverage_gap:true stays — it signals "no PEK-refined table content here".
      let proseFallbackText = "";
      let proseFallbackConfidence = 0;
      if (filename) {
        const rawRow = db
          .prepare<{ text_content: string; confidence: number }, [string, number]>(`
            SELECT text_content, confidence
            FROM pdf_extracted_text
            WHERE filename = ?
              AND page_number = ?
            LIMIT 1
          `)
          .get(filename, page) as { text_content: string; confidence: number } | null;
        proseFallbackText = rawRow?.text_content ?? "";
        proseFallbackConfidence = rawRow?.confidence ?? 0;
      }

      const response: OcrPageResponse = {
        doc_id: docId,
        filename,
        total_pages: filename
          ? (db.prepare(`SELECT COUNT(*) as cnt FROM pdf_extracted_text WHERE filename = ?`).get(filename) as { cnt: number } | null)?.cnt ?? 0
          : 0,
        page,
        text_content: proseFallbackText,
        confidence: proseFallbackConfidence,
        has_more: false,
        has_pek: true,
        pek_coverage_gap: true,
        unit_id: null,
        page_numbers_json: null,
        quarantined: null,
        figures,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    // ── No PEK units for this report — fall back to pdf_extracted_text ──────
    // has_pek:false is emitted so the UI can show the stale-data banner.

    if (!filename) {
      // No pdf_path → no OCR filename to look up
      const response: OcrPageResponse = {
        doc_id: docId,
        filename: null,
        total_pages: 0,
        page,
        text_content: "",
        confidence: 0,
        has_more: false,
        has_pek: false,
        figures,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    // Count total pages for this filename
    const countRow = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM pdf_extracted_text WHERE filename = ?`,
      )
      .get(filename) as { cnt: number };
    const totalPages = countRow.cnt;

    if (totalPages === 0) {
      const response: OcrPageResponse = {
        doc_id: docId,
        filename,
        total_pages: 0,
        page,
        text_content: "",
        confidence: 0,
        has_more: false,
        has_pek: false,
        figures,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    // Fetch the requested page (1-indexed → 0-indexed OFFSET)
    const offset = page - 1;
    const pageRow = db
      .prepare(
        `SELECT page_number, text_content, confidence
         FROM pdf_extracted_text
         WHERE filename = ?
         ORDER BY page_number ASC
         LIMIT 1 OFFSET ?`,
      )
      .get(filename, offset) as OcrPageRow | null;

    const response: OcrPageResponse = {
      doc_id: docId,
      filename,
      total_pages: totalPages,
      page,
      text_content: pageRow?.text_content ?? "",
      confidence: pageRow?.confidence ?? 0,
      has_more: page < totalPages,
      has_pek: false,
      figures,
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "server_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

// ─── BT-3i-B: Structured table GET endpoint ──────────────────────────────────

interface BctcTableRowDbRow {
  page_number: number;
  row_order: number;
  code: string | null;
  label: string;
  period_current: string;
  value_current: number | null;
  period_prior: string | null;
  value_prior: number | null;
  unit: string;
  is_summary_row: number;
}

interface BctcBalanceCheckDbRow {
  total_assets: number | null;
  total_liabilities: number | null;
  total_equity: number | null;
  balance_delta: number | null;
  balance_pass: number;
  statement_section: string;
}

/**
 * handleBctcInspectTable — GET /api/bctc-inspect/table/{doc_id}
 *
 * Returns structured table rows + balance check for a given doc_id (report_id).
 * When no rows stored: returns {has_table: false} with HTTP 200 (not 404).
 * UUID-validates doc_id before any DB access (same guard as OCR endpoint).
 *
 * Response shape matches the BctcTableResponse interface defined by the architect.
 */
export async function handleBctcInspectTable(
  _req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  docId: string,
): Promise<void> {
  // UUID validation — guard before any DB access
  if (!isValidUuid(docId)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_doc_id", doc_id: docId }));
    return;
  }

  try {
    // ── PEK render-seam: check bctc_layout_units FIRST (§4 brief) ───────────
    // has_pek is ALWAYS emitted — never omitted.

    const pekCountRow = db
      .prepare<{ cnt: number }, [string]>(
        `SELECT COUNT(*) as cnt FROM bctc_layout_units WHERE report_id = ?`,
      )
      .get(docId) as { cnt: number } | null;
    const hasPekUnits = (pekCountRow?.cnt ?? 0) > 0;

    if (hasPekUnits) {
      // PEK units exist — return all units as the structured content
      const pekUnits = db
        .prepare<BctcLayoutUnitRow, [string]>(`
          SELECT unit_id, schema_page, page_numbers_json, stitched_markdown, quarantined
          FROM bctc_layout_units
          WHERE report_id = ?
          ORDER BY schema_page ASC
        `)
        .all(docId) as BctcLayoutUnitRow[];

      const mappedUnits = pekUnits.map((u) => ({
        unit_id: u.unit_id,
        schema_page: u.schema_page,
        page_numbers_json: (() => {
          try { return JSON.parse(u.page_numbers_json); } catch { return []; }
        })(),
        stitched_markdown: u.stitched_markdown,
        quarantined: u.quarantined === 1,
      }));

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          doc_id: docId,
          report_id: docId,
          has_pek: true,
          has_table: false,
          units: mappedUnits,
        }),
      );
      return;
    }

    // ── No PEK units — fall back to bctc_table_rows (has_pek:false) ─────────
    // This is the EXPLICIT, FLAGGED fallback — not silent.

    // Q1: fetch rows ordered by row_order
    const rows = db
      .prepare<BctcTableRowDbRow, [string]>(`
        SELECT page_number, row_order, code, label,
               period_current, value_current, period_prior, value_prior,
               unit, is_summary_row
        FROM bctc_table_rows
        WHERE report_id = ?
        ORDER BY row_order ASC
      `)
      .all(docId);

    // Q2: fetch balance check (single row or null)
    const balanceRow = db
      .prepare<BctcBalanceCheckDbRow, [string]>(`
        SELECT total_assets, total_liabilities, total_equity,
               balance_delta, balance_pass, statement_section
        FROM bctc_balance_checks
        WHERE report_id = ?
      `)
      .get(docId);

    const hasTable = rows.length > 0;

    // Derive period columns from first row (all rows share the same periods)
    const firstRow = rows[0];
    const periodCurrent = firstRow?.period_current ?? "";
    const periodPrior = firstRow?.period_prior ?? null;
    const statementSection = balanceRow?.statement_section ?? "balance_sheet";

    // Build balance_check payload
    const balanceCheck = balanceRow
      ? {
          total_assets: balanceRow.total_assets,
          total_liabilities: balanceRow.total_liabilities,
          total_equity: balanceRow.total_equity,
          balance_delta: balanceRow.balance_delta,
          balance_pass: balanceRow.balance_pass === 1,
        }
      : null;

    // Map DB rows to response shape
    const mappedRows = rows.map((r) => ({
      page_number: r.page_number,
      row_order: r.row_order,
      code: r.code ?? null,
      label: r.label,
      value_current: r.value_current ?? null,
      value_prior: r.value_prior ?? null,
      unit: r.unit,
      is_summary_row: r.is_summary_row === 1,
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        doc_id: docId,
        report_id: docId,
        statement_section: statementSection,
        period_current: periodCurrent,
        period_prior: periodPrior,
        rows: mappedRows,
        balance_check: balanceCheck,
        has_table: hasTable,
        has_pek: false,
      }),
    );
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "server_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

// ─── LF-OVERLAY: Zone-geometry endpoint ──────────────────────────────────────
//
// GET /api/bctc-inspect/zones/{doc_id}?page=N
//
// Returns the zones_json stored in bctc_page_zones for a given report_id + page.
// Pure DB read — no pdf-extractor import, no re-extraction triggered.
// AC-LFO-2: grep-auditable (zero import of pdf-extractor here).
//
// Response 200: { report_id, page_number, unit_id, page_type, is_schema_page,
//                 is_continuation_page, schema_inherited_from_page, zones }
// Response 404: { error: "zone_not_found" }

interface PageZoneDbRow {
  page_number: number;
  unit_id: string;
  page_type: string;
  is_schema_page: number;
  is_continuation_page: number;
  schema_inherited_from_page: number | null;
  zones_json: string;
}

export function handleBctcInspectZones(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  docId: string,
): void {
  if (!isValidUuid(docId)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_doc_id", doc_id: docId }));
    return;
  }

  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const rawPage = url.searchParams.get("page") ?? "1";
    const pageNum = Math.max(1, parseInt(rawPage, 10) || 1);

    const row = db
      .prepare<PageZoneDbRow, [string, number]>(`
        SELECT page_number, unit_id, page_type,
               is_schema_page, is_continuation_page,
               schema_inherited_from_page, zones_json
        FROM bctc_page_zones
        WHERE report_id = ? AND page_number = ?
      `)
      .get(docId, pageNum);

    if (!row) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "zone_not_found", report_id: docId, page_number: pageNum }));
      return;
    }

    let zones: unknown;
    try {
      zones = JSON.parse(row.zones_json);
    } catch {
      zones = {};
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      report_id: docId,
      page_number: row.page_number,
      unit_id: row.unit_id,
      page_type: row.page_type,
      is_schema_page: row.is_schema_page === 1,
      is_continuation_page: row.is_continuation_page === 1,
      schema_inherited_from_page: row.schema_inherited_from_page ?? null,
      zones,
    }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "server_error",
      detail: err instanceof Error ? err.message : String(err),
    }));
  }
}

// ─── AIT-DEV: Agent-input page PNG endpoint ──────────────────────────────────
//
// GET /api/bctc-inspect/page-image/{docId}?page=N
//
// Serves the agent-input rasterized PNG for a given report page directly from
// the named volume /data/bctc-page-images mounted in mcp-server.
// Pattern identical to handleBctcInspectPdf: DB lookup validates docId, then
// direct readFileSync from the absolute volume path — no proxy to pdf-extractor.
//
// Path formula: /data/bctc-page-images/{docId}/page_{0001..}.png
// (docId === report_id; same key used by getBctcPageImageTool.ts)
//
// DDD layer: interface (same precedent as handleBctcInspectPdf — direct file I/O).

export function handleBctcInspectPageImage(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  docId: string,
): void {
  // Validate UUID before any DB access — guard against filesystem probing
  if (!isValidUuid(docId)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_doc_id", doc_id: docId }));
    return;
  }

  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const rawPage = url.searchParams.get("page") ?? "1";
    const page = Math.max(1, parseInt(rawPage, 10) || 1);

    // Verify docId exists in financial_reports — security guard (prevents
    // filesystem probing via fabricated UUIDs; path is server-computed)
    const reportRow = db
      .prepare<{ id: string }, [string]>(
        `SELECT id FROM financial_reports WHERE id = ?`,
      )
      .get(docId) as { id: string } | null;

    if (!reportRow) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "doc_not_found", doc_id: docId }));
      return;
    }

    // Absolute path formula — uses the named volume mount point /data/bctc-page-images
    // NOT process.cwd()/data/... which would resolve to /app/data/... (wrong mount)
    const paddedPage = String(page).padStart(4, "0");
    const pngPath = `/data/bctc-page-images/${docId}/page_${paddedPage}.png`;

    if (!existsSync(pngPath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: "png_not_found", doc_id: docId, page }),
      );
      return;
    }

    const pngBytes = readFileSync(pngPath);
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": String(pngBytes.length),
    });
    res.end(pngBytes);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "server_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

// ─── AIT-DEV: Page-window context endpoint ───────────────────────────────────
//
// GET /api/bctc-inspect/page-window/{docId}?page=N
//
// Returns the refined unit(s) whose page_numbers_json covers the requested page.
// Source: bctc_refined_units (NOT bctc_layout_units) — same SQLite json_each
// pattern as the existing PEK OCR query in handleBctcInspectOcr.
//
// Response: { found: true, unit_id, page_numbers, row_count, confidence }
//        or { found: false } when no unit covers this page.
// Always 200 — miss is not an error; honest empty state on the client side.

interface BctcRefinedUnitRow {
  unit_id: string;
  page_numbers_json: string;
  row_count: number | null;
  confidence: number | null;
}

export function handleBctcInspectPageWindow(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  docId: string,
): void {
  if (!isValidUuid(docId)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_doc_id", doc_id: docId }));
    return;
  }

  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const rawPage = url.searchParams.get("page") ?? "1";
    const page = Math.max(1, parseInt(rawPage, 10) || 1);

    // Query bctc_refined_units for unit(s) covering the requested page
    // json_each(page_numbers_json) safely matches exact page number (avoids LIKE '%N%' false-matches)
    const unitRow = db
      .prepare<BctcRefinedUnitRow, [string, number]>(`
        SELECT unit_id, page_numbers_json, row_count, confidence
        FROM bctc_refined_units
        WHERE report_id = ?
          AND EXISTS (
            SELECT 1 FROM json_each(page_numbers_json) WHERE value = ?
          )
        LIMIT 1
      `)
      .get(docId, page) as BctcRefinedUnitRow | null;

    if (!unitRow) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ found: false, doc_id: docId, page }));
      return;
    }

    let pageNumbers: number[] = [];
    try {
      pageNumbers = JSON.parse(unitRow.page_numbers_json) as number[];
    } catch {
      pageNumbers = [];
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        found: true,
        doc_id: docId,
        page,
        unit_id: unitRow.unit_id,
        page_numbers: pageNumbers,
        row_count: unitRow.row_count ?? null,
        confidence: unitRow.confidence ?? null,
      }),
    );
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "server_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

// ─── Viewer HTML page ─────────────────────────────────────────────────────────

export function handleBctcInspectPage(
  _req: IncomingMessage,
  res: ServerResponse,
): void {
  try {
    // Locate the HTML file relative to this source file at build time
    // In container: /app/src/interface/mcp/routes/bctcInspectHandler.ts
    // HTML is at:   /app/src/interface/bctc-inspector.html
    const htmlPath = resolve(dirname(import.meta.path), "../../bctc-inspector.html");
    const html = readFileSync(htmlPath, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(
      `BCTC Inspector HTML not found: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
