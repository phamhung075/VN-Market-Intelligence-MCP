/**
 * Resource route — transparent proxy for GET /api/analysis-brief/:ticker.
 *
 * Mirrors the api.orchestration.tsx precedent (P0-4).
 * The dashboard.analysis.tsx page calls /api/analysis-brief/{ticker} from
 * its Remix loader; this route intercepts at the frontend origin (:3001)
 * and forwards to mcp-server (:3000).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/analysis-brief/:ticker
 *
 * Response shape:
 *   200: { ticker, fundamentals, news, price, synthesis, raw, updatedAt }
 *   404: { error: "not_found", ticker }
 *   400: { error: "invalid_ticker" }
 *   500: { error: "io_error" }
 *
 * Only GET is supported — the endpoint is read-only.
 * 4xx/5xx from upstream are forwarded as-is — never converted to 500.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { proxyUpstream } from "~/lib/api/fetchUtils";

const MCP_SERVER_BASE_URL =
  typeof process !== "undefined" && process.env["MCP_SERVER_BASE_URL"]
    ? process.env["MCP_SERVER_BASE_URL"]
    : "http://localhost:3000";

export async function loader({ params }: LoaderFunctionArgs) {
  const ticker = params["ticker"];
  if (!ticker) {
    return new Response(
      JSON.stringify({ error: "invalid_ticker" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const upstream = `${MCP_SERVER_BASE_URL}/api/analysis-brief/${encodeURIComponent(ticker)}`;

  return proxyUpstream(upstream, { method: "GET", headers: { Accept: "application/json" } }, { label: "api.analysis-brief" });
}
