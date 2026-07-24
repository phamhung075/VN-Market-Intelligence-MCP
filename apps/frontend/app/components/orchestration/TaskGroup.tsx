/**
 * TaskGroup — a labeled table of TaskRow (used for the In Progress / Backlog
 * groups inside TaskBoard.tsx).
 *
 * Extracted verbatim from dashboard.orchestration.tsx (FACTORY-FRONTEND-split-orchestration).
 */
import { taskStatusClasses } from "~/domain/formatters/task-status-classes";
import type { TaskRow } from "~/domain/orchestration/types";

export function TaskGroup({ label, tasks }: { label: string; tasks: TaskRow[] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </h3>
      <div className="overflow-hidden rounded border border-slate-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900">
              <th className="px-3 py-2 text-left font-medium text-slate-400">ID</th>
              <th className="px-3 py-2 text-left font-medium text-slate-400">Title</th>
              <th className="px-3 py-2 text-left font-medium text-slate-400">Owner</th>
              <th className="px-3 py-2 text-left font-medium text-slate-400">Status</th>
              <th className="px-3 py-2 text-left font-medium text-slate-400">Zone</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task, idx) => (
              <tr
                key={task.id}
                className={`border-b border-slate-700 last:border-0 ${
                  idx % 2 === 0 ? "bg-slate-800" : "bg-slate-850"
                }`}
              >
                <td className="px-3 py-2 font-mono text-slate-300">{task.id}</td>
                <td className="px-3 py-2 text-slate-200">
                  {task.title}
                  {task.note && (
                    <p className="mt-0.5 text-slate-500 italic">{task.note}</p>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-400">{task.owner ?? "—"}</td>
                <td className={`px-3 py-2 font-semibold ${taskStatusClasses(task.status)}`}>
                  {task.status}
                  {task.status_note && (
                    <p className="mt-0.5 text-xs font-normal text-slate-500 italic">{task.status_note}</p>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-500">{task.zone ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
