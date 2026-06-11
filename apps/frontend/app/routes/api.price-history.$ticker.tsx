/**
 * Resource route — transparent proxy for GET /api/price-history/:ticker.
 *
 * Mirrors the api.analysis-brief.$ticker.tsx precedent.
 * The dashboard.technical.tsx page calls /api/price-history/{ticker}?days=N
 * from its Remix loader; this route intercepts at the frontend origin (:3001)
 * and forwards it to mcp-server (:3000).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/price-history/${ticker}?days=${days}
 *
 * Response shape:
 *   { ticker: string, generated_at: ISO, data_source: "live"|"unavailable",
 *     stale_served: boolean, count: number,
 *     latest: { date, close, change_abs: number|null, change_pct: number|null },
 *     candles: [ { date, open, high, low, close, volume } ] }
 *
 * Only GET is supported — the endpoint is read-only.
 * 4xx/5xx from upstream are forwarded as-is — never converted to 500.
 * Network failure returns 502.
 * The `days` query param is forwarded verbatim to upstream.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";

const MCP_SERVER_BASE_URL =
  typeof process !== "undefined" && process.env["MCP_SERVER_BASE_URL"]
    ? process.env["MCP_SERVER_BASE_URL"]
    : "http://localhost:3000";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const ticker = params["ticker"];
  if (!ticker) {
    return new Response(
      JSON.stringify({ error: "invalid_ticker" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Forward the `days` query param to upstream if present
  const url = new URL(request.url);
  const days = url.searchParams.get("days");
  const upstreamPath = `/api/price-history/${encodeURIComponent(ticker)}`;
  const upstreamUrl = days
    ? `${MCP_SERVER_BASE_URL}${upstreamPath}?days=${encodeURIComponent(days)}`
    : `${MCP_SERVER_BASE_URL}${upstreamPath}`;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: `Proxy fetch error: ${message}` }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Relay Content-Type verbatim; pipe body as arrayBuffer (binary-safe).
  const upstreamContentType =
    upstreamResponse.headers.get("Content-Type") ?? "application/json";

  const body = await upstreamResponse.arrayBuffer();

  return new Response(body, {
    status: upstreamResponse.status,
    headers: { "Content-Type": upstreamContentType },
  });
}
