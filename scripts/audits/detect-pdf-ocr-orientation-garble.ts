#!/usr/bin/env bun
/**
 * scripts/audits/detect-pdf-ocr-orientation-garble.ts
 *
 * FIX-MCPSERVER-PDFOCRWORKER-OCRONEPAGE-NO-ORIENTATION-4TH-OCR-SITE — corpus
 * scope detector, re-homed here per dev-standards Script Persistence. The
 * router's original scan (docs/signals/20260825T235317Z-pdfocr-orientation-
 * corpus-scope-79-files-supersedes-qa-estimate.json) ran this logic from
 * scratchpad/scan2.py + cost.py for one session only and was never persisted
 * — this file is the durable replacement so the next sweep (or a re-check
 * after a partial sweep) doesn't have to re-derive the discriminator.
 *
 * CALIBRATED DISCRIMINATOR (router, 4 known-garbled vs 5 known-correct pages,
 * clean separation, no overlap — do not recalibrate):
 *   garbled  <=>  vietnamese_diacritic_density < 0.10  AND  reversed_token_hits >= 3
 *     garbled : density 0.017-0.058, hits 11-72
 *     correct : density 0.222-0.270, hits 0
 *
 * GUARDS (both load-bearing, confirmed by the router's spot-check):
 *  - skip pages with <200 alpha chars (short/blank pages are a DIFFERENT
 *    defect — total-OCR-miss / near-blank page, not orientation garble)
 *  - str()-coerce text_content: SQLite is dynamically typed and some rows
 *    store INTEGER in that column; calling a regex .match() on a number
 *    would throw
 *
 * KNOWN PRECISION LIMIT (disclosed by router, carried forward verbatim):
 *   the predicate detects "page is broken", slightly broader than "page is
 *   rotated" — of 6 spot-checked hits, 5/6 were orientation garble and 1/6
 *   (SAB_2026_Q1 p10) was a near-blank total-OCR-miss. A separate population
 *   (low-diacritic density but ZERO signature hits — ~199 files / 1706 pages
 *   in the full scan) is mostly legitimate English/numeric pages and must
 *   NOT be swept under this discriminator.
 *
 * Usage:
 *   bun scripts/audits/detect-pdf-ocr-orientation-garble.ts [--db <path>] [--json]
 *
 * Default output: one line per affected file (filename, page count, comma
 * page list) sorted by page count desc, plus a TOTAL summary line.
 * --json: machine-readable {files_affected, pages_affected, by_file, rows}.
 *
 * Env:
 *   DB_PATH — override DB path (default: <repo-root>/data/live/market.db —
 *             the LIVE named-volume mirror, NOT the 14MB data/market.db,
 *             which is stale)
 *
 * Exit codes: 0 success | 1 DB not found
 */

import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const REVERSED_TOKEN_RE =
  /\b(Bu[oộôó]p|yeq|Yu[ilr]y|nes|u[eệ]n[yh]u|eno|enuy|Bugp|Budp|Bud[ií]p|Buoyy|jeos|neq|Aex|oyo|uea|Yury|yueop|Budng|Bunp)\b/gi;

const DIACRITIC_RE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/gi;
const ALPHA_RE = /\p{L}/gu;

const ALPHA_SKIP_THRESHOLD = 200;
const DENSITY_THRESHOLD = 0.10;
const HITS_THRESHOLD = 3;

function countMatches(re: RegExp, s: string): number {
  const m = s.match(re);
  return m ? m.length : 0;
}

export function classifyPage(rawTextContent: unknown): {
  alphaCount: number;
  density: number;
  hits: number;
  garbled: boolean;
  skipped: boolean;
} {
  const text = String(rawTextContent ?? "");
  const alphaCount = countMatches(ALPHA_RE, text);
  if (alphaCount < ALPHA_SKIP_THRESHOLD) {
    return { alphaCount, density: NaN, hits: 0, garbled: false, skipped: true };
  }
  const diacriticCount = countMatches(DIACRITIC_RE, text);
  const hits = countMatches(REVERSED_TOKEN_RE, text);
  const density = diacriticCount / alphaCount;
  const garbled = density < DENSITY_THRESHOLD && hits >= HITS_THRESHOLD;
  return { alphaCount, density, hits, garbled, skipped: false };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const dbIdx = args.indexOf("--db");
  const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");
  const DB_PATH =
    dbIdx >= 0 ? args[dbIdx + 1] : (Bun.env["DB_PATH"] ?? resolve(PROJECT_ROOT, "data", "live", "market.db"));

  if (!existsSync(DB_PATH)) {
    console.error(`ERROR: DB not found at ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });
  const rows = db
    .query<{ filename: string; page_number: number; text_content: unknown }, []>(
      "SELECT filename, page_number, text_content FROM pdf_extracted_text",
    )
    .all();

  const byFile = new Map<string, number[]>();
  const results: Array<{ filename: string; page_number: number; density: number; hits: number }> = [];

  for (const row of rows) {
    const { density, hits, garbled, skipped } = classifyPage(row.text_content);
    if (skipped || !garbled) continue;
    results.push({ filename: row.filename, page_number: row.page_number, density: Number(density.toFixed(4)), hits });
    if (!byFile.has(row.filename)) byFile.set(row.filename, []);
    byFile.get(row.filename)!.push(row.page_number);
  }

  db.close();

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          files_affected: byFile.size,
          pages_affected: results.length,
          by_file: Object.fromEntries([...byFile.entries()].map(([f, p]) => [f, p.sort((a, b) => a - b)])),
          rows: results,
        },
        null,
        2,
      ),
    );
  } else {
    for (const [filename, pages] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`${filename}\t${pages.length} page(s)\t${pages.sort((a, b) => a - b).join(",")}`);
    }
    console.log(`\nTOTAL: ${byFile.size} files / ${results.length} pages`);
    console.log(`scanned ${rows.length} rows`);
  }
}
