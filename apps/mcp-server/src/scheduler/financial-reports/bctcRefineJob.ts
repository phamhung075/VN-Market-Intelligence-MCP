/**
 * bctcRefineJob.ts — FR-12 BCTC Agentic Refine Orchestrator + Cron
 *
 * Sprint BCTC-AGENTIC-REFINE
 * DDD layer: application (orchestration use case)
 *
 * 4-phase state machine per §0.6 architecture brief:
 *   Phase 0: Claim + readiness gate
 *   Phase 1: Window partition (sequential O(n) pages, continuation-aware)
 *   Phase 2: Fan-out (bounded Haiku subagent pool — NO DB writes)
 *   Phase 3: Aggregate → determine report-level status
 *   Phase 4: Collect-then-write (single-threaded transactional DB writes)
 *
 * Critical invariants:
 * - partitionIntoWindows() completes BEFORE any subagent spawns
 * - Continuation tables NEVER split across window boundaries
 * - Subagents NEVER write to DB (orchestrator owns all DB writes)
 * - DELETE-then-INSERT idempotency in Phase 4
 * - FAILED windows stored in bctc_refined_units (never silently dropped)
 *
 * Cron: '0 9,14,20 * * *' UTC (09:00, 14:00, 20:00) — outside OFF-HOSE window.
 * OFF-HOSE: 02:00-08:59 UTC Mon-Fri. All three cron times are safe.
 *
 * @module scheduler/financial-reports/bctcRefineJob
 */

import { mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { spawn } from "node:child_process";
import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { claimTask, releaseTask } from "../../infrastructure/db/coordinationStore.js";
import { getPageText } from "../../infrastructure/fetchers/pdfExtractorClient.js";
import { classifyPageForImageLoad } from "../../application/utils/pageClassifier.js";
import { parseRefinedMarkdown } from "../../application/utils/refinedMarkdownParser.js";

// ── Config ─────────────────────────────────────────────────────────────────────

const REFINE_FANOUT_CONCURRENCY = parseInt(Bun.env.REFINE_FANOUT_CONCURRENCY ?? "5", 10);
const REFINE_WINDOW_TIMEOUT_S = parseInt(Bun.env.REFINE_WINDOW_TIMEOUT_S ?? "120", 10);
const REFINE_MAX_WINDOW_PAGES = parseInt(Bun.env.REFINE_MAX_WINDOW_PAGES ?? "3", 10);

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PageText {
  page: number;
  text: string;
}

export interface Window {
  unit_id: string;
  page_numbers: number[];
  texts: string[];
  needsImage: boolean[];
}

export interface WindowResult {
  unit_id: string;
  page_numbers: number[];
  markdown: string;
  confidence: number;
  flags: string[];
  status: "DONE" | "FAILED";
}

// ── Window partitioning (sequential O(n), continuation-aware) ──────────────────

const CONTINUATION_MARKER = /tiếp theo|continued/i;

/**
 * Partition page texts into windows respecting continuation-table invariant.
 *
 * CRITICAL: This function runs to completion before ANY subagent spawns.
 * A table spanning page N and N+1 MUST land in ONE window (never split).
 *
 * Algorithm:
 * - Standalone page → 1-page window
 * - If page N+1 header contains continuation marker → include in same window
 * - Multi-page capped at REFINE_MAX_WINDOW_PAGES (truncated_continuation flag)
 */
export function partitionIntoWindows(
  pageTexts: PageText[],
  config: { maxWindowPages: number },
): Window[] {
  const windows: Window[] = [];
  let i = 0;

  while (i < pageTexts.length) {
    const page = pageTexts[i]!;
    const ocrText = page.text;

    // Determine image classification for this page
    const prevWasImage =
      windows.length > 0 &&
      (windows[windows.length - 1]!.needsImage.some(Boolean));
    const needsImage = classifyPageForImageLoad(ocrText, prevWasImage);

    // Check if next page has a continuation marker
    const pageNums = [page.page];
    const texts = [ocrText];
    const needsImages = [needsImage];

    let j = i + 1;
    while (j < pageTexts.length && pageNums.length < config.maxWindowPages) {
      const nextPage = pageTexts[j]!;
      if (CONTINUATION_MARKER.test(nextPage.text)) {
        pageNums.push(nextPage.page);
        texts.push(nextPage.text);
        const prevImg = needsImages[needsImages.length - 1]!;
        needsImages.push(classifyPageForImageLoad(nextPage.text, prevImg));
        j++;
      } else {
        break;
      }
    }

    // Check if we hit the cap mid-continuation
    const flags: string[] = [];
    if (j < pageTexts.length && pageNums.length === config.maxWindowPages) {
      const nextPage = pageTexts[j]!;
      if (CONTINUATION_MARKER.test(nextPage.text)) {
        flags.push("truncated_continuation");
        logger.warn("[bctcRefine] continuation window truncated at maxWindowPages", {
          startPage: page.page,
          maxWindowPages: config.maxWindowPages,
        });
      }
    }

    windows.push({
      unit_id: `unit-${String(windows.length).padStart(4, "0")}`,
      page_numbers: pageNums,
      texts,
      needsImage: needsImages,
    });

    i = j;
  }

  return windows;
}

// ── Bounded concurrency pool ───────────────────────────────────────────────────

/**
 * Run tasks with bounded concurrency (p-limit style semaphore).
 *
 * Never spawns more than `concurrency` tasks simultaneously.
 * All tasks run to completion (failures captured in results, never thrown).
 */
async function runBoundedPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) break;
      results[index] = await fn(items[index]!);
    }
  }

  const workers: Promise<void>[] = [];
  const poolSize = Math.min(concurrency, items.length);
  for (let i = 0; i < poolSize; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}

// ── Subagent output file exchange ──────────────────────────────────────────────

function getOutputDir(reportId: string): string {
  return join(process.cwd(), "docs", "refine-output", reportId);
}

function getOutputFilePath(reportId: string, unitId: string): string {
  return join(getOutputDir(reportId), `${unitId}.json`);
}

// ── Window subagent spawning ───────────────────────────────────────────────────

/**
 * Spawn a refine_bctc_md Haiku subagent for a single window.
 *
 * This is a placeholder implementation that creates a mock output.
 * In production, this spawns a claude CLI subprocess with the refine_bctc_md agent.
 * The agent writes its output to docs/refine-output/{report_id}/{unit_id}.json.
 *
 * For the orchestrator test harness, deps.spawnSubagent can be overridden.
 */
export async function spawnWindowSubagent(
  reportId: string,
  win: Window,
  timeoutMs: number,
  deps: {
    spawnSubagent?: (reportId: string, win: Window) => Promise<WindowResult>;
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

  // Production: spawn claude CLI subprocess
  const outputDir = getOutputDir(reportId);
  mkdirSync(outputDir, { recursive: true });
  const outputFile = getOutputFilePath(reportId, win.unit_id);

  // Build per-window context payload for the subagent
  const payload = {
    report_id: reportId,
    unit_id: win.unit_id,
    page_numbers: win.page_numbers,
    texts: win.texts,
    needsImage: win.needsImage,
    output_file: outputFile,
  };

  const payloadJson = JSON.stringify(payload);

  return new Promise<WindowResult>((resolve) => {
    const timeout = setTimeout(() => {
      proc.kill();
      logger.warn("[bctcRefine] window subagent timed out", {
        reportId,
        unitId: win.unit_id,
        timeoutMs,
      });
      resolve({
        unit_id: win.unit_id,
        page_numbers: win.page_numbers,
        markdown: "",
        confidence: 0.0,
        flags: ["timeout"],
        status: "FAILED",
      });
    }, timeoutMs);

    const proc = spawn(
      "claude",
      [
        "run",
        "docs/agents/refine_bctc_md/flow/main.md",
        "--input",
        payloadJson,
      ],
      {
        stdio: "pipe",
        env: { ...process.env },
      },
    );

    proc.on("close", (code) => {
      clearTimeout(timeout);

      // Read output file written by the subagent
      try {
        if (existsSync(outputFile)) {
          const raw = readFileSync(outputFile, "utf-8");
          const result = JSON.parse(raw) as WindowResult;
          // Clean up output file
          try { rmSync(outputFile); } catch { /* ignore */ }
          resolve(result);
        } else {
          logger.warn("[bctcRefine] subagent output file missing", {
            reportId,
            unitId: win.unit_id,
            exitCode: code,
          });
          resolve({
            unit_id: win.unit_id,
            page_numbers: win.page_numbers,
            markdown: "",
            confidence: 0.0,
            flags: [`agent_error:exit_code_${code ?? "unknown"}_no_output`],
            status: "FAILED",
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        resolve({
          unit_id: win.unit_id,
          page_numbers: win.page_numbers,
          markdown: "",
          confidence: 0.0,
          flags: [`agent_error:${msg}`],
          status: "FAILED",
        });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      resolve({
        unit_id: win.unit_id,
        page_numbers: win.page_numbers,
        markdown: "",
        confidence: 0.0,
        flags: [`agent_error:${err.message}`],
        status: "FAILED",
      });
    });
  });
}

// ── Row count helper ───────────────────────────────────────────────────────────

function countRows(markdown: string): number {
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
  getPageTextFn?: ((reportId: string, filename: string, pageNum: number) => Promise<string>) | undefined;
}

/**
 * Fetch OCR text for all pages of a report.
 * Calls get_bctc_page_text (via getPageText client) for each page.
 */
async function fetchAllPageTexts(
  reportId: string,
  filename: string,
  deps: FetchPageTextsDeps = {},
): Promise<PageText[]> {
  // Determine total pages by iterating until we get empty responses
  const pageTexts: PageText[] = [];
  let pageNum = 1;
  const MAX_PAGES = 200; // Safety cap

  while (pageNum <= MAX_PAGES) {
    try {
      let text: string;
      if (deps.getPageTextFn) {
        text = await deps.getPageTextFn(reportId, filename, pageNum);
      } else {
        const result = await getPageText(filename, pageNum);
        text = result?.text ?? "";
      }

      if (!text.trim() && pageNum > 1) {
        // Empty page after first page → reached end of document
        break;
      }

      pageTexts.push({ page: pageNum, text });
      pageNum++;
    } catch {
      break;
    }
  }

  return pageTexts;
}

// ── Core orchestration function ────────────────────────────────────────────────

export interface RefineOrchestratorDeps {
  db?: Database;
  getPageTextFn?: (reportId: string, filename: string, pageNum: number) => Promise<string>;
  spawnSubagentFn?: (reportId: string, win: Window) => Promise<WindowResult>;
  concurrency?: number;
  windowTimeoutMs?: number;
  maxWindowPages?: number;
}

/**
 * Orchestrate the refine pipeline for a single report.
 *
 * 4-phase state machine (binding per §0.6):
 * Phase 0: Claim + readiness gate
 * Phase 1: Window partition (sequential, O(n) pages)
 * Phase 2: Fan-out (bounded pool, no DB writes)
 * Phase 3: Aggregate → report-level status
 * Phase 4: Collect-then-write (single-threaded, transactional)
 *
 * @param reportId  Financial report ID
 * @param deps      Injectable deps for testing
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
    const pageTexts = await fetchAllPageTexts(reportId, pdfFilename,
      deps.getPageTextFn ? { getPageTextFn: deps.getPageTextFn } : {},
    );

    if (pageTexts.length === 0) {
      logger.warn("[bctcRefine] no page texts found", { reportId });
      db.prepare("UPDATE financial_reports SET refine_status='FAILED' WHERE id=?").run(reportId);
      return;
    }

    logger.info("[bctcRefine] Phase 1: partitioning into windows", {
      reportId,
      totalPages: pageTexts.length,
    });

    const windows = partitionIntoWindows(pageTexts, { maxWindowPages });

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

    const rawResults = await runBoundedPool(
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

    // Clean up output directory
    const outputDir = getOutputDir(reportId);
    try {
      if (existsSync(outputDir)) {
        rmSync(outputDir, { recursive: true, force: true });
      }
    } catch { /* ignore cleanup errors */ }

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
    // Always release the task lock
    releaseTask(taskId, `pid-${process.pid}`);
  }
}

// ── Cron job entry point ───────────────────────────────────────────────────────

/**
 * Run the BCTC refine job for all pending reports.
 *
 * Picks reports WHERE text_status = 'COMPLETE' AND refine_status = 'PENDING'
 * or refine_status = 'PARTIAL' (re-eligible on next cron).
 *
 * Cron schedule: '0 9,14,20 * * *' UTC
 *   - 09:00 UTC = 16:00 GMT+7 (after HOSE close at 15:00 GMT+7) ✓
 *   - 14:00 UTC = 21:00 GMT+7 ✓
 *   - 20:00 UTC = 03:00 GMT+7 next day ✓
 * All times outside OFF-HOSE 02:00-08:59 UTC Mon-Fri. ✓
 */
export async function runBctcRefineJob(
  deps: RefineOrchestratorDeps = {},
): Promise<void> {
  const db = deps.db ?? getDb();

  // Pick pending or partially-refined reports
  const pendingReports = db
    .prepare<{ id: string }, []>(
      `SELECT id FROM financial_reports
       WHERE text_status = 'COMPLETE'
         AND refine_status IN ('PENDING', 'PARTIAL')
       ORDER BY parsed_at ASC
       LIMIT 10`,
    )
    .all();

  if (pendingReports.length === 0) {
    logger.info("[bctcRefineJob] no pending reports");
    return;
  }

  logger.info("[bctcRefineJob] starting", { count: pendingReports.length });

  for (const { id } of pendingReports) {
    try {
      await refineOneReport(id, deps);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[bctcRefineJob] report failed", { id, error: msg });
    }
  }

  logger.info("[bctcRefineJob] cycle complete", { processed: pendingReports.length });
}
