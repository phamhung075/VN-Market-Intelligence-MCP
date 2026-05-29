/**
 * md-table-parser.test.ts — Tests for parsePipeTableToHtml (interface viewer utility)
 *
 * Sprint: BCTC-EVAL-INSPECT-MERGE, Task #9 additive enhancement
 *
 * Coverage:
 *   TC-P1  Normal two-column table → <table> with headers + data rows
 *   TC-P2  Partial table (fragment case) — truncated at page boundary → correct parse + partial note guidance
 *   TC-P3  Empty / null input → fallback div
 *   TC-P4  Input with no pipe lines → fallback pre block
 *   TC-P5  Separator-only extra separator inside data rows → skipped
 *   TC-P6  XSS guard — cell content with < > & " is escaped
 *   TC-P7  Whitespace-only cell → rendered as single space (non-collapsing)
 *
 * DELIBERATE-VIOLATION smoke (DV-3 — anti-false-green per feedback_fence_false_green):
 *   DV-3  Proves the table header assertion is NOT hollow:
 *         If parsePipeTableToHtml returned a <pre> block (no <table>),
 *         the `<table` contains-check would fail → goes RED.
 *         This test uses a deliberately-broken input to prove the fallback fires RED
 *         on a real table input, and fires GREEN on the correct path.
 *
 * Uses bun:test — zero creds, zero network, zero container.
 */

import { describe, it, expect } from "bun:test";
import { parsePipeTableToHtml, escHtml } from "../interface/mcp/routes/mdTableParser.js";

// ─── TC-P1: Normal two-column table ──────────────────────────────────────────

describe("parsePipeTableToHtml — TC-P1: normal table", () => {
  it("produces <table> with correct headers and data rows", () => {
    const md = [
      "| Chỉ tiêu | Giá trị |",
      "|---|---|",
      "| Doanh thu | 1,234,567 |",
      "| Lợi nhuận | 456,789 |",
    ].join("\n");

    const html = parsePipeTableToHtml(md);

    // Must produce a table element
    expect(html).toContain("<table");
    expect(html).toContain("</table>");

    // Headers correct
    expect(html).toContain("<th>Chỉ tiêu</th>");
    expect(html).toContain("<th>Giá trị</th>");

    // Data rows
    expect(html).toContain("<td>Doanh thu</td>");
    expect(html).toContain("<td>1,234,567</td>");
    expect(html).toContain("<td>Lợi nhuận</td>");
    expect(html).toContain("<td>456,789</td>");

    // Separator row NOT rendered as data row
    const tdCount = (html.match(/<td>/g) ?? []).length;
    // 2 data rows × 2 cols = 4 <td> elements
    expect(tdCount).toBe(4);
  });

  it("three-column table parses all columns", () => {
    const md = [
      "| Code | Tên khoản mục | Năm 2024 |",
      "|---|---|---|",
      "| 100 | Tài sản ngắn hạn | 50,000 |",
      "| 200 | Tài sản dài hạn | 120,000 |",
    ].join("\n");

    const html = parsePipeTableToHtml(md);
    expect(html).toContain("<th>Code</th>");
    expect(html).toContain("<th>Tên khoản mục</th>");
    expect(html).toContain("<th>Năm 2024</th>");
    expect(html).toContain("<td>100</td>");
    expect(html).toContain("<td>Tài sản ngắn hạn</td>");
    expect(html).toContain("<td>50,000</td>");
  });
});

// ─── TC-P2: Partial table (fragment case) ────────────────────────────────────
//
// Honesty requirement: when a stitched_markdown spans multiple pages, the viewer
// labels the output with a [FRAGMENT TRANG] banner. The parser itself does NOT
// know page context — it converts whatever markdown it receives.
// This test verifies: a partial/truncated table (last data row cut mid-sentence)
// still produces valid HTML output — the truncated cell is escaped and displayed.
// The CALLER is responsible for adding the fragment label; the parser must not crash.

describe("parsePipeTableToHtml — TC-P2: partial table fragment", () => {
  it("truncated table (page break mid-unit) produces valid HTML — does not crash", () => {
    // A table whose last row is cut off (simulating a page boundary mid-unit)
    const md = [
      "| Code | Giá trị | Kỳ trước |",
      "|---|---|---|",
      "| 100 | 50,000 | 45,000 |",
      "| 200 | 120,000 | 115,000 |",
      // Row 3 is cut — only partial content (simulating page boundary)
      "| 300 | (tiếp trang sau)",
    ].join("\n");

    const html = parsePipeTableToHtml(md);

    // Must still produce a table (not crash or fall back to pre)
    expect(html).toContain("<table");
    expect(html).toContain("</table>");

    // Headers still correct
    expect(html).toContain("<th>Code</th>");

    // Complete rows rendered
    expect(html).toContain("<td>100</td>");
    expect(html).toContain("<td>200</td>");

    // Partial row is rendered (truncated cell) — not dropped entirely
    expect(html).toContain("<td>300</td>");

    // The truncated cell text is present and escaped
    expect(html).toContain("tiếp trang sau");
  });

  it("partial table — fragment label is caller responsibility (parser does not add it)", () => {
    // This verifies that parsePipeTableToHtml does NOT inject fragment labels.
    // The viewer's renderMdStage5View function adds the banner based on page_numbers_json.
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const html = parsePipeTableToHtml(md);

    // Parser must NOT add any fragment label — caller does this
    expect(html).not.toContain("FRAGMENT");
    expect(html).not.toContain("trang sau");
  });
});

// ─── TC-P3: Empty / null input → fallback ────────────────────────────────────

describe("parsePipeTableToHtml — TC-P3: empty/null input", () => {
  it("empty string returns fallback div", () => {
    const html = parsePipeTableToHtml("");
    expect(html).toContain("md-table-no-data");
    expect(html).not.toContain("<table");
  });

  it("null-like input (empty string) returns fallback div, not a crash", () => {
    // Function signature expects string; test the guard branch
    const html = parsePipeTableToHtml("" as string);
    expect(html).toContain("md-table-no-data");
  });
});

// ─── TC-P4: Input with no pipe lines → fallback pre ─────────────────────────

describe("parsePipeTableToHtml — TC-P4: no pipe lines", () => {
  it("prose text without pipes returns fallback <pre> block", () => {
    const md = "This is just prose text.\nNo table here.";
    const html = parsePipeTableToHtml(md);

    expect(html).toContain("<pre");
    expect(html).not.toContain("<table");
    // Content is present (escaped)
    expect(html).toContain("This is just prose text.");
  });
});

// ─── TC-P5: Extra separator rows inside data section ─────────────────────────

describe("parsePipeTableToHtml — TC-P5: extra separator rows skipped", () => {
  it("separator-like rows within data section are skipped, not rendered as <tr>", () => {
    const md = [
      "| Label | Value |",
      "|---|---|",
      "| A | 100 |",
      "|---|---|",   // extra separator — common in some table generators
      "| B | 200 |",
    ].join("\n");

    const html = parsePipeTableToHtml(md);
    expect(html).toContain("<td>A</td>");
    expect(html).toContain("<td>B</td>");

    // Only 2 data rows × 2 cols = 4 <td> elements (extra separator NOT rendered)
    const tdCount = (html.match(/<td>/g) ?? []).length;
    expect(tdCount).toBe(4);
  });
});

// ─── TC-P6: XSS guard ────────────────────────────────────────────────────────

describe("parsePipeTableToHtml — TC-P6: XSS guard", () => {
  it("< > & \" in cell content are HTML-escaped", () => {
    const md = [
      "| Col |",
      "|---|",
      '| <script>alert("xss")</script> |',
      "| A > B & C < D |",
    ].join("\n");

    const html = parsePipeTableToHtml(md);

    // Raw script tag must NOT appear
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("</script>");

    // Escaped versions must appear
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&gt;");
  });
});

// ─── TC-P7: Whitespace-only cell ─────────────────────────────────────────────

describe("parsePipeTableToHtml — TC-P7: whitespace-only cell", () => {
  it("empty/whitespace cell renders as single space (preserves column alignment)", () => {
    const md = [
      "| A | B |",
      "|---|---|",
      "|   | 100 |",
    ].join("\n");

    const html = parsePipeTableToHtml(md);
    // The empty cell should render as a <td> with a single space
    expect(html).toContain("<td> </td>");
    expect(html).toContain("<td>100</td>");
  });
});

// ─── TC-escHtml: escHtml utility ─────────────────────────────────────────────

describe("escHtml — standalone utility", () => {
  it("null/undefined returns empty string", () => {
    expect(escHtml(null)).toBe("");
    expect(escHtml(undefined)).toBe("");
  });

  it("escapes all four XSS chars", () => {
    expect(escHtml('<a href="foo">bar & baz</a>')).toBe(
      "&lt;a href=&quot;foo&quot;&gt;bar &amp; baz&lt;/a&gt;",
    );
  });

  it("plain text passes through unchanged", () => {
    expect(escHtml("Doanh thu thuần 2024")).toBe("Doanh thu thuần 2024");
  });
});

// ─── DV-3: DELIBERATE-VIOLATION smoke ────────────────────────────────────────
//
// Proves the <table> contains-check is NOT hollow.
//
// RED PROOF (documented here):
//   If parsePipeTableToHtml returned a <pre> block for valid pipe-table input,
//   the assertion `expect(html).toContain("<table")` would FAIL with:
//   Expected string to contain "<table".
//
// The live assertion below verifies:
//   (a) A prose input (no pipes) → fallback <pre>, NOT <table>
//   (b) A valid pipe table → always produces <table>
//   If (a) and (b) were swapped in the implementation, BOTH assertions would fail.
//   This proves the gate is not hollow.

describe("parsePipeTableToHtml — DV-3: deliberate-violation smoke (anti-false-green)", () => {
  it("LIVE PROOF: prose input never produces <table>, pipe-table always does (gate is not hollow)", () => {
    const proseInput = "This is plain text.\nNo pipes here.\nJust words.";
    const tableInput = "| H1 | H2 |\n|---|---|\n| v1 | v2 |";

    const proseHtml = parsePipeTableToHtml(proseInput);
    const tableHtml = parsePipeTableToHtml(tableInput);

    // (a) prose → <pre> fallback, NOT <table>
    // If implementation returned <table> for prose, this goes RED.
    expect(proseHtml).not.toContain("<table");
    expect(proseHtml).toContain("<pre");

    // (b) pipe-table → <table>, NOT just <pre>
    // If implementation returned <pre> for pipe input, this goes RED.
    expect(tableHtml).toContain("<table");
    expect(tableHtml).not.toContain("<pre");

    // (c) Verify the table has the correct data — if parsing is wrong, this goes RED
    expect(tableHtml).toContain("<th>H1</th>");
    expect(tableHtml).toContain("<td>v1</td>");
  });
});
