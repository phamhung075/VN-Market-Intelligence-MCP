#!/usr/bin/env bun
/**
 * scripts/migrations/reextract-pdf-ocr-orientation.ts
 *
 * FIX-MCPSERVER-PDFOCRWORKER-OCRONEPAGE-NO-ORIENTATION-4TH-OCR-SITE — AC-2
 * operational follow-through (stored-text invalidation + re-OCR).
 *
 * WHY THIS SCRIPT EXISTS:
 *   The companion code fix (same commit) adds `--psm 1` to ocrOnePage()'s
 *   tesseract spawn in apps/mcp-server/src/infrastructure/fetchers/
 *   pdfOcrWorker.ts, so tesseract runs its OSD orientation probe before
 *   recognizing text instead of defaulting to psm 3 (no orientation
 *   detection). That fix only affects FUTURE extractions — the mcp-server
 *   image is baked from `src/` at build time (NOT live-synced like
 *   docs/data/), so already-garbled rows in `pdf_extracted_text` stay
 *   garbled until something re-runs extraction for that filename.
 *
 *   AC-2 ORDER IS LOAD-BEARING: invalidating (DELETE FROM pdf_extracted_text
 *   WHERE filename = ?) BEFORE the orientation fix is actually live just
 *   re-writes the same garble on the next extractAndStorePdfPages pass —
 *   there is nothing to invalidate INTO otherwise. This script refuses to
 *   run unless the orientation fix is present in the pdfOcrWorker.ts it
 *   would otherwise import (see SELF-CHECK GUARD below) — a real,
 *   independently-hardcoded `--psm 1` pipeline (not an import of production
 *   code) so the correctness of THIS script's re-extraction never depends on
 *   whether the mcp-server image has been rebuilt yet.
 *
 * SELF-CONTAINED (does not import apps/mcp-server/src/...): mirrors the same
 * reasoning as reap-dead-stranded-bctc-rows.ts / resync-watchlist-sysmap-
 * 2026-07-11.ts — this must work correctly whether copied standalone into a
 * running container (docker cp) or run from the host, regardless of whether
 * that container's image has been rebuilt with the code fix yet. The
 * extraction loop below duplicates the minimal per-page pdftoppm+tesseract
 * pipeline (`--psm 1` HARDCODED, not read from the live source) plus the
 * same low-char skip threshold (<3 chars) and confidence heuristic (>50
 * chars => 0.8, else 0.5) used by extractAndStorePdfPages, so downstream
 * readers (getCachedPdfText, refine tooling) see rows shaped exactly the way
 * they already expect.
 *
 * WHAT THIS SCRIPT DOES NOT DO: it does not touch `bctc_refined_units` /
 * `bctc_layout_units` or flip any `window_status`. Re-running the agentic
 * refine pass (get_bctc_pending_refine -> subagent -> push_bctc_refined_unit
 * -> finalize_bctc_refine) over the freshly re-OCR'd text is a separate,
 * host-level fleet-cron step, out of this script's (and this row's dev-
 * agent's) scope — this script only performs the re-OCR leg.
 *
 * Usage:
 *   # Dry-run (default — reports current row count + sample text, no writes):
 *   bun scripts/migrations/reextract-pdf-ocr-orientation.ts --filename VIC_2026_Q1.pdf
 *
 *   # Apply (DELETE + re-extract with the hardcoded --psm 1 pipeline):
 *   bun scripts/migrations/reextract-pdf-ocr-orientation.ts --filename VIC_2026_Q1.pdf --apply
 *
 *   # --pages <comma-list> (CORPUS-SCOPE-79-FILES follow-up, 2026-08-25):
 *   # targeted mode — DELETE + re-extract ONLY the named page_number(s)
 *   # instead of every page in the file. Same DB row shape (INSERT OR
 *   # REPLACE), same --apply/dry-run gate. Use this for known-garbled-page
 *   # sweeps (see scripts/audits/detect-pdf-ocr-orientation-garble.ts) — a
 *   # 312-page targeted sweep across 79 files is ~12x cheaper than the
 *   # 3786-page whole-file sweep the default mode would otherwise run.
 *   # When --pages is absent, behavior is UNCHANGED (whole-file, default).
 *   bun scripts/migrations/reextract-pdf-ocr-orientation.ts --filename VIC_2026_Q2.pdf --pages 10,48,57 --apply
 *
 *   # Against the live named-volume DB (docker exec — matches other
 *   # CANONICAL scripts in this zone):
 *   docker cp scripts/migrations/reextract-pdf-ocr-orientation.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/app/reextract-pdf-ocr-orientation.ts
 *   docker exec vn-market-intelligence-mcp-mcp-server-1 \
 *     bun /app/reextract-pdf-ocr-orientation.ts --filename VIC_2026_Q1.pdf --apply
 *
 * Environment:
 *   DB_PATH   — override DB path (default: <repo-root>/data/market.db; when
 *               run against the host bind-mounted live DB directly, pass
 *               DB_PATH=<repo-root>/data/live/market.db)
 *   PDF_DIR   — override the directory PDFs are read from (default:
 *               <repo-root>/data/pdfs)
 *
 * Exit codes:
 *   0 — success (dry-run or apply)
 *   1 — DB/PDF not found or SQL error
 *   2 — bad args (--filename required)
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ── Hardcoded fix — NEVER read from the live pdfOcrWorker.ts source; this is
// what makes this script's correctness independent of image-rebuild state. ──
const DPI_DEFAULT = 200;
const LOW_CHAR_SKIP_THRESHOLD = 3;

/**
 * Minimal, self-contained re-implementation of ocrOnePage() WITH the
 * orientation fix (`--psm 1`) hardcoded. Deliberately does not import
 * pdfOcrWorker.ts — see file header.
 */
async function ocrOnePageFixed(tmpPdf: string, page: number, dpi: number = DPI_DEFAULT): Promise<string> {
  return new Promise((resolvePromise) => {
    const ppm = spawn("pdftoppm", ["-f", String(page), "-l", String(page), "-r", String(dpi), tmpPdf]);
    const tess = spawn("tesseract", ["stdin", "stdout", "-l", "vie+eng", "--psm", "1"]);
    const chunks: Buffer[] = [];
    let resolved = false;
    let tessExited = false;

    function done(text: string) {
      if (!resolved) {
        resolved = true;
        resolvePromise(text);
      }
    }

    tess.stdin.on("error", () => {}); // benign EPIPE — same guard as production

    ppm.stdout.on("data", (chunk: Buffer) => {
      if (!tessExited && tess.stdin.writable && !tess.stdin.destroyed) tess.stdin.write(chunk);
    });
    ppm.on("close", (code) => {
      if (code !== 0) {
        tess.kill();
        done("");
        return;
      }
      if (!tessExited && tess.stdin.writable && !tess.stdin.destroyed) tess.stdin.end();
    });
    ppm.on("error", () => {
      tess.kill();
      done("");
    });

    tess.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    tess.stderr.on("data", () => {});
    tess.on("close", () => {
      tessExited = true;
      if (!tess.stdin.destroyed) tess.stdin.destroy();
      done(Buffer.concat(chunks).toString("utf-8").trim());
    });
    tess.on("error", () => done(""));

    setTimeout(() => {
      ppm.kill();
      tess.kill();
      done("");
    }, 45_000);
  });
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [REEXTRACT-OCR-ORIENTATION] ${msg}`);
}

async function getPageCount(pdfPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("sh", ["-c", `pdfinfo "${pdfPath}" 2>/dev/null | grep Pages`]);
    return parseInt(stdout.replace(/[^0-9]/g, ""), 10) || 0;
  } catch {
    return 0;
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const isApply = args.includes("--apply");
  const filenameIdx = args.indexOf("--filename");
  const filename = filenameIdx >= 0 ? args[filenameIdx + 1] : undefined;
  const dpiIdx = args.indexOf("--dpi");
  const dpi = dpiIdx >= 0 ? parseInt(args[dpiIdx + 1] ?? "200", 10) : DPI_DEFAULT;
  const pagesIdx = args.indexOf("--pages");
  const pagesArg = pagesIdx >= 0 ? args[pagesIdx + 1] : undefined;

  if (!filename) {
    log("ERROR: --filename <pdf_extracted_text.filename> is required (e.g. --filename VIC_2026_Q1.pdf)");
    process.exit(2);
  }

  // --pages <comma-list> parse + validate — targeted mode (CORPUS-SCOPE-79-FILES).
  // Absent => undefined => whole-file default path below, unchanged.
  let targetPages: number[] | undefined;
  if (pagesArg !== undefined) {
    const parsed = pagesArg
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => parseInt(s, 10));
    if (parsed.length === 0 || parsed.some((n) => !Number.isInteger(n) || n < 1)) {
      log(`ERROR: --pages must be a comma-separated list of positive integers (got "${pagesArg}")`);
      process.exit(2);
    }
    targetPages = [...new Set(parsed)].sort((a, b) => a - b);
  }

  const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");
  const DB_PATH = Bun.env["DB_PATH"] ?? resolve(PROJECT_ROOT, "data", "market.db");
  const PDF_DIR = Bun.env["PDF_DIR"] ?? resolve(PROJECT_ROOT, "data", "pdfs");
  const pdfPath = resolve(PDF_DIR, filename);

  log(`mode=${isApply ? "APPLY" : "DRY-RUN"}${targetPages ? ` (targeted, --pages ${targetPages.join(",")})` : " (whole-file)"}`);
  log(`DB_PATH=${DB_PATH}`);
  log(`pdfPath=${pdfPath}`);

  if (!existsSync(DB_PATH)) {
    log(`ERROR: DB not found at ${DB_PATH}`);
    process.exit(1);
  }
  if (!existsSync(pdfPath)) {
    log(`ERROR: PDF not found at ${pdfPath}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readwrite: isApply, readonly: !isApply });

  const beforeCount = (
    db.query<{ c: number }, [string]>("SELECT COUNT(*) c FROM pdf_extracted_text WHERE filename = ?").get(filename) ?? { c: 0 }
  ).c;
  const sample = db
    .query<{ page_number: number; len: number; confidence: number; sample: string }, [string]>(
      "SELECT page_number, LENGTH(text_content) len, confidence, SUBSTR(text_content,1,80) sample FROM pdf_extracted_text WHERE filename = ? ORDER BY page_number LIMIT 5",
    )
    .all(filename);

  log(`BEFORE: ${beforeCount} row(s) currently stored for filename=${filename}`);
  for (const s of sample) {
    log(`  page ${s.page_number}: ${s.len} chars, confidence=${s.confidence}, sample="${s.sample.replace(/\n/g, "\\n")}"`);
  }
  if (targetPages) {
    const targetSample = db
      .query<{ page_number: number; len: number; sample: string }, (string | number)[]>(
        `SELECT page_number, LENGTH(text_content) len, SUBSTR(text_content,1,80) sample FROM pdf_extracted_text WHERE filename = ? AND page_number IN (${targetPages.map(() => "?").join(",")}) ORDER BY page_number`,
      )
      .all(filename, ...targetPages);
    log(`BEFORE (targeted pages only, ${targetPages.length} requested): ${targetSample.length} currently-stored row(s) match`);
    for (const s of targetSample) {
      log(`  page ${s.page_number}: ${s.len} chars, sample="${s.sample.replace(/\n/g, "\\n")}"`);
    }
  }

  if (!isApply) {
    log("DRY-RUN — no writes. Re-run with --apply to DELETE + re-extract with the --psm 1 (orientation-fixed) pipeline.");
    log("REMINDER (AC-2 order): --apply is safe to run at any time — this script hardcodes the fix independently of");
    log("  whatever the mcp-server image currently has deployed (see file header). It only touches pdf_extracted_text;");
    log("  a separate agentic re-refine pass (get_bctc_pending_refine -> push_bctc_refined_unit -> finalize_bctc_refine)");
    log("  is required afterward to flip any bctc_refined_units.window_status from FAILED to DONE.");
    db.close();
    process.exit(0);
  }

  const totalPages = await getPageCount(pdfPath) || 30;
  const insert = db.prepare(
    "INSERT OR REPLACE INTO pdf_extracted_text (filename, page_number, text_content, confidence) VALUES (?, ?, ?, ?)",
  );

  let extracted = 0;
  let skipped = 0;

  if (targetPages) {
    // ── Targeted mode: DELETE + re-extract ONLY the named page_number(s). ──
    const outOfRange = targetPages.filter((p) => totalPages > 0 && p > totalPages);
    if (outOfRange.length > 0) {
      log(`WARNING: page(s) [${outOfRange.join(",")}] exceed pdfinfo-reported totalPages=${totalPages} — attempting anyway`);
    }
    log(`re-extracting ${targetPages.length} targeted page(s) of ${filename} (of ${totalPages} total in file) with --psm 1 at DPI ${dpi}...`);

    const placeholders = targetPages.map(() => "?").join(",");
    const deleteResult = db.run(
      `DELETE FROM pdf_extracted_text WHERE filename = ? AND page_number IN (${placeholders})`,
      [filename, ...targetPages],
    );
    log(`deleted ${deleteResult.changes} pre-existing row(s) for the ${targetPages.length} targeted page(s)`);

    for (const page of targetPages) {
      const text = await ocrOnePageFixed(pdfPath, page, dpi);
      if (text.length < LOW_CHAR_SKIP_THRESHOLD) {
        skipped++;
        log(`  page ${page}: SKIPPED (< ${LOW_CHAR_SKIP_THRESHOLD} chars after OCR)`);
        continue;
      }
      const confidence = text.length > 50 ? 0.8 : 0.5;
      insert.run(filename, page, text, confidence);
      extracted++;
      log(`  page ${page}: re-extracted, ${text.length} chars`);
    }
  } else {
    // ── Whole-file mode (default, unchanged behavior). ──
    const maxPages = Math.min(totalPages, 80); // mirrors OCR_MAX_PAGES cap in pdfOcrWorker.ts
    log(`re-extracting ${maxPages} page(s) (of ${totalPages} total) with --psm 1 at DPI ${dpi}...`);

    db.run("DELETE FROM pdf_extracted_text WHERE filename = ?", [filename]);
    log(`deleted ${beforeCount} pre-existing row(s) for filename=${filename}`);

    for (let page = 1; page <= maxPages; page++) {
      const text = await ocrOnePageFixed(pdfPath, page, dpi);
      if (text.length < LOW_CHAR_SKIP_THRESHOLD) {
        skipped++;
        continue;
      }
      const confidence = text.length > 50 ? 0.8 : 0.5;
      insert.run(filename, page, text, confidence);
      extracted++;
      if (page % 10 === 0) log(`progress: page ${page}/${maxPages}`);
    }
  }

  const afterCount = (
    db.query<{ c: number }, [string]>("SELECT COUNT(*) c FROM pdf_extracted_text WHERE filename = ?").get(filename) ?? { c: 0 }
  ).c;

  log(`AFTER: ${afterCount} row(s) stored (${extracted} extracted, ${skipped} skipped as low-char/blank)`);
  log("NEXT STEP (out of this script's scope): re-run the agentic refine pass for this report to re-evaluate");
  log("  bctc_refined_units.window_status against the corrected text.");

  db.close();
  process.exit(0);
}
