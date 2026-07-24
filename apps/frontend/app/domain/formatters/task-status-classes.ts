/**
 * taskStatusClasses — Tailwind text-color class for a TaskStatus badge.
 * Domain layer: zero imports from lib/api/, routes/, or components/.
 *
 * Extracted from dashboard.orchestration.tsx (FACTORY-FRONTEND-split-orchestration).
 * Shared by TaskGroup.tsx and DoneTaskRow.tsx (app/components/orchestration/) —
 * lives here rather than colocated in one component to avoid those two files
 * importing from one another.
 */
import type { TaskStatus } from "~/domain/orchestration/types";

export function taskStatusClasses(status: TaskStatus): string {
  switch (status) {
    case "DONE":
      return "text-green-400";
    case "IN_PROGRESS":
      return "text-blue-400";
    case "TODO":
      return "text-slate-400";
    case "REVIEW":
      return "text-cyan-400";
    case "BLOCKED":
      return "text-red-400";
    case "CANCELLED":
      return "text-slate-600 line-through";
    case "DEFERRED":
      return "text-amber-600";
    default:
      return "text-amber-400";
  }
}
