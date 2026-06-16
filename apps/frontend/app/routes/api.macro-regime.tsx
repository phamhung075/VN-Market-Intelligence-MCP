/**
 * Resource route — transparent proxy for GET /api/macro-regime.
 *
 * Mirrors the api.news-sentiment.tsx precedent (P1-1b).
 * The dashboard.macro.tsx page calls /api/macro-regime from its Remix
 * loader; this route intercepts that request at the frontend origin (:3001)
 * and forwards it to mcp-server (:3000).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/macro-regime
 *
 * Response shape:
 *   { generated_at: ISO, data_source: "live"|"stale"|"unavailable",
 *     stale_served: boolean,
 *     indicators: { vnIndex, oilUsd, goldUsd, usdVnd },
 *     signals: { investment_clock, oil, gold, usdvnd },
 *     calendar: { available, events, note } }
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
  const upstream = `${MCP_SERVER_BASE_URL}/api/macro-regime`;

  return proxyUpstream(upstream, { method: "GET", headers: { Accept: "application/json" } }, { label: "api.macro-regime" });
}
