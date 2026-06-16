/**
 * Splat resource route — transparent proxy for ALL /api/bctc-inspect/* sub-paths.
 *
 * The BCTC Inspect viewer HTML (served at /dashboard/bctc-inspect) makes relative
 * fetch calls to /api/bctc-inspect/*. This route intercepts every such request at
 * the frontend origin (:3001) and forwards it to the mcp-server upstream.
 *
 * Supported sub-paths (all verified against the live viewer HTML):
 *   GET  docs
 *   GET  page-window/:docId?page=N
 *   GET  ocr/:docId?page=N
 *   GET  table/:docId
 *   GET  md/:docId
 *   GET  zones/:docId?page=N
 *   GET  pdf/:docId          (BINARY — application/pdf)
 *   GET  page-image/:docId   (BINARY — image/png, ?page=N)
 *   GET  flags/:docId
 *   POST correct/:docId      (JSON body)
 *   POST confirm/:docId      (JSON body)
 *   POST confirm/:docId/reset
 *
 * Binary invariant: pdf and page-image responses are piped as arrayBuffer to avoid
 * any text decode/re-encode. Upstream Content-Type and status code are relayed verbatim.
 * 4xx/5xx from upstream are forwarded as-is — never converted to 500.
 *
 * CORRECTION (router raw-verify): upstream path includes /api prefix.
 * Upstream URL = ${MCP_SERVER_BASE_URL}/api/bctc-inspect/${params["*"]}.
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
  const upstream = `${MCP_SERVER_BASE_URL}/api/bctc-inspect/${subpath}${search}`;

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

  return proxyUpstream(upstream, upstreamInit, { label: "api.bctc-inspect" });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  return proxyRequest(request, params);
}

export async function action({ request, params }: ActionFunctionArgs) {
  return proxyRequest(request, params);
}
