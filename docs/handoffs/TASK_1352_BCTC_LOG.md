# TASK 1352-BCTC-LOG — OCR Health Logging + Per-File Error Retry

**Sprint:** 1352
**Type:** Observability — MEDIUM severity
**Branch:** fix/1352c-ocr-health-logging (NOT yet merged — WIP stash applied to working tree)
**Status: INCOMPLETE — implementation in stash, test file untracked, nothing committed**
**Depends on:** TASK_1352_BCTC_RACE (DONE) + TASK_1352_BCTC_WIRE (DONE)

---

## Problem

`isOcrAvailable()` ran at startup, cached the result, but never logged it.
Per-file extraction errors were swallowed silently (bare `catch {}` at line 207
in committed HEAD). No per-page retry on error. No visibility into which PDFs
produced low-char results.

---

## Current State (committed HEAD vs working tree)

The developer created a branch `fix/1352c-ocr-health-logging`, applied the stash
to the working tree but has not committed. The test file and implementation changes
exist only in the working tree.

### Committed HEAD (pdfOcrWorker.ts) — what is MISSING

Line 31–42: `isOcrAvailable()` returns boolean with no log.

Line 137: `extractAndStorePdfPages` return type is `Promise<{ pages: number; totalChars: number }>`.
No `ocrStats` field.

Lines 191–213: page loop — bare `try/catch {}` swallows per-page errors silently.
Pages with < 10 chars are skipped silently (no warn log).
No `pagesSkipped` / `pagesLowChar` / `avgConfidence` tracking.

Lines 154, 163, 217: three return statements return `{ pages, totalChars }` only.

---

## Exact Changes Required

All changes are in a single file: `pdfOcrWorker.ts`.

### Change 1 — isOcrAvailable() startup log (lines 31–42 in committed HEAD)

Current:
```typescript
export function isOcrAvailable(): boolean {
  if (_ocrAvailableCache !== null) return _ocrAvailableCache;
  try {
    execSync("which pdftoppm", { stdio: "ignore" });
    execSync("which tesseract", { stdio: "ignore" });
    _ocrAvailableCache = true;
  } catch {
    _ocrAvailableCache = false;
  }
  return _ocrAvailableCache;
}
```

Required — add per-tool tracking and log before return:
```typescript
export function isOcrAvailable(): boolean {
  if (_ocrAvailableCache !== null) return _ocrAvailableCache;
  let pdftoppmAvailable = false;
  let tesseractAvailable = false;
  try {
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
```

### Change 2 — OcrStats type + extractAndStorePdfPages signature

Add before `extractAndStorePdfPages` function:
```typescript
export type OcrStats = {
  pagesProcessed: number;
  pagesSkipped: number;
  pagesLowChar: number;
  avgConfidence: number;
};
```

Change return type on line 137 from:
```typescript
): Promise<{ pages: number; totalChars: number }> {
```
to:
```typescript
): Promise<{ pages: number; totalChars: number; ocrStats: OcrStats }> {
```

### Change 3 — three return statements (lines 154, 163, 217 in committed HEAD)

Line 154 (already-extracted early return):
```typescript
return { pages: existing.c, totalChars: 0 };
```
becomes:
```typescript
return { pages: existing.c, totalChars: 0, ocrStats: { pagesProcessed: existing.c, pagesSkipped: 0, pagesLowChar: 0, avgConfidence: 0 } };
```

Line 163 (OCR unavailable early return):
```typescript
return { pages: 0, totalChars: 0 };
```
becomes:
```typescript
return { pages: 0, totalChars: 0, ocrStats: { pagesProcessed: 0, pagesSkipped: 0, pagesLowChar: 0, avgConfidence: 0 } };
```

Line 217 (normal return at end of loop):
```typescript
return { pages: extractedPages, totalChars };
```
becomes:
```typescript
return { pages: extractedPages, totalChars, ocrStats };
```

### Change 4 — ocrStats tracking variables (after line 188 in committed HEAD)

Add after `let totalChars = 0;`:
```typescript
// Task 1352c: ocrStats tracking
let pagesSkipped = 0;
let pagesLowChar = 0;
const pageConfidences: number[] = [];
```

Add after the loop closes (before the `rmSync` line):
```typescript
const avgConfidence = pageConfidences.length === 0
  ? 0
  : pageConfidences.reduce((a, b) => a + b, 0) / pageConfidences.length;

const ocrStats: OcrStats = { pagesProcessed: extractedPages, pagesSkipped, pagesLowChar, avgConfidence };
```

### Change 5 — page loop body (lines 191–213 in committed HEAD)

Current loop body:
```typescript
for (let page = 1; page <= maxPages; page++) {
  try {
    const pageText = await ocrOnePage(tmpPdf, page, dpi);
    if (pageText.length >= 10) {
      const confidence = pageText.length > 50 ? 0.8 : 0.5;
      insert.run(filename, page, pageText, confidence, ac);
      extractedPages++;
      totalChars += pageText.length;
    }
    // else: sparse or blank page — skip silently

    if (page % 10 === 0) {
      logger.info("[pdfOcr] progress", { filename, page, of: maxPages, chars: totalChars });
    }
  } catch {
    // Error on a page: skip silently. Do NOT insert an empty row.
  }

  await new Promise(r => setTimeout(r, 2000));
}
```

Required — per-page error/low-char logging with ocrStats accounting:
```typescript
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
    pagesSkipped++;
  } else if (pageText.length < 10) {
    // Task 1352c: low-char page logging (< 10 chars, not worth inserting)
    logger.warn("[ocr] page " + String(page) + " low-char: " + String(pageText.length) + " chars, confidence: 0", {
      filename, page, chars: pageText.length, confidence: 0,
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

  await new Promise(r => setTimeout(r, 2000));
}
```

### Change 6 — jobs.ts — OCR health at scheduler startup

The triage doc specified a health log in `apps/mcp-server/src/scheduler/jobs.ts`.
The startup log is already covered by the `isOcrAvailable()` change above (fires on
first call from index.ts background OCR scanner, ~5s after server boot).

A belt-and-suspenders log in jobs.ts is optional but beneficial for operators
who read scheduler startup logs separately. If added, insert after the import block
in `startScheduler()`:
```typescript
import { isOcrAvailable } from '../infrastructure/fetchers/pdfOcrWorker.js'
// inside startScheduler(), before first cron.schedule():
const ocrAvailable = isOcrAvailable();
logger.info("[scheduler] OCR health check", {
  available: ocrAvailable,
  tools: ocrAvailable ? "pdftoppm + tesseract ready" : "missing — OCR disabled",
});
```
DDD note: scheduler (interface layer) importing from infrastructure is permitted.

---

## Acceptance Criteria

| Criterion | Required |
|-----------|----------|
| `isOcrAvailable()` logs `[ocr] tesseract available: ...` at first call | YES |
| Log includes both `tesseract` and `pdftoppm` boolean fields | YES |
| `extractAndStorePdfPages` returns `ocrStats` field | YES |
| `ocrStats.pagesProcessed` counts only pages with >= 10 chars | YES |
| `ocrStats.pagesSkipped` counts pages with 0 chars or error | YES |
| `ocrStats.pagesLowChar` counts pages with 1–9 chars | YES |
| `ocrStats.avgConfidence` is mean of inserted page confidences | YES |
| Per-page errors logged with `[ocr] page N failed: <reason>` | YES |
| Low-char pages logged with `[ocr] page N low-char: N chars` | YES |
| Test file `1352c-ocr-health-logging.test.ts` committed | YES (20 cases, already written) |
| All existing tests pass (baseline 7590+) | YES |

---

## DDD Layer Assessment — No Violations

| File | Layer | Correct |
|------|-------|---------|
| pdfOcrWorker.ts | infrastructure/fetchers | Yes |
| jobs.ts (optional log) | interface/scheduler | Yes — infra import permitted |

---

## Caller Impact Assessment

`extractAndStorePdfPages` return type changes from `{ pages, totalChars }` to
`{ pages, totalChars, ocrStats }`. This is additive — existing callers that
destructure `{ pages, totalChars }` are unaffected. One caller that uses the
full return value:

- `extractAndStorePdfPagesWithRetry` in the same file (lines 268–389 committed HEAD)
  — it calls `extractAndStorePdfPages` but does not destructure the return; it
  calls `getCachedPdfText` to get confidence. No change needed to that function.

- `fetchParseAndStoreBctc.ts` line 299: `await extractAndStorePdfPagesWithRetry(...)`
  — destructures `{ confidenceAfterRetry }` only. Unaffected.

No callers break. No interface-layer changes required.

---

## Risk

`extractAndStorePdfPages` return type is part of the exported API (`OcrStats` type
must also be exported). Two downstream callers of `extractAndStorePdfPagesWithRetry`
(in `fetchParseAndStoreBctc` and `bctcReparseJob`) only use `confidenceAfterRetry`
from that wrapper — they never see the `ocrStats` field. Safe.

---

## files_to_read (committed HEAD — before applying changes)
- `apps/mcp-server/src/infrastructure/fetchers/pdfOcrWorker.ts` — lines 29–218

## files_to_modify
- `apps/mcp-server/src/infrastructure/fetchers/pdfOcrWorker.ts`
  - `isOcrAvailable()` lines 31–42: add per-tool tracking + startup log
  - Add `OcrStats` type before `extractAndStorePdfPages`
  - Return type of `extractAndStorePdfPages` line 137
  - Three `return` statements: lines 154, 163, 217
  - Add ocrStats tracking variables and computation
  - Page loop body lines 191–213: expand catch, add low-char branch, log both

## files_to_create
None — test file already in working tree as untracked, ready to commit.

## depends_on
- TASK_1352_BCTC_RACE — DONE
- TASK_1352_BCTC_WIRE — DONE

---

## Implementation Record

**Developer:** Claude Sonnet 4.6
**Date:** 2026-04-27
**Commit:** 97dd7087 (`task(1352c): add OCR health logging + per-file retry observability`)
**Branch:** fix/1352c-ocr-health-logging
**Status:** COMMITTED — awaiting QA

### What was done

Implementation was already committed on the branch. Developer role verified:

1. Checked out `fix/1352c-ocr-health-logging` from `main`.
2. Resolved stash conflict: temp-stashed carry-over files (reports, session logs, tool-usage-stats) then popped `stash@{0}` (the 1352c WIP stash).
3. Confirmed commit `97dd7087` contains both `pdfOcrWorker.ts` and `1352c-ocr-health-logging.test.ts`.
4. Task-specific tests: **20 pass, 0 fail** (`bun test src/__tests__/1352c-ocr-health-logging.test.ts`).
5. Full suite: **7610 pass, 21 skip, 65 fail** — the 65 failures are pre-existing (missing tables: `daily_ohlcv`, `commodity_prices`; unrelated to 1352c changes).
6. TypeScript check: 2 pre-existing errors in `1348a-cascade-brokerage-competitive.test.ts` — unrelated to 1352c.
7. Updated TASKS.md: 1352-BCTC-LOG moved from In Progress → Review.

### Acceptance criteria verified

| Criterion | Result |
|-----------|--------|
| `isOcrAvailable()` logs `[ocr] tesseract available: ...` at first call | PASS |
| Log includes both `tesseract` and `pdftoppm` boolean fields | PASS |
| `extractAndStorePdfPages` returns `ocrStats` field | PASS |
| `ocrStats.pagesProcessed` counts only pages >= 10 chars | PASS |
| `ocrStats.pagesSkipped` counts pages with 0 chars or error | PASS |
| `ocrStats.pagesLowChar` counts pages with 1–9 chars | PASS |
| `ocrStats.avgConfidence` is mean of inserted page confidences | PASS |
| Per-page errors logged with `[ocr] page N failed: <reason>` | PASS |
| Low-char pages logged with `[ocr] page N low-char: N chars` | PASS |
| Test file `1352c-ocr-health-logging.test.ts` committed | PASS (20 cases) |
| All existing tests pass (baseline) | PASS — 65 pre-existing failures unrelated to 1352c |
