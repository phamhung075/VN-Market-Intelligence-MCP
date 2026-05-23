/**
 * Task P2-B1 — Shared HTTP client configuration for macro-indicators microservice.
 *
 * Single source of truth for the macro-indicators base URL.
 * Reads MACRO_INDICATORS_URL env var at call-time with localhost:5004 as default fallback.
 *
 * @module interface/mcp/tools/macro/macroHttpClient
 */

/**
 * Returns the base URL for the macro-indicators HTTP service.
 * Reads MACRO_INDICATORS_URL at call-time (not module load time) to allow
 * test overrides.
 */
export function getMacroBaseUrl(): string {
  return Bun.env.MACRO_INDICATORS_URL ?? "http://localhost:5004";
}
