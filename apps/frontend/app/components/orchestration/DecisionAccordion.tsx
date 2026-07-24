/**
 * DecisionAccordion — renders STEP entries for a DONE task.
 *
 * Priority: by_task[taskId] > sprint_bucket[sprintId] > empty-state.
 * F3: AC-F3-6, AC-F3-7, AC-F3-8. No dangerouslySetInnerHTML (AC-F3-12).
 *
 * Extracted verbatim from dashboard.orchestration.tsx (FACTORY-FRONTEND-split-orchestration).
 */
import { StepCard } from "~/components/orchestration/StepCard";
import type { DecisionsDto, StepDto } from "~/domain/orchestration/types";

export function DecisionAccordion({
  taskId,
  sprintId,
  decisions,
  statusNote,
}: {
  taskId: string;
  sprintId?: string;
  decisions?: DecisionsDto;
  /** FIX-ORCH-DONE-GRID-COLS: status_note moved here from inline Status cell to prevent row height explosion */
  statusNote?: string;
}) {
  const taskSteps = decisions?.by_task[taskId] ?? [];
  const sprintSteps = (sprintId ? decisions?.sprint_bucket[sprintId] : undefined) ?? [];

  const sortByTime = (steps: StepDto[]) =>
    [...steps].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

  return (
    <div
      className="border-t border-slate-700 bg-slate-900 px-4 py-3"
      style={{ maxWidth: "90vw", overflowWrap: "break-word" }}
      data-testid={`decision-accordion-${taskId}`}
    >
      {/* status_note banner — shown when present (FIX-ORCH-DONE-GRID-COLS) */}
      {statusNote && (
        <p className="mb-2 break-words text-xs text-slate-400 italic border-b border-slate-700 pb-2">
          {statusNote}
        </p>
      )}
      {taskSteps.length === 0 && sprintSteps.length === 0 ? (
        <p className="text-xs text-slate-500 italic">No decisions recorded for this task.</p>
      ) : taskSteps.length > 0 ? (
        <div className="space-y-3">
          {sortByTime(taskSteps).map((step) => (
            <StepCard key={step.step_id} step={step} />
          ))}
        </div>
      ) : (
        <div>
          <p className="mb-2 text-xs font-medium text-slate-500">
            Sprint-level decisions (no task-id assigned)
          </p>
          <div className="space-y-3">
            {sortByTime(sprintSteps).map((step) => (
              <StepCard key={step.step_id} step={step} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
