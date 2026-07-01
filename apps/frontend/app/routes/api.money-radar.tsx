/**
 * Resource route — transparent proxy for GET /api/money-radar.
 *
 * Sprint: MONEY-RADAR-P0
 * Task:   MONEY-RADAR-P0-T3-DASHBOARD
 *
 * The dashboard.money-radar.tsx page calls /api/money-radar from its Remix
 * loader; this route intercepts at the frontend origin (:3001) and forwards
 * to mcp-server (:3000). Mirrors api.momentum-indicators.tsx exactly (D1/D2
 * gateway-blind loader mechanism — see fetchUtils.ts proxyUpstream).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/money-radar
 *
 * Expected response shape (docs/architecture-briefs/2026-07-01-money-radar.md §4,
 * get_money_radar_composite MCP tool, MONEY-RADAR-P0-T2-COMPOSITE):
 *   {
 *     score: number | null,
 *     delta_5d: number | null,
 *     divergence: { flag: "GREEN"|"AMBER"|"RED"|"UNKNOWN", severity: number,
 *                   detectors: string[], null_reason?: string },
 *     coverage_pct: number,
 *     source_tier: number | null,
 *     is_estimate: boolean,
 *     null_reason: string | null,
 *     components: Record<string, number | null>,
 *     generated_at: string,
 *   }
 *
 * Honest-NULL contract (HN-1..HN-7): score/delta_5d/components may be null
 * when coverage is thin. The frontend renders honest-NULL state per HN-6 —
 * never fabricates.
 *
 * Only GET is supported — the endpoint is read-only.
 * 4xx/5xx from upstream are forwarded as-is — never converted to 500.
 * Network failure returns 502 (proxyUpstream contract).
 *
 * DDD layer: interface — proxies mcp-server REST endpoint.
 * No domain logic here — pure transparent proxy via proxyUpstream.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { proxyUpstream } from "~/lib/api/fetchUtils";

const MCP_SERVER_BASE_URL =
  typeof process !== "undefined" && process.env["MCP_SERVER_BASE_URL"]
    ? process.env["MCP_SERVER_BASE_URL"]
    : "http://localhost:3000";

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const upstream = `${MCP_SERVER_BASE_URL}/api/money-radar`;

  return proxyUpstream(
    upstream,
    { method: "GET", headers: { Accept: "application/json" } },
    { label: "api.money-radar" },
  );
}
