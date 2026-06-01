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
 * DDD Layer: infrastructure — may be imported by scheduler/ and infrastructure/signals/.
 */

import { writeFileSync, renameSync, readFileSync, existsSync } from "node:fs";
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

export interface OrchStateTaskBoardTask {
  task_id: string;
  title: string;
  type: string;
  owner: string;
  depends: string | null;
  status: string;
  size?: string | null;
  zone?: string;
  note?: string;
  label?: string;
  closed_at?: string;
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
 * @param path   - Absolute path to the target file
 * @param data   - Object to serialise as JSON (2-space indent)
 */
export function writeOrchStateAtomic(path: string, data: object): void {
  const tmp = path + ".tmp." + Date.now();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
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
// signal_queue append helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append a row to orch-state.json .signal_queue.rows[] atomically.
 *
 * Read-modify-write on the signal_queue section ONLY.
 * All sibling sections (head, task_board, sprint_goal, …) are preserved verbatim.
 *
 * @param orchStatePath  - Absolute path to orch-state.json
 * @param row            - Signal row to append (summary capped at 120 chars per HC-2)
 * @param nowIso         - ISO-8601 UTC timestamp string for _updated_at
 * @param updatedBy      - Agent id for _updated_by
 * @param readFileFn     - Injectable fs.readFileSync wrapper (for tests)
 * @param writeAtomicFn  - Injectable writeOrchStateAtomic (for tests)
 * @param fileExistsFn   - Injectable existsSync wrapper (for tests)
 */
export function appendSignalQueueRow(
  orchStatePath: string,
  row: OrchStateSignalRow,
  nowIso: string,
  updatedBy: string,
  readFileFn: (p: string) => string = (p) => readFileSync(p, "utf8"),
  writeAtomicFn: (p: string, d: object) => void = writeOrchStateAtomic,
  fileExistsFn: (p: string) => boolean = existsSync,
): void {
  if (!fileExistsFn(orchStatePath)) return;

  const state = JSON.parse(readFileFn(orchStatePath)) as OrchState;

  // Cap summary at 120 chars (HC-2)
  const cappedRow: OrchStateSignalRow = {
    ...row,
    summary:
      row.summary.length > 120 ? row.summary.slice(0, 117) + "..." : row.summary,
  };

  state.signal_queue = {
    ...state.signal_queue,
    _updated_at: nowIso,
    _updated_by: updatedBy,
    rows: [cappedRow, ...(state.signal_queue?.rows ?? [])],
  };

  writeAtomicFn(orchStatePath, state);
}

// ─────────────────────────────────────────────────────────────────────────────
// task_board task-count helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count tasks across all active_sprints by status.
 *
 * Maps orch-state.json task_board task statuses:
 *   - "DONE"        → done
 *   - "IN_PROGRESS" → inProgress
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
      if (s === "DONE") {
        done++;
      } else if (s === "IN_PROGRESS") {
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
