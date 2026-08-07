/**
 * MCP Tool: push_bctc_refined_unit — AC-MCP-OPTY-2
 * size-justification: 292L — FIX-BCTC-REFINE-PAGE-IMAGE-UNAVAILABLE-CAPS-CONFIDENCE
 *   (AC2, landed via 73e65eafc) wired in the image-fetch-degraded signal fire:
 *   hasImageUnavailableFlag/shouldSignalImageFetchDegradation checks plus the
 *   occurrence-counting COUNT(*) and affected-unit_ids SELECT queries, all
 *   scoped to the same db handle + report_id already in this handler's closure.
 *   Extracting that branch into a helper would just re-pass db/report_id/flags
 *   across a file boundary for no net LOC reduction — same one-file-per-MCP-tool
 *   precedent as getBctcRefinedTool.ts (242L), composition-root.ts,
 *   orchStateSchema.ts in this same repo.
 *
 * Sprint BCTC-AGENTIC-REFINE (Option-Y, §0.7.4)
 * DDD layer: interface (write to infra via DB)
 *
 * Upserts one window's result into bctc_refined_units. Called by the host-level
 * fleet cron after each Haiku subagent completes its window refine.
 *
 * Idempotency: INSERT OR REPLACE on UNIQUE(report_id, unit_id) ensures re-run
 * with same data produces stable state (no duplicates — FPT-42-dupes guard).
 *
 * reset flag: when true, DELETE all prior units for the report BEFORE the first
 * push. The fleet cron passes reset=true on the first window of each cron run
 * to clean prior partial data.
 *
 * @module interface/mcp/tools/financial-reports/pushBctcRefinedUnitTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";
import { validateBctcUnit } from "../../../../domain/services/financial-reports/bctcSanityValidator.js";
import {
  hasImageUnavailableFlag,
  shouldSignalImageFetchDegradation,
  writeBctcImageFetchDegradedSignal,
} from "../../../../infrastructure/signals/bctcImageFetchDegradedSignalWriter.js";

// ── Row count helper ───────────────────────────────────────────────────────────

/**
 * Count pipe-table data rows in markdown (exclude header + separator rows).
 * Used to populate bctc_refined_units.row_count.
 */
function countTableRows(markdown: string): number {
  let count = 0;
  let pastSeparator = false;
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^[-:\s]*$/.test(c))) {
      pastSeparator = true;
      continue;
    }
    if (pastSeparator) count++;
  }
  return count;
}

// ── Zod input schema ──────────────────────────────────────────────────────────

const InputSchema = z.object({
  report_id: z.string().min(1).describe("Financial report ID"),
  unit_id: z.string().min(1).describe("Window unit ID (e.g. 'unit-0000')"),
  page_numbers: z.array(z.number().int().min(1)).min(1).describe("Page numbers in this window"),
  markdown: z.string().describe("Refined markdown output from the Haiku subagent"),
  confidence: z.number().min(0).max(1).describe("Confidence score 0.0-1.0"),
  flags: z.array(z.string()).describe("Flags from the subagent (e.g. ['timeout', 'agent_error:...'])"),
  window_status: z
    .enum(["DONE", "FAILED", "REJECTED_SANITY"])
    .describe(
      "Window processing status. REJECTED_SANITY = terminal state, rejected by sanity gate at ingest.",
    ),
  reset: z
    .boolean()
    .optional()
    .describe("If true, DELETE all prior refined_units for this report before push (clean re-run)"),
});

// ── Deps (AC2 — injectable signal writer for tests) ────────────────────────────

export interface PushBctcRefinedUnitDeps {
  /** Best-effort visibility hook — see bctcImageFetchDegradedSignalWriter.ts. */
  writeImageFetchDegradedSignal: (reportId: string, affectedUnitIds: readonly string[]) => void;
}

const defaultPushDeps: PushBctcRefinedUnitDeps = {
  writeImageFetchDegradedSignal: (reportId, affectedUnitIds) =>
    writeBctcImageFetchDegradedSignal(reportId, affectedUnitIds),
};

// ── Handler ───────────────────────────────────────────────────────────────────

export function buildPushBctcRefinedUnitHandler(
  dbOverride?: ReturnType<typeof getDb>,
  deps: PushBctcRefinedUnitDeps = defaultPushDeps,
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

    const {
      report_id,
      unit_id,
      page_numbers,
      markdown,
      confidence,
      flags,
      window_status,
      reset,
    } = parsed.data;

    const db = dbOverride ?? getDb();

    try {
      // If reset=true: DELETE all prior units for this report (idempotent clean re-run)
      if (reset === true) {
        db.prepare("DELETE FROM bctc_refined_units WHERE report_id = ?").run(report_id);
        logger.info("[push_bctc_refined_unit] reset — deleted prior units", { report_id });
      }

      // Compute row_count from markdown
      const row_count = markdown ? countTableRows(markdown) : 0;

      // ── DT-1 Sanity gate (fires AFTER reset DELETE, BEFORE INSERT) ──────────
      // AC-TR0-3-6: gate fires after reset, not before.
      const validation = validateBctcUnit(markdown, confidence, flags, report_id, undefined);

      const blockViolations = validation.violations.filter((v) => v.severity === "BLOCK");
      const hasBlock = blockViolations.length > 0;

      // Effective window_status: override to REJECTED_SANITY on BLOCK
      const effectiveStatus: "DONE" | "FAILED" | "REJECTED_SANITY" = hasBlock
        ? "REJECTED_SANITY"
        : window_status;

      // Effective confidence: use adjusted_confidence from validator
      const effectiveConfidence = validation.adjusted_confidence;

      // Effective flags: append violations on BLOCK (audit trail)
      const effectiveFlags = hasBlock
        ? [...flags, ...blockViolations.map((v) => `sanity:${v.code}`)]
        : flags;

      // INSERT OR REPLACE — idempotent via UNIQUE(report_id, unit_id)
      // INSERT always happens (audit trail preserved) — only window_status changes on BLOCK
      db.prepare(
        `INSERT OR REPLACE INTO bctc_refined_units
           (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, flags, window_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        report_id,
        unit_id,
        JSON.stringify(page_numbers),
        markdown,
        row_count,
        effectiveConfidence,
        JSON.stringify(effectiveFlags),
        effectiveStatus,
      );

      logger.info("[push_bctc_refined_unit] upserted", {
        report_id,
        unit_id,
        window_status: effectiveStatus,
        row_count,
        confidence: effectiveConfidence,
        reset: reset ?? false,
        sanity_block: hasBlock,
      });

      // AC2 (FIX-BCTC-REFINE-PAGE-IMAGE-UNAVAILABLE-CAPS-CONFIDENCE): a 100%
      // image-fetch-plane failure across a whole refine batch silently degrades
      // every affected unit to <=0.6 confidence with nothing visible outside this
      // buried DB flag. Detect repeated `image_unavailable` flags on the SAME
      // report and surface it via signal_queue — best-effort, never blocks the
      // primary push response.
      if (hasImageUnavailableFlag(effectiveFlags)) {
        try {
          const occurrence = db
            .prepare<{ cnt: number }, [string]>(
              `SELECT COUNT(*) as cnt FROM bctc_refined_units
               WHERE report_id = ? AND flags LIKE '%image_unavailable%'`,
            )
            .get(report_id);
          const occurrenceCount = occurrence?.cnt ?? 0;

          if (shouldSignalImageFetchDegradation(occurrenceCount)) {
            const affectedRows = db
              .prepare<{ unit_id: string }, [string]>(
                `SELECT unit_id FROM bctc_refined_units
                 WHERE report_id = ? AND flags LIKE '%image_unavailable%'
                 ORDER BY unit_id`,
              )
              .all(report_id);
            deps.writeImageFetchDegradedSignal(
              report_id,
              affectedRows.map((r) => r.unit_id),
            );
          }
        } catch (signalErr) {
          logger.warn("[push_bctc_refined_unit] image-fetch-degraded signal failed", {
            report_id,
            unit_id,
            error: signalErr instanceof Error ? signalErr.message : String(signalErr),
          });
        }
      }

      if (hasBlock) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ok: false,
                unit_id,
                rejected_reason: blockViolations,
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ok: true, unit_id }),
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[push_bctc_refined_unit] error", { report_id, unit_id, error: msg });
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

export function registerPushBctcRefinedUnitTool(server: McpServer): void {
  const handler = buildPushBctcRefinedUnitHandler();

  server.tool(
    "push_bctc_refined_unit",
    "Push one window's refined result into bctc_refined_units. " +
      "Called by the host-level fleet cron after each Haiku subagent completes. " +
      "Idempotent: INSERT OR REPLACE on UNIQUE(report_id, unit_id). " +
      "reset=true DELETEs all prior units for the report before the first push (clean re-run). " +
      "Output: { ok: true, unit_id } on success or { error: string } on failure.",
    {
      report_id: z.string().min(1).describe("Financial report ID"),
      unit_id: z.string().min(1).describe("Window unit ID (e.g. 'unit-0000')"),
      page_numbers: z.array(z.number().int().min(1)).min(1).describe("Page numbers in this window"),
      markdown: z.string().describe("Refined markdown output from the Haiku subagent"),
      confidence: z.number().min(0).max(1).describe("Confidence score 0.0-1.0"),
      flags: z.array(z.string()).describe("Flags from the subagent (e.g. ['timeout', 'agent_error:...'])"),
      window_status: z
        .enum(["DONE", "FAILED", "REJECTED_SANITY"])
        .describe(
          "Window processing status. REJECTED_SANITY = terminal state, rejected by sanity gate at ingest.",
        ),
      reset: z
        .boolean()
        .optional()
        .describe("If true, DELETE all prior refined_units for this report before push"),
    },
    async (input) => {
      return handler(input);
    },
  );
}
