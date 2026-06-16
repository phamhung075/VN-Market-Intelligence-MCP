/**
 * Resource route — transparent proxy for GET /api/market-summaries.
 *
 * Mirrors the api.prediction-claims.tsx proxy precedent (TASK-17).
 * The market-summaries dashboard page (dashboard.market-summaries.tsx) calls
 * /api/market-summaries from its Remix loader; this route intercepts that
 * request at the frontend origin (:3001) and forwards it to mcp-server (:3000).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/market-summaries
 *
 * Query params forwarded verbatim: period, limit, id (passthrough).
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
  // Forward query params (period, limit, id) verbatim to upstream.
  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  const upstream = `${MCP_SERVER_BASE_URL}/api/market-summaries${qs ? `?${qs}` : ""}`;

  return proxyUpstream(upstream, { method: "GET", headers: { Accept: "application/json" } }, { label: "api.market-summaries" });
}
