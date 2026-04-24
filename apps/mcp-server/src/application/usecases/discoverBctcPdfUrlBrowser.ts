/**
 * Task 1289f: Browser-based BCTC PDF URL discovery using Playwright
 *
 * Runs on VPS with Chromium to handle JavaScript-rendered portals.
 * Used by: bctc-historical-downloader.sh via Python wrapper
 */

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

async function defaultBrowserFetcher(url: string, timeout = 30000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "VN-Market-Intelligence/1.0 (+https://github.com/phamhung075/VN-Market-Intelligence-MCP)",
        Accept: "text/html,application/xhtml+xml,*/*",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}
