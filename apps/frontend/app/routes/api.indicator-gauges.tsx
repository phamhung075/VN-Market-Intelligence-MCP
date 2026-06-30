/**
 * Resource route — transparent proxy for GET /api/indicator-gauges.
 *
 * Sprint: MARKET-INDICATOR-DEPTH-P0
 * Task:   IND-P1-FRONTEND-GAUGE-CARDS
 *
 * The dashboard.indicator-gauges.tsx page calls /api/indicator-gauges from
 * its Remix loader; this route intercepts at the frontend origin (:3001)
 * and forwards to mcp-server (:3000).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/indicator-gauges
 *
 * Expected response shape (when mcp-server endpoint is deployed):
 *   {
 *     generated_at: ISO string,
 *     volatility: { rv_20d_percentile, rv_20d_pct, vol_regime, vol_regime_pct,
 *                   asof, null_reason, source_tier } | null,
 *     sentiment:  { news_sentiment_z, history_quality, sentiment_ema_5d,
 *                   bull_ratio_5d, bear_ratio_5d, asof, null_reason, source_tier } | null,
 *     breadth:    { breadth_z_score: { value, unit, asof, confidence, null_reason },
 *                   mclellan_osc, history_quality, asof, source_tier } | null,
 *     foreign_room: { market_saturation_pct, foreign_outflow_z_5d,
 *                     as_of_date, null_reason, source_tier } | null,
 *     liquidity:  { omo_net_outstanding_bn_vnd, policy_refi_rate_pct,
 *                   fetched_at, null_reason, source_tier } | null
 *   }
 *
 * Honest-NULL contract: any section may be null when data is still accruing
 * (e.g. breadth_z_score before 21 sessions). The frontend renders honest-NULL
 * state for each section — never fabricates or default-fills.
 *
 * Only GET is supported — the endpoint is read-only.
 * 4xx/5xx from upstream are forwarded as-is — never converted to 500.
 * Network failure returns 502.
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
  const upstream = `${MCP_SERVER_BASE_URL}/api/indicator-gauges`;

  return proxyUpstream(
    upstream,
    { method: "GET", headers: { Accept: "application/json" } },
    { label: "api.indicator-gauges" },
  );
}
