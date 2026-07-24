/**
 * TaskBoardPanel — "Task Board" section of /dashboard/orchestration: counts +
 * In Progress / Backlog / Done groups from task_board.
 *
 * Reads the ACTUAL DTO shape:
 *   task_board.tasks  — flat TaskRow[]
 *   task_board.counts — { done, in_progress, backlog }
 *
 * Guards: tasks ?? [] so a missing/empty field renders empty state, no throw.
 * F3: accepts decisions + sprintId and threads them to DoneTaskGroup.
 *
 * Extracted verbatim from dashboard.orchestration.tsx (FACTORY-FRONTEND-split-orchestration).
 */
import { TaskGroup } from "~/components/orchestration/TaskGroup";
import { DoneTaskGroup } from "~/components/orchestration/DoneTaskGroup";
import type { DecisionsDto, TaskBoard as TaskBoardDto } from "~/domain/orchestration/types";

export function TaskBoardPanel({
  board,
  decisions,
  sprintId,
}: {
  board: TaskBoardDto;
  decisions?: DecisionsDto;
  sprintId?: string;
}) {
  const tasks = board.tasks ?? [];
  const counts = board.counts ?? { done: 0, in_progress: 0, backlog: 0 };

  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS");
  const todo = tasks.filter((t) => t.status === "TODO");
  // F3: use board.done ?? [] — authoritative served array; no filter fallback
  const done = board.done ?? [];

  if (tasks.length === 0 && done.length === 0) {
    return <p className="text-sm text-slate-500">No tasks in board.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Counts from DTO */}
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="text-slate-400">
          <span className="font-semibold text-blue-400">{counts.in_progress}</span> in progress
        </span>
        <span className="text-slate-400">
          <span className="font-semibold text-slate-300">{counts.backlog}</span> backlog
        </span>
        <span className="text-slate-400">
          <span className="font-semibold text-green-400">{counts.done}</span> done
        </span>
        <span className="text-slate-400">
          <span className="font-semibold text-slate-500">{tasks.length}</span> total
        </span>
      </div>

      {/* Active / In-progress tasks */}
      {inProgress.length > 0 && (
        <TaskGroup label="In Progress" tasks={inProgress} />
      )}

      {/* Backlog / TODO tasks */}
      {todo.length > 0 && (
        <TaskGroup label="Backlog / TODO" tasks={todo} />
      )}

      {/* Done tasks — collapsible; shows last 10 by default, full list on expand.
          F3: threads decisions + sprintId for accordion drilldown. */}
      {done.length > 0 && (
        <DoneTaskGroup tasks={done} decisions={decisions} sprintId={sprintId} />
      )}
    </div>
  );
}
