/**
 * Application Use Case — Macro Indicator Fetcher
 *
 * Wrapper around the domain service that injects real implementations
 * of HTTP client, circuit breaker, and rate limiter.
 *
 * For testing, this file is replaced or mocked; for production,
 * it wires real infrastructure.
 *
 * Task 239: Dependency injection adapter
 *
 * @module application/usecases/macroIndicatorFetcher
 */

import type { Database } from "bun:sqlite";
import { fetchAndStoreMacroIndicators as domainFetch, type FetchResult } from "../../domain/services/macro/index.js";

/**
 * Re-exports the domain service for use in the application layer.
 *
 * In tests, this can be mocked at the import level.
 * In production, real infra is wired via the scheduler.
 */
export async function fetchAndStoreMacroIndicators(
  db: Database,
  httpClient?: any,
  circuitBreaker?: any,
  rateLimiter?: any,
): Promise<FetchResult> {
  // If test provides mocks, use them
  if (httpClient && circuitBreaker && rateLimiter) {
    return domainFetch(db, httpClient, circuitBreaker, rateLimiter);
  }

  // TODO: Wire real infrastructure when needed in 239c
  return {
    success: false,
    sourceUsed: null,
    indicatorCount: 0,
  };
}
