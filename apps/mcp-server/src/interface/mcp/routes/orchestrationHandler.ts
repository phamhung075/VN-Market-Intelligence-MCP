/**
 * orchestrationHandler.ts — GET /api/orchestration read-only endpoint
 *
 * OSC-4a: Serve a safe, read-only projection of docs/data/orch/orch-state.json (v3)
 * for the dashboard consumer.
 *
 * HC-2 SAFETY CONTRACT — ONLY these fields are exposed:
 *   - last_updated_iso        (newest of _updated_at and head.updated_at)
 *   - head                    (status, active_task_id, next_agent, wip, wip_max,
 *                              updated_at, updated_by — NO next_action raw text)
 *   - task_board.counts       (by status: done / in_progress / backlog)
 *   - task_board.tasks[]      (id, title, status, owner, zone — NO free-form payload)
 *   - signal_queue.rows[]     (id, ts, from, to, type, summary, severity, status,
 *                              payload_ref — NEVER raw payload blobs)
 *   - sprint_goal             (current sprint entry: sprint_id, vision, scope, metric)
 *   - narrative               (current_sprint, last_closed, watch_items, open_sprints)
 *
 * Returns 200 JSON on success, 503 JSON {error} when file is missing or unreadable.
 *
 * DDD Layer: interface — no domain or infrastructure imports beyond orchStateStore.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  readOrchState,
  countTasksFromTaskBoard,
  type OrchState,
  type OrchStateTaskBoardTask,
  type OrchStateSignalRow,
} from "../../../infrastructure/orchStateStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Safe projection types
// ─────────────────────────────────────────────────────────────────────────────

/** Safe head projection — NO next_action (free-form blob) */
export interface OrchHeadDto {
  status: string;
  active_task_id: string | null;
  next_agent: string | null;
  wip: number;
  wip_max: number;
  updated_at: string;
  updated_by: string;
}

/** Safe task row — id, title, status, owner, zone only */
export interface OrchTaskDto {
  id: string;
  title: string;
  status: string;
  owner: string;
  zone: string;
}

/** Safe signal row — HC-2: payload_ref ONLY, never raw payload */
export interface OrchSignalRowDto {
  id: string;
  ts: string;
  from: string;
  to: string;
  type: string;
  summary: string;
  severity: string;
  status: string;
  payload_ref: string | null;
}

export interface OrchTaskBoardDto {
  counts: { done: number; in_progress: number; backlog: number };
  tasks: OrchTaskDto[];
}

export interface OrchSprintGoalDto {
  sprint_id: string;
  vision: string;
  scope: string[];
  metric: string;
}

export interface OrchNarrativeDto {
  current_sprint: string;
  last_closed: string;
  watch_items: string[];
  open_sprints: string[];
}

/** Full response DTO */
export interface OrchestrationDto {
  last_updated_iso: string;
  head: OrchHeadDto;
  task_board: OrchTaskBoardDto;
  signal_queue: { rows: OrchSignalRowDto[] };
  sprint_goal: OrchSprintGoalDto | null;
  narrative: OrchNarrativeDto;
}

// ─────────────────────────────────────────────────────────────────────────────
// Projection helpers — each creates a safe DTO from raw OrchState data
// ─────────────────────────────────────────────────────────────────────────────

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" ? v : fallback;
}

function projectHead(raw: Record<string, unknown>): OrchHeadDto {
  return {
    status:         str(raw["status"], "unknown"),
    active_task_id: typeof raw["active_task_id"] === "string" ? raw["active_task_id"] : null,
    next_agent:     typeof raw["next_agent"]      === "string" ? raw["next_agent"]      : null,
    wip:            num(raw["wip"], 0),
    wip_max:        num(raw["wip_max"], 2),
    updated_at:     str(raw["updated_at"], ""),
    updated_by:     str(raw["updated_by"], ""),
    // NOTE: next_action deliberately omitted — HC-2 (free-form blob, may contain agent instructions)
  };
}

function projectTask(task: OrchStateTaskBoardTask): OrchTaskDto {
  // Prefer canonical task_id; fall back to legacy `id` key (schema-drift tolerance).
  // task_id+id are both typed in OrchStateTaskBoardTask — no magic strings.
  const resolvedId = str(task.task_id, "") || str(task.id, "");

  // Title fallback: if title is blank, show the resolved id so the dashboard
  // row is never silently empty — operator can at least identify the task.
  const resolvedTitle = str(task.title, "") || resolvedId;

  return {
    id:     resolvedId,
    title:  resolvedTitle,
    status: str(task.status, ""),
    owner:  str(task.owner, ""),
    zone:   str(task.zone, ""),
  };
}

function projectSignalRow(row: OrchStateSignalRow): OrchSignalRowDto {
  return {
    id:          str(row.id, ""),
    ts:          str(row.ts, ""),
    from:        str(row.from, ""),
    to:          str(row.to, ""),
    type:        str(row.type, ""),
    summary:     str(row.summary, ""),
    severity:    str(row.severity, ""),
    status:      str(row.status, ""),
    payload_ref: typeof row.payload_ref === "string" ? row.payload_ref : null,
    // HC-2: NO raw payload field — schema has none; this projection enforces it explicitly
  };
}

/** Extract the "current" sprint goal entry (first OPEN entry, or first entry). */
function projectSprintGoal(raw: Record<string, unknown> | undefined): OrchSprintGoalDto | null {
  if (!raw) return null;
  const entries = raw["entries"];
  if (!Array.isArray(entries) || entries.length === 0) return null;

  // Prefer first OPEN entry; fall back to first entry
  const entry = (entries as Record<string, unknown>[]).find(
    (e) => str(e["status"]).toUpperCase() === "OPEN"
  ) ?? (entries[0] as Record<string, unknown>);

  const scopeIn = entry["scope_in"];
  return {
    sprint_id: str(entry["sprint_id"], ""),
    vision:    str(entry["vision"], ""),
    scope:     Array.isArray(scopeIn) ? (scopeIn as unknown[]).map((s) => str(s)) : [],
    metric:    str(entry["success_metric"], ""),
  };
}

function projectNarrative(raw: Record<string, unknown> | undefined): OrchNarrativeDto {
  if (!raw) {
    return { current_sprint: "", last_closed: "", watch_items: [], open_sprints: [] };
  }
  const watchItems = raw["watch_items"];
  const openSprints = raw["open_sprints"];
  return {
    current_sprint: str(raw["current_sprint"], ""),
    last_closed:    str(raw["last_closed"], ""),
    watch_items:    Array.isArray(watchItems) ? (watchItems as unknown[]).map((s) => str(s)) : [],
    open_sprints:   Array.isArray(openSprints) ? (openSprints as unknown[]).map((s) => str(s)) : [],
  };
}

/** Pick the newest ISO timestamp between _updated_at and head.updated_at. */
function newestUpdated(state: OrchState): string {
  const root = str(state._updated_at, "");
  const head = str((state.head as Record<string, unknown>)["updated_at"] ?? "", "");
  if (!root && !head) return "";
  if (!root) return head;
  if (!head) return root;
  return root >= head ? root : head;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main projection function — exported for testability (pure)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the safe OrchestrationDto from a raw OrchState.
 * Pure function — no IO. Tested directly in unit tests.
 */
export function buildOrchestrationDto(state: OrchState): OrchestrationDto {
  const taskBoard = state.task_board;
  const counts = countTasksFromTaskBoard(taskBoard);

  // Flatten tasks across all active_sprints
  const tasks: OrchTaskDto[] = (taskBoard.active_sprints ?? []).flatMap((sprint) =>
    (sprint.tasks ?? []).map(projectTask)
  );

  // Signal rows — safe projection
  const signalRows: OrchSignalRowDto[] = (state.signal_queue?.rows ?? []).map(projectSignalRow);

  return {
    last_updated_iso: newestUpdated(state),
    head:             projectHead(state.head as Record<string, unknown>),
    task_board: {
      counts: { done: counts.done, in_progress: counts.inProgress, backlog: counts.backlog },
      tasks,
    },
    signal_queue: { rows: signalRows },
    sprint_goal:  projectSprintGoal(state.sprint_goal as Record<string, unknown> | undefined),
    narrative:    projectNarrative(state.narrative as Record<string, unknown> | undefined),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/orchestration.
 *
 * @param req            - Incoming HTTP request (unused — read-only, no query params)
 * @param res            - HTTP response
 * @param orchStatePath  - Absolute path to orch-state.json (injected for testability)
 */
export function handleGetOrchestration(
  req: IncomingMessage,
  res: ServerResponse,
  orchStatePath: string,
): void {
  let state: OrchState;
  try {
    state = readOrchState(orchStatePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `orch-state.json unreadable: ${msg}` }));
    return;
  }

  const dto = buildOrchestrationDto(state);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(dto));
}
