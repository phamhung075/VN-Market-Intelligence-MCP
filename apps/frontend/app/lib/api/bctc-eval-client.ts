/**
 * Tier 3: BCTC eval API — calls mcp-server directly (not via api-gateway).
 *
 * The eval endpoints live on mcp-server (port 3000 in-cluster).
 * Base URL: MCP_SERVER_BASE_URL env var.
 * Default in-cluster:  http://mcp-server:3000
 * Default local dev:   http://localhost:3000
 *
 * All functions are server-side only (called from Remix loaders).
 */

import type {
  EvalListResponse,
  EvalDetailResponse,
  ThresholdsResponse,
} from "~/domain/bctc-eval";

const MCP_SERVER_BASE_URL =
  typeof process !== "undefined" && process.env["MCP_SERVER_BASE_URL"]
    ? process.env["MCP_SERVER_BASE_URL"]
    : "http://localhost:3000";

export class BctcEvalApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BctcEvalApiError";
  }
}

async function mcpGet<T>(path: string): Promise<{ data: T; status: number }> {
  const url = `${MCP_SERVER_BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new BctcEvalApiError(
      response.status,
      `GET ${path} failed: ${response.status} ${response.statusText}`,
    );
  }
  const data = (await response.json()) as T;
  return { data, status: response.status };
}

async function mcpPost<T>(path: string): Promise<T> {
  const url = `${MCP_SERVER_BASE_URL}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new BctcEvalApiError(
      response.status,
      `POST ${path} failed: ${response.status} ${response.statusText}`,
    );
  }
  return response.json() as Promise<T>;
}

/**
 * GET /api/bctc-eval — list all reports with summary.
 * Returns the full list response including sort metadata.
 */
export async function fetchBctcEvalList(): Promise<EvalListResponse> {
  const { data } = await mcpGet<EvalListResponse>("/api/bctc-eval");
  return data;
}

/**
 * GET /api/bctc-eval/{report_id} — full detail for one report.
 * Returns { data, status } so callers can distinguish 404 vs 409 vs 200.
 */
export async function fetchBctcEvalDetail(
  reportId: string,
): Promise<{ data: EvalDetailResponse | null; status: number }> {
  try {
    return await mcpGet<EvalDetailResponse>(`/api/bctc-eval/${reportId}`);
  } catch (err) {
    if (err instanceof BctcEvalApiError) {
      return { data: null, status: err.status };
    }
    throw err;
  }
}

/**
 * POST /api/bctc-eval/recompute/{report_id} — recompute all 6 stages.
 * Returns updated detail JSON.
 */
export async function recomputeBctcEval(
  reportId: string,
): Promise<EvalDetailResponse> {
  return mcpPost<EvalDetailResponse>(`/api/bctc-eval/recompute/${reportId}`);
}

/**
 * GET /api/bctc-eval/thresholds — SSOT thresholds for display in FE.
 */
export async function fetchBctcEvalThresholds(): Promise<ThresholdsResponse> {
  const { data } = await mcpGet<ThresholdsResponse>("/api/bctc-eval/thresholds");
  return data;
}
