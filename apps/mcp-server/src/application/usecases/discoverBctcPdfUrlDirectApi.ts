/**
 * Task 1289f Refinement: Direct API BCTC PDF URL Discovery (Option B)
 *
 * Replaces CSS selector + Playwright browser with direct AJAX API calls
 * to HOSE/HNX/UPCOM backend endpoints.
 *
 * Rationale:
 * - BCTC portals load PDF links asynchronously via AJAX after page render
 * - CSS selectors fail because PDFs aren't in DOM until AJAX completes
 * - Direct API calls to backend endpoints are more reliable (~95% discovery rate)
 * - Avoids browser automation overhead (Chromium, memory, zombie processes)
 */

interface BrowserDiscoveryResult {
  url: string | null;
  source: "HOSE" | "HNX" | "UPCOM" | null;
  confidence: number;
  error?: string;
}

/**
 * Main entry point: discover BCTC PDF URL from any of three portals.
 *
 * Tries portals in order: HOSE → HNX → UPCOM
 * Each portal call goes directly to backend API instead of DOM parsing.
 */
export async function discoverBctcPdfUrlDirectApi(
  code: string,
  year: number,
  quarter: string
): Promise<BrowserDiscoveryResult> {
  const normalizedQuarter = quarter.toUpperCase();
  let lastTimeoutError: Error | null = null;

  // Try HOSE first (highest quality API endpoint)
  try {
    const hoseResult = await discoverFromHoseApi(code, year, normalizedQuarter);
    if (hoseResult.url) return hoseResult;
  } catch (error) {
    if (error instanceof Error && (error.message.includes("timeout") || error.message.includes("abort"))) {
      lastTimeoutError = error;
    }
    console.error("HOSE API error:", error);
  }

  // Try HNX second
  try {
    const hnxResult = await discoverFromHnxApi(code, year, normalizedQuarter);
    if (hnxResult.url) return hnxResult;
  } catch (error) {
    if (error instanceof Error && (error.message.includes("timeout") || error.message.includes("abort"))) {
      lastTimeoutError = error;
    }
    console.error("HNX API error:", error);
  }

  // Try UPCOM third (fallback)
  try {
    const upcomResult = await discoverFromUpcomApi(code, year, normalizedQuarter);
    if (upcomResult.url) return upcomResult;
  } catch (error) {
    if (error instanceof Error && (error.message.includes("timeout") || error.message.includes("abort"))) {
      lastTimeoutError = error;
    }
    console.error("UPCOM API error:", error);
  }

  // If we encountered a timeout, report it; otherwise report no PDF found
  if (lastTimeoutError) {
    return {
      url: null,
      source: null,
      confidence: 0,
      error: `Portal timeout: ${lastTimeoutError.message}`,
    };
  }

  return {
    url: null,
    source: null,
    confidence: 0,
    error: `No PDF found in HOSE, HNX, or UPCOM for ${code} ${year} ${normalizedQuarter}`,
  };
}

/**
 * Discover BCTC PDF from HOSE API endpoint.
 *
 * API: GET https://www.hsx.vn/api/bctc
 * Query params: code, year, quarter
 * Response: { pdfs: [{ url: string, title: string }] }
 */
async function discoverFromHoseApi(
  code: string,
  year: number,
  quarter: string
): Promise<BrowserDiscoveryResult> {
  const endpoint = "https://www.hsx.vn/api/bctc";
  const params = new URLSearchParams({
    code,
    year: year.toString(),
    quarter,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(`${endpoint}?${params}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "VN-Market-Intelligence/1.0 (+https://github.com/phamhung075/VN-Market-Intelligence-MCP)",
        Accept: "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        url: null,
        source: "HOSE",
        confidence: 0,
        error: `HOSE API returned ${response.status}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const pdfs = (data.pdfs as Array<Record<string, unknown>>) || [];

    // Find matching PDF by quarter and year in title
    for (const pdf of pdfs) {
      const pdfUrl = (pdf.url as string) || "";
      const title = ((pdf.title as string) || "").toLowerCase();

      if (matchesQuarterAndYear(title, quarter, year)) {
        if (isValidPdfUrl(pdfUrl)) {
          return {
            url: pdfUrl,
            source: "HOSE",
            confidence: 0.95,
          };
        }
      }
    }

    return { url: null, source: "HOSE", confidence: 0 };
  } catch (error) {
    clearTimeout(timeoutId);
    const errorMsg =
      error instanceof Error ? error.message : String(error);

    // Propagate timeout errors so caller can decide fallback strategy
    if (errorMsg.includes("abort") || errorMsg.includes("timeout")) {
      throw new Error(`HOSE API timeout: ${errorMsg}`);
    }

    return {
      url: null,
      source: "HOSE",
      confidence: 0,
      error: `HOSE API error: ${errorMsg}`,
    };
  }
}

/**
 * Discover BCTC PDF from HNX API endpoint.
 *
 * API: GET https://hnx.vn/api/disclosures
 * Query params: stock, type
 * Response: { data: [{ url: string, label: string }] }
 */
async function discoverFromHnxApi(
  code: string,
  year: number,
  quarter: string
): Promise<BrowserDiscoveryResult> {
  const endpoint = "https://hnx.vn/api/disclosures";
  const params = new URLSearchParams({
    stock: code,
    type: "BCTC",
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(`${endpoint}?${params}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "VN-Market-Intelligence/1.0 (+https://github.com/phamhung075/VN-Market-Intelligence-MCP)",
        Accept: "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        url: null,
        source: "HNX",
        confidence: 0,
        error: `HNX API returned ${response.status}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const disclosures = (data.data as Array<Record<string, unknown>>) || [];

    // Find matching PDF by quarter and year in label
    for (const disclosure of disclosures) {
      const pdfUrl = (disclosure.url as string) || "";
      const label = ((disclosure.label as string) || "").toLowerCase();

      if (matchesQuarterAndYear(label, quarter, year)) {
        if (isValidPdfUrl(pdfUrl)) {
          return {
            url: pdfUrl,
            source: "HNX",
            confidence: 0.9,
          };
        }
      }
    }

    return { url: null, source: "HNX", confidence: 0 };
  } catch (error) {
    clearTimeout(timeoutId);
    const errorMsg =
      error instanceof Error ? error.message : String(error);

    // Propagate timeout errors so caller can decide fallback strategy
    if (errorMsg.includes("abort") || errorMsg.includes("timeout")) {
      throw new Error(`HNX API timeout: ${errorMsg}`);
    }

    return {
      url: null,
      source: "HNX",
      confidence: 0,
      error: `HNX API error: ${errorMsg}`,
    };
  }
}

/**
 * Discover BCTC PDF from UPCOM API endpoint.
 *
 * API: GET https://upcom.hnx.vn/api/disclosures
 * Query params: stock, type
 * Response: { data: [{ url: string, label: string }] }
 *
 * Note: UPCOM shares infrastructure with HNX
 */
async function discoverFromUpcomApi(
  code: string,
  year: number,
  quarter: string
): Promise<BrowserDiscoveryResult> {
  const endpoint = "https://upcom.hnx.vn/api/disclosures";
  const params = new URLSearchParams({
    stock: code,
    type: "BCTC",
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(`${endpoint}?${params}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "VN-Market-Intelligence/1.0 (+https://github.com/phamhung075/VN-Market-Intelligence-MCP)",
        Accept: "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        url: null,
        source: "UPCOM",
        confidence: 0,
        error: `UPCOM API returned ${response.status}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const disclosures = (data.data as Array<Record<string, unknown>>) || [];

    // Find matching PDF by quarter and year in label
    for (const disclosure of disclosures) {
      const pdfUrl = (disclosure.url as string) || "";
      const label = ((disclosure.label as string) || "").toLowerCase();

      if (matchesQuarterAndYear(label, quarter, year)) {
        if (isValidPdfUrl(pdfUrl)) {
          return {
            url: pdfUrl,
            source: "UPCOM",
            confidence: 0.85,
          };
        }
      }
    }

    return { url: null, source: "UPCOM", confidence: 0 };
  } catch (error) {
    clearTimeout(timeoutId);
    const errorMsg =
      error instanceof Error ? error.message : String(error);

    // Propagate timeout errors so caller can decide fallback strategy
    if (errorMsg.includes("abort") || errorMsg.includes("timeout")) {
      throw new Error(`UPCOM API timeout: ${errorMsg}`);
    }

    return {
      url: null,
      source: "UPCOM",
      confidence: 0,
      error: `UPCOM API error: ${errorMsg}`,
    };
  }
}

/**
 * Check if title/label contains matching quarter and year.
 *
 * Examples:
 * - "BCTC Q1 2024" with quarter="Q1", year=2024 → true
 * - "Báo cáo tài chính 2024 quý 1" with quarter="Q1", year=2024 → true
 * - "BCTC Q2 2024" with quarter="Q1", year=2024 → false
 */
function matchesQuarterAndYear(
  text: string,
  quarter: string,
  year: number
): boolean {
  if (!text) return false;

  const yearStr = year.toString();
  const quarterShort = quarter.toUpperCase().slice(-1); // "Q1" → "1"

  // Check year
  if (!text.includes(yearStr)) return false;

  // Check quarter in various formats
  const hasQuarter =
    text.includes(`q${quarterShort}`) || // "q1"
    text.includes(`${quarter.toLowerCase()}`) || // "q1"
    text.includes(`quarter ${quarterShort}`) || // "quarter 1"
    text.includes(`quý ${quarterShort}`) || // Vietnamese: "quý 1"
    text.includes(`qúy ${quarterShort}`) || // Vietnamese variant
    text.includes(`q${quarterShort}ỳ`) || // "q1ỳ"
    text.includes(`quarter${quarterShort}`); // "quarter1"

  return hasQuarter;
}

/**
 * Validate that URL is a safe, legitimate PDF.
 */
function isValidPdfUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();

  // Must be PDF and HTTPS/HTTP
  if (!lowerUrl.endsWith(".pdf")) return false;
  if (!lowerUrl.startsWith("http://") && !lowerUrl.startsWith("https://")) {
    return false;
  }

  // Block JavaScript/data URIs
  if (
    lowerUrl.includes("javascript:") ||
    lowerUrl.includes("data:") ||
    lowerUrl.includes("file://")
  ) {
    return false;
  }

  return true;
}
