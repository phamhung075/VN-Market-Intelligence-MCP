/**
 * Resource route — transparent proxy for GET /api/kinh-dich/reading/:code.
 *
 * Mirrors the api.orchestration.tsx proxy precedent.
 * Forwards the request from the frontend origin (:3001) to the api-gateway (:4000)
 * kinh-dich service path: /kinh-dich/reading/:code
 *
 * Upstream URL: ${API_GATEWAY_URL}/kinh-dich/reading/:code
 * SSOT env var: API_GATEWAY_URL (docker-compose.yml → frontend env → http://api-gateway:4000)
 *
 * Error handling:
 *   - network failure → 502
 *   - 4xx/5xx from upstream (incl. 503 ErrInsufficientData) → forwarded as-is (non-fatal)
 * Only GET is supported — the endpoint is read-only.
 *
 * TASK-17: used by watchlist tile KD enrichment.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { proxyUpstream } from "~/lib/api/fetchUtils";

const API_GATEWAY_URL =
  typeof process !== "undefined" && process.env["API_GATEWAY_URL"]
    ? process.env["API_GATEWAY_URL"]
    : "http://localhost:4000";

export async function loader({ params }: LoaderFunctionArgs) {
  const code = params["code"] ?? "";
  const upstream = `${API_GATEWAY_URL}/kinh-dich/reading/${encodeURIComponent(code)}`;

  return proxyUpstream(upstream, { method: "GET", headers: { Accept: "application/json" } }, { label: "api.kinh-dich.reading" });
}
