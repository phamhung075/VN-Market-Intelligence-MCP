/**
 * Resource route — transparent proxy for GET /api/orchestration.
 *
 * Mirrors the api.bctc-inspect.$.tsx splat-proxy precedent (OSC-4c A2).
 * The orchestration dashboard page (dashboard.orchestration.tsx) calls
 * /api/orchestration from its Remix loader; this route intercepts that
 * request at the frontend origin (:3001) and forwards it to mcp-server (:3000).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/orchestration
 *
 * Only GET is supported — the endpoint is read-only (HC-2 constraint).
 * 4xx/5xx from upstream are forwarded as-is — never converted to 500.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { proxyUpstream } from "~/lib/api/fetchUtils";

const MCP_SERVER_BASE_URL =
  typeof process !== "undefined" && process.env["MCP_SERVER_BASE_URL"]
    ? process.env["MCP_SERVER_BASE_URL"]
    : "http://localhost:3000";

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const upstream = `${MCP_SERVER_BASE_URL}/api/orchestration`;

  return proxyUpstream(upstream, { method: "GET", headers: { Accept: "application/json" } }, { label: "api.orchestration" });
}
