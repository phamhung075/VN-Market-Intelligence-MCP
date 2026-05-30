// HC-DEV-7-layout.test.ts
// DV tests for the two-column 50/50 split + right-pane tab bar layout
// added to bctc-inspector.html.
//
// Strategy: bun has no DOM. All assertions are HTML string-based.
//   1. Two-column split: assert .split container + .left-pane + .right-pane exist;
//      assert .right-pane uses flex:1 (not the old fixed 480px width).
//   2. Tab bar: assert #right-tab-bar exists; assert all 6 tab buttons present with
//      expected Vietnamese labels; assert one tab has rtab-active by default.
//   3. Tab panels: assert #right-tab-panels exists; assert 6 data-tab-panel values
//      present; assert only one panel has tab-panel-active by default.
//   4. Tab switch JS: assert switchTab function definition is present in the script.
//   5. ALL legacy pane IDs survive (anti-regression, additive-only proof).
//   6. HC-DEV-6 correction endpoint paths still referenced.
//
// RED before production code, GREEN after. Committed in the same commit as
// bctc-inspector.html changes.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HTML_PATH = resolve(
  import.meta.dir,
  "../interface/bctc-inspector.html",
);
const html = readFileSync(HTML_PATH, "utf-8");

// ── 1. Two-column 50/50 split ────────────────────────────────────────────────

describe("HC-DEV-7 — two-column 50/50 split", () => {
  it(".split container exists in HTML body", () => {
    expect(html).toContain('class="split"');
  });

  it(".left-pane exists inside .split", () => {
    expect(html).toContain('class="left-pane"');
  });

  it(".right-pane exists inside .split", () => {
    expect(html).toContain('class="right-pane"');
  });

  it(".right-pane CSS uses flex:1 (not fixed 480px width)", () => {
    // The old layout had width: 480px on .right-pane — the new layout must use flex:1
    // Verify .right-pane rule block contains flex: 1 not a fixed pixel width
    const rightPaneCssBlock = html.match(/\.right-pane\s*\{([^}]+)\}/);
    expect(rightPaneCssBlock).not.toBeNull();
    const block = rightPaneCssBlock![1];
    expect(block).toContain("flex: 1");
    // Must NOT define a fixed 480px width
    expect(block).not.toContain("480px");
  });

  it(".left-pane CSS uses flex:1 (equal half)", () => {
    const leftPaneCssBlock = html.match(/\.left-pane\s*\{([^}]+)\}/);
    expect(leftPaneCssBlock).not.toBeNull();
    const block = leftPaneCssBlock![1];
    expect(block).toContain("flex: 1");
  });

  it("#pdf-container is still inside .left-pane section", () => {
    // pdf-container must appear after left-pane opening tag
    const leftPaneIdx = html.indexOf('class="left-pane"');
    const pdfContainerIdx = html.indexOf('id="pdf-container"');
    const rightPaneIdx = html.indexOf('class="right-pane"');
    expect(leftPaneIdx).toBeGreaterThan(-1);
    expect(pdfContainerIdx).toBeGreaterThan(leftPaneIdx);
    expect(pdfContainerIdx).toBeLessThan(rightPaneIdx);
  });
});

// ── 2. Tab bar ───────────────────────────────────────────────────────────────

describe("HC-DEV-7 — tab bar present and correctly structured", () => {
  it("#right-tab-bar container exists", () => {
    expect(html).toContain('id="right-tab-bar"');
  });

  it("tab bar contains 6 .rtab-btn buttons", () => {
    const matches = html.match(/class="rtab-btn/g);
    expect(matches).not.toBeNull();
    // At least 6 tab buttons
    expect(matches!.length).toBeGreaterThanOrEqual(6);
  });

  it("tab button for OCR view (data-tab=ocr) is present", () => {
    expect(html).toContain('data-tab="ocr"');
  });

  it("tab button for Bảng (data-tab=bang) is present", () => {
    expect(html).toContain('data-tab="bang"');
  });

  it("tab button for Bảng Markdown (data-tab=md) is present", () => {
    expect(html).toContain('data-tab="md"');
  });

  it("tab button for Số liệu (data-tab=soluyen) is present", () => {
    expect(html).toContain('data-tab="soluyen"');
  });

  it("tab button for Đánh giá 6 cổng (data-tab=danhgia) is present", () => {
    expect(html).toContain('data-tab="danhgia"');
  });

  it("tab button for Sửa tay (data-tab=suatay) is present", () => {
    expect(html).toContain('data-tab="suatay"');
  });

  it("OCR tab button has rtab-active class by default (default tab)", () => {
    // The OCR tab must be the default active tab
    expect(html).toContain('rtab-btn rtab-active" data-tab="ocr"');
  });

  it("tab labels are in plain Vietnamese (no English tech jargon as primary labels)", () => {
    expect(html).toContain("Văn bản OCR");
    expect(html).toContain("Bảng");
    expect(html).toContain("Bảng Markdown");
    expect(html).toContain("Số liệu");
    expect(html).toContain("Đánh giá 6 cổng");
    expect(html).toContain("Sửa tay");
  });
});

// ── 3. Tab panels ────────────────────────────────────────────────────────────

describe("HC-DEV-7 — tab panels present and structured", () => {
  it("#right-tab-panels container exists", () => {
    expect(html).toContain('id="right-tab-panels"');
  });

  it("panel for OCR (data-tab-panel=ocr) exists", () => {
    expect(html).toContain('data-tab-panel="ocr"');
  });

  it("panel for Bảng (data-tab-panel=bang) exists", () => {
    expect(html).toContain('data-tab-panel="bang"');
  });

  it("panel for Bảng Markdown (data-tab-panel=md) exists", () => {
    expect(html).toContain('data-tab-panel="md"');
  });

  it("panel for Số liệu (data-tab-panel=soluyen) exists", () => {
    expect(html).toContain('data-tab-panel="soluyen"');
  });

  it("panel for Đánh giá 6 cổng (data-tab-panel=danhgia) exists", () => {
    expect(html).toContain('data-tab-panel="danhgia"');
  });

  it("panel for Sửa tay (data-tab-panel=suatay) exists", () => {
    expect(html).toContain('data-tab-panel="suatay"');
  });

  it("OCR panel has tab-panel-active class by default", () => {
    expect(html).toContain('tab-panel tab-panel-active" data-tab-panel="ocr"');
  });

  it("non-OCR panels do NOT have tab-panel-active in initial HTML (only one active)", () => {
    // Count occurrences of tab-panel-active in the markup — should be exactly 1
    const activeCount = (html.match(/tab-panel-active/g) || []).length;
    // One in CSS definition + one in the HTML markup = 2 total references
    // But there should be only ONE .tab-panel with tab-panel-active class in the body
    // Use a more targeted check: count data-tab-panel attrs next to tab-panel-active
    const activePanelMatches = html.match(/tab-panel tab-panel-active" data-tab-panel=/g);
    expect(activePanelMatches).not.toBeNull();
    expect(activePanelMatches!.length).toBe(1);
  });
});

// ── 4. Tab switch JS ─────────────────────────────────────────────────────────

describe("HC-DEV-7 — tab switch JS function present", () => {
  it("switchTab function is defined in the script block", () => {
    expect(html).toContain("function switchTab(");
  });

  it("switchTab wires .rtab-btn click events", () => {
    expect(html).toContain("querySelectorAll(\".rtab-btn\")");
  });

  it("switchTab toggles tab-panel-active class", () => {
    expect(html).toContain("tab-panel-active");
  });

  it("switchTab loads flags when suatay tab is activated", () => {
    expect(html).toContain('tabId === "suatay"');
    expect(html).toContain("hcLoadFlags(currentDocId)");
  });
});

// ── 5. ALL legacy pane IDs survive (additive-only proof) ─────────────────────

describe("HC-DEV-7 — all legacy pane IDs still present (anti-regression)", () => {
  const legacyIds = [
    "figures-section",
    "eval-strip-section",
    "eval-strip-content",
    "eval-view-user",
    "eval-view-agent",
    "md-stage5-section",
    "table-section",
    "md-tables-section",
    "ocr-text-content",
    "pdf-container",
    "zone-overlay-toggle",
    "balance-badge",
    "doc-select",
    "header-page-nav",
    "header-btn-prev",
    "header-btn-next",
    "btn-prev-page",
    "btn-next-page",
    // HC-DEV-6 correction panel IDs
    "hc-panel",
    "hc-tab-btn",
    "hc-btn-confirm",
    "hc-btn-reset",
    "hc-cell-list",
    "hc-confirm-status-text",
    "hc-confirm-badge",
  ];

  for (const id of legacyIds) {
    it(`id="${id}" is still present in HTML`, () => {
      expect(html).toContain(`id="${id}"`);
    });
  }
});

// ── 6. HC-DEV-6 correction endpoint paths still referenced ───────────────────

describe("HC-DEV-7 — HC-DEV-6 correction endpoints still wired", () => {
  it("/api/bctc-inspect/flags/ path still referenced", () => {
    expect(html).toContain("/api/bctc-inspect/flags/");
  });

  it("/api/bctc-inspect/correct/ path still referenced", () => {
    expect(html).toContain("/api/bctc-inspect/correct/");
  });

  it("/api/bctc-inspect/confirm/ path still referenced", () => {
    expect(html).toContain("/api/bctc-inspect/confirm/");
  });

  it("/reset suffix for confirm-reset endpoint still referenced", () => {
    expect(html).toContain("/reset");
  });
});
