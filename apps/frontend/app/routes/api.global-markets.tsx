/**
 * Resource route — transparent proxy for GET /api/global-markets.
 *
 * Mirrors the api.sector-cascade.tsx proxy precedent (TASK-17 PAGE 10).
 * The global-markets dashboard page (dashboard.global-markets.tsx) calls
 * /api/global-markets from its Remix loader; this route intercepts that
 * request at the frontend origin (:3001) and forwards it to mcp-server (:3000).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/global-markets
 *
 * Query params: ?window=N — forwarded as-is to upstream.
 * Only GET is supported — the endpoint is read-only.
 * 4xx/5xx from upstream are forwarded as-is — never converted to 500.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";

const MCP_SERVER_BASE_URL =
  typeof process !== "undefined" && process.env["MCP_SERVER_BASE_URL"]
    ? process.env["MCP_SERVER_BASE_URL"]
    : "http://localhost:3000";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const window = url.searchParams.get("window");
  const upstreamUrl = new URL(`${MCP_SERVER_BASE_URL}/api/global-markets`);
  if (window !== null) {
    upstreamUrl.searchParams.set("window", window);
  }
  const upstream = upstreamUrl.toString();

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
