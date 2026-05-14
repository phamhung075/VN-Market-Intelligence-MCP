import { BROWSER_UA } from "./browserHeaders.js";
import type { HttpFetchFn } from "../../domain/services/bctcDiscovery.js";

/**
 * VPS host identifier used to decide whether to inject X-API-Key.
 *
 * Reads VPS_HOST env var at call time (same pattern as getBctcDiscoverUrl in domain).
 * Falls back to the hardcoded Vinahost VPS IP when env var is absent.
 * The VPS proxy server authenticates all inbound requests with X-API-Key.
 */
function getVpsHost(): string {
  return (typeof Bun !== "undefined" ? Bun.env["VPS_HOST"] : undefined) ?? "125.212.251.27";
}

/**
 * Returns true when the given URL targets the VPS host.
 * Matches the hostname portion of the URL against the resolved VPS host value.
 */
function isVpsUrl(url: string): boolean {
  const vpsHost = getVpsHost();
  try {
    const parsed = new URL(url);
    return parsed.hostname === vpsHost;
  } catch {
    // Malformed URL — conservative default: no VPS headers
    return false;
  }
}

/**
 * Production HTTP fetch adapter for BCTC discovery.
 * Wraps globalThis.fetch with AbortController timeout and browser UA headers.
 * Infrastructure layer — do NOT import from domain/.
 *
 * Header injection policy:
 * - All requests: User-Agent (browser UA), Accept
 * - VPS host requests: additionally injects X-API-Key: ${Bun.env.VPS_PUSH_API_KEY}
 *   when VPS_PUSH_API_KEY is set. Without the header the VPS proxy returns HTTP 401.
 *   SPIKE 1916 confirmed: Strategy 0 (/proxy/bctc-discover/:ticker) requires auth.
 */
export const bctcHttpFetch: HttpFetchFn = async (
  url: string,
  timeoutMs: number,
): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const baseHeaders: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    Accept: "application/json, text/html, */*",
  };

  // Inject VPS authentication header only for VPS-targeted requests
  if (isVpsUrl(url)) {
    const apiKey = typeof Bun !== "undefined" ? Bun.env["VPS_PUSH_API_KEY"] : undefined;
    if (apiKey) {
      baseHeaders["X-API-Key"] = apiKey;
    }
  }

  try {
    const res = await globalThis.fetch(url, {
      signal: controller.signal,
      headers: baseHeaders,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res.text();
  } finally {
    clearTimeout(timer);
  }
};
