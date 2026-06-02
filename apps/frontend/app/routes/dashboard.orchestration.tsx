/**
 * /dashboard/orchestration — Orchestration State dashboard.
 *
 * Data source: GET /api/orchestration (frontend server-side proxy → mcp-server :3000
 * → docs/data/orch/orch-state.json).  The proxy route is api.orchestration.tsx,
 * which mirrors the api.bctc-inspect.$.tsx splat-proxy precedent (OSC-4c A2).
 *
 * Sections rendered:
 *   - Head: current status / active task / next agent / WIP
 *   - Task Board: counts + flat task list from task_board.tasks
 *   - Signal Queue: rows with severity colour-coding
 *   - Sprint Goal: vision / scope / metric per active sprint
 *   - Narrative: current_sprint, watch_items, open_sprints
 *   - STALE-AMBER BADGE: last_updated_iso > STALE_THRESHOLD_MS → amber indicator
 *
 * DTO contract (HC-2, docs/data/orch/orch-state.json via GET /api/orchestration):
 *   {
 *     last_updated_iso: string,
 *     head: { status, active_task_id, next_agent, wip, wip_max, updated_at, updated_by },
 *     task_board: { counts: { done, in_progress, backlog }, tasks: Task[] },
 *     signal_queue: { rows: SignalRow[] },
 *     sprint_goal: { sprint_id, vision, scope: string[], metric: string },
 *     narrative: { current_sprint, last_closed, watch_items, open_sprints }
 *   }
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import { useEffect } from "react";
import { ClientTimestamp } from "~/components/ClientTimestamp";

// Polling interval for live data refresh (ms). Pause-on-hidden keeps the tab
// from hammering the proxy while backgrounded.
const POLL_MS = 5000;

export const meta: MetaFunction = () => [
  { title: "Orchestration State — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Staleness threshold: 2 hours
// ---------------------------------------------------------------------------
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Domain types — matched to ACTUAL DTO shape from GET /api/orchestration
// ---------------------------------------------------------------------------

type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | string;

interface TaskRow {
  id: string;
  title: string;
  owner?: string;
  status: TaskStatus;
  zone?: string;
  note?: string;
}

interface TaskBoardCounts {
  done: number;
  in_progress: number;
  backlog: number;
}

/** Actual DTO shape: flat tasks array + counts object */
interface TaskBoard {
  counts: TaskBoardCounts;
  tasks: TaskRow[];
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
  rows: SignalRow[];
}

/** Actual DTO shape: flat sprint_goal (not entries array) */
interface SprintGoal {
  sprint_id: string;
  vision: string;
  scope: string[];
  metric: string;
}

interface Narrative {
  current_sprint?: string;
  last_closed?: string;
  watch_items?: string[];
  open_sprints?: string[];
}

interface Head {
  status: string;
  active_task_id?: string;
  next_agent?: string;
  wip?: number;
  wip_max?: number;
  updated_at?: string;
  updated_by?: string;
}

/** Actual DTO top-level shape */
interface OrchState {
  last_updated_iso?: string;
  head: Head;
  narrative?: Narrative;
  task_board: TaskBoard;
  signal_queue?: SignalQueue;
  sprint_goal?: SprintGoal;
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

        // Staleness check — DTO uses last_updated_iso or head.updated_at.
        const tsField = state.head?.updated_at ?? state.last_updated_iso;
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

/**
 * TaskBoardPanel — reads the ACTUAL DTO shape:
 *   task_board.tasks  — flat TaskRow[]
 *   task_board.counts — { done, in_progress, backlog }
 *
 * Guards: tasks ?? [] so a missing/empty field renders empty state, no throw.
 */
function TaskBoardPanel({ board }: { board: TaskBoard }) {
  const tasks = board.tasks ?? [];
  const counts = board.counts ?? { done: 0, in_progress: 0, backlog: 0 };

  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS");
  const todo = tasks.filter((t) => t.status === "TODO" || t.status === "BACKLOG");
  const done = tasks.filter((t) => t.status === "DONE");

  if (tasks.length === 0) {
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

      {/* Done tasks — collapsed by default, show last 10 */}
      {done.length > 0 && (
        <TaskGroup label={`Done (${done.length})`} tasks={done.slice(-10)} />
      )}
    </div>
  );
}

function TaskGroup({ label, tasks }: { label: string; tasks: TaskRow[] }) {
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

function SignalQueuePanel({ queue }: { queue: SignalQueue | undefined }) {
  const rows = queue?.rows ?? [];

  if (rows.length === 0) {
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
          {rows.map((row, idx) => (
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

/**
 * SprintGoalPanel — reads the ACTUAL DTO shape:
 *   sprint_goal: { sprint_id, vision, scope: string[], metric: string }
 *   (NOT sprint_goal.entries[])
 */
function SprintGoalPanel({ goal }: { goal: SprintGoal | undefined }) {
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

function NarrativePanel({ narrative }: { narrative: Narrative | undefined }) {
  if (!narrative) {
    return <p className="text-sm text-slate-500">No narrative available.</p>;
  }

  const watchItems = narrative.watch_items ?? [];
  const openSprints = narrative.open_sprints ?? [];

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

      {watchItems.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Watch Items
          </h3>
          <ul className="space-y-1.5">
            {watchItems.map((item, idx) => (
              <li key={idx} className="flex gap-2 text-xs text-slate-300">
                <span className="mt-0.5 text-amber-500 flex-shrink-0">&#9654;</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {openSprints.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Open Sprints
          </h3>
          <ul className="space-y-1">
            {openSprints.map((sprint, idx) => (
              <li key={idx} className="text-xs text-slate-400">
                {sprint}
              </li>
            ))}
          </ul>
        </div>
      )}

      {narrative.last_closed && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Last Closed
          </h3>
          <p className="text-xs text-slate-500">{narrative.last_closed}</p>
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
  const revalidator = useRevalidator();

  // Client-side auto-refresh: poll every POLL_MS while the tab is visible.
  // Guards:
  //   - skip tick if a revalidation is already in flight (revalidator.state !== "idle")
  //   - pause when tab is hidden; trigger one immediate refresh on return to visible
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible" && revalidator.state === "idle") {
        revalidator.revalidate();
      }
    };

    const intervalId = setInterval(tick, POLL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && revalidator.state === "idle") {
        revalidator.revalidate();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [revalidator]);

  const isLive = typeof document !== "undefined"
    ? document.visibilityState === "visible"
    : false;

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-100">Orchestration State</h1>
        {isStale && <StaleBadge />}
        {/* LIVE polling indicator — green dot + label; dims to "refreshing…" on in-flight revalidation */}
        <span className="flex items-center gap-1.5 text-xs">
          {isLive && (
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse"
            />
          )}
          {revalidator.state === "loading" ? (
            <span className="text-slate-400">· refreshing…</span>
          ) : (
            <span className="text-green-500 font-medium">LIVE</span>
          )}
        </span>
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

      {/* Last updated info */}
      {state?.last_updated_iso && (
        <p className="text-xs text-slate-600">
          last updated: <ClientTimestamp iso={state.last_updated_iso} />
          {state.head?.updated_by && ` · by ${state.head.updated_by}`}
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

          <Section title="Sprint Goal">
            <SprintGoalPanel goal={state.sprint_goal} />
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
