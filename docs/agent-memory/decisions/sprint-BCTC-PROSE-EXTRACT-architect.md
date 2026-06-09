# Decision Journal — Sprint BCTC-PROSE-EXTRACT · architect

**Sprint goal:** BCTC extractor must extract ALL page content — prose/non-table pages (Thuyết minh) never dropped. Every page yields content. Close 46-vs-35 OCR gap. Drive ba→architect→pm→dev to DONE.
**Agent:** architect
**Started:** 2026-06-09T00:00:00Z

---

### STEP architect-S1 · architect · 2026-06-09T22:10Z
**task-id:** BPE-ARCH-1
**what-done:** Completed SPIKE brownfield scan and resolved all 5 BA blockers; appended full technical design to docs/handoffs/BCTC-PROSE-EXTRACT-BA-spec.md.
**what-considered:**
- BLOCKER-1: Option A (pass ocr_pages to ocr_unit) vs Option B (fetch inside ocr_unit). Option A keeps ocr_unit a pure synchronous callable with no infrastructure port — no circular dep, no async signature change. Option B requires injecting OcrPagesFetchClientPort into a Tier-2 compute function, violating DDD.
- BLOCKER-2: Same-root vs separate for 46-vs-35 gap. Audited pdfOcrWorker.ts: the ONLY INSERT path. Found maxPages=80 cap (does not apply to 46-page PDFs), and 10-char skip guard (L270-278). 35-page count = 11 pages returned <10 chars from Tesseract. SEPARATE defect from prose-drop. FR-1/FR-2 bypass the legacy fallback entirely.
- BLOCKER-4: New tool vs extend getBctcPageTextTool. Extending avoids proliferation. The tool delegates to /api/page-text which will auto-serve prose after FR-2c. FR-4b (full-doc) handled by prose_sections array in bctcFullTools.ts, not a new tool.
- BLOCKER-5: Root cause of 7+ sprint silent drop — no non-empty assertion on prose stitched_markdown, gate skip masking empty result, PROSE-DEV-1 fallback normalizing the bad behavior across sprints.
**why-decision:** Option A minimal-change additive param; separate-defect determination is code-read confirmed (char-count guard not page-type filter); extend-not-duplicate consistent with brownfield-first constraint; root-cause traced to test gap + fallback normalization.
**why-change:** no change from plan
