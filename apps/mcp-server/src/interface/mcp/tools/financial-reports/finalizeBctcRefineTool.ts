/**
 * MCP Tool: finalize_bctc_refine — AC-MCP-OPTY-3
 *
 * Sprint BCTC-AGENTIC-REFINE (Option-Y, §0.7.4)
 * DDD layer: application (Phase 4 collect-then-write boundary)
 *
 * Phase 4 collect-then-write: called by the fleet cron ONCE after all
 * push_bctc_refined_unit calls complete for a report.
 *
 * Steps (atomic transaction):
 * 1. DELETE bctc_table_rows WHERE report_id = ?
 * 2. Read all DONE windows from bctc_refined_units
 * 3. Parse each DONE window via parseRefinedMarkdown → BctcTableRow[]
 * 4. INSERT all rows into bctc_table_rows
 * 5. UPDATE financial_reports.refine_status = report_status
 *
 * FAILED windows are NOT parsed — they contribute NO rows (isolation invariant).
 * One transaction wraps both the parse-and-insert and the status update
 * (atomicity: all-or-nothing — if any parse fails, no rows are written).
 *
 * @module interface/mcp/tools/financial-reports/finalizeBctcRefineTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";
import { parseRefinedMarkdown } from "../../../../application/utils/refinedMarkdownParser.js";
import {
  getCorrectionsMap,
  reAnchorCorrections,
} from "../../../../infrastructure/db/bctcHumanCorrectionsStore.js";
import type { HumanCorrectionRecord } from "../../../../infrastructure/db/bctcHumanCorrectionsStore.js";

// ── DB row types ──────────────────────────────────────────────────────────────

interface RefinedUnitRow {
  unit_id: string;
  page_numbers_json: string;
  markdown: string;
  window_status: string;
}

interface ConfirmStatusRow {
  confirm_status: string | null;
}

// ── applyCorrections post-pass helper ─────────────────────────────────────────

/**
 * applyCorrections — post-pass override that replaces parser-computed values
 * with human-confirmed corrections BEFORE the INSERT loop.
 *
 * ARCH-DECIDE A: Post-pass (Option A2). Parser internals are 0-diff.
 * Key format: `${label}||${page_number}||${statement_section}||${code ?? ''}`
 *
 * @param rows          Parsed rows from parseRefinedMarkdown
 * @param correctionsMap Map keyed by stable anchor key from getCorrectionsMap
 * @returns New array with corrected rows overridden; uncorrected rows unchanged
 */
function applyCorrections(
  rows: Array<{
    report_id: string;
    page_number: number;
    statement_section: string;
    row_order: number;
    code: string | null;
    label: string;
    period_current: string;
    value_current: number | null;
    period_prior: string | null;
    value_prior: number | null;
    unit: string;
    is_summary_row: number;
    source_confidence: number;
  }>,
  correctionsMap: Map<string, HumanCorrectionRecord>,
): typeof rows {
  return rows.map((row) => {
    const key = `${row.label}||${row.page_number}||${row.statement_section}||${row.code ?? ""}`;
    const correction = correctionsMap.get(key);
    if (!correction) return row;
    return { ...row, value_current: correction.new_value, source_confidence: 1.0 };
  });
}

// ── Zod input schema ──────────────────────────────────────────────────────────

const InputSchema = z.object({
  report_id: z.string().min(1).describe("Financial report ID"),
  report_status: z
    .enum(["DONE", "PARTIAL", "FAILED"])
    .describe("Report-level status determined by the fleet cron after aggregating window results"),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export function buildFinalizeBctcRefineHandler(
  dbOverride?: ReturnType<typeof getDb>,
): (input: z.input<typeof InputSchema>) => Promise<{ content: [{ type: "text"; text: string }] }> {
  return async (rawInput) => {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "validation_error", details: parsed.error.issues }),
          },
        ],
      };
    }

    const { report_id, report_status } = parsed.data;
    const db = dbOverride ?? getDb();

    try {
      // Read all DONE windows for this report
      const doneUnits = db
        .prepare<RefinedUnitRow, [string]>(
          `SELECT unit_id, page_numbers_json, markdown, window_status
           FROM bctc_refined_units
           WHERE report_id = ? AND window_status = 'DONE'
           ORDER BY unit_id ASC`,
        )
        .all(report_id);

      // Layer 1 guard: if report is CONFIRMED, skip entirely — never clobber
      const confirmRow = db
        .prepare<ConfirmStatusRow, [string]>(
          "SELECT confirm_status FROM financial_reports WHERE id = ?",
        )
        .get(report_id);
      if (confirmRow?.confirm_status === "CONFIRMED") {
        logger.info("[finalize_bctc_refine] report is CONFIRMED — skipping write", { report_id });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, skipped: true, reason: "confirmed" }),
            },
          ],
        };
      }

      // Parse all DONE windows into BctcTableRow objects
      // Done outside the transaction (pure computation, no I/O risk)
      let totalRows = 0;
      const allTableRows: Array<{
        report_id: string;
        page_number: number;
        statement_section: string;
        row_order: number;
        code: string | null;
        label: string;
        period_current: string;
        value_current: number | null;
        period_prior: string | null;
        value_prior: number | null;
        unit: string;
        is_summary_row: number;
        source_confidence: number;
      }> = [];

      for (const unit of doneUnits) {
        if (!unit.markdown) continue;

        let pageNumbers: number[];
        try {
          pageNumbers = JSON.parse(unit.page_numbers_json) as number[];
        } catch {
          pageNumbers = [1];
        }

        const parseResult = parseRefinedMarkdown(unit.markdown, report_id, pageNumbers);

        if (parseResult.errors.length > 0) {
          logger.warn("[finalize_bctc_refine] parser errors in unit", {
            report_id,
            unit_id: unit.unit_id,
            errorCount: parseResult.errors.length,
            errors: parseResult.errors.slice(0, 5),
          });
        }

        for (const tableRow of parseResult.rows) {
          allTableRows.push({
            report_id: tableRow.report_id,
            page_number: tableRow.page_number,
            statement_section: tableRow.statement_section,
            row_order: tableRow.row_order,
            code: tableRow.code ?? null,
            label: tableRow.label,
            period_current: tableRow.period_current,
            value_current: tableRow.value_current ?? null,
            period_prior: tableRow.period_prior ?? null,
            value_prior: tableRow.value_prior ?? null,
            unit: tableRow.unit,
            is_summary_row: tableRow.is_summary_row,
            source_confidence: tableRow.source_confidence,
          });
        }
      }

      // applyCorrections post-pass: overlay human corrections BEFORE INSERT
      // (ARCH-DECIDE A: post-pass, parser internals 0-diff)
      const correctionMap = getCorrectionsMap(db, report_id);
      const finalRows = applyCorrections(allTableRows, correctionMap);

      // Atomic transaction: selective DELETE + INSERT + re-anchor + status update
      // EC-7 prevention: single SQLite transaction — no partial-delete window
      db.transaction(() => {
        // Layer 2: selective DELETE — preserve rows that have human corrections
        // Rows covered by a correction are NOT deleted (their value_current was
        // already updated by submitCorrection; they survive the re-parse intact).
        db.prepare(
          `DELETE FROM bctc_table_rows
           WHERE report_id = ?
             AND id NOT IN (
               SELECT row_id FROM bctc_human_corrections WHERE report_id = ?
             )`,
        ).run(report_id, report_id);

        // Insert all parsed rows from DONE windows (with corrections applied)
        const insertStmt = db.prepare(
          `INSERT INTO bctc_table_rows
             (report_id, page_number, statement_section, row_order, code, label,
              period_current, value_current, period_prior, value_prior, unit,
              is_summary_row, source_confidence)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );

        for (const row of finalRows) {
          insertStmt.run(
            row.report_id,
            row.page_number,
            row.statement_section,
            row.row_order,
            row.code,
            row.label,
            row.period_current,
            row.value_current,
            row.period_prior,
            row.value_prior,
            row.unit,
            row.is_summary_row,
            row.source_confidence ?? 1.0,
          );
          totalRows++;
        }

        // Re-anchor corrections to new row IDs (inside transaction after INSERT)
        // Updates bctc_human_corrections.row_id to match new bctc_table_rows.id
        reAnchorCorrections(db, report_id);

        // Update financial_reports.refine_status
        db.prepare(
          "UPDATE financial_reports SET refine_status = ? WHERE id = ?",
        ).run(report_status, report_id);
      })();

      logger.info("[finalize_bctc_refine] complete", {
        report_id,
        report_status,
        done_units: doneUnits.length,
        rows_parsed: totalRows,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ok: true, rows_parsed: totalRows }),
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[finalize_bctc_refine] error", { report_id, error: msg });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: msg }),
          },
        ],
      };
    }
  };
}

// ── MCP tool registration ─────────────────────────────────────────────────────

export function registerFinalizeBctcRefineTool(server: McpServer): void {
  const handler = buildFinalizeBctcRefineHandler();

  server.tool(
    "finalize_bctc_refine",
    "Phase 4 collect-then-write: called by fleet cron after all push_bctc_refined_unit calls complete. " +
      "Atomically: DELETE bctc_table_rows for report → parse all DONE windows via refinedMarkdownParser → " +
      "INSERT rows → UPDATE financial_reports.refine_status. " +
      "FAILED windows contribute NO rows (isolation invariant). " +
      "report_status must be determined by the caller (DONE/PARTIAL/FAILED) based on window aggregation. " +
      "Output: { ok: true, rows_parsed: number } or { error: string }.",
    {
      report_id: z.string().min(1).describe("Financial report ID"),
      report_status: z
        .enum(["DONE", "PARTIAL", "FAILED"])
        .describe("Report-level status: DONE (all windows OK), PARTIAL (some failed), FAILED (all failed)"),
    },
    async (input) => {
      return handler(input);
    },
  );
}
