/**
 * orchStateStore.ts — Atomic read-modify-write helpers for orch-state.json
 *
 * OSC-2: All writers of docs/data/orch/orch-state.json MUST use
 * writeOrchStateAtomic() so that partial writes never corrupt the file.
 *
 * Protocol (§2.3 of architecture brief 2026-06-01-orch-state-consolidate.md):
 *   1. Read current JSON (full file).
 *   2. Apply mutation to desired section ONLY.
 *   3. Write to a sibling temp file.
 *   4. rename(tmp, target) — atomic on POSIX filesystems.
 *
 * Cross-section write rule: every caller receives the full OrchState object,
 * mutates ONLY its owned section, and passes the whole updated object back.
 * Sibling sections are NEVER dropped.
 *
 * WF-2 CAS RETRY (WORKFLOW-FLUIDITY sprint):
 *   appendSignalQueueRow and writeHeadAtomic both use mtime-compare-retry
 *   (up to 3 retries) to detect concurrent clobber and re-apply the write.
 *   Three concurrent writer classes (all must use this module):
 *     1. dev-team (hourly drain at :07)
 *     2. cowork-team (every 15 min)
 *     3. system-auditor Tier-2 (0 every 4h)
 *
 * DDD Layer: infrastructure — may be imported by scheduler/ and infrastructure/signals/.
 */

import { writeFileSync, renameSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal OrchState shape (only sections touched by mcp-server writers)
// Full schema in docs/architecture-briefs/2026-06-01-orch-state-consolidate.md §3
// ─────────────────────────────────────────────────────────────────────────────

export interface OrchStateSignalRow {
  id: string;
  ts: string;
  from: string;
  to: string;
  type: string;
  /** ≤120 chars — NO raw payload blobs (HC-2) */
  summary: string;
  severity: "CRITICAL" | "HIGH" | "MED" | "LOW" | "INFO";
  status: "NEW" | "READ" | "RESOLVED" | "PARTIAL" | "OPEN" | string;
  payload_ref: string | null;
}

export interface OrchStateSignalQueue {
  _updated_at: string;
  _updated_by: string;
  rows: OrchStateSignalRow[];
  archive: Array<{ id: string; ts: string; summary: string; status: string }>;
}

/**
 * Canonical task row schema for docs/data/orch/orch-state.json.
 *
 * Authority: This interface is the machine-readable SSOT for task structure.
 * Human-readable reference: docs/standards/task-schema.md
 *
 * Mandatory fields: id, title, owner, status, zone, created_at
 * Optional fields: task_id (legacy), status_note, closed_at, sprint, priority, size, type, files, depends, note, commit
 *
 * Closed status enum (no freeform variants):
 *   TODO | IN_PROGRESS | REVIEW | DONE | BLOCKED | CANCELLED | DEFERRED
 *
 * Banned fields (never written): desc, label, summary, resolved_id, task_id (as write target)
 *
 * Post-F1B migration, all .task_board.done[] and .task_board.active_sprints[].tasks[] rows use
 * 'id' as the canonical field (not 'task_id'). The projectTask() function coalesces
 * id || task_id for backward-compat reading.
 */
export interface OrchStateTaskBoardTask {
  /** Canonical task ID — mandatory post-F1B migration. */
  id: string;
  /**
   * Legacy-tolerance only — some pre-F1B hand-authored rows used task_id.
   * Read-path coalesce: prefer id, fall back to task_id.
   * NEVER write new data with task_id — write id.
   */
  task_id?: string;
  title: string;
  type?: string;
  owner: string;
  depends?: string | string[] | null;
  status: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE" | "BLOCKED" | "CANCELLED" | "DEFERRED" | string;
  size?: string | null;
  zone?: string;
  note?: string;
  label?: string;
  // New canonical optional fields (task-schema.md v1.0)
  status_note?: string;    // freeform status detail (max ~500 chars)
  created_at?: string;     // ISO 8601 UTC — when task was created
  closed_at?: string;      // ISO 8601 UTC — when task reached terminal status
  sprint?: string;         // sprint ID this task belongs to
  priority?: string;       // high / medium / low
  files?: string[];        // file paths touched by this task
  commit?: string;         // git commit hash(es) delivering the task
}

export interface OrchStateTaskBoardSprint {
  id: string;
  label?: string;
  status: string;
  opened_at?: string;
  tasks: OrchStateTaskBoardTask[];
}

export interface OrchStateTaskBoard {
  _updated_at: string;
  _updated_by: string;
  active_sprints: OrchStateTaskBoardSprint[];
  /** Completed tasks — moved here from active_sprints after sprint closure. Post-F1B canonical. */
  done?: OrchStateTaskBoardTask[];
  backlog: Array<{ id: string; summary: string; priority: string }>;
  archive: OrchStateTaskBoardTask[];
}

/**
 * Minimal full OrchState envelope — all sections present.
 * Typed loosely for sibling-section preservation (we only write what we own).
 */
export interface OrchState {
  _schema: string;
  _ssot?: boolean;
  _updated_at?: string;
  _updated_by?: string;
  head: Record<string, unknown>;
  dashboard_section_cache?: Record<string, unknown>;
  narrative?: Record<string, unknown>;
  session_handoff_status?: Record<string, unknown>;
  task_board: OrchStateTaskBoard;
  signal_queue: OrchStateSignalQueue;
  sprint_goal?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Atomic write
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Atomically write data to path using temp-file-then-rename.
 *
 * Guarantees: if the process crashes mid-write the target is never half-written.
 * Safe on POSIX (Darwin/Linux): rename(2) is atomic within the same filesystem.
 *
 * §2.3 STRUCTURAL SENTINEL (validate-before-rename):
 *   All guard checks run BEFORE any fs write/rename. On throw, the SSOT is
 *   left untouched — nothing is written or renamed.
 *   Invariant: `data` MUST be a complete OrchState envelope with top-level
 *   `.head`, `.task_board`, and `.signal_queue` sections. Partial/truncated
 *   objects are rejected to prevent SSOT clobber (class of incident 39f5ba66).
 *
 * @param path   - Absolute path to the target file
 * @param data   - Object to serialise as JSON (2-space indent); must include
 *                 top-level .head, .task_board, and .signal_queue sections.
 * @throws Error if the serialized payload is empty/too-short, fails round-trip
 *         parse, or is missing any required top-level section.
 */
export function writeOrchStateAtomic(path: string, data: object): void {
  // ── §2.3 GUARD: all checks before any fs operation ───────────────────────
  const serialized = JSON.stringify(data, null, 2);
  if (!serialized || serialized.length < 2) {
    throw new Error(
      "[atomic-write] empty serialized payload — refusing to write",
    );
  }
  const parsed = JSON.parse(serialized); // throws on malformed JSON
  if (!parsed.head || !parsed.task_board || !parsed.signal_queue) {
    throw new Error(
      "[atomic-write] missing required top-level section — refusing to write",
    );
  }
  // ── fs operations only after guards pass ─────────────────────────────────
  const tmp = path + ".tmp." + Date.now();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(tmp, serialized, "utf8");
  renameSync(tmp, path);
}

// ─────────────────────────────────────────────────────────────────────────────
// Read helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read and parse orch-state.json.
 *
 * @param orchStatePath - Absolute path to orch-state.json
 * @returns Parsed OrchState
 * @throws If file is missing or JSON is malformed
 */
export function readOrchState(orchStatePath: string): OrchState {
  const raw = readFileSync(orchStatePath, "utf8");
  return JSON.parse(raw) as OrchState;
}

/**
 * Read orch-state.json or return null if absent (for graceful degradation).
 */
export function readOrchStateOrNull(orchStatePath: string): OrchState | null {
  if (!existsSync(orchStatePath)) return null;
  try {
    return readOrchState(orchStatePath);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// signal_queue append helper (WF-2: mtime-compare-retry CAS)
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum number of CAS retry attempts before giving up. */
export const CAS_MAX_RETRIES = 3;

/**
 * Append a row to orch-state.json .signal_queue.rows[] atomically.
 *
 * Read-modify-write on the signal_queue section ONLY.
 * All sibling sections (head, task_board, sprint_goal, …) are preserved verbatim.
 *
 * WF-2 CAS RETRY: records mtime before the read, checks mtime after the atomic
 * rename, and retries up to CAS_MAX_RETRIES times when a concurrent writer
 * clobbered the file. If all retries are exhausted the row is dropped with a
 * WARN log (do NOT throw — one lost signal row is better than crashing the
 * auditor/cowork cycle).
 *
 * CONCURRENT WRITERS — three classes write .signal_queue.rows[] concurrently:
 *   1. dev-team (hourly drain at :07)
 *   2. cowork-team (every 15 min)
 *   3. system-auditor Tier-2 (0 every 4h)
 * All callers MUST go through this function; bare temp→rename without the
 * retry guard silently loses rows when :00/4h fires.
 *
 * @param orchStatePath  - Absolute path to orch-state.json
 * @param row            - Signal row to append (summary capped at 120 chars per HC-2)
 * @param nowIso         - ISO-8601 UTC timestamp string for _updated_at
 * @param updatedBy      - Agent id for _updated_by
 * @param readFileFn     - Injectable fs.readFileSync wrapper (for tests)
 * @param writeAtomicFn  - Injectable writeOrchStateAtomic (for tests)
 * @param fileExistsFn   - Injectable existsSync wrapper (for tests)
 * @param statMtimeFn    - Injectable mtime reader (for tests); returns mtimeMs or -1 if absent
 * @param warnFn         - Injectable warn logger (for tests)
 */
export function appendSignalQueueRow(
  orchStatePath: string,
  row: OrchStateSignalRow,
  nowIso: string,
  updatedBy: string,
  readFileFn: (p: string) => string = (p) => readFileSync(p, "utf8"),
  writeAtomicFn: (p: string, d: object) => void = writeOrchStateAtomic,
  fileExistsFn: (p: string) => boolean = existsSync,
  statMtimeFn: (p: string) => number = (p) => {
    try { return statSync(p).mtimeMs; } catch { return -1; }
  },
  warnFn: (msg: string) => void = (msg) => console.warn(msg),
): void {
  if (!fileExistsFn(orchStatePath)) return;

  // Cap summary at 120 chars (HC-2)
  const cappedRow: OrchStateSignalRow = {
    ...row,
    summary:
      row.summary.length > 120 ? row.summary.slice(0, 117) + "..." : row.summary,
  };

  for (let attempt = 0; attempt < CAS_MAX_RETRIES; attempt++) {
    // Step 1: record mtime BEFORE reading the file
    const mtimeBefore = statMtimeFn(orchStatePath);

    // Step 2: read + apply mutation
    const state = JSON.parse(readFileFn(orchStatePath)) as OrchState;
    state.signal_queue = {
      ...state.signal_queue,
      _updated_at: nowIso,
      _updated_by: updatedBy,
      rows: [cappedRow, ...(state.signal_queue?.rows ?? [])],
    };

    // Step 3: compare mtime AFTER modification but BEFORE the rename.
    // If a concurrent writer changed the file during our read/modify window,
    // discard this attempt and re-read from the current file state.
    const mtimeAfterMod = statMtimeFn(orchStatePath);
    if (mtimeBefore !== -1 && mtimeAfterMod !== mtimeBefore) {
      // Concurrent clobber detected — retry with a fresh read.
      continue;
    }

    // Step 4: atomic rename (our write; mtime changes to now)
    writeAtomicFn(orchStatePath, state);
    return; // SUCCESS
  }

  // All retries exhausted — drop the row with a warning.
  // For CRITICAL/HIGH severity rows also emit a structured warning.
  const severity = row.severity ?? "INFO";
  const dropMsg = `[signal-queue] CAS collision after ${CAS_MAX_RETRIES} retries — row dropped: id=${row.id} severity=${severity} summary="${row.summary.slice(0, 60)}"`;
  warnFn(dropMsg);
  if (severity === "CRITICAL" || severity === "HIGH") {
    warnFn(`[signal-queue] HIGH-SEVERITY ROW DROPPED — escalate if this recurs: ${row.id}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// .head CAS write helper (WF-2 / FU-ORCH-HEAD-CAS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal shape for a .head update.
 * All fields are optional so callers only supply what they own.
 */
export interface OrchStateHeadUpdate {
  status?: string;
  updated_at?: string;
  updated_by?: string;
  active_task_id?: string | null;
  next_action?: string | null;
  next_agent?: string | null;
  wip?: number;
  wip_max?: number;
  [key: string]: unknown;
}

/**
 * Write .head atomically with mtime-compare-retry (FU-ORCH-HEAD-CAS, WF-2).
 *
 * Reads the full orch-state.json, merges headUpdate into the existing .head
 * object (shallow merge — other fields in .head are preserved), then writes
 * atomically. Uses the same CAS_MAX_RETRIES loop as appendSignalQueueRow to
 * survive concurrent sibling writers.
 *
 * CONCURRENT WRITERS: same three classes as signal_queue (dev-team, cowork-team,
 * system-auditor) all write .head as part of pipeline-state updates.
 * This function is the ONLY approved path for TS code that updates .head.
 *
 * @param orchStatePath  - Absolute path to orch-state.json
 * @param headUpdate     - Partial .head fields to merge
 * @param readFileFn     - Injectable readFileSync (for tests)
 * @param writeAtomicFn  - Injectable writeOrchStateAtomic (for tests)
 * @param fileExistsFn   - Injectable existsSync (for tests)
 * @param statMtimeFn    - Injectable mtime reader (for tests)
 * @param warnFn         - Injectable warn logger (for tests)
 * @returns true if write succeeded within retry budget, false if all retries
 *          exhausted (caller may log/alert; head is NOT updated in that case).
 */
export function writeHeadAtomic(
  orchStatePath: string,
  headUpdate: OrchStateHeadUpdate,
  readFileFn: (p: string) => string = (p) => readFileSync(p, "utf8"),
  writeAtomicFn: (p: string, d: object) => void = writeOrchStateAtomic,
  fileExistsFn: (p: string) => boolean = existsSync,
  statMtimeFn: (p: string) => number = (p) => {
    try { return statSync(p).mtimeMs; } catch { return -1; }
  },
  warnFn: (msg: string) => void = (msg) => console.warn(msg),
): boolean {
  if (!fileExistsFn(orchStatePath)) return false;

  for (let attempt = 0; attempt < CAS_MAX_RETRIES; attempt++) {
    // Step 1: record mtime BEFORE reading the file
    const mtimeBefore = statMtimeFn(orchStatePath);

    // Step 2: read + apply mutation
    const state = JSON.parse(readFileFn(orchStatePath)) as OrchState;
    state.head = { ...state.head, ...headUpdate };

    // Step 3: compare mtime AFTER modification but BEFORE the rename.
    const mtimeAfterMod = statMtimeFn(orchStatePath);
    if (mtimeBefore !== -1 && mtimeAfterMod !== mtimeBefore) {
      // Concurrent clobber detected — retry with fresh read.
      continue;
    }

    // Step 4: atomic rename (our write)
    writeAtomicFn(orchStatePath, state);
    return true; // SUCCESS
  }

  warnFn(
    `[orch-head] CAS collision after ${CAS_MAX_RETRIES} retries — .head update dropped: ${JSON.stringify(headUpdate)}`,
  );
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical task status values (SSOT for countTasksFromTaskBoard)
// These match the schema defined in docs/architecture-briefs/2026-06-01-orch-state-consolidate.md §3.
// All status comparisons MUST reference these constants to prevent silent drift.
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical task status: work is complete. */
export const TASK_STATUS_DONE = "DONE" as const;
/** Canonical task status: actively being worked on. */
export const TASK_STATUS_IN_PROGRESS = "IN_PROGRESS" as const;
// "TODO" | "BLOCKED" | "DEFERRED" fall through to backlog in the counter.

// ─────────────────────────────────────────────────────────────────────────────
// task_board task-count helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count tasks across all active_sprints by status.
 *
 * Maps orch-state.json task_board task statuses:
 *   - TASK_STATUS_DONE        → done
 *   - TASK_STATUS_IN_PROGRESS → inProgress
 *   - "TODO" | "BLOCKED" | "DEFERRED" → backlog
 *
 * @param taskBoard  - OrchStateTaskBoard parsed from orch-state.json
 * @returns { done, inProgress, backlog }
 */
export function countTasksFromTaskBoard(
  taskBoard: OrchStateTaskBoard,
): { done: number; inProgress: number; backlog: number } {
  let done = 0;
  let inProgress = 0;
  let backlog = 0;

  for (const sprint of taskBoard.active_sprints ?? []) {
    for (const task of sprint.tasks ?? []) {
      const s = (task.status ?? "").toUpperCase();
      if (s === TASK_STATUS_DONE) {
        done++;
      } else if (s === TASK_STATUS_IN_PROGRESS) {
        inProgress++;
      } else {
        // TODO, BLOCKED, DEFERRED → backlog
        backlog++;
      }
    }
  }

  return { done, inProgress, backlog };
}

// ─────────────────────────────────────────────────────────────────────────────
// Default orch-state.json path derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive the default orch-state.json path relative to the repo root.
 *
 * @param projectRoot  - Absolute path to the repo root
 * @returns Absolute path to docs/data/orch/orch-state.json
 */
export function getOrchStatePath(projectRoot: string): string {
  return resolve(projectRoot, "docs", "data", "orch", "orch-state.json");
}
