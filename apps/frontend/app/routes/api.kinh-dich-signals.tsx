/**
 * Resource route — transparent proxy for GET /api/kinh-dich-signals.
 *
 * Mirrors the api.sector-cascade.tsx proxy precedent (TASK-17 PAGE 10).
 * The kinh-dich-signals dashboard page (dashboard.kinh-dich-signals.tsx) calls
 * /api/kinh-dich-signals from its Remix loader; this route intercepts that
 * request at the frontend origin (:3001) and forwards it to mcp-server (:3000).
 *
 * Upstream URL: ${MCP_SERVER_BASE_URL}/api/kinh-dich-signals
 *
 * Query params: ?source= — forwarded as-is to upstream (default "cycle").
 * Only GET is supported — the endpoint is read-only.
 * 4xx/5xx from upstream are forwarded as-is — never converted to 500.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { proxyUpstream } from "~/lib/api/fetchUtils";

const MCP_SERVER_BASE_URL =
  typeof process !== "undefined" && process.env["MCP_SERVER_BASE_URL"]
    ? process.env["MCP_SERVER_BASE_URL"]
    : "http://localhost:3000";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const source = url.searchParams.get("source");
  const upstreamUrl = new URL(`${MCP_SERVER_BASE_URL}/api/kinh-dich-signals`);
  if (source !== null) {
    upstreamUrl.searchParams.set("source", source);
  }
  const upstream = upstreamUrl.toString();

  return proxyUpstream(upstream, { method: "GET", headers: { Accept: "application/json" } }, { label: "api.kinh-dich-signals" });
}
