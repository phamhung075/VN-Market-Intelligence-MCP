/**
 * /dashboard/orchestration — Orchestration State dashboard.
 *
 * Data source: GET /api/orchestration (frontend server-side proxy → mcp-server :3000
 * → docs/data/orch/orch-state.json).  The proxy route is api.orchestration.tsx,
 * which mirrors the api.bctc-inspect.$.tsx splat-proxy precedent (OSC-4c A2).
 *
 * Sections rendered:
 *   - Head: current status / active task / next agent / WIP
 *   - Task Board: counts + task list grouped by status
 *   - Signal Queue: rows with severity colour-coding
 *   - Sprint Goal: vision / scope / metric per active sprint
 *   - Narrative: current_sprint, watch_items, open_sprints
 *   - STALE-AMBER BADGE: last_updated_iso > STALE_THRESHOLD_MS → amber indicator
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { ClientTimestamp } from "~/components/ClientTimestamp";

export const meta: MetaFunction = () => [
  { title: "Orchestration State — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Staleness threshold: 2 hours
// ---------------------------------------------------------------------------
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Domain types (inline — no separate domain file required for this read-only view)
// ---------------------------------------------------------------------------

type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | string;

interface TaskRow {
  task_id: string;
  title: string;
  type: string;
  owner: string;
  depends: string | null;
  status: TaskStatus;
  size?: string;
  zone?: string;
  note?: string;
}

interface SprintEntry {
  id: string;
  label: string;
  status: string;
  opened_at: string;
  tasks: TaskRow[];
}

interface TaskBoard {
  _updated_at: string;
  active_sprints: SprintEntry[];
  backlog: { id: string; summary: string; priority: string }[];
}

interface SignalRow {
  id: string;
  ts: string;
  from: string;
  to: string;
  type: string;
  summary: string;
  severity: "CRITICAL" | "HIGH" | "MED" | "LOW" | "INFO" | string;
  status: string;
  payload_ref: string | null;
}

interface SignalQueue {
  _updated_at: string;
  rows: SignalRow[];
}

interface SprintGoalEntry {
  sprint_id: string;
  vision: string;
  scope_in: string[];
  scope_out: string[];
  success_metric: string;
  status: string;
  note?: string;
  open_decision?: string;
}

interface Narrative {
  current_sprint: string;
  last_closed: string;
  watch_items: string[];
  open_sprints: string[];
  backlogs?: string;
}

interface Head {
  status: string;
  active_task_id: string;
  next_agent: string;
  next_action: string;
  wip: number;
  wip_max: number;
  updated_at: string;
  updated_by: string;
}

interface OrchState {
  _schema: string;
  _updated_at: string;
  _updated_by: string;
  head: Head;
  narrative: Narrative;
  task_board: TaskBoard;
  signal_queue: SignalQueue;
  sprint_goal: { entries: SprintGoalEntry[] };
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

interface LoaderData {
  state: OrchState | null;
  error: string | null;
  fetchedAt: string;
  isStale: boolean;
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const fetchedAt = new Date().toISOString();

  let state: OrchState | null = null;
  let error: string | null = null;
  let isStale = false;

  try {
    // Call the server-side proxy rather than mcp-server directly.
    // In SSR context the absolute URL is required; derive origin from process.env
    // (same pattern as other loaders that call internal proxy routes).
    const origin =
      typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
        ? process.env["FRONTEND_ORIGIN"]
        : "http://localhost:3001";

    const response = await fetch(`${origin}/api/orchestration`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      error = `Upstream returned ${response.status} ${response.statusText}`;
    } else {
      const raw = (await response.json()) as unknown;
      if (raw !== null && typeof raw === "object") {
        state = raw as OrchState;

        // Staleness check against head.updated_at (prefer over _updated_at).
        const tsField =
          (state.head?.updated_at) ?? (state._updated_at);
        if (tsField) {
          const age = Date.now() - new Date(tsField).getTime();
          isStale = age > STALE_THRESHOLD_MS;
        }
      } else {
        error = "Unexpected response shape from /api/orchestration";
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to reach orchestration endpoint";
  }

  return json<LoaderData>({ state, error, fetchedAt, isStale });
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function StaleBadge() {
  return (
    <span className="rounded border border-amber-600 bg-amber-900 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-300">
      STALE
    </span>
  );
}

type SeverityLevel = "CRITICAL" | "HIGH" | "MED" | "LOW" | "INFO" | string;

function severityClasses(severity: SeverityLevel): string {
  switch (severity) {
    case "CRITICAL":
      return "bg-red-900 text-red-300 border-red-700";
    case "HIGH":
      return "bg-orange-900 text-orange-300 border-orange-700";
    case "MED":
      return "bg-yellow-900 text-yellow-300 border-yellow-700";
    case "LOW":
      return "bg-slate-700 text-slate-300 border-slate-600";
    case "INFO":
      return "bg-blue-900 text-blue-300 border-blue-700";
    default:
      return "bg-slate-700 text-slate-400 border-slate-600";
  }
}

function SeverityBadge({ severity }: { severity: SeverityLevel }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide ${severityClasses(severity)}`}
    >
      {severity}
    </span>
  );
}

function taskStatusClasses(status: TaskStatus): string {
  switch (status) {
    case "DONE":
      return "text-green-400";
    case "IN_PROGRESS":
      return "text-blue-400";
    case "TODO":
      return "text-slate-400";
    default:
      return "text-amber-400";
  }
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-700 bg-slate-800">
      <h2 className="border-b border-slate-700 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-panels
// ---------------------------------------------------------------------------

function HeadPanel({ head }: { head: Head }) {
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
        <dd className="mt-0.5 font-mono text-slate-200">{head.active_task_id}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Next Agent</dt>
        <dd className="mt-0.5 text-slate-200">{head.next_agent}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">WIP</dt>
        <dd className="mt-0.5 text-slate-200">
          {head.wip} / {head.wip_max}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Updated By</dt>
        <dd className="mt-0.5 text-slate-200">{head.updated_by}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Updated At</dt>
        <dd className="mt-0.5">
          <ClientTimestamp iso={head.updated_at} className="text-slate-300" />
        </dd>
      </div>
      <div className="col-span-2 sm:col-span-3">
        <dt className="text-xs text-slate-500">Next Action</dt>
        <dd className="mt-0.5 text-slate-300 text-xs leading-relaxed line-clamp-4">
          {head.next_action}
        </dd>
      </div>
    </dl>
  );
}

function TaskBoardPanel({ board }: { board: TaskBoard }) {
  // Flatten all tasks to compute counts.
  const allTasks = board.active_sprints.flatMap((s) => s.tasks);
  const counts = {
    TODO: allTasks.filter((t) => t.status === "TODO").length,
    IN_PROGRESS: allTasks.filter((t) => t.status === "IN_PROGRESS").length,
    DONE: allTasks.filter((t) => t.status === "DONE").length,
    OTHER: allTasks.filter(
      (t) => !["TODO", "IN_PROGRESS", "DONE"].includes(t.status),
    ).length,
  };

  return (
    <div className="space-y-4">
      {/* Counts */}
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="text-slate-400">
          <span className="font-semibold text-blue-400">{counts.IN_PROGRESS}</span> in progress
        </span>
        <span className="text-slate-400">
          <span className="font-semibold text-slate-300">{counts.TODO}</span> todo
        </span>
        <span className="text-slate-400">
          <span className="font-semibold text-green-400">{counts.DONE}</span> done
        </span>
        {counts.OTHER > 0 && (
          <span className="text-slate-400">
            <span className="font-semibold text-amber-400">{counts.OTHER}</span> other
          </span>
        )}
        <span className="text-slate-400">
          <span className="font-semibold text-slate-300">{board.backlog.length}</span> backlog
        </span>
      </div>

      {/* Active sprints */}
      {board.active_sprints.map((sprint) => (
        <div key={sprint.id}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {sprint.id} — {sprint.label}
          </h3>
          <div className="overflow-hidden rounded border border-slate-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900">
                  <th className="px-3 py-2 text-left font-medium text-slate-400">ID</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-400">Title</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-400">Owner</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-400">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-400">Size</th>
                </tr>
              </thead>
              <tbody>
                {sprint.tasks.map((task, idx) => (
                  <tr
                    key={task.task_id}
                    className={`border-b border-slate-700 last:border-0 ${
                      idx % 2 === 0 ? "bg-slate-800" : "bg-slate-850"
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-slate-300">{task.task_id}</td>
                    <td className="px-3 py-2 text-slate-200">
                      {task.title}
                      {task.note && (
                        <p className="mt-0.5 text-slate-500 italic">{task.note}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-400">{task.owner}</td>
                    <td className={`px-3 py-2 font-semibold ${taskStatusClasses(task.status)}`}>
                      {task.status}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{task.size ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function SignalQueuePanel({ queue }: { queue: SignalQueue }) {
  if (queue.rows.length === 0) {
    return <p className="text-sm text-slate-500">No signals in queue.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700 bg-slate-900">
            <th className="px-3 py-2 text-left font-medium text-slate-400">Time</th>
            <th className="px-3 py-2 text-left font-medium text-slate-400">From → To</th>
            <th className="px-3 py-2 text-left font-medium text-slate-400">Severity</th>
            <th className="px-3 py-2 text-left font-medium text-slate-400">Status</th>
            <th className="px-3 py-2 text-left font-medium text-slate-400">Summary</th>
          </tr>
        </thead>
        <tbody>
          {queue.rows.map((row, idx) => (
            <tr
              key={row.id}
              className={`border-b border-slate-700 last:border-0 ${
                idx % 2 === 0 ? "bg-slate-800" : "bg-slate-850"
              }`}
            >
              <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                <ClientTimestamp iso={row.ts} className="text-slate-400" />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className="text-slate-300">{row.from}</span>
                <span className="mx-1 text-slate-600">→</span>
                <span className="text-slate-300">{row.to}</span>
              </td>
              <td className="px-3 py-2">
                <SeverityBadge severity={row.severity} />
              </td>
              <td className="px-3 py-2 text-slate-400">{row.status}</td>
              <td className="px-3 py-2 text-slate-200 max-w-xs">{row.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SprintGoalPanel({ entries }: { entries: SprintGoalEntry[] }) {
  const open = entries.filter((e) => e.status !== "CLOSED");
  if (open.length === 0) {
    return <p className="text-sm text-slate-500">No open sprint goals.</p>;
  }

  return (
    <div className="space-y-5">
      {open.map((entry) => (
        <div key={entry.sprint_id} className="rounded border border-slate-700 p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-slate-200">
              {entry.sprint_id}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                entry.status === "OPEN"
                  ? "bg-blue-900 text-blue-300"
                  : "bg-slate-700 text-slate-400"
              }`}
            >
              {entry.status}
            </span>
          </div>
          <p className="mb-2 text-xs text-slate-300 leading-relaxed">{entry.vision}</p>
          {entry.success_metric && (
            <p className="text-xs text-slate-500">
              <span className="font-medium text-slate-400">Metric: </span>
              {entry.success_metric}
            </p>
          )}
          {entry.open_decision && (
            <p className="mt-1 text-xs text-amber-400">
              <span className="font-medium">Open decision: </span>
              {entry.open_decision}
            </p>
          )}
          {entry.note && (
            <p className="mt-1 text-xs text-slate-500 italic">{entry.note}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function NarrativePanel({ narrative }: { narrative: Narrative }) {
  return (
    <div className="space-y-4 text-sm">
      {narrative.current_sprint && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Current Sprint
          </h3>
          <p className="text-slate-300 leading-relaxed text-xs">{narrative.current_sprint}</p>
        </div>
      )}

      {narrative.watch_items && narrative.watch_items.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Watch Items
          </h3>
          <ul className="space-y-1.5">
            {narrative.watch_items.map((item, idx) => (
              <li key={idx} className="flex gap-2 text-xs text-slate-300">
                <span className="mt-0.5 text-amber-500 flex-shrink-0">&#9654;</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {narrative.open_sprints && narrative.open_sprints.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Open Sprints
          </h3>
          <ul className="space-y-1">
            {narrative.open_sprints.map((sprint, idx) => (
              <li key={idx} className="text-xs text-slate-400">
                {sprint}
              </li>
            ))}
          </ul>
        </div>
      )}

      {narrative.backlogs && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Backlogs
          </h3>
          <p className="text-xs text-slate-500">{narrative.backlogs}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrchestrationDashboard() {
  const { state, error, fetchedAt, isStale } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-100">Orchestration State</h1>
        {isStale && <StaleBadge />}
        <span className="ml-auto text-xs text-slate-500">
          Page fetched: <ClientTimestamp iso={fetchedAt} />
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Could not load orchestration state — {error}
        </div>
      )}

      {/* Schema / source info */}
      {state && (
        <p className="text-xs text-slate-600">
          schema {state._schema} · updated by {state._updated_by} ·{" "}
          <ClientTimestamp iso={state._updated_at} />
        </p>
      )}

      {state ? (
        <div className="space-y-5">
          <Section title="Head">{<HeadPanel head={state.head} />}</Section>

          <Section title="Task Board">
            <TaskBoardPanel board={state.task_board} />
          </Section>

          <Section title="Signal Queue">
            <SignalQueuePanel queue={state.signal_queue} />
          </Section>

          <Section title="Sprint Goals">
            <SprintGoalPanel entries={state.sprint_goal.entries} />
          </Section>

          <Section title="Narrative">
            <NarrativePanel narrative={state.narrative} />
          </Section>
        </div>
      ) : (
        !error && (
          <div className="rounded border border-slate-700 bg-slate-800 px-4 py-8 text-center text-sm text-slate-500">
            No orchestration data available.
          </div>
        )
      )}
    </div>
  );
}
