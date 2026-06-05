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
import { useEffect, useState } from "react";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { PageHeader } from "~/components/PageHeader";

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

// F3: Decision Journal types — mirrors F2 DTO contract (journalStore.ts StepDto / DecisionsDto)
interface StepDto {
  step_id: string;
  agent_id: string;
  timestamp: string;
  task_id: string | null;
  what_done: string;
  what_considered: string[];
  why_decision: string;
  why_change: string;
}

interface DecisionsDto {
  by_task: Record<string, StepDto[]>;
  sprint_bucket: Record<string, StepDto[]>;
}

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
  /** F3: decision journal entries keyed by task_id or sprint_id — optional for backward-compat */
  decisions?: DecisionsDto;
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
 * F3: accepts decisions + sprintId and threads them to DoneTaskGroup.
 */
function TaskBoardPanel({
  board,
  decisions,
  sprintId,
}: {
  board: TaskBoard;
  decisions?: DecisionsDto;
  sprintId?: string;
}) {
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

      {/* Done tasks — collapsible; shows last 10 by default, full list on expand.
          F3: threads decisions + sprintId for accordion drilldown. */}
      {done.length > 0 && (
        <DoneTaskGroup tasks={done} decisions={decisions} sprintId={sprintId} />
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

/**
 * StepCard — renders a single decision-journal StepDto entry.
 * F3: AC-F3-9. No dangerouslySetInnerHTML (AC-F3-12).
 */
function StepCard({ step }: { step: StepDto }) {
  return (
    <div
      className="border-l-2 border-slate-600 pl-3 pb-1"
      style={{ overflowWrap: "break-word" }}
    >
      {/* Header: step_id · agent_id */}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold text-slate-200">
          {step.step_id}
        </span>
        <span className="text-slate-600">·</span>
        <span className="text-xs text-slate-400">{step.agent_id}</span>
        <span className="text-slate-600">·</span>
        <ClientTimestamp iso={step.timestamp} className="text-xs text-slate-500" />
      </div>

      {/* what_done */}
      <div className="mb-1 text-xs">
        <span className="font-medium text-slate-400">What was done: </span>
        <span className="text-slate-300">{step.what_done}</span>
      </div>

      {/* what_considered — bullet list */}
      {step.what_considered.length > 0 && (
        <div className="mb-1 text-xs">
          <span className="font-medium text-slate-400">What was considered:</span>
          <ul className="mt-0.5 space-y-0.5 pl-4">
            {step.what_considered.map((item, idx) => (
              <li key={idx} className="flex gap-1.5 text-slate-400">
                <span className="flex-shrink-0 text-slate-600">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* why_decision */}
      <div className="mb-1 text-xs">
        <span className="font-medium text-slate-400">Why this decision: </span>
        <span className="text-slate-300">{step.why_decision}</span>
      </div>

      {/* why_change */}
      <div className="text-xs">
        <span className="font-medium text-slate-400">Why it changed: </span>
        <span className="text-slate-300">{step.why_change}</span>
      </div>
    </div>
  );
}

/**
 * DecisionAccordion — renders STEP entries for a DONE task.
 *
 * Priority: by_task[taskId] > sprint_bucket[sprintId] > empty-state.
 * F3: AC-F3-6, AC-F3-7, AC-F3-8. No dangerouslySetInnerHTML (AC-F3-12).
 */
function DecisionAccordion({
  taskId,
  sprintId,
  decisions,
}: {
  taskId: string;
  sprintId?: string;
  decisions?: DecisionsDto;
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

/**
 * DoneTaskGroup — collapsible Done section.
 *
 * Default: collapsed, showing the PREVIEW_COUNT most-recent done tasks (last N).
 * Toggle: "Show all N" / "Show less" expands/collapses the full list inside a
 * max-height scroll container so 100+ rows don't blow out the page.
 *
 * F3: each DONE task row is independently clickable; opens a DecisionAccordion
 * showing its StepDto entries. Multi-open: Set<string> of open task IDs (RULING-5).
 */
const DONE_PREVIEW_COUNT = 10;

function DoneTaskGroup({
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
      {/* F3: table replaced by div-based layout to allow accordion rows between task rows */}
      <div className="overflow-hidden rounded border border-slate-700">
        {/* Header row */}
        <div className="grid grid-cols-[minmax(80px,auto)_1fr_minmax(60px,auto)_minmax(80px,auto)_minmax(60px,auto)_24px] border-b border-slate-700 bg-slate-900 text-xs">
          <div className="px-3 py-2 font-medium text-slate-400">ID</div>
          <div className="px-3 py-2 font-medium text-slate-400">Title</div>
          <div className="px-3 py-2 font-medium text-slate-400">Owner</div>
          <div className="px-3 py-2 font-medium text-slate-400">Status</div>
          <div className="px-3 py-2 font-medium text-slate-400">Zone</div>
          <div className="px-3 py-2" aria-hidden="true" />
        </div>
        {/* Task rows — each DONE row is clickable and may expand accordion below it */}
        <div data-testid="done-task-rows">
          {visibleTasks.map((task, idx) => {
            const isOpen = openTaskIds.has(task.id);
            const rowBase =
              idx % 2 === 0 ? "bg-slate-800" : "bg-slate-850";
            return (
              <div key={task.id}>
                {/* F3 AC-F3-3, AC-F3-10, AC-F3-11: clickable DONE row */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onClick={() => toggle(task.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(task.id);
                    }
                  }}
                  className={`grid grid-cols-[minmax(80px,auto)_1fr_minmax(60px,auto)_minmax(80px,auto)_minmax(60px,auto)_24px] border-b border-slate-700 last:border-0 text-xs cursor-pointer hover:bg-slate-700 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500 transition-colors ${rowBase}`}
                >
                  <div className="px-3 py-2 font-mono text-slate-300">{task.id}</div>
                  <div className="px-3 py-2 text-slate-200">
                    {task.title}
                    {task.note && (
                      <p className="mt-0.5 text-slate-500 italic">{task.note}</p>
                    )}
                  </div>
                  <div className="px-3 py-2 text-slate-400">{task.owner ?? "—"}</div>
                  <div className={`px-3 py-2 font-semibold ${taskStatusClasses(task.status)}`}>
                    {task.status}
                  </div>
                  <div className="px-3 py-2 text-slate-500">{task.zone ?? "—"}</div>
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
                  />
                )}
              </div>
            );
          })}
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
    <div className="w-full space-y-6">
      <PageHeader
        title="Orchestration State"
        subtitle="Live polling every 5s — auto-refreshes while tab is visible"
        actions={
          <div className="flex items-center gap-3">
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
                <span className="text-slate-400">refreshing…</span>
              ) : (
                <span className="text-green-500 font-medium">LIVE</span>
              )}
            </span>
            <span className="text-xs text-slate-500">
              <ClientTimestamp iso={fetchedAt} />
            </span>
          </div>
        }
      />

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
            {/* F3 AC-F3-13: thread sprintId + decisions from state into TaskBoardPanel */}
            <TaskBoardPanel
              board={state.task_board}
              decisions={state.decisions}
              sprintId={state.sprint_goal?.sprint_id}
            />
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
