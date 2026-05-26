/**
 * MD-INSPECT — POST /api/push-bctc-md-tables handler
 *
 * SI-2 boundary: receives generic markdown tables from pdf-extractor,
 * validates and stores into bctc_md_tables in market.db via INSERT OR REPLACE.
 * Additive: ZERO contact with bctc_table_rows / bctc_balance_checks (Decision A).
 *
 * Request body (JSON):
 *   {
 *     report_id:       string (UUID),
 *     md_tables:       string[],     -- one markdown pipe-table per detected region
 *     ocr_as_markdown: string,       -- full OCR text rendered as markdown
 *     page_count:      number        -- total pages processed
 *   }
 *
 * Response:
 *   200: { ok: true, tables_stored: N }   -- N verified by DB .changes
 *   400: { error: string }
 *   500: { error: string }
 *
 * Security:
 *   - report_id validated as UUID before any DB write.
 *   - Parameterized SQL only — zero string interpolation.
 *
 * Idempotency:
 *   INSERT OR REPLACE on UNIQUE(report_id) — second push with same report_id
 *   replaces the existing row (not duplicated). COUNT remains 1.
 *
 * Write-wedge guard:
 *   tables_stored is taken from db.exec().changes (post-commit DB count),
 *   NOT from a blind echo of the input array length.
 *
 * DI contract: db injected by caller (server.ts). No getDb() here.
 * Pattern: mirrors pushBctcTableHandler.ts.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { isValidUuid } from "./bctcInspectHandler.js";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PushBctcMdTablesBody {
  report_id: string;
  md_tables: string[];
  ocr_as_markdown: string;
  page_count?: number;
}

// ── Handler ────────────────────────────────────────────────────────────────────

/**
 * handlePushBctcMdTables — stores generic markdown tables from pdf-extractor.
 *
 * Idempotent: INSERT OR REPLACE on UNIQUE(report_id) — safe to call twice.
 * tables_stored comes from DB .changes (post-commit), not from input array length.
 *
 * @param req  Incoming request (body parsed from stream or pre-injected for tests)
 * @param res  Server response
 * @param db   Injected database instance
 * @param body Parsed request body (allows direct injection in tests)
 */
export async function handlePushBctcMdTables(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  body?: PushBctcMdTablesBody,
): Promise<void> {
  try {
    // Parse body if not pre-injected (production reads from request stream)
    let parsed: PushBctcMdTablesBody;
    if (body !== undefined) {
      parsed = body;
    } else {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      try {
        parsed = JSON.parse(raw) as PushBctcMdTablesBody;
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_json" }));
        return;
      }
    }

    // ── Validate report_id ───────────────────────────────────────────────────
    const reportId = parsed.report_id;
    if (typeof reportId !== "string" || !isValidUuid(reportId)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "invalid_report_id: must be UUID",
          report_id: reportId,
        }),
      );
      return;
    }

    // ── Validate md_tables array ─────────────────────────────────────────────
    const mdTables = parsed.md_tables;
    if (!Array.isArray(mdTables)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "md_tables must be an array" }));
      return;
    }

    const ocrAsMarkdown =
      typeof parsed.ocr_as_markdown === "string" ? parsed.ocr_as_markdown : "";
    const pageCount =
      typeof parsed.page_count === "number" ? parsed.page_count : 0;
    const tableCount = mdTables.length;

    // Serialise the array to JSON for storage
    const mdTablesJson = JSON.stringify(mdTables);

    // ── Idempotent upsert ────────────────────────────────────────────────────
    // INSERT OR REPLACE: UNIQUE(report_id) ensures a second push with the same
    // report_id replaces the row, not creates a duplicate.
    const result = db
      .prepare(`
        INSERT OR REPLACE INTO bctc_md_tables
          (report_id, md_tables_json, ocr_as_markdown, table_count, page_count, extracted_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `)
      .run(reportId, mdTablesJson, ocrAsMarkdown, tableCount, pageCount);

    // ── Write-wedge guard ───────────────────────────────────────────────────
    // tables_stored comes from DB .changes, NOT from mdTables.length.
    // .changes = 1 after INSERT OR REPLACE (row written), 0 on any failure.
    const tablesStored = result.changes;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, tables_stored: tablesStored }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pushBctcMdTablesHandler] error:", msg);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "server_error" }));
  }
}
