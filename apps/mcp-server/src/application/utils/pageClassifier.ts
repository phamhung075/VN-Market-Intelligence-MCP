/**
 * pageClassifier.ts — FR-5 Selective Image Loading Classifier
 *
 * Sprint BCTC-AGENTIC-REFINE
 * DDD layer: application (pure function, no I/O, unit-testable)
 *
 * Determines whether a page requires image loading in addition to OCR text.
 * Called by the refine orchestrator before spawning subagents to minimize
 * token cost (image-only for table-dense/continuation pages).
 *
 * @module application/utils/pageClassifier
 */

// Table-structural token patterns (from bctc_page_grouper.py D4 absorption)
// Pipe character = table delimiter
const TABLE_PIPE = /\|/;
// Numeric column: digit groups separated by whitespace (e.g. "1 234 567" or "1.234.567")
// Requires whitespace separator OR repeated 3-digit groups with dots to distinguish from years
const NUMERIC_COLUMNS = /\d[\d,]*\s+\d{3,}|\d{1,3}(?:\.\d{3}){2,}/;
const VN_COLUMN_HEADERS = /Mã số|Thuyết minh|Số cuối|Số đầu|chỉ tiêu/i;
const CONTINUATION_MARKERS = /tiếp theo|continued/i;

/**
 * Classify a page to determine whether it requires image loading.
 *
 * Returns true when:
 * - Page OCR text contains table-structural tokens (pipe characters)
 * - Page OCR text contains digit sequences (numeric columns)
 * - Page OCR text contains Vietnamese column-header keywords
 * - Page is a continuation window (prev was image) AND contains continuation markers
 *
 * Returns false for prose-only pages with no table structure.
 *
 * @param ocrText         OCR text content of the page
 * @param prevPageWasImage Whether the previous page was image-loaded
 * @returns true if image loading is required for this page
 */
export function classifyPageForImageLoad(
  ocrText: string,
  prevPageWasImage: boolean,
): boolean {
  // Check for pipe characters (table delimiters)
  if (TABLE_PIPE.test(ocrText)) return true;

  // Check for numeric column patterns (spaces between digit groups or repeated dot-separated groups)
  if (NUMERIC_COLUMNS.test(ocrText)) return true;

  // Check for Vietnamese column-header keywords
  if (VN_COLUMN_HEADERS.test(ocrText)) return true;

  // Continuation window: if previous page was image-loaded, check for continuation markers
  if (prevPageWasImage && CONTINUATION_MARKERS.test(ocrText)) return true;

  return false;
}
