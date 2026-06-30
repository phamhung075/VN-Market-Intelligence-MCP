/**
 * Resource route — transparent proxy for GET /api/momentum-indicators.
 *
 * Sprint: BA-IND-P1-MOMENTUM-FRONTEND
 * Task:   TASK-502-MOMENTUM-FRONTEND AC-1
 *
 * The dashboard.momentum.tsx page calls /api/momentum-indicators from its
 * Remix loader; this route intercepts at the frontend origin (:3001) and
 * forwards to mcp-server (:3000).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/momentum-indicators
 *
 * Expected response shape (TASK-501 DTO contract):
 *   {
 *     generated_at: ISO string,
 *     source_tier: 3,
 *     roc: { momentum_factor_z, computed_as_of, null_reason, ... } | null,
 *     relative_strength: { market_rs_composite, low_sample_warning,
 *                          computed_as_of, null_reason, ... } | null,
 *     proximity_52w: { net_new_highs, pct_above_ma50, pct_above_ma200,
 *                      computed_as_of, null_reason, ... } | null,
 *     foreign_accum: { foreign_accum_z_market, computed_as_of,
 *                      null_reason, ... } | null,
 *   }
 *
 * Honest-NULL contract: any section may be null when data is still accruing.
 * The frontend renders honest-NULL state for each section — never fabricates.
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
  const upstream = `${MCP_SERVER_BASE_URL}/api/momentum-indicators`;

  return proxyUpstream(
    upstream,
    { method: "GET", headers: { Accept: "application/json" } },
    { label: "api.momentum-indicators" },
  );
}
