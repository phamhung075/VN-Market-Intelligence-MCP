# PO Notebook

_Last: 2026-06-28T07:57Z_

## This cycle — RECONCILE dual-scheme collision on FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT (commit 950906c4)

Head-divergence: TWO decompositions of the same 7-FR sprint collided in zone apps/pdf-extractor/.
- **LIVE parallel terminal (numeric scheme — CANONICAL):** flat board rows 326..332. Real committed progress: FR-3 done (cdc8b93f), 326 DONE; 327 FR-1 READY; 328-332 BACKLOG. Order matches architect seq EXACTLY (FR-3→FR-1→FR-2→FR-7→FR-5→FR-4→FR-6). Sprint tracked in in_progress[] + flat rows. Live terminal even created TASK_331/TASK_332 handoffs mid-reconcile.
- **My pm worker (a85aa817, c7eda13c — DUPLICATE, retired):** TASK-301..307 nested in active_sprints[FIX-BCTC].tasks + head pointed at TASK-301 (==already-done FR-3). 7 dup handoffs. Pure duplicate — every FR already had a numeric equiv, so kept NONE of pm's.

**Actions (single orch-apply.sh write + git rm + commit 950906c4):**
1. head: repointed OFF TASK-301 (done FR-3) ONTO 327 (next undone FR-1, already READY), next_agent=dev-pdf-extractor. Guarded on startswith("TASK-30"). Stops router re-dispatching committed work / breaking on deleted handoff.
2. Removed pm-only active_sprints[FIX-BCTC] container → dedups sprint double-listing (sprint now solely in in_progress[]).
3. Deleted all 7 pm TASK-301..307-*.md (mine via pm cascade). Numeric TASK_326..332 = canonical set.

Did NOT: dispatch dev-pdf-extractor (head set so dev-team router dispatches 327 next tick), flip 326 DONE→verified (QA gate), touch any live numeric row. Live rows verified intact post-commit. Push left to fleet-push timer.

LESSON: when my own pm cascade duplicates a sprint a live terminal already drives with real commits — retire MY duplicate, keep theirs; repoint head off any already-done task; dedup the sprint container; CAS-guard the write (live terminal writes concurrently — 327 flipped BACKLOG→READY mid-triage).

## Prev cycle — USER BUG triage: BCTC table/column FPT-only → SPRINT-M cascade (FR-1..7, blockers B1-B5 resolved → architect → pm decomposed)

User: BCTC table+column extraction correct ONLY for FPT. Root: text_table_extractor.py split regexes overfit to FPT OCR. Minted FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT (P1, apps/pdf-extractor/). BA spec live-probed FR-1..7; B1 targets VCB/HPG/VNM/FPT locked; B2 FPT non-reg=Stage6 GREEN; B3 POST /api/bctc-eval/recompute/:id; B4 FACTORY-DOMAIN sequenced-after; B5 FR-4 in-scope. Architect design done (generalization mechanism per NFR-4). Then pm decomposed → the dual-scheme collision reconciled this cycle.
