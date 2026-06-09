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

---

### STEP architect-S2 · architect · 2026-06-10T00:00Z
**task-id:** BPE-SPIKE-1
**what-done:** OVERRULED BLOCKER-2; settled total_pages semantics; confirmed skip-guard root cause for pages 11-22; confirmed GAP-2 self-heals on re-flow post-OPS-1; resolved page off-by-N as NO misalignment; wrote brief docs/architecture-briefs/2026-06-09-bctc-prose-ocr-coverage-rootcause.md.
**what-considered:**
- BLOCKER-2: prior "benign/separate" relied on unverified assumption that 11 absent pages are blank. User screenshot of page 12 + pages-11-22 spread contradicts it. OVERRULED.
- COUNT vs MAX: PEK path — MAX makes JSON truthful; navBound already from pdf.js (46), so no UI change. Non-PEK path — MAX + OFFSET fix required together (point-lookup).
- Skip guard: < 10 is wrong for Vietnamese text-heavy pages at 200 DPI; user screenshot proves visible text. Threshold raise to < 3 + DPI escalation retry.
- Completeness guard locks 35-row dataset — delete + re-OCR is the only escape path; code fix must precede ops re-run.
- Page off-by-N: pdf.js drives navBound; renderOcr called with exact PDF page number; no OFFSET confusion in PEK path; confirmed page 12 = DB page 12.
**why-decision:** New evidence (pages-11-22 absent, user screenshot, GAP-3 re-verification) overrides prior speculative "benign" assumption. All four findings self-consistent.
**why-change:** BLOCKER-2 reversed — new evidence was not available at prior ruling.
