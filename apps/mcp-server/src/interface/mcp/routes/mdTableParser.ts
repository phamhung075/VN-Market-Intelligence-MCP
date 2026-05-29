/**
 * mdTableParser.ts — Pure pipe-table markdown → HTML table converter
 *
 * Extracted from bctc-inspector.html (parsePipeTableToHtml inline function)
 * so the algorithm can be covered by bun:test without a browser.
 *
 * BOUNDARY: interface-layer utility, pure string transform, no side-effects.
 * Used by: bctc-inspector.html (inline copy for browser), and test suite.
 *
 * Format expected:
 *   | Header 0 | Header 1 | Header 2 |
 *   |---|---|---|
 *   | cell      | cell      | cell      |
 *   ...
 *
 * Returns an HTML string — caller is responsible for safe insertion into DOM.
 * escHtml is applied to every cell so XSS is not possible via table content.
 *
 * Partial-table annotation:
 *   When callers know a table spans multiple pages, they should wrap the output
 *   with a partial-fragment label rather than relying on this function. This
 *   function only converts markdown syntax; it has no page-context knowledge.
 */

/** Escape HTML special chars to prevent XSS when injecting into innerHTML. */
export function escHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Parse a GitHub-style pipe-table markdown string into an HTML table.
 *
 * Rules:
 *   Line 0  = header row     "| Col1 | Col2 |"
 *   Line 1  = separator      "|---|---|"  (skipped — not rendered)
 *   Line 2+ = data rows
 *
 * Lines that do not start with "|" are ignored (covers trailing newlines,
 * prose paragraphs mixed into the markdown, etc.).
 *
 * Returns a rendered <table class="md-html-table"> string on success.
 * Returns a fallback <pre> block when the input has no pipe lines.
 */
export function parsePipeTableToHtml(mdTable: string): string {
  if (!mdTable || typeof mdTable !== "string") {
    return `<div class="md-table-no-data">(empty table)</div>`;
  }

  const lines = mdTable
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"));

  if (lines.length === 0) {
    return `<pre style="font-size:11px;color:#666;white-space:pre-wrap">${escHtml(mdTable)}</pre>`;
  }

  // Parse cells from a pipe-delimited line
  function parseCells(line: string): string[] {
    return line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim() || " ");
  }

  // Line 0 = header, Line 1 = separator (skip), Lines 2+ = data
  const headerCells = parseCells(lines[0]!);
  const dataLines = lines.slice(2); // skip separator row

  let html = `<table class="md-html-table"><thead><tr>`;
  for (const h of headerCells) {
    html += `<th>${escHtml(h)}</th>`;
  }
  html += `</tr></thead><tbody>`;

  for (const line of dataLines) {
    const isSeparator = /^\|[-| :]+\|$/.test(line);
    if (isSeparator) continue;
    const cells = parseCells(line);
    html += `<tr>`;
    for (const c of cells) {
      html += `<td>${escHtml(c)}</td>`;
    }
    html += `</tr>`;
  }

  html += `</tbody></table>`;
  return html;
}
