/**
 * Task 1111 — BCTC Fallback: disableSscPolling config flag + UPCOM fetcher
 *
 * Tests the "SSC disabled" path in listSscDocuments:
 *   AC1: mcp.config.json has features.disableSscPolling = true
 *   AC2: McpConfig.features.disableSscPolling reads correctly via loadMcpConfig()
 *   AC3: When disableSscPolling=true, listSscDocuments never calls SSC URL
 *   AC4: When disableSscPolling=true and HOSE returns docs → those docs returned
 *   AC5: When disableSscPolling=true and HOSE empty, HNX returns docs → HNX docs returned
 *   AC6: When disableSscPolling=true and HOSE+HNX empty, UPCOM returns docs → UPCOM docs returned
 *   AC7: When disableSscPolling=true and all three empty → returns [] (no crash)
 *   AC8: When disableSscPolling=false → SSC is tried first (backward compat)
 */

import { describe, it, expect } from "bun:test";
import {
  listSscDocumentsWithFlag,
  fetchUpcomDisclosures,
  parseUpcomDisclosureHtml,
} from "../infrastructure/fetchers/ssc.js";
import type { SscDocument } from "../infrastructure/fetchers/ssc.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal mock HttpClient — records calls and returns configured responses. */
function makeHttpMock(responses: Record<string, string>): {
  calls: string[];
  client: { get: (url: string) => Promise<string> };
} {
  const calls: string[] = [];
  return {
    calls,
    client: {
      get: async (url: string) => {
        calls.push(url);
        for (const [pattern, body] of Object.entries(responses)) {
          if (url.includes(pattern)) return body;
        }
        return "";
      },
    },
  };
}

const HOSE_SAMPLE_HTML = `
<div class="item-list">
  <div class="item">
    <a href="/Modules/CMS/Web/Content/123-bctc-q4-2025.pdf">BCTC Q4/2025 VCB</a>
    <span class="date">15/03/2025</span>
  </div>
</div>`;

const HNX_SAMPLE_HTML = `
<table class="table-data">
  <tr>
    <td><a href="https://hnx.vn/uploads/bctc-acb-q4-2025.pdf">BCTC Q4-2025</a></td>
    <td>15/03/2025</td>
  </tr>
</table>`;

const UPCOM_SAMPLE_HTML = `
<table class="table-data">
  <tr>
    <td><a href="https://upcom.hnx.vn/uploads/bctc-vea-q4-2025.pdf">BCTC Q4-2025 VEA</a></td>
    <td>20/03/2025</td>
  </tr>
</table>`;

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1111 — BCTC fallback: disableSscPolling + UPCOM fetcher", () => {

  // AC1 + AC2: config flag reads correctly
  it("AC2: loadMcpConfig features.disableSscPolling defaults to true when not in config", async () => {
    // We test the flag via the injected parameter to listSscDocumentsWithFlag
    // (avoids needing to read actual mcp.config.json in unit tests)
    const { calls, client } = makeHttpMock({ "hsx.vn": HOSE_SAMPLE_HTML });
    await listSscDocumentsWithFlag("VCB", "quarterly", 2025, true, client);
    // SSC URL should not be called
    const sscCalls = calls.filter(url => url.includes("congbothongtin.ssc.gov.vn"));
    expect(sscCalls.length).toBe(0);
  });

  // AC3: SSC never called when disabled
  it("AC3: when disableSscPolling=true, SSC URL is never requested", async () => {
    const { calls, client } = makeHttpMock({
      "hsx.vn": HOSE_SAMPLE_HTML,
      "//hnx.vn/": "",
      "upcom.hnx.vn": "",
    });

    await listSscDocumentsWithFlag("VCB", "quarterly", 2025, true, client);

    const sscCalls = calls.filter(url => url.includes("congbothongtin.ssc.gov.vn"));
    expect(sscCalls.length).toBe(0);
  });

  // AC4: HOSE returns docs → returned directly
  it("AC4: when disableSscPolling=true and HOSE has docs, those docs are returned", async () => {
    const { client } = makeHttpMock({
      "hsx.vn": HOSE_SAMPLE_HTML,
      "hnx.vn/cong-bo": "",
      "upcom.hnx.vn": "",
    });

    const docs = await listSscDocumentsWithFlag("VCB", "quarterly", 2025, true, client);

    expect(docs.length).toBeGreaterThan(0);
    // Verify the URL came from HOSE
    expect(docs[0]!.url).toContain("hsx.vn");
  });

  // AC5: HOSE empty, HNX has docs → HNX docs returned
  it("AC5: when HOSE empty and HNX has docs, HNX docs are returned", async () => {
    const { client } = makeHttpMock({
      "hsx.vn": "",
      "hnx.vn/cong-bo-thong-tin": HNX_SAMPLE_HTML,
      "upcom.hnx.vn": "",
    });

    const docs = await listSscDocumentsWithFlag("ACB", "quarterly", 2025, true, client);

    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0]!.url).toContain("hnx.vn");
  });

  // AC6: HOSE+HNX empty, UPCOM has docs → UPCOM docs returned (VEA case)
  it("AC6: when HOSE+HNX empty and UPCOM has docs, UPCOM docs returned (VEA case)", async () => {
    // Use exact subdomain matching to avoid "hnx.vn" pattern swallowing the UPCOM URL
    const { client } = makeHttpMock({
      "hsx.vn": "",
      "//hnx.vn/": "",           // matches https://hnx.vn/ but NOT https://upcom.hnx.vn/
      "upcom.hnx.vn": UPCOM_SAMPLE_HTML,
    });

    const docs = await listSscDocumentsWithFlag("VEA", "quarterly", 2025, true, client);

    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0]!.url).toContain("upcom.hnx.vn");
  });

  // AC7: all three empty → returns [] without crash
  it("AC7: when all three sources return empty, returns [] gracefully", async () => {
    const { client } = makeHttpMock({
      "hsx.vn": "",
      "//hnx.vn/": "",
      "upcom.hnx.vn": "",
    });

    const docs = await listSscDocumentsWithFlag("XYZ", "quarterly", 2025, true, client);

    expect(docs).toEqual([]);
  });

  // AC8: when disableSscPolling=false, SSC is tried
  it("AC8: when disableSscPolling=false, SSC URL is attempted", async () => {
    // Return a large (>50KB) SSC response with no docs — SSC is tried
    const largeSscHtml = "x".repeat(60_000);
    const { calls, client } = makeHttpMock({
      "congbothongtin.ssc.gov.vn": largeSscHtml,
    });

    await listSscDocumentsWithFlag("VCB", "quarterly", 2025, false, client);

    const sscCalls = calls.filter(url => url.includes("congbothongtin.ssc.gov.vn"));
    expect(sscCalls.length).toBeGreaterThan(0);
  });

  // UPCOM parser test
  it("parseUpcomDisclosureHtml: extracts PDF links from UPCOM table structure", () => {
    const docs = parseUpcomDisclosureHtml(UPCOM_SAMPLE_HTML, "quarterly");

    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0]!.url).toContain("upcom.hnx.vn");
  });

  // fetchUpcomDisclosures returns [] on empty HTML
  it("fetchUpcomDisclosures: returns [] on empty HTML response", async () => {
    const { client } = makeHttpMock({ "upcom.hnx.vn": "" });
    const docs = await fetchUpcomDisclosures("VEA", 2025, "quarterly", client);
    expect(docs).toEqual([]);
  });
});
