/**
 * /dashboard/services — Service Health dashboard.
 *
 * Implements the 2-axis Service Health model (FOU-3-FE):
 *   Axis 1 — Container status: deployed (ok/degraded/down) | not_deployed
 *   Axis 2 — Capability via mcp-server: live | data_limited | dark | n/a
 *
 * Composed display logic:
 *   deployed + ok/degraded       → GREEN/YELLOW (existing, unchanged)
 *   deployed + down              → RED "DOWN" (ALWAYS, anti-false-green invariant)
 *   not_deployed + live          → BLUE "LIVE via mcp-server"
 *   not_deployed + data_limited  → AMBER "LIMITED via mcp-server" + capabilityNote
 *   not_deployed + dark          → GREY "NOT DEPLOYED"
 *   not_deployed + n/a           → GREY "NOT DEPLOYED"
 *
 * ANTI-FALSE-GREEN: capability axis is additive ONLY for not_deployed services.
 * A deployed service that is DOWN renders RED regardless of any capability value.
 *
 * Pure compose logic lives in ~/domain/health-compose.ts (importable without Remix).
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { fetchGatewayHealth } from "~/lib/api/client";
import type { CapabilityStatus, ServiceRow, ServiceStatus } from "~/domain/health";
import {
  composeRowDisplayState,
  composeOverallStatus,
  parseCapability,
} from "~/domain/health-compose";
import { ClientTimestamp } from "~/components/ClientTimestamp";

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

/**
 * CapabilityBadge — private to this route, domain-specific.
 * Renders the second-axis indicator for not_deployed services.
 * For deployed services this component is NOT rendered (container status is authoritative).
 */
interface CapabilityBadgeProps {
  capability: CapabilityStatus;
  capabilityNote?: string;
}

function CapabilityBadge({ capability, capabilityNote }: CapabilityBadgeProps) {
  if (capability === "live") {
    return (
      <span className="rounded border border-blue-700 bg-blue-900 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-blue-300">
        LIVE via mcp-server
      </span>
    );
  }
  if (capability === "data_limited") {
    return (
      <span className="inline-flex flex-col">
        <span className="rounded border border-yellow-700 bg-yellow-900 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-yellow-300">
          LIMITED via mcp-server
        </span>
        {capabilityNote && (
          <span className="mt-0.5 text-xs text-yellow-500">{capabilityNote}</span>
        )}
      </span>
    );
  }
  // dark or n/a → grey NOT DEPLOYED
  return (
    <span className="rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-400">
      NOT DEPLOYED
    </span>
  );
}

type StatusBadgeProps = {
  status: ServiceStatus;
  capability?: CapabilityStatus;
  capabilityNote?: string;
};

/**
 * StatusBadge — renders the composed 2-axis state badge for a service row.
 *
 * For deployed services (ok/degraded/down): renders single-axis badge.
 *   down → always RED (anti-false-green invariant; capability is ignored).
 * For not_deployed services: delegates to CapabilityBadge.
 */
function StatusBadge({ status, capability = "n/a", capabilityNote }: StatusBadgeProps) {
  const displayState = composeRowDisplayState(status, capability);

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
      // Anti-false-green: deployed + down = RED, regardless of capability
      return (
        <span className="rounded border border-red-700 bg-red-900 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-red-300">
          DOWN
        </span>
      );
    case "not_deployed_live":
    case "not_deployed_data_limited":
    case "not_deployed_dark":
      return <CapabilityBadge capability={capability} capabilityNote={capabilityNote} />;
  }
}

export default function ServerDashboard() {
  const { rows, overallStatus, checkedAt, error } =
    useLoaderData<typeof loader>();

  // Top badge: ignores not_deployed, driven by deployed services only.
  const topStatus = composeOverallStatus(rows, overallStatus);
  const notDeployedCount = rows.filter((r) => r.status === "not_deployed").length;
  const notDeployedLiveCount = rows.filter(
    (r) => r.status === "not_deployed" && r.capability === "live",
  ).length;

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Service Health</h1>
        <div className="flex flex-col items-end">
          {topStatus && <StatusBadge status={topStatus} />}
          {notDeployedCount > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              {notDeployedCount} service(s) not deployed on this host by design
              {notDeployedLiveCount > 0 && (
                <> — {notDeployedLiveCount} LIVE via mcp-server</>
              )}
            </p>
          )}
        </div>
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
                  <StatusBadge
                    status={row.status}
                    capability={row.capability}
                    capabilityNote={row.capabilityNote}
                  />
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
