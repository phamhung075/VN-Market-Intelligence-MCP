# Decision Journal — Sprint BCTC-PROSE-EXTRACT · dev-mcp-server

**Sprint goal:** BCTC extractor must extract ALL page content — prose/non-table pages surfaced. Close silent-empty prose drop.
**Agent:** dev-mcp-server
**Started:** 2026-06-10T00:00:00Z

---

### STEP dev-mcp-server-S28 · dev-mcp-server · 2026-06-10T01:59:00Z
**task-id:** BPE-DEV-3
**what-done:** Fixed total_pages COUNT→MAX + OFFSET→point-lookup (bctcInspectHandler) and skip-guard <10→<3 + DPI escalation (pdfOcrWorker). 15 new tests GREEN. Rebuilt container.
**what-considered:**
- COUNT vs MAX: MAX is only correct choice — COUNT(35)≠MAX(46) for FPT; total_pages drives OCR range
- OFFSET vs point-lookup: point-lookup required — OFFSET 11 = page 23 (wrong), WHERE page_number=12 = empty (correct)
- Skip threshold: <3 vs <5 vs remove entirely — <3 preserves 1-2 stray chars as noise gate; <5 was architect recommendation; chose <3 per brief spec exactly
- DPI escalation: 300 DPI retry for <50 char pages before skip decision — exactly per architect brief recommendation
**why-decision:** Architect brief explicitly prescribes all three values (<3, 300 DPI, MAX). RISK-OCR-2 confidence<0.1 guard added in handler coverage-gap fallback per brief open-risk section.
**why-change:** No change from architect plan. All prescriptions followed exactly.

### STEP dev-mcp-server-S27 · dev-mcp-server · 2026-06-10T00:15:00Z
**task-id:** BPE-DEV-2
**what-done:** Extended bctcInspectHandler PEK seam to serve prose units; added prose_sections to bctcFullTools with 4000-char cap.
**what-considered:**
- Option A: extend page_type filter to IN('table','prose') (chosen — RISK-4 ruling: keeps blank units excluded)
- Option B: remove page_type filter entirely (rejected — blank units would match, changing EC-5 behavior)
- Inline check for empty stitched_markdown vs separate query (chose inline guard before serve path)
**why-decision:** AC-1 + AC-2 + RISK-4 all align on IN filter. Empty prose EC-1 handled via conditional before serving — avoids second DB round-trip while still triggering fallback correctly.
**why-change:** No change from architect design. Parallel-safe with BPE-DEV-1 producer (separate zones). prose_sections safe-degrade to [] in legacy test DBs (no bctc_layout_units) via catch block.
