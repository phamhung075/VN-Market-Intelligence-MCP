/**
 * SprintGoalPanel — "Sprint Goal" section of /dashboard/orchestration.
 *
 * Reads the ACTUAL DTO shape:
 *   sprint_goal: { sprint_id, vision, scope: string[], metric }
 *   (NOT sprint_goal.entries[])
 *
 * Extracted verbatim from dashboard.orchestration.tsx (FACTORY-FRONTEND-split-orchestration).
 */
import type { SprintGoal } from "~/domain/orchestration/types";

export function SprintGoalPanel({ goal }: { goal: SprintGoal | undefined }) {
  if (!goal) {
    return <p className="text-sm text-slate-500">No sprint goal available.</p>;
  }

  return (
    <div className="rounded border border-slate-700 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-xs font-semibold text-slate-200">
          {goal.sprint_id}
        </span>
        <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-blue-900 text-blue-300">
          ACTIVE
        </span>
      </div>
      <p className="mb-2 text-xs text-slate-300 leading-relaxed">{goal.vision}</p>
      {goal.scope && goal.scope.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-slate-400 mb-1">Scope:</p>
          <ul className="space-y-0.5">
            {goal.scope.map((item, idx) => (
              <li key={idx} className="text-xs text-slate-400 flex gap-1.5">
                <span className="text-slate-600 flex-shrink-0">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      {goal.metric && (
        <p className="text-xs text-slate-500">
          <span className="font-medium text-slate-400">Metric: </span>
          {goal.metric}
        </p>
      )}
    </div>
  );
}
