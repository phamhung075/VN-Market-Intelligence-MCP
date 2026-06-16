/**
 * Resource route — transparent proxy for GET /api/conviction-history.
 *
 * Mirrors the api.prediction-claims.tsx proxy precedent (TASK17-CONVICTION).
 * The conviction-history dashboard page (dashboard.conviction-history.tsx) calls
 * /api/conviction-history from its Remix loader; this route intercepts that
 * request at the frontend origin (:3001) and forwards it to mcp-server (:3000).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/conviction-history
 *
 * Query params forwarded verbatim: limit, symbol (passthrough).
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
  // Forward query params (limit, symbol) verbatim to upstream.
  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  const upstream = `${MCP_SERVER_BASE_URL}/api/conviction-history${qs ? `?${qs}` : ""}`;

  return proxyUpstream(upstream, { method: "GET", headers: { Accept: "application/json" } }, { label: "api.conviction-history" });
}
