/**
 * Infrastructure — Hydrological Data Fetcher (Task 258)
 *
 * Fetches reservoir levels for major Vietnam hydropower plants.
 *
 * Strategy:
 *   - Primary: EVN public data page (if accessible)
 *   - Fallback: Pattern extraction from Vietnamese news text
 *
 * Pattern matching:
 *   "mực nước hồ X đạt Y%"
 *   "hồ thủy điện X ... Y%"
 *   "hồ X đạt Y% dung tích"
 *
 * Key reservoirs: Hòa Bình, Sơn La, Lai Châu, Trị An, Ialy, Sông Hinh
 *
 * Layer: infrastructure/fetchers — may use HTTP, must not import domain/.
 */

import { logger } from "../logger.js";
import { globalRateLimiter } from "../../domain/services/rateLimiter.js";
import { CircuitBreaker } from "../circuitBreaker.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ReservoirLevel {
  /** Reservoir name (e.g. "Hòa Bình", "Sơn La") */
  name: string;
  /**
   * Current water level in meters above sea level.
   * 0 when unavailable (pattern-based extraction may not have this).
   */
  currentLevel: number;
  /** Capacity as percentage (0–100) */
  capacityPct: number;
  /** Water level trend direction */
  trend: "rising" | "falling" | "stable";
  /** ISO date string */
  date: string;
}

// ---------------------------------------------------------------------------
// HTTP client interface
// ---------------------------------------------------------------------------

export interface HydroHttpClient {
  get(url: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Key Vietnam reservoirs — canonical names used in news */
const KEY_RESERVOIRS = [
  "Hòa Bình",
  "Sơn La",
  "Lai Châu",
  "Trị An",
  "Ialy",
  "Ia Ly",
  "Sông Hinh",
  "Thác Bà",
  "Tuyên Quang",
  "Bản Vẽ",
] as const;

/** News source for reservoir data extraction */
const RESERVOIR_NEWS_URL =
  "https://vneconomy.vn/nang-luong.rss";

// Circuit breaker
const hydroBreaker = new CircuitBreaker("hydro.evn.com.vn");

// ---------------------------------------------------------------------------
// Default HTTP client
// ---------------------------------------------------------------------------

async function makeDefaultHttpClient(): Promise<HydroHttpClient> {
  const axiosModule = await import("axios");
  const axios = axiosModule.default;
  return {
    async get(url: string): Promise<string> {
      const response = await axios.get<string>(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html, application/rss+xml, */*",
        },
        timeout: 15_000,
        responseType: "text",
      });
      return response.data;
    },
  };
}

// ---------------------------------------------------------------------------
// Parsing utilities
// ---------------------------------------------------------------------------

/**
 * Determines trend direction from surrounding text context.
 */
function detectTrend(context: string): "rising" | "falling" | "stable" {
  const lower = context.toLowerCase();
  // Rising indicators
  if (
    /đang\s*tăng|mực\s*nước\s*tăng|tăng\s*dần|nước\s*về\s*nhiều|thêm\s*nước/.test(lower)
  ) {
    return "rising";
  }
  // Falling indicators
  if (
    /đang\s*giảm|mực\s*nước\s*giảm|giảm\s*dần|không\s*có\s*mưa|thiếu\s*nước|cạn\s*dần/.test(
      lower,
    )
  ) {
    return "falling";
  }
  return "stable";
}

/**
 * Pure function: extract reservoir levels from Vietnamese text.
 * Handles multiple reservoir mentions in a single text block.
 *
 * Patterns matched:
 *   - "mực nước hồ X đạt Y%"
 *   - "hồ [thủy điện] X [đạt/ở mức/đang ở] Y%"
 *   - "hồ X Y% dung tích"
 */
export function extractReservoirLevelsFromText(text: string): ReservoirLevel[] {
  const results: ReservoirLevel[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();

  for (const reservoir of KEY_RESERVOIRS) {
    // Normalise alias: Ia Ly → Ialy
    const canonicalName = reservoir === "Ia Ly" ? "Ialy" : reservoir;
    if (seen.has(canonicalName)) continue;

    // Build a context window around the reservoir name
    const escapedName = reservoir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Pattern 1: "mực nước hồ X đạt Y%"
    const p1 = new RegExp(
      `mực\\s*nước\\s*hồ\\s+${escapedName}[^.]{0,60}?\\b(\\d{1,3})\\s*%`,
      "i",
    );
    // Pattern 2: "hồ [thủy điện] X [đạt/ở mức] Y%"
    const p2 = new RegExp(
      `hồ\\s+(?:thủy\\s*điện\\s+)?${escapedName}[^.]{0,80}?\\b(\\d{1,3})\\s*%`,
      "i",
    );
    // Pattern 3: "X đạt Y% dung tích" or "X Y% công suất"
    const p3 = new RegExp(
      `${escapedName}[^.]{0,40}?\\b(\\d{1,3})\\s*%\\s*(?:dung\\s*tích|công\\s*suất|thiết\\s*kế)`,
      "i",
    );

    let capacityPct: number | null = null;
    let matchedContext = "";

    for (const pattern of [p1, p2, p3]) {
      const m = text.match(pattern);
      if (m) {
        const pct = parseInt(m[1], 10);
        if (pct >= 0 && pct <= 100) {
          capacityPct = pct;
          matchedContext = m[0];
          break;
        }
      }
    }

    if (capacityPct === null) continue;

    // Extract broader context (200 chars around the match) for trend detection
    const idx = text.indexOf(matchedContext);
    const contextWindow = text.slice(Math.max(0, idx - 30), idx + matchedContext.length + 60);

    seen.add(canonicalName);
    results.push({
      name: canonicalName,
      currentLevel: 0, // meters not available from news text
      capacityPct,
      trend: detectTrend(contextWindow),
      date: today,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main public API
// ---------------------------------------------------------------------------

/**
 * Fetches current reservoir levels for major Vietnam hydropower plants.
 *
 * Uses news text extraction as the primary method (EVN API not publicly available).
 * Never throws. Circuit breaker + rate limiter.
 *
 * @param httpClient - Injected HTTP client (test mode).
 * @returns Array of ReservoirLevel entries.
 */
export async function fetchReservoirLevels(
  httpClient?: HydroHttpClient,
): Promise<ReservoirLevel[]> {
  // Rate limit guard
  if (!httpClient && !globalRateLimiter.canCall("hydro.evn.com.vn")) {
    logger.debug("[hydrologicalData] rate-limited", {
      waitMs: globalRateLimiter.getWaitMs("hydro.evn.com.vn"),
    });
    return [];
  }

  const client = httpClient ?? (await makeDefaultHttpClient());
  if (!httpClient) globalRateLimiter.recordCall("hydro.evn.com.vn");

  const allText: string[] = [];

  // ── Fetch news RSS for reservoir data ──────────────────────────────────────
  try {
    const text = await hydroBreaker.execute(() => client.get(RESERVOIR_NEWS_URL));
    allText.push(text);
  } catch (err) {
    logger.warn("[hydrologicalData] failed to fetch news source", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Also check if caller passed raw HTML directly ──────────────────────────
  const combinedText = allText.join("\n");
  if (!combinedText.trim()) {
    logger.info("[hydrologicalData] no text content retrieved");
    return [];
  }

  const levels = extractReservoirLevelsFromText(combinedText);
  logger.info("[hydrologicalData] extracted reservoir levels", {
    count: levels.length,
    names: levels.map((r) => r.name),
  });
  return levels;
}
