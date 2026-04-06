/**
 * Infrastructure — Weather VN Fetcher (Task 257)
 *
 * Fetches Vietnam weather warnings from:
 *   - Primary: NCHMF (nchmf.gov.vn) — national weather service
 *   - Secondary: Parse weather events from Vietnamese news text
 *   - ENSO: Detect El Niño / La Niña from NOAA public status text
 *
 * Layer: infrastructure/fetchers — may use HTTP, must not import domain/.
 */

import { logger } from "../logger.js";
import { globalRateLimiter } from "../../domain/services/rateLimiter.js";
import { CircuitBreaker } from "../circuitBreaker.js";

// Per-source circuit breakers (module-level singletons)
const nchmfBreaker = new CircuitBreaker("nchmf.gov.vn");

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type WeatherEventType =
  | "typhoon"
  | "flood"
  | "drought"
  | "heat_wave"
  | "cold_snap"
  | "el_nino"
  | "la_nina";

export type WeatherSeverity = "low" | "medium" | "high" | "critical";

export interface WeatherEvent {
  type: WeatherEventType;
  severity: WeatherSeverity;
  /** Affected provinces / regions */
  regions: string[];
  /** ISO date string of forecast */
  forecastDate: string;
  /** Human-readable impact duration, e.g. "48 giờ", "3-5 ngày" */
  impactDuration: string;
  /** Source description text */
  description: string;
}

// ---------------------------------------------------------------------------
// HTTP client interface (for injection in tests)
// ---------------------------------------------------------------------------

export interface WeatherHttpClient {
  get(url: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NCHMF_WARNING_URL =
  "https://nchmf.gov.vn/Kttv/vi-VN/1/canh-bao-thien-tai.html";
const NOAA_ENSO_URL =
  "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml";

/** Vietnamese province / region names for extraction */
const VN_PROVINCES = [
  "Hà Nội", "Hồ Chí Minh", "Đà Nẵng", "Hải Phòng",
  "Thanh Hóa", "Nghệ An", "Hà Tĩnh", "Quảng Bình", "Quảng Trị",
  "Thừa Thiên Huế", "Quảng Nam", "Quảng Ngãi", "Bình Định", "Phú Yên",
  "Khánh Hòa", "Ninh Thuận", "Bình Thuận",
  "Gia Lai", "Đắk Lắk", "Đắk Nông", "Kon Tum", "Lâm Đồng",
  "Cần Thơ", "An Giang", "Kiên Giang", "Cà Mau", "Bạc Liêu",
  "Sóc Trăng", "Trà Vinh", "Vĩnh Long", "Đồng Tháp", "Long An",
  "Tiền Giang", "Bến Tre", "Hậu Giang",
  "Lai Châu", "Điện Biên", "Sơn La", "Hòa Bình", "Yên Bái",
  "Lào Cai", "Hà Giang", "Cao Bằng", "Bắc Kạn", "Tuyên Quang",
  "Lạng Sơn", "Quảng Ninh", "Thái Nguyên",
  "Bắc Bộ", "Trung Bộ", "Nam Bộ", "Tây Nguyên",
  "miền Bắc", "miền Trung", "miền Nam",
];

// ---------------------------------------------------------------------------
// Default HTTP client
// ---------------------------------------------------------------------------

async function makeDefaultHttpClient(): Promise<WeatherHttpClient> {
  const axiosModule = await import("axios");
  const axios = axiosModule.default;
  return {
    async get(url: string): Promise<string> {
      const response = await axios.get<string>(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html, */*",
        },
        timeout: 15_000,
        responseType: "text",
      });
      return response.data;
    },
  };
}

// ---------------------------------------------------------------------------
// Text parsing utilities
// ---------------------------------------------------------------------------

/**
 * Extracts province/region names mentioned in the given text.
 */
function extractRegions(text: string): string[] {
  const found: string[] = [];
  for (const province of VN_PROVINCES) {
    if (text.includes(province)) {
      found.push(province);
    }
  }
  return [...new Set(found)];
}

/**
 * Maps Vietnamese severity keywords to a WeatherSeverity level.
 */
function mapSeverity(text: string): WeatherSeverity {
  const lower = text.toLowerCase();
  // Check for numeric level: cấp 4/5 = critical
  if (/cấp\s*(độ\s*)?(4|5|[4-5])/.test(lower) || /cấp\s*12|cấp\s*13|cấp\s*14|cấp\s*15/.test(lower)) {
    return "critical";
  }
  if (/cấp\s*(độ\s*)?(3)/.test(lower) || /nghiêm\s*trọng|đặc\s*biệt|rất\s*mạnh/.test(lower)) {
    return "high";
  }
  if (/cấp\s*(độ\s*)?(2)/.test(lower) || /mạnh|nguy\s*hiểm|khẩn\s*cấp/.test(lower)) {
    return "medium";
  }
  return "low";
}

/**
 * Extracts impact duration from text ("48 giờ", "3-5 ngày", etc.)
 */
function extractDuration(text: string): string {
  const durations = [
    /(\d+)\s*giờ\s*tới/,
    /(\d+[-–]\d+)\s*ngày/,
    /(\d+)\s*ngày\s*tới/,
    /trong\s*(\d+)\s*giờ/,
  ];
  for (const pattern of durations) {
    const m = text.match(pattern);
    if (m) return m[0];
  }
  return "không xác định";
}

/**
 * Pure function: parse WeatherEvent[] from any Vietnamese text.
 * Used as both the main parser and the news-text fallback.
 */
export async function parseWeatherEventsFromText(text: string): Promise<WeatherEvent[]> {
  const events: WeatherEvent[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // ── Typhoon / Bão ────────────────────────────────────────────────────────
  const typhoonPatterns = [
    /bão\s+(?:số\s+\d+|mạnh|[a-zA-Z]+)\b[^.]*?(?:cảnh\s*báo|cấp\s*độ)?[^.]*/gi,
    /áp\s*thấp\s*nhiệt\s*đới[^.]*/gi,
    /cơn\s*bão[^.]*/gi,
  ];
  for (const pattern of typhoonPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches.slice(0, 2)) {
        events.push({
          type: "typhoon",
          severity: mapSeverity(match + " " + text),
          regions: extractRegions(text),
          forecastDate: today,
          impactDuration: extractDuration(text),
          description: match.trim().slice(0, 200),
        });
        break;
      }
      break;
    }
  }

  // ── Flood / Lũ lụt ──────────────────────────────────────────────────────
  const floodPatterns = [
    /lũ\s+(?:lớn|lụt|khẩn\s*cấp|lịch\s*sử)[^.]*/gi,
    /ngập\s*lụt\s*nghiêm\s*trọng[^.]*/gi,
    /mực\s*nước\s*vượt\s*báo\s*động[^.]*/gi,
  ];
  for (const pattern of floodPatterns) {
    const match = text.match(pattern);
    if (match) {
      events.push({
        type: "flood",
        severity: mapSeverity(match[0] + " " + text),
        regions: extractRegions(text),
        forecastDate: today,
        impactDuration: extractDuration(text),
        description: match[0].trim().slice(0, 200),
      });
      break;
    }
  }

  // ── Drought / Hạn hán ───────────────────────────────────────────────────
  const droughtPatterns = [
    /hạn\s*hán\s*(?:nghiêm\s*trọng|kéo\s*dài|nặng)[^.]*/gi,
    /thiếu\s*nước\s*(?:tưới|ngọt|sinh\s*hoạt)[^.]*/gi,
    /nguy\s*cơ\s*hạn\s*hán[^.]*/gi,
  ];
  for (const pattern of droughtPatterns) {
    const match = text.match(pattern);
    if (match) {
      events.push({
        type: "drought",
        severity: mapSeverity(match[0] + " " + text),
        regions: extractRegions(text),
        forecastDate: today,
        impactDuration: extractDuration(text),
        description: match[0].trim().slice(0, 200),
      });
      break;
    }
  }

  // ── Heat wave / Nắng nóng ───────────────────────────────────────────────
  const heatPatterns = [
    /nắng\s*nóng\s*(?:gay\s*gắt|đặc\s*biệt|cực\s*đoan)[^.]*/gi,
    /nhiệt\s*độ\s*cao\s*nhất\s*\d+[-–]\d+°[^.]*/gi,
    /cảnh\s*báo\s*nắng\s*nóng[^.]*/gi,
  ];
  for (const pattern of heatPatterns) {
    const match = text.match(pattern);
    if (match) {
      events.push({
        type: "heat_wave",
        severity: mapSeverity(match[0] + " " + text),
        regions: extractRegions(text),
        forecastDate: today,
        impactDuration: extractDuration(text),
        description: match[0].trim().slice(0, 200),
      });
      break;
    }
  }

  // ── Cold snap / Rét đậm ─────────────────────────────────────────────────
  const coldPatterns = [
    /rét\s*đậm\s*(?:rét\s*hại|kéo\s*dài|gay\s*gắt)[^.]*/gi,
    /không\s*khí\s*lạnh\s*(?:mạnh|tăng\s*cường)[^.]*/gi,
    /băng\s*giá\s*xuất\s*hiện[^.]*/gi,
  ];
  for (const pattern of coldPatterns) {
    const match = text.match(pattern);
    if (match) {
      events.push({
        type: "cold_snap",
        severity: mapSeverity(match[0] + " " + text),
        regions: extractRegions(text),
        forecastDate: today,
        impactDuration: extractDuration(text),
        description: match[0].trim().slice(0, 200),
      });
      break;
    }
  }

  return events;
}

/**
 * Pure function: detect ENSO phase from NOAA status text.
 * Returns a WeatherEvent if El Niño or La Niña is active, null otherwise.
 */
export function detectEnsoFromText(text: string): WeatherEvent | null {
  const today = new Date().toISOString().slice(0, 10);

  // El Niño detection
  const elNinoPatterns = [
    /el\s*ni[ñn]o\s+(?:conditions\s+are\s+present|advisory|alert|watch)/i,
    /el\s*ni[ñn]o\s+episode\s+(?:is|has)/i,
    /sst\s+anomalies\s+(?:are\s+)?\+[\d.]+/i,
    /warm\s+episode\s+(?:el\s*ni[ñn]o)/i,
  ];
  for (const pattern of elNinoPatterns) {
    if (pattern.test(text)) {
      // Extract SST anomaly for severity
      const sstMatch = text.match(/\+([\d.]+)°?C/i);
      const sst = sstMatch?.[1] != null ? parseFloat(sstMatch[1]) : 0;
      const severity: WeatherSeverity = sst >= 2.0 ? "critical" : sst >= 1.5 ? "high" : sst >= 1.0 ? "medium" : "low";
      return {
        type: "el_nino",
        severity,
        regions: ["Đông Nam Á", "Việt Nam"],
        forecastDate: today,
        impactDuration: "3-6 tháng",
        description: `El Niño đang hoạt động — SST anomaly: +${sst.toFixed(1)}°C. Nguy cơ hạn hán tại Việt Nam.`,
      };
    }
  }

  // La Niña detection
  const laNinaPatterns = [
    /la\s*ni[ñn]a\s+(?:conditions\s+(?:are\s+)?(?:present|have\s+developed)|advisory|alert|watch)/i,
    /la\s*ni[ñn]a\s+episode\s+(?:is|has)/i,
    /cooler\s+than\s+normal\s+sst/i,
    /cold\s+episode\s+(?:la\s*ni[ñn]a)/i,
  ];
  for (const pattern of laNinaPatterns) {
    if (pattern.test(text)) {
      const sstMatch = text.match(/-([\d.]+)°?C/i);
      const sst = sstMatch?.[1] != null ? parseFloat(sstMatch[1]) : 0;
      const severity: WeatherSeverity = sst >= 1.5 ? "high" : sst >= 1.0 ? "medium" : "low";
      return {
        type: "la_nina",
        severity,
        regions: ["Đông Nam Á", "Việt Nam"],
        forecastDate: today,
        impactDuration: "3-6 tháng",
        description: `La Niña đang hoạt động — SST anomaly: -${sst.toFixed(1)}°C. Nguy cơ mưa lũ gia tăng.`,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main public API
// ---------------------------------------------------------------------------

/**
 * Fetches active weather warnings for Vietnam.
 *
 * Sources:
 *   1. NCHMF website (nchmf.gov.vn) — parse warnings from HTML
 *   2. NOAA ENSO status — detect El Niño / La Niña
 *
 * Circuit breaker + rate limiter. Never throws.
 *
 * @param httpClient - Injected HTTP client (test mode). If omitted, real network is used.
 * @returns Array of WeatherEvent (may be empty on failure).
 */
export async function fetchWeatherWarnings(
  httpClient?: WeatherHttpClient,
): Promise<WeatherEvent[]> {
  const events: WeatherEvent[] = [];

  // Rate limit guard (skip in test mode)
  if (!httpClient && !globalRateLimiter.canCall("nchmf.gov.vn")) {
    logger.debug("[weatherVn] rate-limited", {
      waitMs: globalRateLimiter.getWaitMs("nchmf.gov.vn"),
    });
    return [];
  }

  const client = httpClient ?? (await makeDefaultHttpClient());
  if (!httpClient) globalRateLimiter.recordCall("nchmf.gov.vn");

  // ── Source 1: NCHMF warning page ─────────────────────────────────────────
  try {
    const html = await nchmfBreaker.execute(() => client.get(NCHMF_WARNING_URL));
    const nchmfEvents = await parseWeatherEventsFromText(html);
    events.push(...nchmfEvents);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // NCHMF URL path frequently 404s — the portal restructures pages often.
    // Demote 404 to debug so it doesn't spam the warning log every 15 min.
    const is404 = /status code 404|404/i.test(msg);
    if (is404) {
      logger.debug("[weatherVn] NCHMF URL 404 (known fragile endpoint)", {
        url: NCHMF_WARNING_URL,
      });
    } else {
      logger.warn("[weatherVn] NCHMF fetch failed", { error: msg });
    }
  }

  // ── Source 2: NOAA ENSO status ────────────────────────────────────────────
  try {
    const ensoHtml = await client.get(NOAA_ENSO_URL);
    const ensoEvent = detectEnsoFromText(ensoHtml);
    if (ensoEvent) {
      events.push(ensoEvent);
    }
  } catch (err) {
    logger.debug("[weatherVn] NOAA ENSO fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info("[weatherVn] fetched weather events", { count: events.length });
  return events;
}
