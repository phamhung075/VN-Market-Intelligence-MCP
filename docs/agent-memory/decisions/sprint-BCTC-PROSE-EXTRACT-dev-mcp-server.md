# Decision Journal — Sprint BCTC-PROSE-EXTRACT · dev-mcp-server

**Sprint goal:** BCTC extractor must extract ALL page content — prose/non-table pages surfaced. Close silent-empty prose drop.
**Agent:** dev-mcp-server
**Started:** 2026-06-10T00:00:00Z

---

### STEP dev-mcp-server-S27 · dev-mcp-server · 2026-06-10T00:15:00Z
**task-id:** BPE-DEV-2
**what-done:** Extended bctcInspectHandler PEK seam to serve prose units; added prose_sections to bctcFullTools with 4000-char cap.
**what-considered:**
- Option A: extend page_type filter to IN('table','prose') (chosen — RISK-4 ruling: keeps blank units excluded)
- Option B: remove page_type filter entirely (rejected — blank units would match, changing EC-5 behavior)
- Inline check for empty stitched_markdown vs separate query (chose inline guard before serve path)
**why-decision:** AC-1 + AC-2 + RISK-4 all align on IN filter. Empty prose EC-1 handled via conditional before serving — avoids second DB round-trip while still triggering fallback correctly.
**why-change:** No change from architect design. Parallel-safe with BPE-DEV-1 producer (separate zones). prose_sections safe-degrade to [] in legacy test DBs (no bctc_layout_units) via catch block.
