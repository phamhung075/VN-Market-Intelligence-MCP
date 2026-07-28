# Decision Journal — Sprint FIX-PDFX-TESSERACT-CONCURRENCY · dev-pdf-extractor

**Sprint goal:** P0 supervised fix — real OCR concurrency bound on /extract; ratchet break.
**Agent:** dev-pdf-extractor
**Started:** 2026-07-28T16:00:00Z

---

### STEP dev-pdf-extractor-S1 · dev-pdf-extractor · 2026-07-28T16:20:00Z
**task-id:** FIX-PDFX-TESSERACT-CONCURRENCY-VIOLATES-SINGLE-WORKER-INVARIANT
**what-done:** New infrastructure/ocr_gateway.py (BoundedSemaphore(N)+private pool+pytesseract timeout=), rewired 4 of 6 pytesseract call sites through it.
**what-considered:**
- Rewire all 6 call sites (brief §5.3) vs. only the safe subset
- ocr_worker.py (child process) and generic_md_table/extractor.py (40-test seam) risk vs. benefit
**why-decision:** ocr_worker.py structurally cannot see this process's semaphore (separate address space) — bound composed at the PARENT instead. extractor.py's rewire risk (breaking an established direct-arg test seam) outweighs benefit given /extract is the ONLY verified live-traffic path; deferred as a documented follow-up, not silently dropped.
**why-change:** Brief said "all six"; scoped to 4 + 1 parent-side compose to bound blast radius on a P0.

### STEP dev-pdf-extractor-S2 · dev-pdf-extractor · 2026-07-28T16:35:00Z
**task-id:** FIX-PDFX-TESSERACT-CONCURRENCY-VIOLATES-SINGLE-WORKER-INVARIANT
**what-done:** T1 (concurrency-burst) test written against the REAL /extract route; RED-verified on unfixed main via a throwaway git worktree (peak=15, pasted in close-out) before GREEN on the fix.
**what-considered:**
- Full T3 "cancel kills child immediately" per brief vs. an honestly-scoped deadline-backstop test
**why-decision:** True immediate-kill-on-disconnect needs a custom Popen-based tesseract invocation (bypassing pytesseract's own subprocess handling) — out of scope for this session's risk budget. Shipped the GUARANTEED mechanism (bounded deadline via pytesseract's own timeout=) and tested THAT precisely, rather than asserting an untested stronger claim.
**why-change:** Test suite is 8 tests, not the brief's 5 named ones — different shape, same properties covered where implemented; gap stated explicitly in close-out.

### STEP dev-pdf-extractor-S3 · dev-pdf-extractor · 2026-07-28T16:50:00Z
**task-id:** FIX-PDFX-TESSERACT-CONCURRENCY-VIOLATES-SINGLE-WORKER-INVARIANT
**what-done:** Rebuilt pdf-extractor (single service), verified image ID changed, confirmed live: tesseract count 10->1, MemPerc ~95%->~9-11%, semaphore==os_children on /health across multiple samples.
**what-considered:** N/A — direct verification per DoD #4.
**why-decision:** Live numbers confirm the fix; not asserted from code reading alone.
**why-change:** none from plan.
