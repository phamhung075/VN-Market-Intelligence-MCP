/**
 * DoneTaskRow — one clickable row inside DoneTaskGroup's DONE table; opens a
 * DecisionAccordion below it when expanded.
 *
 * FIX-ORCH-DONE-GRID-COLS: uses the shared DONE_GRID template so header and
 * data rows always co-align. status_note is suppressed from the inline cell
 * (shown in the accordion on expand).
 *
 * Extracted verbatim from dashboard.orchestration.tsx's DoneTaskGroup
 * (FACTORY-FRONTEND-split-orchestration) — split a second time (row vs.
 * group shell) to land the group file under the 120L cap.
 */
import { DecisionAccordion } from "~/components/orchestration/DecisionAccordion";
import { DONE_GRID } from "~/components/orchestration/doneTaskGrid";
import { taskStatusClasses } from "~/domain/formatters/task-status-classes";
import type { DecisionsDto, TaskRow } from "~/domain/orchestration/types";

export function DoneTaskRow({
  task,
  idx,
  isOpen,
  onToggle,
  decisions,
  sprintId,
}: {
  task: TaskRow;
  idx: number;
  isOpen: boolean;
  onToggle: (id: string) => void;
  decisions?: DecisionsDto;
  sprintId?: string;
}) {
  const rowBase = idx % 2 === 0 ? "bg-slate-800" : "bg-slate-850";

  return (
    <div>
      {/* F3 AC-F3-3, AC-F3-10, AC-F3-11: clickable DONE row */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={() => onToggle(task.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(task.id);
          }
        }}
        className={`grid ${DONE_GRID} border-b border-slate-700 last:border-0 text-xs cursor-pointer hover:bg-slate-700 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500 transition-colors ${rowBase}`}
      >
        {/* ID: monospace, truncated — no overflow since track is fixed 120px */}
        <div className="px-3 py-2 font-mono text-slate-300 truncate">{task.id}</div>
        {/* Title: min-w-0 required so minmax(0,1fr) can actually shrink below content width */}
        <div className="min-w-0 px-3 py-2 text-slate-200">
          <span className="break-words">{task.title}</span>
          {task.note && (
            <p className="mt-0.5 break-words text-slate-500 italic line-clamp-2">{task.note}</p>
          )}
        </div>
        {/* Owner: truncate within fixed 110px track */}
        <div className="px-3 py-2 text-slate-400 truncate">{task.owner ?? "—"}</div>
        {/* Status: badge only — status_note moved to accordion (FIX-ORCH-DONE-GRID-COLS) */}
        <div className={`px-3 py-2 font-semibold ${taskStatusClasses(task.status)}`}>
          {task.status}
        </div>
        {/* Zone: truncate within fixed 130px track */}
        <div className="px-3 py-2 text-slate-500 truncate" title={task.zone ?? undefined}>{task.zone ?? "—"}</div>
        {/* F3 AC-F3-10: chevron indicator — rotated when open */}
        <div className="flex items-center justify-center pr-2" aria-hidden="true">
          <span
            className={`inline-block transition-transform duration-200 text-slate-500 ${isOpen ? "" : "-rotate-180"}`}
          >
            ▾
          </span>
        </div>
      </div>
      {/* F3 AC-F3-5: accordion panel — conditionally rendered */}
      {isOpen && (
        <DecisionAccordion
          taskId={task.id}
          sprintId={sprintId}
          decisions={decisions}
          statusNote={task.status_note}
        />
      )}
    </div>
  );
}
