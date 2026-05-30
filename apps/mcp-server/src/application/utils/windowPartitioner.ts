/**
 * windowPartitioner.ts — FR-12 Page-Window Partitioning Utility
 *
 * Sprint BCTC-AGENTIC-REFINE
 * DDD layer: application (pure function, no I/O, deterministic)
 *
 * Migrated from bctcRefineJob.ts per §0.7.4 (Option-Y ruling):
 * partitionIntoWindows() lives here so it can be imported by the fleet cron
 * flow and finalizeBctcRefineTool without coupling to the scheduler layer.
 *
 * CRITICAL invariant: partitionIntoWindows() MUST run to completion before
 * any subagent spawns. A continuation table spanning page N and N+1 MUST
 * land in ONE window — never split across two subagents.
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
 * - Multi-page windows capped at maxWindowPages (truncated_continuation flag)
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
    if (j < pageTexts.length && pageNums.length === config.maxWindowPages) {
      const nextPage = pageTexts[j]!;
      if (CONTINUATION_MARKER.test(nextPage.text)) {
        logger.warn("[windowPartitioner] continuation window truncated at maxWindowPages", {
          startPage: page.page,
          maxWindowPages: config.maxWindowPages,
        });
      }
    }

    windows.push({
      unit_id: `unit-${String(windows.length).padStart(4, "0")}`,
      page_numbers: pageNums,
      texts,
      needsImage: needsImages,
    });

    i = j;
  }

  return windows;
}
