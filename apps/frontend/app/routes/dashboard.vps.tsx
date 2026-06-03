/**
 * /dashboard/vps — VPS Data-Push Health
 *
 * Shows REAL VPS push-route freshness per source (prices / news / sbv / bctc).
 * Data source: GET /api/vps-proxy-health on the mcp-server, proxied via
 * the local resource route api.vps-proxy-health.tsx.
 *
 * Status mapping (TRUTHFUL):
 *   status "ok" && !stale  → UP     (green)
 *   stale === true          → STALE  (amber)   — actionable: investigate VPS/source
 *   errors_24h > 0 / error  → DOWN   (red)
 *   no_data / null last_push→ NO DATA (slate)
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { ClientTimestamp } from "~/components/ClientTimestamp";

export const meta: MetaFunction = () => [
  { title: "VPS Proxy Health — VN Market Intelligence" },
];

// --------------------------------------------------------------------------
// Types — mirror the /api/vps-proxy-health response shape
// --------------------------------------------------------------------------

interface VpsSourceRow {
  name: string;
  last_push: string | null;
  items: number | null;
  status: string;
  pushes_24h: number;
  errors_24h: number;
  stale: boolean;
}

interface RecentPush {
  service: string;
  pushed_at: string;
  status: string;
  items_count: number | null;
  duration_ms: number | null;
  error_msg: string | null;
}

interface VpsProxyHealthResponse {
  ok: boolean;
  services: VpsSourceRow[];
  recent_pushes: RecentPush[];
  fetchedAt: string;
}

interface LoaderData {
  health: VpsProxyHealthResponse | null;
  proxyError: string | null;
  fetchedAt: string;
}

// --------------------------------------------------------------------------
// Loader
// --------------------------------------------------------------------------

const MCP_SERVER_BASE_URL =
  typeof process !== "undefined" && process.env["MCP_SERVER_BASE_URL"]
    ? process.env["MCP_SERVER_BASE_URL"]
    : "http://localhost:3000";

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const upstream = `${MCP_SERVER_BASE_URL}/api/vps-proxy-health`;
  let health: VpsProxyHealthResponse | null = null;
  let proxyError: string | null = null;

  try {
    const res = await fetch(upstream, { headers: { Accept: "application/json" } });
    if (res.ok) {
      health = (await res.json()) as VpsProxyHealthResponse;
    } else {
      proxyError = `Upstream returned HTTP ${res.status}`;
    }
  } catch (err) {
    proxyError = err instanceof Error ? err.message : "Fetch failed";
  }

  return json<LoaderData>({
    health,
    proxyError,
    fetchedAt: new Date().toISOString(),
  });
}

// --------------------------------------------------------------------------
// StatusPill — includes STALE variant
// --------------------------------------------------------------------------

type StatusVariant = "up" | "stale" | "down" | "degraded" | "no_data" | "unknown";

function resolveVariant(row: VpsSourceRow): StatusVariant {
  if (!row.last_push) return "no_data";
  if (row.stale) return "stale";
  if (row.errors_24h > 0) return "degraded";
  if (row.status === "ok") return "up";
  if (row.status === "error") return "down";
  return "unknown";
}

function StatusPill({ variant }: { variant: StatusVariant }) {
  const styles: Record<StatusVariant, string> = {
    up:       "bg-green-900 text-green-300 border-green-700",
    stale:    "bg-yellow-900 text-yellow-300 border-yellow-700",
    down:     "bg-red-900 text-red-300 border-red-700",
    degraded: "bg-orange-900 text-orange-300 border-orange-700",
    no_data:  "bg-slate-800 text-slate-400 border-slate-600",
    unknown:  "bg-slate-700 text-slate-400 border-slate-600",
  };
  const labels: Record<StatusVariant, string> = {
    up:       "UP",
    stale:    "STALE",
    down:     "DOWN",
    degraded: "DEGRADED",
    no_data:  "NO DATA",
    unknown:  "UNKNOWN",
  };
  return (
    <span
      className={`rounded border px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${styles[variant]}`}
    >
      {labels[variant]}
    </span>
  );
}

// --------------------------------------------------------------------------
// Legend / explainer
// --------------------------------------------------------------------------

function VpsNote() {
  return (
    <div className="rounded border border-slate-700 bg-slate-800 p-4 text-sm text-slate-400">
      <p className="font-medium text-slate-300">VPS Data-Push Health</p>
      <p className="mt-1">
        This panel shows freshness of VPS-routed data pushes into the mcp-server per
        source (prices · news · sbv · bctc). Each row reflects the last successful push
        from the Vietnam VPS proxy (Vinahost).
      </p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>
          <span className="rounded border border-green-700 bg-green-900 px-1.5 py-0.5 font-semibold text-green-300">UP</span>
          {" "}data flowing, push fresh
        </span>
        <span>
          <span className="rounded border border-yellow-700 bg-yellow-900 px-1.5 py-0.5 font-semibold text-yellow-300">STALE</span>
          {" "}no fresh push within expected interval — investigate VPS / source
        </span>
        <span>
          <span className="rounded border border-orange-700 bg-orange-900 px-1.5 py-0.5 font-semibold text-orange-300">DEGRADED</span>
          {" "}push errors detected in last 24 h
        </span>
        <span>
          <span className="rounded border border-red-700 bg-red-900 px-1.5 py-0.5 font-semibold text-red-300">DOWN</span>
          {" "}push reporting error
        </span>
        <span>
          <span className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-semibold text-slate-400">NO DATA</span>
          {" "}no push recorded yet
        </span>
      </p>
    </div>
  );
}

// --------------------------------------------------------------------------
// Main component
// --------------------------------------------------------------------------

export default function VpsDashboard() {
  const { health, proxyError, fetchedAt } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">VPS Proxy Health</h1>
        <span className="text-xs text-slate-500">
          Last updated: <ClientTimestamp iso={fetchedAt} />
        </span>
      </div>

      <VpsNote />

      {proxyError && (
        <div className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300">
          <span className="font-semibold">Endpoint error:</span> {proxyError}
        </div>
      )}

      {/* Source health table */}
      <div className="overflow-hidden rounded-lg border border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800">
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Source</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Last Push</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-300">Items</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-300">24h Pushes</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-300">24h Errors</th>
            </tr>
          </thead>
          <tbody>
            {health?.services && health.services.length > 0 ? (
              health.services.map((row, idx) => {
                const variant = resolveVariant(row);
                return (
                  <tr
                    key={row.name}
                    className={`border-b border-slate-700 last:border-0 ${
                      idx % 2 === 0 ? "bg-slate-900" : "bg-slate-800"
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-slate-200">{row.name}</td>
                    <td className="px-4 py-3">
                      <StatusPill variant={variant} />
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {row.last_push ? (
                        <ClientTimestamp iso={row.last_push} />
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {row.items != null ? row.items.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {row.pushes_24h}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.errors_24h > 0 ? (
                        <span className="font-semibold text-red-400">{row.errors_24h}</span>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  {proxyError ? "Could not load data." : "No source data available."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Recent push log */}
      {health?.recent_pushes && health.recent_pushes.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-400">
            Recent Pushes (last {health.recent_pushes.length})
          </h2>
          <div className="overflow-hidden rounded-lg border border-slate-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800">
                  <th className="px-3 py-2 text-left font-semibold text-slate-300">Service</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-300">Pushed At</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-300">Items</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-300">Duration</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-300">Result</th>
                </tr>
              </thead>
              <tbody>
                {health.recent_pushes.map((push, idx) => (
                  <tr
                    key={`${push.service}-${push.pushed_at}-${idx}`}
                    className={`border-b border-slate-700 last:border-0 ${
                      idx % 2 === 0 ? "bg-slate-900" : "bg-slate-800"
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-slate-300">{push.service}</td>
                    <td className="px-3 py-2 text-slate-400">
                      <ClientTimestamp iso={push.pushed_at} />
                    </td>
                    <td className="px-3 py-2 text-right text-slate-400">
                      {push.items_count != null ? push.items_count.toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-400">
                      {push.duration_ms != null ? `${push.duration_ms} ms` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {push.error_msg ? (
                        <span className="text-red-400">{push.error_msg}</span>
                      ) : (
                        <span className="text-green-400">{push.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
