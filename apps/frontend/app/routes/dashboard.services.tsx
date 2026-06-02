/**
 * /dashboard/server — Service health dashboard.
 * Shows all 9 microservices with status badge (UP/DOWN/DEGRADED) and latency.
 * Data source: GET /health via api-gateway.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { fetchGatewayHealth } from "~/lib/api/client";
import type { ServiceRow, ServiceStatus } from "~/domain/health";
import { ClientTimestamp } from "~/components/ClientTimestamp";

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

    const rows: ServiceRow[] = SERVICES.map((name) => ({
      name,
      status: (health.services?.[name] as ServiceRow["status"]) ?? "down",
      latencyMs:
        health.latencies?.[name] != null && (health.latencies[name] as number) >= 0
          ? (health.latencies[name] as number)
          : null,
    }));

    return json<LoaderData>({
      rows,
      overallStatus: health.status,
      checkedAt: health.checkedAt ?? health.timestamp ?? null,
      error: null,
    });
  } catch (err) {
    return json<LoaderData>({
      rows: SERVICES.map((name) => ({ name, status: "down", latencyMs: null })),
      overallStatus: "down",
      checkedAt: null,
      error: err instanceof Error ? err.message : "Service unreachable",
    });
  }
}

// --------------------------------------------------------------------------
// Components
// --------------------------------------------------------------------------

type StatusBadgeProps = { status: ServiceStatus };

function StatusBadge({ status }: StatusBadgeProps) {
  const map: Record<ServiceStatus, string> = {
    ok: "bg-green-900 text-green-300 border-green-700",
    degraded: "bg-yellow-900 text-yellow-300 border-yellow-700",
    down: "bg-red-900 text-red-300 border-red-700",
    not_deployed: "bg-slate-800 text-slate-400 border-slate-600",
  };

  const label: Record<ServiceStatus, string> = {
    ok: "UP",
    degraded: "DEGRADED",
    down: "DOWN",
    not_deployed: "NOT DEPLOYED",
  };

  return (
    <span
      className={`rounded border px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${map[status]}`}
    >
      {label[status]}
    </span>
  );
}

export default function ServerDashboard() {
  const { rows, overallStatus, checkedAt, error } =
    useLoaderData<typeof loader>();

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Service Health</h1>
        <div className="flex flex-col items-end">
          {overallStatus && (
            <StatusBadge status={overallStatus} />
          )}
          {overallStatus === "ok" && rows.some((r) => r.status === "not_deployed") && (
            <p className="mt-1 text-xs text-slate-500">
              {rows.filter((r) => r.status === "not_deployed").length} service(s) not deployed on
              this host by design — see system-map.json host_runtime_set.
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
