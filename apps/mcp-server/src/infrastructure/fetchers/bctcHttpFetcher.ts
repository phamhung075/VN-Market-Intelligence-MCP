import { BROWSER_UA } from "./browserHeaders.js";
import type { HttpFetchFn } from "../../domain/services/bctcDiscovery.js";

/**
 * Production HTTP fetch adapter for BCTC discovery.
 * Wraps globalThis.fetch with AbortController timeout and browser UA headers.
 * Infrastructure layer — do NOT import from domain/.
 */
export const bctcHttpFetch: HttpFetchFn = async (
  url: string,
  timeoutMs: number,
): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await globalThis.fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "application/json, text/html, */*",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res.text();
  } finally {
    clearTimeout(timer);
  }
};
