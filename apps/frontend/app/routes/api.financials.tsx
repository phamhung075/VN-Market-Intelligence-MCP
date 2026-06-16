/**
 * Resource route — transparent proxy for GET /api/financials.
 *
 * Mirrors the api.officers.tsx proxy precedent (TASK-17 PAGE 15).
 * The financials dashboard page (dashboard.financials.tsx) calls
 * /api/financials from its Remix loader; this route intercepts that
 * request at the frontend origin (:3001) and forwards it to mcp-server (:3000).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/financials
 *
 * No query params — this is a full-universe screener endpoint (78 codes).
 * Only GET is supported — the endpoint is read-only.
 * 4xx/5xx from upstream are forwarded as-is — never converted to 500.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { proxyUpstream } from "~/lib/api/fetchUtils";

const MCP_SERVER_BASE_URL =
  typeof process !== "undefined" && process.env["MCP_SERVER_BASE_URL"]
    ? process.env["MCP_SERVER_BASE_URL"]
    : "http://localhost:3000";

export async function loader(_args: LoaderFunctionArgs) {
  const upstream = `${MCP_SERVER_BASE_URL}/api/financials`;

  return proxyUpstream(upstream, { method: "GET", headers: { Accept: "application/json" } }, { label: "api.financials" });
}
