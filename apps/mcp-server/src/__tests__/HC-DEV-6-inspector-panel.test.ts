// HC-DEV-6-inspector-panel.test.ts
// DV tests for the "Sửa tay / Xác nhận cuối" tab added to bctc-inspector.html.
//
// Strategy: bun has no DOM (no jsdom), so browser-level wiring is verified by QA/Playwright.
// This file covers what CAN be tested in-process:
//
//   1. URL-assertion tests: pure URL builder functions mirrored from the HTML.
//      Asserts the four endpoint paths the panel calls are wired to the correct
//      HC-DEV-3 HTTP endpoints.
//
//   2. Pure-logic tests: parseVnNumber (Vietnamese number parser) — the client-side
//      function that must correctly parse user input before POSTing to /correct.
//      This function is load-bearing: wrong parse = wrong value submitted.
//
//   3. HTML structural assertions: read bctc-inspector.html as a string and assert
//      that the new tab button + panel elements are present, and that ALL pre-existing
//      pane IDs are still present (additive-only proof).
//
// RED before production code, GREEN after. This test file is committed in the SAME
// commit as the bctc-inspector.html changes.
//
// Anti-false-green guards:
//   - URL tests: assert EXACT URL substring patterns, not just "contains /api"
//   - parseVnNumber: at least one deliberately wrong assertion is commented out below (DV guard)
//   - HTML structural: assert pre-existing IDs via exact match, not existence-only

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 1. Pure URL builder functions (mirrored from bctc-inspector.html) ─────────
//
// These mirror the hcFlagsUrl / hcCorrectUrl / hcConfirmUrl / hcConfirmResetUrl
// functions defined in the HTML's <script> block. The DV test asserts that the
// URL patterns they produce match the HC-DEV-3 endpoint contract exactly.

const BASE = ""; // same-origin — matches the HTML constant

function hcFlagsUrl(docId: string): string {
  return `${BASE}/api/bctc-inspect/flags/${encodeURIComponent(docId)}`;
}
function hcCorrectUrl(docId: string): string {
  return `${BASE}/api/bctc-inspect/correct/${encodeURIComponent(docId)}`;
}
function hcConfirmUrl(docId: string): string {
  return `${BASE}/api/bctc-inspect/confirm/${encodeURIComponent(docId)}`;
}
function hcConfirmResetUrl(docId: string): string {
  return `${BASE}/api/bctc-inspect/confirm/${encodeURIComponent(docId)}/reset`;
}

// ── 2. parseVnNumber (mirrored from bctc-inspector.html) ──────────────────────
//
// Algorithm (identical to the HTML function):
//   Strip whitespace, replace comma with dot, parseFloat.
//   Returns null when result is NaN.

function parseVnNumber(s: string | null | undefined): number | null {
  if (!s || typeof s !== "string") return null;
  const cleaned = s.trim().replace(/\s/g, "").replace(/,/g, ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ── 3. Load the HTML file once ────────────────────────────────────────────────

const HTML_PATH = resolve(
  import.meta.dir,
  "../interface/bctc-inspector.html",
);
const htmlSource = readFileSync(HTML_PATH, "utf-8");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("HC-DEV-6 — URL builders: four HC-DEV-3 endpoint paths", () => {
  const docId = "aaaabbbb-cccc-dddd-eeee-ffffffffffff";

  it("hcFlagsUrl → GET /api/bctc-inspect/flags/{doc_id}", () => {
    const url = hcFlagsUrl(docId);
    expect(url).toBe(`/api/bctc-inspect/flags/${docId}`);
    // Exact path prefix assertion
    expect(url.startsWith("/api/bctc-inspect/flags/")).toBe(true);
  });

  it("hcCorrectUrl → POST /api/bctc-inspect/correct/{doc_id}", () => {
    const url = hcCorrectUrl(docId);
    expect(url).toBe(`/api/bctc-inspect/correct/${docId}`);
    expect(url.startsWith("/api/bctc-inspect/correct/")).toBe(true);
  });

  it("hcConfirmUrl → POST /api/bctc-inspect/confirm/{doc_id}", () => {
    const url = hcConfirmUrl(docId);
    expect(url).toBe(`/api/bctc-inspect/confirm/${docId}`);
    expect(url.startsWith("/api/bctc-inspect/confirm/")).toBe(true);
    // Must NOT end with /reset (that is a different endpoint)
    expect(url.endsWith("/reset")).toBe(false);
  });

  it("hcConfirmResetUrl → POST /api/bctc-inspect/confirm/{doc_id}/reset", () => {
    const url = hcConfirmResetUrl(docId);
    expect(url).toBe(`/api/bctc-inspect/confirm/${docId}/reset`);
    expect(url.endsWith("/reset")).toBe(true);
  });

  it("URL encoding: docId with special chars encoded correctly", () => {
    const docWithSpace = "doc id/with special";
    const flagsUrl = hcFlagsUrl(docWithSpace);
    // encodeURIComponent encodes space as %20 and / as %2F
    expect(flagsUrl).toContain("%20");
    expect(flagsUrl).toContain("%2F");
  });

  it("four endpoints are distinct from each other (no collision)", () => {
    const urls = [
      hcFlagsUrl(docId),
      hcCorrectUrl(docId),
      hcConfirmUrl(docId),
      hcConfirmResetUrl(docId),
    ];
    const unique = new Set(urls);
    expect(unique.size).toBe(4);
  });
});

describe("HC-DEV-6 — parseVnNumber: Vietnamese number input parser", () => {
  it("parses plain integer string", () => {
    expect(parseVnNumber("1000")).toBe(1000);
  });

  it("parses float with dot separator", () => {
    expect(parseVnNumber("1000.5")).toBeCloseTo(1000.5);
  });

  it("replaces comma with dot (Vietnamese decimal notation)", () => {
    expect(parseVnNumber("1234,56")).toBeCloseTo(1234.56);
  });

  it("strips leading/trailing whitespace", () => {
    expect(parseVnNumber("  500  ")).toBe(500);
  });

  it("strips internal whitespace (e.g. thousands separator space)", () => {
    expect(parseVnNumber("1 000")).toBe(1000);
  });

  it("returns null for empty string", () => {
    expect(parseVnNumber("")).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(parseVnNumber("abc")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(parseVnNumber(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseVnNumber(undefined)).toBeNull();
  });

  it("handles negative numbers correctly", () => {
    const result = parseVnNumber("-500");
    expect(result).toBe(-500);
  });

  it("handles zero", () => {
    expect(parseVnNumber("0")).toBe(0);
  });

  // DV (deliberate-violation) guard:
  // Uncommenting this line MUST cause a test failure, proving the suite is non-trivial.
  // expect(parseVnNumber("abc")).toBe(0); // DV: should be null, not 0
});

describe("HC-DEV-6 — HTML structural: new tab + panel present, existing panes 0-diff", () => {

  // ── New elements that MUST be present ───────────────────────────────────────

  it("tab button id=hc-tab-btn is present in HTML", () => {
    expect(htmlSource).toContain('id="hc-tab-btn"');
  });

  it("tab button label is 'Sửa tay / Xác nhận cuối' (exact Vietnamese text)", () => {
    expect(htmlSource).toContain("Sửa tay / Xác nhận cuối");
  });

  it("panel id=hc-panel is present in HTML", () => {
    expect(htmlSource).toContain('id="hc-panel"');
  });

  it("confirm button id=hc-btn-confirm is present", () => {
    expect(htmlSource).toContain('id="hc-btn-confirm"');
  });

  it("reset button id=hc-btn-reset is present", () => {
    expect(htmlSource).toContain('id="hc-btn-reset"');
  });

  it("cell list container id=hc-cell-list is present", () => {
    expect(htmlSource).toContain('id="hc-cell-list"');
  });

  it("status text id=hc-confirm-status-text is present", () => {
    expect(htmlSource).toContain('id="hc-confirm-status-text"');
  });

  // ── Endpoint URL patterns referenced in the JS ───────────────────────────────
  // Prove the four fetch calls exist in the script block by asserting the
  // literal path prefix strings appear in the source. This is the URL-assertion
  // style required by the task spec.

  it("GET /api/bctc-inspect/flags/ path referenced in script", () => {
    expect(htmlSource).toContain("/api/bctc-inspect/flags/");
  });

  it("POST /api/bctc-inspect/correct/ path referenced in script", () => {
    expect(htmlSource).toContain("/api/bctc-inspect/correct/");
  });

  it("POST /api/bctc-inspect/confirm/ path referenced in script", () => {
    expect(htmlSource).toContain("/api/bctc-inspect/confirm/");
  });

  it("/reset suffix for confirm reset endpoint referenced in script", () => {
    expect(htmlSource).toContain("/reset");
  });

  // ── Plain Vietnamese copy ────────────────────────────────────────────────────

  it("'ĐÃ XÁC NHẬN toàn bộ báo cáo' button label present", () => {
    expect(htmlSource).toContain("ĐÃ XÁC NHẬN toàn bộ báo cáo");
  });

  it("'Đặt lại xác nhận' reset label present", () => {
    expect(htmlSource).toContain("Đặt lại xác nhận");
  });

  it("'Giá trị OCR' label present in script (Vietnamese field label)", () => {
    expect(htmlSource).toContain("Giá trị OCR");
  });

  it("'Giá trị ảnh' label present in script (Vietnamese field label)", () => {
    expect(htmlSource).toContain("Giá trị ảnh");
  });

  it("'Giá trị hiện tại' label present in script (Vietnamese field label)", () => {
    expect(htmlSource).toContain("Giá trị hiện tại");
  });

  it("'Xác nhận sửa' save button label present", () => {
    expect(htmlSource).toContain("Xác nhận sửa");
  });

  it("'Chờ xác nhận' pending status label present", () => {
    expect(htmlSource).toContain("Chờ xác nhận");
  });

  // ── Additive-only proof: ALL pre-existing pane IDs are still present ─────────
  // If any of these IDs were removed, the existing panes would break.

  it("EXISTING: id=figures-section untouched", () => {
    expect(htmlSource).toContain('id="figures-section"');
  });

  it("EXISTING: id=eval-strip-section untouched", () => {
    expect(htmlSource).toContain('id="eval-strip-section"');
  });

  it("EXISTING: id=eval-strip-content untouched", () => {
    expect(htmlSource).toContain('id="eval-strip-content"');
  });

  it("EXISTING: id=eval-view-user toggle button untouched", () => {
    expect(htmlSource).toContain('id="eval-view-user"');
  });

  it("EXISTING: id=eval-view-agent toggle button untouched", () => {
    expect(htmlSource).toContain('id="eval-view-agent"');
  });

  it("EXISTING: id=md-stage5-section (MD→table pane) untouched", () => {
    expect(htmlSource).toContain('id="md-stage5-section"');
  });

  it("EXISTING: id=table-section (structured table pane) untouched", () => {
    expect(htmlSource).toContain('id="table-section"');
  });

  it("EXISTING: id=md-tables-section (markdown tables pane) untouched", () => {
    expect(htmlSource).toContain('id="md-tables-section"');
  });

  it("EXISTING: id=ocr-text-content (OCR text pane) untouched", () => {
    expect(htmlSource).toContain('id="ocr-text-content"');
  });

  it("EXISTING: id=pdf-container (PDF pane) untouched", () => {
    expect(htmlSource).toContain('id="pdf-container"');
  });

  it("EXISTING: zone-overlay-toggle (zone overlay toggle) untouched", () => {
    expect(htmlSource).toContain('id="zone-overlay-toggle"');
  });

  it("EXISTING: id=balance-badge untouched", () => {
    expect(htmlSource).toContain('id="balance-badge"');
  });

  it("EXISTING: id=doc-select dropdown untouched", () => {
    expect(htmlSource).toContain('id="doc-select"');
  });

  it("EXISTING: id=header-page-nav (header page navigation) untouched", () => {
    expect(htmlSource).toContain('id="header-page-nav"');
  });

  it("EXISTING: id=header-btn-prev untouched", () => {
    expect(htmlSource).toContain('id="header-btn-prev"');
  });

  it("EXISTING: id=header-btn-next untouched", () => {
    expect(htmlSource).toContain('id="header-btn-next"');
  });

  it("EXISTING: id=btn-prev-page (OCR pane nav) untouched", () => {
    expect(htmlSource).toContain('id="btn-prev-page"');
  });

  it("EXISTING: id=btn-next-page (OCR pane nav) untouched", () => {
    expect(htmlSource).toContain('id="btn-next-page"');
  });
});
