# Decision Journal — Sprint BCTC-PROSE-EXTRACT · ba

**Sprint goal:** BCTC extractor extracts ALL page content — prose pages (Thuyết minh) never silently dropped; OCR coverage gap closed; AI layer consumes prose text.
**Agent:** ba
**Started:** 2026-06-09T00:00:00Z

---

### STEP ba-S1 · ba · 2026-06-09T00:00:00Z
**task-id:** BPE-BA-1
**what-done:** Read all source files (ocr_unit prose branch, extract_layout_first_usecase, pushBctcLayoutHandler, bctcInspectHandler, schema, AI tool) and produced full FR/NFR spec with DDD layer mapping in docs/handoffs/BCTC-PROSE-EXTRACT-BA-spec.md.
**what-considered:**
- Only path: direct source-read of all 4 required layers (producer/storage/serving/consumer) before writing spec; no assumption-based spec.
- Recurring-bug-escalation=true: flagged architect SPIKE as mandatory NFR-4 before dev starts.
**why-decision:** Source-read confirms root is a single-line bug in ocr_unit prose branch (prose_lines never populated) compounded by a second defect (pek_coverage_gap filter excludes prose units in serving query). Both must be addressed together. Architect SPIKE required per escalation policy.
**why-change:** no change from plan
