/**
 * Resource route — transparent proxy for GET /api/sector-rotation.
 *
 * Mirrors the api.foreign-flow.tsx proxy precedent (TASK-17 PAGE 9).
 * The sector-rotation dashboard page (dashboard.sector-rotation.tsx) calls
 * /api/sector-rotation from its Remix loader; this route intercepts that
 * request at the frontend origin (:3001) and forwards it to mcp-server (:3000).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/sector-rotation
 *
 * No query params — the endpoint takes none.
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
  const upstream = `${MCP_SERVER_BASE_URL}/api/sector-rotation`;

  return proxyUpstream(upstream, { method: "GET", headers: { Accept: "application/json" } }, { label: "api.sector-rotation" });
}
