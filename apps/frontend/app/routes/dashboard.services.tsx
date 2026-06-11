/**
 * /dashboard/services — Service Health dashboard.
 *
 * Shows live container status for all 12 microservices in the fleet.
 * All services are deployed as of GO-FLEET-DEPLOY (2026-06-11).
 *
 * Display logic (single-axis: container status is authoritative):
 *   ok       → GREEN  "UP"
 *   degraded → YELLOW "DEGRADED"
 *   down     → RED    "DOWN"  (ALWAYS — anti-false-green invariant)
 *
 * Capability axis is informational (rendered as a secondary badge) but
 * NEVER overrides a down verdict. A crashed container is always RED.
 *
 * Pure compose logic lives in ~/domain/health-compose.ts (importable without Remix).
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { fetchGatewayHealth } from "~/lib/api/client";
import type { ServiceRow, ServiceStatus } from "~/domain/health";
import {
  composeRowDisplayState,
  composeOverallStatus,
  parseCapability,
} from "~/domain/health-compose";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { PageHeader } from "~/components/PageHeader";

// Re-export pure compose functions so test files can import from either location.
export type { RowDisplayState } from "~/domain/health-compose";
export { composeRowDisplayState, composeOverallStatus } from "~/domain/health-compose";

export const meta: MetaFunction = () => [
  { title: "Service Health — VN Market Intelligence" },
];

// Canonical list of 9 microservices tracked by the platform.
const SERVICES = [
  "mcp",
  "pdf",
  "rag",
  "ta",
  "macro",
  "stock",
  "kinh-dich",
  "alert",
  "news",
] as const;

interface LoaderData {
  rows: ServiceRow[];
  overallStatus: "ok" | "degraded" | "down" | null;
  checkedAt: string | null;
  error: string | null;
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  try {
    const health = await fetchGatewayHealth();

    const rows: ServiceRow[] = SERVICES.map((name) => {
      const capEntry = health.capabilities?.[name];
      return {
        name,
        status: (health.services?.[name] as ServiceStatus) ?? "down",
        latencyMs:
          health.latencies?.[name] != null && (health.latencies[name] as number) >= 0
            ? (health.latencies[name] as number)
            : null,
        capability: parseCapability(capEntry?.capability),
        capabilityNote: capEntry?.capabilityNote,
      };
    });

    return json<LoaderData>({
      rows,
      overallStatus: health.status,
      checkedAt: health.checkedAt ?? health.timestamp ?? null,
      error: null,
    });
  } catch (err) {
    return json<LoaderData>({
      rows: SERVICES.map((name) => ({
        name,
        status: "down",
        latencyMs: null,
        capability: "n/a",
      })),
      overallStatus: "down",
      checkedAt: null,
      error: err instanceof Error ? err.message : "Service unreachable",
    });
  }
}

// --------------------------------------------------------------------------
// Components
// --------------------------------------------------------------------------

type StatusBadgeProps = {
  status: ServiceStatus;
};

/**
 * StatusBadge — renders the container status badge for a service row.
 *
 * Single-axis: container status is always authoritative.
 *   down → always RED (anti-false-green invariant).
 */
function StatusBadge({ status }: StatusBadgeProps) {
  const displayState = composeRowDisplayState(status, "n/a");

  switch (displayState) {
    case "deployed_up":
      return (
        <span className="rounded border border-green-700 bg-green-900 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-green-300">
          UP
        </span>
      );
    case "deployed_degraded":
      return (
        <span className="rounded border border-yellow-700 bg-yellow-900 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-yellow-300">
          DEGRADED
        </span>
      );
    case "deployed_down":
      // Anti-false-green: down = RED, no exceptions
      return (
        <span className="rounded border border-red-700 bg-red-900 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-red-300">
          DOWN
        </span>
      );
  }
}

export default function ServerDashboard() {
  const { rows, overallStatus, checkedAt, error } =
    useLoaderData<typeof loader>();

  // Top badge: driven by full fleet status.
  const topStatus = composeOverallStatus(rows, overallStatus);

  return (
    <div className="w-full">
      <div className="mb-6">
        <PageHeader
          title="Service Health"
          actions={
            <div className="flex flex-col items-end">
              {topStatus && <StatusBadge status={topStatus} />}
            </div>
          }
        />
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Service unreachable — please try again later.
        </div>
      )}

      {checkedAt && (
        <p className="mb-4 text-xs text-slate-500">
          Last updated:{" "}
          <ClientTimestamp iso={checkedAt} />
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800">
              <th className="px-4 py-3 text-left font-semibold text-slate-300">
                Service
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">
                Status
              </th>
              <th className="px-4 py-3 text-right font-semibold text-slate-300">
                Latency
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.name}
                className={`border-b border-slate-700 last:border-0 ${
                  idx % 2 === 0 ? "bg-slate-900" : "bg-slate-850"
                }`}
              >
                <td className="px-4 py-3 font-mono text-slate-200">
                  {row.name}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3 text-right text-slate-400">
                  {row.latencyMs != null ? `${row.latencyMs} ms` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
