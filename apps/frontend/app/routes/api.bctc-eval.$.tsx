/**
 * Splat resource route — transparent proxy for ALL /api/bctc-eval/* sub-paths.
 *
 * CORRECTION 2 (router raw-verify): the BCTC Inspect viewer's "Đánh giá 6 cổng" tab
 * fetches ${BASE}/api/bctc-eval/{docId}/page/{pageNum} (bctc-inspector.html line 1860-1861).
 * This path is NOT under /api/bctc-inspect/*, so the bctc-inspect splat does NOT cover it.
 * The existing bctc-eval-client.ts is a server-side library and does NOT expose
 * /api/bctc-eval/* to the :3001 browser origin — the eval tab would 404 without this route.
 *
 * Path collision check: no collision with existing React routes.
 *   - dashboard.bctc-eval.* routes sit under /dashboard/bctc-eval/* (different prefix).
 *   - This route handles /api/bctc-eval/* — a different URL prefix. No conflict.
 *
 * Same passthrough rules as api.bctc-inspect.$.tsx:
 *   - Method, query string, body forwarded verbatim.
 *   - Upstream Content-Type + status code relayed verbatim.
 *   - Binary-safe: arrayBuffer pipe (no text decode).
 *   - 4xx/5xx from upstream forwarded as-is.
 *
 * Upstream URL = ${MCP_SERVER_BASE_URL}/api/bctc-eval/${params["*"]}.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { proxyUpstream } from "~/lib/api/fetchUtils";

const MCP_SERVER_BASE_URL =
  typeof process !== "undefined" && process.env["MCP_SERVER_BASE_URL"]
    ? process.env["MCP_SERVER_BASE_URL"]
    : "http://localhost:3000";

async function proxyRequest(request: Request, params: Record<string, string | undefined>) {
  const subpath = params["*"] ?? "";
  const search = new URL(request.url).search;
  const upstream = `${MCP_SERVER_BASE_URL}/api/bctc-eval/${subpath}${search}`;

  const isPost = request.method === "POST";

  const upstreamInit: RequestInit = {
    method: request.method,
    headers: {} as Record<string, string>,
  };

  if (isPost) {
    const contentType = request.headers.get("Content-Type");
    if (contentType) {
      (upstreamInit.headers as Record<string, string>)["Content-Type"] = contentType;
    }
    upstreamInit.body = await request.arrayBuffer();
  }

  return proxyUpstream(upstream, upstreamInit, { label: "api.bctc-eval" });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  return proxyRequest(request, params);
}

export async function action({ request, params }: ActionFunctionArgs) {
  return proxyRequest(request, params);
}
