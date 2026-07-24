/**
 * Infrastructure — SSC Disclosure Orchestrator
 *
 * Composes the SSC-first portal fetcher (sscPortal.ts) with the HOSE / HNX /
 * UPCOM exchange-portal fallbacks (hoseDisclosure.ts / hnxDisclosure.ts /
 * upcomDisclosure.ts) into a single `listSscDocuments` entry point used to
 * list financial-report documents for a listed company (identified by stock
 * action code).
 *
 * FACTORY-INFRA-split-ssc-fetchers (2026-07-24): this file used to bundle
 * every portal's fetch/parse logic directly. It now re-exports the pre-split
 * public surface (types + per-portal functions) from the sibling modules so
 * every existing `from "ssc.js"` import continues to resolve unchanged, and
 * keeps only the orchestration functions (`listSscDocuments`,
 * `listSscDocumentsWithFlag`) that compose all four portals. Pure structural
 * move — no behavior change.
 *
 * Layer: infrastructure/fetchers — may use HTTP, must not import domain/.
 *
 * // FINDINGS (Task 1003 — 2026-04-08): FPT/VEA Q4-2025 overdue investigation
 * //
 * // Root cause 1 — Ticker match: already case-insensitive (actionCode.toUpperCase()
 * //   applied before comparison). No bug in the matching logic.
 * //
 * // Root cause 2 — FPT Q4-2025: The SSC portal returned a short (<50 KB)
 * //   Oracle ADF JS-only shell for FPT queries. The portal_js_only guard in
 * //   listSscDocuments correctly detected this and triggered the HOSE/HNX
 * //   fallback (Task 1025). The HOSE fallback also returned empty results —
 * //   the FPT Q4-2025 filing was genuinely not published on the portal at
 * //   the time of the check (8 days overdue per 30/03 SSC deadline).
 * //
 * // Root cause 3 — VEA Q4-2025: VEA trades on UPCOM, not HOSE or HNX.
 * //   Neither hsx.vn nor hnx.vn fallback covers UPCOM disclosures. The current
 * //   fallback pipeline (Task 1025) has a coverage gap for UPCOM tickers.
 * //   VEA filings are permanently unreachable until a UPCOM fallback is added
 * //   (e.g. upcom.hnx.vn disclosure endpoint — tracked as future work).
 * //
 * // Root cause 4 — ADF x17f parser: parseSscHtml correctly reads col[2] (MCK)
 * //   and col[6] (date). The parser was never buggy; it simply never received
 * //   real SSR HTML because the portal returned the JS shell on every request.
 * //
 * // Action taken: 10 regression tests added in
 * //   src/__tests__/1003-ssc-fpt-vea-query.test.ts covering ADF x17f parsing,
 * //   empty-result case, case-insensitive match, buildSscSearchUrl year=2026,
 * //   and JS-shell no-table fallback. No code changes required — the parser
 * //   and fallback logic are correct. VEA/UPCOM gap filed separately.
 */

import { logger } from "../logger.js";
import { mcpConfig } from "../config.js";
import type { HttpClient, SscDocument } from "./sscCommon.js";
import { buildSscSearchUrl, parseSscHtml, withBrowserLock, _runSscPath } from "./sscPortal.js";
import { fetchHoseDisclosures } from "./hoseDisclosure.js";
import { fetchHnxDisclosures } from "./hnxDisclosure.js";
import { fetchUpcomDisclosures } from "./upcomDisclosure.js";

// ---------------------------------------------------------------------------
// Re-exports — pre-split public surface (zero-change call sites)
// ---------------------------------------------------------------------------

export type { HttpClient, SscDocument } from "./sscCommon.js";
export { buildSscSearchUrl, parseSscHtml, withBrowserLock } from "./sscPortal.js";
export { parseHoseDisclosureHtml, fetchHoseDisclosures } from "./hoseDisclosure.js";
export { parseHnxDisclosureHtml, fetchHnxDisclosures } from "./hnxDisclosure.js";
export { parseUpcomDisclosureHtml, fetchUpcomDisclosures } from "./upcomDisclosure.js";

// ---------------------------------------------------------------------------
// Public API — orchestration
// ---------------------------------------------------------------------------

/**
 * Lists financial report documents for a Vietnamese listed company from the
 * SSC public disclosure portal.
 *
 * Concurrent calls are serialized through `withBrowserLock` so only one HTTP
 * session is active at a time against the SSC portal.
 *
 * @param actionCode - Stock ticker (e.g. "VCB", "HPG").
 * @param reportType - "quarterly" for quý reports, "annual" for năm reports.
 * @param year       - Four-digit year to filter results (e.g. 2025).
 * @param httpClient - Optional HTTP client; defaults to an axios-backed client.
 *                     Inject a mock in tests to avoid real network calls.
 * @returns Promise resolving to an array of SscDocument (empty on error).
 */
export async function listSscDocuments(
  actionCode: string,
  reportType: "quarterly" | "annual",
  year: number,
  httpClient?: HttpClient,
): Promise<SscDocument[]> {
  // Task 1111 (Sprint 056): when SSC polling is disabled, skip the SSC step
  // entirely and go directly to HOSE/HNX/UPCOM exchange portals.
  // The flag defaults to true because the SSC portal returns a JS-only shell.
  if (mcpConfig.features.disableSscPolling) {
    return listSscDocumentsWithFlag(actionCode, reportType, year, true, httpClient);
  }

  return _runSscPath(actionCode, reportType, year, httpClient);
}

// ---------------------------------------------------------------------------
// listSscDocumentsWithFlag — testable variant with explicit disableSscPolling
// (Task 1111 — Sprint 056)
// ---------------------------------------------------------------------------

/**
 * Lists BCTC documents for a ticker, with an explicit `disableSscPolling` flag.
 *
 * This is the core implementation and testable entry point. Both `listSscDocuments`
 * (production, reads flag from mcpConfig) and unit tests (inject flag explicitly)
 * route through this function.
 *
 * When `disableSscPolling = true`:
 *   - SSC portal is bypassed entirely (no network call to congbothongtin.ssc.gov.vn)
 *   - HOSE, HNX, and UPCOM are queried in parallel
 *   - Priority: HOSE → HNX → UPCOM; [] returned if all three are empty
 *
 * When `disableSscPolling = false`:
 *   - Runs the original SSC-first path inline (no delegation to listSscDocuments
 *     to avoid circular calls; same logic inlined below)
 *
 * @param actionCode         - Stock ticker (e.g. "VCB", "VEA").
 * @param reportType         - "quarterly" | "annual".
 * @param year               - Four-digit year.
 * @param disableSscPolling  - When true, skip SSC and use exchange portals directly.
 * @param httpClient         - Optional injected HTTP client (tests only).
 * @returns Array of SscDocument entries (empty on all-miss).
 */
export async function listSscDocumentsWithFlag(
  actionCode: string,
  reportType: "quarterly" | "annual",
  year: number,
  disableSscPolling: boolean,
  httpClient?: HttpClient,
): Promise<SscDocument[]> {
  if (!disableSscPolling) {
    // Backward-compat: use the original SSC-first path directly.
    // Calls _runSscPath to avoid going through the mcpConfig guard in listSscDocuments
    // (which would re-route back to the disableSscPolling=true path if the flag is set).
    return _runSscPath(actionCode, reportType, year, httpClient);
  }

  // SSC disabled — go directly to HOSE + HNX + UPCOM in parallel
  logger.debug("[ssc] disableSscPolling=true — querying HOSE/HNX/UPCOM directly", {
    actionCode,
    reportType,
    year,
  });

  const [hoseResult, hnxResult, upcomResult] = await Promise.allSettled([
    fetchHoseDisclosures(actionCode, year, reportType, httpClient).catch(() => [] as SscDocument[]),
    fetchHnxDisclosures(actionCode, year, reportType, httpClient).catch(() => [] as SscDocument[]),
    fetchUpcomDisclosures(actionCode, year, reportType, httpClient).catch(() => [] as SscDocument[]),
  ]);

  const hoseDocs  = hoseResult.status  === "fulfilled" ? hoseResult.value  : [];
  const hnxDocs   = hnxResult.status   === "fulfilled" ? hnxResult.value   : [];
  const upcomDocs = upcomResult.status === "fulfilled" ? upcomResult.value  : [];

  // Priority: HOSE → HNX → UPCOM
  if (hoseDocs.length > 0) {
    logger.info("[ssc] disableSscPolling — HOSE returned documents", {
      actionCode, year, count: hoseDocs.length,
    });
    return hoseDocs;
  }
  if (hnxDocs.length > 0) {
    logger.info("[ssc] disableSscPolling — HNX returned documents", {
      actionCode, year, count: hnxDocs.length,
    });
    return hnxDocs;
  }
  if (upcomDocs.length > 0) {
    logger.info("[ssc] disableSscPolling — UPCOM returned documents", {
      actionCode, year, count: upcomDocs.length,
    });
    return upcomDocs;
  }

  logger.debug("[ssc] disableSscPolling — no documents from HOSE/HNX/UPCOM", {
    actionCode, reportType, year,
    hint: "Exchange portals may not have published the report yet, or ticker is unlisted",
  });

  return [];
}
