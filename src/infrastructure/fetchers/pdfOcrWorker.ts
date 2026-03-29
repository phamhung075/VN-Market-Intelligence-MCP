/**
 * Infrastructure — PDF OCR Background Worker
 *
 * After a PDF is downloaded, this worker extracts text page-by-page
 * using pdftoppm + tesseract (Vietnamese OCR) and stores each page
 * in the pdf_extracted_text SQLite table.
 *
 * The read_bctc_pdf MCP tool reads from this table — instant response.
 */

import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../logger.js";
import { getDb } from "../db/schema.js";

export function isOcrAvailable(): boolean {
  try {
    execSync("which pdftoppm", { stdio: "ignore" });
    execSync("which tesseract", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract text from PDF page-by-page via OCR and store in SQLite.
 * Skips if already extracted.
 */
export function extractAndStorePdfPages(
  pdfPath: string,
  filename: string,
): { pages: number; totalChars: number } {
  const db = getDb();

  // Already extracted?
  const existing = db.query("SELECT COUNT(*) as c FROM pdf_extracted_text WHERE filename = ?").get(filename) as { c: number };
  if (existing.c > 0) {
    logger.info("[pdfOcr] already extracted", { filename, pages: existing.c });
    return { pages: existing.c, totalChars: 0 };
  }

  if (!isOcrAvailable()) {
    logger.warn("[pdfOcr] tesseract/pdftoppm not available");
    return { pages: 0, totalChars: 0 };
  }

  // Get page count
  let totalPages = 30;
  try {
    const info = execSync(`pdfinfo "${pdfPath}" 2>/dev/null | grep Pages`, { encoding: "utf-8" });
    totalPages = parseInt(info.replace(/[^0-9]/g, ""), 10) || 30;
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
      const ppmResult = spawnSync("pdftoppm", [
        "-f", String(page), "-l", String(page), "-r", "200", tmpPdf
      ], { maxBuffer: 50 * 1024 * 1024, timeout: 30000 });

      if (ppmResult.stdout.length === 0) {
        insert.run(filename, page, "", 0);
        continue;
      }

      const ocrResult = spawnSync("tesseract", [
        "stdin", "stdout", "-l", "vie+eng"
      ], { input: ppmResult.stdout, maxBuffer: 5 * 1024 * 1024, timeout: 30000 });

      const pageText = ocrResult.stdout.toString("utf-8").trim();
      const confidence = pageText.length > 50 ? 0.8 : pageText.length > 10 ? 0.5 : 0.1;

      insert.run(filename, page, pageText, confidence);
      extractedPages++;
      totalChars += pageText.length;

      if (page % 10 === 0) {
        logger.info("[pdfOcr] progress", { filename, page, of: maxPages, chars: totalChars });
      }
    } catch {
      insert.run(filename, page, "", 0);
    }
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
