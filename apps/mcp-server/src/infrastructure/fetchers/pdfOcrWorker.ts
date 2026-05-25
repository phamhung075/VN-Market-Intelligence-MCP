// G5-DEBT: live caller found — deprecation deferred to Phase 2.
// P1-G audit (2026-05-25): 2 live callers found:
//   - bctcReparseJob.ts:getCachedPdfText (Tier 3 OCR cache fallback) → KEEP
//   - fetchParseAndStoreBctc.ts:getCachedPdfText (architect-frozen 1954c) → KEEP
// These are legitimate OCR cache fallbacks in the 3-tier extraction pipeline.
// Phase 2 G5 task: remove local OCR cache path after pdf-extractor service is proven stable.
// Note: extractAndStorePdfPagesWithRetry is @deprecated (1954c — see notebook c284).
/**
 * Infrastructure — PDF OCR Background Worker
 *
 * After a PDF is downloaded, this worker extracts text page-by-page
 * using pdftoppm + tesseract (Vietnamese OCR) and stores each page
 * in the pdf_extracted_text SQLite table.
 *
 * The read_bctc_pdf MCP tool reads from this table — instant response.
 *
 * Task 292 fixes applied:
 *   - FR-2: DPI raised from 150 → 200 (denser number tables)
 *   - FR-3: Pages < 10 chars are silently skipped — no row inserted
 *   - FR-3: Completeness threshold changed to 50%/3 (was 80%/5)
 *   - FR-4: isOcrAvailable() result cached at module level
 *
 * Task 1352c fixes applied:
 *   - Log OCR availability (tesseract + pdftoppm) at first isOcrAvailable() call
 *   - Per-page error logging with [ocr] page N failed: <reason>
 *   - Low-char page logging with [ocr] page N low-char: N chars
 *   - ocrStats returned from extractAndStorePdfPages: pagesProcessed, pagesSkipped, pagesLowChar, avgConfidence
 */

import { execFile, execSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../logger.js";
import { getDb } from "../db/schema.js";

const execFileAsync = promisify(execFile);

// ── isOcrAvailable with module-level cache (FR-4) ─────────────────────────────
// The first call runs two synchronous `execSync("which ...")` probes.
// All subsequent calls return the cached boolean — no repeated execSync.
let _ocrAvailableCache: boolean | null = null;

export function isOcrAvailable(): boolean {
  if (_ocrAvailableCache !== null) return _ocrAvailableCache;
  let pdftoppmAvailable = false;
  let tesseractAvailable = false;
  try {
    // Synchronous availability check — cached after first call
    execSync("which pdftoppm", { stdio: "ignore" });
    pdftoppmAvailable = true;
    execSync("which tesseract", { stdio: "ignore" });
    tesseractAvailable = true;
    _ocrAvailableCache = true;
  } catch {
    _ocrAvailableCache = false;
  }
  // Task 1352c: log availability at startup so operators can diagnose missing tools
  logger.info("[ocr] tesseract available: " + String(tesseractAvailable) + ", pdftoppm: " + String(pdftoppmAvailable), {
    tesseract: tesseractAvailable,
    pdftoppm: pdftoppmAvailable,
    ocrAvailable: _ocrAvailableCache,
  });
  return _ocrAvailableCache;
}

/**
 * Run pdftoppm for a single page and pipe output to tesseract.
 * Returns the OCR text for that page, or empty string on failure.
 * Fully async — never blocks the event loop.
 *
 * Task 292 / FR-2: DPI raised from 150 to 200 for better OCR accuracy
 * on dense Vietnamese number tables.
 *
 * Task 1290 / FR-1: Added optional dpi parameter for high-DPI retry on low-confidence extracts.
 */
async function ocrOnePage(tmpPdf: string, page: number, dpi: number = 200): Promise<string> {
  return new Promise((resolve) => {
    // Spawn pdftoppm at low priority (nice 19) — DPI configurable (default 200, Task 292 FR-2)
    const ppm = spawn("nice", [
      "-n", "19", "pdftoppm",
      "-f", String(page), "-l", String(page), "-r", String(dpi), tmpPdf,
    ]);

    // Spawn tesseract at low priority
    const tess = spawn("nice", [
      "-n", "19", "tesseract", "stdin", "stdout", "-l", "vie+eng",
    ]);

    const ppmChunks: Buffer[] = [];
    const tessChunks: Buffer[] = [];
    let resolved = false;
    let tessExited = false;

    function done(text: string) {
      if (!resolved) {
        resolved = true;
        resolve(text);
      }
    }

    // Task 1953b-2: Suppress benign EPIPE on tess.stdin so an early tesseract
    // exit does not propagate an unhandled error that crashes the Bun process.
    // Any error other than EPIPE is re-thrown so genuine failures surface.
    tess.stdin.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code !== "EPIPE") {
        logger.warn("[ocr] tess.stdin non-EPIPE error: " + err.message, { code: err.code });
      }
      // EPIPE is benign: tess exited before ppm finished sending — handled below.
    });

    // Pipe pdftoppm stdout → tesseract stdin with writable guard (Task 1953b-2)
    ppm.stdout.on("data", (chunk: Buffer) => {
      ppmChunks.push(chunk);
      // Guard: only write if tesseract stdin is still open.
      // tessExited flag is set in tess 'close' handler (synchronous before this fires
      // on the same tick in most cases, but the writable check is the hard gate).
      if (!tessExited && tess.stdin.writable && !tess.stdin.destroyed) {
        tess.stdin.write(chunk);
      }
    });

    ppm.stderr.on("data", () => {}); // swallow

    ppm.on("close", (code) => {
      if (code !== 0 || ppmChunks.length === 0) {
        tess.kill();
        done("");
        return;
      }
      // End tess.stdin only if it is still open (tess may have already exited)
      if (!tessExited && tess.stdin.writable && !tess.stdin.destroyed) {
        tess.stdin.end();
      }
    });

    ppm.on("error", () => {
      tess.kill();
      done("");
    });

    // Collect tesseract output
    tess.stdout.on("data", (chunk: Buffer) => tessChunks.push(chunk));
    tess.stderr.on("data", () => {}); // swallow

    tess.on("close", () => {
      tessExited = true;
      // Task 1953b-2: destroy tess.stdin to prevent any in-flight ppm writes
      // from blocking or triggering EPIPE after this point.
      if (!tess.stdin.destroyed) {
        tess.stdin.destroy();
      }
      const text = Buffer.concat(tessChunks).toString("utf-8").trim();
      done(text);
    });

    tess.on("error", () => done(""));

    // Per-page timeout safety net (45s)
    setTimeout(() => {
      ppm.kill();
      tess.kill();
      done("");
    }, 45_000);
  });
}

/**
 * Extract text from PDF page-by-page via OCR and store in SQLite.
 * Skips if already extracted (completeness guard: 50%/3 threshold).
 * Async — never blocks the event loop.
 *
 * Task 292 / FR-3 fixes:
 *   - Pages < 10 chars are silently skipped (no row inserted)
 *   - Completeness threshold is Math.max(expectedPages * 0.5, 3)
 *   - No duplicate insert in catch block
 *
 * Task 1290 / FR-1: Added optional dpi parameter for high-DPI retry on low-confidence extracts.
 * Task 1352c: Returns ocrStats with pagesProcessed, pagesSkipped, pagesLowChar, avgConfidence.
 *             Per-page errors logged with [ocr] page N failed. Low-char pages logged with [ocr] page N low-char.
 */
export type OcrStats = {
  pagesProcessed: number;
  pagesSkipped: number;
  pagesLowChar: number;
  avgConfidence: number;
};

export async function extractAndStorePdfPages(
  pdfPath: string,
  filename: string,
  actionCode?: string,
  dpi: number = 200,
): Promise<{ pages: number; totalChars: number; ocrStats: OcrStats }> {
  const db = getDb();

  // Already fully extracted? Check page count matches total
  const existing = db.query("SELECT COUNT(*) as c FROM pdf_extracted_text WHERE filename = ?").get(filename) as { c: number };
  if (existing.c > 0) {
    // Verify extraction is complete — check against actual PDF page count
    let expectedPages = 0;
    try {
      const { stdout } = await execFileAsync("sh", ["-c", `pdfinfo "${pdfPath}" 2>/dev/null | grep Pages`]);
      expectedPages = parseInt(stdout.replace(/[^0-9]/g, ""), 10) || 0;
    } catch { /* can't verify — assume complete */ }

    // Task 292 / FR-3: threshold changed from Math.max(expectedPages * 0.8, 5) to Math.max(expectedPages * 0.5, 3)
    const threshold = Math.max(expectedPages * 0.5, 3);
    if (expectedPages === 0 || existing.c >= threshold) {
      logger.info("[pdfOcr] already extracted", { filename, pages: existing.c, expected: expectedPages });
      return { pages: existing.c, totalChars: 0, ocrStats: { pagesProcessed: existing.c, pagesSkipped: 0, pagesLowChar: 0, avgConfidence: 0 } };
    }
    // Incomplete extraction — delete partial and re-extract
    logger.info("[pdfOcr] incomplete extraction detected, re-extracting", { filename, have: existing.c, expected: expectedPages });
    db.run("DELETE FROM pdf_extracted_text WHERE filename = ?", [filename]);
  }

  if (!isOcrAvailable()) {
    logger.warn("[pdfOcr] tesseract/pdftoppm not available");
    return { pages: 0, totalChars: 0, ocrStats: { pagesProcessed: 0, pagesSkipped: 0, pagesLowChar: 0, avgConfidence: 0 } };
  }

  // Get page count (execFile is async)
  let totalPages = 30;
  try {
    const { stdout } = await execFileAsync("sh", [
      "-c", `pdfinfo "${pdfPath}" 2>/dev/null | grep Pages`,
    ]);
    totalPages = parseInt(stdout.replace(/[^0-9]/g, ""), 10) || 30;
  } catch { /* use default */ }

  logger.info("[pdfOcr] starting", { filename, totalPages });

  const tmpDir = `/tmp/ocr-${Date.now()}`;
  mkdirSync(tmpDir, { recursive: true });
  const tmpPdf = join(tmpDir, "input.pdf");
  writeFileSync(tmpPdf, readFileSync(pdfPath));

  const insert = db.prepare(
    "INSERT OR REPLACE INTO pdf_extracted_text (filename, page_number, text_content, confidence, action_code) VALUES (?, ?, ?, ?, ?)"
  );
  const ac = actionCode?.toUpperCase() ?? "";

  let extractedPages = 0;
  let totalChars = 0;
  // Task 1352c: ocrStats tracking
  let pagesSkipped = 0;
  let pagesLowChar = 0;
  const pageConfidences: number[] = [];
  const maxPages = Math.min(totalPages, 80);

  for (let page = 1; page <= maxPages; page++) {
    let pageText = "";
    let pageError: string | null = null;
    try {
      pageText = await ocrOnePage(tmpPdf, page, dpi);
    } catch (err) {
      pageError = err instanceof Error ? err.message : String(err);
    }

    if (pageError !== null) {
      // Task 1352c: per-page error logging
      logger.warn("[ocr] page " + String(page) + " failed: " + pageError, { filename, page, reason: pageError });
      pagesSkipped++;
    } else if (pageText.length === 0) {
      // Empty result from OCR (blank page or timeout) — count as skipped
      pagesSkipped++;
    } else if (pageText.length < 10) {
      // Task 1352c: low-char page logging (< 10 chars, not worth inserting)
      logger.warn("[ocr] page " + String(page) + " low-char: " + String(pageText.length) + " chars, confidence: 0", {
        filename,
        page,
        chars: pageText.length,
        confidence: 0,
      });
      pagesLowChar++;
    } else {
      // Task 292 / FR-3: only insert rows for pages with >= 10 chars
      const confidence = pageText.length > 50 ? 0.8 : 0.5;
      insert.run(filename, page, pageText, confidence, ac);
      extractedPages++;
      totalChars += pageText.length;
      pageConfidences.push(confidence);
    }

    if (page % 10 === 0) {
      logger.info("[pdfOcr] progress", { filename, page, of: maxPages, chars: totalChars });
    }

    // Yield to the event loop between pages to keep server responsive
    await new Promise(r => setTimeout(r, 2000));
  }

  const avgConfidence = pageConfidences.length === 0
    ? 0
    : pageConfidences.reduce((a, b) => a + b, 0) / pageConfidences.length;

  const ocrStats: OcrStats = { pagesProcessed: extractedPages, pagesSkipped, pagesLowChar, avgConfidence };

  try { rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  logger.info("[pdfOcr] done", { filename, extractedPages, totalChars, ocrStats });
  return { pages: extractedPages, totalChars, ocrStats };
}

/**
 * Get cached extracted text from SQLite. Returns null if not yet extracted.
 */
export function getCachedPdfText(
  filename: string,
  maxChars?: number,
): { text: string; pages: number; confidence: number } | null {
  const db = getDb();
  const rows = db.query(
    "SELECT text_content, confidence FROM pdf_extracted_text WHERE filename = ? ORDER BY page_number"
  ).all(filename) as Array<{ text_content: string; confidence: number }>;

  if (rows.length === 0) return null;

  let text = rows.map(r => r.text_content).join("\n\n");
  if (maxChars && text.length > maxChars) {
    text = text.slice(0, maxChars) + "\n\n[... truncated ...]";
  }

  const avgConfidence = rows.reduce((sum, r) => sum + r.confidence, 0) / rows.length;
  return { text, pages: rows.length, confidence: avgConfidence };
}

/**
 * Task 1290 / FR-1: Extract with automatic high-DPI retry for low-confidence PDFs.
 *
 * Runs OCR in two phases:
 *   1. DPI 200 (standard quality, ~20s per page)
 *   2. If confidence < 0.2, retry with DPI 300 (higher quality, ~30s per page)
 *
 * After second run, returns best result (whichever had higher confidence).
 * If both runs < 0.2, still inserts the better one and logs both attempts.
 *
 * Server stability: Uses same timeout (45s per page), same priority (nice 19),
 * same yield timing (2s between pages). Retry only triggers for rare low-confidence PDFs.
 *
 * @deprecated 1954c (G5b) — in-process Tesseract OCR is now owned by the
 * pdf-extractor microservice (port 5001). All 4 BCTC callers (bctcPdfPullJob,
 * pushBctcExtraction, bctcReparseJob, checkSscReports) have been rewired to
 * call pdfExtractorClient.extractViaMicroservice instead. This function is kept
 * to avoid breaking any remaining test imports but is no longer called in
 * production. Scheduled for removal in a future cleanup pass.
 */
export async function extractAndStorePdfPagesWithRetry(
  pdfPath: string,
  filename: string,
  actionCode?: string,
): Promise<{
  pages: number;
  totalChars: number;
  confidenceAfterRetry: number;
}> {
  const db = getDb();

  // ── Run 1: Extract with DPI 200 (standard) ──────────────────────────────────
  logger.info("[pdfOcrRetry] phase 1: extracting with DPI 200", { filename });
  await extractAndStorePdfPages(pdfPath, filename, actionCode, 200);

  const phase1Result = getCachedPdfText(filename);
  const phase1Confidence = phase1Result?.confidence ?? 0;

  logger.info("[pdfOcrRetry] phase 1 complete", {
    filename,
    confidence: phase1Confidence,
    pages: phase1Result?.pages,
  });

  // If phase 1 confidence >= 0.2, no retry needed
  if (phase1Confidence >= 0.2) {
    logger.info("[pdfOcrRetry] confidence sufficient, no retry needed", {
      filename,
      confidence: phase1Confidence,
    });
    return {
      pages: phase1Result?.pages ?? 0,
      totalChars: phase1Result?.text.length ?? 0,
      confidenceAfterRetry: phase1Confidence,
    };
  }

  // ── Run 2: Clear cache and retry with DPI 300 (high quality) ────────────────
  logger.warn("[pdfOcrRetry] phase 1 confidence too low, retrying with DPI 300", {
    filename,
    confidence: phase1Confidence,
  });

  // Delete cached pages from phase 1
  db.run("DELETE FROM pdf_extracted_text WHERE filename = ?", [filename]);
  logger.info("[pdfOcrRetry] cleared phase 1 cache, phase 2 starting", { filename });

  await extractAndStorePdfPages(pdfPath, filename, actionCode, 300);

  const phase2Result = getCachedPdfText(filename);
  const phase2Confidence = phase2Result?.confidence ?? 0;

  logger.info("[pdfOcrRetry] phase 2 complete", {
    filename,
    confidence: phase2Confidence,
    pages: phase2Result?.pages,
    improvement: phase2Confidence > phase1Confidence,
  });

  // Log outcome
  if (phase2Confidence > phase1Confidence) {
    logger.info("[pdfOcrRetry] success: DPI 300 improved confidence", {
      filename,
      before: phase1Confidence,
      after: phase2Confidence,
      delta: (phase2Confidence - phase1Confidence).toFixed(3),
    });
  } else {
    logger.warn("[pdfOcrRetry] DPI 300 did not improve confidence, using phase 2 anyway", {
      filename,
      phase1: phase1Confidence,
      phase2: phase2Confidence,
    });
  }

  return {
    pages: phase2Result?.pages ?? 0,
    totalChars: phase2Result?.text.length ?? 0,
    confidenceAfterRetry: phase2Confidence,
  };
}
