/**
 * Orchestration State DTO contract — mirrors the backend contract served by
 * GET /api/orchestration (frontend server-side proxy → mcp-server :3000 →
 * docs/data/orch/orch-state.json), specifically journalStore.ts (StepDto /
 * DecisionsDto) and the orch-state.json shape itself.
 *
 * Domain layer: zero imports from lib/api/, routes/, or components/.
 *
 * FACTORY-FRONTEND-split-orchestration (behavior-preserving refactor):
 * moved verbatim from dashboard.orchestration.tsx (~L53-149) — no shape
 * change. A drift here would misrender real orch-state data, so these types
 * are a byte-identical copy, re-exported from the route for backward-compat
 * call-sites.
 */

// F3: Decision Journal types — mirrors F2 DTO contract (journalStore.ts StepDto / DecisionsDto)
export interface StepDto {
  step_id: string;
  agent_id: string;
  timestamp: string;
  task_id: string | null;
  what_done: string;
  what_considered: string[];
  why_decision: string;
  why_change: string;
}

export interface DecisionsDto {
  by_task: Record<string, StepDto[]>;
  sprint_bucket: Record<string, StepDto[]>;
}

/** Closed 7-value enum per docs/standards/task-schema.md */
export type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE" | "BLOCKED" | "CANCELLED" | "DEFERRED";

export interface TaskRow {
  id: string;
  title: string;
  owner?: string;
  status: TaskStatus;
  zone?: string;
  note?: string;
  /** F3: optional free-form context about current state (e.g. "pending rebuild") */
  status_note?: string;
}

export interface TaskBoardCounts {
  done: number;
  in_progress: number;
  backlog: number;
}

/** Actual DTO shape: flat tasks array + counts object + served done[] (F3) */
export interface TaskBoard {
  counts: TaskBoardCounts;
  tasks: TaskRow[];
  /** F3: served done array — authoritative source from orch-state .task_board.done */
  done?: TaskRow[];
}

export interface SignalRow {
  id: string;
  ts: string;
  from: string;
  to: string;
  type: string;
  summary: string;
  severity: "CRITICAL" | "HIGH" | "MED" | "LOW" | "INFO" | string;
  status: string;
  payload_ref: string | null;
}

export interface SignalQueue {
  rows: SignalRow[];
}

/** Actual DTO shape: flat sprint_goal (not entries array) */
export interface SprintGoal {
  sprint_id: string;
  vision: string;
  scope: string[];
  metric: string;
}

export interface Narrative {
  current_sprint?: string;
  last_closed?: string;
  watch_items?: string[];
  open_sprints?: string[];
}

export interface Head {
  status: string;
  active_task_id?: string;
  next_agent?: string;
  wip?: number;
  wip_max?: number;
  updated_at?: string;
  updated_by?: string;
}

/** Actual DTO top-level shape */
export interface OrchState {
  last_updated_iso?: string;
  head: Head;
  narrative?: Narrative;
  task_board: TaskBoard;
  signal_queue?: SignalQueue;
  sprint_goal?: SprintGoal;
  /** F3: decision journal entries keyed by task_id or sprint_id — optional for backward-compat */
  decisions?: DecisionsDto;
}
