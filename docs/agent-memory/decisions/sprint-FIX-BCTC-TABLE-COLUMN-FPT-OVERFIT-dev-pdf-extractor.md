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

### STEP dev-pdf-extractor-S2 · dev-pdf-extractor · 2026-06-28T12:45Z
**task-id:** TASK_332
**what-done:** FR-6 VN-number parenthetical robustness — trace first, then two pre-process rules in _parse_value (Rule A: space artifact; Rule B: missing-dot TRUE FM-VCB-4 root cause); 937 pass, sandbox G12 both tiers GREEN
**what-considered:**
- Rule A (space artifact): mirrors identical handler already in _find_code_in_line L269 → defense-in-depth for None case
- Rule B (missing-dot): OCR drops middle separator dot in "(1.992671)" → _PLAIN_NUMBER_RE treats as decimal → -1.992671; fix in infra not domain per DDD
**why-decision:** Trace confirmed canonical vn_number_normalize already handles "(1.992.671)" → bug is upstream; minimal infra fix, zero per-issuer branching (NFR-4 compliant)
**why-change:** Architect expected space-artifact as candidate; trace revealed missing-dot as TRUE root cause
