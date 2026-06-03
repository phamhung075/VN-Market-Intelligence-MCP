/**
 * Resource route — transparent proxy for GET /api/vps-proxy-health.
 *
 * The VPS Proxy Health panel (dashboard.vps.tsx) fetches this relative URL from
 * the frontend origin (:3001). This route forwards the request to the mcp-server
 * and relays the response verbatim (status + body + Content-Type).
 *
 * Upstream: GET ${MCP_SERVER_BASE_URL}/api/vps-proxy-health
 * Pattern mirrors api.bctc-inspect.$.tsx — same env resolution, same error-to-502 handling.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";

const MCP_SERVER_BASE_URL =
  typeof process !== "undefined" && process.env["MCP_SERVER_BASE_URL"]
    ? process.env["MCP_SERVER_BASE_URL"]
    : "http://localhost:3000";

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const upstream = `${MCP_SERVER_BASE_URL}/api/vps-proxy-health`;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstream, {
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: `Proxy fetch error: ${message}` }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const upstreamContentType =
    upstreamResponse.headers.get("Content-Type") ?? "application/json";

  const body = await upstreamResponse.arrayBuffer();

  return new Response(body, {
    status: upstreamResponse.status,
    headers: { "Content-Type": upstreamContentType },
  });
}
