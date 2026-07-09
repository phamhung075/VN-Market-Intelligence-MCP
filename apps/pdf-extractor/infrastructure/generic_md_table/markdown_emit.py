"""
infrastructure/generic_md_table/markdown_emit.py — MD-EXTRACT-9 (Stage 2/8)

Markdown emission: two pure functions that turn extracted data into markdown.

    ocr_text_to_markdown(text)         — flat OCR text → readable markdown (doc-level).
    _emit_markdown_table(grid, ...)    — 2-D grid → GFM markdown pipe-table (table-level).

Pure functions: no I/O, no Tesseract, no PIL. Extracted verbatim from
infrastructure/generic_md_table_extractor.py (FACTORY-PDF-split-generic-md-table)
— see docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md.

DDD layer: infrastructure (pure — safe to unit test without OCR/PDF fixtures).
"""

from __future__ import annotations

from typing import List

# Infra-to-infra import: reuse module-level helpers (not class methods — safe).
# _norm is unused directly in this module (kept for import parity with the
# original god-file, which imported both names from the same line).
from infrastructure.text_table_extractor import _norm, _is_recognized_section_header  # noqa: F401

from infrastructure.generic_md_table.constants import _NUMERIC_RE


def ocr_text_to_markdown(text: str) -> str:
    """
    Convert flat OCR text (from image_to_string output) to readable markdown.

    Pure function: no I/O, no Tesseract, no imports beyond stdlib.

    Algorithm:
        1. Split on newlines.
        2. Lines matching _is_recognized_section_header() → wrapped as ## Header.
        3. Blank lines → blank line (paragraph break).
        4. Lines with ≥4-char numeric data tokens → prefixed with "> " (blockquote).
        5. All other lines → plain paragraph text.

    This is a simple heuristic transform — it converts what is already stored in
    pdf_extracted_text to a more readable form. The full table reconstruction
    comes from the bbox path (Steps A-G in GenericMdTableExtractor).

    Args:
        text: Flat OCR text string (may be empty or None).

    Returns:
        Markdown-formatted string. Empty string if input is empty/None.
    """
    if not text:
        return ""

    lines = text.splitlines()
    output: List[str] = []

    for line in lines:
        stripped = line.strip()

        if not stripped:
            # Blank line → paragraph break
            output.append("")
            continue

        if _is_recognized_section_header(stripped):
            # Promote structural section headers to H2
            output.append(f"## {stripped}")
            continue

        # Numeric data lines (financial rows): blockquote for tabular feel
        if _NUMERIC_RE.search(stripped) and len(_NUMERIC_RE.findall(stripped)) >= 1:
            # Only blockquote lines that are predominantly data (have ≥1 numeric token
            # of ≥4 chars — avoids blockquoting single-digit section numbers)
            numeric_tokens = [t for t in _NUMERIC_RE.findall(stripped) if len(t) >= 4]
            if numeric_tokens:
                output.append(f"> {stripped}")
                continue

        # Default: plain paragraph text
        output.append(stripped)

    return "\n".join(output)


def _emit_markdown_table(grid: List[List[str]], n_header_rows: int) -> str:
    """
    Step G — Markdown pipe-table emission.

    Generates a GitHub-flavoured markdown pipe-table from the assembled grid.

    Rules:
      - Header rows are separated from data rows by a |---|...| separator.
      - Cell text: stripped, pipe characters escaped as \\|.
      - Empty cells rendered as single space.

    Args:
        grid:         2-D list of strings (Step E output).
        n_header_rows: Number of header rows (Step F output).

    Returns:
        Markdown pipe-table string, or empty string if grid is empty.
    """
    if not grid:
        return ""

    n_cols = len(grid[0]) if grid else 0
    if n_cols == 0:
        return ""

    def _cell(text: str) -> str:
        """Sanitize a cell value for markdown table emission."""
        cleaned = text.strip().replace("|", "\\|")
        return cleaned if cleaned else " "

    lines: List[str] = []

    for row_idx, row in enumerate(grid):
        # Pad/trim row to n_cols
        padded = list(row) + [" "] * (n_cols - len(row))
        padded = padded[:n_cols]
        line = "| " + " | ".join(_cell(c) for c in padded) + " |"
        lines.append(line)

        # Insert separator after the last header row.
        # D2 fix (MD-EXTRACT-5): valid GFM |---|---|---| (no doubled pipes).
        # Old (WRONG): "|" + "|".join(["---|"] * n) → |---||---||---| (doubled |)
        # New (CORRECT): "|" + "|".join(["---"] * n) + "|" → |---|---|---|
        if row_idx == n_header_rows - 1:
            separator = "|" + "|".join(["---"] * n_cols) + "|"
            lines.append(separator)

    return "\n".join(lines)
