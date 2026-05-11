# BCTC PDF Extraction Pipeline — Bug Triage

**Triggered by:** Dev team
**Sprint:** 1352
**Date:** 2026-04-28
**Current Baseline:** 7598 pass / 0 fail

---

## Summary

Three high-priority bugs identified in the BCTC PDF extraction pipeline. All require coordination across extraction flow (bctcPdfPullJob → fetchParseAndStoreBctc → pdfOcrWorker) and optional microservice (pdf-extractor port 5001).

| Bug # | Title | Severity | Root Cause | Impact |
|-------|-------|----------|-----------|--------|
| 1352a | **Async extraction race** | HIGH | `bctcPdfPullJob` fires extraction without `await` | PDFs marked done before extraction completes; low-confidence extracts discarded silently |
| 1352b | **pdf-extractor orphaned** | MEDIUM | Microservice (port 5001, pybctc) never wired into `fetchParseAndStoreBctc` | Better table detection (pybctc) unused; falls back to pdf-parse (text-only) |
| 1352c | **OCR health logging silent** | MEDIUM | `isOcrAvailable()` checked at startup but failures never logged; no per-file retry | Failed extracts not diagnosed; no DPI escalation when needed |

---

## Bug 1352a: Async Extraction Race — Fire-and-Forget Blocks Queue Status

**File:** `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts`
**Lines:** 308–320
**Severity:** HIGH

### Current Behavior

```typescript
// Line 308: Fire-and-forget — error swallowed, but QUEUE MARKED DONE IMMEDIATELY
deps
  .triggerExtraction({
    actionCode: row.action_code,
    year: row.period_year,
    quarter: row.period_quarter,
    filePath,
  })
  .catch((err) => {
    logger.warn("[bctcPdfPull] extraction trigger failed (non-fatal)", {
      ticker: row.action_code,
      error: err instanceof Error ? err.message : String(err),
    });
  });
```

The `triggerExtraction` promise is not awaited. The queue row is marked `done` at line 304 **before** the background extraction completes.

### Consequence

1. **Early completion signal:** Caller (scheduler) thinks PDF is ready for analysis immediately.
2. **Low-confidence silent discard:** If extraction (in bctcReparseJob) fails or returns confidence < 0.3, no retry attempt happens — queue row is already `done`.
3. **Race window:** MCP tool may call `read_bctc_pdf` before OCR text is stored in `pdf_extracted_text` table.

### Fix

1. **Await extraction before marking queue done:**
   ```typescript
   try {
     await deps.triggerExtraction({
       actionCode: row.action_code,
       year: row.period_year,
       quarter: row.period_quarter,
       filePath,
     });
   } catch (err) {
     // Extraction failed — log but don't fail the PDF pull
     logger.warn("[bctcPdfPull] extraction trigger failed", { ... });
   }
   // Now safe to mark done
   updateDone.run(row.id);
   result.downloaded++;
   ```

2. **Add confidence retry in bctcReparseJob:**
   - After OCR extracts text, check `confidence < 0.3`.
   - If true and phase-1 DPI=200 was used: call `extractAndStorePdfPagesWithRetry` to escalate to DPI 300.
   - Log retry decision and confidence improvement.

3. **Add extraction_method tracking:**
   - After successful extraction, stamp `extraction_method` on `financial_reports` row (was done in Task 1349d for fallback; extend to OCR retry).

**Test Plan:**
- Mock triggerExtraction to throw after 100ms.
- Verify queue row is NOT marked `done` until extraction resolves.
- Add low-confidence PDF (confidence 0.25) and verify DPI 300 retry triggered.
- Verify extraction_method stamped to `ocr_pdf` or `ocr_pdf_high_dpi` after retry.

---

## Bug 1352b: pdf-extractor Microservice Orphaned

**Files:**
- `apps/mcp-server/src/infrastructure/fetchers/pdfExtractorClient.ts` (client exists, never called)
- `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts` (step 2 only calls pdf-parse + OCR)
- `apps/mcp-server/src/infrastructure/fetchers/pdf.ts` (downloadAndExtractPdf does not check pdf-extractor first)
- `docker-compose.yml` (pdf-extractor service running but unused)

**Severity:** MEDIUM (no functional breakage, but leaves better tool unused)

### Current Behavior

The `pdfExtractorClient.ts` module exports `extractViaMicroservice()` and `checkPdfExtractorHealth()`, but they are **never called** from the main extraction pipeline:

1. `downloadAndExtractPdf` (pdf.ts) → uses only pdf-parse + inline OCR fallback. Never tries pdf-extractor.
2. `fetchParseAndStoreBctc` (step 2) → calls `downloadAndExtractPdf` directly. No microservice fallback.
3. Docker service `pdf-extractor` (port 5001, pybctc) → running but never invoked.

### Why This Matters

The pybctc PDF extraction (Python/pdfplumber) has **superior table detection**:
- pdf-parse (Node) → extracts raw text only
- pybctc (Python) → extracts tables as structured arrays + text
- Tables in BCTC reports are critical (balance sheet, income statement rows)

**Expected flow:** pdf-parse (fast) → if < 100 chars, OCR (slow) → if still low, pybctc (best tables).

**Actual flow:** pdf-parse → if < 100 chars, OCR. pybctc never tried.

### Fix

1. **Wire pybctc as fallback in pdf.ts:**
   - After OCR returns < 0.5 confidence, check if pdf-extractor is healthy.
   - If healthy, try `extractViaMicroservice(url, "bctc")`.
   - If pybctc returns tables, prefer them for financial reports (confidence boost).

2. **Add health check at startup:**
   - In `apps/mcp-server/src/index.ts` or scheduler init, call `checkPdfExtractorHealth()`.
   - Log result: "pdf-extractor (5001) — OK" or "unreachable, falling back to OCR".
   - Store health status in memory for fast lookup (avoid repeated probes).

3. **Update extraction_method stamping:**
   - Rename fallback.extraction_method from `'ocr_pdf'` to `'pdf_parse'` (no OCR fallback).
   - Add `'ocr_pdf'` when OCR is the primary result.
   - Add `'pybctc_tables'` when pybctc tables are extracted and used.

**Test Plan:**
- Mock `checkPdfExtractorHealth()` to return false → verify fallback to OCR only.
- Mock `extractViaMicroservice()` to return tables → verify tables are logged and confidence boosted.
- Add integration test with real docker pdf-extractor running (separate test suite flag).
- Verify extraction_method correctly stamped for each code path.

---

## Bug 1352c: OCR Health Logging Silent + No Per-File Retry

**Files:**
- `apps/mcp-server/src/infrastructure/fetchers/pdfOcrWorker.ts` — line 31–42 (`isOcrAvailable()`)
- Line 161–164 (failure logging is a single warn, not detailed)
- Line 256–336 (`extractAndStorePdfPagesWithRetry` exists but called only from `fetchParseAndStoreBctc` when confidence < 0.3)

**Severity:** MEDIUM (currently mitigated by retry logic in Step 1352a, but lacks observability)

### Current Behavior

```typescript
// Line 31-42: Checked once at startup, cached, never logged
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

// Line 161-164: Failure is not per-file; it's global once
if (!isOcrAvailable()) {
  logger.warn("[pdfOcr] tesseract/pdftoppm not available");
  return { pages: 0, totalChars: 0 };
}
```

**Problems:**
1. **No startup log:** If OCR is unavailable, operators have no visibility. Failures are silent until a PDF actually tries to use it.
2. **No per-file retry on failure:** If pdftoppm crashes mid-extraction on one page, extraction silently stops. No DPI escalation attempt.
3. **Retries only on low confidence, not errors:** `extractAndStorePdfPagesWithRetry` only triggers on confidence < 0.3. It doesn't catch extraction errors (e.g., tesseract segfault).

### Fix

1. **Log OCR availability at startup:**
   - In scheduler/jobs.ts (where all jobs are registered), add:
     ```typescript
     const ocrAvailable = isOcrAvailable();
     logger.info("[scheduler] OCR health check", {
       available: ocrAvailable,
       tools: ocrAvailable ? "pdftoppm + tesseract ready" : "missing — OCR disabled",
     });
     ```

2. **Per-file error retry in extractAndStorePdfPages:**
   - Wrap each `ocrOnePage()` in try-catch.
   - On catch, log the error with filename + page number.
   - Attempt retry with DPI 300 for that specific page (not full re-extraction).
   - If page extraction fails twice, skip silently (current behavior) but log both attempts.

3. **Add explicit logging for low-confidence extracts:**
   - After each call to `extractAndStorePdfPages`, check returned `totalChars`.
   - If < 100 chars, log warning with filename + reason ("likely scanned PDF").
   - This helps operators identify which PDFs need manual review.

**Test Plan:**
- Mock `isOcrAvailable()` to return false → verify startup log indicates "OCR disabled".
- Mock `ocrOnePage()` to throw on page 5 → verify page 5 logged as failed, retry attempted with DPI 300, overall extraction continues.
- Add low-char extraction result (< 100 chars) → verify warning logged with filename.
- Verify all logs include actionCode + filename for correlation.

---

## Sprint 1352 Task Breakdown

| Task | Title | Dependencies | Acceptance Criteria |
|------|-------|--------------|-------------------|
| **1352a** | **Async extraction race** — bctcPdfPullJob + low-confidence retry | None (first) | Extraction awaited; queue row marked done only after OCR completes. If confidence < 0.3, DPI 300 retry triggered. extraction_method stamped. 8+ unit tests for race, retry, stamping. All existing tests pass. |
| **1352b** | **pdf-extractor orphaned** — wire microservice + health check | 1352a (after async fix in place) | Health check logged at startup. pdf-extractor fallback wired in pdf.ts after OCR. Table extraction working in mock and integration tests. extraction_method correctly stamped for each code path. 12+ tests. All existing + new pass. |
| **1352c** | **OCR health logging** — startup log + per-file error retry + low-char warn | 1352a + 1352b (after both pipeline fixes) | Startup log emitted. Per-page error logged + DPI 300 retry attempted. Low-char PDFs logged with actionCode + filename. All OCR failures visible in logs. 10+ tests. Full suite passes. |

---

## Integration Points

- **VPS PDF pull:** bctcPdfPullJob (fixed in 1352a) calls triggerExtraction → bctcReparseJob
- **SSC PDF fetch:** MCP tool `fetch_ssc_reports` calls fetchParseAndStoreBctc (uses pdf-extractor via 1352b)
- **OCR fallback:** pdfOcrWorker called from fetchParseAndStoreBctc (logging improved in 1352c)
- **DB stamping:** extraction_method updated on financial_reports row in all three paths
- **Monitoring:** All logs tagged with [tag] for easy grep; actionCode + filename for correlation

---

## Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| **1352a:** Extraction timeout blocks queue indefinitely | Add timeout in triggerExtraction (already 60s in pdf.ts). Mark queue row `failed` if timeout occurs. |
| **1352b:** pdf-extractor unavailable → silent fallback | Health check at startup; log "unreachable". Fallback to OCR graceful. No user-visible breakage. |
| **1352c:** Retry loop consumes server resources | Retry only on low-confidence (< 0.3) or extraction error. Max 2 phases (DPI 200 → 300). Skip if already partial extraction exists. |

---

## Files to Edit

**1352a (Async Race):**
- `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts` (await triggerExtraction)
- `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts` (add retry logic)
- `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts` (stamp extraction_method)

**1352b (Microservice):**
- `apps/mcp-server/src/infrastructure/fetchers/pdf.ts` (add microservice fallback)
- `apps/mcp-server/src/index.ts` (or scheduler init) (health check startup)

**1352c (Logging):**
- `apps/mcp-server/src/infrastructure/fetchers/pdfOcrWorker.ts` (per-file error logging + retry)
- `apps/mcp-server/src/scheduler/jobs.ts` (OCR health check at startup)

**Tests (all three tasks):**
- `apps/mcp-server/src/__tests__/` — new test files for each bug + integration test

---

## Current State & Metrics

- **Test Baseline:** 7598 pass / 0 fail
- **Tools:** 108 total
- **Scheduler Jobs:** 51 files (includes 9 financial-report jobs)
- **Last Sprint (1351):** vpsProxyWatchdogJob + weatherCheckJob gap tests (16 new tests, 7598 baseline maintained)
- **Related Sprints:** 1343a–1343e (BCTC recovery), 1349a–1349f (observability), 1350a (test baseline), 1346d (PDF circuit breaker race)

---

## Notes for Developer

- All three bugs are in the **extraction orchestration layer** (scheduler + application).
- The actual OCR + parsing libraries (pdfOcrWorker, pdf-parse, pybctc) are working correctly.
- **1352a is blocking:** Must fix the race before 1352b and 1352c can be properly integrated.
- **1352b is optional but recommended:** Activates better table detection for BCTC financial tables.
- **1352c improves observability:** Operators can now see and debug OCR failures instead of silent misses.
- Use feature flags if rolling out pdf-extractor fallback gradually (e.g., 10% rollout first).
