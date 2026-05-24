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
 *   - pdf_extracted_text (page-by-page OCR text)
 *   - financial_reports.pdf_path (authoritative absolute path to on-disk PDF)
 *
 * Routes:
 *   GET /api/bctc-inspect               — HTML viewer page
 *   GET /api/bctc-inspect/docs          — list of real docs from financial_reports
 *   GET /api/bctc-inspect/pdf/{doc_id}  — stream PDF bytes (application/pdf)
 *   GET /api/bctc-inspect/ocr/{doc_id}?page=N — OCR text pages from pdf_extracted_text
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

const LIST_SQL = `
  SELECT
    id, action_code, company_name, period_type, period_year, period_quarter, sort_key,
    net_revenue, gross_profit, net_profit, net_profit_api_bridge,
    net_margin_pct, ocr_confidence, confidence_financial, extraction_confidence,
    parsed_at
  FROM financial_reports
  WHERE pdf_path IS NOT NULL
    AND pdf_path != ''
    AND action_code NOT LIKE '%example%'
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

    // For each row we need to check: (1) PDF file on disk, (2) OCR rows exist.
    // Batch the has_ocr check per filename to avoid N+1 queries.
    const pdfPathRows = db.prepare(
      `SELECT id, pdf_path FROM financial_reports
       WHERE pdf_path IS NOT NULL AND pdf_path != ''
         AND action_code NOT LIKE '%example%'
         AND action_code NOT LIKE '%error%'
         AND action_code NOT LIKE '%missing%'
       ORDER BY parsed_at DESC`,
    ).all() as { id: string; pdf_path: string }[];

    // Build a map: id -> pdf_path
    const pdfPathMap = new Map<string, string>(
      pdfPathRows.map((r) => [r.id, r.pdf_path]),
    );

    // Check which basenames have OCR rows — single query with GROUP BY
    const ocrFilenames = db.prepare(
      `SELECT DISTINCT filename FROM pdf_extracted_text`,
    ).all() as { filename: string }[];
    const ocrFilenameSet = new Set(ocrFilenames.map((r) => r.filename));

    const items: DocListItem[] = rows.map((row) => {
      const pdfPath = pdfPathMap.get(row.id) ?? null;
      const hasPdf = pdfPath !== null && existsSync(pdfPath);
      const filename = pdfPath ? basename(pdfPath) : null;
      const hasOcr = filename !== null && ocrFilenameSet.has(filename);

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

export interface OcrPageResponse {
  doc_id: string;
  filename: string | null;
  total_pages: number;
  page: number;
  text_content: string;
  confidence: number;
  has_more: boolean;
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
    const filename = pdfPath ? basename(pdfPath) : null;

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
