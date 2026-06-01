/**
 * Orch-State Janitor Job — Task 1965b (OSC-2 migration)
 *
 * Daily 03:00 UTC — off-peak after bctcReparseJob at 02:30 UTC.
 *
 * Implements D4 audit dimension (docs/agents/system-auditor/audit-dimensions.md)
 * via steps R-1..R-5 from docs/agents/system-auditor/handlers.md.
 *
 * What it does:
 *   R-1: calls task_list_held(kind="sprint-task") via coordinationStore (same DB layer
 *        used by the MCP tool — no new schema, Option A zero-table constraint).
 *   R-2: reads orch-state.json .head, cross-checks active_task_id vs held locks (AC-4).
 *   R-3: reads orch-state.json .task_board.tasks[], compares Owner + Status vs lock (AC-2, AC-3).
 *   R-4: git log concurrent-commit detection on docs/data/orch/orch-state.json within 30s (AC-5).
 *   R-5: appends signal_queue row to orch-state.json for each divergence (atomic write).
 *   R-6: BUG telegram for new divergences (7d dedup key d4_tasksmd_lock_diverge:<task_id>).
 *   R-7: logs clean signal when zero divergences detected.
 *
 * OSC-2: All paths re-pointed from docs/TASKS.md + docs/pipeline-state.json +
 *        docs/signals/DASHBOARD.md → docs/data/orch/orch-state.json.
 *        Dashboard rows are now JSON signal_queue rows (appendSignalQueueRow, atomic write).
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
import { getProjectRoot } from "../../infrastructure/projectRoot.js";
import {
  appendSignalQueueRow,
  writeOrchStateAtomic,
  type OrchStateSignalRow,
  type OrchStateTaskBoardTask,
} from "../../infrastructure/orchStateStore.js";

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

/** Shape of orch-state.json .head (only the fields we read) — v3 snake_case */
interface OrchHead {
  active_task_id?: string | null;
  status?: string;
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
// orch-state.json task_board parser (OSC-2 — replaces TASKS.md markdown parser)
// ─────────────────────────────────────────────────────────────────────────────

interface TasksRow {
  taskId: string;
  title: string;
  status: string;
  owner: string;
  raw: string;
}

/**
 * Flatten all tasks from orch-state.json .task_board.active_sprints[].tasks[]
 * into a list of TasksRow for lock cross-check (R-3).
 *
 * OSC-2 replacement for parseTasksMd() — reads structured JSON instead of
 * Markdown table rows.
 */
export function parseTasksFromOrchState(tasks: OrchStateTaskBoardTask[]): TasksRow[] {
  return tasks.map(t => ({
    taskId: t.task_id,
    title: t.title ?? "",
    status: t.status ?? "",
    owner: t.owner ?? "",
    raw: JSON.stringify(t),
  }));
}

/**
 * Extract all tasks from orch-state.json JSON (parsed).
 * Flattens active_sprints[].tasks[] into a flat TasksRow array.
 */
export function parseTasksFromOrchStateJson(orchState: {
  task_board?: { active_sprints?: Array<{ tasks?: OrchStateTaskBoardTask[] }> };
}): TasksRow[] {
  const rows: TasksRow[] = [];
  for (const sprint of orchState.task_board?.active_sprints ?? []) {
    for (const task of sprint.tasks ?? []) {
      rows.push({
        taskId: task.task_id,
        title: task.title ?? "",
        status: task.status ?? "",
        owner: task.owner ?? "",
        raw: JSON.stringify(task),
      });
    }
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
// orch-state.json signal_queue writer (OSC-2 — replaces DASHBOARD.md appendDashboardRow)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append a system_issue row to orch-state.json .signal_queue.rows[] atomically.
 *
 * OSC-2 replacement for the old appendDashboardRow(DASHBOARD.md) pattern.
 * Uses appendSignalQueueRow() from orchStateStore (temp-file-then-rename).
 *
 * Summary is capped at 120 chars (HC-2). Severity is always LOW for D4 divergences
 * unless it is a concurrent_commit (MED).
 */
export function appendOrchStateSignalRow(
  orchStatePath: string,
  summary: string,
  nowIso: string,
  kind: DivergenceRow["kind"],
  readFile: (p: string) => string,
  writeFile: (p: string, s: string) => void,
  fileExists: (p: string) => boolean,
): void {
  const ts = nowIso.replace(/\.\d{3}Z$/, "Z").replace(/:\d{2}Z$/, "Z");
  const compact = ts.replace(/[-:TZ]/g, "").slice(0, 15);
  const id = `sau-d4-${compact}`;

  const severity: OrchStateSignalRow["severity"] =
    kind === "concurrent_commit" ? "MED" : "LOW";

  const row: OrchStateSignalRow = {
    id,
    ts,
    from: "system-auditor",
    to: "po",
    type: "system_issue",
    summary,
    severity,
    status: "NEW",
    payload_ref: null,
  };

  appendSignalQueueRow(
    orchStatePath,
    row,
    nowIso,
    "system-auditor",
    readFile,
    (p, d) => writeOrchStateAtomic(p, d),
    fileExists,
  );
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

  // OSC-2: all paths re-pointed to orch-state.json
  const orchStatePath = resolve(projectRoot, "docs", "data", "orch", "orch-state.json");

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

  // ── Step R-2: orch-state.json .head cross-check (AC-4) ─────────────────────
  // OSC-2: reads orch-state.json .head.active_task_id (v3 schema, snake_case)
  try {
    if (fileExists(orchStatePath)) {
      const raw = readFile(orchStatePath);
      const orchState = JSON.parse(raw) as { head?: OrchHead };
      const activeTaskId = orchState.head?.active_task_id ?? null;
      pipelineState = { activeTaskId };

      if (heldLocks.length === 0 && errors.length === 0) {
        // R-1 succeeded but empty. Check orch-state head (AC-4).
        if (activeTaskId !== null) {
          divergences.push({
            kind: "pipeline_mismatch",
            taskId: activeTaskId,
            summary: `task_list_held empty but orch-state.head.active_task_id=${activeTaskId}`,
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
              summary: `orch-state/lock mismatch: active=${activeTaskId} held=${bareId}`,
            });
          }
        }
      }
    } else {
      errors.push("R-2 orch-state.json not found — skipping cross-check");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`R-2 orch-state parse failed: ${msg}`);
  }

  // ── Step R-3: orch-state.json .task_board owner/status cross-check (AC-1, AC-2, AC-3)
  // OSC-2: reads task_board.active_sprints[].tasks[] instead of TASKS.md markdown
  if (heldLocks.length > 0) {
    try {
      if (!fileExists(orchStatePath)) {
        throw new Error("orch-state.json not found");
      }
      const orchContent = readFile(orchStatePath);
      const orchState = JSON.parse(orchContent) as {
        task_board?: { active_sprints?: Array<{ tasks?: OrchStateTaskBoardTask[] }> };
      };
      const taskRows = parseTasksFromOrchStateJson(orchState);

      for (const lock of heldLocks) {
        const bareId = lock.task_id.startsWith("task:") ? lock.task_id.slice(5) : lock.task_id;
        const row = taskRows.find(r => r.taskId === bareId);

        if (!row) {
          divergences.push({
            kind: "not_found",
            taskId: bareId,
            summary: `held lock ${bareId} has no orch-state task_board row`,
          });
          continue;
        }

        // Owner divergence check
        if (row.owner && lock.owner_agent && row.owner !== lock.owner_agent) {
          divergences.push({
            kind: "owner",
            taskId: bareId,
            summary: `Owner diverge: lock=${lock.owner_agent} task_board=${row.owner} task=${bareId}`,
          });
        }

        // Status divergence check (AC-2: lock held but status != IN_PROGRESS)
        const status = row.status.toLowerCase();
        const isInProgress = status === "in progress" || status === "in_progress" || status === "inprogress";
        if (!isInProgress) {
          divergences.push({
            kind: "status",
            taskId: bareId,
            summary: `Status diverge: lock held but task_board shows ${row.status} for ${bareId}`,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`R-3 orch-state task_board parse failed: ${msg}`);
      // BUG telegram for orch-state unreadable (per failure modes)
      await sendBug(
        `[system-auditor] D4 ABORT: orch-state.json task_board unreadable — possible Seam 3 corruption: ${msg}`,
        "d4_tasksmd_abort_unreadable",
      );
    }
  }

  // ── Step R-4: Seam 3 concurrent-commit detection (AC-5) ─────────────────────
  // OSC-2: git-log now targets docs/data/orch/orch-state.json (Decision A: 30s window)
  try {
    const gitCmd = `git log --all --oneline --follow --format="%H %ai" -- docs/data/orch/orch-state.json`;
    const gitOutput = runShell(gitCmd);
    const commits = parseGitLog(gitOutput);
    const pairs = findConcurrentCommits(commits, 30);
    concurrentCommits = pairs;

    for (const pair of pairs) {
      divergences.push({
        kind: "concurrent_commit",
        taskId: "orch-state.json",
        summary: `orch-state.json concurrent commits: ${pair.hash1.slice(0, 8)} + ${pair.hash2.slice(0, 8)} within ${pair.delta}s`,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`R-4 git log failed: ${msg}`);
  }

  // ── Step R-5: emit signal_queue rows to orch-state.json ────────────────────
  // OSC-2: replaces DASHBOARD.md appendDashboardRow with JSON signal_queue append
  for (const div of divergences) {
    try {
      appendOrchStateSignalRow(
        orchStatePath,
        div.summary,
        nowIso(),
        div.kind,
        readFile,
        writeFile,
        fileExists,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`R-5 orch-state signal_queue write failed for ${div.taskId}: ${msg}`);
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
          `[system-auditor] D4 orch-state/lock diverge: ${div.summary} — see orch-state.json .signal_queue`,
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
    console.log(`[system-auditor] D4 pass clean — no orch-state/lock divergence at ${ts}`);
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
          cwd: getProjectRoot(),
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

    projectRoot: getProjectRoot(),
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
