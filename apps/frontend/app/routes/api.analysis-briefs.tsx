/**
 * Resource route — transparent proxy for GET /api/analysis-briefs.
 *
 * Mirrors the api.macro-regime.tsx precedent (P1-2b).
 * The dashboard.reports.tsx page calls /api/analysis-briefs from its Remix
 * loader; this route intercepts that request at the frontend origin (:3001)
 * and forwards it to mcp-server (:3000).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/analysis-briefs
 *
 * Response shape:
 *   { generated_at: ISO, count: number,
 *     items: [ { ticker, exchange, latest_period, released,
 *                verdict_label, verdict_summary, confidence, updated_at } ] }
 *
 * Only GET is supported — the endpoint is read-only.
 * 4xx/5xx from upstream are forwarded as-is — never converted to 500.
 * Network failure returns 502.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { proxyUpstream } from "~/lib/api/fetchUtils";

const MCP_SERVER_BASE_URL =
  typeof process !== "undefined" && process.env["MCP_SERVER_BASE_URL"]
    ? process.env["MCP_SERVER_BASE_URL"]
    : "http://localhost:3000";

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const upstream = `${MCP_SERVER_BASE_URL}/api/analysis-briefs`;

  return proxyUpstream(upstream, { method: "GET", headers: { Accept: "application/json" } }, { label: "api.analysis-briefs" });
}
