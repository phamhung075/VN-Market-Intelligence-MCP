/**
 * DoneTaskGroup — collapsible Done section.
 *
 * Default: collapsed, showing the PREVIEW_COUNT most-recent done tasks (last N).
 * Toggle: "Show all N" / "Show less" expands/collapses the full list.
 *
 * F3: each DONE task row is independently clickable; opens a DecisionAccordion
 * showing its StepDto entries (rendered by DoneTaskRow). Multi-open: Set<string>
 * of open task IDs (RULING-5).
 *
 * Extracted verbatim from dashboard.orchestration.tsx (FACTORY-FRONTEND-split-orchestration)
 * — split a second time (group shell vs. row) to land under the 120L cap;
 * see DoneTaskRow.tsx for the per-row markup this file maps over.
 */
import { useState } from "react";
import { DoneTaskRow } from "~/components/orchestration/DoneTaskRow";
import { DONE_GRID } from "~/components/orchestration/doneTaskGrid";
import type { DecisionsDto, TaskRow } from "~/domain/orchestration/types";

const DONE_PREVIEW_COUNT = 10;

export function DoneTaskGroup({
  tasks,
  decisions,
  sprintId,
}: {
  tasks: TaskRow[];
  decisions?: DecisionsDto;
  sprintId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  // F3 AC-F3-4: multi-open accordion state — Set of open task IDs
  const [openTaskIds, setOpenTaskIds] = useState<Set<string>>(new Set());

  const previewTasks = tasks.slice(-DONE_PREVIEW_COUNT);
  const visibleTasks = expanded ? tasks : previewTasks;
  const hasMore = tasks.length > DONE_PREVIEW_COUNT;

  // F3 AC-F3-4: toggle a task's accordion open/close independently
  const toggle = (id: string) =>
    setOpenTaskIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Done ({tasks.length})
        </h3>
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
            aria-expanded={expanded}
            aria-label={expanded ? "Show less done tasks" : `Show all ${tasks.length} done tasks`}
          >
            <span>{expanded ? "Show less" : `Show all ${tasks.length}`}</span>
            <span
              aria-hidden="true"
              className={`inline-block transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            >
              ▾
            </span>
          </button>
        )}
      </div>
      {/* F3: div-based layout to allow accordion rows between task rows */}
      <div className="overflow-hidden rounded border border-slate-700">
        {/* Header row — FIX-ORCH-DONE-GRID-COLS: shares DONE_GRID with each DoneTaskRow */}
        <div className={`grid ${DONE_GRID} border-b border-slate-700 bg-slate-900 text-xs`}>
          <div className="px-3 py-2 font-medium text-slate-400">ID</div>
          <div className="px-3 py-2 font-medium text-slate-400">Title</div>
          <div className="px-3 py-2 font-medium text-slate-400">Owner</div>
          <div className="px-3 py-2 font-medium text-slate-400">Status</div>
          <div className="px-3 py-2 font-medium text-slate-400">Zone</div>
          <div className="px-3 py-2" aria-hidden="true" />
        </div>
        {/* Task rows — each may expand an accordion below it */}
        <div data-testid="done-task-rows">
          {visibleTasks.map((task, idx) => (
            <DoneTaskRow
              key={task.id}
              task={task}
              idx={idx}
              isOpen={openTaskIds.has(task.id)}
              onToggle={toggle}
              decisions={decisions}
              sprintId={sprintId}
            />
          ))}
        </div>
      </div>
      {!expanded && hasMore && (
        <p className="mt-1 text-xs text-slate-600">
          Showing last {DONE_PREVIEW_COUNT} of {tasks.length} — click &ldquo;Show all&rdquo; to see all.
        </p>
      )}
    </div>
  );
}
