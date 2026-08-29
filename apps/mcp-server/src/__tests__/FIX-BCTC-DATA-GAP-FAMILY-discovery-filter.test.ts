/**
 * FIX-BCTC-DATA-GAP-FAMILY U2 — governance-report discovery filter tests
 *
 * Covers bctcDiscovery.ts's wrong-document-class URL filter (architect brief
 * 2026-08-28 U2): corporate-governance report URLs (Báo cáo quản trị) must be
 * dropped from discovery results before they can poison a queue slot's
 * source_url. When every discovered URL is a governance report, discovery must
 * behave exactly as "0 URLs found" → the enricher's attempt-counting path →
 * honest `url_not_found` (live BID 2025-Q4 poisoning: an owa.hnx.vn
 * BaoCaoQuanTri URL occupied the slot forever).
 *
 * Pure domain functions — no DB, no network.
 */

import { describe, it, expect } from "bun:test";
import {
  isGovernanceReportUrl,
  filterNonFinancialStatementUrls,
  discoverHosePdfUrls,
} from "../domain/services/bctcDiscovery.js";

const BID_POISONED_URL =
  "https://owa.hnx.vn/ftp///cims/2026/1_W5/000000015833101_VI_BaoCaoQuanTri_2025.pdf";

const FINANCIAL_URL =
  "https://staticfile.hsx.vn/Uploads/20250420-HPG-BCTC-hop-nhat-2025-Q1.pdf";

describe("FIX-BCTC-DATA-GAP-FAMILY U2 — isGovernanceReportUrl", () => {
  it("flags the live BID poisoning URL (BaoCaoQuanTri)", () => {
    expect(isGovernanceReportUrl(BID_POISONED_URL)).toBe(true);
  });

  it("flags lowercase / hyphenated governance variants", () => {
    expect(isGovernanceReportUrl("https://owa.hnx.vn/ftp/x/bao-cao-quan-tri-2025.pdf")).toBe(true);
    expect(isGovernanceReportUrl("https://hnx.vn/QuanTri/2025/BaoCao.pdf")).toBe(true);
  });

  it("keeps genuine financial-statement URLs", () => {
    expect(isGovernanceReportUrl(FINANCIAL_URL)).toBe(false);
    expect(isGovernanceReportUrl("https://staticfile.hsx.vn/Uploads/BCTC-2025.pdf")).toBe(false);
    expect(isGovernanceReportUrl("https://example.com/annual-report-2025.pdf")).toBe(false);
  });
});

describe("FIX-BCTC-DATA-GAP-FAMILY U2 — filterNonFinancialStatementUrls", () => {
  it("keeps only the financial URL from a mixed list", () => {
    const result = filterNonFinancialStatementUrls([BID_POISONED_URL, FINANCIAL_URL]);
    expect(result).toEqual([FINANCIAL_URL]);
  });

  it("returns [] for a governance-only list (behaves as 0 URLs found)", () => {
    expect(filterNonFinancialStatementUrls([BID_POISONED_URL])).toEqual([]);
  });
});

describe("FIX-BCTC-DATA-GAP-FAMILY U2 — discoverHosePdfUrls applies the filter", () => {
  it("returns only the financial URL when hsx discovery returns a mix", async () => {
    const result = await discoverHosePdfUrls("HPG", {
      _fetchHsx: async (_t, _y) => [BID_POISONED_URL, FINANCIAL_URL],
    });
    expect(result.urls).toEqual([FINANCIAL_URL]);
    expect(result.source).toBe("hsx");
  });

  it("treats a governance-only discovery result as 0 URLs found (no fallback)", async () => {
    const result = await discoverHosePdfUrls("BID", {
      _fetchHsx: async (_t, _y) => [BID_POISONED_URL],
      // no _fetchVpsPlaywright / no BCTC_DISCOVER_URL → no strategy 1
    });
    expect(result.urls).toEqual([]);
    expect(result.source).toBeNull();
    expect(result.fallbackUrls).toEqual([]);
  });
});
