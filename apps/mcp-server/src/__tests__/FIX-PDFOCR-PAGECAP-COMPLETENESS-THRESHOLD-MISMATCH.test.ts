/**
 * FIX-PDFOCR-PAGECAP-COMPLETENESS-THRESHOLD-MISMATCH
 *
 * Root cause (architect-confirmed live on vn-market-intelligence-mcp-mcp-server-1,
 * 2 consecutive boots — GVR_2026_Q1.pdf totalPages=204, GVR_2025_Q4.pdf
 * totalPages=285, MSN annual-report PDF totalPages=255):
 *
 *   extractAndStorePdfPages() hard-caps OCR extraction at OCR_MAX_PAGES (80)
 *   pages, but the completeness re-extraction gate compared the CAPPED
 *   extracted-page count against the UNCAPPED `expectedPages` from `pdfinfo`.
 *   For any PDF with totalPages > 160, the capped 80-row result can never
 *   satisfy `Math.max(expectedPages * 0.5, 3)` — the gate judges the
 *   extraction perpetually incomplete, blanket-DELETEs the existing rows,
 *   and re-OCRs from scratch (capped at 80 again) on EVERY bootstrap OCR
 *   loop run, forever. The DELETE fires BEFORE re-extraction, so a
 *   concurrent read_bctc_pdf / getCachedPdfText call during the ~10-12min
 *   re-OCR window saw ZERO cached pages instead of the stale-but-present
 *   partial text (availability regression on every boot).
 *
 * Test-isolation strategy (avoids a multi-minute real 80-page tesseract run
 * and a real multi-hundred-page PDF fixture):
 *   - `node:child_process` is mock.module()-replaced (restored in afterAll —
 *     same pattern as 047-bctc-orchestrator.test.ts's telegram.js mock) so
 *     the `pdfinfo`-via-execFileAsync lookup deterministically reports
 *     FIXTURE_PAGE_COUNT pages, and `execSync("which ...")` deterministically
 *     throws — i.e. `isOcrAvailable()` returns false and the function returns
 *     immediately after the completeness-gate decision, WITHOUT entering the
 *     (multi-minute) OCR loop. `spawn` is stubbed to throw — asserting it is
 *     never reached is itself part of the regression guard.
 *   - `isOcrAvailable()`'s module-level cache is bypassed via a fresh
 *     cache-busted import of pdfOcrWorker.ts (other test files in this shared
 *     bun-test process may have already cached `_ocrAvailableCache = true`
 *     against the real dev-machine tools) — same `?isolate=` pattern used by
 *     047-bctc-orchestrator.test.ts. `getDb()`/`logger` resolve to the SAME
 *     canonical singletons (only the entry-point module is duplicated), so
 *     DB state and `spyOn(logger, ...)` still observe the real call.
 *
 * AC1 (Test 1): a PDF whose true page count exceeds the 80-page cap, already
 *   sitting at exactly 80 cached rows (== a prior boot's capped extraction),
 *   must be judged COMPLETE — no DELETE, no "[pdfOcr] starting" re-OCR.
 * AC2 (Test 2): a genuinely incomplete capped extraction (row count below the
 *   *capped* threshold) must still be detected as incomplete, but must NOT
 *   blanket-DELETE the existing rows up front — the availability-gap defect.
 */

import { describe, it, expect, beforeAll, afterAll, spyOn, mock } from "bun:test";
import { promisify } from "node:util";

import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { logger } from "../infrastructure/logger.js";

// ── node:child_process mock ───────────────────────────────────────────────────
// Real bindings captured BEFORE mock.module() overwrites them, so afterAll can
// restore the genuine implementations for any sibling test file that loads
// "node:child_process" (or a not-yet-evaluated pdfOcrWorker.ts copy) later in
// this shared bun-test process.
const _realChildProcess = await import("node:child_process");

const FIXTURE_PAGE_COUNT = 204; // > 160 (2x the 80-page cap) per AC3 spec
const OCR_CAP = 80; // must match pdfOcrWorker.ts's maxPages hard cap
const PDFINFO_OUTPUT = `Pages:           ${FIXTURE_PAGE_COUNT}\n`;

function makeFakeExecFile(pagesOutput: string) {
  const fn: any = (
    _file: string,
    _args: unknown,
    optionsOrCallback?: unknown,
    maybeCallback?: unknown,
  ) => {
    const callback =
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
    if (typeof callback === "function") {
      process.nextTick(() => (callback as (...a: unknown[]) => void)(null, pagesOutput, ""));
    }
    return {};
  };
  // Mirrors node:child_process's real execFile custom-promisify shape
  // ({ stdout, stderr }) so `const { stdout } = await execFileAsync(...)`
  // (pdfOcrWorker.ts's actual call pattern) destructures correctly.
  fn[promisify.custom] = () => Promise.resolve({ stdout: pagesOutput, stderr: "" });
  return fn;
}

function throwingExecSync(): never {
  // Simulates "command not found" — isOcrAvailable()'s try/catch treats any
  // execSync failure (pdftoppm OR tesseract OR `which` itself missing) as
  // "not available".
  throw Object.assign(new Error("[test-mock] pdftoppm/tesseract intentionally hidden"), {
    status: 127,
  });
}

function unexpectedSpawn(): never {
  throw new Error(
    "[test-mock] spawn() unexpectedly invoked — isOcrAvailable() should have short-circuited before any OCR page render",
  );
}

mock.module("node:child_process", () => ({
  ..._realChildProcess,
  execFile: makeFakeExecFile(PDFINFO_OUTPUT),
  execSync: throwingExecSync,
  spawn: unexpectedSpawn,
}));

beforeAll(async () => {
  closeDb();
  await initDatabase();
});

afterAll(() => {
  mock.module("node:child_process", () => _realChildProcess);
  closeDb();
});

// Fresh cache-busted import so this file's `isOcrAvailable()` module-level
// cache is NOT poisoned by other test files that already probed the real
// tesseract/pdftoppm availability earlier in this shared bun-test process,
// and so the module's top-level `import { execFile, execSync, spawn } from
// "node:child_process"` links against the mock installed above.
async function freshExtractAndStorePdfPages() {
  const mod = await import(
    Bun.resolveSync("../infrastructure/fetchers/pdfOcrWorker.js", import.meta.dir) +
      "?isolate=FIX-PDFOCR-PAGECAP"
  );
  return mod.extractAndStorePdfPages as typeof import("../infrastructure/fetchers/pdfOcrWorker.js").extractAndStorePdfPages;
}

function seedPages(filename: string, count: number): void {
  const db = getDb();
  db.prepare("DELETE FROM pdf_extracted_text WHERE filename = ?").run(filename);
  const insert = db.prepare(
    "INSERT OR REPLACE INTO pdf_extracted_text (filename, page_number, text_content, confidence, action_code, data_env) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (let p = 1; p <= count; p++) {
    insert.run(filename, p, `Synthetic cached page ${p} content`, 0.8, "", null);
  }
}

function countRows(filename: string): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) as c FROM pdf_extracted_text WHERE filename = ?")
    .get(filename) as { c: number };
  return row.c;
}

describe("FIX-PDFOCR-PAGECAP-COMPLETENESS-THRESHOLD-MISMATCH", () => {
  it("AC1: a full 80-page capped extraction (expectedPages=204 > 160) reaches a terminal 'already extracted' state — no DELETE, no re-OCR start", async () => {
    const filename = "FIX-PDFOCR-PAGECAP-fixtureA.pdf";
    seedPages(filename, OCR_CAP); // simulates a prior boot's capped-at-80 extraction
    expect(countRows(filename)).toBe(OCR_CAP);

    const infoSpy = spyOn(logger, "info");
    const extractAndStorePdfPages = await freshExtractAndStorePdfPages();

    await extractAndStorePdfPages("/fake/FIX-PDFOCR-PAGECAP-fixtureA.pdf", filename);

    const infoCalls = infoSpy.mock.calls;
    const startedReOcr = infoCalls.some(
      ([msg]) => typeof msg === "string" && msg.includes("[pdfOcr] starting"),
    );
    const alreadyExtracted = infoCalls.some(
      ([msg]) => typeof msg === "string" && msg.includes("[pdfOcr] already extracted"),
    );

    infoSpy.mockRestore();

    // The defect: unfixed code judges 80 < max(204*0.5,3)=102 incomplete forever,
    // deletes the 80 rows, and (in production, with real OCR tools available)
    // starts a full re-OCR on every single boot.
    expect(startedReOcr).toBe(false);
    expect(alreadyExtracted).toBe(true);
    expect(countRows(filename)).toBe(OCR_CAP); // unchanged — never deleted
  });

  it("AC2: a genuinely incomplete capped extraction (10/80 rows) is still detected as incomplete, but existing rows are NOT blanket-deleted up front (no availability gap)", async () => {
    const filename = "FIX-PDFOCR-PAGECAP-fixtureB.pdf";
    seedPages(filename, 10); // well below even the capped threshold (40)
    expect(countRows(filename)).toBe(10);

    const infoSpy = spyOn(logger, "info");
    const extractAndStorePdfPages = await freshExtractAndStorePdfPages();

    await extractAndStorePdfPages("/fake/FIX-PDFOCR-PAGECAP-fixtureB.pdf", filename);

    const infoCalls = infoSpy.mock.calls;
    const detectedIncomplete = infoCalls.some(
      ([msg]) =>
        typeof msg === "string" && msg.includes("[pdfOcr] incomplete extraction detected"),
    );

    infoSpy.mockRestore();

    // Genuine incompleteness must still be detected (10 rows really is < 40
    // even under the fixed capped-expectedPages threshold) ...
    expect(detectedIncomplete).toBe(true);
    // ... but the pre-existing 10 rows must survive — read_bctc_pdf /
    // getCachedPdfText concurrent callers must never see a zero-row gap while
    // re-extraction is pending/unavailable.
    expect(countRows(filename)).toBe(10);
  });
});
