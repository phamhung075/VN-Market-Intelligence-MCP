/**
 * Task 1289f: Browser-based BCTC PDF URL discovery using Playwright
 *
 * Task 1822d-a: Migrated Playwright execution from VPS to local mcp-server Docker.
 * The defaultBrowserFetcher now uses chromiumFetchPage (infrastructure/fetchers)
 * instead of calling the VPS HTTP proxy endpoint.
 *
 * Used by: bctcReparseJob and any usecase that needs PDF URL discovery.
 */

import { chromiumFetchPage } from "../../infrastructure/fetchers/chromiumPageFetcher.js";

interface BrowserDiscoveryResult {
  url: string | null;
  source: "HOSE" | "HNX" | "UPCOM" | null;
  confidence: number;
  error?: string;
}

export async function discoverBctcPdfUrlWithBrowser(
  code: string,
  year: number,
  quarter: string,
  browserFetcher?: (url: string, timeout?: number) => Promise<string>
): Promise<BrowserDiscoveryResult> {
  const fetcher = browserFetcher || defaultBrowserFetcher;
  const normalizedQuarter = quarter.toUpperCase();

  // Try HOSE first
  const hoseResult = await tryHoseBrowser(code, year, normalizedQuarter, fetcher);
  if (hoseResult.url) return hoseResult;

  // Try HNX
  const hnxResult = await tryHnxBrowser(code, year, normalizedQuarter, fetcher);
  if (hnxResult.url) return hnxResult;

  // Try UPCOM
  const upcomResult = await tryUpcomBrowser(code, year, normalizedQuarter, fetcher);
  if (upcomResult.url) return upcomResult;

  return { url: null, source: null, confidence: 0, error: "No PDF found in any portal" };
}

async function tryHoseBrowser(
  code: string,
  year: number,
  quarter: string,
  fetcher: (url: string, timeout?: number) => Promise<string>
): Promise<BrowserDiscoveryResult> {
  try {
    const portalUrl = `https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=${code}`;
    const html = await fetcher(portalUrl, 30000);

    // Match PDF links with quarter/year in nearby text
    const lines = html.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || "";
      const hrefMatch = line.match(/href="([^"]*\.pdf[^"]*)"/i);
      if (hrefMatch) {
        const context = [
          lines[i - 1] || "",
          line,
          lines[i + 1] || "",
          lines[i + 2] || "",
        ].join(" ");

        if (
          context.toLowerCase().includes("bctc") &&
          context.includes(quarter) &&
          context.includes(year.toString())
        ) {
          const pdfPath = hrefMatch[1] || "";
          const fullUrl = resolveRelativeUrl(pdfPath, "https://www.hsx.vn");
          if (isValidPdfUrl(fullUrl)) {
            return { url: fullUrl, source: "HOSE", confidence: 0.95 };
          }
        }
      }
    }

    return { url: null, source: "HOSE", confidence: 0 };
  } catch (error) {
    return {
      url: null,
      source: "HOSE",
      confidence: 0,
      error: `HOSE browser fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function tryHnxBrowser(
  code: string,
  year: number,
  quarter: string,
  fetcher: (url: string, timeout?: number) => Promise<string>
): Promise<BrowserDiscoveryResult> {
  try {
    const portalUrl = `https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=${code}`;
    const html = await fetcher(portalUrl, 30000);

    const lines = html.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || "";
      const hrefMatch = line.match(/href="([^"]*\.pdf[^"]*)"/i);
      if (hrefMatch) {
        const context = [
          lines[i - 1] || "",
          line,
          lines[i + 1] || "",
          lines[i + 2] || "",
        ].join(" ");

        if (
          (context.toLowerCase().includes("bctc") ||
            context.toLowerCase().includes("bc/bđhs")) &&
          (context.includes(quarter) || context.includes(year.toString()))
        ) {
          const pdfPath = hrefMatch[1] || "";
          const fullUrl = resolveRelativeUrl(pdfPath, "https://hnx.vn");
          if (isValidPdfUrl(fullUrl)) {
            return { url: fullUrl, source: "HNX", confidence: 0.9 };
          }
        }
      }
    }

    return { url: null, source: "HNX", confidence: 0 };
  } catch (error) {
    return {
      url: null,
      source: "HNX",
      confidence: 0,
      error: `HNX browser fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function tryUpcomBrowser(
  code: string,
  year: number,
  quarter: string,
  fetcher: (url: string, timeout?: number) => Promise<string>
): Promise<BrowserDiscoveryResult> {
  try {
    const portalUrl = `https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=${code}`;
    const html = await fetcher(portalUrl, 30000);

    const lines = html.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || "";
      const hrefMatch = line.match(/href="([^"]*\.pdf[^"]*)"/i);
      if (hrefMatch) {
        const context = [
          lines[i - 1] || "",
          line,
          lines[i + 1] || "",
          lines[i + 2] || "",
        ].join(" ");

        if (
          (context.toLowerCase().includes("bctc") ||
            context.toLowerCase().includes("bc/bđhs")) &&
          (context.includes(quarter) || context.includes(year.toString()))
        ) {
          const pdfPath = hrefMatch[1] || "";
          const fullUrl = resolveRelativeUrl(pdfPath, "https://upcom.hnx.vn");
          if (isValidPdfUrl(fullUrl)) {
            return { url: fullUrl, source: "UPCOM", confidence: 0.85 };
          }
        }
      }
    }

    return { url: null, source: "UPCOM", confidence: 0 };
  } catch (error) {
    return {
      url: null,
      source: "UPCOM",
      confidence: 0,
      error: `UPCOM browser fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function resolveRelativeUrl(path: string | undefined, baseUrl: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (path.startsWith("/")) {
    const base = new URL(baseUrl);
    return `${base.protocol}//${base.host}${path}`;
  }
  let base = baseUrl;
  if (!base.endsWith("/")) {
    base += "/";
  }
  return base + path;
}

function isValidPdfUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  if (!lowerUrl.includes(".pdf")) return false;
  if (!lowerUrl.startsWith("http://") && !lowerUrl.startsWith("https://")) return false;
  if (lowerUrl.includes("javascript:") || lowerUrl.includes("data:") || lowerUrl.includes("file://")) return false;
  return true;
}

/**
 * Default browser fetcher — uses local Playwright/Chromium (mcp-server Docker).
 * Replaces the former plain-HTTP fetch; handles JavaScript-rendered portals
 * (hsx.vn, hnx.vn, upcom.hnx.vn) that return skeleton HTML without a real browser.
 *
 * Task 1822d-a: No VPS HTTP proxy call. Playwright runs on the local server.
 */
async function defaultBrowserFetcher(url: string, timeout = 30000): Promise<string> {
  return chromiumFetchPage(url, timeout);
}
