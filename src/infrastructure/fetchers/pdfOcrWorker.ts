/**
 * Infrastructure — PDF OCR Background Worker
 *
 * After a PDF is downloaded, this worker extracts text page-by-page
 * using pdftoppm + tesseract (Vietnamese OCR) and stores each page
 * in the pdf_extracted_text SQLite table.
 *
 * The read_bctc_pdf MCP tool reads from this table — instant response.
 */

import { execFile, execSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../logger.js";
import { getDb } from "../db/schema.js";

const execFileAsync = promisify(execFile);

export function isOcrAvailable(): boolean {
  try {
    // Synchronous availability check — called once at startup, acceptable cost
    execSync("which pdftoppm", { stdio: "ignore" });
    execSync("which tesseract", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run pdftoppm for a single page and pipe output to tesseract.
 * Returns the OCR text for that page, or empty string on failure.
 * Fully async — never blocks the event loop.
 */
async function ocrOnePage(tmpPdf: string, page: number): Promise<string> {
  return new Promise((resolve) => {
    // Spawn pdftoppm
    const ppm = spawn("pdftoppm", [
      "-f", String(page), "-l", String(page), "-r", "200", tmpPdf,
    ]);

    // Spawn tesseract reading from stdin
    const tess = spawn("tesseract", ["stdin", "stdout", "-l", "vie+eng"]);

    const ppmChunks: Buffer[] = [];
    const tessChunks: Buffer[] = [];
    let resolved = false;

    function done(text: string) {
      if (!resolved) {
        resolved = true;
        resolve(text);
      }
    }

    // Pipe pdftoppm stdout → tesseract stdin
    ppm.stdout.on("data", (chunk: Buffer) => {
      ppmChunks.push(chunk);
      tess.stdin.write(chunk);
    });

    ppm.stderr.on("data", () => {}); // swallow

    ppm.on("close", (code) => {
      if (code !== 0 || ppmChunks.length === 0) {
        tess.kill();
        done("");
        return;
      }
      tess.stdin.end();
    });

    ppm.on("error", () => {
      tess.kill();
      done("");
    });

    // Collect tesseract output
    tess.stdout.on("data", (chunk: Buffer) => tessChunks.push(chunk));
    tess.stderr.on("data", () => {}); // swallow

    tess.on("close", () => {
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
 * Skips if already extracted.
 * Async — never blocks the event loop.
 */
export async function extractAndStorePdfPages(
  pdfPath: string,
  filename: string,
): Promise<{ pages: number; totalChars: number }> {
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

    const threshold = Math.max(expectedPages * 0.8, 5); // Allow 80% extracted = complete enough
    if (expectedPages === 0 || existing.c >= threshold) {
      logger.info("[pdfOcr] already extracted", { filename, pages: existing.c, expected: expectedPages });
      return { pages: existing.c, totalChars: 0 };
    }
    // Incomplete extraction — delete partial and re-extract
    logger.info("[pdfOcr] incomplete extraction detected, re-extracting", { filename, have: existing.c, expected: expectedPages });
    db.run("DELETE FROM pdf_extracted_text WHERE filename = ?", [filename]);
  }

  if (!isOcrAvailable()) {
    logger.warn("[pdfOcr] tesseract/pdftoppm not available");
    return { pages: 0, totalChars: 0 };
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
    "INSERT OR REPLACE INTO pdf_extracted_text (filename, page_number, text_content, confidence) VALUES (?, ?, ?, ?)"
  );

  let extractedPages = 0;
  let totalChars = 0;
  const maxPages = Math.min(totalPages, 80);

  for (let page = 1; page <= maxPages; page++) {
    try {
      const pageText = await ocrOnePage(tmpPdf, page);
      const confidence = pageText.length > 50 ? 0.8 : pageText.length > 10 ? 0.5 : 0.1;

      insert.run(filename, page, pageText, confidence);
      if (pageText.length > 0) {
        extractedPages++;
        totalChars += pageText.length;
      } else {
        insert.run(filename, page, "", 0);
      }

      if (page % 10 === 0) {
        logger.info("[pdfOcr] progress", { filename, page, of: maxPages, chars: totalChars });
      }
    } catch {
      insert.run(filename, page, "", 0);
    }

    // Yield to the event loop between pages
    await new Promise(r => setTimeout(r, 50));
  }

  try { rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  logger.info("[pdfOcr] done", { filename, extractedPages, totalChars });
  return { pages: extractedPages, totalChars };
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
