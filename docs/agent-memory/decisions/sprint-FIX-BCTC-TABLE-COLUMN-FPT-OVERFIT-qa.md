# Decision Journal — Sprint FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT · qa

**Sprint goal:** Generalize BCTC table/column extraction — fix FPT overfitting, unblock VCB/HPG/VNM Stage 4 GREEN
**Agent:** qa
**Started:** 2026-06-28T08:00Z

---

### STEP qa-S4 · qa · 2026-06-28T12:00Z
**task-id:** 329
**what-done:** QA gate TASK_329 (FR-7 notes-section hard-stop, _is_notes_section_boundary + _in_notes_section flag) — APPROVED
**what-considered:**
- THUY+MINH dual-token requirement (critical dev note): line 565 `if _NORM_THUY in norm_s and "MINH" in norm_s:` independently confirmed in live code. test_vcb_page5_with_thuyetminh_column_header_not_stopped asserts `_is_notes_section_boundary("a ch . Thuyết") is False` — PASS. FPT 3-regression is genuinely resolved (not masked): THUY alone on the FPT OCR fragment never triggers; MINH must also be present.
- Gate placement: FR-7 gate at L1315-1336, confirmed AFTER all existing skip checks (date-header at L1282, junk at L1295, signature-date at L1302, backslash-fragment at L1312) and BEFORE _try_parse_code_row at L1340. "Thuyết 31/3/2026..." filtered upstream by date-header check + also lacks MINH — double protection.
- NFR-4: diff grep for issuer/ticker/form conditionals in production code — zero per-issuer branches; all matches are comment/docstring lines only.
- FPT non-regression: test_fpt_inline_page_unaffected PASS — codes 100/270/440 all present, code 270 value_current == 88,089,621,779,862.0 (exact). Full suite: 11 fail / 1059 pass (1 fewer failure than dev baseline of 12 — all remaining are pre-existing PIL-ABI/OCR/rasterizer env). No new failures introduced.
- 21 tests in TestFR7NotesSectionBoundary (all PASS 21/21 in 0.24s): covers positive boundary (26., 15., Thuyết minh, Ghi chú), negative safety (14., roman codes, 3-digit BCTC codes, empty, "a ch . Thuyết"), integration (boundary halts extraction, boundary line itself not a row, Thuyết minh header integration, FPT non-regression, VCB OCR-fragment false-stop guard).
**why-decision:** All 7 AC green, THUY+MINH dual-token fix independently verified in live code and in test, NFR-4 satisfied, 0 new regressions, critical FPT regression confirmed resolved not masked
**why-change:** no change from plan

### STEP qa-S3 · qa · 2026-06-28T10:50Z
**task-id:** 328
**what-done:** QA gate TASK_328 (FR-2 trailing note-ref strip, re.sub r'\s+\d{1,3}$' + ≥5-char guard) — APPROVED
**what-considered:**
- Guard correctness (load-bearing): independent Python verification — "Chứng khoán kinh doanh 4"→cleaned_len=22≥5→STRIP PASS; "Nợ 1"→cleaned_len=2<5→NO-STRIP PASS; "Quỹ phát triển khoa học 2025"→4-digit no-match→unchanged PASS. Guard is on REMAINING length (len(_label_clean)), not original — code confirmed.
- 7/7 TestFR2TrailingNoterefStrip PASS (independent live run). 122/122 targeted 3-file suite. Full unit suite: 899 pass / 6 fail (exact same pre-existing PIL ABI/OCR baseline as TASK_327). No new failures.
- NFR-4: diff grep for issuer/ticker/form conditionals in production change — only matches are comment lines; zero per-issuer branches in 10-line production diff.
- FPT non-regression: 122/122 including FPT Stage-6 tests, test_end_to_end_vcb_label_strip_in_assembled_row confirms FPT TỔNG CỘNG TÀI SẢN code-only rows unaffected (no trailing digit).
**why-decision:** All 6 AC green, guard on remaining-length verified independently, NFR-4 clean, 0 new regressions
**why-change:** no change from plan

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
