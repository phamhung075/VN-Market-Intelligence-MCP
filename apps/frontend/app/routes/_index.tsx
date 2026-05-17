// Tier 2/3: Router skeleton — wired to api-gateway health via fetchGatewayHealth().
import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
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

export default function Index() {
  const { message, timestamp, gateway, gatewayError } =
    useLoaderData<typeof loader>();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold tracking-tight">{message}</h1>
      <p className="text-sm text-muted-foreground">
        Last rendered:{" "}
        {new Date(timestamp).toLocaleString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
        })}
      </p>
      {gateway && (
        <p className="text-sm text-muted-foreground">
          Gateway: <span className="font-medium text-foreground">{gateway.status}</span>
        </p>
      )}
      {gatewayError && (
        <p className="text-xs text-muted-foreground">
          Gateway unreachable (offline or starting up)
        </p>
      )}
    </main>
  );
}
