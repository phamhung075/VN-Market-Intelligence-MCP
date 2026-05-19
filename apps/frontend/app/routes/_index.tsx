// Tier 2/3: Router skeleton — wired to api-gateway health via fetchGatewayHealth().
import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link, NavLink } from "@remix-run/react";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { fetchGatewayHealth, type GatewayHealth } from "~/lib/api/client";

export const meta: MetaFunction = () => {
  return [
    { title: "VN Market Intelligence" },
    { name: "description", content: "Vietnam stock market dashboard" },
  ];
};

interface LoaderData {
  message: string;
  timestamp: string;
  gateway: GatewayHealth | null;
  gatewayError: string | null;
}

// Loader runs server-side — fetches api-gateway health using env-driven API_GATEWAY_URL.
export async function loader({ request: _request }: LoaderFunctionArgs) {
  let gateway: GatewayHealth | null = null;
  let gatewayError: string | null = null;

  try {
    gateway = await fetchGatewayHealth();
  } catch (err) {
    gatewayError =
      err instanceof Error ? err.message : "api-gateway unreachable";
  }

  return json<LoaderData>({
    message: "VN Market Intelligence — dashboard coming soon",
    timestamp: new Date().toISOString(),
    gateway,
    gatewayError,
  });
}

const NAV_ITEMS = [
  { to: "/dashboard/analysis", label: "Analysis" },
  { to: "/dashboard/services", label: "Services" },
  { to: "/dashboard/fetch", label: "Fetch Ops" },
  { to: "/dashboard/vps", label: "VPS Proxy" },
  { to: "/dashboard/db", label: "Database" },
] as const;

const DASHBOARD_LINKS = [
  { to: "/dashboard/analysis", label: "Market Analysis", desc: "Kinh Dịch signals + macro indicators" },
  { to: "/dashboard/services", label: "Service Health", desc: "9 microservice status + latency" },
  { to: "/dashboard/fetch", label: "Fetch Operations", desc: "Reuters, Bloomberg, macro snapshot" },
  { to: "/dashboard/vps", label: "VPS Proxy", desc: "Vietnam proxy health per service" },
  { to: "/dashboard/db", label: "Database Report", desc: "Price history, alert engine, headlines" },
] as const;

export default function Index() {
  const { message, timestamp, gateway, gatewayError } =
    useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      {/* Top nav — same as dashboard layout */}
      <nav className="border-b border-slate-700 bg-slate-800 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="font-bold tracking-tight text-slate-100 hover:text-slate-300"
          >
            VN Market Intelligence
          </Link>
          <div className="flex gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                [
                  "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-slate-700 text-slate-100"
                    : "text-slate-400 hover:bg-slate-700 hover:text-slate-200",
                ].join(" ")
              }
            >
              Home
            </NavLink>
            {NAV_ITEMS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  [
                    "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-slate-700 text-slate-100"
                      : "text-slate-400 hover:bg-slate-700 hover:text-slate-200",
                  ].join(" ")
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
      <main className="flex flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">{message}</h1>
        <p className="text-sm text-slate-500">
          Last updated:{" "}
          <ClientTimestamp iso={timestamp} />
        </p>
        {gateway && (
          <p className="text-sm text-slate-400">
            Gateway:{" "}
            <span
              className={
                gateway.status === "ok"
                  ? "font-medium text-green-400"
                  : gateway.status === "degraded"
                    ? "font-medium text-yellow-400"
                    : "font-medium text-red-400"
              }
            >
              {gateway.status.toUpperCase()}
            </span>
          </p>
        )}
        {gatewayError && (
          <p className="text-xs text-slate-500">
            Gateway unreachable (offline or starting up)
          </p>
        )}

        {/* Dashboard navigation */}
        <nav className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DASHBOARD_LINKS.map(({ to, label, desc }) => (
            <Link
              key={to}
              to={to}
              className="rounded-lg border border-slate-700 bg-slate-800 p-4 text-left transition-colors hover:border-slate-500 hover:bg-slate-750"
            >
              <p className="font-semibold text-slate-200">{label}</p>
              <p className="mt-1 text-xs text-slate-500">{desc}</p>
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
