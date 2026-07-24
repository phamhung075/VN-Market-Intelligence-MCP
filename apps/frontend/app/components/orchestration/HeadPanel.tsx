/**
 * HeadPanel — "Head" section of /dashboard/orchestration: current status,
 * active task, next agent, WIP, updated-by/at.
 *
 * Extracted verbatim from dashboard.orchestration.tsx (FACTORY-FRONTEND-split-orchestration).
 */
import { ClientTimestamp } from "~/components/ClientTimestamp";
import type { Head } from "~/domain/orchestration/types";

export function HeadPanel({ head }: { head: Head }) {
  const statusColour =
    head.status === "done"
      ? "text-green-400"
      : head.status === "in_progress"
        ? "text-blue-400"
        : "text-slate-300";

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-xs text-slate-500">Status</dt>
        <dd className={`mt-0.5 font-semibold ${statusColour}`}>{head.status}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Active Task</dt>
        <dd className="mt-0.5 font-mono text-slate-200">{head.active_task_id ?? "—"}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Next Agent</dt>
        <dd className="mt-0.5 text-slate-200">{head.next_agent ?? "—"}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">WIP</dt>
        <dd className="mt-0.5 text-slate-200">
          {head.wip ?? 0} / {head.wip_max ?? "?"}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Updated By</dt>
        <dd className="mt-0.5 text-slate-200">{head.updated_by ?? "—"}</dd>
      </div>
      {head.updated_at && (
        <div>
          <dt className="text-xs text-slate-500">Updated At</dt>
          <dd className="mt-0.5">
            <ClientTimestamp iso={head.updated_at} className="text-slate-300" />
          </dd>
        </div>
      )}
    </dl>
  );
}
