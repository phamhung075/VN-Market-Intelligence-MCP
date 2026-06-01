/**
 * Resource route — serves the proxied BCTC Inspect viewer HTML at /dashboard/bctc-inspect.
 *
 * The upstream mcp-server serves the self-contained bctc-inspector.html at
 * GET /api/bctc-inspect (WITH the /api prefix — verified against bctcInspectHandler.ts line 18).
 *
 * The viewer HTML has `const BASE = ""` (no origin), so all its relative fetch calls
 * resolve against :3001 (the frontend origin). The /api/bctc-inspect/* and /api/bctc-eval/*
 * splat proxy routes (api.bctc-inspect.$.tsx and api.bctc-eval.$.tsx) handle those requests
 * transparently.
 *
 * This route returns a RAW Response — no JSX/React wrapper. The viewer owns its full DOM.
 * The Remix dashboard layout is intentionally bypassed (resource route pattern).
 */
import type { LoaderFunctionArgs } from "@remix-run/node";

const MCP_SERVER_BASE_URL =
  typeof process !== "undefined" && process.env["MCP_SERVER_BASE_URL"]
    ? process.env["MCP_SERVER_BASE_URL"]
    : "http://localhost:3000";

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const upstream = `${MCP_SERVER_BASE_URL}/api/bctc-inspect`;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstream);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      `<html><body><pre>BCTC Inspect proxy error: ${message}</pre></body></html>`,
      { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const htmlBody = await upstreamResponse.text();

  return new Response(htmlBody, {
    status: upstreamResponse.status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
