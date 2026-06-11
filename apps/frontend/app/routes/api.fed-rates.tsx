/**
 * Resource route — transparent proxy for GET /api/fed-rates.
 *
 * Mirrors the api.financials.tsx proxy precedent (TASK-17 PAGE 16).
 * The fed-rates dashboard page (dashboard.fed-rates.tsx) calls
 * /api/fed-rates from its Remix loader; this route intercepts that
 * request at the frontend origin (:3001) and forwards it to mcp-server (:3000).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/fed-rates
 *
 * No query params — this is a full-window endpoint.
 * Only GET is supported — the endpoint is read-only.
 * 4xx/5xx from upstream are forwarded as-is — never converted to 500.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";

const MCP_SERVER_BASE_URL =
  typeof process !== "undefined" && process.env["MCP_SERVER_BASE_URL"]
    ? process.env["MCP_SERVER_BASE_URL"]
    : "http://localhost:3000";

export async function loader(_args: LoaderFunctionArgs) {
  const upstream = `${MCP_SERVER_BASE_URL}/api/fed-rates`;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstream, {
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
