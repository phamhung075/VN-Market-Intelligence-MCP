/**
 * tasksMdJanitorJob — shared types (D4 audit dimension, Task 1965b OSC-2 migration).
 *
 * Split out of tasksMdJanitorJob.ts (FIX-SIZELINT-TASKSMDJANITORJOB-1012L,
 * 2026-08-24) — pure type/interface definitions, zero logic. See
 * tasksMdJanitorJob.ts's own module doc for the R-1..R-7 step overview these
 * types support.
 */

import type { LockRow } from "../../infrastructure/db/coordinationStore.js";

export interface DivergenceRow {
  kind: "status" | "owner" | "not_found" | "pipeline_mismatch" | "concurrent_commit";
  taskId: string;
  summary: string;
}

/**
 * A candidate produced by Steps R-2/R-3, gated by the R-4b debounce before it may
 * become a DivergenceRow (FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE). `key` matches
 * the ledger key shape in handlers.md §Step R-4b: R2-mismatch:<id> / R3-no-board-row:<id>
 * / R3-owner-diverge:<id> / R3-status-diverge:<id>.
 */
export interface D4Candidate {
  key: string;
  div: DivergenceRow;
}

export interface JanitorResult {
  heldLocks: number;
  divergences: DivergenceRow[];
  pipelineState: { activeTaskId: string | null } | null;
  concurrentCommits: Array<{ hash1: string; hash2: string; delta: number }>;
  errors: string[];
}

/** Shape of orch-state.json .head (only the fields we read) — v3 snake_case */
export interface OrchHead {
  active_task_id?: string | null;
  status?: string;
}

export interface JanitorDeps {
  /** Return held sprint-task locks — defaults to real coordinationStore.listHeldTasks */
  listHeld: () => LockRow[];
  /**
   * Step R-1b live-concurrent-session guard: return live session-presence lock rows
   * (kind="session-presence", expired=false). Optional — defaults to zero live
   * sessions when omitted (the known-legit-pattern whitelist still applies; fail-safe
   * per handlers.md Failure modes: never suppress LESS on this path's absence).
   */
  listSessionPresence?: () => LockRow[];
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
