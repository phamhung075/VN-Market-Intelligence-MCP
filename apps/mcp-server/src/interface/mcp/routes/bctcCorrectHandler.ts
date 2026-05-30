/**
 * bctcCorrectHandler.ts — POST /api/bctc-inspect/correct/{doc_id}
 *
 * Sprint BCTC-HUMAN-CONFIRM — HC-DEV-3
 * DDD layer: interface (HTTP handler; delegates to application service)
 *
 * Accepts JSON body { row_id: number, new_value: number }.
 * Calls bctcCorrectionService.submitCorrection which:
 *   - writes bctc_human_corrections (audit: old→new)
 *   - patches bctc_table_rows.value_current + source_confidence = 1.0
 *
 * HTTP status codes:
 *   400 — invalid UUID | invalid JSON | missing/wrong-type fields | row not found
 *   409 — report confirm_status = 'CONFIRMED' (editing locked)
 *   200 — success: { ok: true, row_id, new_value, source_confidence: 1.0 }
 *
 * DI contract: db injected by server.ts. No getDb() here.
 * Body parsing: async for-loop chunk concatenation (same pattern as server.ts lines 427-435).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { isValidUuid } from "./bctcInspectHandler.js";
import { submitCorrection } from "../../../application/usecases/bctcCorrectionService.js";

/**
 * handleBctcInspectCorrect — POST /api/bctc-inspect/correct/{doc_id}
 *
 * Persists a human correction for a single flagged cell.
 *
 * @param req    IncomingMessage (body: JSON { row_id, new_value })
 * @param res    ServerResponse
 * @param db     Database (injected, DI pattern)
 * @param docId  Report UUID extracted from path segment
 */
export async function handleBctcInspectCorrect(
  req: IncomingMessage,
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

  // Parse JSON body — same pattern as server.ts lines 427-435
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }

  let input: { row_id?: unknown; new_value?: unknown };
  try {
    input = JSON.parse(body) as { row_id?: unknown; new_value?: unknown };
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_json" }));
    return;
  }

  // Validate input types
  if (!Number.isInteger(input.row_id) || typeof input.new_value !== "number") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_input", detail: "row_id phải là số nguyên, new_value phải là số" }));
    return;
  }

  const row_id = input.row_id as number;
  const new_value = input.new_value as number;

  // Delegate to correction service (shared with MCP tool)
  const result = submitCorrection(db, {
    report_id: docId,
    row_id,
    new_value,
    correction_source: "human_ui",
  });

  const statusCode = result.error
    ? (result.http_status ?? 400)
    : 200;

  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result));
}
