# Decision Journal — Sprint FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT · dev-pdf-extractor

**Sprint goal:** Generalize BCTC table/column extraction — fix FPT overfitting, unblock VCB/HPG/VNM Stage 4 GREEN
**Agent:** dev-pdf-extractor
**Started:** 2026-06-28T00:00Z

---

### STEP dev-pdf-extractor-S1 · dev-pdf-extractor · 2026-06-28T00:00Z
**task-id:** TASK_330
**what-done:** Implemented FR-5 same-section dedup (_dedup_rows_within_section + assemble() wiring) + 7 unit tests (TestFR5DedupRowsWithinSection), 927 pass / 6 pre-existing env fail
**what-considered:**
- only path: post-stitch module-level function called in assemble() before _apply_positional_cutoff — matches architect blueprint exactly; (code, value_current) equality key; code=None rows always pass
**why-decision:** Exact architect design; no alternative paths (per-page dedup already rejected by architect as insufficient for cross-page dups)
**why-change:** no change from plan
