/**
 * BT-3i-A — POST /api/push-bctc-table handler
 *
 * SI-2 boundary: receives structured BCTC table rows from pdf-extractor,
 * validates and UPSERTs into bctc_table_rows + bctc_balance_checks in market.db.
 * mcp-server is the SOLE WRITE OWNER of market.db (architecture invariant).
 *
 * Request body (JSON):
 *   {
 *     report_id: string (UUID),
 *     statement_section: string,
 *     period_current: string,
 *     period_prior: string | null,
 *     rows: BctcTableRowInput[],
 *     balance_check: BalanceCheckInput | null
 *   }
 *
 * Response:
 *   200: { ok: true, rows_stored: N }
 *   400: { error: string }
 *   500: { error: string }
 *
 * Security:
 *   - report_id validated as UUID before any DB write.
 *   - Parameterized SQL only — zero string interpolation.
 *   - Internal pdf_path NEVER exposed.
 *
 * DI contract: db injected by caller (server.ts). No getDb() here.
 * Pattern: mirrors other push handlers (pushPricesHandler, pushForeignFlowHandler).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { isValidUuid } from "./bctcInspectHandler.js";

// ── Types ──────────────────────────────────────────────────────────────────────

interface BctcTableRowInput {
  page_number: number;
  row_order: number;
  code?: string | null;
  label: string;
  value_current?: number | null;
  value_prior?: number | null;
  unit?: string;
  is_summary_row?: number | boolean;
}

interface BalanceCheckInput {
  total_assets?: number | null;
  total_liabilities?: number | null;
  total_equity?: number | null;
  balance_delta?: number | null;
  balance_pass?: boolean | number;
}

interface PushBctcTableBody {
  report_id: string;
  statement_section: string;
  period_current: string;
  period_prior?: string | null;
  rows?: BctcTableRowInput[];
  balance_check?: BalanceCheckInput | null;
}

// ── Handler ────────────────────────────────────────────────────────────────────

/**
 * handlePushBctcTable — accepts the pushed table payload from pdf-extractor.
 *
 * Idempotent: DELETE existing rows for report_id before INSERT, so re-pushes
 * are safe. balance_checks uses INSERT OR REPLACE for the same guarantee.
 *
 * @param req  Incoming request (body already parsed by caller or passed as body param)
 * @param res  Server response
 * @param db   Injected database instance
 * @param body Parsed request body (allows direct injection in tests)
 */
export async function handlePushBctcTable(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  body?: PushBctcTableBody,
): Promise<void> {
  try {
    // Parse body if not pre-injected (production path reads from request stream)
    let parsed: PushBctcTableBody;
    if (body !== undefined) {
      parsed = body;
    } else {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      try {
        parsed = JSON.parse(raw) as PushBctcTableBody;
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
      res.end(JSON.stringify({ error: "invalid_report_id: must be UUID", report_id: reportId }));
      return;
    }

    // ── Validate rows array ──────────────────────────────────────────────────
    const rows = parsed.rows;
    if (!Array.isArray(rows)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "rows must be an array" }));
      return;
    }

    const statementSection = parsed.statement_section ?? "balance_sheet";
    const periodCurrent = parsed.period_current ?? "";
    const periodPrior = parsed.period_prior ?? null;

    // ── Transactional write ──────────────────────────────────────────────────
    db.transaction(() => {
      // Idempotent: delete existing rows for this report_id before re-insert
      db.prepare("DELETE FROM bctc_table_rows WHERE report_id = ?").run(reportId);

      // Bulk INSERT rows using parameterized prepared statement
      const insertRow = db.prepare(`
        INSERT INTO bctc_table_rows
          (report_id, page_number, statement_section, row_order, code, label,
           period_current, value_current, period_prior, value_prior, unit, is_summary_row)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const row of rows) {
        const isSummary = row.is_summary_row ? 1 : 0;
        insertRow.run(
          reportId,
          row.page_number ?? 0,
          statementSection,
          row.row_order ?? 0,
          row.code ?? null,
          row.label ?? "",
          periodCurrent,
          row.value_current ?? null,
          periodPrior,
          row.value_prior ?? null,
          row.unit ?? "vnd",
          isSummary,
        );
      }

      // UPSERT balance_check if provided
      const balanceCheck = parsed.balance_check;
      if (balanceCheck && balanceCheck !== null) {
        const balancePass = balanceCheck.balance_pass ? 1 : 0;
        db.prepare(`
          INSERT OR REPLACE INTO bctc_balance_checks
            (report_id, statement_section, total_assets, total_liabilities, total_equity,
             balance_delta, balance_pass, checked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          reportId,
          statementSection,
          balanceCheck.total_assets ?? null,
          balanceCheck.total_liabilities ?? null,
          balanceCheck.total_equity ?? null,
          balanceCheck.balance_delta ?? null,
          balancePass,
        );
      }
    })();

    // Return success with count of rows stored
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, rows_stored: rows.length }));
  } catch (err) {
    // Never expose internal DB errors to caller
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pushBctcTableHandler] error:", msg);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "server_error" }));
  }
}
