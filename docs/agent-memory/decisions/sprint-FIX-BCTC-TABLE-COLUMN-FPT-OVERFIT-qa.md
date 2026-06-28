# Decision Journal — Sprint FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT · qa

**Sprint goal:** Generalize BCTC table/column extraction — fix FPT overfitting, unblock VCB/HPG/VNM Stage 4 GREEN
**Agent:** qa
**Started:** 2026-06-28T08:00Z

---

### STEP qa-S2 · qa · 2026-06-28T10:30Z
**task-id:** 327
**what-done:** QA gate TASK_327 (FR-1 code-range gate _CODE_VALUE_COL_RE \d{2,3}→\d{3}) — APPROVED
**what-considered:**
- Failure-count reconcile (load-bearing): 6→12 delta. Unit-only scope = 898 now (893 pre-327 = 887+6 matching TASK_326 QA exactly). Full suite = 1043. 6 extra failures = integration+top-level PIL/OCR-unavailable/flake, zero in unit/. e939a422 modified 0 of the 12 failing test files (git confirmed). 2 integration tests import TextTableExtractor class (not _CODE_VALUE_COL_RE); fail with rows_stored=0 = Tesseract+PDF unavailable on host Mac.
- FPT non-regression: TestFR1CodeRangeGate tests 270/221/300 — all 3 match \d{3}, group(1) verified. No FPT code dropped.
- NFR-4: diff grep for ticker/issuer/form conditionals — only match is sprint-name comment; zero per-issuer branches in production code.
**why-decision:** All AC green, 0 regressions, scope-only explanation for 6→12 delta proven mathematical (898-5=893=TASK_326 unit count)
**why-change:** no change from plan

### STEP qa-S1 · qa · 2026-06-28T08:00Z
**task-id:** 326
**what-done:** QA gate TASK_326 (FR-3 Roman numeral OCR normalization) — APPROVED
**what-considered:**
- NFR-4 violation scan: diff grep for issuer/ticker/form conditionals returned commit-message text only; production code contains ZERO per-issuer branches
- Backward-safety: ran full unit suite (887 pass / 6 fail); 6 failures confirmed pre-existing (PIL/page_rasterizer test_page_rasterizer.py + test_ocr_unit_tesseract_retry.py — unrelated to FR-3)
- Test coverage: 15 new tests (8 normalization pairs + 5 canonical pass-through + period-guard + non-roman + e2e VCB page5 assemble) all PASS
- Sandbox G12: primitive tier 29 pass / 6 intentional-fail (known_bad honesty fixtures + failure_mismatch); module tier 1 pass / 0 fail
**why-decision:** All AC (1–7) green, NFR-4 satisfied (EXACT-KEY dict match only — no substring/fuzzy), FPT golden unaffected (FPT Roman codes canonical — none in OCR misread table), period guard confirmed active via test
**why-change:** no change from plan
