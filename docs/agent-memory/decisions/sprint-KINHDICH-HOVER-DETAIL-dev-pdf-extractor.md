# Decision Journal — Sprint KINHDICH-HOVER-DETAIL · dev-pdf-extractor

**Sprint goal:** KINHDICH-HOVER-DETAIL sprint (active)
**Agent:** dev-pdf-extractor
**Started:** 2026-06-15T18:58:08Z

---

### STEP dev-pdf-extractor-S1 · dev-pdf-extractor · 2026-06-15T18:58:08Z
**task-id:** FIX-BCTC-ENRICH-SILENT-0ROWS
**what-done:** Added Layout 6 (Roman numeral codes) and Layout 7 (single-digit sub-codes) to `_try_parse_code_row()` in `text_table_extractor.py` to fix 0-row parse for B02-TCTD bank forms (VCB 2026Q1, VCB 2025Q1).
**what-considered:**
- Per-ticker allowlist in OCR adapter — rejected (not generic, forbidden by task spec)
- Separate B02-TCTD parsing pipeline branch — rejected (over-engineered, breaks DDD, duplicates layout state)
- Extend `_try_parse_code_row()` with Layout 6+7 — chosen (minimal, generic, non-breaking, DDD-clean)
**why-decision:** Root cause confirmed: all 5 existing layouts require 2-3 digit numeric codes; B02-TCTD uses Roman (I-XIII) and single-digit (1-9) codes. Extending the single dispatch function adds zero coupling and keeps non-regression path (Layouts 1-5 take priority).
**why-change:** No plan deviation — fix matches root-cause analysis in task spec.
