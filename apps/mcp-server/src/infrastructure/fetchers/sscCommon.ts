/**
 * Infrastructure — SSC / Exchange Disclosure Portal Shared Plumbing
 *
 * Shared types, HTTP client factory, and title-matching helper used by the
 * SSC-first fetcher (sscPortal.ts) and its exchange-portal fallbacks
 * (hoseDisclosure.ts, hnxDisclosure.ts, upcomDisclosure.ts).
 *
 * Split out of ssc.ts (FACTORY-INFRA-split-ssc-fetchers, 2026-07-24) —
 * pure structural move, no behavior change. `ssc.ts` re-exports the
 * pre-split public surface so existing call sites are unaffected.
 *
 * Layer: infrastructure/fetchers — may use HTTP, must not import domain/.
 */

import https from "node:https";

// ---------------------------------------------------------------------------
// TLS agent
// ---------------------------------------------------------------------------

/**
 * Shared HTTPS agent that skips certificate verification.
 *
 * Vietnamese government sites (hnx.vn, upcom.hnx.vn, hsx.vn, congbothongtin.ssc.gov.vn)
 * frequently serve incomplete certificate chains that fail OpenSSL validation.
 * Since we only fetch public disclosure HTML/PDF from these known hosts, bypassing
 * TLS verification is acceptable and prevents the recurring "unable to verify
 * the first certificate" errors (report #1101).
 */
const tlsPermissiveAgent = new https.Agent({ rejectUnauthorized: false });

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A single document entry returned by the SSC portal.
 */
export interface SscDocument {
  /** Document title as shown on the portal. */
  title: string;
  /** Absolute URL to the document (PDF or HTML). */
  url: string;
  /** Publication date string as found on the page (e.g. "15/04/2025"). */
  publishedAt: string;
  /** Report type passed to listSscDocuments: 'quarterly' | 'annual'. */
  reportType: string;
}

/**
 * Minimal HTTP client interface — allows the real axios implementation and
 * lightweight test mocks to be injected via the same contract.
 */
export interface HttpClient {
  /** Fetch the HTML body of the given URL. */
  get(url: string): Promise<string>;
}


// ---------------------------------------------------------------------------
// Default HTTP client (axios)
// ---------------------------------------------------------------------------

/**
 * Creates the default production HTTP client backed by axios.
 * Lazy-imported so tests that inject a mock never load axios.
 */
export async function makeDefaultHttpClient(): Promise<HttpClient> {
  // Dynamic import keeps the module testable without axios in test environments.
  const axiosModule = await import("axios");
  const axios = axiosModule.default;

  return {
    async get(url: string): Promise<string> {
      const response = await axios.get<string>(url, {
        headers: {
          // 2026-04-08: The SSC portal uses browser UA detection.
          // A "Mozilla/5.0" prefix causes the server to return a 7 KB Oracle ADF
          // JavaScript bootstrap shell instead of the full server-side rendered page.
          // Using a non-browser UA causes the server to return the full SSR HTML
          // (~92 KB) which includes the document listing table we can parse.
          "User-Agent": "VN-Market-Intelligence/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
        timeout: 30_000,
        responseType: "text",
        // Vietnamese government sites have incomplete TLS chains (report #1101)
        httpsAgent: tlsPermissiveAgent,
      });
      return response.data;
    },
  };
}

// ---------------------------------------------------------------------------
// Report-type title matching
// ---------------------------------------------------------------------------

/**
 * Keywords in document titles that indicate a quarterly financial report.
 * Vietnamese: "quý" = quarter.
 */
const QUARTERLY_KEYWORDS: Array<string | RegExp> = ["quý", /\bq[1-4]\b/i];

/**
 * Keywords in document titles that indicate an annual financial report.
 * Vietnamese: "năm" = year, "niên độ" = fiscal year.
 */
const ANNUAL_KEYWORDS: Array<string | RegExp> = ["năm", "annual", "niên độ"];

/**
 * Returns true if the given title matches the expected report type.
 *
 * Annual guard: a title containing quarterly keywords ("quý", "Q1"…"Q4") is
 * treated as a quarterly report even if it also contains "năm" (year) — e.g.
 * "Báo cáo tài chính quý 1 năm 2025" contains both "quý" and "năm" but is
 * quarterly. This prevents quarterly docs from leaking into annual results.
 */
export function titleMatchesReportType(
  title: string,
  reportType: "quarterly" | "annual",
): boolean {
  const lower = title.toLowerCase();
  const keywords = reportType === "quarterly" ? QUARTERLY_KEYWORDS : ANNUAL_KEYWORDS;

  const matchesTarget = keywords.some((kw) =>
    typeof kw === "string" ? lower.includes(kw) : kw.test(title),
  );

  if (!matchesTarget) return false;

  // Annual guard: exclude titles that also match quarterly keywords
  if (reportType === "annual") {
    const hasQuarterlyMarker = QUARTERLY_KEYWORDS.some((kw) =>
      typeof kw === "string" ? lower.includes(kw) : kw.test(title),
    );
    if (hasQuarterlyMarker) return false;
  }

  return true;
}
