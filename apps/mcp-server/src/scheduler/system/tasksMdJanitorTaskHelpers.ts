/**
 * tasksMdJanitorJob — task-id normalization + orch-state.json task_board parser
 * (OSC-2 — replaces the old TASKS.md markdown parser).
 *
 * Split out of tasksMdJanitorJob.ts (FIX-SIZELINT-TASKSMDJANITORJOB-1012L,
 * 2026-08-24). bareTaskId() is used both by Step R-1b (applyR1bFilter, in
 * tasksMdJanitorR1bFilter.ts) and directly inside runTasksMdJanitor's R-2/R-3
 * cross-checks — it lives here (not with R-1b) because it is a generic
 * lock-id/task-id normalizer, not R-1b-specific logic.
 */

import type { OrchStateTaskBoardTask } from "../../infrastructure/orchStateStore.js";

/**
 * Strip the "task:" prefix from a lock's task_id, matching the bare id used in
 * orch-state.json .task_board entries and .head.active_task_id.
 */
export function bareTaskId(taskId: string): string {
  return taskId.startsWith("task:") ? taskId.slice(5) : taskId;
}

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
    // Post-F1B read-path coalesce: prefer canonical `id`, fall back to legacy `task_id`.
    // Write-path emits `id` only; coalesce stays one release per task-schema.md.
    taskId: t.id || t.task_id || "",
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
        // Post-F1B read-path coalesce: prefer canonical `id`, fall back to legacy `task_id`.
        taskId: task.id || task.task_id || "",
        title: task.title ?? "",
        status: task.status ?? "",
        owner: task.owner ?? "",
        raw: JSON.stringify(task),
      });
    }
  }
  return rows;
}
