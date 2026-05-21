/**
 * TASKS.md Janitor Job — Task 1965b
 *
 * Daily 03:00 UTC — off-peak after bctcReparseJob at 02:30 UTC.
 *
 * Implements D4 audit dimension (docs/agents/system-auditor/audit-dimensions.md)
 * via steps R-1..R-5 from docs/agents/system-auditor/handlers.md.
 *
 * What it does:
 *   R-1: calls task_list_held(kind="sprint-task") via coordinationStore (same DB layer
 *        used by the MCP tool — no new schema, Option A zero-table constraint).
 *   R-2: reads pipeline-state.json, cross-checks activeTaskId vs held locks (AC-4).
 *   R-3: reads TASKS.md, parses rows by task_id, compares Owner + Status vs lock (AC-2, AC-3).
 *   R-4: git log concurrent-commit detection on docs/TASKS.md within 30s windows (AC-5).
 *   R-5: emits DASHBOARD.md ## po row per signal-dashboard SKILL for each divergence.
 *   R-6: BUG telegram for new divergences (7d dedup key d4_tasksmd_lock_diverge:<task_id>).
 *   R-7: logs clean signal when zero divergences detected.
 *
 * Failure modes: logged as WARN; individual step failures do NOT abort the job.
 * Internal job failure (caught at top level): BUG telegram with 7d dedup.
 *
 * DDD Layer: interface/scheduler — may import from infrastructure/.
 * No domain/ imports. No writes to coordination.db.
 *
 * @module scheduler/system/tasksMdJanitorJob
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { listHeldTasks, type LockRow } from "../../infrastructure/db/coordinationStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DivergenceRow {
  kind: "status" | "owner" | "not_found" | "pipeline_mismatch" | "concurrent_commit";
  taskId: string;
  summary: string;
}

export interface JanitorResult {
  heldLocks: number;
  divergences: DivergenceRow[];
  pipelineState: { activeTaskId: string | null } | null;
  concurrentCommits: Array<{ hash1: string; hash2: string; delta: number }>;
  errors: string[];
}

/** Shape of pipeline-state.json (only the fields we read) */
interface PipelineState {
  activeTaskId?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency injection interfaces (for testability)
// ─────────────────────────────────────────────────────────────────────────────

export interface JanitorDeps {
  /** Return held sprint-task locks — defaults to real coordinationStore.listHeldTasks */
  listHeld: () => LockRow[];
  /** Read a file to string — defaults to fs.readFileSync */
  readFile: (path: string) => string;
  /** Write a file — defaults to fs.writeFileSync */
  writeFile: (path: string, content: string) => void;
  /** Check file exists */
  fileExists: (path: string) => boolean;
  /** Run a shell command and return stdout */
  runShell: (cmd: string) => string;
  /** Send BUG telegram (text, dedupKey) — returns dedup-skipped boolean */
  sendBug: (text: string, dedupKey: string) => Promise<void>;
  /** ISO timestamp */
  nowIso: () => string;
  /** Project root path */
  projectRoot: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TASKS.md parser
// ─────────────────────────────────────────────────────────────────────────────

interface TasksRow {
  taskId: string;
  title: string;
  status: string;
  owner: string;
  raw: string;
}

/**
 * Parse TASKS.md table rows. Looks for markdown table rows that contain a task_id
 * column matching the pattern of sprint task IDs (digits with optional suffix letter).
 *
 * Expected table columns (from TASKS.md convention):
 *   | task_id | title | type | owner | depends | status | ... |
 *
 * We parse loosely — split on `|`, trim cells, match by position.
 * The header row position is detected dynamically.
 */
export function parseTasksMd(content: string): TasksRow[] {
  const lines = content.split("\n");
  const rows: TasksRow[] = [];

  // Find the header row — it must contain "task" and "owner" and "status" columns
  let headerIdx = -1;
  let taskCol = -1;
  let ownerCol = -1;
  let statusCol = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (!line.includes("|")) continue;
    const cells = line.split("|").map(c => c.trim().toLowerCase());
    const tIdx = cells.findIndex(c => c === "task" || c === "task_id" || c === "id");
    const oIdx = cells.findIndex(c => c === "owner");
    const sIdx = cells.findIndex(c => c === "status");
    if (tIdx !== -1 && oIdx !== -1 && sIdx !== -1) {
      headerIdx = i;
      taskCol = tIdx;
      ownerCol = oIdx;
      statusCol = sIdx;
      break;
    }
  }

  if (headerIdx === -1) return rows;

  // Parse rows after header (skip separator line)
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (!line.includes("|")) continue;
    // Stop at next section header
    if (line.startsWith("#")) break;

    const cells = line.split("|").map(c => c.trim());
    if (cells.length <= Math.max(taskCol, ownerCol, statusCol)) continue;

    const taskId = cells[taskCol] ?? "";
    const owner = cells[ownerCol] ?? "";
    const status = cells[statusCol] ?? "";

    // Only include rows that look like task IDs (numbers + optional letter suffix)
    if (!taskId || !/^\d+[a-z]?$/.test(taskId)) continue;

    rows.push({ taskId, title: "", status: status.trim(), owner: owner.trim(), raw: line });
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Git log concurrent-commit detection (AC-5)
// ─────────────────────────────────────────────────────────────────────────────

interface CommitEntry {
  hash: string;
  tsEpoch: number;
}

/**
 * Parse git log output into commit entries.
 * Expected format per line: "<hash> <ISO-8601-date>"
 * e.g. "a1b2c3d 2026-05-21 02:58:10 +0000"
 */
export function parseGitLog(output: string): CommitEntry[] {
  const entries: CommitEntry[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // hash is first token; rest is datetime
    const spaceIdx = trimmed.indexOf(" ");
    if (spaceIdx === -1) continue;
    const hash = trimmed.slice(0, spaceIdx);
    const dateStr = trimmed.slice(spaceIdx + 1).trim();
    const tsMs = Date.parse(dateStr);
    if (!isNaN(tsMs)) {
      entries.push({ hash, tsEpoch: Math.floor(tsMs / 1000) });
    }
  }
  return entries;
}

/**
 * Find pairs of commits that landed within windowSeconds of each other.
 */
export function findConcurrentCommits(
  entries: CommitEntry[],
  windowSeconds = 30,
): Array<{ hash1: string; hash2: string; delta: number }> {
  const pairs: Array<{ hash1: string; hash2: string; delta: number }> = [];
  // entries should be sorted newest-first by git log; sort ascending for comparison
  const sorted = [...entries].sort((a, b) => a.tsEpoch - b.tsEpoch);

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const delta = b.tsEpoch - a.tsEpoch;
    if (delta <= windowSeconds) {
      pairs.push({ hash1: a.hash, hash2: b.hash, delta });
    }
  }
  return pairs;
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD.md writer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append a system_issue row to the ## po section of DASHBOARD.md.
 * Follows the signal-dashboard SKILL write pattern exactly.
 *
 * Row format: | {id} | {ts} | system-auditor | system_issue | {summary ≤40} | NEW | - |
 */
export function appendDashboardRow(
  dashboardPath: string,
  summary: string,
  nowIso: string,
  readFile: (p: string) => string,
  writeFile: (p: string, s: string) => void,
  fileExists: (p: string) => boolean,
): void {
  if (!fileExists(dashboardPath)) return;

  let content = readFile(dashboardPath);

  // Build the row
  const ts = nowIso.replace(/\.\d{3}Z$/, "Z").replace(/:\d{2}Z$/, "Z");
  const compact = ts.replace(/[-:TZ]/g, "").slice(0, 15);
  const id = `sau-${compact}`;
  const capped = summary.length > 40 ? summary.slice(0, 37) + "..." : summary;
  const row = `| ${id} | ${ts} | system-auditor | system_issue | ${capped} | NEW | - |`;

  // Find ## po section and insert the row
  const poHeader = "## po";
  const poIdx = content.indexOf(poHeader);
  if (poIdx === -1) return;

  // Find the table header row after ## po
  const afterPo = content.slice(poIdx);
  const tableHeaderMatch = afterPo.match(/\n\|[^\n]+\|\n\|[-| ]+\|/);
  if (!tableHeaderMatch) return;

  const separatorEndInAfterPo = afterPo.indexOf(tableHeaderMatch[0]) + tableHeaderMatch[0].length;
  const insertionPoint = poIdx + separatorEndInAfterPo;

  content = content.slice(0, insertionPoint) + "\n" + row + content.slice(insertionPoint);

  // Update _Updated: line (line 4 per SKILL)
  content = content.replace(
    /_Updated: [^_]+_/,
    `_Updated: ${nowIso}_`,
  );

  writeFile(dashboardPath, content);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7-day dedup store (in-memory, resets on process restart — acceptable for daily job)
// ─────────────────────────────────────────────────────────────────────────────

const _dedupStore: Map<string, number> = new Map();
const DEDUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isDedupActive(key: string): boolean {
  const ts = _dedupStore.get(key);
  if (ts === undefined) return false;
  return Date.now() - ts < DEDUP_TTL_MS;
}

export function markDedup(key: string): void {
  _dedupStore.set(key, Date.now());
}

/** Reset dedup store (test isolation) */
export function _resetDedupStore(): void {
  _dedupStore.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Core job logic (injectable for smoke testing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the TASKS.md janitor reconciliation pass.
 *
 * Steps R-1..R-7 per handlers.md.
 *
 * @param deps Injectable dependencies for testing
 * @returns JanitorResult summary
 */
export async function runTasksMdJanitor(deps: JanitorDeps): Promise<JanitorResult> {
  const {
    listHeld,
    readFile,
    writeFile,
    fileExists,
    runShell,
    sendBug,
    nowIso,
    projectRoot,
  } = deps;

  const tasksMdPath = resolve(projectRoot, "docs", "TASKS.md");
  const pipelinePath = resolve(projectRoot, "docs", "pipeline-state.json");
  const dashboardPath = resolve(projectRoot, "docs", "signals", "DASHBOARD.md");

  const divergences: DivergenceRow[] = [];
  const errors: string[] = [];
  let heldLocks: LockRow[] = [];
  let pipelineState: { activeTaskId: string | null } | null = null;
  let concurrentCommits: Array<{ hash1: string; hash2: string; delta: number }> = [];

  // ── Step R-1: call task_list_held (kind="sprint-task") ─────────────────────
  try {
    heldLocks = listHeld();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`R-1 listHeld failed: ${msg}`);
    // Log WARN but continue to R-4 git-log check independently (per failure modes)
  }

  // ── Step R-2: pipeline-state.json cross-check (AC-4) ───────────────────────
  try {
    if (fileExists(pipelinePath)) {
      const raw = readFile(pipelinePath);
      const ps = JSON.parse(raw) as PipelineState;
      pipelineState = { activeTaskId: ps.activeTaskId ?? null };

      const activeTaskId = pipelineState.activeTaskId;

      if (heldLocks.length === 0 && errors.length === 0) {
        // R-1 succeeded but empty. Check pipeline-state (AC-4).
        if (activeTaskId !== null) {
          divergences.push({
            kind: "pipeline_mismatch",
            taskId: activeTaskId,
            summary: `task_list_held empty but pipeline-state.activeTaskId=${activeTaskId}`,
          });
        }
      } else if (heldLocks.length > 0 && activeTaskId !== null) {
        // Both non-null: verify held lock matches activeTaskId
        for (const lock of heldLocks) {
          const bareId = lock.task_id.startsWith("task:") ? lock.task_id.slice(5) : lock.task_id;
          if (bareId !== activeTaskId) {
            divergences.push({
              kind: "pipeline_mismatch",
              taskId: bareId,
              summary: `pipeline-state/lock mismatch: active=${activeTaskId} held=${bareId}`,
            });
          }
        }
      }
    } else {
      errors.push("R-2 pipeline-state.json not found — skipping cross-check");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`R-2 pipeline-state parse failed: ${msg}`);
  }

  // ── Step R-3: TASKS.md owner/status cross-check (AC-1, AC-2, AC-3) ─────────
  if (heldLocks.length > 0) {
    try {
      if (!fileExists(tasksMdPath)) {
        throw new Error("TASKS.md not found");
      }
      const tasksMdContent = readFile(tasksMdPath);
      const taskRows = parseTasksMd(tasksMdContent);

      for (const lock of heldLocks) {
        const bareId = lock.task_id.startsWith("task:") ? lock.task_id.slice(5) : lock.task_id;
        const row = taskRows.find(r => r.taskId === bareId);

        if (!row) {
          divergences.push({
            kind: "not_found",
            taskId: bareId,
            summary: `held lock ${bareId} has no TASKS.md row`,
          });
          continue;
        }

        // Owner divergence check
        if (row.owner && lock.owner_agent && row.owner !== lock.owner_agent) {
          divergences.push({
            kind: "owner",
            taskId: bareId,
            summary: `Owner diverge: lock=${lock.owner_agent} tasks=${row.owner} task=${bareId}`,
          });
        }

        // Status divergence check (AC-2: lock held but status != In Progress)
        const status = row.status.toLowerCase();
        const isInProgress = status === "in progress" || status === "in_progress" || status === "inprogress";
        if (!isInProgress) {
          divergences.push({
            kind: "status",
            taskId: bareId,
            summary: `Status diverge: lock held but TASKS.md shows ${row.status} for ${bareId}`,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`R-3 TASKS.md parse failed: ${msg}`);
      // BUG telegram for TASKS.md unreadable (per failure modes)
      await sendBug(
        `[system-auditor] D4 ABORT: TASKS.md unreadable — possible Seam 3 corruption: ${msg}`,
        "d4_tasksmd_abort_unreadable",
      );
    }
  }

  // ── Step R-4: Seam 3 concurrent-commit detection (AC-5) ─────────────────────
  try {
    const gitCmd = `git log --all --oneline --follow --format="%H %ai" -- docs/TASKS.md`;
    const gitOutput = runShell(gitCmd);
    const commits = parseGitLog(gitOutput);
    const pairs = findConcurrentCommits(commits, 30);
    concurrentCommits = pairs;

    for (const pair of pairs) {
      divergences.push({
        kind: "concurrent_commit",
        taskId: "TASKS.md",
        summary: `TASKS.md concurrent commits: ${pair.hash1.slice(0, 8)} + ${pair.hash2.slice(0, 8)} within ${pair.delta}s`,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`R-4 git log failed: ${msg}`);
  }

  // ── Step R-5: emit DASHBOARD rows ──────────────────────────────────────────
  for (const div of divergences) {
    try {
      appendDashboardRow(
        dashboardPath,
        div.summary,
        nowIso(),
        readFile,
        writeFile,
        fileExists,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`R-5 DASHBOARD write failed for ${div.taskId}: ${msg}`);
    }
  }

  // ── Step R-6: BUG telegram for new divergences (7d dedup) ──────────────────
  for (const div of divergences) {
    if (div.kind === "concurrent_commit") continue; // Already handled per pair if needed
    const dedupKey = `d4_tasksmd_lock_diverge:${div.taskId}`;
    if (!isDedupActive(dedupKey)) {
      markDedup(dedupKey);
      try {
        await sendBug(
          `[system-auditor] D4 TASKS.md/lock diverge: ${div.summary} — see DASHBOARD.md ## po`,
          dedupKey,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`R-6 BUG send failed: ${msg}`);
      }
    }
  }

  // ── Step R-7: clean signal ─────────────────────────────────────────────────
  if (divergences.length === 0) {
    const ts = nowIso();
    console.log(`[system-auditor] D4 pass clean — no TASKS.md/lock divergence at ${ts}`);
  }

  return {
    heldLocks: heldLocks.length,
    divergences,
    pipelineState,
    concurrentCommits,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Production entry point (used by startScheduler.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** 7d dedup key for job-level internal failures (not per-task divergences) */
const JOB_FAILURE_DEDUP_KEY = "d4_janitor_internal_failure";

/**
 * Production cron entry point.
 * Wires real dependencies and runs the janitor.
 * Internal failures are caught here and send a single BUG telegram (7d dedup).
 */
export async function runTasksMdJanitorJob(): Promise<void> {
  const projectRoot = resolve(import.meta.dir, "..", "..", "..", "..", "..");

  const deps: JanitorDeps = {
    listHeld: () => {
      const result = listHeldTasks({ kind: "sprint-task" });
      return result.locks;
    },

    readFile: (p: string) => readFileSync(p, "utf8"),

    writeFile: (p: string, content: string) => writeFileSync(p, content, "utf8"),

    fileExists: (p: string) => existsSync(p),

    runShell: (cmd: string) => {
      try {
        return execSync(cmd, {
          encoding: "utf8",
          cwd: projectRoot,
          timeout: 10_000,
        });
      } catch (err) {
        if (err instanceof Error && "stdout" in err) {
          return (err as NodeJS.ErrnoException & { stdout: string }).stdout ?? "";
        }
        return "";
      }
    },

    sendBug: async (text: string, _dedupKey: string) => {
      try {
        const { sendTelegramBug } = await import(
          "../../infrastructure/notifiers/telegram.js"
        );
        await sendTelegramBug(text);
      } catch (err) {
        console.error("[tasks-md-janitor] BUG telegram send failed:", err);
      }
    },

    nowIso: () => new Date().toISOString(),

    projectRoot,
  };

  try {
    const result = await runTasksMdJanitor(deps);
    console.log(
      `[tasks-md-janitor] done — held=${result.heldLocks} divergences=${result.divergences.length} errors=${result.errors.length}`,
    );
    if (result.errors.length > 0) {
      console.warn("[tasks-md-janitor] non-fatal errors:", result.errors.join("; "));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tasks-md-janitor] FATAL: ${msg}`);

    if (!isDedupActive(JOB_FAILURE_DEDUP_KEY)) {
      markDedup(JOB_FAILURE_DEDUP_KEY);
      try {
        const { sendTelegramBug } = await import(
          "../../infrastructure/notifiers/telegram.js"
        );
        await sendTelegramBug(`[tasks-md-janitor] FATAL internal failure: ${msg}`);
      } catch {
        // swallow — already in error handler
      }
    }
  }
}
