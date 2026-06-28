# Decision Journal — Sprint FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT · architect

**Sprint goal:** Generalize BCTC table/column extraction — fix FPT overfitting, unblock VCB/HPG/VNM Stage 4 GREEN
**Agent:** architect
**Started:** 2026-06-28T09:00Z

---

### STEP architect-S1 · architect · 2026-06-28T09:30Z
**task-id:** ARCH-FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT
**what-done:** Designed FR-1..FR-7 generalization blueprint for text_table_extractor.py + extract_tables_usecase.py + vn_number_normalize
**what-considered:**
- FR-1: (A) whitespace-distribution column geometry — REJECTED (text is linearized, spatial coords unavailable); (B) token-count heuristic — REJECTED (fragile with OCR artifacts); (C) code-range structural constraint (only path): `\d{3}` instead of `\d{2,3}` in _CODE_VALUE_COL_RE — ACCEPTED
- FR-4: (A) domain primitive extension of select_balance_sheet_section — REJECTED (PO mandate: application layer); (B) application-layer private helpers _detect_section_start + _filter_pages_to_section — ACCEPTED (pure functions, DDD compliant, composes existing BS primitive)
- FR-5: (A) per-page dedup inside _parse_lines_to_rows — REJECTED (HPG/VNM dups are cross-page); (B) post-stitch dedup in assemble() — ACCEPTED (correct scope: within one assemble() call = one section)
- FR-6: (A) change vn_number_normalize — FLAG: current code ALREADY handles "(1.992.671)" correctly; (B) trace-first upstream investigation + defensive fix in _parse_value for poppler-artifact space — ACCEPTED (RISK-1 HIGH: wrong fix target if developer skips trace)
**why-decision:** Structural/content-signal detection everywhere; zero per-issuer branches; code-range constraint for FR-1 is the only approach available in linearized OCR text; application-layer placement for FR-4 matches PO mandate and keeps TextTableExtractor pure
**why-change:** no change from spec intent; deeper mechanism decisions all resolved by brownfield analysis of existing code

### STEP architect-S2 · architect · 2026-06-28T09:30Z
**task-id:** ARCH-FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT
**what-done:** Identified RISK-1 (FR-6 bug NOT in vn_number_normalize — existing code correct) and RISK-6 (FR-4 Path B gap)
**what-considered:**
- only path: trace-first + defensive _parse_value poppler-artifact handler mirrors existing handler in _find_code_in_line (L250) — canonical pattern already in codebase
**why-decision:** Reuse existing poppler-artifact pattern from L250 in _parse_value rather than changing vn_number_normalize unnecessarily; same OCR defect class
**why-change:** BA spec describes the symptom; architect traced the actual code path and found the root is upstream of vn_number_normalize
