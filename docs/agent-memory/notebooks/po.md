# PO Notebook

## Cycle 2026-05-29T20:58Z — USER bug triage → SPRINT (BCTC-TABLE-BOUNDARY)

**Report (caveman):** per-page table extract OVER-MERGES — merges ALL tables as one continuous unit. Want: merge ONLY genuine continuation (page N+1 = same structure); when table ENDS → fall back to normal text; when NEW table appears → start FRESH unit. Boundary-aware (start/continue/end/new), not greedy merge.

**Verdict:** SPRINT-S (NOT one-shot FIX). Recurring-bug class → architect RCA BEFORE any patch (feedback_recurring_bug_escalation; table extraction has dual-path drift, OCR psm drift, schema divergence priors). Chain: ba → architect (RCA on boundary logic) → dev-pdf-extractor → ops rebuild → qa LIVE-verify.

**Root-cause area (CONFIRMED by read, not assumed):** Tier 0 grouping `build_document_map()` + `_fingerprints_continuous()` in `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` (L2552 / L3000). Continuity test is purely geometric (page_type + gutter_count + gutter_x + row_pitch). Gaps that cause over-merge: (1) two distinct tables both page_type=table with similar gutters merge with no title/intervening-prose break; (2) dominant-page-type voting in `_flush_unit` lets a table-then-prose page stay `table` so no fall-back to text; (3) blank-page tolerance (L2664) unconditionally bridges units. Orchestrator `extract_layout_first_usecase.py` consumes units → drives `page_numbers_json` viewer filters.

**Repro:** FPT sentinel `e71f845d-ffa5-48f9-8f09-30ac2cd09c65` (unit spans p7-9, total 46) + REQUIRE a 2nd multi-table report for QA (anti-false-green; not done until BOTH show correct boundaries live).

**FROZEN-FILE SCOPE DECISION (mine, explicit):** generic_md_table_extractor.py was frozen for Task #9 BCTC-EVAL-INSPECT-MERGE. Task #9 is CLOSED (commit 891dd3f0 EXIT). Freeze LIFTED by sprint closure. I AUTHORIZE this sprint to edit generic_md_table_extractor.py (Tier 0 grouping is the genuine root cause; cannot fix boundary logic elsewhere). PDF-Extract-Kit subtree stays PRISTINE. text_table_extractor.py NOT in scope. Architect must confine changes to build_document_map + _fingerprints_continuous + their helpers.

**New task, NOT reopen:** distinct from PEK-MULTIPAGE (not in live TASKS.md). Create fresh: BCTC-TABLE-BOUNDARY.

**Constraints carried:** main only; CPU-only 8GB; NO re-extraction during HOSE 02:00-08:59 UTC Mon-Fri (run off-hours); scoped commits.

**Commit:** notebook only this cycle. HEAD before: 891dd3f0.

## Carry-over
- BCTC-TABLE-BOUNDARY dispatched to ba → architect. WIP now 3 OPEN sprints (SELF-IMPROVE-GATE X-1, BCTC-LAYOUT-FIRST, +this) — accept: user-reported correctness bug outranks WIP soft-cap.
- QA done-bar: FPT sentinel + 2nd multi-table report BOTH show continue/end-to-text/new-fresh live on DIRECT DB read. Balance badge FORBIDDEN as sole gate (BCTC-TABLE-3 prior).
