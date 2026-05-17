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
  latencies?: Record<string, number>;
  checkedAt?: string;
}

export async function fetchGatewayHealth(): Promise<GatewayHealth> {
  return apiGet<GatewayHealth>("/health");
}

// --------------------------------------------------------------------------
// Service health
// --------------------------------------------------------------------------

import type { ServiceHealth } from "~/domain/health";

/**
 * Per-service health detail.
 * Endpoint: GET /health/:service
 */
export async function fetchServiceHealth(service: string): Promise<ServiceHealth> {
  const raw = await apiGet<unknown>(`/health/${service}`);
  if (raw !== null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    // Accept both camelCase and snake_case / alternative field names from the gateway.
    const latency =
      typeof obj["latency"] === "number"
        ? obj["latency"]
        : typeof obj["latencyMs"] === "number"
          ? obj["latencyMs"]
          : typeof obj["latency_ms"] === "number"
            ? obj["latency_ms"]
            : undefined;
    const checkedAt =
      typeof obj["checkedAt"] === "string"
        ? obj["checkedAt"]
        : typeof obj["checked_at"] === "string"
          ? obj["checked_at"]
          : typeof obj["timestamp"] === "string"
            ? obj["timestamp"]
            : undefined;
    return {
      service,
      status: isServiceStatus(obj["status"]) ? obj["status"] : "down",
      latency,
      checkedAt,
      error: typeof obj["error"] === "string" ? obj["error"] : undefined,
    };
  }
  return { service, status: "down" };
}

function isServiceStatus(v: unknown): v is "ok" | "degraded" | "down" {
  return v === "ok" || v === "degraded" || v === "down";
}

// --------------------------------------------------------------------------
// News headlines
// --------------------------------------------------------------------------

import type { Headline } from "~/domain/news";

function toHeadline(item: unknown): Headline | null {
  if (item === null || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  // Article (news-fetch) uses `headline`; generic schemas may use `title`.
  const title =
    typeof obj["title"] === "string"
      ? obj["title"]
      : typeof obj["headline"] === "string"
        ? obj["headline"]
        : null;
  if (title === null) return null;
  return {
    title,
    url: typeof obj["url"] === "string" ? obj["url"] : undefined,
    publishedAt: typeof obj["publishedAt"] === "string" ? obj["publishedAt"] : undefined,
    source: typeof obj["source"] === "string" ? obj["source"] : undefined,
    summary: typeof obj["summary"] === "string" ? obj["summary"] : undefined,
  };
}

function parseHeadlines(raw: unknown): Headline[] {
  // Handle FetchResult envelope: { source, articles: Article[], fetchedAt, method, error }
  const items: unknown[] =
    raw !== null && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>)["articles"])
      ? ((raw as Record<string, unknown>)["articles"] as unknown[])
      : Array.isArray(raw)
        ? raw
        : [];
  return items.map(toHeadline).filter((h): h is Headline => h !== null);
}

/**
 * Reuters headlines.
 * Endpoint: GET /news/reuters/headlines
 */
export async function fetchReutersHeadlines(): Promise<Headline[]> {
  const raw = await apiGet<unknown>("/news/reuters/headlines");
  return parseHeadlines(raw);
}

/**
 * Bloomberg headlines.
 * Endpoint: GET /news/bloomberg/headlines
 */
export async function fetchBloombergHeadlines(): Promise<Headline[]> {
  const raw = await apiGet<unknown>("/news/bloomberg/headlines");
  return parseHeadlines(raw);
}

// --------------------------------------------------------------------------
// Macro data
// --------------------------------------------------------------------------

import type { MacroData } from "~/domain/market";

/**
 * External macro snapshot.
 * Endpoint: GET /macro/external
 */
export async function fetchMacroExternal(): Promise<MacroData> {
  const raw = await apiGet<unknown>("/macro/external");
  if (raw !== null && typeof raw === "object") {
    return raw as MacroData;
  }
  return { status: "unavailable" };
}

// --------------------------------------------------------------------------
// Price history
// --------------------------------------------------------------------------

import type { PricePoint } from "~/domain/market";

function toPricePoint(item: unknown): PricePoint | null {
  if (item === null || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  if (typeof obj["close"] !== "number") return null;
  return {
    date: typeof obj["date"] === "string" ? obj["date"] : "",
    code: typeof obj["code"] === "string" ? obj["code"] : "",
    open: typeof obj["open"] === "number" ? obj["open"] : undefined,
    high: typeof obj["high"] === "number" ? obj["high"] : undefined,
    low: typeof obj["low"] === "number" ? obj["low"] : undefined,
    close: obj["close"],
    volume: typeof obj["volume"] === "number" ? obj["volume"] : undefined,
  };
}

/**
 * Price history for a ticker.
 * Endpoint: GET /stock/price/history?code=<ticker>
 * Response shape: { code: string, history: DailyOHLCV[] }
 */
export async function fetchPriceHistory(code: string): Promise<PricePoint[]> {
  const raw = await apiGet<unknown>(`/stock/price/history?code=${encodeURIComponent(code)}`);
  const items: unknown[] =
    raw !== null && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>)["history"])
      ? ((raw as Record<string, unknown>)["history"] as unknown[])
      : Array.isArray(raw)
        ? raw
        : [];
  return items.map(toPricePoint).filter((p): p is PricePoint => p !== null);
}
