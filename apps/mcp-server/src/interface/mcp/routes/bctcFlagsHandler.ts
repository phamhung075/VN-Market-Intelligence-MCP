/**
 * bctcFlagsHandler.ts — GET /api/bctc-inspect/flags/{doc_id}
 *
 * Sprint BCTC-HUMAN-CONFIRM — HC-DEV-3
 * DDD layer: interface (HTTP handler; delegates to application service)
 *
 * Returns the flagged-cell list for a report via bctcFlagEnumerationService.
 * Each flag: page_number, label, statement_section, flag_type (red/yellow),
 * ocr_value, image_value, current_value, row_id, has_correction.
 *
 * EC-3: refine not complete → 200 with { has_flags: false, reason: 'refine_not_complete' }
 * EC-1: flagged cell with no matching bctc_table_rows row → row_id: null
 *
 * DI contract: db injected by server.ts. No getDb() here.
 * Pattern: follows bctcInspectHandler.ts DI structure.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { isValidUuid } from "./bctcInspectHandler.js";
import { enumerateFlaggedCells } from "../../../application/usecases/bctcFlagEnumerationService.js";

/**
 * handleBctcInspectFlags — GET /api/bctc-inspect/flags/{doc_id}
 *
 * Returns FlagEnumerationResult JSON for the requested report.
 * 400 on invalid UUID; 404 if report not found; 200 for all data cases.
 *
 * @param req    IncomingMessage (unused — GET has no body)
 * @param res    ServerResponse
 * @param db     Database (injected, DI pattern)
 * @param docId  Report UUID extracted from path segment
 */
export async function handleBctcInspectFlags(
  _req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  docId: string,
): Promise<void> {
  // Validate UUID
  if (!isValidUuid(docId)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_uuid" }));
    return;
  }

  // Check report exists
  interface ReportExistsRow { id: string }
  const reportRow = db
    .prepare<ReportExistsRow, [string]>(
      `SELECT id FROM financial_reports WHERE id = ? LIMIT 1`,
    )
    .get(docId);

  if (!reportRow) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "report_not_found", doc_id: docId }));
    return;
  }

  // Enumerate flags using service from HC-DEV-1
  const result = enumerateFlaggedCells(db, docId);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result));
}
