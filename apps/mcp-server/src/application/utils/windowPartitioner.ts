/**
 * windowPartitioner.ts — FR-12 Page-Window Partitioning Utility
 * size-justification: 149L — FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-
 * CROSSWINDOW (2026-08-12, +34L from 115L) made the truncated_continuation
 * flag real (Window field + partitionIntoWindows tracking) and corrected two
 * stale docstring paragraphs claiming behavior the code never implemented —
 * a single-file, single-function module with no further split seam.
 *
 * Sprint BCTC-AGENTIC-REFINE
 * DDD layer: application (pure function, no I/O, deterministic)
 *
 * Migrated from bctcRefineJob.ts per §0.7.4 (Option-Y ruling):
 * partitionIntoWindows() lives here so it can be imported by the fleet cron
 * flow and finalizeBctcRefineTool without coupling to the scheduler layer.
 *
 * INVARIANT (as actually implemented — corrected 2026-08-08, was previously
 * aspirational/inaccurate, see SPIKE-BCTC-REFINE-MAXWINDOW-TRUNCATION Finding 2):
 * partitionIntoWindows() runs to completion before any subagent spawns, and
 * every page lands in exactly one window (no page is ever dropped). A
 * continuation table CAN legitimately span MULTIPLE windows when it exceeds
 * maxWindowPages — that split is safe because refinedMarkdownParser.ts
 * threads column-layout state across windows (see resolveColumnLayout's
 * inheritedLayout param), so a truncation-tail window's rows never get a
 * silently-wrong code/label order even though it has no header of its own.
 *
 * @module application/utils/windowPartitioner
 */

import { classifyPageForImageLoad } from "./pageClassifier.js";
import { logger } from "../../infrastructure/logger.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PageText {
  page: number;
  text: string;
}

export interface Window {
  unit_id: string;
  page_numbers: number[];
  texts: string[];
  needsImage: boolean[];
  /**
   * FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW: true when this
   * window's first page is ITSELF a continuation page whose true head window
   * (carrying the table's real header) was cut short by the maxWindowPages
   * cap on the PRECEDING iteration — i.e. this window exists BECAUSE OF
   * truncation, not because a new table genuinely starts here. This is the
   * flag the module docstring below (§ Algorithm) has claimed since
   * inception without ever being implemented (0 grep hits pre-fix — see
   * SPIKE-BCTC-REFINE-MAXWINDOW-TRUNCATION Finding 0). Correctness does NOT
   * depend on any caller reading this field — refinedMarkdownParser.ts's
   * cross-window column-layout inheritance (initialColumnLayout /
   * finalColumnLayout) fixes the code/label-swap defect unconditionally.
   * This flag exists for observability/triage only (surfaced to callers as
   * RefineWindow.truncated_continuation in getBctcPendingRefineTool.ts).
   */
  truncated_continuation: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CONTINUATION_MARKER = /tiếp theo|continued/i;

// ── Window partitioning ────────────────────────────────────────────────────────

/**
 * Partition page texts into windows respecting the continuation-table invariant.
 *
 * CRITICAL: This function runs to completion before ANY subagent spawns.
 * A table spanning page N and N+1 MUST land in ONE window (never split).
 *
 * Algorithm:
 * - Standalone page → 1-page window
 * - If page N+1 header contains a continuation marker → include in same window
 * - Multi-page windows capped at maxWindowPages. A cap-hit does NOT drop or
 *   merge pages — it starts a new window at the next page, which is itself
 *   still mid-continuation and carries NO header of its own. That new
 *   window is marked `truncated_continuation: true` (real field — see the
 *   Window interface below; this comment previously claimed the flag
 *   existed when it did not).
 *
 * @param pageTexts  Array of { page, text } sorted by page number
 * @param config     { maxWindowPages } from REFINE_MAX_WINDOW_PAGES env var
 * @returns          Array of Window objects (unit_id, page_numbers, texts, needsImage)
 */
export function partitionIntoWindows(
  pageTexts: PageText[],
  config: { maxWindowPages: number },
): Window[] {
  const windows: Window[] = [];
  let i = 0;
  // FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW: true when the
  // window about to be built starts BECAUSE the previous window's
  // continuation table was cut short by the cap (see Window.truncated_continuation doc).
  let pendingTruncationTail = false;

  while (i < pageTexts.length) {
    const page = pageTexts[i]!;
    const ocrText = page.text;

    // Determine image classification for this page
    const prevWasImage =
      windows.length > 0 &&
      (windows[windows.length - 1]!.needsImage.some(Boolean));
    const needsImage = classifyPageForImageLoad(ocrText, prevWasImage);

    // Build the window starting from this page
    const pageNums = [page.page];
    const texts = [ocrText];
    const needsImages = [needsImage];

    let j = i + 1;
    while (j < pageTexts.length && pageNums.length < config.maxWindowPages) {
      const nextPage = pageTexts[j]!;
      if (CONTINUATION_MARKER.test(nextPage.text)) {
        pageNums.push(nextPage.page);
        texts.push(nextPage.text);
        const prevImg = needsImages[needsImages.length - 1]!;
        needsImages.push(classifyPageForImageLoad(nextPage.text, prevImg));
        j++;
      } else {
        break;
      }
    }

    // Check if we hit the cap mid-continuation
    let hitCapTruncation = false;
    if (j < pageTexts.length && pageNums.length === config.maxWindowPages) {
      const nextPage = pageTexts[j]!;
      if (CONTINUATION_MARKER.test(nextPage.text)) {
        logger.warn("[windowPartitioner] continuation window truncated at maxWindowPages", {
          startPage: page.page,
          maxWindowPages: config.maxWindowPages,
        });
        hitCapTruncation = true;
      }
    }

    windows.push({
      unit_id: `unit-${String(windows.length).padStart(4, "0")}`,
      page_numbers: pageNums,
      texts,
      needsImage: needsImages,
      truncated_continuation: pendingTruncationTail,
    });

    pendingTruncationTail = hitCapTruncation;
    i = j;
  }

  return windows;
}
