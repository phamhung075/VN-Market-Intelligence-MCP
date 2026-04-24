/**
 * Infrastructure — SBV (State Bank of Vietnam) Circular Fetcher (Task 242)
 *
 * Scrapes sbv.gov.vn for new Thông tư about credit, interest rates,
 * reserve requirements, and monetary policy.
 *
 * Layer: infrastructure/fetchers — may use HTTP libs, must not import domain services.
 *
 * Error handling: never throws — returns [] on any error.
 *
 * Task 1225: Added circuit breaker (breakers.sbvCircular) to stop flooding
 * on geo-block. sbv.gov.vn is geo-accessible but slow; the circuit breaker
 * backs off after 5 consecutive failures and waits 5 minutes before retrying.
 */

import * as cheerio from "cheerio";
import { logger } from "../logger.js";
import { globalRateLimiter } from "../../domain/services/rateLimiter.js";
import { breakers } from "../circuitBreakerRegistry.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SbvCircular {
  title: string;
  circularNumber: string;
  issueDate: string;
  effectiveDate: string;
  category: string;
  summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = "https://www.sbv.gov.vn";
const CIRCULARS_URL = `${BASE_URL}/webcenter/portal/vi/menu/trangchu/vbpq/ttnh`;
const HOST = "sbv.gov.vn";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ─────────────────────────────────────────────────────────────────────────────
// HTTP client interface
// ─────────────────────────────────────────────────────────────────────────────

export interface HttpClient {
  get(url: string): Promise<string>;
}

async function makeDefaultHttpClient(): Promise<HttpClient> {
  const axiosModule = await import("axios");
  const axios = axiosModule.default;

  return {
    async get(url: string): Promise<string> {
      const response = await axios.get<string>(url, {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml,*/*",
        },
        timeout: 20_000,
        responseType: "text",
      });
      return response.data;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

function classifyCircular(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("tín dụng") || lower.includes("room") || lower.includes("cho vay")) {
    return "Tín dụng";
  }
  if (lower.includes("tỷ giá") || lower.includes("ngoại tệ") || lower.includes("ngoại hối")) {
    return "Tỷ giá";
  }
  if (lower.includes("dự trữ") || lower.includes("dự phòng")) {
    return "Dự trữ";
  }
  if (lower.includes("lãi suất")) {
    return "Lãi suất";
  }
  if (lower.includes("thanh toán")) {
    return "Thanh toán";
  }
  return "Khác";
}

/**
 * Parse HTML from sbv.gov.vn and extract NHNN circulars.
 * Exported for unit testing.
 */
export function parseSbvHtml(html: string): SbvCircular[] {
  const circulars: SbvCircular[] = [];

  try {
    const $ = cheerio.load(html);

    $("a[href]").each((_i, el) => {
      const titleText = $(el).text().trim();
      const href = $(el).attr("href") ?? "";

      if (
        !titleText ||
        titleText.length < 10 ||
        !(
          titleText.includes("Thông tư") ||
          titleText.includes("TT-NHNN") ||
          href.includes("tong-tu") ||
          href.includes("tt-nhnn")
        )
      ) {
        return;
      }

      const numMatch = titleText.match(/\d+\/\d{4}\/TT-NHNN/i) ??
                       titleText.match(/TT-NHNN\s+\d+\/\d{4}/i);
      const circularNumber = numMatch ? numMatch[0] : `SBV-${Date.now()}`;

      const category = classifyCircular(titleText);
      const today = new Date().toISOString().split("T")[0]!;

      circulars.push({
        title: titleText,
        circularNumber,
        issueDate: today,
        effectiveDate: today,
        category,
        summary: titleText.slice(0, 120),
      });
    });
  } catch (err) {
    logger.error("[sbvCircular] HTML parse error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const seen = new Set<string>();
  return circulars.filter((c) => {
    if (seen.has(c.circularNumber)) return false;
    seen.add(c.circularNumber);
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch and parse recent circulars from the State Bank of Vietnam (NHNN).
 *
 * Task 1225: Wrapped in breakers.sbvCircular so repeated timeouts or
 * connection errors open the circuit and stop log flooding.
 *
 * @param httpClient - Optional HTTP client for testing.
 * @returns Promise resolving to an array of SbvCircular (empty on error).
 */
export async function fetchSbvCirculars(httpClient?: HttpClient): Promise<SbvCircular[]> {
  if (!httpClient && !globalRateLimiter.canCall(HOST)) {
    logger.debug("[sbvCircular] rate-limited — skipping fetch", {
      waitMs: globalRateLimiter.getWaitMs(HOST),
    });
    return [];
  }

  const client = httpClient ?? (await makeDefaultHttpClient());

  if (!httpClient) globalRateLimiter.recordCall(HOST);

  try {
    logger.debug("[sbvCircular] fetching NHNN circulars", { url: CIRCULARS_URL });
    // Circuit breaker: after 5 consecutive failures opens the circuit and
    // skips fetches for resetTimeoutMs to prevent log flooding.
    const html = httpClient
      ? await client.get(CIRCULARS_URL)
      : await breakers.sbvCircular.execute(() => client.get(CIRCULARS_URL));
    const circulars = parseSbvHtml(html);
    logger.info("[sbvCircular] fetched NHNN circulars", { count: circulars.length });
    return circulars;
  } catch (err) {
    logger.error("[sbvCircular] failed to fetch NHNN circulars", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
