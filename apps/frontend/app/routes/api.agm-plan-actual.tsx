/**
 * Resource route — transparent proxy for GET /api/agm-plan-actual.
 *
 * Mirrors the api.foreign-flow.tsx proxy precedent (TASK17-AGM).
 * The agm-plan-actual dashboard page (dashboard.agm-plan-actual.tsx) calls
 * /api/agm-plan-actual from its Remix loader; this route intercepts that
 * request at the frontend origin (:3001) and forwards it to mcp-server (:3000).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/agm-plan-actual
 *
 * Query params forwarded verbatim: year, limit (passthrough).
 * Only GET is supported — the endpoint is read-only.
 * 4xx/5xx from upstream are forwarded as-is — never converted to 500.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { proxyUpstream } from "~/lib/api/fetchUtils";

const MCP_SERVER_BASE_URL =
  typeof process !== "undefined" && process.env["MCP_SERVER_BASE_URL"]
    ? process.env["MCP_SERVER_BASE_URL"]
    : "http://localhost:3000";

export async function loader({ request }: LoaderFunctionArgs) {
  // Forward query params (year, limit) verbatim to upstream.
  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  const upstream = `${MCP_SERVER_BASE_URL}/api/agm-plan-actual${qs ? `?${qs}` : ""}`;

  return proxyUpstream(upstream, { method: "GET", headers: { Accept: "application/json" } }, { label: "api.agm-plan-actual" });
}
