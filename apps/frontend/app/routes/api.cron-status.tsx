/**
 * Resource route — transparent proxy for GET /api/cron-status.
 *
 * Mirrors api.orchestration.tsx exactly (TASK-DASH-CRON-2, FR-4.1). The
 * orchestration dashboard page (dashboard.orchestration.tsx) calls
 * /api/cron-status from its Remix loader; this route intercepts that
 * request at the frontend origin (:3001) and forwards it to mcp-server (:3000).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/cron-status
 *
 * Only GET is supported — the endpoint is read-only (NFR-4). 4xx/5xx from
 * upstream are forwarded as-is — never converted to 500.
 *
 * NOTE (2026-07-02): Zone 1 (TASK-DASH-CRON-1) shipped GET /api/cron-status
 * upstream, but the running mcp-server container has not been rebuilt yet
 * (user-gated). Until the rebuild ships, this proxy will forward a live
 * 404/503 from upstream — that is the EXPECTED state, not a bug in this route.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { proxyUpstream } from "~/lib/api/fetchUtils";

const MCP_SERVER_BASE_URL =
  typeof process !== "undefined" && process.env["MCP_SERVER_BASE_URL"]
    ? process.env["MCP_SERVER_BASE_URL"]
    : "http://localhost:3000";

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const upstream = `${MCP_SERVER_BASE_URL}/api/cron-status`;

  return proxyUpstream(upstream, { method: "GET", headers: { Accept: "application/json" } }, { label: "api.cron-status" });
}
