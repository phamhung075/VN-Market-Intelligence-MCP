/**
 * bctcRefineJob.ts — FR-12 BCTC Agentic Refine Helpers (AR-MCP-OPTY)
 *
 * Sprint BCTC-AGENTIC-REFINE
 * DDD layer: application (orchestration use case helpers)
 *
 * OPTION-Y (§0.7.2 ruling): The production spawn path (spawn("claude",...)) and
 * the cron entry point runBctcRefineJob() have been DELETED. Orchestration now
 * lives on the host-level fleet cron (CC Agent/Task subagent fan-out).
 *
 * What remains:
 *   - refineOneReport() — orchestrates a single report via DI deps (used by tests)
 *   - spawnWindowSubagent() — thin wrapper; production path deleted; test mock path RETAINED
 *   - partitionIntoWindows() — re-exported from application/utils/windowPartitioner
 *   - runBoundedPool() — re-exported from application/utils/boundedPool
 *   - fetchAllPageTexts() — page-text fetcher (used by refineOneReport in tests)
 *
 * The 3 new MCP tools (get_bctc_pending_refine, push_bctc_refined_unit,
 * finalize_bctc_refine) are the production entry points for the fleet cron.
 *
 * @module scheduler/financial-reports/bctcRefineJob
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { claimTask, releaseTask } from "../../infrastructure/db/coordinationStore.js";
import { classifyPageForImageLoad } from "../../application/utils/pageClassifier.js";
import { parseRefinedMarkdown } from "../../application/utils/refinedMarkdownParser.js";
import { partitionIntoWindows as _partitionIntoWindows } from "../../application/utils/windowPartitioner.js";
import { runBoundedPool as _runBoundedPool } from "../../application/utils/boundedPool.js";
import { basename } from "node:path";

// ── Re-exports (consumers importing from this file still work) ─────────────────

export { partitionIntoWindows } from "../../application/utils/windowPartitioner.js";
export { runBoundedPool } from "../../application/utils/boundedPool.js";
export type { PageText, Window } from "../../application/utils/windowPartitioner.js";

// ── Config ─────────────────────────────────────────────────────────────────────

const REFINE_FANOUT_CONCURRENCY = parseInt(Bun.env.REFINE_FANOUT_CONCURRENCY ?? "5", 10);
const REFINE_WINDOW_TIMEOUT_S = parseInt(Bun.env.REFINE_WINDOW_TIMEOUT_S ?? "120", 10);
const REFINE_MAX_WINDOW_PAGES = parseInt(Bun.env.REFINE_MAX_WINDOW_PAGES ?? "3", 10);

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WindowResult {
  unit_id: string;
  page_numbers: number[];
  markdown: string;
  confidence: number;
  flags: string[];
  status: "DONE" | "FAILED";
}

// ── Window subagent (test mock path RETAINED; production spawn path DELETED) ───

/**
 * spawnWindowSubagent — test-injectable subagent wrapper.
 *
 * OPTION-Y (§0.7.2): The production spawn("claude", ...) block has been DELETED.
 * This function now ONLY supports the test injection path (deps.spawnSubagent).
 * If called without deps.spawnSubagent in production, it returns FAILED immediately.
 *
 * The fleet cron on the host calls individual CC subagents via the Task tool;
 * it does NOT call this function. This wrapper exists for test harness compatibility only.
 */
export async function spawnWindowSubagent(
  reportId: string,
  win: { unit_id: string; page_numbers: number[]; texts?: string[]; needsImage?: boolean[] },
  timeoutMs: number,
  deps: {
    spawnSubagent?: (reportId: string, win: { unit_id: string; page_numbers: number[] }) => Promise<WindowResult>;
  } = {},
): Promise<WindowResult> {
  // Allow injection for testing
  if (deps.spawnSubagent) {
    try {
      const result = await Promise.race([
        deps.spawnSubagent(reportId, win),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), timeoutMs),
        ),
      ]);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg === "timeout";
      return {
        unit_id: win.unit_id,
        page_numbers: win.page_numbers,
        markdown: "",
        confidence: 0.0,
        flags: [isTimeout ? "timeout" : `agent_error:${msg}`],
        status: "FAILED",
      };
    }
  }

  // Production path DELETED per Option-Y ruling (§0.7.2).
  // In-container spawn("claude",...) is non-runnable — claude CLI absent.
  // The fleet cron handles subagent invocation on the host.
  logger.warn("[bctcRefineJob] spawnWindowSubagent called without deps.spawnSubagent — returning FAILED (Option-Y: use fleet cron)", {
    reportId,
    unitId: win.unit_id,
  });
  return {
    unit_id: win.unit_id,
    page_numbers: win.page_numbers,
    markdown: "",
    confidence: 0.0,
    flags: ["agent_error:no_spawn_path_option_y"],
    status: "FAILED",
  };
}

// ── Row count helper ───────────────────────────────────────────────────────────

export function countRows(markdown: string): number {
  // Count pipe-table data rows (exclude header + separator)
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

// ── Fetch all page texts (Phase 1) ────────────────────────────────────────────

export interface FetchPageTextsDeps {
  /**
   * Override per-page text fetching (test injection).
   * When provided, called for each page in the page list instead of the DB read.
   */
  getPageTextFn?: ((reportId: string, filename: string, pageNum: number) => Promise<string>) | undefined;
  /**
   * Override the page list source (test injection).
   * Return an array of { page_number, text_content } rows in ascending order.
   * When provided, the DB query for pdf_extracted_text is skipped entirely.
   */
  getPageListFn?: ((filename: string) => Promise<Array<{ page_number: number; text_content: string }>>) | undefined;
  /**
   * DB instance for reading pdf_extracted_text (production path).
   * Defaults to getDb() if omitted. Injected in tests that share an in-memory DB.
   */
  db?: Database | undefined;
}

/**
 * Fetch OCR text for all pages of a report.
 *
 * Production path (no injection):
 *   1. Query `SELECT DISTINCT page_number, text_content FROM pdf_extracted_text
 *             WHERE filename = ? ORDER BY page_number` (up to MAX_PAGES rows).
 *   2. Iterate exactly those page numbers — missing interior pages are SKIPPED,
 *      never treated as EOF. This fixes the DGC-0c6f0535 truncation defect where
 *      page 27 was absent from OCR and all pages 28-46 were silently dropped.
 *   3. text_content comes directly from DB rows (same data the HTTP proxy would
 *      return, zero round-trips, no service-down failure path).
 *
 * Test injection (getPageListFn):
 *   Replaces the DB query. Useful for hermetic unit tests that do not have a
 *   real pdf_extracted_text table or want to simulate interior gaps.
 *
 * Test injection (getPageTextFn):
 *   Replaces per-page text resolution within the page list. getPageListFn still
 *   controls which pages are iterated; getPageTextFn overrides the text value.
 *   Pre-existing tests that inject only getPageTextFn continue to work because
 *   in that mode the function falls back to getPageTextFn to BOTH discover pages
 *   AND fetch text (sequential probe until empty, preserving legacy behaviour).
 *
 * Exported so get_bctc_pending_refine (interface layer) can reuse without
 * duplicating the page-iteration logic (contract from 172999f0 is preserved).
 */
export async function fetchAllPageTexts(
  reportId: string,
  filename: string,
  deps: FetchPageTextsDeps = {},
): Promise<Array<{ page: number; text: string }>> {
  const MAX_PAGES = 200; // Safety cap — applies to page list length

  // ── Path A: legacy getPageTextFn-only injection (no getPageListFn, no db) ──
  // Pre-existing tests inject only getPageTextFn. They rely on the sequential-probe
  // behaviour (probe 1, 2, … until empty after page 1) to control the page list.
  // Preserve that behaviour exactly so existing tests stay green.
  if (deps.getPageTextFn && !deps.getPageListFn && !deps.db) {
    const pageTexts: Array<{ page: number; text: string }> = [];
    let pageNum = 1;
    while (pageNum <= MAX_PAGES) {
      try {
        const text = await deps.getPageTextFn(reportId, filename, pageNum);
        if (!text.trim() && pageNum > 1) break;
        pageTexts.push({ page: pageNum, text });
        pageNum++;
      } catch {
        break;
      }
    }
    return pageTexts;
  }

  // ── Path B: DB-driven page list (production path + getPageListFn injection) ──
  // 1. Resolve the page list (injected or DB query).
  let dbRows: Array<{ page_number: number; text_content: string }>;

  if (deps.getPageListFn) {
    // Test injection: caller controls the page list (hermetic, no DB required)
    dbRows = await deps.getPageListFn(filename);
  } else {
    // Production: read from pdf_extracted_text — same source getPageText proxies
    const db = deps.db ?? getDb();
    try {
      dbRows = db
        .prepare<{ page_number: number; text_content: string }, [string]>(
          `SELECT DISTINCT page_number, text_content
           FROM pdf_extracted_text
           WHERE filename = ?
           ORDER BY page_number`,
        )
        .all(filename);
    } catch (err) {
      logger.warn("[fetchAllPageTexts] DB query failed — returning empty page list", {
        reportId,
        filename,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  // 2. Apply MAX_PAGES safety cap to the page list.
  const cappedRows = dbRows.slice(0, MAX_PAGES);

  if (cappedRows.length < dbRows.length) {
    logger.warn("[fetchAllPageTexts] page list capped at MAX_PAGES", {
      reportId,
      filename,
      total: dbRows.length,
      cap: MAX_PAGES,
    });
  }

  // 3. Iterate page list — each page is resolved to its text.
  //    Missing interior pages are simply absent from cappedRows (skipped, not EOF).
  const pageTexts: Array<{ page: number; text: string }> = [];
  for (const row of cappedRows) {
    try {
      let text: string;
      if (deps.getPageTextFn) {
        // Per-page text override (e.g. to simulate enriched extraction in tests)
        text = await deps.getPageTextFn(reportId, filename, row.page_number);
      } else {
        // Production: use text directly from DB row (same value the HTTP proxy returns)
        text = row.text_content;
      }
      pageTexts.push({ page: row.page_number, text });
    } catch (err) {
      logger.warn("[fetchAllPageTexts] per-page fetch failed — skipping page", {
        reportId,
        filename,
        page: row.page_number,
        error: err instanceof Error ? err.message : String(err),
      });
      // Skip this page but continue — do NOT treat as EOF
    }
  }

  return pageTexts;
}

// ── Core orchestration function (used by tests; fleet cron uses MCP tools) ────

export interface RefineOrchestratorDeps {
  db?: Database;
  getPageTextFn?: (reportId: string, filename: string, pageNum: number) => Promise<string>;
  spawnSubagentFn?: (reportId: string, win: { unit_id: string; page_numbers: number[] }) => Promise<WindowResult>;
  concurrency?: number;
  windowTimeoutMs?: number;
  maxWindowPages?: number;
}

/**
 * Orchestrate the refine pipeline for a single report.
 * Used by tests via dep injection. Fleet cron uses MCP tools instead.
 *
 * 4-phase state machine (binding per §0.6):
 * Phase 0: Claim + readiness gate
 * Phase 1: Window partition (sequential, O(n) pages)
 * Phase 2: Fan-out (bounded pool, no DB writes)
 * Phase 3: Aggregate → report-level status
 * Phase 4: Collect-then-write (single-threaded, transactional)
 */
export async function refineOneReport(
  reportId: string,
  deps: RefineOrchestratorDeps = {},
): Promise<void> {
  const db = deps.db ?? getDb();
  const concurrency = deps.concurrency ?? REFINE_FANOUT_CONCURRENCY;
  const windowTimeoutMs = (deps.windowTimeoutMs ?? REFINE_WINDOW_TIMEOUT_S) * 1000;
  const maxWindowPages = deps.maxWindowPages ?? REFINE_MAX_WINDOW_PAGES;
  const taskId = `bctc-refine-${reportId}`;

  // ── Phase 0: Claim + readiness gate ───────────────────────────────────────

  const claimResult = claimTask({
    task_id: taskId,
    task_kind: "sprint-task",
    owner_session: `pid-${process.pid}`,
    owner_agent: "refine-orchestrator",
    ttl_seconds: 3600,
    payload: null,
  });

  if (!claimResult.claimed) {
    logger.info("[bctcRefine] skip — task already claimed", {
      reportId,
      holder: (claimResult as { claimed: false; current_holder?: unknown }).current_holder,
    });
    return;
  }

  try {
    // Readiness gate: check text_status
    const reportRow = db
      .prepare<{ text_status: string; pdf_path: string | null }, [string]>(
        "SELECT text_status, pdf_path FROM financial_reports WHERE id = ?",
      )
      .get(reportId);

    if (!reportRow) {
      logger.warn("[bctcRefine] report not found", { reportId });
      return;
    }

    if (
      reportRow.text_status === "IN_PROGRESS" ||
      reportRow.text_status === "PARTIAL"
    ) {
      logger.info("[bctcRefine] skip — text_status not COMPLETE", {
        reportId,
        text_status: reportRow.text_status,
      });
      return;
    }

    // Derive filename from pdf_path (basename)
    const pdfFilename = reportRow.pdf_path ? basename(reportRow.pdf_path) : "";

    // Mark as in-progress
    db.prepare("UPDATE financial_reports SET refine_status='IN_PROGRESS' WHERE id=?").run(reportId);

    // ── Phase 1: Window partition (sequential, O(n) pages) ─────────────────

    logger.info("[bctcRefine] Phase 1: fetching page texts", { reportId });
    const pageTexts = await fetchAllPageTexts(reportId, pdfFilename, {
      // Pass getPageTextFn when injected (test path A — sequential probe)
      ...(deps.getPageTextFn ? { getPageTextFn: deps.getPageTextFn } : {}),
      // Pass db so production path reads pdf_extracted_text via the same DB
      // connection (avoids HTTP round-trips to pdf-extractor:5001).
      // Tests that inject getPageTextFn without db still hit Path A (legacy).
      ...(deps.getPageTextFn ? {} : { db }),
    });

    if (pageTexts.length === 0) {
      logger.warn("[bctcRefine] no page texts found", { reportId });
      db.prepare("UPDATE financial_reports SET refine_status='FAILED' WHERE id=?").run(reportId);
      return;
    }

    logger.info("[bctcRefine] Phase 1: partitioning into windows", {
      reportId,
      totalPages: pageTexts.length,
    });

    const windows = _partitionIntoWindows(pageTexts, { maxWindowPages });

    logger.info("[bctcRefine] Phase 1 complete — windows partitioned", {
      reportId,
      totalPages: pageTexts.length,
      totalWindows: windows.length,
    });

    // ── Phase 2: Fan-out (bounded concurrency, NO DB writes) ───────────────

    logger.info("[bctcRefine] Phase 2: spawning subagents", {
      reportId,
      windows: windows.length,
      concurrency,
    });

    const subagentDeps = deps.spawnSubagentFn
      ? { spawnSubagent: deps.spawnSubagentFn }
      : {};

    const rawResults = await _runBoundedPool(
      windows,
      concurrency,
      async (win): Promise<WindowResult> => {
        return spawnWindowSubagent(reportId, win, windowTimeoutMs, subagentDeps);
      },
    );

    // ── Phase 3: Aggregate → report-level status ───────────────────────────

    const anyDone = rawResults.some((r) => r.status === "DONE");
    const anyFailed = rawResults.some((r) => r.status === "FAILED");
    const reportStatus = !anyFailed ? "DONE" : anyDone ? "PARTIAL" : "FAILED";

    logger.info("[bctcRefine] Phase 3: aggregated", {
      reportId,
      reportStatus,
      done: rawResults.filter((r) => r.status === "DONE").length,
      failed: rawResults.filter((r) => r.status === "FAILED").length,
    });

    // ── Phase 4: Collect-then-write (single-threaded, transactional) ────────

    logger.info("[bctcRefine] Phase 4: writing to DB", { reportId });

    // Write bctc_refined_units (DELETE-then-INSERT, ALL windows including FAILED)
    db.transaction(() => {
      db.prepare("DELETE FROM bctc_refined_units WHERE report_id=?").run(reportId);
      for (const r of rawResults) {
        db.prepare(
          `INSERT INTO bctc_refined_units
             (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, flags, window_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          reportId,
          r.unit_id,
          JSON.stringify(r.page_numbers),
          r.markdown,
          r.markdown ? countRows(r.markdown) : 0,
          r.confidence,
          JSON.stringify(r.flags),
          r.status,
        );
      }
    })();

    // Write bctc_table_rows (parse DONE windows only, FAILED contribute nothing)
    db.transaction(() => {
      db.prepare("DELETE FROM bctc_table_rows WHERE report_id=?").run(reportId);
      const doneResults = rawResults.filter((r) => r.status === "DONE");
      for (const r of doneResults) {
        if (!r.markdown) continue;
        const parsed = parseRefinedMarkdown(r.markdown, reportId, r.page_numbers);
        if (parsed.errors.length > 0) {
          logger.warn("[bctcRefine] parser errors in window", {
            reportId,
            unitId: r.unit_id,
            errorCount: parsed.errors.length,
            errors: parsed.errors.slice(0, 5),
          });
        }
        for (const tableRow of parsed.rows) {
          db.prepare(
            `INSERT INTO bctc_table_rows
               (report_id, page_number, statement_section, row_order, code, label,
                period_current, value_current, period_prior, value_prior, unit,
                is_summary_row)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            tableRow.report_id,
            tableRow.page_number,
            tableRow.statement_section,
            tableRow.row_order,
            tableRow.code ?? null,
            tableRow.label,
            tableRow.period_current,
            tableRow.value_current ?? null,
            tableRow.period_prior ?? null,
            tableRow.value_prior ?? null,
            tableRow.unit,
            tableRow.is_summary_row,
          );
        }
      }
    })();

    // Update report status
    db.prepare("UPDATE financial_reports SET refine_status=? WHERE id=?").run(
      reportStatus,
      reportId,
    );

    logger.info("[bctcRefine] complete", {
      reportId,
      reportStatus,
      windows: windows.length,
      doneWindows: rawResults.filter((r) => r.status === "DONE").length,
      failedWindows: rawResults.filter((r) => r.status === "FAILED").length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[bctcRefine] orchestrator error", { reportId, error: msg });
    try {
      db.prepare("UPDATE financial_reports SET refine_status='FAILED' WHERE id=?").run(reportId);
    } catch { /* ignore */ }
    throw err;
  } finally {
    // Always release the task lock — match on owner_agent (stable across restarts)
    // to correctly undo the claim above which used owner_agent:"refine-orchestrator".
    // Previously passed pid-${process.pid} here which mismatched the claimed
    // owner_agent and left the lock as a zombie until TTL expiry.
    releaseTask(taskId, "refine-orchestrator");
  }
}
