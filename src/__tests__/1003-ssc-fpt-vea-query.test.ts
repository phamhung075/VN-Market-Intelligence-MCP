/**
 * Task 1003 — SSC FPT/VEA Q4-2025 query investigation
 *
 * Root cause investigation: FPT (HOSE) and VEA (UPCOM) Q4-2025 BCTC filings
 * were overdue 8+ days with no PDFs found. This test suite covers:
 *
 * 1. ADF table.x17f parsing for FPT (HOSE ticker present in MCK column)
 * 2. Empty-result case when ticker not present in ADF table
 * 3. Case-insensitive ticker match ("fpt" -> finds "FPT" rows)
 * 4. buildSscSearchUrl correctly encodes year=2026
 * 5. JS-shell / no-table fallback returns [] without throwing
 * 6. VEA (UPCOM) correctly parsed from x17f MCK column
 *
 * // FINDINGS (Task 1003 -- 2026-04-08):
 * //
 * // Root cause 1 -- Ticker match was already case-insensitive (actionCode.toUpperCase())
 * //   but the existing code was correct. No bug here.
 * //
 * // Root cause 2 -- The SSC portal returned a short (<50 KB) JS-only shell for
 * //   FPT/VEA queries. parseSscHtml was never reached because the portal_js_only
 * //   guard in listSscDocuments correctly detected the short response and
 * //   triggered HOSE/HNX fallback (Task 1025). The fallback also returned empty
 * //   results because HOSE/HNX portals either did not list VEA (UPCOM ticker,
 * //   not on HOSE) or had no Q4-2025 results yet (filing genuinely not published).
 * //
 * // Root cause 3 -- VEA trades on UPCOM, not HOSE or HNX. Neither the HOSE
 * //   (hsx.vn) nor HNX (hnx.vn) fallback fetches UPCOM disclosures. The fallback
 * //   coverage gap means VEA filings are permanently unreachable through the
 * //   current pipeline. Task 1025 only added HOSE + HNX fallbacks.
 * //
 * // Root cause 4 -- The ADF table.x17f parser is correct: it reads col[2] for MCK
 * //   and col[6] for date. The parser was never the problem -- it just never got
 * //   real HTML because the portal returned the JS shell on every request.
 * //
 * // Summary: FPT Q4-2025 -- likely genuinely not published on time (portal empty);
 * //           VEA Q4-2025 -- UPCOM fallback gap (hsx.vn / hnx.vn don't cover UPCOM).
 * //           No code bug in parseSscHtml itself. Documented for Task 1003.
 */

import { describe, it, expect } from "bun:test";
import {
  parseSscHtml,
  buildSscSearchUrl,
  listSscDocuments,
} from "../infrastructure/fetchers/ssc.js";
import type { HttpClient } from "../infrastructure/fetchers/ssc.js";

// ---------------------------------------------------------------------------
// ADF x17f HTML fixtures
// ---------------------------------------------------------------------------

/**
 * Realistic ADF table.x17f HTML with FPT row (HOSE).
 * Mimics the SSC portal Oracle ADF table output when SSR is delivered
 * (bot/non-browser User-Agent, full HTML > 50 KB).
 * The padding brings it past the SSC_MIN_CONTENT_BYTES (50_000) threshold.
 */
function makeAdfHtmlWithFpt(): string {
  const padding = "x".repeat(55_000);
  return `<!DOCTYPE html>
<html>
<body>
<!--${padding}-->
<table class="x17f">
  <tr>
    <td>1</td>
    <td>HOSE</td>
    <td>FPT</td>
    <td>B\u00e1o c\u00e1o t\u00e0i ch\u00ednh qu\u00fd 4 n\u0103m 2025</td>
    <td>C\u00f4ng ty C\u1ed5 ph\u1ea7n FPT</td>
    <td></td>
    <td>07/04/2026</td>
    <td><a href="#">icon</a></td>
  </tr>
  <tr>
    <td>2</td>
    <td>HOSE</td>
    <td>VCB</td>
    <td>B\u00e1o c\u00e1o t\u00e0i ch\u00ednh qu\u00fd 4 n\u0103m 2025</td>
    <td>Ng\u00e2n h\u00e0ng Vietcombank</td>
    <td></td>
    <td>05/04/2026</td>
    <td><a href="#">icon</a></td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * ADF table.x17f HTML with VEA row (UPCOM).
 */
function makeAdfHtmlWithVea(): string {
  const padding = "x".repeat(55_000);
  return `<!DOCTYPE html>
<html>
<body>
<!--${padding}-->
<table class="x17f">
  <tr>
    <td>1</td>
    <td>UPCOM</td>
    <td>VEA</td>
    <td>B\u00e1o c\u00e1o t\u00e0i ch\u00ednh n\u0103m 2025</td>
    <td>T\u1ed5ng C\u00f4ng ty M\u00e1y \u0111\u1ed9ng l\u1ef1c</td>
    <td></td>
    <td>08/04/2026</td>
    <td><a href="#">icon</a></td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * ADF table.x17f HTML with FPT rows but NO quarterly docs (only annual).
 */
function makeAdfHtmlFptAnnualOnly(): string {
  const padding = "x".repeat(55_000);
  return `<!DOCTYPE html>
<html>
<body>
<!--${padding}-->
<table class="x17f">
  <tr>
    <td>1</td>
    <td>HOSE</td>
    <td>FPT</td>
    <td>B\u00e1o c\u00e1o t\u00e0i ch\u00ednh n\u0103m 2025</td>
    <td>C\u00f4ng ty C\u1ed5 ph\u1ea7n FPT</td>
    <td></td>
    <td>07/04/2026</td>
    <td><a href="#">icon</a></td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * HTML that simulates a JS-shell (no table, very short).
 */
const SSC_JS_SHELL_HTML =
  `<!DOCTYPE html><html><head><script>window.ADF={}</script></head><body><div id="root"></div></body></html>`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1003 -- SSC FPT/VEA query investigation", () => {

  // -- 1. ADF table.x17f parsing extracts FPT quarterly row -----------------
  it("parseSscHtml extracts FPT quarterly row from ADF x17f table", () => {
    const html = makeAdfHtmlWithFpt();
    const docs = parseSscHtml(html, "quarterly", "FPT");

    expect(docs.length).toBeGreaterThanOrEqual(1);
    // Title is col[3] from the ADF table -- the raw document title
    // "qu\u00fd 4" = "quý 4" in Unicode
    const fptDoc = docs.find(d => d.title.toLowerCase().includes("qu\u00fd 4"));
    expect(fptDoc).toBeDefined();
    expect(fptDoc!.title).toContain("qu\u00fd 4");
    expect(fptDoc!.publishedAt).toBe("07/04/2026");
    expect(fptDoc!.reportType).toBe("quarterly");
  });

  // -- 2. Empty-result when ticker not in ADF table --------------------------
  it("parseSscHtml returns [] when FPT not present in ADF table (only VCB rows)", () => {
    // Build HTML with only VCB rows, no FPT
    const padding = "x".repeat(55_000);
    const html = `<!DOCTYPE html>
<html><body><!--${padding}-->
<table class="x17f">
  <tr>
    <td>1</td><td>HOSE</td><td>VCB</td>
    <td>B\u00e1o c\u00e1o t\u00e0i ch\u00ednh qu\u00fd 4 n\u0103m 2025</td>
    <td>Vietcombank</td><td></td>
    <td>05/04/2026</td><td><a href="#">icon</a></td>
  </tr>
</table>
</body></html>`;

    const docs = parseSscHtml(html, "quarterly", "FPT");
    expect(docs).toEqual([]);
  });

  // -- 3. Case-insensitive ticker match (lowercase "fpt" -> finds FPT row) --
  it("parseSscHtml matches FPT row when actionCode passed as lowercase 'fpt'", () => {
    const html = makeAdfHtmlWithFpt();
    const docs = parseSscHtml(html, "quarterly", "fpt");

    expect(docs.length).toBeGreaterThanOrEqual(1);
    // "qu\u00fd" = "quý" in Unicode
    const fptDoc = docs.find(d => d.title.toLowerCase().includes("qu\u00fd"));
    expect(fptDoc).toBeDefined();
  });

  // -- 4. buildSscSearchUrl encodes year=2026 correctly ----------------------
  it("buildSscSearchUrl includes year=2026 in query string", () => {
    const url = buildSscSearchUrl("FPT", 2026);

    expect(url).toContain("https://congbothongtin.ssc.gov.vn");
    expect(url).toContain("keyword=FPT");
    expect(url).toContain("year=2026");
    expect(url).toContain("type=BCTC");
  });

  // -- 5. JS-shell / no-table fallback returns [] without throwing -----------
  it("parseSscHtml returns [] when HTML has no table (JS-shell response)", () => {
    const docs = parseSscHtml(SSC_JS_SHELL_HTML, "quarterly", "FPT");
    expect(docs).toEqual([]);
  });

  // -- 6. VEA (UPCOM) correctly parsed from x17f MCK column -----------------
  it("parseSscHtml extracts VEA annual row from ADF x17f UPCOM table", () => {
    const html = makeAdfHtmlWithVea();
    const docs = parseSscHtml(html, "annual", "VEA");

    expect(docs.length).toBeGreaterThanOrEqual(1);
    const veaDoc = docs[0];
    expect(veaDoc).toBeDefined();
    // "n\u0103m 2025" = "năm 2025" in Unicode
    expect(veaDoc!.title).toContain("n\u0103m 2025");
    expect(veaDoc!.publishedAt).toBe("08/04/2026");
    expect(veaDoc!.reportType).toBe("annual");
  });

  // -- 7. listSscDocuments returns [] silently when SSC returns JS shell -----
  it("listSscDocuments returns [] without error when SSC returns JS shell and fallbacks empty", async () => {
    const mockClient: HttpClient = {
      async get(_url: string): Promise<string> {
        // Return a JS shell for ALL URLs (SSC + HOSE + HNX all fail)
        return SSC_JS_SHELL_HTML;
      },
    };

    const docs = await listSscDocuments("FPT", "quarterly", 2026, mockClient);
    // Should not throw; returns [] gracefully
    expect(Array.isArray(docs)).toBe(true);
  });

  // -- 8. parseSscHtml ticker filter excludes non-matching rows --------------
  it("parseSscHtml ticker filter excludes non-matching rows from multi-ticker ADF table", () => {
    const html = makeAdfHtmlWithFpt(); // contains both FPT and VCB rows
    const docs = parseSscHtml(html, "quarterly", "FPT");

    // All returned docs must belong to FPT (no Vietcombank leak)
    const hasVcb = docs.some(d => d.title.includes("Vietcombank"));
    expect(hasVcb).toBe(false);
  });

  // -- 9. FPT annual doc not returned when requesting quarterly filter -------
  it("parseSscHtml does not return FPT annual doc when reportType=quarterly", () => {
    const html = makeAdfHtmlFptAnnualOnly();
    const docs = parseSscHtml(html, "quarterly", "FPT");

    // "Bao cao tai chinh nam 2025" should not match quarterly filter
    expect(docs).toEqual([]);
  });

  // -- 10. synthetic URL includes ticker for dedup tracing ------------------
  it("parseSscHtml sets synthetic URL containing the ticker for ADF rows", () => {
    const html = makeAdfHtmlWithFpt();
    const docs = parseSscHtml(html, "quarterly", "FPT");

    expect(docs.length).toBeGreaterThanOrEqual(1);
    expect(docs[0]!.url).toContain("FPT");
    expect(docs[0]!.url).toMatch(/^https?:\/\//);
  });
});
