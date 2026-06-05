// Tier 2/3: Router skeleton — wired to api-gateway health via fetchGatewayHealth().
import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { PageHeader } from "~/components/PageHeader";
import { TopNav } from "~/components/TopNav";
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
    message: "Vietnam Stock Market Intelligence",
    timestamp: new Date().toISOString(),
    gateway,
    gatewayError,
  });
}

const DASHBOARD_LINKS = [
  { to: "/dashboard/analysis", label: "Market Analysis", desc: "Kinh Dịch signals + macro indicators" },
  { to: "/dashboard/services", label: "Service Health", desc: "Microservice status + latency" },
  { to: "/dashboard/fetch", label: "Fetch Operations", desc: "Reuters, Bloomberg, macro snapshot" },
  { to: "/dashboard/vps", label: "VPS Proxy", desc: "Vietnam proxy health per service" },
  { to: "/dashboard/db", label: "Database Report", desc: "Price history, alert engine, headlines" },
] as const;

export default function Index() {
  const { message, timestamp, gateway, gatewayError } =
    useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      <TopNav />
      <main className="flex min-h-[calc(100vh-3.5rem)] w-full flex-col items-center justify-center gap-6 p-8">
        <PageHeader
          title={message}
          subtitle="Vietnam Stock Market Intelligence Dashboard"
          actions={
            <span className="text-xs text-slate-500">
              <ClientTimestamp iso={timestamp} />
            </span>
          }
        />
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
