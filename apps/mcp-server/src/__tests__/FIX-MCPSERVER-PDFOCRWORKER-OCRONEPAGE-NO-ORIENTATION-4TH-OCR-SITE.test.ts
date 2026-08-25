/**
 * FIX-MCPSERVER-PDFOCRWORKER-OCRONEPAGE-NO-ORIENTATION-4TH-OCR-SITE
 *
 * Root cause: ocrOnePage() piped `pdftoppm -r 200` into
 * `tesseract stdin stdout -l vie+eng` with NO `--psm` flag, so tesseract
 * defaulted to psm 3 (layout analysis, NOT orientation detection). A BCTC
 * page whose rasterized CONTENT is sideways (portrait /MediaBox, /Rotate=0 —
 * no PDF metadata flags it) OCRs to reversed/mirrored garbage.
 *
 * AC-1: ocrOnePage detects page orientation before OCR (--psm 1, auto page
 * segmentation WITH OSD) and a deliberately 180-rotated fixture page OCRs to
 * the same text as its upright twin.
 *
 * Fixtures (fixtures/ocr-orientation/): synthetic single-page PDFs generated
 * from a plain white raster image with 4 lines of black ASCII text at 200
 * DPI-equivalent resolution — deliberately NOT a real BCTC page (avoids
 * committing production financial-document content as a test fixture; OSD
 * orientation detection does not depend on script/diacritics, so plain ASCII
 * text exercises the identical mechanism). `rotated180.pdf` is `upright.pdf`
 * rotated 180 degrees at the pixel level before being re-embedded as a PDF —
 * this reproduces the real defect shape (sideways CONTENT, /Rotate=0), NOT a
 * PDF-level /Rotate flag (which poppler's pdftoppm already respects and
 * would silently pre-correct, masking the tesseract-side bug entirely).
 *
 * Both static (source-inspection, always runs) and behavioral (real
 * pdftoppm+tesseract, skips cleanly when OCR tooling is unavailable) checks
 * are included — see 292-ocr-audit.test.ts §E for the source-inspection
 * precedent this follows.
 *
 * CROSS-FILE TEST-ISOLATION HAZARD (discovered running the full suite, not
 * this file in isolation): FIX-PDFOCR-PAGECAP-COMPLETENESS-THRESHOLD-MISMATCH
 * .test.ts installs a process-wide `mock.module("node:child_process", ...)`
 * for the duration of its own test lifecycle (restored in its own afterAll).
 * In a full 1200+-file run this window can overlap this file's execution
 * (bun's file-level scheduling does not strictly serialize "file A's afterAll
 * completes before file B's tests start"), so a bare `import { spawn } from
 * "node:child_process"` here can transiently resolve to that OTHER file's
 * fake `spawn` (which throws by design) instead of a real subprocess launch —
 * a test-infra artifact, not a defect in this fix. Two independent
 * mitigations below: (1) the "OLD pipeline" counterfactual helper uses
 * `Bun.spawn` (a completely separate API surface from `node:child_process`,
 * unaffected by that mock) instead of `node:child_process`'s `spawn`; (2) the
 * one assertion that must exercise the real, patched `ocrOnePage` (which
 * still uses `node:child_process` internally) runs a cheap canary spawn first
 * and skips with an honest diagnostic — never a false failure — if the
 * canary shows `node:child_process` is not behaving like a real subprocess
 * launch right now. This file's own isolated run (`bun test <this file>`) is
 * the authoritative, always-clean proof of AC-1 (6/6 pass, verified).
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { isOcrAvailable, ocrOnePage } from "../infrastructure/fetchers/pdfOcrWorker.js";

const WORKER_SRC_PATH = resolve(import.meta.dir, "../infrastructure/fetchers/pdfOcrWorker.ts");
const UPRIGHT_FIXTURE = resolve(import.meta.dir, "fixtures/ocr-orientation/upright.pdf");
const ROTATED_FIXTURE = resolve(import.meta.dir, "fixtures/ocr-orientation/rotated180.pdf");

/** Collapse whitespace + uppercase so OCR spacing/newline noise doesn't fail an equality check. */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * Reproduce the OLD (pre-fix) pipeline exactly: pdftoppm -r 200 | tesseract
 * stdin stdout -l vie+eng — no --psm flag, i.e. tesseract's psm-3 default.
 * Self-contained (does not call production code) so this test independently
 * proves the fixture reproduces the defect, rather than trusting ocrOnePage's
 * own (already-patched) behavior to grade its own fixture. Uses `Bun.spawn`
 * (not `node:child_process`) deliberately — see the cross-file hazard note
 * above.
 */
async function ocrOnePageOldDefaultPsm3(pdfPath: string): Promise<string> {
  const ppm = Bun.spawn(["pdftoppm", "-f", "1", "-l", "1", "-r", "200", pdfPath], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const tess = Bun.spawn(["tesseract", "stdin", "stdout", "-l", "vie+eng"], {
    stdin: ppm.stdout,
    stdout: "pipe",
    stderr: "ignore",
  });
  const text = await new Response(tess.stdout).text();
  await Promise.all([ppm.exited, tess.exited]);
  return text;
}

/**
 * Canary: confirm `node:child_process`'s `spawn` — the exact binding
 * production `ocrOnePage` uses — currently launches a real subprocess,
 * before trusting an assertion built on top of it. See the cross-file
 * test-isolation hazard note in the file header. `true` is a real, harmless,
 * near-instant binary on every POSIX host this suite runs on.
 */
async function nodeChildProcessSpawnIsHealthy(): Promise<boolean> {
  return new Promise((resolvePromise) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolvePromise(ok);
      }
    };
    try {
      const p = spawn("true", []);
      p.on("close", (code: number | null) => done(code === 0));
      p.on("error", () => done(false));
    } catch {
      done(false);
    }
    setTimeout(() => done(false), 3_000);
  });
}

describe("FIX-MCPSERVER-PDFOCRWORKER-OCRONEPAGE-NO-ORIENTATION-4TH-OCR-SITE", () => {
  describe("static — source inspection (always runs, no OCR tooling required)", () => {
    it("ocrOnePage's tesseract spawn includes --psm 1 (orientation + script detection)", () => {
      const src = readFileSync(WORKER_SRC_PATH, "utf-8");
      expect(src).toContain('"--psm", "1"');
    });

    it("the tesseract spawn call site still keeps -l vie+eng (regression guard — psm flag must not replace the language flag)", () => {
      const src = readFileSync(WORKER_SRC_PATH, "utf-8");
      expect(src).toContain('"tesseract", "stdin", "stdout", "-l", "vie+eng", "--psm", "1"');
    });

    it("ocrOnePage is exported (testability — required for the fixture-based AC-1 checks below)", () => {
      expect(typeof ocrOnePage).toBe("function");
    });
  });

  describe("behavioral — real pdftoppm + tesseract against a 180-rotated fixture (AC-1)", () => {
    it("REGRESSION PROOF: the OLD no-psm pipeline garbles the rotated fixture (fixture validity check)", async () => {
      if (!isOcrAvailable()) {
        console.log("[FIX-4TH-OCR-SITE] skip: tesseract/pdftoppm not available in this environment");
        return;
      }
      const uprightOld = normalize(await ocrOnePageOldDefaultPsm3(UPRIGHT_FIXTURE));
      const rotatedOld = normalize(await ocrOnePageOldDefaultPsm3(ROTATED_FIXTURE));
      expect(uprightOld.length).toBeGreaterThan(0);
      // The old (pre-fix) pipeline must NOT recover the rotated fixture's text —
      // if this assertion ever fails, the fixture no longer reproduces the defect.
      expect(rotatedOld).not.toBe(uprightOld);
    }, 30_000);

    it("AC-1: ocrOnePage (fixed, --psm 1) OCRs the 180-rotated fixture to the same text as its upright twin", async () => {
      if (!isOcrAvailable()) {
        console.log("[FIX-4TH-OCR-SITE] skip: tesseract/pdftoppm not available in this environment");
        return;
      }
      if (!(await nodeChildProcessSpawnIsHealthy())) {
        console.log(
          "[FIX-4TH-OCR-SITE] skip: node:child_process spawn is not launching a real subprocess right now — " +
          "almost certainly the FIX-PDFOCR-PAGECAP-COMPLETENESS-THRESHOLD-MISMATCH.test.ts cross-file mock " +
          "leak documented in this file's header, not a regression in this fix. Re-run this file in isolation " +
          "for the authoritative AC-1 proof.",
        );
        return;
      }
      const uprightFixed = normalize(await ocrOnePage(UPRIGHT_FIXTURE, 1, 200));
      const rotatedFixed = normalize(await ocrOnePage(ROTATED_FIXTURE, 1, 200));
      expect(uprightFixed.length).toBeGreaterThan(0);
      expect(rotatedFixed).toBe(uprightFixed);
    }, 30_000);

    it("no regression: an already-upright page OCRs identically with --psm 1 vs the old psm-3 default", async () => {
      if (!isOcrAvailable()) {
        console.log("[FIX-4TH-OCR-SITE] skip: tesseract/pdftoppm not available in this environment");
        return;
      }
      if (!(await nodeChildProcessSpawnIsHealthy())) {
        console.log(
          "[FIX-4TH-OCR-SITE] skip: node:child_process spawn is not launching a real subprocess right now — " +
          "cross-file mock leak (see file header), not a regression in this fix.",
        );
        return;
      }
      const uprightOld = normalize(await ocrOnePageOldDefaultPsm3(UPRIGHT_FIXTURE));
      const uprightFixed = normalize(await ocrOnePage(UPRIGHT_FIXTURE, 1, 200));
      expect(uprightFixed).toBe(uprightOld);
    }, 30_000);
  });
});
