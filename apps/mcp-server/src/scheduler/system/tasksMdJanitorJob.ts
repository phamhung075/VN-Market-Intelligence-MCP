/**
 * Orch-State Janitor Job — Task 1965b (OSC-2 migration)
 * + FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE (2026-07-08): Steps R-1b/R-4b.
 *
 * Daily 03:00 UTC — off-peak after bctcReparseJob at 02:30 UTC.
 *
 * Implements D4 audit dimension (docs/agents/system-auditor/audit-dimensions.md)
 * via steps R-1..R-7 from docs/agents/system-auditor/handlers.md.
 *
 * What it does:
 *   R-1: calls task_list_held(kind="sprint-task", expired=false) via coordinationStore
 *        (same DB layer used by the MCP tool — no new schema, Option A zero-table
 *        constraint). expired:false is REQUIRED — without it, TTL-expired tombstone
 *        locks are read as held and flood R-2/R-3 with dead-lock false positives.
 *   R-1b: exclusion whitelist (cron:*, *-singleton, po-triage-*, esc-datacov:*,
 *        esc-deepdive:*, session-presence*, commit-mutex*, intent:*) + live-concurrent-
 *        session guard (owner_client_session present in the live session-presence
 *        roster AND lock unexpired) — filters BEFORE R-2/R-3 evaluate any lock.
 *   R-2: reads orch-state.json .head, cross-checks active_task_id vs locks surviving
 *        R-1b (AC-4).
 *   R-3: reads orch-state.json .task_board.tasks[], compares Owner + Status vs locks
 *        surviving R-1b (AC-2, AC-3).
 *   R-4: git log concurrent-commit detection on docs/data/orch/orch-state.json within
 *        30s (AC-5) — emitted directly, NOT subject to R-4b debounce.
 *   R-4b: 2-consecutive-daily-cycle debounce gate on R-2/R-3 candidates. Ledger rides
 *        on the system-auditor notebook's `D4 candidates:` line (no new state file —
 *        see docs/agents/system-auditor/handlers.md §Step R-4b). Cold start (no prior
 *        line found) => zero emissions this cycle, ledger only seeded (fail-safe).
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
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";
import type { OrchStateTaskBoardTask } from "../../infrastructure/orchStateStore.js";

// Split out (FIX-SIZELINT-TASKSMDJANITORJOB-1012L, 2026-08-24) — see each
// sibling module's own doc comment for the Step this concern belongs to.
import type { DivergenceRow, D4Candidate, JanitorResult, JanitorDeps, OrchHead } from "./tasksMdJanitorTypes.js";
import { bareTaskId, parseTasksFromOrchStateJson } from "./tasksMdJanitorTaskHelpers.js";
import { refreshKnownLegitPrefixes, applyR1bFilter } from "./tasksMdJanitorR1bFilter.js";
import { applyR4bDebounce } from "./tasksMdJanitorR4bDebounce.js";
import { parseGitLog, findConcurrentCommits } from "./tasksMdJanitorGitLogDetector.js";
import { appendOrchStateSignalRow } from "./tasksMdJanitorSignalWriter.js";
import { isDedupActive, markDedup } from "./tasksMdJanitorDedupStore.js";

// Re-export the full pre-split public surface — unchanged import paths for
// every existing consumer (schedulerJobTable.ts, FIX-D4-HELD-LOCK-NO-BOARD-
// ROW-RECONCILE.test.ts, FU-AUDITOR-D4-SIGNAL-ID.test.ts). Implementations
// now live in the sibling modules above; this file re-exports them alongside
// the two functions that stay here (runTasksMdJanitor, runTasksMdJanitorJob).
export type { DivergenceRow, D4Candidate, JanitorResult, JanitorDeps } from "./tasksMdJanitorTypes.js";
export { parseTasksFromOrchState, parseTasksFromOrchStateJson, bareTaskId } from "./tasksMdJanitorTaskHelpers.js";
export { loadKnownLegitPrefixesFromSystemMap } from "./tasksMdJanitorLegitPrefixes.js";
export {
  refreshKnownLegitPrefixes,
  isKnownLegitPattern,
  isLiveConcurrentSession,
  applyR1bFilter,
  type R1bFilterResult,
} from "./tasksMdJanitorR1bFilter.js";
export {
  parsePriorD4Candidates,
  formatD4LedgerSection,
  insertD4LedgerSection,
  applyR4bDebounce,
} from "./tasksMdJanitorR4bDebounce.js";
export { parseGitLog, findConcurrentCommits } from "./tasksMdJanitorGitLogDetector.js";
export { sanitizeSignalIdSegment, appendOrchStateSignalRow } from "./tasksMdJanitorSignalWriter.js";
export { isDedupActive, markDedup, _resetDedupStore } from "./tasksMdJanitorDedupStore.js";

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
    listSessionPresence,
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
  // FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE: R-4b ledger rides on the
  // system-auditor notebook's "D4 candidates:" line (no new state file).
  const notebookPath = resolve(projectRoot, "docs", "agent-memory", "notebooks", "system-auditor.md");

  // FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX / AC-7: re-read the
  // known-legit-prefix SSOT once per cycle (never at module load) so a
  // system-map.json edit takes effect on the NEXT daily run, not only after a
  // container restart. Must run before Step R-1b below.
  refreshKnownLegitPrefixes(resolve(projectRoot, "docs", "data", "system-map.json"));

  const divergences: DivergenceRow[] = [];
  const candidates: D4Candidate[] = []; // R-2/R-3 findings — gated by R-4b before becoming divergences
  const errors: string[] = [];
  let heldLocks: LockRow[] = [];
  let survivingLocks: LockRow[] = []; // heldLocks minus R-1b exclusions
  let pipelineState: { activeTaskId: string | null } | null = null;
  let concurrentCommits: Array<{ hash1: string; hash2: string; delta: number }> = [];
  const nowIsoAtStart = nowIso();

  // ── Step R-1: call task_list_held (kind="sprint-task", expired=false) ──────
  let r1Failed = false;
  try {
    heldLocks = listHeld();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`R-1 listHeld failed: ${msg}`);
    r1Failed = true;
    // Log WARN but continue to R-4 git-log check independently (per failure modes)
  }

  // ── Step R-1b: exclusion whitelist + live-concurrent-session guard ─────────
  // Filters BEFORE R-2/R-3 evaluate any held lock. Skipped entirely if R-1 failed
  // (no locks were fetched, so there is nothing to filter or evaluate) — per
  // handlers.md Failure modes: "task_list_held fails → skip Steps R-1b/R-2/R-3".
  if (!r1Failed) {
    let sessionPresenceRows: LockRow[] = [];
    try {
      sessionPresenceRows = listSessionPresence ? listSessionPresence() : [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`R-1b listSessionPresence failed: ${msg}`);
      // Fail-safe: treat as zero live sessions this cycle — the known-legit-pattern
      // filter still applies (do NOT suppress on this path's absence).
      sessionPresenceRows = [];
    }
    const liveSessionIds = new Set(
      sessionPresenceRows
        .map(r => r.owner_client_session)
        .filter((s): s is string => typeof s === "string" && s.length > 0),
    );
    const nowEpochSeconds = Math.floor(Date.parse(nowIsoAtStart) / 1000);

    const { surviving, skipped } = applyR1bFilter(heldLocks, liveSessionIds, nowEpochSeconds);
    survivingLocks = surviving;
    for (const s of skipped) {
      console.debug(`[tasks-md-janitor] D4 SKIP: ${s.bareId} — ${s.reason}`);
    }
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
        // Both non-null: verify held lock matches activeTaskId.
        // R-1b: only locks that survived the exclusion whitelist/live-session guard
        // are evaluated — the rest are known-legit-concurrent or excluded by design.
        for (const lock of survivingLocks) {
          const bareId = bareTaskId(lock.task_id);
          if (bareId !== activeTaskId) {
            candidates.push({
              key: `R2-mismatch:${bareId}`,
              div: {
                kind: "pipeline_mismatch",
                taskId: bareId,
                summary: `orch-state/lock mismatch: active=${activeTaskId} held=${bareId}`,
              },
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
  // R-1b: gated on survivingLocks (post-exclusion-whitelist/live-session-guard set),
  // not the raw heldLocks — a lock excluded at R-1b never reaches R-3 either.
  if (survivingLocks.length > 0) {
    try {
      if (!fileExists(orchStatePath)) {
        throw new Error("orch-state.json not found");
      }
      const orchContent = readFile(orchStatePath);
      const orchState = JSON.parse(orchContent) as {
        task_board?: { active_sprints?: Array<{ tasks?: OrchStateTaskBoardTask[] }> };
      };
      const taskRows = parseTasksFromOrchStateJson(orchState);

      for (const lock of survivingLocks) {
        const bareId = bareTaskId(lock.task_id);
        const row = taskRows.find(r => r.taskId === bareId);

        if (!row) {
          candidates.push({
            key: `R3-no-board-row:${bareId}`,
            div: {
              kind: "not_found",
              taskId: bareId,
              summary: `held lock ${bareId} has no orch-state task_board row`,
            },
          });
          continue;
        }

        // Owner divergence check
        if (row.owner && lock.owner_agent && row.owner !== lock.owner_agent) {
          candidates.push({
            key: `R3-owner-diverge:${bareId}`,
            div: {
              kind: "owner",
              taskId: bareId,
              summary: `Owner diverge: lock=${lock.owner_agent} task_board=${row.owner} task=${bareId}`,
            },
          });
        }

        // Status divergence check (AC-2: lock held but status != IN_PROGRESS)
        const status = row.status.toLowerCase();
        const isInProgress = status === "in progress" || status === "in_progress" || status === "inprogress";
        if (!isInProgress) {
          candidates.push({
            key: `R3-status-diverge:${bareId}`,
            div: {
              kind: "status",
              taskId: bareId,
              summary: `Status diverge: lock held but task_board shows ${row.status} for ${bareId}`,
            },
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

  // ── Step R-4b: 2-consecutive-cycle debounce gate on R-2/R-3 candidates ─────
  // Skipped when R-1 failed — no candidates were ever produced this cycle (R-1b/
  // R-2/R-3 all skipped per Failure modes), so there is nothing to debounce and
  // seeding the ledger with "none" would falsely record "checked, found nothing"
  // for a cycle that never actually checked.
  if (!r1Failed) {
    const emitted = applyR4bDebounce(candidates, notebookPath, readFile, writeFile, fileExists, nowIsoAtStart);
    divergences.push(...emitted);
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
        div.taskId,
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
 *
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of daily cadence (21.6h window)
 */
export async function runTasksMdJanitorJob(nowMsFn?: () => number): Promise<void> {
  // T4 dedup guard: skip if already ran within daily cadence window
  try {
    const { getDb } = await import("../../infrastructure/db/schema.js");
    const _db = getDb();
    const DAILY_CADENCE_MS = 86_400_000;
    if (shouldSkipRecoveryReplay(_db, "tasksMdJanitorJob", DAILY_CADENCE_MS, nowMsFn)) return;
  } catch {
    // DB unavailable — proceed without dedup (fail-open)
  }
  const deps: JanitorDeps = {
    // FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE: expired:false is REQUIRED — without
    // it, task_list_held also returns TTL-expired tombstone locks (handlers.md
    // §Step R-1: "without this filter D4 reads ~100+ dead locks as held").
    listHeld: () => {
      const result = listHeldTasks({ kind: "sprint-task", expired: false });
      return result.locks;
    },

    // Step R-1b live-concurrent-session guard: live session-presence roster.
    listSessionPresence: () => {
      const result = listHeldTasks({ kind: "session-presence", expired: false });
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
