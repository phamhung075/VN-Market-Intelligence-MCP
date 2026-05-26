/**
 * MD-INSPECT — GET /api/bctc-inspect/md/{doc_id} handler
 *
 * SI-2 boundary: pure DB read for generic markdown tables stored in bctc_md_tables.
 * Additive: ZERO contact with bctc_table_rows / bctc_balance_checks (Decision A).
 * No compute-on-read — Tesseract at 3-5s/page is not viable per-request.
 *
 * Routes:
 *   GET /api/bctc-inspect/md/{doc_id}
 *
 * Response shapes:
 *   When row exists:
 *     {
 *       doc_id:          "<uuid>",
 *       report_id:       "<uuid>",
 *       has_md_tables:   true,
 *       table_count:     3,
 *       page_count:      7,
 *       md_tables:       ["| Col1 | Col2 |\n|---|---|\n...", ...],
 *       ocr_as_markdown: "## Section\n...",
 *       extracted_at:    "2026-05-26T..."
 *     }
 *   When no row:
 *     { "has_md_tables": false }   HTTP 200 (not 404)
 *
 * Security:
 *   - doc_id validated as UUID before any DB SELECT.
 *   - Non-UUID returns 400.
 *
 * DI contract: db injected by caller (server.ts). No getDb() here.
 * Pattern: mirrors handleBctcInspectTable in bctcInspectHandler.ts.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { isValidUuid } from "./bctcInspectHandler.js";

// ── DB row shape ───────────────────────────────────────────────────────────────

interface BctcMdTablesDbRow {
  report_id: string;
  md_tables_json: string;
  ocr_as_markdown: string;
  table_count: number;
  page_count: number;
  extracted_at: string;
}

// ── Handler ────────────────────────────────────────────────────────────────────

/**
 * handleBctcInspectMd — GET /api/bctc-inspect/md/{doc_id}
 *
 * Returns the full markdown table payload for a doc, or {has_md_tables: false}
 * when no row is stored yet. UUID-validates doc_id before DB access.
 *
 * @param _req  Incoming request (unused — doc_id comes from URL segment)
 * @param res   Server response
 * @param db    Injected database instance
 * @param docId UUID string extracted from the URL path segment
 */
export async function handleBctcInspectMd(
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
    const row = db
      .prepare<BctcMdTablesDbRow, [string]>(`
        SELECT report_id, md_tables_json, ocr_as_markdown, table_count, page_count, extracted_at
        FROM bctc_md_tables
        WHERE report_id = ?
      `)
      .get(docId);

    // No row stored yet — return {has_md_tables: false} with HTTP 200 (not 404)
    if (!row) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ has_md_tables: false }));
      return;
    }

    // Parse md_tables_json back to string[]
    let mdTables: string[] = [];
    try {
      const parsed = JSON.parse(row.md_tables_json);
      mdTables = Array.isArray(parsed) ? parsed : [];
    } catch {
      // Malformed JSON in DB — return empty array, not a crash
      mdTables = [];
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        doc_id: docId,
        report_id: row.report_id,
        has_md_tables: true,
        table_count: row.table_count,
        page_count: row.page_count,
        md_tables: mdTables,
        ocr_as_markdown: row.ocr_as_markdown,
        extracted_at: row.extracted_at,
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
