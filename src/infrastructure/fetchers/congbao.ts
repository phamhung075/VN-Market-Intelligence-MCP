/**
 * Infrastructure — Công Báo Fetcher (Task 242)
 *
 * Scrapes congbao.chinhphu.vn for new Nghị định, Thông tư, Quyết định.
 * Uses Cheerio HTML parsing with rate limiter pattern.
 *
 * Layer: infrastructure/fetchers — may use HTTP libs, must not import domain services.
 *
 * Error handling: never throws — returns [] on any error.
 */

import * as cheerio from "cheerio";
import { logger } from "../logger.js";
import { globalRateLimiter } from "../../domain/services/rateLimiter.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PolicyDocument {
  title: string;
  documentNumber: string;
  issueDate: string;
  category: string;
  fullTextUrl: string;
  summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = "https://congbao.chinhphu.vn";
const SEARCH_URL = `${BASE_URL}/noi-dung-van-ban-so`;
const HOST = "congbao.chinhphu.vn";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ─────────────────────────────────────────────────────────────────────────────
// HTTP client interface (injectable for tests)
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

function parseCongBaoHtml(html: string): PolicyDocument[] {
  const documents: PolicyDocument[] = [];

  try {
    const $ = cheerio.load(html);

    $("a[href]").each((_i, el) => {
      const href = $(el).attr("href") ?? "";
      const titleText = $(el).text().trim();

      if (
        !titleText ||
        titleText.length < 10 ||
        !(
          titleText.includes("Nghị định") ||
          titleText.includes("Thông tư") ||
          titleText.includes("Quyết định") ||
          titleText.includes("Chỉ thị") ||
          href.includes("/van-ban/")
        )
      ) {
        return;
      }

      let category = "Văn bản";
      if (titleText.includes("Nghị định")) category = "Nghị định";
      else if (titleText.includes("Thông tư")) category = "Thông tư";
      else if (titleText.includes("Quyết định")) category = "Quyết định";
      else if (titleText.includes("Chỉ thị")) category = "Chỉ thị";

      const docNumberMatch = titleText.match(/\d+\/\d{4}\/[\w-]+/);
      const documentNumber = docNumberMatch ? docNumberMatch[0] : "";

      const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

      documents.push({
        title: titleText,
        documentNumber,
        issueDate: new Date().toISOString().split("T")[0]!,
        category,
        fullTextUrl: fullUrl,
        summary: titleText.slice(0, 120),
      });
    });
  } catch (err) {
    logger.error("[congbao] HTML parse error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const seen = new Set<string>();
  return documents.filter((doc) => {
    const key = doc.documentNumber || doc.fullTextUrl;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch and parse recent policy documents from Công Báo Chính Phủ.
 *
 * @param httpClient - Optional HTTP client for testing.
 * @returns Promise resolving to an array of PolicyDocument (empty on error).
 */
export async function fetchCongBao(httpClient?: HttpClient): Promise<PolicyDocument[]> {
  if (!httpClient && !globalRateLimiter.canCall(HOST)) {
    logger.debug("[congbao] rate-limited — skipping fetch", {
      waitMs: globalRateLimiter.getWaitMs(HOST),
    });
    return [];
  }

  const client = httpClient ?? (await makeDefaultHttpClient());

  if (!httpClient) globalRateLimiter.recordCall(HOST);

  try {
    logger.debug("[congbao] fetching policy documents", { url: SEARCH_URL });
    const html = await client.get(SEARCH_URL);
    const documents = parseCongBaoHtml(html);
    logger.info("[congbao] fetched policy documents", { count: documents.length });
    return documents;
  } catch (err) {
    logger.error("[congbao] failed to fetch policy documents", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
