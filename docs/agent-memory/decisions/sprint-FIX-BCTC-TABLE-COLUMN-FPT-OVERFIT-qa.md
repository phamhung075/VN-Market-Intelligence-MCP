# Decision Journal — Sprint FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT · qa

**Sprint goal:** Generalize BCTC table/column extraction — fix FPT overfitting, unblock VCB/HPG/VNM Stage 4 GREEN
**Agent:** qa
**Started:** 2026-06-28T08:00Z

---

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
