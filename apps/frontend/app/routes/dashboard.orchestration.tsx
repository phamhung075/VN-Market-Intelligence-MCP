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
 *
 * FACTORY-FRONTEND-split-orchestration (behavior-preserving refactor): the DTO
 * contract moved verbatim to app/domain/orchestration/types.ts (re-exported here
 * for backward-compat call-sites), STALE_THRESHOLD_MS + the staleness predicate
 * moved to app/domain/orchestration/staleness.ts, and the five render blocks
 * (Head/Task Board/Signal Queue/Sprint Goal/Narrative — plus their sub-components)
 * moved to app/components/orchestration/*.tsx. The TASK-DASH-CRON-2 Cron Recheck
 * Table section (types + components below) was OUT OF SCOPE for this split and
 * stays here unchanged (a pre-existing test imports its exports directly from
 * this route module). This route file is now types + loader (POLL_MS=5000
 * polling unchanged) + a thin page composition over the extracted panels.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import { useEffect } from "react";
import { safeFetch } from "~/lib/api/fetchUtils";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { PageHeader } from "~/components/PageHeader";
import { FreshnessBadge } from "~/components/FreshnessBadge";
import { useFreshnessRevalidator } from "~/lib/hooks/useFreshnessRevalidator";
import { HeadPanel } from "~/components/orchestration/HeadPanel";
import { TaskBoardPanel } from "~/components/orchestration/TaskBoard";
import { SignalQueuePanel } from "~/components/orchestration/SignalQueue";
import { SprintGoalPanel } from "~/components/orchestration/SprintGoal";
import { NarrativePanel } from "~/components/orchestration/Narrative";
import { STALE_THRESHOLD_MS, isStale } from "~/domain/orchestration/staleness";
import type { OrchState } from "~/domain/orchestration/types";

// Polling interval for live data refresh (ms). Pause-on-hidden keeps the tab
// from hammering the proxy while backgrounded.
const POLL_MS = 5000;

export const meta: MetaFunction = () => [
  { title: "Orchestration State — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — re-exported from app/domain/orchestration/types.ts
// (FACTORY-FRONTEND-split-orchestration) for backward-compat call-sites.
// ---------------------------------------------------------------------------
export type {
  StepDto,
  DecisionsDto,
  TaskStatus,
  TaskRow,
  TaskBoardCounts,
  TaskBoard,
  SignalRow,
  SignalQueue,
  SprintGoal,
  Narrative,
  Head,
  OrchState,
} from "~/domain/orchestration/types";

// Staleness threshold + predicate — re-exported from
// app/domain/orchestration/staleness.ts (FACTORY-FRONTEND-split-orchestration).
export { STALE_THRESHOLD_MS, isStale };

// ---------------------------------------------------------------------------
// TASK-DASH-CRON-2: Cron Recheck Table types + DTO contract
// (GET /api/cron-status via api.cron-status.tsx proxy — see
//  docs/handoffs/TASK-DASH-CRON-2.md and cronStatusHandler.ts CronStatusDto)
// OUT OF SCOPE for FACTORY-FRONTEND-split-orchestration — unchanged.
// ---------------------------------------------------------------------------

/** Closed 6-value enum shared by Layer-A and Layer-B rows. */
export type CronStatus = "ON_TIME" | "LATE" | "MISSED" | "STALE" | "NEVER_FIRED" | "SESSION_SCOPED";

export interface CronStatusRowA {
  name: string;
  layer: "server";
  cron_expr: string;
  human_schedule: string;
  expected_last_fire: string | null;
  expected_next_fire: string | null;
  last_fire: string | null;
  last_status: string | null;
  status: CronStatus;
  job_name_db: string;
  /** Populated for non-ON_TIME rows only (AC-29). */
  reason?: string;
}

export interface CronStatusRowB {
  name: string;
  layer: "cli-session";
  cron_expr: string;
  human_schedule: string;
  expected_last_fire: null;
  expected_next_fire: null;
  last_fire: null;
  last_status: null;
  status: CronStatus;
  reason: string;
}

export type CronStatusRow = CronStatusRowA | CronStatusRowB;

export interface CronStatusDto {
  fetched_at: string;
  layer_a_count: number;
  layer_b_count: number;
  layer_a: CronStatusRowA[];
  layer_b: CronStatusRowB[];
}

/** safeFetch<T> contract: parse(null) MUST return the empty-shape struct for T. */
const EMPTY_CRON_STATUS_DTO: CronStatusDto = {
  fetched_at: "",
  layer_a_count: 0,
  layer_b_count: 0,
  layer_a: [],
  layer_b: [],
};

const CRON_STATUS_A_VALUES = new Set<string>(["ON_TIME", "LATE", "MISSED", "STALE", "NEVER_FIRED"]);

/**
 * Defense against a malformed upstream `status` value rendering an unstyled
 * badge. NEVER_FIRED is the honest, non-red/amber fallback for Layer-A rows
 * with an unrecognized status (mirrors NFR-1: no fabricated meaning).
 */
export function normalizeCronStatusA(raw: unknown): CronStatus {
  return typeof raw === "string" && CRON_STATUS_A_VALUES.has(raw) ? (raw as CronStatus) : "NEVER_FIRED";
}

/**
 * Layer-B rows MUST NEVER render red/amber (AC-14/NFR-7) — the value is
 * unconditionally forced to SESSION_SCOPED regardless of what upstream sends,
 * including a malformed/unrecognized status. `_raw` intentionally unused.
 */
export function normalizeCronStatusB(_raw: unknown): CronStatus {
  return "SESSION_SCOPED";
}

export function normalizeCronRowA(raw: unknown): CronStatusRowA | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r["name"] !== "string") return null;
  return {
    name: r["name"],
    layer: "server",
    cron_expr: typeof r["cron_expr"] === "string" ? r["cron_expr"] : "",
    human_schedule: typeof r["human_schedule"] === "string" ? r["human_schedule"] : "",
    expected_last_fire: typeof r["expected_last_fire"] === "string" ? r["expected_last_fire"] : null,
    expected_next_fire: typeof r["expected_next_fire"] === "string" ? r["expected_next_fire"] : null,
    last_fire: typeof r["last_fire"] === "string" ? r["last_fire"] : null,
    last_status: typeof r["last_status"] === "string" ? r["last_status"] : null,
    status: normalizeCronStatusA(r["status"]),
    job_name_db: typeof r["job_name_db"] === "string" ? r["job_name_db"] : r["name"],
    reason: typeof r["reason"] === "string" ? r["reason"] : undefined,
  };
}

export function normalizeCronRowB(raw: unknown): CronStatusRowB | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r["name"] !== "string") return null;
  return {
    name: r["name"],
    layer: "cli-session",
    cron_expr: typeof r["cron_expr"] === "string" ? r["cron_expr"] : "",
    human_schedule: typeof r["human_schedule"] === "string" ? r["human_schedule"] : "",
    expected_last_fire: null,
    expected_next_fire: null,
    last_fire: null,
    last_status: null,
    status: normalizeCronStatusB(r["status"]),
    reason: typeof r["reason"] === "string" ? r["reason"] : "Session-scoped: fires only while a live CLI session is active",
  };
}

/**
 * parseCronStatusDto — mirrors parseOrchStateDto (line ~162). Rejects/
 * normalizes any `status` value outside the 6-enum set (defense against a
 * malformed upstream response rendering an unstyled badge).
 */
export function parseCronStatusDto(raw: unknown): CronStatusDto {
  if (raw === null) {
    return EMPTY_CRON_STATUS_DTO;
  }
  if (typeof raw !== "object") {
    throw new Error("Unexpected response shape from /api/cron-status");
  }
  const obj = raw as Record<string, unknown>;
  const layer_a = Array.isArray(obj["layer_a"])
    ? (obj["layer_a"] as unknown[]).map(normalizeCronRowA).filter((r): r is CronStatusRowA => r !== null)
    : [];
  const layer_b = Array.isArray(obj["layer_b"])
    ? (obj["layer_b"] as unknown[]).map(normalizeCronRowB).filter((r): r is CronStatusRowB => r !== null)
    : [];

  return {
    fetched_at: typeof obj["fetched_at"] === "string" ? obj["fetched_at"] : "",
    layer_a_count: layer_a.length,
    layer_b_count: layer_b.length,
    layer_a,
    layer_b,
  };
}

/** FR-5.2/FR-5.3 Vietnamese copy — status badge labels. */
export const CRON_STATUS_LABELS: Record<CronStatus, string> = {
  ON_TIME: "Đúng giờ",
  LATE: "Trễ nhẹ",
  MISSED: "Bỏ lỡ",
  STALE: "Quá hạn",
  NEVER_FIRED: "Chưa từng chạy",
  SESSION_SCOPED: "Phiên làm việc",
};

/** FR-5.3 status badge colors. Layer-B (SESSION_SCOPED) is always blue/neutral (AC-19/NFR-7). */
export function cronStatusBadgeClasses(status: CronStatus): string {
  switch (status) {
    case "ON_TIME":
      return "bg-green-900 text-green-300 border-green-700";
    case "LATE":
      return "bg-amber-900 text-amber-300 border-amber-700";
    case "MISSED":
      return "bg-red-900 text-red-300 border-red-700";
    case "STALE":
      return "bg-red-950 text-red-400 border-red-800";
    case "NEVER_FIRED":
      return "bg-slate-700 text-slate-300 border-slate-600";
    case "SESSION_SCOPED":
      return "bg-blue-900 text-blue-300 border-blue-700";
    default:
      return "bg-slate-700 text-slate-400 border-slate-600";
  }
}

/** FR-5.2 layer column value: "Server" (Layer-A) | "Phiên làm việc" (Layer-B). */
export function cronLayerLabel(layer: CronStatusRow["layer"]): string {
  return layer === "server" ? "Server" : "Phiên làm việc";
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

interface LoaderData {
  state: OrchState | null;
  error: string | null;
  fetchedAt: string;
  isStale: boolean;
  /** TASK-DASH-CRON-2: never null — safeFetch<T> contract returns the empty-shape struct on failure. */
  cronStatus: CronStatusDto;
  cronStatusError: string | null;
}

function parseOrchStateDto(raw: unknown): OrchState {
  if (raw === null) {
    return {
      head: { status: "unknown" },
      task_board: { counts: { done: 0, in_progress: 0, backlog: 0 }, tasks: [] },
    };
  }
  if (typeof raw !== "object") {
    throw new Error("Unexpected response shape from /api/orchestration");
  }
  return raw as OrchState;
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  // Call the server-side proxy rather than mcp-server directly.
  // In SSR context the absolute URL is required; derive origin from process.env
  // (same pattern as other loaders that call internal proxy routes).
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  // TASK-DASH-CRON-2 (CN-4): fetch /api/orchestration and /api/cron-status in
  // parallel via Promise.all — do not add latency to the existing page.
  const [{ data, error }, { data: cronStatus, error: cronStatusError }] = await Promise.all([
    safeFetch<OrchState>(
      `${origin}/api/orchestration`,
      parseOrchStateDto,
      { label: "dashboard.orchestration" },
    ),
    safeFetch<CronStatusDto>(
      `${origin}/api/cron-status`,
      parseCronStatusDto,
      { label: "dashboard.cron-status" },
    ),
  ]);

  const state = data ?? null;
  let staleFlag = false;
  let fetchedAt = new Date().toISOString();

  if (state !== null) {
    // Staleness check — DTO uses last_updated_iso or head.updated_at.
    const tsField = state.head?.updated_at ?? state.last_updated_iso;
    if (tsField) {
      staleFlag = isStale(tsField);
      // Use real data timestamp instead of server execution time
      fetchedAt = tsField;
    }
  }

  return json<LoaderData>({ state, error, fetchedAt, isStale: staleFlag, cronStatus, cronStatusError });
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
// TASK-DASH-CRON-2: Cron Recheck Table
// OUT OF SCOPE for FACTORY-FRONTEND-split-orchestration — unchanged.
// ---------------------------------------------------------------------------

function CronStatusBadge({ status }: { status: CronStatus }) {
  return (
    <span
      title={CRON_STATUS_LABELS[status]}
      className={`rounded border px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide ${cronStatusBadgeClasses(status)}`}
    >
      {CRON_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * CronLayerTable — one Layer-A or Layer-B sub-section. FR-5.4: layer-A and
 * layer-B render via two separate calls (section header divider) so they are
 * always visually distinct (AC-18).
 */
function CronLayerTable({ title, rows }: { title: string; rows: CronStatusRow[] }) {
  return (
    <div className="mb-4 last:mb-0">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title} ({rows.length})
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Không có dữ liệu.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-slate-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900">
                <th className="px-3 py-2 text-left font-medium text-slate-400">Tên cron</th>
                <th className="px-3 py-2 text-left font-medium text-slate-400">Lớp</th>
                <th className="px-3 py-2 text-left font-medium text-slate-400">Lịch dự kiến</th>
                <th className="px-3 py-2 text-left font-medium text-slate-400">Lần chạy gần nhất</th>
                <th className="px-3 py-2 text-left font-medium text-slate-400">Dự kiến lần tới</th>
                <th className="px-3 py-2 text-left font-medium text-slate-400">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={`${row.layer}-${row.name}-${idx}`}
                  title={row.reason ?? undefined}
                  className={`border-b border-slate-700 last:border-0 ${
                    idx % 2 === 0 ? "bg-slate-800" : "bg-slate-850"
                  }`}
                >
                  <td className="px-3 py-2 font-mono text-slate-300">{row.name}</td>
                  <td className="px-3 py-2 text-slate-400">{cronLayerLabel(row.layer)}</td>
                  <td className="px-3 py-2 text-slate-300">{row.human_schedule}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-300">
                    {/* AC-20: null last_fire renders "Chưa từng chạy" — never blank/fabricated */}
                    {row.last_fire == null ? (
                      <span className="text-slate-500">Chưa từng chạy</span>
                    ) : (
                      <ClientTimestamp iso={row.last_fire} className="text-slate-300" />
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-300">
                    {row.expected_next_fire == null ? (
                      <span className="text-slate-600">—</span>
                    ) : (
                      <ClientTimestamp iso={row.expected_next_fire} className="text-slate-300" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <CronStatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * CronRecheckTable — TASK-DASH-CRON-2. Rendered independently of the
 * orchestration state fetch (AC-16: never blank even if /api/orchestration
 * itself failed — cronStatus/cronStatusError come from a separate, unrelated
 * fetch, AC-25).
 */
function CronRecheckTable({
  cronStatus,
  cronStatusError,
  revalidator,
}: {
  cronStatus: CronStatusDto;
  cronStatusError: string | null;
  revalidator: ReturnType<typeof useRevalidator>;
}) {
  return (
    <Section title="Kiểm Tra Lịch Cron">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FreshnessBadge dataAsof={cronStatus.fetched_at || null} slaTierKey="realtime" />
        {/* AC-21: RECHECK button reuses the existing revalidator — no second refresh mechanism. */}
        <button
          type="button"
          onClick={() => revalidator.revalidate()}
          className="rounded border border-slate-600 bg-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-600"
        >
          Kiểm tra lại
        </button>
      </div>

      {cronStatusError && (
        <div
          role="alert"
          className="mb-4 rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không thể tải trạng thái cron — {cronStatusError}
        </div>
      )}

      <CronLayerTable title="Cron máy chủ" rows={cronStatus.layer_a} />
      <CronLayerTable title="Cron phiên làm việc" rows={cronStatus.layer_b} />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Page — thin composition over app/components/orchestration/*.tsx
// ---------------------------------------------------------------------------

export default function OrchestrationDashboard() {
  const { state, error, fetchedAt, isStale: stale, cronStatus, cronStatusError } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  useFreshnessRevalidator("event");

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
            {stale && <StaleBadge />}
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
            <span className="text-xs text-slate-500 flex items-center gap-2">
              <FreshnessBadge dataAsof={fetchedAt ?? null} slaTierKey="event" />
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

      {/* TASK-DASH-CRON-2: independent of the orchestration-state fetch above — always renders (AC-16, AC-25). */}
      <CronRecheckTable
        cronStatus={cronStatus}
        cronStatusError={cronStatusError}
        revalidator={revalidator}
      />
    </div>
  );
}
