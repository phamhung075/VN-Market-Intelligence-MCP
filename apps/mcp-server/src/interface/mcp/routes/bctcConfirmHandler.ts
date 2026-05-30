/**
 * bctcConfirmHandler.ts — POST /api/bctc-inspect/confirm/{doc_id}
 *                          POST /api/bctc-inspect/confirm/{doc_id}/reset
 *
 * Sprint BCTC-HUMAN-CONFIRM — HC-DEV-3
 * DDD layer: interface (HTTP handler; direct DB update — no application service wrapper
 *            needed: confirm/reset is a single-field status toggle, not a domain operation)
 *
 * Confirm:
 *   - Sets financial_reports.confirm_status = 'CONFIRMED'
 *   - Sets financial_reports.final_confirmed_at = datetime('now')
 *   - Idempotent: re-confirm updates timestamp, returns 200
 *
 * Reset:
 *   - Sets financial_reports.confirm_status = 'PENDING'
 *   - Clears financial_reports.final_confirmed_at = NULL
 *   - Does NOT delete bctc_human_corrections records (AC-FR3-2)
 *
 * HTTP status codes:
 *   400 — invalid UUID
 *   200 — success
 *
 * DI contract: db injected by server.ts. No getDb() here.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { isValidUuid } from "./bctcInspectHandler.js";

/**
 * handleBctcInspectConfirm — POST /api/bctc-inspect/confirm/{doc_id}
 *
 * Locks the report as fully human-confirmed. Idempotent (re-confirm is OK).
 * Does not delete correction records; does not change refine_status.
 *
 * @param req    IncomingMessage (body not used)
 * @param res    ServerResponse
 * @param db     Database (injected, DI pattern)
 * @param docId  Report UUID extracted from path segment
 */
export async function handleBctcInspectConfirm(
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

  // Set confirm_status = CONFIRMED + timestamp
  db.prepare(
    `UPDATE financial_reports
     SET confirm_status = 'CONFIRMED',
         final_confirmed_at = datetime('now'),
         confirmed_by = 'user'
     WHERE id = ?`,
  ).run(docId);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, confirm_status: "CONFIRMED" }));
}

/**
 * handleBctcInspectConfirmReset — POST /api/bctc-inspect/confirm/{doc_id}/reset
 *
 * Unlocks the report back to PENDING for further corrections.
 * AC-FR3-2: bctc_human_corrections records are NOT deleted.
 *
 * @param req    IncomingMessage (body not used)
 * @param res    ServerResponse
 * @param db     Database (injected, DI pattern)
 * @param docId  Report UUID extracted from path segment
 */
export async function handleBctcInspectConfirmReset(
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

  // Reset: PENDING + clear timestamp. Correction records preserved (AC-FR3-2).
  db.prepare(
    `UPDATE financial_reports
     SET confirm_status = 'PENDING',
         final_confirmed_at = NULL
     WHERE id = ?`,
  ).run(docId);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, confirm_status: "PENDING" }));
}
