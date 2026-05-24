/**
 * RAG Service HTTP Client
 *
 * Provides a fetch-based client for the rag-service microservice (port 5002).
 * Used when RAG_SERVICE_URL env var is set.
 *
 * Endpoints:
 *   POST /search  {query, limit, decay_half_life_days, max_distance, level?, action_code?}
 *   POST /index   {id, content, tags, level?, title?, summary?, action_code?}
 *   GET  /health  → {status: "ok", service: "rag-service"}
 */

const RAG_SERVICE_URL = Bun.env.RAG_SERVICE_URL ?? "http://localhost:5002";

export interface RagSearchRequest {
  query: string;
  limit?: number;
  decay_half_life_days?: number;
  max_distance?: number;
  level?: string;
  action_code?: string;
}

export interface RagSearchResultDTO {
  id: string;
  level: string;
  title: string;
  summary: string;
  tags: string[];
  action_code: string;
  created_at: string;
  distance: number;
  recency_score: number;
}

export interface RagSearchResponse {
  results: RagSearchResultDTO[];
  total: number;
}

export interface RagIndexRequest {
  id: string;
  content: string;
  tags: string[];
  level?: string;
  title?: string;
  summary?: string;
  action_code?: string;
}

export interface RagIndexResponse {
  status: string;
  indexed: number;
  entry_id: string;
}

export interface RagHealthResponse {
  status: string;
  service: string;
}

/**
 * Input shape for inserting a new analysis entry into the RAG service.
 * Previously defined in retriever.ts; moved here as ragHttpClient is the
 * canonical HTTP boundary for the rag-service (G5b, P2-F).
 */
export interface AnalysisInput {
  /** Unique identifier for this entry */
  id: string;
  /** Hierarchy level: "global" | "country" | "domain" | "action" */
  level: string;
  /** Short headline / title */
  title: string;
  /** Paragraph-length summary of the analysis */
  summary: string;
  /** Semantic tags for improved retrieval (e.g. ["banking", "credit"]) */
  tags: string[];
  /** Stock ticker if this is an action-level entry (e.g. "VCB") */
  actionCode?: string;
}

/**
 * Search the RAG service for similar entries.
 *
 * @param request Search parameters
 * @returns SearchResponse with ranked results
 * @throws Error if the request fails
 */
export async function ragSearch(request: RagSearchRequest): Promise<RagSearchResponse> {
  const response = await fetch(`${RAG_SERVICE_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`[ragHttpClient] search failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<RagSearchResponse>;
}

/**
 * Index an entry in the RAG service.
 *
 * @param request Entry to index
 * @returns IndexResponse with status + entry_id
 * @throws Error if the request fails
 */
export async function ragIndex(request: RagIndexRequest): Promise<RagIndexResponse> {
  const response = await fetch(`${RAG_SERVICE_URL}/index`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`[ragHttpClient] index failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<RagIndexResponse>;
}

/**
 * Health check for the RAG service.
 *
 * @returns true if service is healthy, false otherwise
 */
export async function ragHealthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${RAG_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as RagHealthResponse;
    return body.status === "ok";
  } catch {
    return false;
  }
}
