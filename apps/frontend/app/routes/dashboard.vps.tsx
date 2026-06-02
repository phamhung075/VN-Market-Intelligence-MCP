/**
 * /dashboard/vps — VPS proxy health dashboard.
 * Shows VPS proxy status per VPS-routed service.
 * Data sources: GET /health/news, GET /health/macro (per-service health from api-gateway).
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { fetchServiceHealth } from "~/lib/api/client";
import type { ServiceHealth } from "~/domain/health";
import { ClientTimestamp, ClientTimeString } from "~/components/ClientTimestamp";

export const meta: MetaFunction = () => [
  { title: "VPS Proxy Health — VN Market Intelligence" },
];

// Services that route through the Vietnam VPS proxy.
const VPS_SERVICES = ["news", "macro", "stock", "pdf"] as const;

type VpsService = (typeof VPS_SERVICES)[number];

interface VpsServiceRow {
  name: VpsService;
  health: ServiceHealth | null;
  error: string | null;
}

interface LoaderData {
  rows: VpsServiceRow[];
  fetchedAt: string;
}

/**
 * Fetch health for a VPS-routed service, with not_deployed discrimination.
 *
 * The api-gateway returns HTTP 503 with body {"status":"down","error":"dial tcp:
 * lookup <service> ... no such host"} when the downstream container is not
 * deployed on this host. That is a known, expected state — NOT a real outage.
 *
 * Rules:
 *   - 2xx + body.status     → use fetchServiceHealth() result (normal path)
 *   - 503 + body has "no such host" DNS error → ServiceHealth{ status: "not_deployed" }
 *   - 503 + other body      → ServiceHealth{ status: "down", error: body.error }
 *   - network throw / other → row.error = message (unknown)
 */
const API_GATEWAY_URL_VPS =
  typeof process !== "undefined" && process.env["API_GATEWAY_URL"]
    ? process.env["API_GATEWAY_URL"]
    : "http://localhost:4000";

async function fetchVpsServiceHealth(service: string): Promise<ServiceHealth> {
  const url = `${API_GATEWAY_URL_VPS}/health/${service}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });

  if (response.ok) {
    // Normal 2xx path — delegate to the standard parser
    return fetchServiceHealth(service);
  }

  // Non-2xx: read body to discriminate not_deployed vs real failure
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    // body not JSON — treat as unknown failure
  }

  const bodyError = typeof body["error"] === "string" ? body["error"] : "";

  // "no such host" = Docker DNS can't resolve the container → service not deployed
  if (response.status === 503 && bodyError.includes("no such host")) {
    return { service, status: "not_deployed" };
  }

  // Any other non-2xx with a body.status field → relay it
  if (typeof body["status"] === "string") {
    const status =
      body["status"] === "not_deployed"
        ? "not_deployed"
        : body["status"] === "ok"
          ? "ok"
          : body["status"] === "degraded"
            ? "degraded"
            : "down";
    return {
      service,
      status,
      error: bodyError || undefined,
    };
  }

  // Fallback: treat as down
  return {
    service,
    status: "down",
    error: bodyError || `HTTP ${response.status}`,
  };
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const results = await Promise.allSettled(
    VPS_SERVICES.map((svc) => fetchVpsServiceHealth(svc)),
  );

  const rows: VpsServiceRow[] = VPS_SERVICES.map((name, idx) => {
    const result = results[idx];
    if (result.status === "fulfilled") {
      return { name, health: result.value, error: null };
    }
    return {
      name,
      health: null,
      error:
        result.reason instanceof Error
          ? result.reason.message
          : "Unreachable",
    };
  });

  return json<LoaderData>({
    rows,
    fetchedAt: new Date().toISOString(),
  });
}

// --------------------------------------------------------------------------
// Components
// --------------------------------------------------------------------------

type StatusVariant = "ok" | "degraded" | "down" | "unknown" | "not_deployed";

function StatusPill({ status }: { status: StatusVariant }) {
  const styles: Record<StatusVariant, string> = {
    ok: "bg-green-900 text-green-300 border-green-700",
    degraded: "bg-yellow-900 text-yellow-300 border-yellow-700",
    down: "bg-red-900 text-red-300 border-red-700",
    unknown: "bg-slate-700 text-slate-400 border-slate-600",
    not_deployed: "bg-slate-800 text-slate-400 border-slate-600",
  };
  const labels: Record<StatusVariant, string> = {
    ok: "UP",
    degraded: "DEGRADED",
    down: "DOWN",
    unknown: "UNKNOWN",
    not_deployed: "NOT DEPLOYED",
  };
  return (
    <span
      className={`rounded border px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function VpsNote() {
  return (
    <div className="rounded border border-slate-700 bg-slate-800 p-4 text-sm text-slate-400">
      <p className="font-medium text-slate-300">VPS Proxy Architecture</p>
      <p className="mt-1">
        The following services route through the Vietnam VPS proxy (Vinahost) to bypass
        geo-blocking on VN financial data sources.
      </p>
      <p className="mt-1 text-xs">
        <span className="rounded border border-slate-600 bg-slate-700 px-1.5 py-0.5 text-slate-400 font-semibold">NOT DEPLOYED</span>
        {" "}= microservice not running on this host by design (expected on 16 GB dev host).{" "}
        <span className="rounded border border-red-700 bg-red-950 px-1.5 py-0.5 text-red-300 font-semibold">DOWN</span>
        {" "}= deployed but unreachable — investigate.
      </p>
    </div>
  );
}

export default function VpsDashboard() {
  const { rows, fetchedAt } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">VPS Proxy Health</h1>
        <span className="text-xs text-slate-500">
          Last updated:{" "}
          <ClientTimestamp iso={fetchedAt} />
        </span>
      </div>

      <VpsNote />

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
              <th className="px-4 py-3 text-left font-semibold text-slate-300">
                Note
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const status: StatusVariant = row.error
                ? "unknown"
                : row.health
                  ? (row.health.status as StatusVariant)
                  : "unknown";

              return (
                <tr
                  key={row.name}
                  className={`border-b border-slate-700 last:border-0 ${
                    idx % 2 === 0 ? "bg-slate-900" : "bg-slate-800"
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-slate-200">
                    {row.name}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={status} />
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400">
                    {row.health?.latency != null
                      ? `${row.health.latency} ms`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {row.error ? (
                      <span className="text-red-400">{row.error}</span>
                    ) : row.health?.checkedAt ? (
                      <ClientTimeString iso={row.health.checkedAt} />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
