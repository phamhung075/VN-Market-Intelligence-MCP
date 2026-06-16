/**
 * Resource route — transparent proxy for GET /api/news-sentiment.
 *
 * Mirrors the api.market-digest.tsx precedent (P0-2).
 * The dashboard.news.tsx page calls /api/news-sentiment from its Remix
 * loader; this route intercepts that request at the frontend origin (:3001)
 * and forwards it to mcp-server (:3000).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/news-sentiment
 *
 * Response shape:
 *   { generated_at: ISO, stale_served: boolean, oldest_item_ts: ISO,
 *     count: number, items: NewsSentimentItem[] }
 * items[] may be empty — not an error.
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
  const upstream = `${MCP_SERVER_BASE_URL}/api/news-sentiment`;

  return proxyUpstream(upstream, { method: "GET", headers: { Accept: "application/json" } }, { label: "api.news-sentiment" });
}
