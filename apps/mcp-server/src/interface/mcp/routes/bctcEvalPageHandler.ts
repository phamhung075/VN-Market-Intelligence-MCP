/**
 * bctcEvalPageHandler.ts — GET /api/bctc-eval/{report_id}/page/{page_no}
 *
 * Interface layer. DI: db injected by server.ts handleRequest.
 *
 * Returns the 6-gate report-level eval status PLUS page-scoped annotations
 * for stage 3 (OCR confidence) and stage 4 (TABLE_RECONSTRUCT partial-fragment).
 *
 * Response codes:
 *   200 — gate_strip array of 6 items with page-scoped annotations
 *   400 — invalid UUID (INVALID_UUID) or invalid page_no (INVALID_PAGE_NO)
 *   409 — eval not yet computed (EVAL_NOT_COMPUTED)
 *
 * schema_version: "1"
 *
 * Report-level flags per stage:
 *   Stage 1 RASTERIZE        → report_level: true
 *   Stage 2 LAYOUT_DETECT    → report_level: true
 *   Stage 3 OCR              → report_level: false (page_annotation present)
 *   Stage 4 TABLE_RECONSTRUCT → report_level: false (page_annotation present)
 *   Stage 5 MARKDOWN_RENDER  → report_level: true
 *   Stage 6 STRUCTURED_EXTRACT → report_level: true
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { getEvalForReport, getCurrentDetectorVersion } from "../../../infrastructure/db/bctcEvalStore.js";
import { isValidUuid } from "./bctcInspectHandler.js";

// ─── Stage-level report_level mapping ───────────────────────────────────────

const REPORT_LEVEL_STAGES = new Set([1, 2, 5, 6]);
const LABEL_SUFFIX_REPORT = "(toàn báo cáo)";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OcrPageRow {
  confidence: number | null;
  text_length_chars: number | null;
}

interface LayoutUnitRow {
  unit_id: string;
  page_numbers_json: string;
  row_count: number | null;
  quarantined: number | null;
  quarantine_reason: string | null;
}

interface PdfPathRow {
  pdf_path: string | null;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export function bctcEvalPageHandler(
  _req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  reportId: string,
  pageNo: number,
): void {
  // 400: invalid UUID
  if (!isValidUuid(reportId)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Invalid report_id — must be a UUID",
        code: "INVALID_UUID",
      }),
    );
    return;
  }

  // 400: invalid page_no (must be integer >= 1)
  if (!Number.isInteger(pageNo) || pageNo < 1) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Invalid page_no — must be an integer >= 1",
        code: "INVALID_PAGE_NO",
      }),
    );
    return;
  }

  try {
    // ── 1. Fetch eval rows ─────────────────────────────────────────────────
    const evalRows = getEvalForReport(db, reportId);

    if (!evalRows) {
      // 409: eval not computed yet
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: `Eval not yet computed for report ${reportId}`,
          code: "EVAL_NOT_COMPUTED",
        }),
      );
      return;
    }

    // ── 2. Stage 3 page annotation: OCR confidence + text_length ──────────
    // Production pdf_extracted_text has NO report_id column.
    // Real columns: id, filename, page_number, text_content, confidence,
    //               extracted_at, action_code.
    // Lookup path: resolve pdf_path from financial_reports → extract basename
    // → query pdf_extracted_text by filename + page_number.
    let ocrAnnotation: {
      page_no: number;
      ocr_confidence: number | null;
      text_length_chars: number | null;
      has_ocr_row: boolean;
    };
    // ocr_basename is kept for debug sub-object (S3 page-scoped evidence)
    let ocrBasename: string | null = null;

    const pdfPathRow = db
      .prepare<PdfPathRow, [string]>(
        `SELECT pdf_path FROM financial_reports WHERE id = ? LIMIT 1`,
      )
      .get(reportId) as PdfPathRow | null;

    if (pdfPathRow?.pdf_path) {
      // Extract basename: take the last path segment
      const parts = pdfPathRow.pdf_path.replace(/\\/g, "/").split("/");
      const basename = parts[parts.length - 1] ?? "";
      ocrBasename = basename;
      const ocrByFilename = db
        .prepare<OcrPageRow, [string, number]>(
          `SELECT confidence,
                  LENGTH(text_content) AS text_length_chars
           FROM pdf_extracted_text
           WHERE filename = ?
             AND page_number = ?
           LIMIT 1`,
        )
        .get(basename, pageNo) as OcrPageRow | null;

      if (ocrByFilename !== null) {
        ocrAnnotation = {
          page_no: pageNo,
          ocr_confidence: ocrByFilename.confidence ?? null,
          text_length_chars: ocrByFilename.text_length_chars ?? null,
          has_ocr_row: true,
        };
      } else {
        ocrAnnotation = {
          page_no: pageNo,
          ocr_confidence: null,
          text_length_chars: null,
          has_ocr_row: false,
        };
      }
    } else {
      ocrAnnotation = {
        page_no: pageNo,
        ocr_confidence: null,
        text_length_chars: null,
        has_ocr_row: false,
      };
    }

    // ── 3. Stage 4 page annotation: TABLE_RECONSTRUCT partial-fragment ─────
    // Find PEK layout unit(s) covering this page
    const layoutUnits = db
      .prepare<LayoutUnitRow, [string, number]>(
        `SELECT unit_id, page_numbers_json, row_count, quarantined, quarantine_reason
         FROM bctc_layout_units
         WHERE report_id = ?
           AND EXISTS (
             SELECT 1 FROM json_each(page_numbers_json) WHERE value = ?
           )
         ORDER BY id ASC`,
      )
      .all(reportId, pageNo) as LayoutUnitRow[];

    let tableAnnotation: {
      page_no: number;
      pek_unit_id: string | null;
      pek_unit_page_numbers: number[];
      is_multi_page_unit: boolean;
      partial_fragment_warning: boolean;
      partial_label: string | null;
    };
    // Debug fields for S4 (genuine page-scoped DB evidence only)
    let pekRowCount: number | null = null;
    let pekQuarantined: boolean | null = null;
    let pekQuarantineReason: string | null = null;

    if (layoutUnits.length > 0) {
      const unit = layoutUnits[0]!;
      let pageNumbers: number[] = [];
      try {
        pageNumbers = JSON.parse(unit.page_numbers_json) as number[];
      } catch {
        pageNumbers = [];
      }
      const isMultiPage = pageNumbers.length > 1;
      const minPage = pageNumbers.length > 0 ? Math.min(...pageNumbers) : pageNo;
      const maxPage = pageNumbers.length > 0 ? Math.max(...pageNumbers) : pageNo;

      // Capture debug fields from the unit row (additive — never null-fabricated)
      pekRowCount = unit.row_count ?? null;
      pekQuarantined = unit.quarantined != null ? unit.quarantined !== 0 : null;
      pekQuarantineReason = unit.quarantine_reason ?? null;

      tableAnnotation = {
        page_no: pageNo,
        pek_unit_id: unit.unit_id,
        pek_unit_page_numbers: pageNumbers,
        is_multi_page_unit: isMultiPage,
        partial_fragment_warning: isMultiPage,
        partial_label: isMultiPage
          ? `Đang xem trang ${pageNo} trong đơn vị bảng trải dài trang ${minPage}–${maxPage}`
          : null,
      };
    } else {
      tableAnnotation = {
        page_no: pageNo,
        pek_unit_id: null,
        pek_unit_page_numbers: [],
        is_multi_page_unit: false,
        partial_fragment_warning: false,
        partial_label: null,
      };
    }

    // ── 4. Compute overall status ──────────────────────────────────────────
    const currentVersion = getCurrentDetectorVersion();
    let overallStatus: "green" | "yellow" | "red" = "green";
    for (const row of evalRows) {
      if (row.status === "red") { overallStatus = "red"; break; }
      if (row.status === "yellow") overallStatus = "yellow";
    }
    const isStale = evalRows.some((r) => r.detector_version !== currentVersion);

    // ── 5. Build gate_strip ────────────────────────────────────────────────
    function safeParseSummary(metricsJson: string): string {
      try {
        const m = JSON.parse(metricsJson) as Record<string, unknown>;
        const entries = Object.entries(m)
          .slice(0, 3)
          .map(([k, v]) => `${k}=${String(v)}`)
          .join(", ");
        return entries || "—";
      } catch {
        return "—";
      }
    }

    function safeParseJson(raw: string): unknown {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    const gateStrip = evalRows.map((row) => {
      const isReportLevel = REPORT_LEVEL_STAGES.has(row.stage_no);
      const base = {
        stage_no: row.stage_no,
        stage_name: row.stage_name,
        status: row.status as "green" | "yellow" | "red",
        report_level: isReportLevel,
        label_suffix: isReportLevel ? LABEL_SUFFIX_REPORT : null,
        metrics_summary: safeParseSummary(row.metrics_json),
      };

      // ── debug sub-object (additive — every existing field byte-identical) ──
      const debug: {
        metrics_json: unknown;
        gate_failures_json: unknown;
        golden_diff_json: unknown;
        detector_version: string;
        computed_at: string;
        ocr_filename?: string | null;
        pek_row_count?: number | null;
        pek_quarantined?: boolean | null;
        pek_quarantine_reason?: string | null;
      } = {
        metrics_json: safeParseJson(row.metrics_json),
        gate_failures_json: safeParseJson(row.gate_failures_json),
        golden_diff_json: safeParseJson(row.golden_diff_json),
        detector_version: row.detector_version,
        computed_at: row.computed_at,
      };
      if (row.stage_no === 3) {
        debug.ocr_filename = ocrBasename;
      }
      if (row.stage_no === 4) {
        debug.pek_row_count = pekRowCount;
        debug.pek_quarantined = pekQuarantined;
        debug.pek_quarantine_reason = pekQuarantineReason;
      }

      if (row.stage_no === 3) {
        return { ...base, page_annotation: ocrAnnotation, debug };
      }
      if (row.stage_no === 4) {
        return { ...base, page_annotation: tableAnnotation, debug };
      }
      return { ...base, debug };
    });

    // ── 6. Respond ────────────────────────────────────────────────────────
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        schema_version: "1",
        report_id: reportId,
        page_no: pageNo,
        overall_status: overallStatus,
        is_stale: isStale,
        gate_strip: gateStrip,
      }),
    );
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
        code: "SERVER_ERROR",
      }),
    );
  }
}
