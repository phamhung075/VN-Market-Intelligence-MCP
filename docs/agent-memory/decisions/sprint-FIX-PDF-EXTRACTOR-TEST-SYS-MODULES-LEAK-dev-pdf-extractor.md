# Decision Journal — Sprint FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK · dev-pdf-extractor

**Sprint goal:** BOUNDED-1 idle-capacity backlog pickup — fix order-dependent sys.modules leak in test_low_text_density_ocr_rasterize.py.
**Agent:** dev-pdf-extractor
**Started:** 2026-07-29T09:16:54Z

---

### STEP dev-pdf-extractor-S1 · dev-pdf-extractor · 2026-07-29T09:20:00Z
**task-id:** FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK
**what-done:** Reproduced BEFORE state exactly (docker-exec): file+ocr_backends 1 failed/46 passed; file+page_rasterizer 4 failed/28 passed — matches QA evidence byte-for-byte.
**what-considered:**
- AC option (a) monkeypatch.setattr
- AC option (b) new fixture with explicit sys.modules teardown
- AC option (c) reuse the file's own already-correct `_ensure_stub()` conditional pattern
**why-decision:** Option (c) chosen — the file already carries `_ensure_stub()` (only stub if real package absent) right next to the 4 raw unconditional overrides; making the pattern uniform is the minimal, root-cause fix (the raw assignment, not the absence of teardown, is the actual defect) with zero new abstractions.
**why-change:** none from plan.

### STEP dev-pdf-extractor-S2 · dev-pdf-extractor · 2026-07-29T09:35:00Z
**task-id:** FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK
**what-done:** Guarded all 4 raw `sys.modules[name] = stub` lines (pdfplumber/fitz/paddleocr/PIL+PIL.Image) with `if name not in sys.modules:`; added missing real-import-first attempts for PIL/PIL.Image to mirror the pattern already used for the other 3 packages.
**what-considered:** Guard-only (no real-import-first) vs. real-import-first + guard for PIL specifically.
**why-decision:** PIL/PIL.Image were the only 2 of the 5 stubbed names with no preceding `try: import X` — without it, the guard would still stub PIL.Image on hosts where PIL is importable but not yet imported at that point in collection, re-creating the identical leak under a different ordering. Real-import-first closes that gap for good, confirmed via `docker exec ... import PIL,PIL.Image,fitz,paddleocr,pdfplumber` — all 4 are genuinely installed in the live container (and on host).
**why-change:** none from plan — AC's own evidence (fitz page_count/PIL.Image.new leaks) already implied real packages are present; verified directly rather than assumed.

### STEP dev-pdf-extractor-S3 · dev-pdf-extractor · 2026-07-29T09:45:00Z
**task-id:** FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK
**what-done:** Verified AFTER state — both orderings of all 3 previously-broken pairs (ocr_backends, page_rasterizer, ocr_unit_tesseract_retry) now green; full non-slow suite 1033 passed/5 skipped/7 deselected/0 failed; mypy shows 0 new errors vs baseline (git-stash A/B diff).
**what-considered:** Container has no bind mount for apps/pdf-extractor (baked into image at build) — docker-exec against the running container tested the OLD unmodified file until discovered.
**why-decision:** Used `docker cp` to push the fixed file into the live container for an authentic docker-exec verification (matches the AC's literal repro commands) without performing a full image rebuild myself — rebuild+redeploy stays ops's job per the standard REBUILD_REQUIRED gate; docker cp is verification-only and does not persist past container restart.
**why-change:** none from plan — this is a verification-path adaptation, not a scope change.
