/**
 * Tier 3: API service layer — typed fetch client for api-gateway.
 *
 * ALL backend calls go through api-gateway (env: API_GATEWAY_URL, default port 4000).
 * NEVER import or call microservice ports (5000–5008) directly from this layer.
 *
 * Pattern:
 *   1. Define a domain response type in app/domain/<resource>.ts
 *   2. Add a typed fetch function here
 *   3. Write a Vitest test in app/__tests__/NNN-api-<endpoint>.test.ts FIRST (TDD)
 *   4. Only then wire into a Remix loader
 */

const API_GATEWAY_URL =
  // Server-side: use Docker service name via env (API_GATEWAY_URL=http://api-gateway:4000 in Docker)
  // Client-side: never — all API calls must go through Remix loaders (SSR)
  process.env.API_GATEWAY_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Base fetch wrapper. Throws ApiError on non-2xx responses.
 * Use typed wrappers below rather than calling this directly.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const url = `${API_GATEWAY_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `GET ${path} failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Health check — used by the dashboard to surface api-gateway status.
 * Endpoint: GET /health
 */
export interface GatewayHealth {
  status: "ok" | "degraded" | "down";
  services: Record<string, "ok" | "degraded" | "down">;
  timestamp: string;
}

export async function fetchGatewayHealth(): Promise<GatewayHealth> {
  return apiGet<GatewayHealth>("/health");
}
